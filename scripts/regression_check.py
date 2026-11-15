"""Replay saved API responses with the current code and compare CRF scores to a baseline.

No API calls are made. Each case replays one saved intake (manifest + api-responses)
through the current workflow, scores the candidate pool against a frozen reference,
and fails when a case finds fewer expected values or produces more wrong values than
its recorded baseline.

Config (kept outside the repository, it points at local patient intakes):
  {"cases": [{"name": "BN-01", "intake": "research/patient-intakes/staging/intake-...",
              "responses": "workflow-1/api-responses", "reference": "reference-BN01.json",
              "baseline": {"found": 77, "wrong": 0}}]}

Usage: python scripts/regression_check.py CONFIG [--workspace DIR] [--update-baseline]
"""
import argparse
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


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('config')
    parser.add_argument('--workspace', default='.')
    parser.add_argument('--update-baseline', action='store_true')
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
    finally:
        shutil.rmtree(scratch, ignore_errors=True)
    if args.update_baseline:
        config_path.write_text(json.dumps(config, indent=1, ensure_ascii=False), encoding='utf-8')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
