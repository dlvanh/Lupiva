"""Offline layout detection from whole source images, without region annotations.

Preserves all detections, original coordinates, reading order and runtime data.
No medical upload, no reference answer input and no silent CPU fallback.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input-dir', type=Path)
    source.add_argument('--manifest', type=Path, help='Document IDs and image paths only; region annotations rejected')
    parser.add_argument('--model-dir', type=Path, default=ROOT / 'models/PP-DocLayoutV3')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--threshold', type=float, default=0.5)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Use a fresh output directory')
    if not 0 < args.threshold < 1:
        raise ValueError('Threshold must be between zero and one')
    if args.manifest:
        documents = json.loads(args.manifest.read_text(encoding='utf-8-sig'))['documents']
        if any(set(d) - {'document_id', 'input_path'} for d in documents):
            raise ValueError('Input accepts document IDs and source paths only')
    else:
        paths = sorted(p for p in args.input_dir.iterdir() if p.suffix.lower() in {'.png', '.jpg', '.jpeg', '.tif', '.tiff'})
        documents = [{'document_id': f'IN{i:02d}', 'input_path': p.resolve().relative_to(ROOT).as_posix()}
                     for i, p in enumerate(paths, 1)]
    if not documents or len({d['document_id'] for d in documents}) != len(documents):
        raise ValueError('Nonempty, distinct document IDs are required')
    os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_TELEMETRY='1')
    import torch
    from PIL import Image, ImageDraw, ImageOps
    from transformers import AutoImageProcessor, AutoModelForObjectDetection
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA unavailable')
    torch.manual_seed(0)
    torch.cuda.set_device(0)
    args.output.mkdir(parents=True)
    (args.output / 'overlays').mkdir()
    run = dict(started_at_utc=datetime.now(timezone.utc).isoformat(), status='loading',
               method='PP-DocLayoutV3_whole_image', threshold=args.threshold,
               coordinate_space='exif_transposed_source_pixels', device='cuda:0', precision='float32',
               gpu=torch.cuda.get_device_name(0), reference_annotations_used=False,
               versions={p: importlib.metadata.version(p) for p in ['torch', 'transformers', 'opencv-python-headless', 'pillow']},
               model=json.loads((args.model_dir / 'download-manifest.json').read_text(encoding='utf-8')))
    save(args.output / 'run.json', run)
    start = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(args.model_dir, local_files_only=True, trust_remote_code=False)
    model = AutoModelForObjectDetection.from_pretrained(
        args.model_dir, local_files_only=True, trust_remote_code=False).to('cuda:0').eval()
    torch.cuda.synchronize()
    run['load_seconds'] = time.perf_counter() - start
    results, measurements = [], []
    for doc in documents:
        path = ROOT / doc['input_path']
        with Image.open(path) as original:
            image = ImageOps.exif_transpose(original).convert('RGB')
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        start = time.perf_counter()
        inputs = processor(images=image, return_tensors='pt').to('cuda:0')
        with torch.inference_mode():
            outputs = model(**inputs)
        torch.cuda.synchronize()
        inference_seconds = time.perf_counter() - start
        result = processor.post_process_object_detection(outputs, threshold=args.threshold,
                                                         target_sizes=[(image.height, image.width)])[0]
        detections = []
        for i, (score, label, box, polygon, order) in enumerate(zip(
                result['scores'], result['labels'], result['boxes'], result['polygon_points'], result['order_seq'])):
            detections.append(dict(detection_id=f"{doc['document_id']}-L{i + 1:03d}",
                                   label=model.config.id2label[int(label)], label_id=int(label),
                                   score=float(score), bbox_xyxy=box.tolist(),
                                   polygon_xy=polygon.tolist() if hasattr(polygon, 'tolist') else polygon,
                                   reading_order=int(order)))
        measurements.append(dict(document_id=doc['document_id'], preprocess_inference_seconds=inference_seconds,
                                 total_seconds=time.perf_counter() - start,
                                 detections=len(detections),
                                 peak_allocated_mib=torch.cuda.max_memory_allocated() / 2**20,
                                 peak_reserved_mib=torch.cuda.max_memory_reserved() / 2**20))
        record = {**doc, 'input_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                  'image_size': list(image.size), 'detections': detections}
        results.append(record)
        overlay = image.copy()
        draw = ImageDraw.Draw(overlay)
        for detection in detections:
            box = detection['bbox_xyxy']
            color = '#dc2626' if detection['label'] == 'table' else '#2563eb'
            draw.rectangle(box, outline=color, width=4)
            draw.text((box[0], max(0, box[1] - 14)),
                      f"{detection['detection_id']} {detection['label']} {detection['score']:.2f}", fill=color)
        overlay.thumbnail((1200, 1600))
        overlay.save(args.output / 'overlays' / (doc['document_id'] + '.png'))
        save(args.output / 'layout.json', {'documents': results})
        save(args.output / 'measurements.json', measurements)
        print(json.dumps(dict(document_id=doc['document_id'], labels=dict(Counter(d['label'] for d in detections)),
                              **{k: v for k, v in measurements[-1].items() if k != 'document_id'})), flush=True)
        del inputs, outputs, result
    run.update(status='completed', completed_at_utc=datetime.now(timezone.utc).isoformat(), documents=len(results),
               detections=sum(len(d['detections']) for d in results))
    save(args.output / 'run.json', run)


if __name__ == '__main__':
    main()
