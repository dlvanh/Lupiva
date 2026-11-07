"""Adapt saved automatic OCR using only its explicit structures and labels."""
import copy
import hashlib
import re

from .layout_context import document_context
from .metadata import DATE_VALUE, LABEL_PATTERN, fold, extract_metadata
from .pipeline import roles, convert_documents
from .rules import key, resolve
from .tables import Table, TableError, parse_tables


def has_result_headers(payload):
    """Recognize explicit result columns anywhere in a saved strict grid."""
    try:
        tables = parse_tables(payload['raw'],payload.get('format','auto'))
    except TableError:
        return False
    for table in tables:
        for start in range(len(table.rows)-1):
            for count in (1,2):
                if start+count>=len(table.rows):
                    continue
                try:
                    roles(Table(table.rows[start:],count).headers,payload.get('context',{}))
                    return True
                except TableError:
                    pass
    return False


def merge_region(target, region, collection):
    """Select one child per explicit parent, retaining parent only as context."""
    rid = region['table_id']
    if any(r['table_id'] == rid for c in ('tables', 'text_regions') for r in target.get(c, [])):
        raise ValueError('Ambiguous repeated OCR region')
    parent = region.get('region', {}).get('layout', {}).get('original_region_id')
    if parent:
        replaced = [r for r in target[collection] if r['table_id'] == parent]
        if len(replaced) != 1 or replaced[0].get('superseded_by'):
            raise ValueError('Refined region must have one selected explicit parent')
        if region.get('truncated') or region.get('generation_status', 'ok') != 'ok':
            child = copy.deepcopy(region)
            child.update(purpose='superseded_context',replacement_rejected_reason='incomplete_retry')
            target[collection].append(child)
            return None
        if collection == 'tables' and has_result_headers(replaced[0]) and not has_result_headers(region):
            child = copy.deepcopy(region)
            child.update(purpose='superseded_context',replacement_rejected_reason='result_header_structure_lost')
            target[collection].append(child)
            return None
        replaced[0].update(purpose='superseded_context', superseded_by=rid)
    target[collection].append(copy.deepcopy(region))
    return parent


def select_metadata_replacement(target, replacements, *, date_order=None, reconsider=False):
    """Replace a header group only when it retains every valid metadata key."""
    new_ids = {r['table_id'] for r in replacements}
    old = [r for r in target['text_regions'] if r['table_id'] not in new_ids
           and r.get('purpose','metadata') == 'metadata']
    def valid_keys(regions):
        if reconsider:
            regions = copy.deepcopy(regions)
            for region in regions:
                region['purpose'] = 'metadata'
        facts, _, _ = extract_metadata(dict(document_id=target['document_id'],
            text_regions=regions,metadata_context={'date_order':date_order}))
        return {f['key'] for f in facts if f['value'] is not None and not f['flags']}
    required, available = valid_keys(old), valid_keys(replacements)
    complete = replacements and all(not r.get('truncated') and r.get('generation_status','ok')=='ok' for r in replacements)
    accepted = bool(complete and required <= available)
    if accepted:
        for region in old:
            region.update(purpose='superseded_context',superseded_by=sorted(new_ids))
        if reconsider:
            for region in replacements:
                region['purpose'] = 'metadata' if LABEL_PATTERN.search(fold(region['raw'])) else 'source_context'
                region.pop('replacement_rejected', None)
    elif not reconsider:
        for region in target['text_regions']:
            if region['table_id'] in new_ids:
                region['purpose']='superseded_context'
                region['replacement_rejected']=True
    return dict(document_id=target['document_id'],accepted=accepted,
                required_keys=sorted(required),available_keys=sorted(available),
                old_region_ids=[r['table_id'] for r in old],new_region_ids=sorted(new_ids))


def select_row_retries(document, catalog):
    """Add a missing result only when a source-linked row retry resolves it.

    Parent results are never replaced by an entire retry grid. All unselected
    raw regions remain available as context, including failed/hallucinated rows.
    """
    regions = {r['table_id']: r for r in document['tables']}
    retries = [r for r in document['tables']
               if r.get('region', {}).get('layout', {}).get('row_parent_region_id')]
    for r in retries:
        r['purpose'] = 'row_retry_context'
    baseline = convert_documents([document], catalog)
    existing = {(o['field_id'], o['component']) for o in baseline['observations']}
    decisions, proposed = [], {}
    for region in retries:
        rid = region['table_id']
        root, seen = region, {rid}
        while root.get('region', {}).get('layout', {}).get('row_parent_region_id'):
            parent = root['region']['layout']['row_parent_region_id']
            if parent in seen or parent not in regions:
                raise ValueError('Row retry requires complete, acyclic source lineage')
            seen.add(parent)
            root = regions[parent]
        trial = copy.deepcopy(document)
        candidate = copy.deepcopy(region)
        candidate['purpose'] = 'result_retry'
        trial['tables'] = [candidate]
        result = convert_documents([trial], catalog)
        items = [o for o in result['observations'] if o['evidence_ids'] and
                 any(e['evidence_id'] in o['evidence_ids'] and e.get('evidence_kind') != 'metadata'
                     for e in result['evidence'])]
        reason = 'retry_not_one_complete_pattern_result'
        if len(items) == 1:
            item = items[0]
            fid, component = item['field_id'], item['component']
            parent_issues = [i for i in baseline['issues']
                if i.get('table_id', '').rsplit('.', 1)[0] == root['table_id']
                and i['reason'] == 'unmapped_test']
            def starts_with_exact_test(name):
                prefixes = [name] + [name[:m.start()] for m in re.finditer(r'\s+',name)]
                return any((rule := resolve(prefix,root.get('context', {}))[0]) and rule['field_id'] == fid
                           for prefix in prefixes)
            corroborated = any(starts_with_exact_test(i.get('name_raw', ''))
                and key(item.get('pattern_raw', '')) in key(' '.join(i.get('row_raw', [])))
                for i in parent_issues) if item.get('pattern_raw') else False
            if (fid, component) in existing:
                reason = 'parent_already_has_field_component'
            elif (item['result_type'] == 'pattern' and item.get('grade_raw') and corroborated
                    and set(item['flags']) <= {'explicit_method_row_continuation'}):
                proposed.setdefault((fid, component), []).append(region)
                reason = 'candidate_for_missing_parent_result'
        decisions.append(dict(region_id=rid,parent_region_id=root['table_id'],accepted=False,reason=reason))
    for identity, candidates in proposed.items():
        # Multiple alternatives need explicit resolution, even if values agree.
        for region in candidates:
            decision = next(d for d in decisions if d['region_id'] == region['table_id'])
            if len(candidates) == 1:
                region['purpose'] = 'result_retry'
                decision.update(accepted=True,reason='missing_parent_pattern_with_source_linked_retry')
            else:
                decision['reason'] = 'multiple_retry_candidates_require_review'
    return decisions


def select_focused_metadata(document, region_ids, keys):
    """Select a complete identifier-band retry without dropping other facts."""
    if not keys or not set(keys) <= {'pid', 'sid'} or len(set(keys)) != len(keys):
        raise ValueError('Focused metadata is restricted to explicit PID/SID labels')
    replacements = [r for r in document['text_regions'] if r['table_id'] in region_ids]
    if {r['table_id'] for r in replacements} != set(region_ids):
        raise ValueError('Missing focused metadata region')
    trial = dict(document, text_regions=copy.deepcopy(replacements))
    facts, _, _ = extract_metadata(trial)
    accepted = bool(replacements) and all(not r.get('truncated') and r.get('generation_status', 'ok') == 'ok'
                                         for r in replacements)
    accepted = accepted and all(len([f for f in facts if f['key'] == k]) == 1
        and all(f['value'] is not None and not f['flags'] for f in facts if f['key'] == k) for k in keys)
    decision = dict(accepted=accepted,keys=keys,new_region_ids=sorted(region_ids),excluded_sources=[])
    for region in document['text_regions']:
        if region['table_id'] in region_ids:
            if not accepted:
                region['purpose'] = 'superseded_context'
            else:
                excluded = set(LABEL_PATTERN.groupindex) - set(keys)
                region['context'] = {**region.get('context', {}), 'metadata_exclude_keys': sorted(excluded)}
        elif accepted and region.get('purpose', 'metadata') == 'metadata':
            region['context'] = {**region.get('context', {}),
                'metadata_exclude_keys': sorted(set(region.get('context', {}).get('metadata_exclude_keys', [])) | set(keys))}
            decision['excluded_sources'].append(region['table_id'])
    return decision


def adapt_document(original, *, date_order=None):
    document = copy.deepcopy(original)
    context = document_context(document)
    document['automatic_context'] = context
    document['metadata_context'] = {'date_order': date_order} if date_order else {}
    for text in document.get('text_regions', []):
        if not LABEL_PATTERN.search(fold(text['raw'])):
            text['purpose'] = 'source_context'
    derived = []
    for payload in document.get('tables', []):
        prior = payload.get('context', {})
        # Context embedded in a refinement manifest predates its OCR. Re-read
        # selected source headings/legends; do not revive a superseded legend.
        inferred_keys = {'panel', 'specimen', 'class_legend', 'intensity_ranges',
                         'ocr_context_evidence', 'context_conflicts'}
        payload['context'] = {**{k: v for k, v in prior.items() if k not in inferred_keys}, **context}
        payload['automatic_context'] = True
        if payload.get('truncated') or payload.get('generation_status', 'ok') != 'ok':
            continue
        try:
            tables = parse_tables(payload['raw'], payload.get('format', 'auto'))
        except TableError:
            continue
        if len(tables) != 1:
            continue
        table = tables[0]
        if [fold(c.strip()) for c in table.rows[0]] == ['class', 'intensity', 'explanation']:
            payload['purpose'] = 'source_legend'
            continue
        metadata_lines, origins = [], []
        for row_index, row in enumerate(table.rows):
            # Collapse only adjacent repetitions produced by explicit cell spans.
            cells = []
            for col_index, cell in enumerate(row):
                if cell.strip() and (not cells or cell.strip() != cells[-1][1]):
                    cells.append((col_index, cell.strip()))
            for index, (col_index, cell) in enumerate(cells):
                if not LABEL_PATTERN.search(fold(cell)):
                    continue
                value = cell
                used_cols = [col_index]
                if cell.rstrip().endswith(':') and index + 1 < len(cells):
                    value += ' ' + cells[index + 1][1]
                    used_cols.append(cells[index + 1][0])
                metadata_lines.append(value)
                origins.append(dict(parent_row_0based=row_index, parent_columns_0based=used_cols))
            if context.get('panel') == 'pft':
                dates = [(col, cell) for col, cell in cells if re.fullmatch(r'\d{1,2}/\d{1,2}/\d{4}', cell)]
                clocks = [(col, cell) for col, cell in cells if re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?', cell, re.I)]
                if len(dates) == len(clocks) == 1:
                    metadata_lines.append(dates[0][1] + ' ' + clocks[0][1])
                    origins.append(dict(parent_row_0based=row_index,
                                        parent_columns_0based=[dates[0][0], clocks[0][0]]))
        if metadata_lines:
            raw = payload['raw']
            derived.append(dict(table_id=payload['table_id'] + '-metadata', raw='\n'.join(metadata_lines),
                format='text', purpose='metadata', generation_status='ok', truncated=False,
                crop_source_id=payload['table_id'], region=payload.get('region'),
                context=dict(date_order=date_order, unlabelled_datetime_role='measurement_date' if context.get('panel') == 'pft' else None),
                derivation=dict(method='explicit_table_metadata_cells', parent_table_id=payload['table_id'],
                    parent_raw_sha256=hashlib.sha256(raw.encode()).hexdigest(), source_cells=origins)))
        candidates = []
        for row_start in range(len(table.rows) - 1):
            for header_rows in (1, 2):
                if row_start + header_rows >= len(table.rows):
                    continue
                candidate = Table(table.rows[row_start:], header_rows)
                try:
                    roles(candidate.headers, payload['context'])
                except TableError:
                    continue
                candidates.append((row_start, header_rows))
        if candidates:
            start, header_rows = min(candidates, key=lambda pair: (pair[0], pair[1]))
            payload.update(row_start=start, header_rows=header_rows,
                           header_selection_method='explicit_column_roles_in_saved_grid')
    document.setdefault('text_regions', []).extend(derived)
    return document
