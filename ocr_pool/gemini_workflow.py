"""Reviewed image regions -> Gemini -> immutable pending review bundle."""
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import re
import time

from PIL import Image
from form_pool.sample_collection import extract_sample_collections, HEADERS
from registry_pool.exchange import build_bundle
from .catalog_alias import CatalogAliases
from .gemini import InvalidAPIResponse, configuration, privacy_plan, prepare_image, extract_image
from .lab_api import extract_lab_image, lab_crop_evidence
from .outgoing_gate import check_outgoing
from .ocr_crosscheck import number_disagreements
from .lab_reference_cells import attach_complement_ranges
from .llm_extraction import VERSION as LLM_CONTRACT_VERSION, valid_row_box
from .local_dates import local_date_evidence, local_metadata_evidence, observation_date, scan_source_dates, unmasked_crop_lines
from .mixed_lab import extract_split_lab, fluorescence_split
from .pft_api import extract_pft_image, pft_crop_evidence
from .result_rules import load_result_rules
from .metadata import ADM_FIELDS, fold, select_fact
from .workflow import write


INTENSITY_CLASS = {'negative': 0, 'am tinh': 0, 'borderline': 1, 'positive': 2, 'duong tinh': 2}


def _intensity_class_outliers(rows):
    """Row indexes whose printed number contradicts the class order of most rows on the same page.

    Line-blot pages print "<intensity> <class>"; on one page a higher class never
    has a lower intensity. A row that conflicts with most of the others is
    probably misread (e.g. "10 Borderline" returned as "0 Borderline"). The
    value is kept; the flag only directs the reviewer to the source cell.
    """
    graded = []
    for n, row in enumerate(rows):
        grade = INTENSITY_CLASS.get(fold(str(row.get('qualitative_value') or '')).strip())
        try:
            number = float(str(row.get('numeric_value')))
        except ValueError:
            continue
        if grade is not None and row.get('component', 'result') == 'result':
            graded.append((n, grade, number))
    outliers = set()
    for n, grade, number in graded:
        others = [(g, x) for m, g, x in graded if m != n and g != grade]
        conflicts = sum((g < grade and x > number) or (g > grade and x < number) for g, x in others)
        if len(others) >= 3 and conflicts * 2 > len(others):
            outliers.add(n)
    return outliers


def _cell(value): return str(value or '').replace('\t', ' ').replace('\r', ' ').replace('\n', ' ')


def echo_pericardial_finding(scan, privacy):
    """Read the explicit result in the pericardium section of a recognized echo."""
    if not scan or scan['plan']['crop_reason'] != 'detected_echo_report_sections':
        return None
    section = re.compile(r'^12\.\s*mang\s+ngo(?:a)?i\s+tim\s*:')
    matches = [line for line in unmasked_crop_lines(scan, privacy)
               if section.match(fold(line['text']).strip())]
    if len(matches) != 1 or matches[0].get('confidence', 0) < .90:
        return None
    line = matches[0]
    label, _, raw = line['text'].strip().partition(':')
    # Match only explicit statements. A general finding or a blank is ambiguous.
    value = fold(raw).strip().rstrip('.').strip()
    if re.fullmatch(r'(?:khong [^/]+/\s*)?khong (?:co dich|tran dich mang ngoai tim)', value):
        choice = 'no'
    elif re.fullmatch(r'(?:co dich|tran dich mang ngoai tim)', value):
        choice = 'yes'
    else:
        return None
    return local_report_row('CV06', label, raw, choice, line, privacy)


def _chest_ct_lines(scan, privacy):
    """Recognize a chest CT from its visible technique and impression headings."""
    if not scan or scan['plan']['crop_reason'] != 'detected_diagnostic_report_sections':
        return None
    lines = sorted(unmasked_crop_lines(scan, privacy), key=lambda line: line['box'][1])
    headings = [fold(line['text']).strip() for line in lines]
    technique = [i for i, text in enumerate(headings) if re.match(r'^ky\s+thuat\s*:', text)]
    impression = [i for i, text in enumerate(headings) if re.match(r'^ket\s+luan\s*:', text)]
    if len(technique) != 1 or len(impression) != 1 or technique[0] >= impression[0]:
        return None
    start, end = technique[0], impression[0]
    chest_ct = r'\b(?:chup\s+clvt|chup\s+cat\s+lop\s+vi\s+tinh)\s+long\s+nguc\b'
    if not any(re.search(chest_ct, text) for text in headings[start:min(start+2,end)]):
        return None
    return lines, end


def ct_ild_finding(scan, privacy):
    """Carry the explicit chest CT impression into review without inferring a diagnosis."""
    recognized = _chest_ct_lines(scan, privacy)
    if not recognized:
        return None
    lines, end = recognized
    label, _, inline = lines[end]['text'].strip().partition(':')
    # Match a complete, single-line impression so nearby qualifiers cannot be lost.
    if inline.strip() and end+1 == len(lines):
        raw, line = inline.strip(), lines[end]
    elif not inline.strip() and end+2 == len(lines):
        line = lines[end+1]
        raw = line['text'].strip()
    else:
        return None
    text = fold(raw).rstrip('.').strip()
    if line.get('confidence', 0) < .90:
        return None
    if re.fullmatch(r'khong thay ton th(?:uo|uro)ng goi y b(?:e)?nh phoi k(?:e)? tren phim', text):
        return local_report_row('LUNG02', label, raw, 'no', line, privacy)
    return None


def pleural_effusion_finding(scan, privacy):
    """Read one explicit pleural effusion statement from a recognized CT or echo."""
    if not scan:
        return None
    echo = scan['plan']['crop_reason'] == 'detected_echo_report_sections'
    if not echo and not _chest_ct_lines(scan, privacy):
        return None
    # Tolerate a dropped vowel, as in the CT impression matcher, but require
    # the complete pleural phrase and a complete, unqualified statement.
    pleura = r'(?:khoang\s+)?m(?:a)?ng\s+ph(?:o)?i'
    matches = [line for line in unmasked_crop_lines(scan, privacy)
               if re.search(pleura, fold(line['text']))]
    if len(matches) != 1 or matches[0].get('confidence', 0) < .90:
        return None
    line = matches[0]
    raw = line['text'].strip()
    label = 'Màng phổi'
    text = fold(raw).strip()
    outside_heart = re.match(r'^(?:\d+\.\s*)?ngo(?:a)?i\s+tim\s*:', text) if echo else None
    if outside_heart:
        label, _, raw = raw.partition(':')
        text = fold(raw).strip()
    text = text.rstrip('.').strip()
    if len(re.findall(pleura, text)) != 1 or re.search(r'\b(?:nghi|it|khong\s+loai\s+tru)\b', text):
        return None
    negative = r'khong\s+(?:thay\s+)?(?:co\s+)?tran\s+dich(?:,?\s+tran\s+khi)?\s+' + pleura + r'(?:\s+hai\s+ben)?'
    if outside_heart:
        negative += r'(?:,\s*[^,]+(?:,\s*[^,]+)*)?'
    if re.fullmatch(negative, text):
        choice = 'no'
    elif re.fullmatch(r'(?:co\s+)?tran\s+dich\s+' + pleura + r'(?:\s+hai\s+ben)?', text):
        choice = 'yes'
    else:
        return None
    return local_report_row('LUNG04', label, raw, choice, line, privacy)


def local_report_row(field, label, raw, choice, line, privacy):
    left, top, right, bottom = privacy['crop']
    x0,y0,x1,y1 = line['box']
    box = [round(1000*(x0-left)/(right-left)), round(1000*(y0-top)/(bottom-top)),
           round(1000*(x1-left)/(right-left)), round(1000*(y1-top)/(bottom-top))]
    return dict(field_id=field, component='result', source_label=label, raw_result=raw.strip(),
                qualitative_value=choice, table_kind='other', row_box=box)


def _comparator_literal(row):
    """Recover the number when the printed cell is only a comparator and a number (e.g. '<10')."""
    if row.get('numeric_value') is not None or row.get('qualitative_value'):
        return None
    match = re.fullmatch(r'\s*(<=|>=|≤|≥|<|>|=)?\s*(\d+(?:[.,]\d+)?)\s*', str(row.get('raw_result') or ''))
    if not match or (row.get('comparator') not in (None, '=') and match[1] is None):
        return None
    comparator = {'≤': '<=', '≥': '>='}.get(match[1], match[1]) or row.get('comparator') or '='
    if row.get('comparator') not in (None, comparator):
        return None
    return dict(numeric_value=match[2].replace(',', '.'), comparator=comparator)


def _value(row):
    value = {k: row.get(k) for k in ('numeric_value', 'comparator', 'unit_raw', 'qualitative_value',
        'pattern_raw', 'grade_raw', 'titre_raw', 'class_raw', 'source_flag_raw', 'grade_annotation',
        'reference_range_raw')}
    number = value['numeric_value']
    if number is not None:
        valid = isinstance(number, str) and re.fullmatch(r'[+-]?\d+(?:\.\d+)?', number)
        if not valid or value['comparator'] not in ('=', '<', '<=', '>', '>='):
            value.update(numeric_value=None, comparator=None, result_type='unparsed')
            return value
        value['result_type'] = 'mixed' if value['qualitative_value'] else 'numeric'
    else:
        value['result_type'] = 'pattern' if value['pattern_raw'] else 'qualitative' if value['qualitative_value'] else 'unparsed'
    return value


def build_candidate(documents, results, dictionary, run, *, local_dates=None, local_metadata=None, engine='gemini'):
    extraction_method = engine+'_api'
    extraction_flag = extraction_method+'_extraction'
    if len(documents)!=len(results):raise ValueError('Gemini results do not cover this submission')
    run = Path(run); (run/'raw').mkdir(parents=True, exist_ok=True); (run/'crops').mkdir(exist_ok=True)
    observations, metadata, evidence, issues, specimens = [], [], [], [], []
    definitions = {f['field_id']: f for f in dictionary['fields']}
    aliases = CatalogAliases(dictionary)
    pending = dict(review_status='pending', eligible_for_verified_pool=False)
    local_dates = local_dates or {}
    local_metadata = local_metadata or {}

    def add_administrative_observations(doc, facts, date_facts):
        # A sex label repeated in laboratory headers is source metadata. Map
        # it to the CRF only on a profile that also prints an anthropometric
        # administrative measurement, avoiding repeated ADM03 observations.
        if not any(select_fact(facts, key) for key in ('age', 'height', 'weight')):
            return
        source_date = observation_date(date_facts, 'pft')
        for key, (field_id, unit) in ADM_FIELDS.items():
            fact = select_fact(facts, key)
            if not fact:
                continue
            values = (dict(result_type='qualitative', qualitative_value=fact['value']) if key == 'sex' else
                      dict(result_type='numeric', numeric_value=fact['value'], comparator='='))
            observations.append(dict(observation_id='GOBS'+str(len(observations)).zfill(6),
                field_id=field_id, component='result', document_id=doc['document_id'],
                name_raw=fact['label_raw'], result_raw=fact['value_raw'], unit_raw=unit,
                panel=None, specimen=None, source_date=source_date['value'] if source_date else None,
                date_type=source_date['key'] if source_date else None,
                evidence_ids=list(dict.fromkeys(fact['evidence_ids'] + (source_date['evidence_ids'] if source_date else []))),
                date_evidence_ids=source_date['evidence_ids'] if source_date else [],
                metadata_candidate_id=fact['candidate_id'], extraction_status='found',
                validation_status='needs_review' if fact['flags'] else 'structure_checks_passed',
                extraction_method='local_ocr', flags=list(fact['flags']), **pending, **values))

    for index, (doc, result) in enumerate(zip(documents, results)):
        did = doc['document_id']; tid = 'G'+str(index).zfill(4)
        date_facts, date_evidence = local_dates.get(did, ([], []))
        background_facts, background_evidence = local_metadata.get(did, ([], []))
        metadata.extend(date_facts)
        evidence.extend(date_evidence)
        metadata.extend(background_facts)
        evidence.extend(background_evidence)
        add_administrative_observations(doc, background_facts, date_facts)
        if result is None: continue
        raw_source = result['raw_extraction']
        if result.get('verification', {}).get('attempted'):
            raw_source = dict(initial_extraction=result['raw_extraction'],
                              verified_extraction=result.get('verified_raw_extraction'),
                              verification=result['verification'])
        local_findings = list(result.get('local_report_findings') or [])
        legacy_finding = result.get('local_report_finding')
        if legacy_finding and legacy_finding not in local_findings:
            local_findings.append(legacy_finding)
        if local_findings:
            raw_source = dict(api_extraction=raw_source, local_report_findings=local_findings)
        raw = json.dumps(raw_source, ensure_ascii=False, indent=2)
        (run/'raw'/(tid+'.txt')).write_text(raw, encoding='utf-8')
        with Image.open(io.BytesIO(result['outgoing_bytes'])) as crop:
            image_size = list(crop.size)
            crop.save(run/'crops'/(tid+'.png'))
        literal_rules = {change['row_index']: change['rule'] for change in result.get('normalization_audit', [])
                         if change['reason'] == 'literal_result_from_source_cell'}
        def ev(number, row):
            eid = 'GEV'+str(len(evidence)).zfill(6)
            evidence.append(dict(evidence_id=eid, document_id=did, input_sha256=doc['input_sha256'],
                evidence_kind='gemini_result', table_id=tid+'.result', row_index_0based=number,
                row_raw=[_cell(row.get('source_label')), _cell(row.get('raw_result'))],
                table_sha256=hashlib.sha256(raw.encode('utf-8')).hexdigest(),
                region=dict(privacy_crop=doc['privacy']['crop'], privacy_masks=doc['privacy'].get('masks', []),
                    privacy_mask_polygons=doc['privacy'].get('mask_polygons', [])),
                region_granularity='reviewed_result_region', generation_status='ok', truncated=False,
                extraction_method=extraction_method, model_requested=result.get('model_requested'),
                model_returned=result.get('model_returned'), outgoing_sha256=result['outgoing_sha256']))
            if number in literal_rules:
                evidence[-1]['result_literal_rule'] = literal_rules[number]
            profile = result.get('request_contract', {}).get('profile')
            if profile:
                evidence[-1]['api_profile'] = profile
            if doc['privacy'].get('transform_manifest'):
                evidence[-1]['region']['transform_manifest'] = doc['privacy']['transform_manifest']
            if valid_row_box(row.get('row_box')):
                evidence[-1]['region']['llm_row_location'] = {
                    'box': row['row_box'], 'image_size': image_size, 'coordinate_space': 'outgoing_image_1000',
                }
            return eid
        rows = result['extraction']['rows']
        class_outliers = _intensity_class_outliers(rows)
        ocr_disagreements = set(result.get('ocr_number_disagreements', []))
        for n, row in enumerate(rows + local_findings):
            literal = _comparator_literal(row)
            if literal:
                row = dict(row, **literal)
            value = _value(row)
            field = row.get('field_id'); component = row['component']
            panel_mismatch = n < len(rows) and aliases.panel_mismatch(row)
            if panel_mismatch:
                field = None
            alias_mapping = (aliases.match(dict(row, field_id=None) if panel_mismatch else row, result['extraction'])
                             if n < len(rows) else None)
            if alias_mapping:
                field, component = alias_mapping
            allowed = {c['component_id'] for c in definitions.get(field, {}).get('components', [])}
            value_keys = ('numeric_value', 'qualitative_value', 'pattern_raw', 'grade_raw', 'titre_raw', 'class_raw')
            has_value = any(value.get(key) is not None and str(value[key]).strip() for key in value_keys)
            has_secondary = any(_value(dict(numeric_value=row.get(key), comparator='='))['numeric_value'] is not None
                                for key in ('pre_percent_predicted', 'post_percent_predicted'))
            if (n < len(rows) and not (field in definitions and component in allowed)
                    and not _cell(row.get('raw_result')).strip() and not has_value and not has_secondary):
                issues.append(dict(document_id=did, table_id=tid, reason='empty_api_row_dropped',
                                   detail=row.get('source_label')))
                continue
            eid = ev(n, row)
            flags = [extraction_flag] + [i['code'] for i in result['validation_issues'] if i['row_index']==n]
            if alias_mapping:
                flags.append('catalog_alias_mapped')
            if panel_mismatch:
                flags.append('panel_label_mismatch_unmapped')
            if literal:
                flags.append('numeric_from_source_cell')
            if n in class_outliers:
                flags.append('intensity_class_inconsistent_on_page')
            if n in ocr_disagreements:
                flags.append('ocr_number_disagrees')
            method = extraction_method
            if n >= len(rows):
                method = 'local_ocr'
                flags = ['explicit_report_finding']
                evidence[-1].update(extraction_method=method, model_requested=None, model_returned=None)
            if value['result_type']=='unparsed': flags.append('unparsed_result')
            if row.get('warning'): flags.append('api_source_warning')
            date = observation_date(date_facts, row.get('table_kind'))
            date_links = date['evidence_ids'] if date else []
            common = dict(document_id=did, flags=flags, source_date=date['value'] if date else None,
                          date_type=date['key'] if date else None,
                          table_kind=row.get('table_kind'), source_column=row.get('source_column'),
                          source_header=row.get('source_header'), class_header=row.get('class_header'),
                          source_warning=row.get('warning'),
                          verification_status=result.get('verification', {}).get('status'),
                          extraction_method=method, **pending)
            if field in definitions and component in allowed:
                panel = 'myositis' if field.startswith('MYO') else 'ana' if field.startswith('ANA') else 'pft' if field.startswith('PFT') else None
                def observation(slot, values, unit=None):
                    oid='GOBS'+str(len(observations)).zfill(6)
                    observations.append(dict(observation_id=oid, field_id=field, component=slot,
                        name_raw=row['source_label'], result_raw=row['raw_result'], panel=panel,
                        specimen=None, evidence_ids=[eid, *date_links], date_evidence_ids=date_links,
                        extraction_status='unreadable' if values['result_type']=='unparsed' else 'found',
                        validation_status='needs_review', **common, **values))
                observation(component, value)
                for secondary in ('pre_percent_predicted', 'post_percent_predicted'):
                    if row.get(secondary) is not None and secondary in allowed and component != secondary:
                        observation(secondary, _value(dict(numeric_value=row[secondary], comparator='=', unit_raw='%')))
                if row.get('method_raw') and 'method' in allowed:
                    observation('method', dict(result_type='qualitative', qualitative_value=row['method_raw'], unit_raw=None))
            else:
                if field is not None: flags.append('ambiguous_mapping')
                parsed={component: value}
                result_cells={component:row['raw_result']}
                for secondary in ('pre_percent_predicted', 'post_percent_predicted'):
                    if row.get(secondary) is not None and component != secondary:
                        parsed[secondary]=_value(dict(numeric_value=row[secondary], comparator='=', unit_raw='%'))
                        result_cells[secondary]=row[secondary]
                metadata.append(dict(candidate_id='GMD'+str(len(metadata)).zfill(6), key='additional_lab_result',
                    value=dict(name=row['source_label'], results=result_cells, parsed_results=parsed,
                               unit_raw=row.get('unit_raw'), class_raw=row.get('class_raw'), panel=None,
                               specimen=None, clinical_field_id=None, interpretation=row.get('qualitative_value'),
                               source_date=common['source_date'], date_type=common['date_type']),
                    value_raw=row['raw_result'], label_raw=row['source_label'], evidence_ids=[eid, *date_links],
                    validation_status='needs_review', **common))
        # Keep clinical conclusions/notes visible as reviewable source metadata.
        # Identical notes on a single response share the same content-derived
        # evidence ID in the exchange bundle. Keep one candidate and retain
        # the full original response in raw evidence.
        seen_notes = set()
        for note in result['extraction'].get('notes', []):
            key = _cell(note)
            if key in seen_notes:
                continue
            seen_notes.add(key)
            eid=ev(-1, {'source_label':'Source note', 'raw_result':note})
            metadata.append(dict(candidate_id='GMD'+str(len(metadata)).zfill(6), document_id=did,
                key='gemini_source_note', value=note, value_raw=note, label_raw='Ghi chú trên ảnh',
                evidence_ids=[eid], flags=[extraction_flag, 'source_conclusion_not_clinical_assessment'],
                validation_status='needs_review', extraction_method=extraction_method, **pending))
        for warning in result['extraction'].get('warnings', []):
            issues.append(dict(document_id=did, table_id=tid, reason='gemini_source_warning', detail=warning))
        samples=result['extraction'].get('specimens', [])
        if samples:
            sid=tid+'S'; lines=['\t'.join(HEADERS)]
            seen_additional_samples = set()
            for sample in samples:
                kind=sample['sample_type'].strip().lower()
                if kind not in {'blood','stool','other'} or kind=='other' and sample.get('amount') is not None:
                    raw_sample = json.dumps(sample,ensure_ascii=False,sort_keys=True)
                    if raw_sample in seen_additional_samples:
                        continue
                    seen_additional_samples.add(raw_sample)
                    eid=ev(-1,dict(source_label=sample['source_label'],raw_result=raw_sample))
                    metadata.append(dict(candidate_id='GMD'+str(len(metadata)).zfill(6),document_id=did,
                        key='additional_sample_result',value=sample,value_raw=raw_sample,
                        label_raw=sample['source_label'],evidence_ids=[eid],flags=[extraction_flag,'unmapped_sample_type'],
                        validation_status='needs_review',extraction_method=extraction_method,**pending))
                    continue
                label='Blood' if kind=='blood' else 'Stool' if kind=='stool' else 'Other:'
                marker={'checked':'☑','unchecked':'☐','unclear':''}[sample['checkbox_state']]
                amount=' '.join(str(x) for x in (sample.get('amount'), sample.get('unit')) if x is not None)
                lines.append('\t'.join([marker+' '+label, '', _cell(amount), '', '', '']))
            form_raw='\n'.join(lines)
            (run/'raw'/(sid+'.txt')).write_text(form_raw, encoding='utf-8')
            with Image.open(io.BytesIO(result['outgoing_bytes'])) as crop: crop.save(run/'crops'/(sid+'.png'))
            extracted=extract_sample_collections([dict(document_id=did, input_sha256=doc['input_sha256'], tables=[dict(table_id=sid, raw=form_raw)])])
            for entry in extracted['evidence']:
                entry.update(evidence_kind='sample_form_row', extraction_method=extraction_method,
                             derivation='Gemini JSON rendered to source-form table for review; not local OCR')
            for entry in extracted['candidates']:
                entry['flags'].append(extraction_flag)
                entry['extraction_method']=extraction_method
                matched = next((s for s in samples if s['sample_type'].strip().lower()==entry['sample_type']), None)
                if matched and matched.get('warning'):
                    entry['source_warning']=matched['warning']
                    entry['flags'].append('api_source_warning')
            specimens.extend(extracted['candidates']);evidence.extend(extracted['evidence']);issues.extend(extracted['issues'])
    byfield=defaultdict(list)
    for row in observations: byfield[row['field_id']].append(row['observation_id'])
    return dict(schema_version='lupus-candidate-pool-0.2', dictionary_version='gemini-api-1',
        created_at_utc=datetime.now(timezone.utc).isoformat(), case_id=None, identity_status='unconfirmed',
        source_documents=[{k:d[k] for k in ('document_id','input_path','input_sha256')} for d in documents],
        observations=observations, metadata_candidates=metadata, evidence=evidence, issues=issues,
        specimen_candidates=specimens, specimen_schema_version='sample-collection-candidates-0.1',
        fields={fid:dict(label=f['label'], extraction_status='found' if byfield[fid] else 'not_processed',
                        observation_ids=byfield[fid], reason=None) for fid,f in definitions.items()})


def run(manifest, output, workspace, *, extractor=None, model=None, engine='gemini', result_rules_db=None,
        fast_pft=False, fast_labs=False):
    workspace=Path(workspace).resolve(); output=Path(output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if (output/'workflow.json').exists() or (output/'bundle').exists():
        raise FileExistsError('Choose a new output directory for this run')
    documents=manifest['documents'];privacy_plan([d['privacy'] for d in documents], len(documents))
    dictionary=json.loads((workspace/'schemas/pool-dictionary.json').read_text(encoding='utf-8-sig'))
    config=configuration(workspace, model_override=model, engine=engine) if extractor is None else None
    if config is not None:
        config['result_rules'] = load_result_rules(result_rules_db)
    profiles = []
    if config is not None and engine == 'tokenharbor' and config['model'] == 'deepseek-v4.1-flash:free':
        if fast_pft or config.get('fast_pft'):
            profiles.append((pft_crop_evidence, extract_pft_image))
        if fast_labs or config.get('fast_labs'):
            profiles.append((lab_crop_evidence, extract_lab_image))
    state=dict(status='running', stages={})
    def stage(name, status):
        state['stages'][name]=dict(status=status)
        write(output/'workflow.json',state)
    try:
        stage('gemini_privacy', 'running'); prepared=[]; sources=[]
        # Validate and render the entire batch before any outbound request.
        for doc in documents:
            source=(workspace/doc['input_path']).resolve()
            if not source.is_relative_to(workspace): raise ValueError('Source escapes workspace')
            body=source.read_bytes(); checksum=hashlib.sha256(body).hexdigest()
            if checksum != doc['input_sha256']: raise ValueError('Original image changed')
            outgoing = prepare_image(body, doc['privacy'])
            expected = doc.get('expected_outgoing_sha256')
            if expected and (outgoing is None or hashlib.sha256(outgoing).hexdigest() != expected):
                raise ValueError('Prepared image differs from the previously reviewed outgoing image')
            prepared.append(outgoing)
            sources.append(source)
        stage('gemini_privacy', 'completed')
        stage('local_source_dates', 'running')
        (output/'raw').mkdir(exist_ok=True);(output/'crops').mkdir(exist_ok=True)
        local_dates, local_metadata, date_status, local_scans = {}, {}, {}, {}
        for index, (doc, source, outgoing) in enumerate(zip(documents, sources, prepared)):
            did = doc['document_id']
            if outgoing is None:
                date_status[did] = 'image_skipped'
                continue
            status, scan = scan_source_dates(workspace, source, doc, output/'local-ocr'/f'image-{index+1:03}')
            date_status[did] = status
            if scan:
                local_scans[did] = scan
                local_dates[did] = local_date_evidence(doc, source, scan, output, index)
                local_metadata[did] = local_metadata_evidence(doc, source, scan, output, index)
        stage('local_source_dates', 'completed')
        # Final local gate: automatic crops are re-read from the exact outgoing
        # bytes; readable staff text blocks that image from being sent.
        stage('outgoing_privacy_check', 'running')
        blocked = {}
        (output/'local-ocr').mkdir(parents=True, exist_ok=True)
        for index, (doc, outgoing) in enumerate(zip(documents, prepared)):
            if outgoing is None or not doc['privacy'].get('automatic'):
                continue
            method, hits = check_outgoing(outgoing, doc['privacy'], local_scans.get(doc['document_id']),
                                          workspace/'models/privacy')
            write(output/'local-ocr'/f'image-{index+1:03}-outgoing-check.json',
                  dict(method=method, blocked=bool(hits), hit_count=len(hits)))
            if hits:
                blocked[doc['document_id']] = method
                prepared[index] = None
        if blocked and all(body is None for body in prepared):
            raise ValueError('Outgoing privacy check found staff text in every automatic image; '
                             'review the crop and masks manually')
        stage('outgoing_privacy_check', 'completed');stage('gemini_extract', 'running')
        results=[];failed_documents={};(output/'api-responses').mkdir(exist_ok=True)
        for index, (doc, body) in enumerate(zip(documents, prepared)):
            if body is None: results.append(None);continue
            start=time.monotonic()
            scan=local_scans.get(doc['document_id'])
            result, fast_error = None, None
            routing = {}
            for crop_evidence, fast_extract in profiles:
                if crop_evidence is lab_crop_evidence:
                    fast_evidence = crop_evidence(scan, doc['privacy'], routing=routing)
                else:
                    fast_evidence = crop_evidence(scan, doc['privacy'])
                    routing['pft'] = 'eligible' if fast_evidence else 'insufficient_pft_evidence'
                if not fast_evidence:
                    if crop_evidence is lab_crop_evidence and routing.get('lab') == 'fluorescence_or_unidentified_panel':
                        split = fluorescence_split(scan, doc['privacy'])
                        routing['split_lab'] = 'eligible' if split else 'unsafe_boundary_or_insufficient_evidence'
                        if split:
                            try:
                                result = extract_split_lab(body, split, dictionary, workspace, config)
                            except InvalidAPIResponse as error:
                                fast_error = str(error)
                            break
                    continue
                with Image.open(io.BytesIO(body)) as crop:
                    image_size = list(crop.size)
                try:
                    result = fast_extract(body, dictionary, config=config, evidence=fast_evidence, image_size=image_size)
                except InvalidAPIResponse as error:
                    fast_error = str(error)
                    if getattr(error, 'response', None) is not None:
                        write(output/'api-responses'/f'image-{index+1:03}-fast-rejected.json',
                              dict(error=fast_error, raw_response=error.response))
                break
            if result is None:
                standard_config = {**config, 'max_output_tokens': 32000} if fast_error else config
                if extractor:
                    result = extractor(body,dictionary,workspace)
                else:
                    # One bounded retry for a malformed response; a second
                    # failure isolates this image instead of failing the patient.
                    errors = []
                    for attempt in range(2):
                        try:
                            result = extract_image(body,dictionary,workspace,config=standard_config)
                            break
                        except InvalidAPIResponse as error:
                            errors.append(str(error))
                            write(output/'api-responses'/f'image-{index+1:03}-rejected-{attempt+1}.json',
                                  dict(error=str(error), raw_response=getattr(error, 'response', None)))
                    if result is None:
                        failed_documents[doc['document_id']] = '; '.join(errors)
                        results.append(None)
                        continue
                    if errors:
                        result['api_retry'] = errors
                if fast_error:
                    result['fast_profile_fallback'] = fast_error
                if extractor is None:
                    from .llm_verification import verify_extraction
                    try:
                        result=verify_extraction(body,result,dictionary,workspace,config=standard_config)
                    except InvalidAPIResponse as error:
                        result['verification'] = dict(attempted=True, status='failed_kept_initial', error=str(error))
            if extractor is None:
                from .llm_row_anchors import anchor_row_boxes
                if scan:
                    anchor_row_boxes(result,scan,doc['privacy'])
                    attach_complement_ranges(result, scan, doc['privacy'])
            findings = [finding for helper in (echo_pericardial_finding, ct_ild_finding, pleural_effusion_finding)
                        if (finding := helper(scan, doc['privacy'])) is not None]
            if findings:
                result['local_report_findings'] = findings
            if scan:
                result['ocr_number_disagreements'] = number_disagreements(
                    result['extraction']['rows'], scan, doc['privacy'])
            result.update(elapsed_seconds=round(time.monotonic()-start,3),outgoing_sha256=hashlib.sha256(body).hexdigest())
            if profiles:
                result['fast_routing'] = routing
            write(output/'api-responses'/f'image-{index+1:03}.json', result)
            result['outgoing_bytes']=body;results.append(result)
        stage('gemini_extract', 'completed');stage('gemini_bundle','running')
        candidate=build_candidate(documents,results,dictionary,output,local_dates=local_dates,
                                  local_metadata=local_metadata,engine=engine)
        if len(failed_documents) == sum(body is not None for body in prepared):
            raise ValueError('API extraction failed for every sent image; originals and privacy selections are retained')
        for did, detail in failed_documents.items():
            candidate['issues'].append(dict(document_id=did, table_id=None, reason='api_extraction_failed',
                                            detail=detail[:500]))
        for did, method in blocked.items():
            candidate['issues'].append(dict(document_id=did, table_id=None, reason='outgoing_privacy_blocked',
                                            detail=f'Staff text readable in the automatic crop ({method}); '
                                                   'not sent. Review crop/masks manually.'))
        write(output/'candidate-pool.json',candidate)
        provenance=dict(engine=engine, llm_contract_version=LLM_CONTRACT_VERSION,
            api_model_requested=config['model'] if config else 'synthetic',
            privacy='User-reviewed crop and masks; original filenames and source metadata never sent', auto_approval=False,
            documents=[dict(source_document_id=d['document_id'], original_sha256=d['input_sha256'],
                            privacy=d['privacy'], outgoing_sha256=r['outgoing_sha256'] if r else None,
                            local_source_date_status=date_status[d['document_id']]) for d,r in zip(documents,results)])
        if config is not None and 'result_rules' in config:
            provenance['result_literal_rule_versions']=sorted(set(config['result_rules'].values()))
        write(output/'provenance.json',provenance)
        bundle=output/'bundle';build_bundle(output,bundle,dictionary,workspace)
        stage('gemini_bundle','completed');state['status']='completed';write(output/'workflow.json',state)
        write(output/'result.json',dict(status='completed', bundle=str(bundle)))
        return bundle
    except Exception:
        state['status']='failed';write(output/'workflow.json',state)
        raise
