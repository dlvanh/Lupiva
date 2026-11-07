"""Build development references from pre-existing visual transcripts only.

Does not read OCR predictions or import the extraction parser. Outputs are
unreviewed development references, never ground truth or model input.
"""
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'examples/ocr-reference-draft'
DOCUMENTS = ['IN01', 'IN02', 'IN04', 'IN06', 'IN08', 'IN09', 'IN10', 'IN11']
LABELS = {
    'PID': 'pid', 'SID': 'sid', 'Identity number': 'identity_number',
    'Ngày sinh': 'birth_date', 'Date of birth': 'birth_date',
    'Giới tính': 'sex', 'Sex': 'sex', 'Age': 'age',
    'Height (cm)': 'height', 'Weight (kg)': 'weight',
    'Giờ chỉ định': 'ordered_date', 'Giờ lấy mẫu': 'sample_date', 'Giờ nhận mẫu': 'received_date',
}
SCOPE_KEYS = sorted(set(LABELS.values()) | {'measurement_date', 'distributed_date', 'unresolved_identifier'})


def main():
    expected, sources = [], []
    for did in DOCUMENTS:
        path = REF / 'text' / (did + '.txt')
        raw = path.read_bytes()
        sources.append({'document_id': did, 'path': path.relative_to(ROOT).as_posix(),
                        'sha256': hashlib.sha256(raw).hexdigest()})
        for line_no, line in enumerate(raw.decode('utf-8').splitlines(), 1):
            label, separator, value = line.partition(':')
            key = LABELS.get(label.strip()) if separator else None
            if key:
                value = value.strip()
                if key == 'birth_date':
                    value = datetime.strptime(value, '%d/%m/%Y').date().isoformat()
                elif key.endswith('_date'):
                    value = datetime.strptime(value, '%H:%M %d/%m/%Y').isoformat(timespec='seconds')
                elif key == 'sex':
                    value = {'Nữ': 'female', 'Nam': 'male', 'F': 'female', 'M': 'male'}[value]
            elif did == 'IN02' and re.fullmatch(r'\d{2}/\d{2}/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M', line):
                key = 'measurement_date'
                value = datetime.strptime(line, '%d/%m/%Y %I:%M:%S %p').isoformat(timespec='seconds')
            else:
                continue
            expected.append(dict(document_id=did, key=key, value=value,
                                 reference_source=path.relative_to(ROOT).as_posix(), reference_line_1based=line_no))
    if len(expected) != 46:
        raise ValueError('Reference transcript changed; inspect metadata scope before rebuilding')
    metadata = dict(status='draft_unreviewed', human_reviewed=False,
                    method='independent_visual_transcripts_preexisting_before_metadata_OCR',
                    sources=sources, scope=[[did, key] for did in DOCUMENTS for key in SCOPE_KEYS],
                    candidates=expected)
    (REF / 'development-metadata-reference.json').write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    adm_mapping = {'age': ('ADM02', 'years'), 'sex': ('ADM03', None),
                   'height': ('ADM05', 'cm'), 'weight': ('ADM06', 'kg')}
    observations = []
    for item in expected:
        if item['key'] not in adm_mapping:
            continue
        fid, unit = adm_mapping[item['key']]
        result = ({'qualitative_value': item['value']} if item['key'] == 'sex' else
                  {'numeric_value': item['value'], 'comparator': '='})
        observations.append(dict(document_id=item['document_id'], field_id=fid,
                                 component='result', unit_raw=unit, panel=None, **result,
                                 reference_source=item['reference_source'],
                                 reference_line_1based=item['reference_line_1based']))
    adm = dict(status='draft_unreviewed', human_reviewed=False, sources=sources,
               scope=[[did, fid, 'result'] for did in DOCUMENTS for fid, _ in adm_mapping.values()],
               observations=observations)
    (REF / 'development-adm-reference.json').write_text(
        json.dumps(adm, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Saved {len(expected)} metadata and {len(observations)} ADM draft reference tuples. No OCR input used.')


if __name__ == '__main__':
    main()
