"""Explicit source statements and selected lab rows outside the Word catalog.

No clinical inference: source diagnoses keep their wording and uncertainty;
technical controls, annotations, questions and empty cells are not results.
"""
import hashlib
import json
import re

from .metadata import LABEL_PATTERN, fold, metadata_response_flags, select_source_date
from .tables import Table, parse_tables, TableError
from .layout_context import round_class_reading, round_symbol_agreement


SOURCE_LABELS = {
    'source_diagnosis': r'\b(?:chan\s+doan|diagnosis)',
    'ordering_provider': r'\b(?:nguoi\s+chi\s+dinh|ordering\s+(?:provider|physician))',
    'specimen_collector': r'\b(?:nguoi\s+lay\s+mau|specimen\s+collector)',
}
LABEL = re.compile('|'.join(rf'(?P<{k}>{v})\s*:' for k, v in SOURCE_LABELS.items()))
BOUNDARY = re.compile(LABEL.pattern + '|' + LABEL_PATTERN.pattern +
    r'|\b(?:passport|cmt|khoa|dien\s+thoai|nguoi\s+nhan\s+mau|gio\s+nghin\s+mau)\s*:')
UNCERTAIN = re.compile(r'\b(?:theo doi|nghi|suspect\w*|possible|rule out)\b')
PFT_EXTRA = {'ic', 'fev3s', 'mef', 'pef', 't0', 'mef25', 'mef50', 'mef75', 'tgv',
             'plvc', 'pivc', 'plfrc', 'pifrc', 'volinsp', 'tlco', 'kco'}
URINE_EXTRA = {'mausac': 'Urine color', 'tinh the': 'Crystals', 'tinh the:': 'Crystals',
    'calciumoxalatemonohydrate': 'Calcium-oxalate monohydrate',
    'calciumoxalatedihydrate': 'Calcium-oxalate dihydrate', 'triplephosphate': 'Triple-phosphate',
    'urate': 'Urate', 'trutronghyalin': 'Hyaline casts', 'trubenhly': 'Pathological casts',
    'bieumothannieuquan': 'Renal / ureteral epithelial cells',
    'bieumobangquangnieudao': 'Bladder / urethral epithelial cells'}


def enrich_sources(documents, observations, metadata, evidence, issues):
    """Append pending candidates; called once on a fresh conversion only."""
    from .pipeline import roles, result_value
    from .rules import key
    urine_names = {key(k):v for k,v in URINE_EXTRA.items()}
    linked = {eid for o in observations for eid in o['evidence_ids']}
    mapped_rows = {(e['document_id'],e['table_id'],e.get('row_index_0based'))
                   for e in evidence if e['evidence_id'] in linked}

    for document in documents:
        did = document['document_id']
        seen = set()
        facts = [m for m in metadata if m['document_id'] == did]
        source_date, date_type, date_eids = select_source_date(facts,
            {'panel': 'pft'} if any(m['key']=='measurement_date' for m in facts) else {})

        def ev(payload, **attributes):
            eid = f'EV{len(evidence) + 1:05d}'
            raw = payload['raw'] if isinstance(payload['raw'],str) else json.dumps(payload['raw'],ensure_ascii=False)
            item = dict(document_id=did,
                input_sha256=document.get('input_sha256'),
                table_sha256=hashlib.sha256(raw.encode('utf-8')).hexdigest(),
                region=payload.get('region'), region_granularity='source_region',
                ocr_confidence=payload.get('ocr_confidence'),
                generation_status=payload.get('generation_status', 'ok'),
                truncated=bool(payload.get('truncated')),
                derivation=payload.get('derivation'), transcription_method=payload.get('transcription_method'),
                **attributes)
            existing = next((e['evidence_id'] for e in evidence if
                             {k:v for k,v in e.items() if k!='evidence_id'}==item),None)
            if existing: return existing
            evidence.append(dict(evidence_id=eid,**item))
            return eid

        def fact(name, value, raw, label, eids, flags=None, **attributes):
            item = dict(candidate_id=f'MD{len(metadata) + 1:05d}', document_id=did, key=name,
                value=value, value_raw=raw, label_raw=label, evidence_ids=eids, flags=flags or [],
                validation_status='needs_review', review_status='pending',
                eligible_for_verified_pool=False, extraction_method='explicit_source_rules', **attributes)
            metadata.append(item)
            return item

        def observation(fid, component, value, raw, name, eids, flags, **attributes):
            observations.append(dict(observation_id=f'OBS{len(observations) + 1:05d}',
                document_id=did, field_id=fid, component=component, name_raw=name, result_raw=raw,
                result_type='qualitative', qualitative_value=value, unit_raw=None, unit_origin='absent',
                panel=None, specimen=None, source_date=None, date_type=None, date_evidence_ids=[],
                evidence_ids=eids, flags=flags, extraction_status='found', validation_status='needs_review',
                review_status='pending', eligible_for_verified_pool=False,
                extraction_method='explicit_source_rules', **attributes))

        for payload in document.get('text_regions', []):
            purpose = payload.get('purpose', 'metadata')
            raw = payload['raw']
            if (payload.get('supplemental_exclude') or purpose not in {'metadata', 'source_context', 'clinical_context', 'clinical_conclusion'}
                    or payload.get('truncated') or payload.get('generation_status', 'ok') != 'ok'
                    or metadata_response_flags(raw)):
                continue
            if purpose == 'clinical_conclusion':
                # This purpose is declared on an actual conclusion crop. It is
                # never guessed from a table heading, graph or free annotation.
                if payload.get('context', {}).get('panel') != 'pft' or not raw.strip() or '?' in raw:
                    continue
                start, end = len(raw) - len(raw.lstrip()), len(raw.rstrip())
                eid = ev(payload, table_id=payload['table_id'], evidence_kind='metadata',
                    raw_span_0based=[start, end], value_raw=raw[start:end], label_raw='PFT conclusion')
                method = payload.get('transcription_method', 'local_ocr')
                fact('pft_conclusion', raw[start:end], raw[start:end], 'PFT conclusion', [eid],
                     ['handwritten_source_requires_review'], transcription_method=method)
                observation('LUNG05', 'detail', raw[start:end], raw[start:end], 'PFT conclusion', [eid],
                            ['source_conclusion_not_clinical_assessment', 'handwritten_source_requires_review'],
                            transcription_method=method)
                continue
            offset = 0
            for line in raw.splitlines(keepends=True):
                normalized = fold(line)
                if len(normalized) != len(line):
                    offset += len(line)
                    continue
                labels = list(BOUNDARY.finditer(normalized))
                for n, match in enumerate(labels):
                    name = match.lastgroup
                    if name not in SOURCE_LABELS:
                        continue
                    stop = labels[n+1].start() if n+1 < len(labels) else len(line)
                    start = match.end()
                    while start < stop and line[start].isspace(): start += 1
                    while stop > start and line[stop-1].isspace(): stop -= 1
                    value = line[start:stop]
                    if not value or '?' in value or (name, value) in seen:
                        continue
                    if name in {'ordering_provider', 'specimen_collector'} and (
                            re.search(r'[\d:]|\b(?:gio|ngay|dien thoai)\b', fold(value)) or len(value)>100):
                        continue
                    seen.add((name, value))
                    flags = ['source_statement_not_confirmed_diagnosis'] if name == 'source_diagnosis' else []
                    uncertainty = bool(UNCERTAIN.search(fold(value))) if name == 'source_diagnosis' else None
                    eid = ev(payload, table_id=payload['table_id'], evidence_kind='metadata',
                        raw_span_0based=[offset+start, offset+stop], value_raw=value,
                        label_raw=line[match.start():match.end()])
                    item = fact(name, value, value, line[match.start():match.end()], [eid], flags,
                                source_uncertain=uncertainty)
                    if name == 'ordering_provider':
                        observation('ADM08', 'result', value, value, item['label_raw'], [eid],
                            ['ordering_provider_role_requires_review'], source_role='ordering_provider',
                            metadata_candidate_id=item['candidate_id'])
                offset += len(line)

        for table_index, payload in enumerate(document.get('tables', [])):
            tid = payload.get('table_id',f'T{table_index+1:03d}')
            if (payload.get('purpose') in {'source_legend', 'superseded_context', 'row_retry_context', 'result_retry'}
                    or payload.get('truncated') or payload.get('generation_status', 'ok') != 'ok'):
                continue
            try:
                tables = parse_tables(payload['raw'], payload.get('format', 'auto'), payload.get('header_rows'))
            except (TableError, ValueError, TypeError):
                continue
            context = {**document.get('context', {}), **payload.get('context', {})}
            for ti, table in enumerate(tables):
                row_offset = payload.get('row_start', 0)
                if row_offset:
                    table = Table(table.rows[row_offset:], payload.get('header_rows') or 1)
                try: columns = roles(table.headers, context)
                except TableError: continue
                for ri, row in enumerate(table.rows[table.header_rows:], table.header_rows):
                    name = row[columns['name']].strip()
                    normalized = key(name)
                    if not name or '?' in name or len(set(row)) == 1:
                        continue
                    def row_evidence():
                        return ev(payload, table_id=f'{tid}.{ti+1}',
                            row_index_0based=ri + row_offset, result_column_0based=columns.get('result', columns.get('intensity')),
                            headers=table.headers, row_raw=row, source_context=context)

                    # ANA method must be explicitly named; an equipment name is not a method.
                    method = re.search(r'(?:bằng\s+kỹ\s+thuật\s+)(huỳnh\s+quang|huyền\s+quang)', name, re.I)
                    if method and ('antiana' in normalized or 'khangthekhangnhan' in normalized):
                        method_value='huỳnh quang'
                        if ('ana_method', method_value) not in seen:
                            seen.add(('ana_method', method_value))
                            flags=['explicit_method_from_test_name']
                            if fold(method[1])=='huyen quang':flags.append('ocr_method_spelling_variant')
                            observation('IMM01', 'method', method_value, method[0], name, [row_evidence()],flags)

                    # Only known unmapped tests are retained; arbitrary failed mappings are issues.
                    if (did,f'{tid}.{ti+1}',ri + row_offset) in mapped_rows:
                        continue
                    canonical = None
                    specimen = context.get('specimen')
                    if context.get('panel') == 'myositis' and re.fullmatch(r'(?:nxp2|oj)(?:\([^)]*\))?', fold(name).replace(' ', '')):
                        canonical = 'NXP2' if normalized.startswith('nxp2') else 'OJ'
                    elif context.get('panel') == 'pft':
                        base = key(name.split('(')[0])
                        if base in PFT_EXTRA: canonical = name
                    elif re.search(r'(?:-|\b)(HCT|MCH|RDW-CV|RDW-SD|MPV|PCT|PDW)$', name, re.I):
                        canonical = re.search(r'(HCT|MCH|RDW-CV|RDW-SD|MPV|PCT|PDW)$', name, re.I)[1].upper()
                    elif normalized in urine_names:
                        # Require explicit urine section in the source table to avoid unrelated colors/casts.
                        if 'nuoctieu' in key(payload['raw']) or 'urine' in fold(payload['raw']):
                            canonical = urine_names[normalized]
                            specimen = 'urine'
                    if canonical is None: continue
                    result = {}
                    slots = [(s, c) for s, c in columns.items() if s in {'pre_measured', 'pre_percent_predicted', 'post_measured', 'post_percent_predicted'}]
                    if not slots: slots = [('intensity' if 'intensity' in columns else 'result', columns.get('intensity', columns.get('result')))]
                    for slot, col in slots:
                        if col is None or not row[col].strip() or re.fullmatch(r'[-–—]+', row[col].strip()): continue
                        result[slot] = row[col].strip()
                    # Printed occurrences retain separate evidence even when
                    # their labels and numbers agree (e.g. repeated PFT rows).
                    # Superseded OCR regions are already excluded above.
                    if not result: continue
                    parsed = {s:result_value(v,'mixed',{**context,'specimen':specimen}) for s,v in result.items()}
                    value = dict(name=canonical, name_raw=name, results=result,
                        parsed_results={s:dict(**v,flags=f) for s,(v,f) in parsed.items()},
                        unit_raw=row[columns['unit']] if 'unit' in columns else (re.search(r'\(([^()]+)\)', name)[1] if context.get('panel')=='pft' and re.search(r'\(([^()]+)\)', name) else None),
                        reference_raw=row[columns['reference']] if 'reference' in columns else None,
                        class_raw=row[columns['class']] if 'class' in columns else None,
                        panel=context.get('panel'), specimen=specimen,
                        source_date=source_date, date_type=date_type, clinical_field_id=None)
                    # Record class normalization only with the source's explicit legend.
                    symbol = value['class_raw']
                    reading = round_class_reading(symbol, parsed.get('intensity', ({},[]))[0], context) if symbol else None
                    if reading: value.update(reading)
                    agreement = round_symbol_agreement(symbol, parsed.get('intensity', ({},[]))[0], context) if symbol else None
                    value['interpretation'] = (agreement['qualitative_value'] if agreement else
                        context.get('class_legend', {}).get(symbol))
                    if agreement: value.update(agreement)
                    eids = [row_evidence(), *date_eids]
                    for source in context.get('ocr_context_evidence', []):
                        if source.get('purpose') != 'printed_class_legend': continue
                        legend = next((t for t in document.get('tables', []) if t.get('table_id')==source['region_id']),None)
                        if legend and hashlib.sha256(legend['raw'].encode('utf-8')).hexdigest()==source['raw_sha256']:
                            eids.append(ev(legend,table_id=legend['table_id'],evidence_kind='metadata',
                                raw_span_0based=[0,len(legend['raw'])],value_raw=legend['raw'],label_raw='Printed class legend'))
                    flags = ['outside_word_catalog']
                    if symbol and not value['interpretation']: flags.append('unresolved_class_symbol')
                    fact('additional_lab_result', value, ' | '.join(result.values()), name, eids, flags)
