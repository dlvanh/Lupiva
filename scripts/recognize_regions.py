"""Run local SenOCR-Vi on declared image regions and convert explicit tables.

No downloads, no upload, no ground-truth input. Regions may come from development
annotations or the saved whole-image layout pipeline; the actual method/hash is
recorded for each run. All measurements are new local runtime measurements.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool import convert_documents
from ocr_pool.regions import prepare_region
from ocr_pool.confidence import greedy_collector, VERSION as CONFIDENCE_VERSION


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--model-dir', type=Path, default=ROOT / 'models/SenOCR-Vi')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--precision', choices=['float16', 'float32', 'bfloat16'], default='float16')
    parser.add_argument('--max-pixels', type=int, default=1003520)
    parser.add_argument('--max-new-tokens', type=int, default=2048)
    parser.add_argument('--region-id', action='append', help='Select a declared region; repeat to run several in one model load')
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Choose a fresh output directory; prior results must remain reviewable')
    spec = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    # Never treat partially downloaded safetensors as a completed checkpoint.
    index_path = args.model_dir / 'model.safetensors.index.json'
    if index_path.exists():
        shards = set(json.loads(index_path.read_text(encoding='utf-8'))['weight_map'].values())
        if any(not (args.model_dir / shard).is_file() for shard in shards):
            raise RuntimeError('Checkpoint incomplete: weight shard not downloaded')
    elif not (args.model_dir / 'model.safetensors').is_file():
        raise RuntimeError('Checkpoint missing')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import torch
    from PIL import Image, ImageOps
    from transformers import AutoModelForImageTextToText, AutoProcessor

    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable; no silent CPU benchmark fallback')
    if args.precision == 'bfloat16' and not torch.cuda.is_bf16_supported():
        raise RuntimeError('BF16 unsupported on this GPU')
    torch.manual_seed(0)
    torch.cuda.set_device(0)
    args.output.mkdir(parents=True)
    props = torch.cuda.get_device_properties(0)
    run = {
        'started_at_utc': datetime.now(timezone.utc).isoformat(),
        'status': 'loading', 'gpu': props.name, 'gpu_total_mib': props.total_memory / 2**20,
        'precision': args.precision, 'manifest_path': str(args.manifest),
        'manifest_sha256': sha(args.manifest), 'max_pixels': args.max_pixels,
        'max_new_tokens': args.max_new_tokens, 'use_cache': True, 'batch_size': 1,
        'generation_confidence_version': CONFIDENCE_VERSION,
        'model_config_sha256': sha(args.model_dir / 'config.json'),
        'source_kind': 'actual_local_ocr', 'layout_method': spec.get('layout_method', 'declared_development_regions'),
        'layout_manifest_sha256': spec.get('layout_sha256'),
        'versions': {name: importlib.metadata.version(name) for name in ('torch', 'transformers', 'pillow', 'accelerate')},
    }
    download_manifest = args.model_dir / 'download-manifest.json'
    run['model_download_manifest'] = json.loads(download_manifest.read_text(encoding='utf-8')) if download_manifest.exists() else None
    save(args.output / 'run.json', run)
    start = time.perf_counter()
    processor = AutoProcessor.from_pretrained(args.model_dir, local_files_only=True, trust_remote_code=False)
    processor.image_processor.max_pixels = args.max_pixels
    model = AutoModelForImageTextToText.from_pretrained(
        args.model_dir, local_files_only=True, trust_remote_code=False,
        dtype=getattr(torch, args.precision), device_map={'': 0}, attn_implementation='sdpa').eval()
    model.config.use_cache = True
    if hasattr(model.config, 'text_config'):
        model.config.text_config.use_cache = True
    model.generation_config.use_cache = True
    torch.cuda.synchronize()
    run['load_seconds'] = time.perf_counter() - start
    run['allocated_after_load_mib'] = torch.cuda.memory_allocated() / 2**20
    run['status'] = 'running'
    save(args.output / 'run.json', run)
    documents, measurements = [], []
    for document in spec['documents']:
        source = ROOT / document['input_path']
        if document.get('expected_input_sha256') and sha(source) != document['expected_input_sha256']:
            raise ValueError('Layout source hash differs from current image')
        selected = [r for r in document['regions'] if not args.region_id or r['region_id'] in args.region_id]
        if not selected:
            continue
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert('RGB')
        source_record = {k: v for k, v in document.items() if k != 'regions'}
        source_record.update(source_kind='actual_local_ocr', input_sha256=sha(source), tables=[], text_regions=[])
        for region in selected:
            region_id = region['region_id']
            task = region.get('task', 'table')
            if task not in ('table', 'text'):
                raise ValueError('Unsupported OCR task')
            prompt = 'OCR:' if task == 'text' else 'Table Recognition:'
            region_max_pixels = region.get('max_pixels', args.max_pixels)
            processor.image_processor.max_pixels = region_max_pixels
            crop, provenance = prepare_region(image, region)
            if region.get('layout_provenance'):
                provenance['layout'] = region['layout_provenance']
            crop_path = args.output / 'crops' / f'{region_id}.png'
            crop_path.parent.mkdir(exist_ok=True)
            crop.save(crop_path)
            messages = [{'role': 'user', 'content': [
                {'type': 'image', 'image': crop}, {'type': 'text', 'text': prompt}]}]
            start = time.perf_counter()
            torch.cuda.reset_peak_memory_stats()
            item = {'region_id': region_id, 'document_id': document['document_id'],
                    'status': 'ok', 'crop_size': list(crop.size), 'prompt': prompt,
                    'max_pixels': region_max_pixels}
            batch = generated = tokens = collector = None
            try:
                batch = processor.apply_chat_template(messages, add_generation_prompt=True,
                    tokenize=True, return_dict=True, return_tensors='pt').to('cuda:0')
                torch.cuda.synchronize()
                item['preprocess_seconds'] = time.perf_counter() - start
                generation_start = time.perf_counter()
                collector = greedy_collector()
                with torch.inference_mode():
                    generated = model.generate(**batch, max_new_tokens=args.max_new_tokens,
                                               do_sample=False, use_cache=True, logits_processor=[collector])
                torch.cuda.synchronize()
                tokens = generated[0, batch['input_ids'].shape[1]:]
                raw = processor.decode(tokens, skip_special_tokens=True)
                item['ocr_confidence'] = collector.finish(tokens)
                item.update(generation_seconds=time.perf_counter() - generation_start,
                            output_tokens=len(tokens), input_tokens=batch['input_ids'].shape[1],
                            truncated=len(tokens) >= args.max_new_tokens)
            except torch.cuda.OutOfMemoryError:
                raw = ''
                item.update(status='oom', truncated=False)
            except Exception as error:
                raw = ''
                item.update(status='error', error_type=type(error).__name__, error=str(error), truncated=False)
            finally:
                del batch, generated, tokens, collector
                if item['status'] != 'ok':
                    torch.cuda.empty_cache()
            item.update(latency_seconds=time.perf_counter() - start,
                        peak_allocated_mib=torch.cuda.max_memory_allocated() / 2**20,
                        peak_reserved_mib=torch.cuda.max_memory_reserved() / 2**20)
            raw_path = args.output / 'raw' / f'{region_id}.txt'
            raw_path.parent.mkdir(exist_ok=True)
            raw_path.write_text(raw, encoding='utf-8')
            record = {
                'table_id': region_id, 'raw': raw, 'format': 'auto' if task == 'table' else 'text',
                'region': provenance,
                'context': region.get('context', {}), 'truncated': item['truncated'],
                'header_rows': region.get('header_rows'),
                'generation_status': item['status'],
                'ocr_confidence': item.get('ocr_confidence'),
            }
            if task == 'text':
                record['purpose'] = region.get('purpose', 'metadata')
                source_record['text_regions'].append(record)
            else:
                source_record['tables'].append(record)
            measurements.append(item)
            save(args.output / 'measurements.json', measurements)
            print(json.dumps({k: v for k, v in item.items() if k not in ('error',)}, ensure_ascii=False), flush=True)
        documents.append(source_record)
        save(args.output / 'ocr-tables.json', {'documents': documents})
    if not measurements:
        raise ValueError('No matching regions selected')
    catalog = json.loads((ROOT / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
    pool = convert_documents(documents, catalog)
    save(args.output / 'candidate-pool.json', pool)
    run.update(status='completed_with_errors' if any(m['status'] != 'ok' for m in measurements) else 'completed',
               completed_at_utc=datetime.now(timezone.utc).isoformat(), summary=pool['summary'])
    save(args.output / 'run.json', run)
    print('Saved raw OCR, crops, runtime measurements and candidate pool. No OCR accuracy score calculated.')


if __name__ == '__main__':
    main()
