"""Confirmed reference intervals shared by documents using the same lab profile."""
from collections import defaultdict
import json
import re

from registry_pool.dictionary import digest
from registry_pool.specimens import evidence_crop_id
from .store import HUMAN_ROLES, actor_info, now, text
from .workspace import StalePatient


def unit_key(unit):
    if not isinstance(unit, str):
        return ''
    unit = ''.join(unit.replace('\\mu', 'µ').replace('μ', 'µ').split())
    return re.sub(r'/(d|m|µ)?l$', lambda m: '/' + (m[1] or '') + 'L', unit)


def interval(raw):
    number = r'-?\d+(?:\.\d+)?'
    normalized = raw.strip().replace('−', '-').replace('≤', '<=').replace('≥', '>=')
    limit = re.fullmatch(rf'(<=|>=|[<>])\s*({number})', normalized)
    if limit:
        return ' '.join(limit.groups())
    match = re.fullmatch(rf'({number})\s*[-–—]\s*({number})', normalized)
    if match:
        from decimal import Decimal
        if Decimal(match[1]) <= Decimal(match[2]):
            return ' – '.join(match.groups())
    return None


def key_for(source):
    return (source['field_id'], source['component'], unit_key(source['value'].get('unit_raw')))


def entry_key(entry):
    field, component, unit = entry['key']
    return field, component, unit_key(unit)


def library(store):
    profiles, links = {}, {}
    for row in store.db.execute("SELECT payload FROM audit_events WHERE kind='crf_reference_profile' ORDER BY sequence"):
        event = json.loads(row[0])
        if event['entries'] is not None:
            profiles[event['profile']] = event['entries']
        links.update((doc, (event['profile'], profiles[event['profile']])) for doc in event['documents'])
        for name in event.get('archive_profiles', []):
            profiles.pop(name, None)
    return profiles, links


def matched_references(store, workspace):
    _, links = library(store)
    indexes = {}
    for doc, (name, entries) in links.items():
        grouped = defaultdict(list)
        for entry in entries:
            scope = entry.get('source_document_ids')
            if scope is None or doc in scope:
                grouped[entry_key(entry)].append(entry)
        indexes[doc] = name, {key: values[0] for key, values in grouped.items() if len(values) == 1}
    result = {}
    for source in workspace['candidates']:
        if source['kind'] != 'observation' or source.get('prior_ocr') or not source['current_revision']:
            continue
        profile, index = indexes.get(source['document_id'], (None, {}))
        entry = index.get(key_for(source))
        printed = source['value'].get('reference_range_raw')
        if entry and entry['numeric'] and entry['key'][2] and (
                not printed or isinstance(printed, str) and interval(printed) == entry['numeric']):
            result[source['selection_id']] = dict(range=entry['numeric'], profile=profile)
    return result


def candidate_rows(application, workspace):
    fields = {field['field_id']: field['label'] for field in workspace['fields']}
    rows = defaultdict(list)
    for source in workspace['candidates']:
        raw = source['value'].get('reference_range_raw')
        if source['kind'] != 'observation' or not isinstance(raw, str) or not raw.strip():
            continue
        package_key = (source['package_id'], source['revision'])
        bundle = application.bundles.get(package_key)
        if not bundle or not source['evidence_ids']:
            continue
        evidence = next(e for e in bundle[1]['evidence'] if e['evidence_id'] == source['evidence_ids'][0])
        crop = evidence_crop_id(evidence['source_data'])
        key = key_for(source)
        rows[key, raw.strip()].append(dict(document_id=source['document_id'], evidence_id=evidence['evidence_id'],
            url=application.asset_url(package_key, f'artifacts/crops/{crop}.png')))
    counts = defaultdict(int)
    for key, _ in rows:
        counts[key] += 1
    return [dict(id=digest([key, raw, sources]), key=list(key), label=fields[key[0]], raw=raw,
                 numeric=interval(raw), conflict=counts[key]>1, sources=sources)
            for (key, raw), sources in sorted(rows.items())]


def reference_view(application, store, workspace):
    profiles, links = library(store)
    rows = candidate_rows(application, workspace)
    return dict(rows=rows, snapshot=digest([workspace['review_snapshot_sha256'], profiles, links, rows]),
        profiles=[dict(name=name, count=len(entries), entries=entries) for name, entries in sorted(profiles.items())],
        documents=[{**doc, 'profile': links.get(doc['document_id'], (None,))[0]} for doc in workspace['documents']])


def record_references(application, store, workspace, *, profile, documents, selections, snapshot, actor, role):
    reviewer = actor_info(actor, role)
    if role not in HUMAN_ROLES:
        raise ValueError('Cần người dùng xác nhận khoảng tham chiếu.')
    profile = text(profile, 'Tên hồ sơ phòng xét nghiệm')
    if len(profile) > 160 or not isinstance(documents, list) or not isinstance(selections, dict) or len(selections)>500:
        raise ValueError('Hồ sơ khoảng tham chiếu không hợp lệ.')
    view = reference_view(application, store, workspace)
    if snapshot != view['snapshot']:
        raise StalePatient('Khoảng tham chiếu hoặc nguồn đã đổi. Hãy tải lại bảng.')
    valid_docs = {doc['document_id'] for doc in view['documents']}
    if any(not isinstance(doc, str) or doc not in valid_docs for doc in documents) or len(documents)!=len(set(documents)):
        raise ValueError('Chọn các ảnh thuộc hồ sơ hiện tại.')
    previous = next((item['entries'] for item in view['profiles'] if item['name']==profile), None)
    if not selections and (previous is None or not documents):
        raise ValueError('Chọn khoảng đã đối chiếu hoặc áp dụng hồ sơ đã lưu cho ảnh.')
    scoped_entries = [entry for entry in previous or [] if entry.get('source_document_ids') is not None]
    scoped_keys = {entry_key(entry) for entry in scoped_entries}
    entries = {entry_key(entry): entry for entry in previous or [] if entry.get('source_document_ids') is None}
    selected_keys = set()
    candidates = {row['id']: row for row in view['rows']}
    for row_id, raw in selections.items():
        row = candidates.get(row_id)
        if not row or not isinstance(raw, str) or not raw.strip() or len(raw)>200:
            raise ValueError('Khoảng đã chọn không hợp lệ.')
        key = entry_key(row)
        if key in scoped_keys:
            raise ValueError('Mục này có biến thể theo phiếu. Lưu khoảng mới trong hồ sơ riêng để giữ đúng phạm vi áp dụng.')
        if key in selected_keys:
            raise ValueError('Mỗi xét nghiệm và đơn vị chỉ chọn một khoảng trong hồ sơ này.')
        selected_keys.add(key)
        entries[key] = dict(key=row['key'], label=row['label'], raw=raw.strip(),
                            raw_ocr=row['raw'], numeric=interval(raw), sources=row['sources'], reviewer=reviewer, at=now())
    store.registry._audit('crf_reference_profile', dict(profile=profile, documents=documents,
        entries=[*entries.values(), *scoped_entries] if selections else None, reviewer=reviewer, at=now()))
