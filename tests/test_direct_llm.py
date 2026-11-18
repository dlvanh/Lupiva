"""Synthetic full-image prototype: no local OCR, no automatic approval or network."""
from copy import deepcopy
import hashlib
import io
import json
import os
from pathlib import Path
import time
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from PIL import Image
from ocr_pool.flags import prototype_direct_llm
from ocr_pool.llm import extract_image, prepare_image, privacy_plan, response_schema, validate_response
from ocr_pool.llm_workflow import run
from registry_pool.exchange import read, verify_bundle
from registry_review.privacy import PrivacyProposals, test_auto_send
from registry_review.crf import CRFReview
from registry_review.exports import ExportManager
from registry_review.server import ReviewApplication
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace
import test_patient_intake as fixture
from test_llm_intake import result, DICTIONARY
from test_privacy_preview import source_bytes


FLAG = 'LUPIVA_PROTOTYPE_DIRECT_LLM'
ROOT = Path(__file__).resolve().parents[1]


def api_result():
    record = result()
    record['extraction']['tables'] = [dict(table_index=0, box=[20, 50, 900, 700])]
    for index, row in enumerate(record['extraction']['rows']):
        row['table_index'] = 0 if index == 0 else None
    record['extraction']['header_facts'] = [
        dict(key=key, label_raw=label, value_raw=value, box=None) for key, label, value in (
            ('sample_date', 'Ngày lấy mẫu', '19/03/2025 07:35'),
            ('result_date', 'Result date', '2025-03-20'),
            ('sex', 'Giới tính', 'Nữ'), ('age', 'Age', '42 years'),
            ('height', 'Height (cm)', '165'), ('weight', 'Weight (kg)', '57.5'),
            ('ordering_provider', 'Physician', 'BS. Synthetic Physician'),
            ('specimen_collector', 'Nurse', 'Synthetic Nurse'))]
    record['extraction']['pii_boxes'] = [dict(kind='patient_name', box=[10, 30, 400, 150])]
    return record


class DirectLlmTests(unittest.TestCase):
    setUp = fixture.PatientIntakeTests.setUp
    tearDown = fixture.PatientIntakeTests.tearDown
    wait = fixture.PatientIntakeTests.wait

    def setup_workspace(self):
        (self.root/'schemas').mkdir(exist_ok=True)
        (self.root/'schemas/pool-dictionary.json').write_text(json.dumps(DICTIONARY), encoding='utf-8')
        (self.root/'.env').write_text('GEMINI_API_KEY=synthetic\nGEMINI_MODEL=synthetic\n', encoding='utf-8')

    def document(self, name='DIRECT', direct=True):
        body = fixture.image_bytes(name)
        (self.root/(name+'.png')).write_bytes(body)
        sha = hashlib.sha256(body).hexdigest()
        plan = dict(sha256=sha, crop=[0, 0, 900, 350], masks=[], mask_polygons=[],
                    reviewed=True, automatic=True)
        if direct:
            plan['direct_llm'] = True
        return dict(document_id=name, input_path=name+'.png', input_sha256=sha, privacy=plan), body

    def test_flag_environment_precedence_and_exact_one_for_both_flags(self):
        for name, check in ((FLAG, prototype_direct_llm), ('LUPIVA_TEST_AUTO_SEND', test_auto_send)):
            with patch.dict(os.environ, {}, clear=True):
                self.assertFalse(check(self.root))
                for value in ('1', '0', '', 'true', 'yes', '01'):
                    with self.subTest(name=name, file=value):
                        (self.root/'.env').write_text(f'\ufeff{name}="{value}"\n', encoding='utf-8')
                        self.assertEqual(check(self.root), value == '1')
                (self.root/'.env').write_text(f'{name}=1\n', encoding='utf-8')
                for value in ('0', '', 'true', '1'):
                    with patch.dict(os.environ, {name: value}):
                        self.assertEqual(check(self.root), value == '1')
                (self.root/'.env').unlink()

    def test_direct_proposal_uses_oriented_whole_image_without_ocr_or_routing(self):
        for orientation, size in ((None, [180, 240]), (6, [240, 180])):
            with self.subTest(orientation=orientation), patch.dict(os.environ, {FLAG: '1'}):
                manager = PrivacyProposals(self.root)
                try:
                    with (patch('registry_review.privacy.subprocess.Popen', side_effect=AssertionError('local OCR')),
                          patch.object(manager, 'route_preview', side_effect=AssertionError('local routing'))):
                        body = source_bytes(orientation)
                        sha = hashlib.sha256(body).hexdigest()
                        job = manager.create(body, sha)
                        deadline = time.monotonic() + 3
                        while manager.get(job['job_id'])['status'] in {'queued', 'processing'} and time.monotonic() < deadline:
                            time.sleep(.01)
                        done = manager.get(job['job_id'])
                    self.assertEqual(done['status'], 'completed')
                    proposal = done['proposal']
                    self.assertEqual(proposal['crop_reason'], 'prototype_direct_llm')
                    self.assertEqual(proposal['review_count'], 0)
                    plan = done['automatic_plan']
                    self.assertEqual(plan, dict(sha256=sha, crop=[0, 0, *size], masks=[],
                        mask_polygons=[], proposal_id=job['job_id'], automatic=True, reviewed=True, direct_llm=True))
                    privacy_plan([plan], 1)
                    manager.validate_intake_plans([plan])
                    with Image.open(io.BytesIO(prepare_image(body, plan))) as image:
                        self.assertEqual(list(image.size), size)
                    with self.assertRaises(ValueError):
                        manager.validate_intake_plans([{**plan, 'direct_llm': False}])
                finally:
                    manager.close()

    def test_direct_proposal_bypasses_injected_local_runner_too(self):
        with patch.dict(os.environ, {FLAG: '1'}):
            runner = Mock(side_effect=AssertionError('local OCR runner'))
            manager = PrivacyProposals(self.root, runner=runner)
            try:
                body = source_bytes()
                job = manager.create(body, hashlib.sha256(body).hexdigest())
                manager.queue.join()
                self.assertEqual(manager.get(job['job_id'])['status'], 'completed')
                runner.assert_not_called()
            finally:
                manager.close()

    def test_public_intake_configuration_is_read_only_and_tracks_mode(self):
        with patch.dict(os.environ, {FLAG: '1'}):
            self.assertIs(self.manager.list()['prototype_direct_llm'], True)
        with patch.dict(os.environ, {FLAG: '0'}):
            self.assertIs(self.manager.list()['prototype_direct_llm'], False)

    def test_workflow_without_local_ocr_retains_dates_and_all_adm_fields_pending(self):
        self.setup_workspace()
        doc, body = self.document()
        fake = Mock(side_effect=lambda *_: api_result())
        with (patch('ocr_pool.llm_workflow.scan_source_dates', side_effect=AssertionError('local OCR')),
              patch('ocr_pool.llm_workflow.check_outgoing', side_effect=AssertionError('outgoing OCR')),
              patch('ocr_pool.llm_workflow.enough_result_content', side_effect=AssertionError('content OCR'))):
            bundle = run(dict(documents=[doc]), self.root/'direct', self.root, extractor=fake)
        self.assertEqual(fake.call_args.args[0], prepare_image(body, doc['privacy']))
        candidate = read(self.root/'direct/candidate-pool.json')
        adm = {o['field_id']: o for o in candidate['observations'] if o['field_id'].startswith('ADM')}
        self.assertEqual(set(adm), {'ADM02', 'ADM03', 'ADM05', 'ADM06', 'ADM08', 'ADM09'})
        self.assertEqual(adm['ADM03']['qualitative_value'], 'female')
        self.assertEqual(adm['ADM05']['numeric_value'], '165')
        self.assertEqual(adm['ADM08']['qualitative_value'], 'Synthetic Physician')
        self.assertEqual(adm['ADM09']['qualitative_value'], 'Synthetic Nurse')
        c3 = next(o for o in candidate['observations'] if o['name_raw'] == 'C3')
        self.assertEqual((c3['source_date'], c3['date_type']), ('2025-03-19T07:35:00', 'sample_date'))
        facts = {m['key']: m for m in candidate['metadata_candidates']}
        self.assertEqual(facts['result_date']['value'], '2025-03-20')
        for entry in candidate['observations'] + candidate['metadata_candidates']:
            self.assertEqual(entry['review_status'], 'pending')
            self.assertFalse(entry['eligible_for_verified_pool'])
            self.assertFalse(any('conflict' in f or 'ocr_number_disagrees' == f for f in entry['flags']))
        package = verify_bundle(bundle, DICTIONARY)
        self.assertEqual(len(package['observations']), 7)
        self.assertEqual(read(self.root/'direct/provenance.json')['documents'][0]['local_source_date_status'], 'direct_llm')

    def test_api_values_reach_patient_crf_candidates_without_approval(self):
        self.setup_workspace()
        doc, body = self.document()
        with patch.dict(os.environ, {FLAG: '0'}), self.assertRaisesRegex(ValueError, 'prototype mode'):
            self.manager.create(request_id='direct-off', file_count=1, same_patient=True, engine='gemini',
                                privacy=[doc['privacy']], **self.person)
        with patch.dict(os.environ, {FLAG: '1'}):
            job = self.manager.create(request_id='direct', file_count=1, same_patient=True, engine='gemini',
                                      privacy=[doc['privacy']], **self.person)['job']
        self.manager.upload(job['job_id'], 'image-0', 'synthetic.png', body)
        with self.assertRaises(KeyError):
            self.manager.source(job['job_id'], 'image-0', for_review=True)
        self.manager.runner = lambda job, files, folder: run(read(folder/'manifest.json'),
            folder/job['output'], self.root, extractor=lambda *_: api_result())
        with (patch('ocr_pool.llm_workflow.scan_source_dates', side_effect=AssertionError('local OCR')),
              patch('ocr_pool.llm_workflow.check_outgoing', side_effect=AssertionError('outgoing OCR'))):
            self.manager.start(job_id=job['job_id'])
            done = self.wait(job['job_id'])
        self.assertEqual(done['status'], 'completed')
        store = ReviewStore(self.db)
        try:
            view = patient_workspace(store, DICTIONARY, job['case_id'])
            fields = {c.get('field_id') for c in view['candidates']}
            self.assertTrue({'ADM02', 'ADM03', 'ADM05', 'ADM06', 'ADM08', 'ADM09'} <= fields)
            self.assertTrue(all(c['review_status'] == 'pending' for c in view['candidates']))
            self.assertEqual(store.effective_pool(job['case_id'])['observations'], [])
            app = ReviewApplication.__new__(ReviewApplication)
            app.database, app.bundles = self.db, self.app.bundles
            app.exports = ExportManager(app)
            self.manager.application = app
            key = (done['package_id'], done['revision'])
            self.assertEqual(self.manager.source(job['job_id'], 'image-0')[0], body)
            self.assertEqual(self.manager.source(job['job_id'], 'image-0', for_review=True),
                             app.asset(*key, 'artifacts/crops/G0000.png'))
            package_view = app.package_view(store, *key)
            patient_view = app.exports.patient(job['case_id'])
            self.assertTrue(package_view['documents'] and patient_view['documents'])
            for entry in package_view['documents'] + patient_view['documents']:
                params = parse_qs(urlsplit(entry['source_url']).query)
                self.assertEqual(params['key'], ['artifacts/crops/G0000.png'])
            c3 = next(c for c in patient_view['workspace']['candidates'] if c['field_id'] == 'IMM11')
            observation = next(o for o in package_view['observations'] if o['field_id'] == 'IMM11')
            crf_source = CRFReview(app).view(store, job['case_id'])['sources'][c3['selection_id']]
            table_key = 'artifacts/crops/G0000T0.png'
            for url in (c3['source_url'], c3['evidence'][0]['crop_url'],
                        observation['evidence'][0]['crop_url'], crf_source['url']):
                self.assertEqual(parse_qs(urlsplit(url).query)['key'], [table_key])
            for evidence in (c3['evidence'][0], observation['evidence'][0]):
                self.assertEqual(parse_qs(urlsplit(evidence['raw_url']).query)['key'], ['artifacts/raw/G0000.txt'])
            self.assertEqual(crf_source['row_location'],
                             observation['evidence'][0]['source_data']['region']['llm_row_location'])
        finally:
            store.close()

    def test_normal_doc_still_runs_local_ocr_and_gate_in_mixed_batch(self):
        self.setup_workspace()
        direct, _ = self.document()
        normal, _ = self.document('NORMAL', direct=False)
        with (patch('ocr_pool.llm_workflow.scan_source_dates', return_value=('not_needed', None)) as scan,
              patch('ocr_pool.llm_workflow.check_outgoing', return_value=('cached', [])) as gate):
            run(dict(documents=[direct, normal]), self.root/'mixed', self.root, extractor=lambda *_: api_result())
        self.assertEqual(scan.call_count, 1)
        self.assertEqual(scan.call_args.args[2]['document_id'], 'NORMAL')
        self.assertEqual(gate.call_count, 1)
        candidate = read(self.root/'mixed/candidate-pool.json')
        normal_c3 = next(o for o in candidate['observations'] if o['document_id'] == 'NORMAL' and o['name_raw'] == 'C3')
        self.assertIsNone(normal_c3['source_date'], 'Normal mode must still ignore API header facts')

    def test_direct_worker_uses_standard_api_without_missing_ocr_conflicts_or_fast_routes(self):
        self.setup_workspace()
        doc, _ = self.document()
        config = dict(model='deepseek-v4.1-flash:free', fast_labs=True, fast_pft=True)
        with (patch('ocr_pool.llm_workflow.configuration', return_value=config),
              patch('ocr_pool.llm_workflow.scan_source_dates', side_effect=AssertionError('local OCR')),
              patch('ocr_pool.llm_workflow.check_outgoing', side_effect=AssertionError('outgoing OCR')),
              patch('ocr_pool.llm_workflow.number_disagreements', side_effect=AssertionError('OCR crosscheck')),
              patch('ocr_pool.llm_workflow.lab_crop_evidence', side_effect=AssertionError('OCR lab routing')),
              patch('ocr_pool.llm_workflow.pft_crop_evidence', side_effect=AssertionError('OCR PFT routing')),
              patch('ocr_pool.llm_verification.verify_extraction', side_effect=AssertionError('missing OCR verification')),
              patch('ocr_pool.llm_workflow.extract_image', side_effect=lambda *_a, **_kw: api_result()) as api):
            run(dict(documents=[doc]), self.root/'standard', self.root, engine='tokenharbor')
        self.assertTrue(api.call_args.kwargs['config']['direct_llm'])
        self.assertIsNone(api.call_args.kwargs['ocr_hint'])
        self.assertNotIn('direct_llm', config, 'Per-image configuration must not leak to normal documents')

    def test_api_date_roles_fallback_and_conflicts_remain_pending(self):
        from ocr_pool.direct_llm import header_facts, source_date
        raw = api_result()['extraction']
        facts = header_facts(raw)
        result_only = [f for f in facts if f['key'] == 'result_date']
        self.assertEqual(source_date(result_only, 'general_lab')['value'], '2025-03-20')
        self.assertEqual(source_date(facts, 'pft')['key'], 'result_date')
        raw['header_facts'].append(dict(key='measurement_date', label_raw='Measurement date', value_raw='2025-03-21'))
        self.assertEqual(source_date(header_facts(raw), 'pft')['value'], '2025-03-21')
        raw['header_facts'].append(dict(key='sample_date', label_raw='Collection date', value_raw='2025-03-22'))
        self.assertIsNone(source_date(header_facts(raw), 'general_lab'))
        raw['header_facts'] = [dict(key='sample_date', label_raw='Collection date', value_raw='03/04/2025'),
                               dict(key='result_date', label_raw='Result date', value_raw='2025-03-20')]
        self.assertIsNone(source_date(header_facts(raw), 'general_lab'), 'Ambiguous date must block fallback')

    def test_direct_transport_extends_schema_and_prompt_only_for_direct_images(self):
        body = fixture.image_bytes('transport')
        for native, engine in ((True, 'gemini'), (False, 'tokenharbor')):
            for direct in (False, True):
                with self.subTest(native=native, direct=direct):
                    raw = deepcopy(api_result()['raw_extraction'])
                    raw['rows'] = raw['rows'][:1]
                    if not direct:
                        del raw['header_facts']
                        del raw['pii_boxes']
                        del raw['tables']
                        del raw['rows'][0]['table_index']
                    response = (dict(candidates=[dict(finishReason='STOP', content=dict(parts=[dict(text=json.dumps(raw))]))])
                        if native else dict(choices=[dict(finish_reason='stop', message=dict(content=json.dumps(raw)))], model='synthetic'))
                    opener = Mock(open=Mock(return_value=io.BytesIO(json.dumps(response).encode())))
                    config = dict(native=native, engine=engine, model='synthetic', key='synthetic',
                                  endpoint='https://example.invalid', direct_llm=direct)
                    record = extract_image(body, DICTIONARY, ROOT, config=config, opener=opener)
                    self.assertEqual('header_facts' in record['request_contract']['schema']['properties'], direct)
                    self.assertEqual('pii_boxes' in record['request_contract']['schema']['properties'], direct)
                    self.assertEqual('tables' in record['request_contract']['schema']['properties'], direct)
                    self.assertEqual('SYNTHETIC FULL-IMAGE PROTOTYPE' in record['request_contract']['prompt'], direct)
                    self.assertEqual('table_index' in record['request_contract']['prompt'], direct)
                    if direct:
                        self.assertEqual(record['extraction']['header_facts'], raw['header_facts'])
                        self.assertEqual(record['extraction']['pii_boxes'], raw['pii_boxes'])
                        self.assertEqual(record['extraction']['tables'], raw['tables'])
                        self.assertEqual(record['extraction']['rows'][0]['table_index'], 0)
        self.assertNotIn('header_facts', response_schema(DICTIONARY)['properties'])

    def test_compact_schema_also_accepts_header_facts_without_changing_normal_schema(self):
        schema = response_schema(DICTIONARY, compact_rows=True, direct_llm=True)
        raw = api_result()['raw_extraction']
        raw['rows'] = []
        validate_response(raw, schema)
        self.assertIn('header_facts', schema['required'])
        self.assertIn('pii_boxes', schema['required'])
        self.assertNotIn('header_facts', response_schema(DICTIONARY, compact_rows=True)['properties'])

    def test_compact_direct_transport_retains_table_index(self):
        raw = deepcopy(api_result()['raw_extraction'])
        schema = response_schema(DICTIONARY, compact_rows=True, direct_llm=True)
        raw['rows'] = [{key: row[key] for key in schema['properties']['rows']['items']['required'] if key != 'extra'}
                       | dict(extra=[]) for row in raw['rows']]
        response = dict(choices=[dict(finish_reason='stop', message=dict(content=json.dumps(raw)))], model='synthetic')
        opener = Mock(open=Mock(return_value=io.BytesIO(json.dumps(response).encode())))
        config = dict(native=False, engine='tokenharbor', model='synthetic', key='synthetic',
                      endpoint='https://example.invalid', direct_llm=True, compact_rows=True)
        record = extract_image(fixture.image_bytes('transport'), DICTIONARY, ROOT, config=config, opener=opener)
        self.assertEqual([row['table_index'] for row in record['extraction']['rows']], [0, None])

    def test_table_schema_validates_geometry_and_row_membership_types(self):
        schema = response_schema(DICTIONARY, direct_llm=True)
        raw = api_result()['raw_extraction']
        coordinates = schema['properties']['tables']['items']['properties']['box']['items']
        self.assertEqual((coordinates['minimum'], coordinates['maximum']), (0, 1000))
        validate_response(dict(raw, tables=raw['tables'] + [dict(table_index=1, box=None)]), schema)
        for invalid in (dict(table_index=None, box=None), dict(table_index=True, box=None),
                        dict(table_index=1), dict(box=None), dict(table_index=1, box=[0, 10, 100]),
                        dict(table_index=1, box=[0, 10, 100, '200']),
                        dict(table_index=1, box=[0, 10, 100, 200], label='unexpected')):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_response(dict(raw, tables=[invalid]), schema)
        for invalid in ('0', True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_response(dict(raw, rows=[dict(raw['rows'][0], table_index=invalid)]), schema)
        missing = dict(raw['rows'][0])
        del missing['table_index']
        with self.assertRaises(ValueError):
            validate_response(dict(raw, rows=[missing]), schema)
        for compact in (False, True):
            normal = response_schema(DICTIONARY, compact_rows=compact)
            self.assertNotIn('tables', normal['properties'])
            self.assertNotIn('table_index', normal['properties']['rows']['items']['properties'])

    def test_direct_schema_requires_strict_box_objects(self):
        schema = response_schema(DICTIONARY, direct_llm=True)
        raw = api_result()['raw_extraction']
        raw['header_facts'][0]['box'] = [100, 200, 300, 400]
        validate_response(raw, schema)
        for invalid in (
            dict(kind='patient_name', box=[100, 200, 300]),
            dict(kind='patient_name', box=[100, 200, 300, 400, 500]),
            dict(kind='patient_name', box=[100, 200, '300', 400]),
            dict(kind='patient_name', box=[True, 200, 300, 400]),
            dict(kind='patient_name', box=None),
            dict(kind='unknown', box=[100, 200, 300, 400]),
            dict(kind='patient_name', box=[100, 200, 300, 400], text='unexpected'),
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_response(dict(raw, pii_boxes=[invalid]), schema)
        for key in ('header_facts', 'pii_boxes', 'tables'):
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_response({k: value for k, value in raw.items() if k != key}, schema)
        del raw['header_facts'][0]['box']
        with self.assertRaises(ValueError):
            validate_response(raw, schema)


if __name__ == '__main__':
    unittest.main()
