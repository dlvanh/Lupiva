"""Bind printed complement ranges to exact OCR label, result, and reference cells."""
from decimal import Decimal, InvalidOperation
import re

from .local_dates import unmasked_crop_lines
from .metadata import fold
from .rules import resolve, unit_key


RANGE = re.compile(r'\d+(?:[.,]\d+)?\s*[-–—]\s*\d+(?:[.,]\d+)?')
NUMBER = re.compile(r'\d+(?:[.,]\d+)?')


def attach_complement_ranges(record, scan, plan):
    if not scan:
        return
    lines = [line for line in unmasked_crop_lines(scan, plan)
             if isinstance(line.get('confidence'), (int, float)) and line['confidence'] >= .90]
    columns = {}
    for name, pattern in [('result', r'(?:ket\s*qua|results?)'), ('unit', r'(?:don\s*vi|units?)'),
                          ('reference', r'(?:(?:khoang\s*|gia\s*tri\s*)?tham\s*chieu|reference\s*(?:range|interval))')]:
        matches = [line['box'] for line in lines if re.fullmatch(pattern, fold(line['text']).strip(' .:'))]
        if len(matches) != 1:
            return
        columns[name] = matches[0]
    result, reference = columns['result'], columns['reference']
    unit = columns['unit']
    height = max(result[3]-result[1], reference[3]-reference[1])
    if (not result[2] <= unit[0] < unit[2] <= reference[0]
            or any(abs(result[1] - column[1]) > 2 * height for column in (unit, reference))):
        return
    labels = {}
    for line in lines:
        rule, _ = resolve(line['text'], {})
        if rule and rule['field_id'] in {'IMM11', 'IMM12'} and line['box'][2] < result[0]:
            labels.setdefault(rule['field_id'], []).append(line)
    rows = record['extraction']['rows']
    for index, row in enumerate(rows):
        field = row.get('field_id')
        matches = labels.get(field, [])
        if (len(matches) != 1 or row.get('component') != 'result' or not row.get('unit_raw')
                or row.get('comparator') != '=' or sum(r.get('field_id') == field for r in rows) != 1):
            continue
        box = matches[0]['box']
        mid = (box[1] + box[3]) / 2
        if mid <= max(result[3], reference[3]):
            continue
        cells = {}
        for name, pattern in [('result', NUMBER), ('reference', RANGE), ('unit', re.compile(r'(?:mg|g)/(?:d?l)', re.I))]:
            header = columns[name]
            cells[name] = [line['text'].strip() for line in lines
                           if abs((line['box'][1]+line['box'][3])/2 - mid) <= (box[3]-box[1])*.55
                           and header[0]-height <= (line['box'][0]+line['box'][2])/2 <= header[2]+height
                           and pattern.fullmatch(line['text'].strip())]
        if any(len(values) != 1 for values in cells.values()):
            continue
        if unit_key(cells['unit'][0]) != unit_key(row['unit_raw']):
            continue
        try:
            if Decimal(cells['result'][0].replace(',', '.')) != Decimal(row.get('numeric_value') or ''):
                continue
        except InvalidOperation:
            continue
        value = cells['reference'][0].replace(',', '.')
        row['reference_range_raw'] = value
        record['normalization_audit'].append(dict(row_index=index, attribute='reference_range_raw',
                                                   before=None, after=value, reason='unique_local_reference_cell'))
