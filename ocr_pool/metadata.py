"""Label-based, local metadata extraction. Never resolves patient identity.

All facts remain candidates. A source date requires a declared date convention;
an unlabelled timestamp additionally requires an explicit source-context role.
"""
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
import hashlib
import re
import unicodedata


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text)
                   if not unicodedata.combining(c)).lower().replace('đ', 'd')


LABELS = {
    'pid': r'\bpid', 'sid': r'\bsid',
    'identity_number': r'\b(?:identity\s+number|cmt|cmnd|cccd)',
    'unresolved_identifier': r'\b(?:bid|vidi|vid)',
    'birth_date': r'\b(?:ngay\s+sinh|date\s+of\s+birth)',
    'sex': r'\b(?:gioi\s+tinh|sex|gender)',
    'age': r'\b(?:age|tuoi)',
    'height': r'\b(?:height|chieu\s+cao)(?:\s*\(cm\))?',
    'weight': r'\b(?:weight|can\s+nang)(?:\s*\(kg\))?',
    'sample_date': r'\b(?:gio|ngay)\s+lay\s+mau',
    'received_date': r'\b(?:gio|ngay)\s+nhan\s+mau',
    'ordered_date': r'\b(?:gio|ngay)\s+chi\s+dinh',
    'distributed_date': r'\b(?:gio|ngay)\s+phan\s+mau',
    'measurement_date': r'\b(?:measurement\s+date|ngay\s+do)',
}
LABEL_PATTERN = re.compile('|'.join(f'(?P<{key}>{pattern})\s*:' for key, pattern in LABELS.items()))
DATE = r'\d{1,2}/\d{1,2}/\d{4}'
TIME = r'\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?'
DATE_VALUE = re.compile(rf'(?:{DATE}(?:\s+{TIME})?|{TIME}\s+{DATE})', re.I)
DATE_KEYS = {'sample_date', 'received_date', 'ordered_date', 'distributed_date', 'measurement_date', 'birth_date'}
ADM_FIELDS = {'age': ('ADM02', 'years'), 'sex': ('ADM03', None),
              'height': ('ADM05', 'cm'), 'weight': ('ADM06', 'kg')}


def metadata_response_flags(raw):
    """Flag known model self-description, not a language or patient value."""
    text = fold(raw)
    markers = (r'\b(?:as an?|i am an?)\s+(?:artificial intelligence|ai|language)\s+(?:language\s+)?model\b',
               r'\btoi la (?:mot )?mo hinh (?:ngon ngu|ai)\b',
               r'作为一个人工智能语言模型')
    return ['ocr_self_referential_response'] if any(re.search(p, text) for p in markers) else []


def normalize_value(key, raw, label, context):
    if key in DATE_KEYS:
        if context.get('date_order') != 'DMY':
            return None, ['missing_date_convention']
        if not DATE_VALUE.fullmatch(raw):
            return None, ['invalid_metadata_date']
        formats = ['%d/%m/%Y']
        for clock in ('%H:%M', '%H:%M:%S', '%I:%M %p', '%I:%M:%S %p'):
            formats.extend(['%d/%m/%Y ' + clock, clock + ' %d/%m/%Y'])
        for fmt in formats:
            try:
                value = datetime.strptime(raw.upper(), fmt)
                if key == 'birth_date' or fmt == '%d/%m/%Y':
                    return value.date().isoformat(), []
                return value.isoformat(timespec='seconds'), []
            except ValueError:
                continue
        return None, ['invalid_metadata_date']
    if key in ('pid', 'sid', 'identity_number', 'unresolved_identifier'):
        if not re.fullmatch(r'[A-Za-z0-9]+(?:[-./_][A-Za-z0-9]+)*', raw):
            return None, ['invalid_identifier_text']
        return raw, ['unrecognized_identifier_label'] if key == 'unresolved_identifier' else []
    if key == 'sex':
        value = {'f': 'female', 'female': 'female', 'nu': 'female',
                 'm': 'male', 'male': 'male', 'nam': 'male'}.get(fold(raw))
        return value, [] if value else ['unrecognized_sex_value']
    unit = ADM_FIELDS[key][1]
    pattern = r'(\d+(?:[.,]\d+)?)(?:\s*(cm|kg|years?|nam|tuoi))?'
    match = re.fullmatch(pattern, fold(raw))
    if not match:
        return None, ['invalid_metadata_number']
    number, suffix = match.groups()
    if ',' in number and context.get('decimal_separator') != ',':
        return None, ['ambiguous_metadata_decimal']
    if key in ('height', 'weight') and unit not in fold(label) and suffix != unit:
        return None, ['missing_metadata_unit']
    if suffix and suffix not in ({'years', 'year', 'nam', 'tuoi'} if key == 'age' else {unit}):
        return None, ['metadata_unit_mismatch']
    value = Decimal(number.replace(',', '.'))
    if value <= 0 or (key == 'age' and value != value.to_integral_value()):
        return None, ['invalid_metadata_number']
    return format(value, 'f'), []


def extract_metadata(document, *, candidate_offset=0, evidence_offset=0):
    candidates, evidence, issues = [], [], []
    did = document['document_id']
    for index, payload in enumerate(document.get('text_regions', [])):
        rid = payload.get('table_id', f'TEXT{index + 1:03d}')
        quality_flags = metadata_response_flags(payload['raw'])
        if quality_flags:
            issues.append(dict(document_id=did, table_id=rid, reason='ocr_region_needs_review',
                               flags=quality_flags))
            continue
        if payload.get('purpose', 'metadata') != 'metadata':
            continue
        if payload.get('truncated') or payload.get('generation_status', 'ok') != 'ok':
            issues.append(dict(document_id=did, table_id=rid, reason='incomplete_metadata_generation'))
            continue
        context = {**document.get('metadata_context', {}), **payload.get('context', {})}
        raw = payload['raw']
        sha = hashlib.sha256(raw.encode('utf-8')).hexdigest()
        candidate_count_before = len(candidates)

        def append(key, label, value_raw, line, line_index, start, end, method='label'):
            if key in context.get('metadata_exclude_keys', []):
                return
            value, flags = normalize_value(key, value_raw, label, context)
            eid = f'EV{evidence_offset + len(evidence) + 1:05d}'
            evidence.append(dict(evidence_id=eid, document_id=did, table_id=rid,
                                 evidence_kind='metadata', row_index_0based=line_index,
                                 result_column_0based=None, line_raw=line, raw_span_0based=[start, end],
                                 value_raw=value_raw, label_raw=label, table_sha256=sha,
                                 input_sha256=document.get('input_sha256'),
                                 source_context=context, region=payload.get('region'),
                                 ocr_confidence=payload.get('ocr_confidence'),
                                 generation_status=payload.get('generation_status', 'ok'),
                                 truncated=bool(payload.get('truncated')),
                                 derivation=payload.get('derivation'),
                                 region_granularity='text_region' if payload.get('region') else 'unavailable',
                                 mapping_method=method))
            candidates.append(dict(candidate_id=f'MD{candidate_offset + len(candidates) + 1:05d}',
                                   document_id=did, key=key, value=value, value_raw=value_raw,
                                   label_raw=label, flags=flags, evidence_ids=[eid],
                                   validation_status='needs_review' if flags else 'structure_checks_passed',
                                   review_status='pending', eligible_for_verified_pool=False))

        offset = 0
        for line_index, segment in enumerate(raw.splitlines(keepends=True)):
            line = segment.rstrip('\r\n')
            normalized = fold(line)
            # Accent folding preserves source character indices for supported labels.
            if len(normalized) != len(line):
                offset += len(segment)
                continue
            labels = list(LABEL_PATTERN.finditer(normalized))
            for position, match in enumerate(labels):
                stop = labels[position + 1].start() if position + 1 < len(labels) else len(line)
                start = match.end()
                while start < stop and line[start].isspace():
                    start += 1
                end = stop
                while end > start and line[end - 1].isspace():
                    end -= 1
                append(match.lastgroup, line[match.start():match.end()], line[start:end],
                       line, line_index, offset + start, offset + end)
            if not labels and context.get('unlabelled_datetime_role') == 'measurement_date' and DATE_VALUE.fullmatch(line.strip()):
                start = len(line) - len(line.lstrip())
                append('measurement_date', '', line.strip(), line, line_index,
                       offset + start, offset + len(line.rstrip()), 'declared_source_timestamp_role')
            offset += len(segment)
        if len(candidates) == candidate_count_before and not context.get('metadata_exclude_keys'):
            issues.append(dict(document_id=did, table_id=rid, reason='no_recognized_metadata'))
    # A selected refinement may repeat metadata from its parent grid. Merge
    # only agreeing, valid derived cells, retaining both source evidences.
    derived_eids = {e['evidence_id'] for e in evidence
                    if (e.get('derivation') or {}).get('method') == 'explicit_table_metadata_cells'}
    merged, cell_facts = [], {}
    for candidate in candidates:
        signature = (candidate['key'], candidate['value'])
        if (not candidate['flags'] and candidate['value'] is not None
                and set(candidate['evidence_ids']) <= derived_eids):
            if signature in cell_facts:
                cell_facts[signature]['evidence_ids'].extend(candidate['evidence_ids'])
                continue
            cell_facts[signature] = candidate
        merged.append(candidate)
    candidates = merged
    # Subsequent documents allocate IDs by candidate count.
    for index, candidate in enumerate(candidates, candidate_offset + 1):
        candidate['candidate_id'] = f'MD{index:05d}'
    by_key = defaultdict(list)
    for candidate in candidates:
        by_key[candidate['key']].append(candidate)
    for key, items in by_key.items():
        values = {item['value'] for item in items if item['value'] is not None}
        if len(values) > 1:
            for item in items:
                item['flags'].append('metadata_conflict')
                item['validation_status'] = 'needs_review'
            issues.append(dict(document_id=did, reason='metadata_conflict', metadata_key=key,
                               candidate_ids=[item['candidate_id'] for item in items]))
    for candidate in candidates:
        if candidate['flags'] and 'metadata_conflict' not in candidate['flags']:
            issues.append(dict(document_id=did, reason='metadata_needs_review',
                               metadata_key=candidate['key'], candidate_id=candidate['candidate_id'],
                               flags=candidate['flags']))
    return candidates, evidence, issues


def select_fact(candidates, key):
    items = [c for c in candidates if c['key'] == key]
    # Any unresolved candidate for this key blocks automatic propagation.
    if not items or any(c['flags'] or c['value'] is None for c in items):
        return None
    return items[0] if len({c['value'] for c in items}) == 1 else None


def source_date_key(candidates, context):
    # An invalid/conflicting preferred date must block fallback. Other date
    # roles (birth/receipt/order) never substitute for collection or measurement.
    if context.get('panel') == 'pft':
        return 'measurement_date'
    return 'sample_date' if any(c['key'] == 'sample_date' for c in candidates) else 'measurement_date'


def select_source_date(candidates, context):
    key = source_date_key(candidates, context)
    fact = select_fact(candidates, key)
    return (fact['value'], key, fact['evidence_ids']) if fact else (None, None, [])
