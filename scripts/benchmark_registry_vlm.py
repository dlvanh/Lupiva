"""Isolated offline VLM experiment. Never opens the clinical registry.

prepare freezes six new pages, references and prompts before inference.
run consumes only inputs.json (paths/hashes/prompts, no expected answers).
Existing local records require explicit --allow-local-records; all inference is offline.
score consumes saved predictions and references after inference.
"""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import sys
import time
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
LABEL = 'SYNTHETIC TEST - NO PATIENT DATA'
FIELDS = {
    'patient_code': 'Patient code as printed; not a study ID',
    'sample_date': 'Sample collection date, not birth/received/visit date',
    'received_date': 'Sample received date',
    'visit_date': 'Visit date',
    'diagnosis_text': 'Exact diagnosis wording; preserve suspected/follow-up status',
    'history_text': 'Exact history sentence including negations',
    'symptom_text': 'Exact symptom sentence including negations',
    'medication_text': 'Exact medicine, dose, route and schedule line',
    'C3': 'C3 result WITH unit; omit if blank',
    'C4': 'C4 result WITH unit; omit if blank',
    'creatinine': 'Creatinine result WITH unit',
    'WBC': 'White blood cell result WITH unit',
    'Hb': 'Hemoglobin result WITH unit',
    'PLT': 'Platelet result WITH unit',
}
OCR_PROMPT = ('Transcribe all visible text in reading order. Preserve Vietnamese accents, '
    'numbers, units, dates and negations. Do not explain, infer or fill blanks. Output text only.')
EXTRACT_PROMPT = ('Extract only explicitly printed facts from this synthetic medical document. '
    'Never diagnose or infer a missing value. Omit blank or absent fields. '
    'Preserve source dates as DD/MM/YYYY and copy text verbatim, including negations. '
    'Evidence must include the entire labeled source line, or the test name and result for table rows. '
    'Return ONLY valid JSON: {"facts":[{"field":"field_key","value":"literal value",'
    '"evidence":"exact quote from this image"}]}. Use only these field keys: '
    + json.dumps(FIELDS, ensure_ascii=False))


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def norm(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFC', str(value))).strip().casefold()


def distance(a, b):
    previous = list(range(len(b)+1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(current[-1]+1, previous[j]+1, previous[j-1]+(x != y)))
        previous = current
    return previous[-1]


def parse_facts(raw):
    # Accept a single surrounding code fence, never repair JSON or fabricate keys.
    text = raw.strip()
    if text.startswith('```') and text.endswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text)[:-3].strip()
    data = json.loads(text)
    if not isinstance(data, dict) or set(data) != {'facts'} or not isinstance(data['facts'], list):
        raise ValueError('Expected an object with only a facts array')
    for fact in data['facts']:
        if (not isinstance(fact, dict) or set(fact) != {'field', 'value', 'evidence'}
                or any(not isinstance(v, str) or not v.strip() for v in fact.values())):
            raise ValueError('Each fact needs nonempty field/value/evidence strings')
    return data['facts']


def extraction_score(raw, reference):
    expected = reference['facts']
    try:
        facts = parse_facts(raw)
    except (ValueError, TypeError) as error:
        return dict(valid_json=False, error=str(error), correct=0, supported_correct=0,
            expected=len(expected), predictions=0, unsupported_quotes=0,
            missing=list(expected), wrong=[], extra=[], duplicates=[], details=[])
    counts = Counter(f['field'] for f in facts)
    correct, supported, wrong, extra, details = 0, 0, [], [], []
    seen = set()
    for fact in facts:
        key = fact['field']
        gold = expected.get(key)
        unique = counts[key] == 1
        value_ok = bool(gold and norm(fact['value']) in [norm(v) for v in gold['values']])
        source_quote = norm(fact['evidence']) in norm(reference['transcript'])
        # Quote must contain the field-specific source span, not just a generic word.
        target_quote = bool(gold and any(norm(span) in norm(fact['evidence']) for span in gold['evidence']))
        if unique and value_ok:
            correct += 1
            supported += int(source_quote and target_quote)
        elif gold:
            wrong.append(key)
        else:
            extra.append(key)
        seen.add(key)
        details.append(dict(**fact, value_correct=value_ok, unique=unique,
            quote_in_source=source_quote, quote_supports_target=target_quote))
    return dict(valid_json=True, correct=correct, supported_correct=supported,
        expected=len(expected), predictions=len(facts),
        unsupported_quotes=sum(not d['quote_in_source'] for d in details),
        missing=sorted(set(expected)-seen), wrong=wrong, extra=extra,
        duplicates=sorted(k for k, v in counts.items() if v > 1), details=details)


def prepare(folder):
    from PIL import Image, ImageDraw, ImageFont, ImageFilter
    folder = Path(folder).resolve()
    if folder.exists():
        raise FileExistsError('Choose a fresh dataset directory')
    font_path = Path('C:/Windows/Fonts/arial.ttf')
    font = ImageFont.truetype(str(font_path), 26)
    heading = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 30)
    small = ImageFont.truetype(str(font_path), 17)
    # All values and references are defined here before any model generation.
    pages = [
        ('VI-VISIT', 'vi', 'PHIẾU KHÁM GIẢ LẬP', [
            'Mã bệnh nhân: DEMO-VI-731', 'Ngày khám: 17/09/2026',
            'Chẩn đoán: Theo dõi lupus ban đỏ hệ thống.',
            'Tiền sử: Không ghi nhận dị ứng thuốc.',
            'Triệu chứng: Đau khớp bàn tay; không sốt.',
            'Thuốc: Hydroxychloroquine 200 mg, uống 1 viên/ngày.',
            'Không có kết quả xét nghiệm trong phiếu này.'
        ], {
            'patient_code': ('DEMO-VI-731', 'Mã bệnh nhân: DEMO-VI-731'),
            'visit_date': ('17/09/2026', 'Ngày khám: 17/09/2026'),
            'diagnosis_text': ('Theo dõi lupus ban đỏ hệ thống.', 'Chẩn đoán: Theo dõi lupus ban đỏ hệ thống.'),
            'history_text': ('Không ghi nhận dị ứng thuốc.', 'Tiền sử: Không ghi nhận dị ứng thuốc.'),
            'symptom_text': ('Đau khớp bàn tay; không sốt.', 'Triệu chứng: Đau khớp bàn tay; không sốt.'),
            'medication_text': ('Hydroxychloroquine 200 mg, uống 1 viên/ngày.', 'Thuốc: Hydroxychloroquine 200 mg, uống 1 viên/ngày.'),
        }),
        ('EN-LAB', 'en', 'SYNTHETIC LABORATORY REPORT', [
            'Patient code: DEMO-EN-842', 'Date of birth: 03/02/1994',
            'Sample collected: 21/09/2026', 'Sample received: 22/09/2026',
            'Test                 Result          Reference range',
            'C3                   0.83 g/L        0.90 - 1.80 g/L',
            'C4                   0.12 g/L        0.10 - 0.40 g/L',
            'Creatinine           76 umol/L       44 - 97 umol/L',
            'No clinical diagnosis is provided.'
        ], {
            'patient_code': ('DEMO-EN-842', 'Patient code: DEMO-EN-842'),
            'sample_date': ('21/09/2026', 'Sample collected: 21/09/2026'),
            'received_date': ('22/09/2026', 'Sample received: 22/09/2026'),
            'C3': ('0.83 g/L', 'C3                   0.83 g/L'),
            'C4': ('0.12 g/L', 'C4                   0.12 g/L'),
            'creatinine': ('76 umol/L', 'Creatinine           76 umol/L'),
        }),
        ('MIX-CBC', 'vi-en', 'KẾT QUẢ HUYẾT HỌC / CBC', [
            'Mã bệnh nhân / Patient code: DEMO-MIX-953',
            'Ngày lấy mẫu / Sample collected: 26/09/2026',
            'Chỉ số / Test       Kết quả / Result',
            'WBC                 5.7 x10^9/L',
            'Hb                  11.8 g/dL',
            'PLT                 192 x10^9/L',
            'C3                  [blank]',
            'Ghi chú: Không suy chẩn đoán từ chỉ số xét nghiệm.'
        ], {
            'patient_code': ('DEMO-MIX-953', 'Mã bệnh nhân / Patient code: DEMO-MIX-953'),
            'sample_date': ('26/09/2026', 'Ngày lấy mẫu / Sample collected: 26/09/2026'),
            'WBC': ('5.7 x10^9/L', 'WBC                 5.7 x10^9/L'),
            'Hb': ('11.8 g/dL', 'Hb                  11.8 g/dL'),
            'PLT': ('192 x10^9/L', 'PLT                 192 x10^9/L'),
        }),
        ('EN-NOTE', 'en', 'SYNTHETIC CLINICAL NOTE', [
            'Patient code: DEMO-NOTE-164', 'Visit date: 29/09/2026',
            'Diagnosis: Possible connective tissue disease; not confirmed.',
            'History: No previous kidney disease.',
            'Symptoms: Fatigue, no oral ulcers.',
            'Medication: Prednisolone 5 mg orally every morning.',
            'Sample date: not recorded.'
        ], {
            'patient_code': ('DEMO-NOTE-164', 'Patient code: DEMO-NOTE-164'),
            'visit_date': ('29/09/2026', 'Visit date: 29/09/2026'),
            'diagnosis_text': ('Possible connective tissue disease; not confirmed.', 'Diagnosis: Possible connective tissue disease; not confirmed.'),
            'history_text': ('No previous kidney disease.', 'History: No previous kidney disease.'),
            'symptom_text': ('Fatigue, no oral ulcers.', 'Symptoms: Fatigue, no oral ulcers.'),
            'medication_text': ('Prednisolone 5 mg orally every morning.', 'Medication: Prednisolone 5 mg orally every morning.'),
        }),
        ('VI-DATES', 'vi', 'PHIẾU SINH HÓA GIẢ LẬP', [
            'Mã bệnh nhân: DEMO-DATE-275', 'Ngày sinh: 11/04/1987',
            'Ngày lấy mẫu: 02/10/2026', 'Ngày nhận mẫu: 03/10/2026',
            'Creatinine: 89 umol/L', 'C3: [để trống]', 'C4: [để trống]',
            'Không có thông tin thuốc hoặc triệu chứng.'
        ], {
            'patient_code': ('DEMO-DATE-275', 'Mã bệnh nhân: DEMO-DATE-275'),
            'sample_date': ('02/10/2026', 'Ngày lấy mẫu: 02/10/2026'),
            'received_date': ('03/10/2026', 'Ngày nhận mẫu: 03/10/2026'),
            'creatinine': ('89 umol/L', 'Creatinine: 89 umol/L'),
        }),
        ('VI-DEGRADED', 'vi', 'PHIẾU KHÁM GIẢ LẬP', [
            'Mã bệnh nhân: DEMO-BLUR-386', 'Ngày khám: 06/10/2026',
            'Chẩn đoán: Chưa xác định bệnh tự miễn.',
            'Tiền sử: Không hút thuốc lá.',
            'Triệu chứng: Ban da sau phơi nắng.',
            'Thuốc: Chưa kê đơn.',
            'Chỉ số C3, C4: chưa xét nghiệm.'
        ], {
            'patient_code': ('DEMO-BLUR-386', 'Mã bệnh nhân: DEMO-BLUR-386'),
            'visit_date': ('06/10/2026', 'Ngày khám: 06/10/2026'),
            'diagnosis_text': ('Chưa xác định bệnh tự miễn.', 'Chẩn đoán: Chưa xác định bệnh tự miễn.'),
            'history_text': ('Không hút thuốc lá.', 'Tiền sử: Không hút thuốc lá.'),
            'symptom_text': ('Ban da sau phơi nắng.', 'Triệu chứng: Ban da sau phơi nắng.'),
            'medication_text': ('Chưa kê đơn.', 'Thuốc: Chưa kê đơn.'),
        }),
    ]
    folder.mkdir(parents=True)
    inputs, refs = [], []
    for ident, language, title, lines, facts in pages:
        image = Image.new('RGB', (1100, 220+len(lines)*58), 'white')
        draw = ImageDraw.Draw(image)
        draw.text((35, 22), LABEL, fill='#a00000', font=small)
        draw.text((35, 66), title, fill='black', font=heading)
        for i, line in enumerate(lines):
            draw.text((35, 140+i*58), line, fill='black', font=font)
        if ident == 'VI-DEGRADED':
            image = image.rotate(1.2, resample=Image.Resampling.BICUBIC, expand=True, fillcolor='white')
            image = image.filter(ImageFilter.GaussianBlur(0.45))
        path = folder / (ident + ('.jpg' if ident == 'VI-DEGRADED' else '.png'))
        image.save(path, **({'quality': 82} if path.suffix == '.jpg' else {}))
        inputs.append(dict(id=ident, path=path.name, sha256=sha(path), language=language,
            synthetic=True, source_kind='new_deterministic_synthetic_document'))
        refs.append(dict(id=ident, transcript='\n'.join([LABEL, title]+lines),
            facts={k:dict(values=[v], evidence=[e]) for k, (v, e) in facts.items()}))
    save(folder/'inputs.json', dict(version=1, created_at_utc=now(), synthetic_only=True,
        prompts=dict(transcribe=OCR_PROMPT, extract=EXTRACT_PROMPT), documents=inputs))
    save(folder/'references.json', dict(reference_kind='assistant_authored_synthetic_expected_not_human_verified',
        documents=refs))
    save(folder/'frozen.json', dict(created_at_utc=now(), inputs_sha256=sha(folder/'inputs.json'),
        references_sha256=sha(folder/'references.json'), generator_sha256=sha(__file__),
        images={d['path']:d['sha256'] for d in inputs}, expected_facts=sum(len(r['facts']) for r in refs)))
    print(json.dumps(dict(status='frozen', documents=len(inputs), expected_facts=sum(len(r['facts']) for r in refs))), flush=True)


def run(args):
    # Input schema intentionally has no references. No registry or patient imports.
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'HF_HUB_DISABLE_IMPLICIT_TOKEN'):
        os.environ[key] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import torch
    from PIL import Image, ImageOps
    from transformers import AutoProcessor, AutoModelForImageTextToText, BitsAndBytesConfig
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA required; no silent CPU fallback')
    target, source = args.output.resolve(), args.inputs.resolve()
    if target.exists():
        raise FileExistsError('Choose a fresh run directory')
    spec = read(source)
    if not args.allow_local_records and (spec.get('synthetic_only') is not True or any(d.get('synthetic') is not True for d in spec['documents'])):
        raise ValueError('This experiment accepts only the frozen synthetic dataset')
    for document in spec['documents']:
        path = (source.parent/document['path']).resolve()
        permitted = ROOT if args.allow_local_records else source.parent
        if not path.is_relative_to(permitted) or sha(path) != document['sha256']:
            raise ValueError('Source hash or scope differs')
    target.mkdir(parents=True)
    torch.manual_seed(0)
    torch.cuda.set_device(0)
    metadata = dict(started_at_utc=now(), status='loading', model=str(args.model.resolve()),
        model_config_sha256=sha(args.model/'config.json'), runner_sha256=sha(__file__),
        inputs_sha256=sha(source), source_kind=spec.get('source_kind','synthetic'),
        precision=args.precision, max_new_tokens=args.max_new_tokens,
        max_pixels=args.max_pixels, max_patches=args.max_patches, tasks=args.tasks,
        batch_size=1, do_sample=False, enable_thinking=False, attn_implementation='sdpa',
        gpu=torch.cuda.get_device_properties(0).name,
        gpu_total_mib=torch.cuda.get_device_properties(0).total_memory/2**20,
        versions={n:importlib.metadata.version(n) for n in ['torch','transformers','accelerate','Pillow']})
    if (args.model/'download-manifest.json').exists():
        metadata['download_manifest_sha256'] = sha(args.model/'download-manifest.json')
    save(target/'run.json', metadata)
    options = dict(local_files_only=True, trust_remote_code=False, dtype=torch.float16,
        attn_implementation='sdpa', device_map={'':0})
    if args.precision == 'nf4':
        metadata['versions']['bitsandbytes'] = importlib.metadata.version('bitsandbytes')
        options['quantization_config'] = BitsAndBytesConfig(load_in_4bit=True,
            bnb_4bit_quant_type='nf4', bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.float16)
    start = time.perf_counter()
    try:
        processor = AutoProcessor.from_pretrained(args.model, local_files_only=True, trust_remote_code=False)
        model = AutoModelForImageTextToText.from_pretrained(args.model, **options).eval()
        torch.cuda.synchronize()
        metadata.update(status='running', load_seconds=time.perf_counter()-start,
            allocated_after_load_mib=torch.cuda.memory_allocated()/2**20,
            device_map=getattr(model, 'hf_device_map', None))
        save(target/'run.json', metadata)
        predictions = []
        for doc in spec['documents']:
            for task in args.tasks:
                key = doc['id']+'-'+task
                if args.only_id and doc['id'] not in args.only_id:
                    continue
                with Image.open(source.parent/doc['path']) as opened:
                    image = ImageOps.exif_transpose(opened).convert('RGB')
                prompt = spec['prompts'][task]
                if args.family == 'senocr':
                    if task != 'transcribe':
                        raise ValueError('SenOCR baseline is transcription only')
                    prompt = 'OCR:'
                messages = [dict(role='user', content=[dict(type='image', image=image), dict(type='text', text=prompt)])]
                kwargs = dict(add_generation_prompt=True, tokenize=True,
                    return_dict=True, return_tensors='pt')
                if args.family == 'qwen':
                    kwargs['enable_thinking'] = False
                if args.family == 'internvl':
                    kwargs['processor_kwargs'] = dict(images_kwargs=dict(max_patches=args.max_patches))
                else:
                    kwargs['processor_kwargs'] = dict(images_kwargs=dict(max_pixels=args.max_pixels,min_pixels=56*56))
                item = dict(id=doc['id'], task=task, source_sha256=doc['sha256'], prompt=prompt,
                    source_image_size=list(image.size),
                    status='running', started_at_utc=now())
                print(json.dumps(dict(status='generating', id=doc['id'], task=task)), flush=True)
                start = time.perf_counter()
                torch.cuda.reset_peak_memory_stats()
                batch = generated = tokens = None
                raw = ''
                try:
                    batch = processor.apply_chat_template(messages, **kwargs).to('cuda:0')
                    if 'pixel_values' in batch:
                        batch['pixel_values'] = batch['pixel_values'].to(torch.float16)
                        item['visual_tensor_shape'] = list(batch['pixel_values'].shape)
                    torch.cuda.synchronize()
                    item['preprocess_seconds'] = time.perf_counter()-start
                    generation_start = time.perf_counter()
                    with torch.inference_mode():
                        generated = model.generate(**batch, max_new_tokens=args.max_new_tokens,
                            do_sample=False, use_cache=True, max_time=args.max_seconds)
                    torch.cuda.synchronize()
                    tokens = generated[0, batch['input_ids'].shape[1]:]
                    raw = processor.decode(tokens, skip_special_tokens=True)
                    item.update(status='ok', output_tokens=len(tokens), input_tokens=batch['input_ids'].shape[1],
                        generation_seconds=time.perf_counter()-generation_start,
                        truncated=len(tokens)>=args.max_new_tokens,
                        time_limit_reached=time.perf_counter()-generation_start>=args.max_seconds)
                except Exception as error:
                    item.update(status='oom' if isinstance(error, torch.cuda.OutOfMemoryError) else 'error',
                        error_type=type(error).__name__, error=str(error))
                finally:
                    del batch, generated, tokens
                    if item['status'] != 'ok':
                        torch.cuda.empty_cache()
                item.update(latency_seconds=time.perf_counter()-start,
                    peak_allocated_mib=torch.cuda.max_memory_allocated()/2**20,
                    peak_reserved_mib=torch.cuda.max_memory_reserved()/2**20,
                    raw_path='raw/'+key+'.txt', raw_sha256=hashlib.sha256(raw.encode()).hexdigest())
                (target/'raw').mkdir(exist_ok=True)
                (target/item['raw_path']).write_text(raw, encoding='utf-8')
                predictions.append(item)
                save(target/'predictions.json', predictions)
                print(json.dumps({k:v for k,v in item.items() if k not in ('prompt', 'error')}, ensure_ascii=False), flush=True)
        metadata.update(status='completed' if all(p['status']=='ok' for p in predictions) else 'completed_with_errors',
            completed_at_utc=now(), predictions=len(predictions))
    except Exception as error:
        metadata.update(status='failed', error_type=type(error).__name__, error=str(error), completed_at_utc=now())
        save(target/'run.json', metadata)
        raise
    save(target/'run.json', metadata)


def score(args):
    dataset = args.dataset.resolve()
    frozen = read(dataset/'frozen.json')
    if sha(dataset/'references.json') != frozen['references_sha256'] or sha(dataset/'inputs.json') != frozen['inputs_sha256']:
        raise ValueError('Frozen reference or input changed')
    refs = {d['id']:d for d in read(dataset/'references.json')['documents']}
    reports = []
    for folder in args.runs:
        meta = read(folder/'run.json')
        if meta['inputs_sha256'] != frozen['inputs_sha256']:
            raise ValueError('Run used a different dataset')
        rows = []
        for prediction in read(folder/'predictions.json'):
            raw = (folder/prediction['raw_path']).read_text(encoding='utf-8')
            if hashlib.sha256(raw.encode()).hexdigest() != prediction['raw_sha256']:
                raise ValueError('Saved prediction changed')
            ref = refs[prediction['id']]
            item = dict(id=prediction['id'], task=prediction['task'], status=prediction['status'],
                truncated=prediction.get('truncated',False),
                time_limit_reached=prediction.get('time_limit_reached',False),
                latency_seconds=prediction['latency_seconds'],
                peak_allocated_mib=prediction['peak_allocated_mib'],
                peak_reserved_mib=prediction['peak_reserved_mib'])
            if prediction['task'] == 'extract':
                item['score'] = extraction_score(raw, ref)
            else:
                a, b = norm(ref['transcript']), norm(raw)
                item['score'] = dict(edit_distance=distance(a,b), reference_characters=len(a),
                    literal_fact_recall=sum(any(norm(v) in b for v in f['values']) for f in ref['facts'].values()),
                    expected_facts=len(ref['facts']))
            rows.append(item)
        ocr = [r['score'] for r in rows if r['task']=='transcribe']
        extraction = [r['score'] for r in rows if r['task']=='extract']
        report = dict(run=str(folder), metadata=meta, documents=rows,
            scope='synthetic_pilot_not_patient_accuracy_not_end_to_end_pipeline',
            expected_documents=len(refs), tasks={})
        if ocr:
            report['tasks']['transcribe'] = dict(documents=len(ocr),
                normalized_cer=sum(r['edit_distance'] for r in ocr)/sum(r['reference_characters'] for r in ocr),
                literal_facts_present=sum(r['literal_fact_recall'] for r in ocr),
                expected_facts=sum(r['expected_facts'] for r in ocr))
        if extraction:
            report['tasks']['extract'] = dict(documents=len(extraction), valid_json=sum(r['valid_json'] for r in extraction),
                **{k:sum(r[k] for r in extraction) for k in ['correct','supported_correct','expected','predictions','unsupported_quotes']},
                missing=sum(len(r['missing']) for r in extraction),wrong=sum(len(r['wrong']) for r in extraction),
                extra=sum(len(r['extra']) for r in extraction),duplicates=sum(len(r['duplicates']) for r in extraction))
        save(folder/'evaluation.json', report)
        reports.append(report)
        print(json.dumps(dict(run=str(folder), tasks=report['tasks']), ensure_ascii=False), flush=True)
    save(args.output, dict(created_at_utc=now(), reference_kind='assistant_authored_synthetic_not_human_verified',
        frozen=frozen, reports=reports))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prep = sub.add_parser('prepare')
    prep.add_argument('--output', type=Path, required=True)
    infer = sub.add_parser('run')
    infer.add_argument('--inputs', type=Path, required=True)
    infer.add_argument('--model', type=Path, required=True)
    infer.add_argument('--family', choices=['qwen','internvl','senocr'], required=True)
    infer.add_argument('--precision', choices=['float16','nf4'], default='float16')
    infer.add_argument('--output', type=Path, required=True)
    infer.add_argument('--tasks', nargs='+', choices=['transcribe','extract'], default=['transcribe','extract'])
    infer.add_argument('--only-id', action='append')
    infer.add_argument('--allow-local-records', action='store_true', help='Explicit offline-only experiment on workspace documents; never uploads sources')
    infer.add_argument('--max-pixels', type=int, default=501760)
    infer.add_argument('--max-patches', type=int, default=4)
    infer.add_argument('--max-new-tokens', type=int, default=512)
    infer.add_argument('--max-seconds', type=int, default=180)
    evaluate = sub.add_parser('score')
    evaluate.add_argument('--dataset', type=Path, required=True)
    evaluate.add_argument('--runs', type=Path, nargs='+', required=True)
    evaluate.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare(args.output)
    elif args.command == 'run':
        run(args)
    else:
        score(args)


if __name__ == '__main__':
    main()
