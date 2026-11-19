"""Synthetic compact contracts and fake transports; no source images or API calls."""
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from PIL import Image

from ocr_pool.llm import (InvalidAPIResponse, configuration, extract_image, response_schema,
                             validate_response)
from ocr_pool.llm_extraction import (COMPACT_PROMPT_ADDENDUM, CORE_ROW_KEYS, EXTRA_ROW_KEYS,
                                     PROMPT_ADDENDUM, compact_extraction_schema,
                                     expand_compact_extraction, normalize_extraction)
from ocr_pool.llm_verification import verify_extraction


ROOT = Path(__file__).resolve().parents[1]
DICTIONARY = {'fields': [dict(field_id='TEST_A', label='Glucose', section='Synthetic laboratory',
    components=[dict(component_id='result', value_type='numeric', allowed_units=['mmol/L'])])]}


def full_row(**changes):
    # Written independently of the schema/expander so missing fields are caught.
    row = dict(field_id='TEST_A', source_label='Glucose', raw_result='5.4', unit_raw='mmol/L',
        component='result', source_column='result', row_box=[20, 100, 980, 130],
        numeric_value='5.4', comparator='=', qualitative_value=None, class_raw=None,
        pre_percent_predicted=None, pattern_raw=None, grade_raw=None, titre_raw=None,
        method_raw=None, source_flag_raw=None, warning=None, table_kind='general_lab',
        source_header='Result', class_header=None, post_percent_predicted=None, grade_annotation=None)
    return {**row, **changes}


def document(*rows):
    return dict(rows=list(rows), specimens=[], notes=['Synthetic note'], warnings=[])


def compact_row(row):
    return {**{key: row[key] for key in CORE_ROW_KEYS}, 'grade_annotation': row['grade_annotation'],
            'extra': [dict(key=key, value=row[key]) for key in EXTRA_ROW_KEYS if row[key] is not None]}


def compact_document(full):
    return {**deepcopy(full), 'rows': [compact_row(row) for row in full['rows']]}


def strict_objects(schema):
    if isinstance(schema, dict):
        if 'properties' in schema:
            assert set(schema['required']) == set(schema['properties'])
            assert len(schema['required']) == len(schema['properties'])
            assert schema['additionalProperties'] is False
        for value in schema.values():
            strict_objects(value)
    elif isinstance(schema, list):
        for value in schema:
            strict_objects(value)


def check_compact_schema_is_strict_and_preserves_core_and_extra_types():
    base = response_schema(DICTIONARY)
    original = deepcopy(base)
    schema = compact_extraction_schema(base, DICTIONARY)
    strict_objects(schema)
    assert base == original
    props = schema['properties']['rows']['items']['properties']
    assert set(props) == {*CORE_ROW_KEYS, 'grade_annotation', 'extra'}
    full = base['properties']['rows']['items']['properties']
    assert set(full) == {*CORE_ROW_KEYS, *EXTRA_ROW_KEYS, 'grade_annotation'}
    for key in (*CORE_ROW_KEYS, 'grade_annotation'):
        assert props[key] == full[key]
    variants = props['extra']['items']['anyOf']
    moved = {key: variant['properties']['value'] for variant in variants
             for key in variant['properties']['key']['enum']}
    assert moved == {key: full[key] for key in EXTRA_ROW_KEYS}
    validate_response(compact_document(document(full_row())), schema)
    invalid = compact_document(document(full_row()))
    invalid['rows'][0]['table_kind'] = 'unsupported_table_kind'   # a core enum
    with unittest.TestCase().assertRaises(ValueError):
        validate_response(invalid, schema)


def check_expand_matches_full_response_and_normalization():
    annotation = dict(text='2+', placement='result_cell', association='confirmed', writing_style='printed')
    full = document(full_row(method_raw='Enzymatic', source_flag_raw='H'),
        full_row(field_id=None, source_label='Synthetic ANA', raw_result='Speckled',
            numeric_value=None, comparator=None, unit_raw=None, row_box=[20, 140, 980, 170],
            pattern_raw='Speckled', grade_raw='2+', grade_annotation=annotation, warning='Check source'))
    full['specimens'] = [dict(sample_type='blood', source_label='Blood', checkbox_state='checked',
                              amount='7', unit='mL', warning=None)]
    full['warnings'] = ['Original warning']
    compact = compact_document(full)
    original = deepcopy(compact)
    expanded = expand_compact_extraction(compact)
    assert expanded == full
    assert normalize_extraction(expanded, DICTIONARY) == normalize_extraction(full, DICTIONARY)
    assert compact == original
    expanded['rows'][1]['grade_annotation']['text'] = '3+'
    assert compact == original


def check_expand_empty_extras_fills_every_missing_field_with_none():
    raw = document({**{key: full_row()[key] for key in CORE_ROW_KEYS}, 'extra': []})
    expanded = expand_compact_extraction(raw)
    assert expanded['rows'] == [full_row(**dict.fromkeys((*EXTRA_ROW_KEYS, 'grade_annotation')))]
    assert 'grade_annotation' not in raw['rows'][0]
    assert expand_compact_extraction(document()) == document()


def check_duplicate_and_unknown_extras_keep_first_without_overwriting_core():
    raw = document(compact_row(full_row()))
    raw['warnings'] = ['Original warning']
    raw['rows'][0]['extra'] += [
        dict(key='method_raw', value=None), dict(key='method_raw', value='Later method'),
        dict(key='table_kind', value='pft'),
        dict(key='unrecognized', value='first'), dict(key='unrecognized', value='second'),
        dict(key='numeric_value', value='999')]
    original = deepcopy(raw)
    expanded = expand_compact_extraction(raw)
    assert expanded['rows'] == [full_row()]
    assert expanded['warnings'] == [
        'Original warning',
        "Compact row 0: duplicate extra key 'method_raw'; kept first value",
        "Compact row 0: unknown extra key 'table_kind'; ignored",
        "Compact row 0: unknown extra key 'unrecognized'; ignored",
        "Compact row 0: duplicate extra key 'unrecognized'; kept first value",
        "Compact row 0: unknown extra key 'numeric_value'; ignored"]
    assert raw == original


def check_configuration_compact_rows_is_opt_in_without_touching_env(engine, setting):
    prefix = engine.upper()
    text = f'{prefix}_API_KEY=synthetic-key\n{prefix}_MODEL=synthetic-model\n'
    if setting is not None:
        text += f'{prefix}_COMPACT_ROWS={setting}\n'
    # Mock configuration input; never read or write a real .env.
    with patch.object(Path, 'is_file', return_value=True), patch.object(Path, 'read_text', return_value=text):
        config = configuration(ROOT, engine=engine)
    if setting == '1':
        assert config['compact_rows'] is True
    else:
        assert 'compact_rows' not in config


def image_bytes():
    stream = io.BytesIO()
    Image.new('RGB', (100, 200), 'white').save(stream, 'JPEG')
    return stream.getvalue()


def fake_extraction(raw, *, native, engine='gemini', compact_rows=None):
    config = dict(key='synthetic-key', model='synthetic-model', endpoint='https://example.invalid/v1',
                  native=native, engine=engine)
    if compact_rows is not None:
        config['compact_rows'] = compact_rows
    envelope = (dict(modelVersion='synthetic-model', candidates=[dict(finishReason='STOP',
        content=dict(parts=[dict(text=json.dumps(raw))]))]) if native else
        dict(model='synthetic-model', choices=[dict(finish_reason='stop', message=dict(content=json.dumps(raw)))]))
    requests = []

    def open_request(request, *, timeout):
        requests.append(json.loads(request.data))
        return io.BytesIO(json.dumps(envelope).encode())

    record = extract_image(image_bytes(), DICTIONARY, ROOT, config=config, opener=Mock(open=open_request))
    assert len(requests) == 1
    return record, requests[0]


def check_compact_transport_schema_prompt_and_immutable_audits(native, engine):
    full = document(full_row(method_raw='Enzymatic'))
    raw = compact_document(full)
    record, payload = fake_extraction(raw, native=native, engine=engine, compact_rows=True)
    schema = response_schema(DICTIONARY, compact_rows=True)
    assert record['request_contract']['schema'] == schema
    assert COMPACT_PROMPT_ADDENDUM in record['request_contract']['prompt']
    assert record['raw_extraction'] == raw
    assert record['expanded_extraction'] == full
    assert record['extraction'] == normalize_extraction(full, DICTIONARY)[0]
    if native:
        assert payload['generationConfig']['responseJsonSchema'] == schema
        assert payload['systemInstruction']['parts'][0]['text'] == record['request_contract']['prompt']
    elif engine == 'tokenharbor':
        assert payload['response_format'] == {'type': 'json_object'}
        embedded = payload['messages'][0]['content'].split('matching this JSON Schema exactly:\n')[1]
        assert json.loads(embedded) == schema
    else:
        assert payload['response_format'] == dict(type='json_schema', json_schema=dict(
            name='clinical_extraction', strict=True, schema=schema))


def check_transport_warns_about_unknown_and_duplicate_extras_without_losing_raw():
    raw = compact_document(document(full_row()))
    raw['rows'][0]['extra'] += [dict(key='method_raw', value='First method'),
        dict(key='method_raw', value='Second method'), dict(key='future_key', value='Unknown value')]
    record, _ = fake_extraction(raw, native=False, engine='tokenharbor', compact_rows=True)
    assert record['raw_extraction'] == raw
    assert record['expanded_extraction']['rows'] == [full_row(method_raw='First method')]
    assert len(record['extraction']['warnings']) == 2
    assert 'duplicate' in record['extraction']['warnings'][0]
    assert 'unknown' in record['extraction']['warnings'][1]


def check_compact_transport_still_rejects_invalid_known_values_and_malformed_items(extra):
    raw = compact_document(document(full_row()))
    raw['rows'][0]['extra'].append(extra)
    with unittest.TestCase().assertRaisesRegex(InvalidAPIResponse, 'schema validation'):
        fake_extraction(raw, native=False, engine='tokenharbor', compact_rows=True)


def check_default_contract_prompt_schema_and_payload_are_unchanged(native, engine):
    full = document(full_row())
    record, payload = fake_extraction(full, native=native, engine=engine)
    disabled, disabled_payload = fake_extraction(full, native=native, engine=engine, compact_rows=False)
    assert record == disabled
    assert payload == disabled_payload
    assert 'expanded_extraction' not in record
    assert COMPACT_PROMPT_ADDENDUM not in record['request_contract']['prompt']
    # Pin the original prompt text and the original 23-key full schema.
    assert hashlib.sha256(PROMPT_ADDENDUM.encode()).hexdigest() == '06252b574cab3795345d803e65a60f9dc875a48ac7eaa81e8e74c00021edb140'
    prompt_file = (ROOT / 'schemas/llm-extraction-prompt.txt').read_text(encoding='utf-8')
    assert hashlib.sha256(prompt_file.encode()).hexdigest() == 'ae95ec10118bb69389d4f3a1db24556f02492d1d8152e2df7b6ed783757f16cd'
    catalog = [dict(field_id='TEST_A', label='Glucose', section='Synthetic laboratory',
                    components=[dict(component_id='result', value_type='numeric', allowed_units=['mmol/L'])])]
    expected_prompt = (prompt_file + PROMPT_ADDENDUM + '\nInput raster: width 100px, height 200px. '
        'Return row_box in the normalized 0–1000 coordinate space.\nCRF CATALOG:\n'
        + json.dumps(catalog, ensure_ascii=False, separators=(',', ':')))
    schema = response_schema(DICTIONARY)
    assert hashlib.sha256(json.dumps(schema, sort_keys=True, separators=(',', ':')).encode()).hexdigest() == '623e80c9aecdf40d7b9a2b1f6f73f098eed89930811b7aea65921571d9ef79d8'
    if engine == 'tokenharbor':
        expected_prompt += '\nReturn one JSON object matching this JSON Schema exactly:\n' + json.dumps(
            schema, ensure_ascii=False, separators=(',', ':'))
    expected_contract = dict(prompt=expected_prompt, schema=schema,
        image_sha256=hashlib.sha256(image_bytes()).hexdigest(), image_size=[100, 200],
        max_output_tokens=16000, image_detail='high', native=native, model='synthetic-model',
        engine=engine, ocr_hint_lines=0)
    assert record['request_contract'] == expected_contract
    if native:
        assert payload['generationConfig'] == dict(maxOutputTokens=16000,
            responseMimeType='application/json', responseJsonSchema=schema)
    else:
        assert payload['response_format'] == ({'type': 'json_object'} if engine == 'tokenharbor' else
            dict(type='json_schema', json_schema=dict(name='clinical_extraction', strict=True, schema=schema)))


def check_verification_merges_expanded_rows_and_keeps_both_raw_records(initial_compact, review_compact):
    initial = document(full_row(numeric_value='9.9', class_raw='I', class_header=None))
    reviewed = document(full_row(class_raw='I', class_header='Class'))

    def record(full, compact):
        return (dict(raw_extraction=compact_document(full), expanded_extraction=deepcopy(full))
                if compact else dict(raw_extraction=deepcopy(full)))

    original = record(initial, initial_compact)
    before = deepcopy(original)
    review_record = record(reviewed, review_compact)
    review_before = deepcopy(review_record)
    reviewer = Mock(return_value=review_record)
    out = verify_extraction(b'synthetic-placeholder', original, DICTIONARY, ROOT,
                            config={'compact_rows': True}, reviewer=reviewer)
    assert original == before
    assert review_record == review_before
    assert out['raw_extraction'] == before['raw_extraction']
    if initial_compact:
        assert out['expanded_extraction'] == initial
    assert out['verified_raw_extraction'] == reviewed
    assert out['extraction'] == reviewed
    assert out['validation_issues'] == []
    assert out['verification']['response'] == review_before
    reviewer.assert_called_once()


def check_fast_profiles_ignore_compact_mode_and_keep_their_existing_contract(profile):
    from ocr_pool import lab_api, pft_api

    config = dict(model='synthetic', key='synthetic')
    if profile == 'lab':
        module = lab_api
        raw = dict(rows=[dict(label='Synthetic assay', value='5.4', unit='mmol/L', header='Result',
            code=None, number='5.4', op='=', qualitative=None, cls=None, class_header=None,
            pattern=None, grade=None, titre=None, method=None, box=None)], notes=[])
        evidence = dict(panel=None, layout='lab', required_fields=set(), required_slots=set())
        extract = lab_api.extract_lab_image
    else:
        module = pft_api
        raw = dict(rows=[dict(label='Synthetic (L)', unit='L', pre='2.5', percent_pre='80',
                              post=None, percent_post=None, box=None)], notes=[])
        evidence = dict(minimum_rows=1, required_fields=set(), minimum_percent_counts={})
        extract = pft_api.extract_pft_image
    calls, records = [], []
    with patch.object(module, 'request_json', return_value=(raw, {}, 'synthetic', {}, 'stop')) as request:
        for compact in (False, True):
            records.append(extract(b'synthetic-placeholder', DICTIONARY,
                config={**config, 'compact_rows': compact}, evidence=evidence, image_size=[100, 200]))
            calls.append(request.call_args)
    assert records[0] == records[1]
    # The config itself carries the opt-in flag, but the transport payload,
    # headers, validation schema and opener are identical for these profiles.
    assert calls[0].args[1:] == calls[1].args[1:]
    assert calls[0].kwargs == calls[1].kwargs
    assert records[0]['raw_extraction'] == raw
    assert records[0]['request_contract']['schema'] == module.SCHEMA


def check_twenty_row_sparse_table_size_reduction():
    analytes = [('Glucose', '5.4', 'mmol/L'), ('Creatinine', '78', 'umol/L'),
        ('Urea', '4.8', 'mmol/L'), ('Sodium', '139', 'mmol/L'), ('Potassium', '4.1', 'mmol/L'),
        ('Chloride', '102', 'mmol/L'), ('Calcium', '2.31', 'mmol/L'), ('Phosphate', '1.12', 'mmol/L'),
        ('Albumin', '42', 'g/L'), ('Total protein', '73', 'g/L'), ('AST', '24', 'U/L'),
        ('ALT', '28', 'U/L'), ('ALP', '76', 'U/L'), ('GGT', '22', 'U/L'),
        ('Bilirubin', '11', 'umol/L'), ('CRP', '2.3', 'mg/L'), ('C3', '0.92', 'g/L'),
        ('C4', '0.21', 'g/L'), ('Uric acid', '310', 'umol/L'), ('Magnesium', '0.84', 'mmol/L')]
    full = document(*(full_row(field_id=None, source_label=label, raw_result=value, numeric_value=value,
        unit_raw=unit, row_box=[20, 100 + i * 35, 980, 130 + i * 35])
        for i, (label, value, unit) in enumerate(analytes)))
    compact = compact_document(full)
    full_size, compact_size = [len(json.dumps(item, ensure_ascii=False, separators=(',', ':')))
                               for item in (full, compact)]
    print(f'20 synthetic rows: full={full_size}, compact={compact_size} JSON characters; '
          f'reduction={1 - compact_size / full_size:.1%}')
    assert compact_size < full_size * 0.80
    assert expand_compact_extraction(compact) == full


class CompactExtractionTests(unittest.TestCase):
    def test_compact_schema_is_strict_and_preserves_core_and_extra_types(self):
        check_compact_schema_is_strict_and_preserves_core_and_extra_types()

    def test_expand_matches_full_response_and_normalization(self):
        check_expand_matches_full_response_and_normalization()

    def test_expand_empty_extras_fills_every_missing_field_with_none(self):
        check_expand_empty_extras_fills_every_missing_field_with_none()

    def test_duplicate_and_unknown_extras_keep_first_without_overwriting_core(self):
        check_duplicate_and_unknown_extras_keep_first_without_overwriting_core()

    def test_configuration_compact_rows_is_opt_in_without_touching_env(self):
        for engine in ('gemini', 'tokenharbor'):
            for setting in (None, '0', '1'):
                with self.subTest(engine=engine, setting=setting):
                    check_configuration_compact_rows_is_opt_in_without_touching_env(engine, setting)

    def test_compact_transport_schema_prompt_and_immutable_audits(self):
        for native, engine in ENGINES:
            with self.subTest(native=native, engine=engine):
                check_compact_transport_schema_prompt_and_immutable_audits(native, engine)

    def test_transport_warns_about_unknown_and_duplicate_extras_without_losing_raw(self):
        check_transport_warns_about_unknown_and_duplicate_extras_without_losing_raw()

    def test_compact_transport_still_rejects_invalid_known_values_and_malformed_items(self):
        for extra in (dict(key='source_header', value=123), dict(key='method_raw', value=123),
                      dict(key='unknown'), dict(key='unknown', value='text', unexpected=True)):
            with self.subTest(extra=extra):
                check_compact_transport_still_rejects_invalid_known_values_and_malformed_items(extra)

    def test_default_contract_prompt_schema_and_payload_are_unchanged(self):
        for native, engine in ENGINES:
            with self.subTest(native=native, engine=engine):
                check_default_contract_prompt_schema_and_payload_are_unchanged(native, engine)

    def test_verification_merges_expanded_rows_and_keeps_both_raw_records(self):
        for initial_compact, review_compact in ((True, True), (True, False), (False, True)):
            with self.subTest(initial_compact=initial_compact, review_compact=review_compact):
                check_verification_merges_expanded_rows_and_keeps_both_raw_records(initial_compact, review_compact)

    def test_fast_profiles_ignore_compact_mode_and_keep_their_existing_contract(self):
        for profile in ('lab', 'pft'):
            with self.subTest(profile=profile):
                check_fast_profiles_ignore_compact_mode_and_keep_their_existing_contract(profile)

    def test_twenty_row_sparse_table_size_reduction(self):
        check_twenty_row_sparse_table_size_reduction()


ENGINES = ((True, 'gemini'), (False, 'gemini'), (False, 'tokenharbor'))


if __name__ == '__main__':
    unittest.main()
