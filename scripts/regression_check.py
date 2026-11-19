"""Replay saved API responses with the current code and compare CRF scores to a baseline.

No API calls are made. Each case replays one saved intake (manifest + api-responses)
through the current workflow, scores the candidate pool against a frozen reference,
and fails when a case finds fewer expected values or produces more wrong values than
its recorded baseline.

The replay sends the plans saved in the manifest, so it cannot see crop changes. A second
check re-proposes each image's crop and masks from its saved local OCR with the current code
and fails on any change against the accepted plans: an image that stops being automatic, one
that becomes automatic, or a different crop or mask set. A changed crop also lists, from the
saved OCR lines, text that was hidden and is now sent, and number lines that were sent and are
now cut or masked. Check the outgoing images by eye, then record the new plans with
--accept-crops (kept per case as "crop_baseline"). Images a person kept or cropped without a
local proposal are left out: no code path changes them.

Config (kept outside the repository, it points at local patient intakes):
  {"cases": [{"name": "BN-01", "intake": "research/patient-intakes/staging/intake-...",
              "responses": "workflow-1/api-responses", "reference": "reference-BN01.json",
              "baseline": {"found": 77, "wrong": 0}}]}

Usage: python scripts/regression_check.py CONFIG [--workspace DIR] [--update-baseline] [--accept-crops]
"""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORDS = ('negative', 'positive', 'borderline', 'male', 'female', 'speckled', 'no', 'yes')


def numbers(text):
    return [float(x) for x in re.findall(r'\d+(?:\.\d+)?', str(text or '').replace(',', '.'))]


def words(text):
    text = str(text or '').lower()
    return {w for w in WORDS if re.search(r'\b' + w + r'\b', text)}


def expected(reference):
    slots = defaultdict(list)
    for block in reference.values():
        if not isinstance(block, dict) or not isinstance(block.get('crf'), dict):
            continue
        for key, value in block['crf'].items():
            if key == 'post':
                continue
            if isinstance(value, dict):
                for component, v in value.items():
                    if component != 'note':
                        slots[key + '/' + component].append(str(v))
                continue
            slot = key if '/' in key else key + '/result'
            slots[slot] += [str(v) for v in (value if isinstance(value, list) else [value])]
    return slots


def matches(want, got):
    wn, gn = numbers(want.split('(')[0]), numbers(got)
    if wn and (not gn or abs(wn[0] - gn[0]) > 1e-9):
        return False
    ww = words(want) - {'no', 'yes'}
    return ww <= words(got) if ww else bool(wn) or words(want) <= words(got)


def pool_values(pool):
    got = defaultdict(list)
    for o in pool['observations']:
        parts = [o.get('comparator') if o.get('comparator') not in (None, '=') else None, o.get('numeric_value'),
                 o.get('qualitative_value'), o.get('pattern_raw'), o.get('grade_raw')]
        value = ' '.join(str(x) for x in parts if x not in (None, '')) or o.get('result_raw')
        if value not in (None, ''):
            got[o['field_id'] + '/' + o['component']].append(str(value))
    return got


def score(pool, reference):
    want, got = expected(reference), pool_values(pool)
    found, misses, wrong = 0, [], []
    for slot, values in sorted(want.items()):
        for v in values:
            if any(matches(v, g) for g in got.get(slot, [])):
                found += 1
            else:
                misses.append(f'{slot} expected {v} got {got.get(slot, [])}')
    for slot, values in got.items():
        if slot in want:
            wrong += [f'{slot} = {g}' for g in values if not any(matches(v, g) for v in want[slot])]
    return dict(found=found, expected=sum(len(v) for v in want.values()), wrong=len(wrong),
                misses=misses, wrong_values=wrong)


def replay(case, workspace, scratch):
    intake = (workspace / case['intake']).resolve()
    output = scratch / case['name']
    subprocess.run([sys.executable, '-X', 'utf8', str(ROOT / 'scripts/replay_intake.py'), '--intake', str(intake),
                    '--responses', str(intake / case['responses']), '--output', str(output),
                    '--workspace', str(workspace)], cwd=workspace, check=True, capture_output=True)
    return json.loads((output / 'candidate-pool.json').read_text(encoding='utf-8'))


def plan_key(plan):
    """What decides the outgoing bytes: manual review, never sent, or the exact crop and masks."""
    if not plan:
        return 'manual'
    if plan.get('skip'):
        return 'skip'
    geometry = dict(crop=plan['crop'], masks=sorted(plan.get('masks') or []),
                    mask_polygons=sorted(plan.get('mask_polygons') or []))
    return 'auto:' + hashlib.sha256(json.dumps(geometry, sort_keys=True).encode()).hexdigest()[:16]


def _inside(point, box):
    return box[0] <= point[0] <= box[2] and box[1] <= point[1] <= box[3]


def _in_polygon(point, polygon):
    x, y, inside = point[0], point[1], False
    for (x0, y0), (x1, y1) in zip(polygon, polygon[1:] + polygon[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            inside = not inside
    return inside


def visible(line, plan):
    """Whether the centre of a local OCR line (original image coordinates) is in the outgoing image."""
    box = line['box']
    centre = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
    return (_inside(centre, plan['crop']) and not any(_inside(centre, m) for m in plan.get('masks') or [])
            and not any(_in_polygon(centre, p) for p in plan.get('mask_polygons') or []))


def visibility_changes(lines, old, new):
    """Text the new plan newly shows, and numbers it newly hides, judged on the saved local OCR lines.

    Model row boxes are not used: they can sit far from the printed row.
    """
    shown = [line['box'] for line in lines if visible(line, new) and not visible(line, old)]
    hidden = [line['text'] for line in lines
              if re.search(r'\d', line['text']) and visible(line, old) and not visible(line, new)]
    return shown, hidden


def crop_replay(case, workspace):
    """Re-propose every image's crop and masks from its saved local OCR with the current code.

    Neither OCR nor the API runs: the saved OCR lines of the upload preview and the original
    image (for barcodes and grid lines) go through the same proposal and automatic-plan code
    as the server. Returns one entry per image with the plan it was sent with and the new one.
    """
    from PIL import Image, ImageOps
    from ocr_pool.privacy_geometry import inspect_barcodes, vertical_segments
    from ocr_pool.privacy_proposal import collection_headers, propose
    from registry_review.privacy import automatic_plan, proposal_summary
    intake = (workspace / case['intake']).resolve()
    manifest = json.loads((intake / 'manifest.json').read_text(encoding='utf-8'))
    out = []
    for index, doc in enumerate(manifest['documents'], 1):
        stored = doc.get('privacy') or {}
        entry = dict(image=index, document_id=doc['document_id'], sent=plan_key(stored if stored.get('automatic') else None))
        if not stored.get('proposal_id') and not stored.get('automatic'):
            # A person kept or cropped this image without a local proposal; code cannot change that.
            out.append({**entry, 'new': entry['sent'], 'person_decided': True})
            continue
        folder = workspace / 'research/privacy-proposals' / str(stored.get('proposal_id'))
        try:
            ocr = (folder / 'ocr-local.json').read_bytes()
            recorded = json.loads((folder / 'proposal.json').read_text(encoding='utf-8')).get('ocr_sha256')
        except OSError:
            out.append({**entry, 'new': None, 'error': 'saved local OCR missing'})
            continue
        if recorded and hashlib.sha256(ocr).hexdigest() != recorded:
            out.append({**entry, 'new': None, 'error': 'saved local OCR changed since the proposal'})
            continue
        lines = json.loads(ocr)['lines']
        with Image.open(workspace / doc['input_path']) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
        grid = vertical_segments(image) if collection_headers(lines) else []
        plan = propose(lines, inspect_barcodes(image), image.size, vertical_segments=grid, image=image)
        summary = proposal_summary(plan, doc['input_sha256'], list(image.size))
        new = automatic_plan(summary, stored.get('proposal_id'))
        entry.update(new=plan_key(new), crop_reason=summary['crop_reason'], review_count=summary['review_count'])
        if stored.get('automatic') and not stored.get('skip') and new and not new.get('skip') and entry['sent'] != entry['new']:
            shown, hidden = visibility_changes(lines, stored, new)
            entry.update(crop=[stored['crop'], new['crop']], newly_shown=shown, newly_hidden=hidden)
        out.append(entry)
    return out


def crop_findings(images, accepted):
    """Every change against the accepted plans fails the gate: crops are checked by eye, then accepted."""
    findings = []
    for image in images:
        want = accepted.get(image['document_id'], image['sent'])
        if image.get('error'):
            findings.append(f"image {image['image']}: {image['error']}")
        elif image['new'] != want:
            what = ('no longer sent automatically' if image['new'] == 'manual' else
                    'now sent without review' if want == 'manual' else
                    'now kept local as a chart' if image['new'] == 'skip' else 'crop or masks changed')
            detail = f"image {image['image']}: {what} ({image['crop_reason']}, {image['review_count']} review items)"
            if 'crop' in image:
                detail += f"; crop {image['crop'][0]} -> {image['crop'][1]}"
                if image['newly_shown']:
                    detail += f"; {len(image['newly_shown'])} OCR line(s) hidden before now sent, boxes {image['newly_shown']}"
                if image['newly_hidden']:
                    detail += f"; {len(image['newly_hidden'])} number line(s) sent before now cut or masked {image['newly_hidden']}"
            findings.append(detail)
    return findings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('config')
    parser.add_argument('--workspace', default='.')
    parser.add_argument('--update-baseline', action='store_true')
    parser.add_argument('--accept-crops', action='store_true',
                        help='Record the current crop plans as accepted, after checking the outgoing images by eye')
    args = parser.parse_args(argv)
    config_path, workspace = Path(args.config).resolve(), Path(args.workspace).resolve()
    config = json.loads(config_path.read_text(encoding='utf-8'))
    failed = False
    scratch = Path(tempfile.mkdtemp(prefix='regression-'))
    try:
        for case in config['cases']:
            reference = json.loads((config_path.parent / case['reference']).read_text(encoding='utf-8'))
            try:
                pool = replay(case, workspace, scratch)
            except subprocess.CalledProcessError as error:
                tail = (error.stderr or b'').decode('utf-8', 'replace').strip().splitlines()[-1:]
                print(f"REGRESSION {case['name']}: replay failed: {' '.join(tail)}")
                failed = True
                continue
            result = score(pool, reference)
            base = case.get('baseline') or {}
            worse = result['found'] < base.get('found', 0) or result['wrong'] > base.get('wrong', result['wrong'])
            print(f"{'REGRESSION' if worse else 'ok'} {case['name']}: found {result['found']}/{result['expected']}"
                  f", wrong {result['wrong']} (baseline found {base.get('found')}, wrong {base.get('wrong')})")
            for line in result['misses'] + ['WRONG ' + w for w in result['wrong_values']]:
                print('   ', line)
            failed |= worse and not args.update_baseline
            if args.update_baseline:
                case['baseline'] = dict(found=result['found'], wrong=result['wrong'])
            # The replay above sends the saved plans; this re-proposes them, so crop changes show.
            try:
                images = crop_replay(case, workspace)
            except Exception as error:
                print(f"REGRESSION {case['name']} crops: replay failed: {type(error).__name__}: {error}")
                failed = True
                continue
            findings = crop_findings(images, case.get('crop_baseline') or {})
            print(f"{'REGRESSION' if findings else 'ok'} {case['name']} crops: "
                  f"{len(images) - len(findings)}/{len(images)} images keep the accepted plan")
            for line in findings:
                print('   ', line)
            failed |= bool(findings) and not args.accept_crops
            if args.accept_crops and not any(image.get('error') for image in images):
                case['crop_baseline'] = {image['document_id']: image['new'] for image in images}
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if args.update_baseline or args.accept_crops:
        config_path.write_text(json.dumps(config, indent=1, ensure_ascii=False), encoding='utf-8')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
