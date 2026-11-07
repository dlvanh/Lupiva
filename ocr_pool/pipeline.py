"""Table OCR to candidate observations with field IDs and source evidence.

Standard library only. No network, language model, auto-approval or clinical scoring.
"""
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
import re

from .rules import RULES, VERSION, key, resolve, unit_key
from .tables import Table, TableError, HeaderOnlyTableError, parse_tables
from .metadata import ADM_FIELDS, extract_metadata, select_fact, select_source_date
from .layout_context import round_symbol_agreement

SCHEMA_VERSION = 'lupus-candidate-pool-0.2'
HEADER_ALIASES = {
    'name': ['Chỉ định', 'Tên xét nghiệm', 'Xét nghiệm', 'Chỉ số', 'Antigen', 'Test', 'Parameter'],
    'result': ['Kết quả', 'Result', 'Value'],
    'unit': ['Đơn vị', 'Unit', 'Units'],
    'reference': ['Khoảng tham chiếu', 'Reference', 'Reference range', 'Bình thường'],
    'intensity': ['Intensity'], 'class': ['Class', 'Interpretation', 'Định tính'],
}
QUAL = {
    'negative': 'negative', 'amtinh': 'negative', 'amtinhnegative': 'negative',
    'positive': 'positive', 'duongtinh': 'positive', 'duongtinhpositive': 'positive',
    'borderline': 'borderline', 'strongpositive': 'strong_positive',
}


def roles(headers, context=None):
    result = defaultdict(list)
    for i, h in enumerate(headers):
        for role, aliases in HEADER_ALIASES.items():
            if {key(h), key(h.rsplit(' / ', 1)[-1])} & {key(a) for a in aliases}:
                result[role].append(i)
        hkey = key(h)
        if hkey in ('premeas', 'premeasured', 'measpre', 'measuredpre'):
            result['pre_measured'].append(i)
        elif hkey in ('postmeas', 'postmeasured', 'measpost', 'measuredpost'):
            result['post_measured'].append(i)
        elif hkey in ('prepre', 'prepred', 'prepercentpredicted', 'prepercent', 'pre') and '%' in h:
            result['pre_percent_predicted'].append(i)
        elif hkey in ('postpost', 'postpred', 'postpercentpredicted', 'postpercent', 'post') and '%' in h:
            result['post_percent_predicted'].append(i)
    # Some spirometers intentionally leave the first header blank. Accept this
    # only with explicit PFT context and independently recognised measured and
    # predicted headers; never guess a generic lab table's first column.
    if (not result['name'] and context and context.get('panel') == 'pft'
            and not headers[0].strip() and result['pre_measured']
            and result['pre_percent_predicted']
            and any(key(h) == 'predval' for h in headers)):
        result['name'] = [0]
    if len(result['name']) != 1:
        raise TableError('Need exactly one test-name column')
    if any(len(indices) != 1 for indices in result.values() if indices):
        raise TableError('Duplicate/ambiguous column roles')
    if not any(result[r] for r in ('result', 'intensity', 'pre_measured', 'post_measured')):
        raise TableError('No unambiguous result/measured/intensity column')
    return {r: indices[0] for r, indices in result.items() if indices}


def number(raw, decimal_separator=None):
    value = raw.strip().replace('−', '-')
    match = re.fullmatch(r'([<>]=?|[≤≥])?\s*([+-]?\d+(?:[.,]\d+)?)', value)
    if not match:
        raise ValueError('Invalid or ambiguous numeric text')
    comparator, digits = match.groups()
    if ',' in digits:
        if decimal_separator != ',':
            raise ValueError('Decimal comma requires an explicit source convention')
        digits = digits.replace(',', '.')
    elif '.' in digits and decimal_separator == ',':
        raise ValueError('Mixed decimal conventions in source')
    return {'numeric_value': format(Decimal(digits), 'f'),
            'comparator': {'≤': '<=', '≥': '>='}.get(comparator, comparator or '=')}


def result_value(raw, kind, context):
    value = raw.strip()
    if re.fullmatch(r'-{2,}', value):
        return {'result_type': 'missing', 'numeric_value': None,
                'missing_reason': 'source_placeholder'}, []
    if not value or '⟦UNCLEAR⟧' in value:
        return {'result_type': 'missing', 'numeric_value': None}, ['unreadable_result']
    try:
        return {'result_type': 'numeric', **number(value, context.get('decimal_separator'))}, []
    except ValueError:
        pass
    if kind in ('mixed', 'panel'):
        if key(value) in QUAL:
            return {'result_type': 'qualitative', 'qualitative_value': QUAL[key(value)]}, []
        # Retain independently stated numeric index and qualitative interpretation.
        match = re.fullmatch(r'(.+?)\s*\(([^()]+)\)', value)
        if match and key(match[1]) in QUAL:
            try:
                return {'result_type': 'mixed', 'qualitative_value': QUAL[key(match[1])],
                        **number(match[2], context.get('decimal_separator'))}, []
            except ValueError:
                pass
        if context.get('specimen') == 'urine' and re.fullmatch(r'\(?\+{1,4}\)?', value):
            # Preserve the reported grade; this is not a derived SLEDAI item
            # or a panel-specific positive/borderline interpretation.
            return {'result_type': 'semiquantitative', 'symbolic_value': value}, []
        match = re.fullmatch(r'([<>]=?\s*[+-]?\d+(?:[.,]\d+)?|[+-]?\d+(?:[.,]\d+)?)\s+(.+)', value)
        if match and key(match[2]) in QUAL:
            try:
                return {'result_type': 'mixed', **number(match[1], context.get('decimal_separator')),
                        'qualitative_value': QUAL[key(match[2])]}, []
            except ValueError:
                pass
    if kind == 'pattern':
        pattern = re.fullmatch(r'(Homogeneous|Speckled|Nucleolar|Centromere)(?:\s+([1-4]\+|\+{1,4}))?', value, re.I)
        if pattern:
            return {'result_type': 'pattern', 'pattern_raw': pattern[1],
                    'grade_raw': pattern[2]}, []
    return {'result_type': 'unparsed', 'numeric_value': None}, ['unparsed_result']


def table_context(table, inherited):
    # Only explicit document/region context. Do not infer panel from antigen values.
    return {**inherited, **table.get('context', {})}


def convert_documents(documents, catalog, *, case_id=None):
    fields = catalog['field_catalog']
    field_ids = {f['field_id'] for f in fields}
    supported = {r['field_id'] for r in RULES}
    adm_supported = {fid for fid, _ in ADM_FIELDS.values()}
    supported.update(adm_supported)
    if not supported <= field_ids:
        raise ValueError('Rule refers to field outside Word catalog')
    if len(field_ids) != len(fields):
        raise ValueError('Duplicate field IDs in Word catalog')
    observations, evidence, issues, source_records, metadata_candidates = [], [], [], [], []
    successful_tables = 0
    document_ids = [d['document_id'] for d in documents]
    if len(set(document_ids)) != len(document_ids):
        raise ValueError('Duplicate document IDs')
    for document in documents:
        doc_id = document['document_id']
        facts, metadata_evidence, metadata_issues = extract_metadata(
            document, candidate_offset=len(metadata_candidates), evidence_offset=len(evidence))
        metadata_candidates.extend(facts)
        evidence.extend(metadata_evidence)
        issues.extend(metadata_issues)
        source_records.append({**{k: v for k, v in document.items() if k != 'tables'},
                               'metadata_candidate_ids': [f['candidate_id'] for f in facts],
                               'identity_status': 'unconfirmed'})
        if not document.get('tables') and not document.get('text_regions'):
            issues.append(dict(document_id=doc_id, reason='no_table_regions_processed'))
        for table_index, payload in enumerate(document.get('tables', [])):
            if payload.get('purpose') in {'source_legend', 'superseded_context', 'row_retry_context'}:
                continue
            table_id = payload.get('table_id', f'T{table_index + 1:03d}')
            context = table_context(payload, document.get('context', {}))
            metadata_date, metadata_date_type, date_evidence_ids = select_source_date(facts, context)
            requested_date_key = 'measurement_date' if context.get('panel') == 'pft' else 'sample_date'
            unresolved_metadata_date = any(f['key'] == requested_date_key and (f['flags'] or f['value'] is None) for f in facts)
            date_conflict = bool(metadata_date and context.get('source_date') and
                                 (context['source_date'], context.get('date_type')) != (metadata_date, metadata_date_type))
            date_conflict = date_conflict or bool(context.get('source_date') and unresolved_metadata_date)
            if date_conflict:
                issues.append(dict(document_id=doc_id, table_id=table_id, reason='source_date_conflict'))
                context = {**context, 'source_date': None, 'date_type': None}
                date_evidence_ids = []
            elif metadata_date:
                context = {**context, 'source_date': metadata_date, 'date_type': metadata_date_type}
            raw = payload['raw']
            raw_serialized = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
            raw_hash = hashlib.sha256(raw_serialized.encode('utf-8')).hexdigest()
            if payload.get('truncated') or payload.get('generation_status', 'ok') != 'ok':
                issues.append(dict(document_id=doc_id, table_id=table_id, reason='incomplete_generation'))
                continue
            try:
                tables = parse_tables(raw, payload.get('format', 'auto'), payload.get('header_rows'))
            except HeaderOnlyTableError as error:
                issues.append(dict(document_id=doc_id, table_id=table_id, reason='header_only_no_data_rows', detail=str(error)))
                continue
            except (TableError, TypeError, ValueError) as error:
                issues.append(dict(document_id=doc_id, table_id=table_id, reason='invalid_table_structure', detail=str(error)))
                continue
            for sub_index, table in enumerate(tables):
                row_offset = payload.get('row_start', 0)
                if row_offset:
                    if not isinstance(row_offset, int) or not 0 <= row_offset < len(table.rows) - 1:
                        raise ValueError('Invalid explicit table header start')
                    table = Table(table.rows[row_offset:], payload.get('header_rows') or 1)
                region_table_id = f'{table_id}.{sub_index + 1}'
                try:
                    columns = roles(table.headers, context)
                except TableError as error:
                    issues.append(dict(document_id=doc_id, table_id=region_table_id, reason='invalid_headers', detail=str(error)))
                    continue
                successful_tables += 1
                consumed_rows = set()
                for row_index, row in enumerate(table.rows[table.header_rows:], table.header_rows):
                    if row_index in consumed_rows:
                        continue
                    name = row[columns['name']].strip()
                    # A single cell spanning every column is a section/note,
                    # not an independently stated result. OTSL expansion repeats
                    # its text; never map e.g. a handwritten UPCR label as a value.
                    if name and len(row) > 1 and len(set(row)) == 1:
                        issues.append(dict(document_id=doc_id, table_id=region_table_id,
                                           row=row_index + row_offset, name_raw=name, row_raw=row,
                                           reason='non_result_merged_row'))
                        continue
                    if payload.get('automatic_context'):
                        name_key = key(name)
                        if 'nuoctieu' in name_key or 'urine' in name_key or 'nieu' in name_key:
                            context = {**context, 'specimen': 'urine'}
                    if not name:
                        issues.append(dict(document_id=doc_id, table_id=region_table_id, row=row_index, reason='missing_test_name', row_raw=row))
                        continue
                    rule, candidates = resolve(name, context)
                    if not rule:
                        issues.append(dict(document_id=doc_id, table_id=region_table_id, row=row_index,
                                           name_raw=name, row_raw=row, candidate_field_ids=candidates,
                                           reason='ambiguous_mapping' if candidates else 'unmapped_test'))
                        continue
                    slots = [(r, col) for r, col in columns.items() if r in ('pre_measured', 'post_measured',
                                                                                  'pre_percent_predicted', 'post_percent_predicted')]
                    if not slots:
                        slots = [('intensity' if 'intensity' in columns else 'result', columns.get('intensity', columns.get('result'))) ]
                    for slot, column in slots:
                        value = row[column]
                        parsed, flags = result_value(value, 'numeric' if slot == 'intensity' else rule['kind'], context)
                        continuation = None
                        if (rule['kind'] == 'pattern' and parsed['result_type'] == 'pattern'
                                and row_index + 1 < len(table.rows)):
                            following = table.rows[row_index + 1]
                            method = following[columns['name']].strip()
                            grade = following[column].strip()
                            if (key(method) in {'bangkythuathuynhquang', 'bangkythuathuyenquang'}
                                    and re.fullmatch(r'[1-4]\+|\+{1,4}', grade)
                                    and all(not cell.strip() for i, cell in enumerate(following)
                                            if i not in {columns['name'], column})):
                                if parsed.get('grade_raw') and parsed['grade_raw'] != grade:
                                    flags.append('conflicting_continuation_grade')
                                else:
                                    parsed['grade_raw'] = grade
                                    parsed['method_raw'] = method
                                    flags.append('explicit_method_row_continuation')
                                continuation = following
                                consumed_rows.add(row_index + 1)
                        if date_conflict:
                            flags.append('source_date_conflict')
                        unit_raw = row[columns['unit']].strip() if 'unit' in columns else ''
                        inferred_unit = None
                        if context.get('panel') == 'pft':
                            # Units can be stated explicitly in the name cell.
                            matches = re.findall(r'\(([^()]+)\)', name)
                            inferred_unit = next((m for m in matches if unit_key(m) in rule['units']), None)
                            if slot.endswith('percent_predicted'):
                                inferred_unit = '%' if '%' in table.headers[column] else None
                        if not unit_raw and inferred_unit:
                            unit_raw = inferred_unit
                        if rule['units'] and slot not in ('intensity',) and parsed['result_type'] in ('numeric', 'mixed'):
                            allowed_units = {'%'} if slot.endswith('percent_predicted') else rule['units']
                            if not unit_raw:
                                flags.append('missing_unit')
                            elif unit_key(unit_raw) not in allowed_units:
                                flags.append('unit_mismatch')
                        if rule['field_id'].startswith('HEM') and rule['field_id'] in {f'HEM{i:02d}' for i in range(6, 11)}:
                            slot = 'percentage' if unit_raw == '%' else 'absolute_count'
                        attributes = {}
                        if rule['kind'] == 'panel':
                            attributes['intensity_raw'] = value if slot == 'intensity' else None
                            if slot == 'intensity' and parsed.get('comparator') != '=':
                                flags.append('invalid_intensity_comparator')
                            class_raw = row[columns['class']].strip() if 'class' in columns else ''
                            attributes['class_raw'] = class_raw or None
                            if class_raw:
                                # Symbol meanings must come from an explicit per-source legend.
                                interpretation = context.get('class_legend', {}).get(class_raw)
                                if interpretation is None and class_raw in ('o', 'O'):
                                    # Only letter-case variants of the stated round symbol;
                                    # digit variants require independent source corroboration.
                                    interpretation = context.get('class_legend', {}).get(class_raw.swapcase())
                                if interpretation is None:
                                    agreement = round_symbol_agreement(class_raw, parsed, context)
                                    if agreement:
                                        attributes.update(agreement)
                                        interpretation = agreement['qualitative_value']
                                        flags.append('class_symbol_ocr_variant')
                                if interpretation is None:
                                    interpretation = QUAL.get(key(class_raw))
                                if interpretation in set(QUAL.values()):
                                    attributes['qualitative_value'] = interpretation
                                else:
                                    flags.append('unresolved_class_symbol')
                                source_range = context.get('intensity_ranges', {}).get(class_raw)
                                if source_range and parsed.get('numeric_value') is not None:
                                    intensity = Decimal(parsed['numeric_value'])
                                    if not (Decimal(str(source_range[0])) <= intensity <= Decimal(str(source_range[1]))):
                                        flags.append('intensity_class_mismatch')
                            elif parsed['result_type'] == 'numeric':
                                flags.append('missing_panel_interpretation')
                        if context.get('source_date') and not context.get('date_type'):
                            flags.append('missing_date_type')
                        if context.get('source_date'):
                            try:
                                datetime.fromisoformat(context['source_date'])
                            except (ValueError, TypeError):
                                flags.append('invalid_source_date')
                        observation_id = f'OBS{len(observations) + 1:05d}'
                        evidence_id = f'EV{len(evidence) + 1:05d}'
                        evidence.append(dict(evidence_id=evidence_id, document_id=doc_id,
                                             input_sha256=document.get('input_sha256'),
                                             table_id=region_table_id, row_index_0based=row_index + row_offset,
                                             result_column_0based=column, headers=table.headers,
                                             row_raw=row, table_sha256=raw_hash, source_context=context,
                                             region=payload.get('region'), region_granularity='table' if payload.get('region') else 'unavailable'))
                        result_evidence_ids = [evidence_id]
                        if continuation is not None:
                            continuation_id = f'EV{len(evidence) + 1:05d}'
                            evidence.append(dict(evidence_id=continuation_id, document_id=doc_id,
                                input_sha256=document.get('input_sha256'), table_id=region_table_id,
                                row_index_0based=row_index + row_offset + 1, result_column_0based=column,
                                headers=table.headers, row_raw=continuation, table_sha256=raw_hash,
                                source_context=context, region=payload.get('region'),
                                region_granularity='table' if payload.get('region') else 'unavailable',
                                evidence_role='explicit_method_and_grade_continuation'))
                            result_evidence_ids.append(continuation_id)
                        observations.append(dict(
                            observation_id=observation_id, field_id=rule['field_id'],
                            document_id=doc_id, name_raw=name, result_raw=value, unit_raw=unit_raw or None,
                            unit_origin='name_cell' if inferred_unit and 'unit' not in columns else 'unit_cell' if unit_raw else 'absent',
                            reference_range_raw=row[columns['reference']] if 'reference' in columns else None,
                            component=slot, panel=context.get('panel'), specimen=context.get('specimen'),
                            source_date=context.get('source_date'), date_type=context.get('date_type'),
                            **parsed, **attributes, flags=flags, evidence_ids=[*result_evidence_ids, *date_evidence_ids],
                            date_evidence_ids=list(date_evidence_ids),
                            extraction_status='not_found' if parsed.get('missing_reason') == 'source_placeholder' else
                                              'unreadable' if parsed['result_type'] in ('unparsed', 'missing') else 'found',
                            validation_status='needs_review' if flags else 'structure_checks_passed',
                            review_status='pending', eligible_for_verified_pool=False,
                        ))
        # Only explicitly printed ADM values. Never derive age/BMI or use PID as Study ID.
        adm_date, adm_date_type, adm_date_evidence = select_source_date(
            facts, {'panel': 'pft'} if select_fact(facts, 'measurement_date') else {})
        for adm_key, (fid, unit) in ADM_FIELDS.items():
            fact = select_fact(facts, adm_key)
            if not fact:
                continue
            result = ({'result_type': 'qualitative', 'qualitative_value': fact['value']}
                      if adm_key == 'sex' else {'result_type': 'numeric', 'numeric_value': fact['value'], 'comparator': '='})
            observations.append(dict(observation_id=f'OBS{len(observations) + 1:05d}',
                                     field_id=fid, document_id=doc_id, name_raw=fact['label_raw'],
                                     result_raw=fact['value_raw'], unit_raw=unit, unit_origin='label' if unit else 'absent',
                                     component='result', panel=None, specimen=None,
                                     source_date=adm_date, date_type=adm_date_type,
                                     **result, flags=[], evidence_ids=list(dict.fromkeys(fact['evidence_ids'] + adm_date_evidence)),
                                     date_evidence_ids=list(adm_date_evidence), metadata_candidate_id=fact['candidate_id'],
                                     extraction_status='found', validation_status='structure_checks_passed',
                                     review_status='pending', eligible_for_verified_pool=False))
    by_field = defaultdict(list)
    for observation in observations:
        by_field[observation['field_id']].append(observation)
    pool_fields = {}
    for field in fields:
        fid = field['field_id']
        items = by_field[fid]
        if items:
            status = ('found' if any(o['extraction_status'] == 'found' for o in items) else
                      'unreadable' if any(o['extraction_status'] == 'unreadable' for o in items) else 'not_found')
        else:
            # A failed region or unresolved row may contain a missing target.
            # Do not turn incomplete processing into a claim of absence.
            status = 'not_found' if fid in supported and successful_tables and not issues else 'not_processed'
            if fid in adm_supported:
                status = 'not_processed'
        related_issues = [i for i in issues if fid in i.get('candidate_field_ids', [])]
        if related_issues and not items:
            status = 'ambiguous_mapping'
        pool_fields[fid] = dict(label=field['label'], extraction_status=status,
                                observation_ids=[o['observation_id'] for o in items],
                                scope='processed_table_and_metadata_regions_only',
                                review_status='pending' if items else 'not_reviewed',
                                reason='parser_not_implemented_for_field' if fid not in supported else None)
    package = dict(schema_version=SCHEMA_VERSION, dictionary_version=VERSION,
                   catalog_version=catalog.get('contract_version'),
                   catalog_template_sha256=catalog.get('template_sha256'),
                   created_at_utc=datetime.now(timezone.utc).isoformat(), case_id=case_id,
                   identity_status='unconfirmed', pool_stage='candidate',
                   source_documents=source_records, fields=pool_fields,
                   observations=observations, metadata_candidates=metadata_candidates, evidence=evidence, issues=issues,
                   processing_scope='explicit_table_and_metadata_regions_only',
                   processing_status='partial' if issues else 'ok',
                   summary=dict(successful_tables=successful_tables, observations=len(observations),
                                mapped_fields=len({o['field_id'] for o in observations}), issue_count=len(issues),
                                metadata_candidates=len(metadata_candidates),
                                observations_with_source_date=sum(bool(o.get('source_date')) for o in observations),
                                verified_observations=0, ocr_accuracy_evaluated=False))
    validate_package(package, field_ids)
    return package


def validate_package(package, field_ids):
    if set(package['fields']) != field_ids:
        raise ValueError('Pool must account for the entire Word field catalog')
    observations = {o['observation_id']: o for o in package['observations']}
    evidence = {e['evidence_id']: e for e in package['evidence']}
    if len(observations) != len(package['observations']) or len(evidence) != len(package['evidence']):
        raise ValueError('Duplicate observation/evidence ID')
    for fid, field in package['fields'].items():
        for oid in field['observation_ids']:
            if oid not in observations or observations[oid]['field_id'] != fid:
                raise ValueError('Broken field-observation relation')
    for observation in observations.values():
        if observation['field_id'] not in field_ids or not observation['evidence_ids']:
            raise ValueError('Observation missing field/source')
        if any(eid not in evidence for eid in observation['evidence_ids']):
            raise ValueError('Broken evidence relation')
        if any(evidence[eid]['document_id'] != observation['document_id'] for eid in observation['evidence_ids']):
            raise ValueError('Observation evidence belongs to a different document')
        if observation['review_status'] != 'pending' or observation['eligible_for_verified_pool']:
            raise ValueError('Parser cannot approve its own OCR output')
        for eid in observation.get('date_evidence_ids', []):
            if eid not in observation['evidence_ids'] or evidence[eid]['document_id'] != observation['document_id']:
                raise ValueError('Source date must have evidence in the same document')
    document_ids = {d['document_id'] for d in package['source_documents']}
    candidates = package.get('metadata_candidates', [])
    if len({c['candidate_id'] for c in candidates}) != len(candidates):
        raise ValueError('Duplicate metadata candidate ID')
    for candidate in candidates:
        if candidate['document_id'] not in document_ids or not candidate['evidence_ids']:
            raise ValueError('Metadata missing document/source')
        if any(eid not in evidence or evidence[eid]['document_id'] != candidate['document_id'] for eid in candidate['evidence_ids']):
            raise ValueError('Broken metadata evidence relation')
        if candidate['review_status'] != 'pending' or candidate['eligible_for_verified_pool']:
            raise ValueError('Parser cannot approve metadata')
    for observation in observations.values():
        if observation.get('date_evidence_ids') and not any(
                c['document_id'] == observation['document_id'] and c['key'] == observation['date_type']
                and c['value'] == observation['source_date'] and not c['flags']
                and set(c['evidence_ids']) & set(observation['date_evidence_ids']) for c in candidates):
            raise ValueError('Propagated date does not match an unambiguous metadata candidate')
