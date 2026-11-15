"""Offline photograph perturbations of local privacy decisions; never export OCR text.

Results assume unchanged source files, models and proposal rules when resuming.
Regions are baseline-derived probes, not independent annotations of all sensitive content.
"""
import argparse
from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import math
from pathlib import Path
import re
import socket
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool import privacy_proposal as proposal

DEFAULT_VARIANTS = 'rot+1.5,rot-1.5,scale0.6,jpeg35,dark,blur'
IMAGE_SUFFIXES = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp', '.gif'}


def parse_variant(name):
    if name in {'dark', 'blur'}:
        return name, None
    match = re.fullmatch(r'(rot|scale|jpeg)([+-]?(?:\d+(?:\.\d*)?|\.\d+))', name)
    if not match:
        raise ValueError('Unknown variant')
    kind, number = match.groups(); value = float(number)
    if not math.isfinite(value) or (kind == 'scale' and value <= 0):
        raise ValueError('Invalid variant value')
    if kind == 'jpeg' and (not value.is_integer() or not 1 <= value <= 100):
        raise ValueError('JPEG quality must be an integer from 1 to 100')
    return kind, value


def make_variant(image, name):
    """Return a new RGB image and a map accepting a baseline (x, y) point."""
    kind, value = parse_variant(name)
    identity = lambda point: (point[0], point[1])
    if kind == 'rot':
        result = image.rotate(value, resample=Image.Resampling.BICUBIC,
                              expand=True, fillcolor='white')
        angle = math.radians(value % 360)
        c, s = round(math.cos(angle), 15), round(math.sin(angle), 15)
        def mapping(point):
            x, y = point[0]-image.width/2, point[1]-image.height/2
            return c*x+s*y+result.width/2, -s*x+c*y+result.height/2
        return result, mapping
    if kind == 'scale':
        size = (max(1, round(image.width*value)), max(1, round(image.height*value)))
        result = image.resize(size, Image.Resampling.LANCZOS)
        return result, lambda p: (p[0]*size[0]/image.width, p[1]*size[1]/image.height)
    if kind == 'jpeg':
        stream = io.BytesIO()
        image.save(stream, format='JPEG', quality=int(value))
        stream.seek(0)
        with Image.open(stream) as encoded:
            result = encoded.convert('RGB')
        return result, identity
    if kind == 'dark':
        result = ImageEnhance.Brightness(image).enhance(.75)
        return ImageEnhance.Contrast(result).enhance(.85), identity
    return image.filter(ImageFilter.GaussianBlur(1.0)), identity


def automatic(plan):
    return not plan['review_items'] and plan['crop_reason'].startswith('detected_')


def intersect(a, b):
    box = [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]
    return box if box[0] < box[2] and box[1] < box[3] else None


def ground_truth(plan, lines):
    if not automatic(plan):
        return []
    regions = [dict(box=list(mask['box']), reasons=list(mask.get('reasons', [])))
               for mask in plan['masks']]
    staff = (proposal.STAFF_ROLE, proposal.STAFF_TITLE, proposal.LAB_SIGNER,
             proposal.LAB_TECHNICIAN, proposal.SIGNATURE_LABEL)
    for line in lines:
        if intersect(line['box'], plan['crop']):
            continue
        text = proposal.fold(line['text']).strip()
        kinds = []
        for kind, pattern in (('identity', proposal.IDENTITY), ('phone', proposal.PHONE),
                              ('email', proposal.EMAIL)):
            if pattern.search(text):
                kinds.append(kind)
        if proposal.date_mentions(text, contextual=True):
            kinds.append('date')
        if any(pattern.match(text) for pattern in staff):
            kinds.append('staff')
        if kinds:
            regions.append(dict(box=list(line['box']),
                                reasons=['outside_crop_'+kind for kind in kinds]))
    return regions


def mapped_box(box, mapping):
    a, b, c, d = box
    points = [mapping(p) for p in ((a,b), (c,b), (c,d), (a,d))]
    return [min(p[0] for p in points), min(p[1] for p in points),
            max(p[0] for p in points), max(p[1] for p in points)]


def core_box(box):
    a, b, c, d = box; dx, dy = .15*(c-a), .15*(d-b)
    return [a+dx, b+dy, c-dx, d-dy]


def mask_pixels(size, plan):
    """Use the renderer's box endpoints and polygon precedence/rounding."""
    raster = Image.new('1', size)
    draw = ImageDraw.Draw(raster); crop = plan['crop']
    for mask in plan['masks']:
        if mask.get('polygon'):
            draw.polygon([(round(x-crop[0])+crop[0], round(y-crop[1])+crop[1])
                          for x,y in mask['polygon']], fill=1)
        else:
            box = intersect(mask['box'], crop)
            if box:
                a,b,c,d = box
                draw.rectangle((a,b,c-1,d-1), fill=1)
    return np.asarray(raster, dtype=bool)


def exposures(regions, mapping, size, plan):
    if not automatic(plan) or not regions:
        return []
    covered = mask_pixels(size, plan); exposed = []
    crop = intersect(plan['crop'], [0, 0, *size])
    if not crop:
        return []
    for region in regions:
        box = mapped_box(region['box'], mapping); core = core_box(box)
        inside = intersect(core, crop)
        if not inside:
            continue
        a,b,c,d = inside
        x0,y0,x1,y1 = math.floor(a), math.floor(b), math.ceil(c), math.ceil(d)
        # Fractional boundary pixels count only for their area inside the core/crop.
        xs, ys = np.arange(x0,x1), np.arange(y0,y1)
        wx = np.minimum(xs+1,c)-np.maximum(xs,a)
        wy = np.minimum(ys+1,d)-np.maximum(ys,b)
        area = (c-a)*(d-b)
        fraction = float(np.einsum('i,ij,j->', wy, covered[y0:y1,x0:x1], wx)/area)
        if fraction < .80-1e-12:
            exposed.append(dict(box=box, core=core, reasons=list(region['reasons']),
                                covered_fraction=fraction))
    return exposed


def safe_id(image_id):
    label = re.sub(r'[^A-Za-z0-9_.-]+', '_', image_id).strip('._')[:100] or 'image'
    digest = hashlib.sha256(image_id.encode('utf-8')).hexdigest()[:12]
    return 'page-'+label+'-'+digest


def save_exposure(image, plan, exposed, path):
    outgoing = proposal.render(image, plan); draw = ImageDraw.Draw(outgoing)
    x, y = plan['crop'][:2]
    for region in exposed:
        core = intersect(region['core'], plan['crop'])
        a,b,c,d = core
        draw.rectangle((a-x,b-y,c-x,d-y), outline='red', width=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    outgoing.save(path, format='PNG')


class Quiet:
    def write(self, value): return len(value)
    def flush(self): pass


def analyze_record(image, models, analyze, image_id, variant):
    started = time.perf_counter()
    # OCR engines and injected analyzers may log recognized text. Discard both streams.
    with redirect_stdout(Quiet()), redirect_stderr(Quiet()):
        plan, lines = analyze(image, models)
    record = dict(image_id=image_id, variant=variant, automatic=automatic(plan),
                  local_only=plan['crop_reason'] == 'chart_only_page',
                  crop_reason=plan['crop_reason'],
                  review_codes=sorted({item['code'] for item in plan['review_items']}),
                  seconds=time.perf_counter()-started, size=list(image.size),
                  exposed_regions=[])
    return record, plan, lines


def markdown(value):
    return str(value).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace(
        '|', '&#124;').replace('\r', ' ').replace('\n', ' ')


def manual(record):
    return not record['automatic'] and not record['local_only']


def summary(records):
    baselines = {r['image_id']: r for r in records if r['variant'] == 'baseline'}
    variants = sorted({r['variant'] for r in records if r['variant'] != 'baseline'})
    lines = ['# Privacy robustness', '',
             f'Baseline automatic count: {sum(r["automatic"] for r in baselines.values())}',
             f'Baseline pages tested: {len(baselines)}', '',
             'Automatic means detected_* with no review items (sent). Chart-only pages stay local.',
             'Regions come from baseline masks and sensitive OCR outside its crop; '
             'this is not an independent recall assessment.', '',
             '| Variant | Pages tested | Still automatic | Became manual | '
             'Became automatic although baseline was manual | Pages with exposed regions | '
             'Exposed regions | Kept local |',
             '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
    promoted = []
    for variant in variants:
        rows = [r for r in records if r['variant'] == variant]
        still = became_manual = became_auto = 0
        for row in rows:
            baseline = baselines[row['image_id']]
            still += baseline['automatic'] and row['automatic']
            became_manual += baseline['automatic'] and manual(row)
            if manual(baseline) and row['automatic']:
                became_auto += 1; promoted.append(row)
        values = [len(rows), still, became_manual, became_auto,
                  sum(bool(r['exposed_regions']) for r in rows),
                  sum(len(r['exposed_regions']) for r in rows), sum(r['local_only'] for r in rows)]
        lines.append('| '+markdown(variant)+' | '+' | '.join(map(str, values))+' |')
    lines.extend(['', '## Exposures', '', '| Image id | Variant | Baseline reasons |',
                  '| --- | --- | --- |'])
    for row in records:
        for region in row['exposed_regions']:
            lines.append('| '+' | '.join(markdown(v) for v in (
                row['image_id'], row['variant'], ', '.join(region['reasons'])))+' |')
    if not any(r['exposed_regions'] for r in records):
        lines.extend(['', 'None.'])
    lines.extend(['', '## Manual baseline pages that became automatic', '',
                  '| Image id | Variant |', '| --- | --- |'])
    for row in promoted:
        lines.append('| '+markdown(row['image_id'])+' | '+markdown(row['variant'])+' |')
    if not promoted:
        lines.extend(['', 'None.'])
    return '\n'.join(lines)+'\n'


def checkpoint(out, records):
    temporary = out / 'results.json.tmp'
    temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temporary.replace(out / 'results.json')
    temporary = out / 'summary.md.tmp'
    temporary.write_text(summary(records), encoding='utf-8')
    temporary.replace(out / 'summary.md')


def image_paths(inputs, limit=None):
    paths = set()
    for source in map(Path, inputs):
        if source.is_dir():
            paths.update(p.resolve() for p in source.rglob('*')
                         if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES)
        elif source.is_file() and source.suffix.lower() in IMAGE_SUFFIXES:
            paths.add(source.resolve())
        else:
            raise ValueError('Input is missing or is not a supported image')
    ordered = sorted(paths, key=lambda p: str(p).casefold())
    ids = [p.parent.name+'/'+p.name for p in ordered]
    if len(set(ids)) != len(ids):
        raise ValueError('Duplicate parent/file image ids')
    return ordered if limit is None else ordered[:limit]


def run(inputs, models, out, analyze, variants=DEFAULT_VARIANTS, limit=None):
    """Run with an injectable local analyzer; checkpoints contain no OCR lines/plans."""
    variants = list(dict.fromkeys(variants.split(',') if isinstance(variants, str) else variants))
    for variant in variants:
        parse_variant(variant)
    if limit is not None and limit < 0:
        raise ValueError('Limit must be nonnegative')
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    result_path = out / 'results.json'
    records = json.loads(result_path.read_text(encoding='utf-8')) if result_path.exists() else []
    finished = {(r['image_id'], r['variant']): r for r in records}
    for path in image_paths(inputs, limit):
        image_id = path.parent.name+'/'+path.name
        pending = [v for v in ['baseline', *variants] if (image_id,v) not in finished]
        if not pending:
            for variant in ['baseline', *variants]:
                print(f'{image_id} / {variant}: skipped (finished)', flush=True)
            continue
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
        if (image_id, 'baseline') not in finished:
            baseline, plan, lines = analyze_record(image, models, analyze, image_id, 'baseline')
            baseline['regions'] = ground_truth(plan, lines)
            records.append(baseline); finished[image_id,'baseline'] = baseline
            checkpoint(out, records)
            print(f'{image_id} / baseline: automatic={baseline["automatic"]}', flush=True)
        else:
            print(f'{image_id} / baseline: skipped (finished)', flush=True)
        baseline = finished[image_id,'baseline']
        for variant in variants:
            if (image_id, variant) in finished:
                print(f'{image_id} / {variant}: skipped (finished)', flush=True)
                continue
            changed, mapping = make_variant(image, variant)
            row, plan, _ = analyze_record(changed, models, analyze, image_id, variant)
            row['exposed_regions'] = exposures(baseline['regions'], mapping, changed.size, plan)
            if row['exposed_regions']:
                preview = out / 'exposed' / (safe_id(image_id)+'--'+variant+'.png')
                save_exposure(changed, plan, row['exposed_regions'], preview)
            records.append(row); finished[image_id,variant] = row
            checkpoint(out, records)
            print(f'{image_id} / {variant}: automatic={row["automatic"]} '
                  f'exposed={len(row["exposed_regions"])}', flush=True)
        checkpoint(out, records)
    checkpoint(out, records)
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('inputs', nargs='+', type=Path)
    parser.add_argument('--variants', default=DEFAULT_VARIANTS)
    parser.add_argument('--limit', type=int)
    args = parser.parse_args()
    def offline(*args, **kwargs):
        raise RuntimeError('Network is disabled for local privacy robustness checks')
    socket.socket.connect = offline
    socket.socket.connect_ex = offline
    socket.create_connection = offline
    try:
        from ocr_pool.privacy_ocr import analyze
        run(args.inputs, args.models, args.out, analyze, args.variants, args.limit)
    except Exception:
        # Exception messages from OCR libraries may contain recognized text.
        parser.exit(1, 'Privacy robustness run failed; OCR details suppressed. '
                    'Check local inputs, models and output directory.\n')


if __name__ == '__main__':
    main()
