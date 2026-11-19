"""Compare candidate tuples against a separate, explicitly scoped reference.

This is field extraction validation, not whole-page OCR CER/WER or clinical
acceptance. A draft reference produces only provisional development results.
"""
import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.rules import unit_key


def fingerprint(item):
    number = item.get('numeric_value')
    if number is not None:
        try:
            number = str(Decimal(number).normalize())
        except InvalidOperation:
            number = '!invalid:' + str(number)
    return (item['document_id'], item['field_id'], item.get('component', 'result'),
            number, item.get('comparator', '='), unit_key(item.get('unit_raw') or ''),
            item.get('qualitative_value'), item.get('panel'),
            (item.get('pattern_raw') or '').casefold(), item.get('grade_raw'),
            item.get('symbolic_value'))


def compare(package, reference):
    # Scope is an explicit list of (document, field, component). Never count the
    # hundreds of absent catalog fields as true negatives.
    scope = {tuple(s) for s in reference['scope']}
    expected_items = reference['observations']
    for item in expected_items:
        if (item['document_id'], item['field_id'], item.get('component', 'result')) not in scope:
            raise ValueError('Expected observation outside reference scope')
    predicted = [o for o in package['observations']
                 if (o['document_id'], o['field_id'], o['component']) in scope]
    expected = Counter(fingerprint(o) for o in expected_items)
    actual = Counter(fingerprint(o) for o in predicted)
    matched = sum((expected & actual).values())
    missing, extra = expected - actual, actual - expected
    return {
        'reference_status': reference['status'],
        'tuple_columns': ['document_id', 'field_id', 'component', 'numeric_value', 'comparator',
                          'unit_key', 'qualitative_value', 'panel', 'pattern', 'grade', 'symbolic_value'],
        'provisional': reference['status'] != 'human_verified',
        'scope': reference['scope'], 'expected_count': sum(expected.values()),
        'predicted_count': sum(actual.values()), 'matched_count': matched,
        'precision': matched / sum(actual.values()) if actual else None,
        'recall': matched / sum(expected.values()) if expected else None,
        'missing_tuples': [list(t) for t in missing.elements()],
        'extra_or_wrong_tuples': [list(t) for t in extra.elements()],
        'predicted_with_flags': [o['observation_id'] for o in predicted if o['flags']],
        'note': 'Exact scoped field tuples only. Not whole-page OCR accuracy or proof of clinical readiness.',
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pool', type=Path)
    p.add_argument('reference', type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--document-id', help='Restrict the predefined reference scope to one document')
    a = p.parse_args()
    reference = json.loads(a.reference.read_text(encoding='utf-8-sig'))
    if a.document_id:
        reference['scope'] = [s for s in reference['scope'] if s[0] == a.document_id]
        reference['observations'] = [o for o in reference['observations'] if o['document_id'] == a.document_id]
        if not reference['scope']:
            raise ValueError('Requested document is outside the predefined reference scope')
    report = compare(json.loads(a.pool.read_text(encoding='utf-8-sig')), reference)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('provisional', 'expected_count', 'predicted_count', 'matched_count', 'precision', 'recall')}))


if __name__ == '__main__':
    main()
