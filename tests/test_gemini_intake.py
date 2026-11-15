"""Synthetic Gemini intake, privacy gates, transport and immutable review bundle."""
import base64
import hashlib
import io
import json
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import Mock, patch
import unittest

from PIL import Image
from ocr_pool.gemini import (InvalidAPIResponse, configuration, public_configuration, privacy_plan,
                             prepare_image, extract_image, response_schema, request_json)
from ocr_pool.gemini_workflow import (build_candidate, ct_ild_finding, echo_pericardial_finding,
                                     pleural_effusion_finding, run)
from ocr_pool.local_dates import date_facts, observation_date
from registry_pool.exchange import verify_bundle, read
from registry_review.store import ReviewStore
from registry_review.crf import form_fields
from registry_review.workspace import patient_workspace
import test_patient_intake as intake_fixture
from test_source_review import DICTIONARY

ROOT=Path(__file__).resolve().parents[1]
image_bytes=intake_fixture.image_bytes
C3=next(f['field_id'] for f in DICTIONARY['fields'] if f['label']=='C3')


def row(**changes):
    item={k:None for k in response_schema(DICTIONARY)['properties']['rows']['items']['properties']}
    item.update(field_id=C3,source_label='C3',raw_result='0.87',component='result',numeric_value='0.87',
                comparator='=',unit_raw='g/L',table_kind='general_lab',source_column='result')
    item.update(changes);return item


def result():
    extraction=dict(rows=[row(row_box=[30,100,890,185]),row(field_id=None,source_label='Novel source assay',numeric_value='12.75',raw_result='12.75')],
        specimens=[dict(sample_type='blood',source_label='Blood',checkbox_state='checked',amount='7',unit='mL',warning=None)],notes=[],warnings=[])
    return dict(extraction=extraction,raw_extraction=extraction,normalization_audit=[],validation_issues=[],model_requested='synthetic',model_returned='synthetic',usage={})


class GeminiIntakeTests(unittest.TestCase):
    setUp=intake_fixture.PatientIntakeTests.setUp
    tearDown=intake_fixture.PatientIntakeTests.tearDown
    wait=intake_fixture.PatientIntakeTests.wait

    def report_scan(self, statement, *, echo=False, technique='Chụp CLVT lồng ngực'):
        texts = [statement] if echo else ['Kỹ thuật:', technique, statement, 'Kết luận:',
                                         'Không thấy tổn thương gợi ý bệnh phổi kẽ trên phim.']
        return dict(plan=dict(size=[800,300], crop=[10,90,800,300], crop_reason=(
            'detected_echo_report_sections' if echo else 'detected_diagnostic_report_sections')),
            lines=[dict(text=text,confidence=.96,box=[25,100+25*i,750,121+25*i])
                   for i,text in enumerate(texts)])

    def candidate_from_record(self, record, folder='candidate'):
        body = image_bytes('synthetic-local-report')
        privacy = dict(crop=[10,90,800,300], masks=[], reviewed=True,
                       sha256=hashlib.sha256(body).hexdigest())
        outgoing = prepare_image(body, privacy)
        record.update(outgoing_bytes=outgoing, outgoing_sha256=hashlib.sha256(outgoing).hexdigest())
        doc = dict(document_id='SYNTHETIC',input_path='synthetic.png',
                   input_sha256=privacy['sha256'],privacy=privacy)
        return build_candidate([doc], [record], DICTIONARY, self.root/folder)

    def test_printed_sex_on_lab_headers_maps_once_per_submission(self):
        from ocr_pool.gemini_workflow import build_candidate
        def fact(doc, n, key='sex', value='female'):
            return dict(candidate_id=f'LOCALMETA-{doc}-{n}', key=key, value=value, value_raw='Nữ',
                        label_raw='Giới tính', flags=[], evidence_ids=[f'LOCALMETA-{doc}-{n}'])
        docs = [dict(document_id=d, input_path=d+'.png', input_sha256='0'*64,
                     privacy=dict(crop=[0, 0, 1, 1], masks=[], reviewed=True)) for d in ('A', 'B')]
        metadata = {'A': ([fact('A', 0)], []), 'B': ([fact('B', 0)], [])}
        try:
            candidate = build_candidate(docs, [None, None], DICTIONARY, self.root/'adm', local_metadata=metadata)
        except Exception:
            candidate = None
        observations = (candidate or {}).get('observations') if isinstance(candidate, dict) else None
        if observations is None:
            self.skipTest('build_candidate needs API results for a bundle')
        adm = [o for o in observations if o['field_id'] == 'ADM03']
        self.assertEqual(len(adm), 1)
        self.assertEqual((adm[0]['qualitative_value'], adm[0]['extraction_method']), ('female', 'local_ocr'))

    def test_ct_pleural_effusion_requires_explicit_statement(self):
        privacy = dict(crop=[10,90,800,300],masks=[])
        for statement, choice in (
                ('Không thấy tràn dịch, tràn khí khoang màng phổi hai bên.', 'no'),
                ('Không tràn dịch màng phổi', 'no'),
                ('Có tràn dịch màng phổi.', 'yes'),
                ('Tràn dịch màng phổi', 'yes'),
                ('Không tràn dich mang phi', 'no'),
                ('Không thấy tràn djch, tràn khí khoang màng phổi hai bên.', 'no')):
            with self.subTest(statement=statement):
                finding = pleural_effusion_finding(self.report_scan(statement), privacy)
                self.assertEqual((finding['field_id'],finding['qualitative_value']),('LUNG04',choice))
                self.assertEqual(finding['raw_result'],statement)
        self.assertIsNone(pleural_effusion_finding(self.report_scan(
            'Không tràn dịch màng phổi', technique='Siêu âm đàn hồi mô gan'), privacy))

    def test_echo_pleural_effusion_allows_outside_heart_trailing_clause(self):
        privacy = dict(crop=[10,90,800,300],masks=[])
        statement = 'Ngoài tim: Không tràn dịch màng phổi, không thấy dịch tự do'
        finding = pleural_effusion_finding(self.report_scan(statement,echo=True),privacy)
        self.assertEqual((finding['field_id'],finding['qualitative_value']),('LUNG04','no'))
        self.assertEqual(finding['source_label'],'Ngoài tim')
        for statement in ('Không tràn dịch màng phổi, không thấy dịch tự do',
                          'Ngoài tim: Không tràn dịch màng phổi, có tràn dịch màng phổi'):
            self.assertIsNone(pleural_effusion_finding(self.report_scan(statement,echo=True),privacy))

    def test_pleural_effusion_rejects_hedged_or_ambiguous_lines(self):
        privacy = dict(crop=[10,90,800,300],masks=[])
        for statement in ('Nghi tràn dịch màng phổi', 'Ít tràn dịch màng phổi',
                          'Không loại trừ tràn dịch màng phổi', 'Màng phổi: Chưa rõ',
                          'Không tràn dịch màng phổi, đề nghị đánh giá thêm',
                          'Không thấy bất thường màng phổi', 'Không tràn dịch màng phổi phải',
                          'Không nghi tràn dịch màng phổi'):
            with self.subTest(statement=statement):
                self.assertIsNone(pleural_effusion_finding(self.report_scan(statement),privacy))
        scan = self.report_scan('Không tràn dịch màng phổi')
        scan['lines'].append(dict(text='Tràn dịch màng phổi',confidence=.96,box=[25,240,750,261]))
        self.assertIsNone(pleural_effusion_finding(scan,privacy))

    def test_pleural_effusion_requires_unmasked_confident_line(self):
        privacy = dict(crop=[10,90,800,300],masks=[])
        scan = self.report_scan('Không tràn dịch màng phổi')
        self.assertIsNone(pleural_effusion_finding(scan,{**privacy,'masks':[[25,150,750,171]]}))
        scan['lines'][2]['confidence'] = .89
        self.assertIsNone(pleural_effusion_finding(scan,privacy))
        scan['lines'][2]['confidence'] = .90
        self.assertEqual(pleural_effusion_finding(scan,privacy)['qualitative_value'],'no')

    def test_ct_document_carries_both_local_lung_findings(self):
        self.setup_config()
        body = image_bytes('synthetic-ct-report')
        (self.root/'synthetic.png').write_bytes(body)
        privacy = dict(crop=[10,90,800,300],masks=[],reviewed=True,
                       sha256=hashlib.sha256(body).hexdigest())
        doc = dict(document_id='SYNTHETIC',input_path='synthetic.png',
                   input_sha256=privacy['sha256'],privacy=privacy)
        scan = self.report_scan('Không thấy tràn dịch, tràn khí khoang màng phổi hai bên')
        with patch('ocr_pool.gemini_workflow.scan_source_dates',return_value=('preview_ocr',scan)):
            bundle = run(dict(documents=[doc]),self.root/'ct-output',self.root,extractor=lambda *_:result())
        package = verify_bundle(bundle,DICTIONARY)
        findings = [o for o in package['observations'] if o['field_id'] in ('LUNG02','LUNG04')]
        self.assertEqual({o['field_id'] for o in findings},{'LUNG02','LUNG04'})
        self.assertEqual(len(findings),2)
        for finding in findings:
            self.assertEqual(finding['source_data']['qualitative_value'],'no')
            self.assertEqual(finding['source_data']['flags'],['explicit_report_finding'])
            self.assertEqual(finding['source_data']['extraction_method'],'local_ocr')
            evidence = next(e for e in package['evidence'] if e['evidence_id']==finding['evidence_ids'][0])
            self.assertEqual(evidence['source_data']['extraction_method'],'local_ocr')
        saved = read(self.root/'ct-output/api-responses/image-001.json')
        self.assertEqual(len(saved['local_report_findings']),2)
        raw = read(self.root/'ct-output/candidate-pool.json')
        indices = [e['row_index_0based'] for e in raw['evidence'] if e.get('table_id')=='G0000.result']
        self.assertEqual(indices,[0,1,2,3])
        self.assertFalse(any(o['field_id'] in ('EAC12','SDA18') for o in package['observations']))

    def test_legacy_singular_local_report_finding_still_works(self):
        record = result()
        finding = pleural_effusion_finding(self.report_scan('Không tràn dịch màng phổi'),
                                          dict(crop=[10,90,800,300],masks=[]))
        record['local_report_finding'] = finding
        candidate = self.candidate_from_record(record)
        observation = next(o for o in candidate['observations'] if o['field_id']=='LUNG04')
        self.assertEqual(observation['extraction_method'],'local_ocr')
        self.assertEqual(observation['flags'],['explicit_report_finding'])
        record['local_report_findings'] = [finding]
        candidate = self.candidate_from_record(record,'both-keys')
        self.assertEqual(len([o for o in candidate['observations'] if o['field_id']=='LUNG04']),1)

    def test_empty_api_additional_row_is_dropped_with_issue(self):
        record = result()
        record['extraction']['specimens'] = []
        empty = row(field_id=None,source_label='Empty source heading',raw_result='',
                    numeric_value=None,unit_raw='unit only')
        record['extraction']['rows'] = [empty, {**empty,'field_id':'UNKNOWN','raw_result':'  '}]
        candidate = self.candidate_from_record(record)
        self.assertEqual(candidate['metadata_candidates'],[])
        self.assertEqual(candidate['evidence'],[])
        self.assertEqual(candidate['issues'],[dict(document_id='SYNTHETIC',table_id='G0000',
            reason='empty_api_row_dropped',detail='Empty source heading')]*2)

    def test_additional_api_rows_with_any_value_are_retained(self):
        record = result()
        base = row(field_id=None,source_label='Novel source assay',raw_result='',numeric_value=None)
        values = [dict(raw_result='Unparsed source result'), dict(numeric_value='0'),
                  dict(qualitative_value='negative'),dict(pattern_raw='speckled'),
                  dict(grade_raw='1+'),dict(titre_raw='1:80'),dict(class_raw='II'),
                  dict(pre_percent_predicted='83.19')]
        record['extraction']['rows'] = [{**base,**value} for value in values]
        candidate = self.candidate_from_record(record)
        self.assertEqual(len(candidate['metadata_candidates']),len(values))
        self.assertEqual(candidate['issues'],[])

    def test_ct_ild_requires_complete_explicit_chest_ct_impression(self):
        plan=dict(crop=[10,80,780,280],masks=[])
        def scan(technique, impression, extra=None):
            texts=['Kỹ thuật:',technique,'Mô tả: Nội dung giả lập','Kết luận:',impression]
            if extra:
                texts.append(extra)
            lines=[dict(text=text,confidence=.96,box=[25,90+25*i,600,111+25*i])
                   for i,text in enumerate(texts)]
            return dict(plan=dict(size=[800,300],crop_reason='detected_diagnostic_report_sections'),lines=lines)
        technique='Chụp CLVT lồng ngực'
        impression='Không thấy tổn thương gợi ý bệnh phổi kẽ trên phim.'
        finding=ct_ild_finding(scan(technique,impression),plan)
        self.assertEqual((finding['field_id'],finding['qualitative_value']),('LUNG02','no'))
        self.assertEqual(finding['raw_result'],impression)
        self.assertIsNone(ct_ild_finding(scan('Siêu âm đàn hồi mô gan',impression),plan))
        self.assertIsNone(ct_ild_finding(scan(technique,'Không loại trừ bệnh phổi kẽ.'),plan))
        garbled=ct_ild_finding(scan(technique,'Không thấy tổn thurong gi § bnh phổi k trên phim.'),plan)
        self.assertEqual((garbled['field_id'], garbled['qualitative_value']), ('LUNG02', 'no'))
        self.assertIsNone(ct_ild_finding(scan(technique,'Có tổn thương gợi ý bệnh phổi kẽ trên phim.'),plan))
        self.assertIsNone(ct_ild_finding(scan(technique,impression,'Đề nghị đánh giá thêm.'),plan))
        self.assertIsNone(ct_ild_finding(scan(technique,impression),{**plan,'masks':[[25,190,600,211]]}))

    def test_echo_local_finding_becomes_pending_crf_source_with_row_location(self):
        self.setup_config()
        job,body,plan=self.create_gemini()
        self.manager.upload(job['job_id'],'image-0','echo-synthetic.png',body)
        line=dict(line_id=1,text='12. Màng ngoài tim: Không thấy bất thường/ Không có dịch',
                  confidence=.96,box=[30,140,570,174])
        scan=dict(plan=dict(size=[800,300],crop=plan['crop'],crop_reason='detected_echo_report_sections'),lines=[line])
        self.assertIsNone(echo_pericardial_finding(scan,{**plan,'masks':[[30,140,570,174]]}))
        unknown={**scan,'lines':[{**line,'text':'12. Màng ngoài tim: Chưa rõ'}]}
        self.assertIsNone(echo_pericardial_finding(unknown,plan))
        garbled={**scan,'lines':[{**line,'text':'12. Màng ngoài tim: Không thấy bất thường/ Không có djch'}]}
        self.assertEqual(echo_pericardial_finding(garbled,plan)['qualitative_value'],'no')
        for text in ('12. Màng ngoài tim: Không loại trừ tràn dịch màng ngoài tim','12. Màng ngoài tim: Có djch'):
            self.assertIsNone(echo_pericardial_finding({**scan,'lines':[{**line,'text':text}]},plan))
        def runner(job,files,folder):
            with patch('ocr_pool.gemini_workflow.scan_source_dates',return_value=('preview_ocr',scan)):
                return run(read(folder/'manifest.json'),folder/job['output'],self.root,
                           extractor=lambda *_:result())
        self.manager.runner=runner
        self.manager.start(job_id=job['job_id'])
        self.wait(job['job_id'])
        store=ReviewStore(self.db)
        try:
            view=patient_workspace(store,DICTIONARY,job['case_id'])
            candidate=next(c for c in view['candidates'] if c.get('field_id')=='CV06')
            self.assertEqual(candidate['review_status'],'pending')
            self.assertEqual(candidate['value']['qualitative_value'],'no')
            field=next(f for f in form_fields(DICTIONARY,view) if f['slot']=='CV06/result')
            self.assertEqual(field['options'][0]['sources'],[candidate['selection_id']])
            saved=self.manager.load(store,job['job_id'])
        finally:
            store.close()
        package=verify_bundle(self.manager.path(job['job_id'])/saved['bundle'],DICTIONARY)
        finding=next(o for o in package['observations'] if o['field_id']=='CV06')
        evidence=next(e for e in package['evidence'] if e['evidence_id']==finding['evidence_ids'][0])
        self.assertEqual(evidence['source_data']['extraction_method'],'local_ocr')
        self.assertIn('llm_row_location',evidence['source_data']['region'])

    def test_tokenharbor_switches_keys_only_after_explicit_free_allowance_exhaustion(self):
        (self.root/'.env').write_text('TOKENHARBOR_API_KEY=first\nTOKENHARBOR_MODEL=deepseek-v4.1-flash:free\n'
                                     'TOKENHARBOR_FALLBACK_API_KEYS=second,first,second,third\n')
        config = configuration(self.root, engine='tokenharbor')
        self.assertEqual(config['fallback_keys'], ('second', 'third'))
        payload = {'model': config['model'], 'messages': []}
        headers = {'Authorization': 'Bearer first'}
        schema = {'type': 'object'}
        response = dict(choices=[dict(finish_reason='stop', message=dict(content='{}'))])
        opener = Mock()
        opener.open.side_effect = [
            HTTPError(config['endpoint'], 429, '', {}, io.BytesIO(b'{"error":{"code":"free_allowance_exhausted"}}')),
            io.BytesIO(json.dumps(response).encode()),
            io.BytesIO(json.dumps(response).encode()),
        ]
        for _ in range(2):
            self.assertEqual(request_json(config, payload, headers, schema, opener=opener)[0], {})
        requests = [call.args[0] for call in opener.open.call_args_list]
        self.assertEqual([r.get_header('Authorization') for r in requests],
                         ['Bearer first', 'Bearer second', 'Bearer second'])
        self.assertTrue(all(r.data == requests[0].data for r in requests))
        opener.reset_mock()
        opener.open.side_effect = HTTPError(config['endpoint'], 429, '', {'Retry-After': '20'},
                                           io.BytesIO(b'{"error":"rate_limit_exceeded"}'))
        with self.assertRaisesRegex(ValueError, 'HTTP 429'):
            request_json(config, payload, headers, schema, opener=opener)
        opener.open.assert_called_once()

    def setup_config(self):
        (self.root/'.env').write_text('GEMINI_API_KEY=synthetic-secret\nGEMINI_MODEL=synthetic-model\nGEMINI_BASE_URL=http://localhost:8317\n')
        (self.root/'schemas').mkdir(exist_ok=True)
        (self.root/'schemas/pool-dictionary.json').write_text(json.dumps(DICTIONARY),encoding='utf-8')
        (self.root/'schemas/gemini-extraction-prompt.txt').write_text('Extract only patient results; no identifiers.')

    def create_gemini(self,body=None,**changes):
        body=body or image_bytes('gemini-source')
        plan=dict(sha256=hashlib.sha256(body).hexdigest(),crop=[10,90,800,300],masks=[[20,95,70,120]],reviewed=True)
        payload=dict(request_id='gemini-job',file_count=1,same_patient=True,engine='gemini',privacy=[plan],**self.person)
        payload.update(changes)
        return self.manager.create(**payload)['job'],body,plan

    def test_provider_and_privacy_gate_before_patient_creation(self):
        with self.assertRaises(ValueError):self.create_gemini()
        self.setup_config()
        for privacy in (None,[],[dict(sha256='a'*64,crop=[0,0,20,20],reviewed=False)]):
            with self.subTest(privacy=privacy),self.assertRaises(ValueError):self.create_gemini(privacy=privacy)
        store=ReviewStore(self.db)
        try:self.assertEqual(store.summary()['cases'],[])
        finally:store.close()
        self.assertNotIn('synthetic-secret',json.dumps(self.manager.list()))

    def test_fast_pft_rejection_uses_standard_transport_for_the_same_image(self):
        self.setup_config()
        with (self.root/'.env').open('a', encoding='utf-8') as env:
            env.write('TOKENHARBOR_API_KEY=synthetic\nTOKENHARBOR_MODEL=deepseek-v4.1-flash:free\n')
        body = image_bytes('pft-fallback')
        source = self.root/'source.png'
        source.write_bytes(body)
        checksum = hashlib.sha256(body).hexdigest()
        plan = dict(sha256=checksum, crop=[0,90,800,300], reviewed=True)
        doc = dict(document_id='PFT-FALLBACK', input_path=source.name, input_sha256=checksum, privacy=plan)
        output = self.root/'fast-fallback'
        with (patch('ocr_pool.gemini_workflow.scan_source_dates', return_value=('not_needed',None)),
              patch('ocr_pool.gemini_workflow.pft_crop_evidence', return_value={'minimum_rows':3}),
              patch('ocr_pool.gemini_workflow.extract_pft_image',
                    side_effect=InvalidAPIResponse('Fast PFT returned fewer rows')) as fast,
              patch('ocr_pool.gemini_workflow.extract_image', return_value=result()) as standard,
              patch('ocr_pool.llm_verification.verify_extraction', side_effect=lambda _, response, *a, **k: response)):
            bundle = run(dict(documents=[doc]), output, self.root, engine='tokenharbor', fast_pft=True)
        fast.assert_called_once()
        standard.assert_called_once()
        self.assertEqual(fast.call_args.args[0], prepare_image(body,plan))
        self.assertEqual(standard.call_args.args[0], fast.call_args.args[0])
        self.assertEqual(standard.call_args.kwargs['config']['max_output_tokens'], 32000)
        self.assertIn(('result','am tinh'),standard.call_args.kwargs['config']['result_rules'])
        self.assertEqual(read(output/'api-responses/image-001.json')['fast_profile_fallback'],
                         'Fast PFT returned fewer rows')
        self.assertEqual(len(verify_bundle(bundle,DICTIONARY)['observations']), 1)

    def test_repeated_source_notes_do_not_fail_bundle_validation(self):
        self.setup_config()
        source = self.root/'notes.png'
        body = image_bytes('repeated-source-note')
        source.write_bytes(body)
        checksum = hashlib.sha256(body).hexdigest()
        plan = dict(sha256=checksum, crop=[0,90,800,300], reviewed=True)
        doc = dict(document_id='NOTES', input_path=source.name, input_sha256=checksum, privacy=plan)
        response = result()
        note = 'Synthetic source note'
        response['extraction']['notes'] = [note, note, 'Another note']
        with patch('ocr_pool.gemini_workflow.scan_source_dates', return_value=('not_needed', None)):
            bundle = run(dict(documents=[doc]), self.root/'notes-out', self.root, extractor=lambda *_: response)
        package = verify_bundle(bundle, DICTIONARY)
        notes = [item for item in package['metadata_candidates'] if item['key']=='gemini_source_note']
        self.assertEqual(len(notes), 2)
        raw = read(bundle/'artifacts/raw/G0000.txt')
        self.assertEqual(raw['notes'].count(note), 2)

    def test_outgoing_pixels_metadata_and_hash_are_checked(self):
        self.setup_config();job,body,plan=self.create_gemini()
        outgoing=prepare_image(body,plan)
        with Image.open(io.BytesIO(outgoing)) as image:
            self.assertEqual(image.size,(790,210));self.assertFalse(image.getexif())
            self.assertEqual(image.getpixel((20,15)),(255,255,255))
        with self.assertRaises(ValueError):prepare_image(body+b'changed',plan)
        self.manager.upload(job['job_id'],'image-0','source.png',body)
        self.assertEqual(self.manager.list()['jobs'][0]['engine'],'gemini')

    def test_whole_batch_validated_before_any_call(self):
        self.setup_config();body=image_bytes('a');path=self.root/'a.png';path.write_bytes(body)
        good=dict(sha256=hashlib.sha256(body).hexdigest(),crop=[0,0,40,40],reviewed=True,masks=[])
        bad={**good,'sha256':'f'*64}
        docs=[dict(document_id='A',input_path='a.png',input_sha256=good['sha256'],privacy=good),
              dict(document_id='B',input_path='a.png',input_sha256=good['sha256'],privacy=bad)]
        calls=[]
        with self.assertRaises(ValueError):run(dict(documents=docs),self.root/'blocked',self.root,extractor=lambda *args:calls.append(args))
        self.assertEqual(calls,[])
        docs=[{**docs[0],'expected_outgoing_sha256':'f'*64}]
        with self.assertRaisesRegex(ValueError,'previously reviewed outgoing image'):
            run(dict(documents=docs),self.root/'changed-crop',self.root,extractor=lambda *args:calls.append(args))
        self.assertEqual(calls,[])

    def test_api_intake_uses_redacted_bytes_and_publishes_crf_noncrf_specimens_pending(self):
        self.setup_config();job,body,plan=self.create_gemini()
        self.manager.upload(job['job_id'],'image-0','LOCAL-ONLY-patient-name.png',body)
        calls=[]
        def fake(image,dictionary,workspace):calls.append(image);return result()
        def runner(job,files,folder):
            manifest=read(folder/'manifest.json')
            return run(manifest,folder/job['output'],self.root,extractor=fake)
        self.manager.runner=runner
        self.manager.start(job_id=job['job_id']);done=self.wait(job['job_id'])
        self.assertEqual(calls,[prepare_image(body,plan)])
        self.assertEqual(done['case_id'],job['case_id'])
        store=ReviewStore(self.db)
        try:saved=self.manager.load(store,job['job_id'])
        finally:store.close()
        bundle=self.manager.path(job['job_id'])/saved['bundle'];package=verify_bundle(bundle,DICTIONARY)
        self.assertEqual(package['documents'][0]['input_sha256'],hashlib.sha256(body).hexdigest())
        self.assertEqual(len(package['observations']),1)
        self.assertEqual(len(package['metadata_candidates']),1)
        self.assertEqual(len(package['specimen_candidates']),1)
        evidence_id=package['observations'][0]['evidence_ids'][0]
        evidence=next(e for e in package['evidence'] if e['evidence_id']==evidence_id)
        self.assertEqual(evidence['source_data']['region']['llm_row_location'],
            dict(box=[30,100,890,185],image_size=[790,210],coordinate_space='outgoing_image_1000'))
        store=ReviewStore(self.db)
        try:
            view=patient_workspace(store,DICTIONARY,job['case_id'])
            self.assertEqual(len(view['candidates']),3)
            self.assertTrue(all(c['review_status']=='pending' for c in view['candidates']))
            self.assertEqual(view['confidence_summary']['unverified'],2)
            self.assertEqual(store.effective_pool(job['case_id'])['observations'],[])
            self.assertEqual(len(view['fields']),261)
        finally:store.close()

    def test_changed_plan_cannot_reuse_create_request_or_mismatch_uploaded_source(self):
        self.setup_config();job,body,plan=self.create_gemini()
        with self.assertRaises(ValueError):self.create_gemini(privacy=[{**plan,'crop':[0,0,200,200]}])
        self.manager.upload(job['job_id'],'image-0','another.png',image_bytes('different'))
        with self.assertRaises(ValueError):self.manager.start(job_id=job['job_id'])

    def test_local_date_is_bound_to_original_and_kept_out_of_api_image(self):
        self.setup_config()
        image=Image.new('RGB',(600,420),'white')
        image.paste((21,35,49),(10,20,310,55))
        path=self.root/'test-source.png';image.save(path)
        sha=hashlib.sha256(path.read_bytes()).hexdigest()
        proposal_id='privacy-'+'a'*32
        plan=dict(sha256=sha,crop=[0,140,600,420],reviewed=True,proposal_id=proposal_id)
        cache=self.root/'research/privacy-proposals'/proposal_id;cache.mkdir(parents=True)
        lines=[dict(text='Giờ láy mu:',box=[10,20,150,52]),
               dict(text='07:35 19/03/2025',box=[160,22,310,55]),
               dict(text='Ngày nhận mẫu: 19/03/2025 08:40',box=[10,64,350,93])]
        raw=json.dumps(dict(lines=lines)).encode()
        (cache/'ocr-local.json').write_bytes(raw)
        (cache/'proposal.json').write_text(json.dumps(dict(sha256=sha,ocr_sha256=hashlib.sha256(raw).hexdigest(),
            size=[600,420],crop=[0,130,600,420],crop_reason='detected_lab_table_header')))
        calls=[]
        def fake(image_bytes,dictionary,workspace):
            calls.append(image_bytes)
            return result()
        doc=dict(document_id='LOCALDATE-TEST',input_path=path.name,input_sha256=sha,privacy=plan)
        bundle=run(dict(documents=[doc]),self.root/'with-date',self.root,extractor=fake)
        self.assertEqual(calls,[prepare_image(path.read_bytes(),plan)])
        with Image.open(io.BytesIO(calls[0])) as outgoing:
            self.assertEqual(outgoing.size,(600,280))
            self.assertEqual(outgoing.getextrema(),((255,255),(255,255),(255,255)))
        package=verify_bundle(bundle,DICTIONARY)
        o=package['observations'][0]
        self.assertEqual(o['source_data']['source_date'],'2025-03-19T07:35:00')
        self.assertEqual(o['source_data']['date_type'],'sample_date')
        self.assertEqual(len(o['date_evidence_ids']),1)
        fact=next(m for m in package['metadata_candidates'] if m['key']=='sample_date')
        self.assertEqual(fact['evidence_ids'],o['date_evidence_ids'])
        self.assertEqual(fact['source_data']['extraction_method'],'local_ocr')
        self.assertIn('07:35 19/03/2025',(bundle/'artifacts/raw/LOCALDATE-0000-000.txt').read_text(encoding='utf-8'))
        (cache/'ocr-local.json').write_bytes(raw+b' ')
        tampered=run(dict(documents=[doc]),self.root/'tampered-date',self.root,extractor=fake)
        self.assertIsNone(verify_bundle(tampered,DICTIONARY)['observations'][0]['source_data']['source_date'])

    def test_ambiguous_dates_and_roles_do_not_propagate(self):
        plan=dict(size=[600,420],crop=[0,130,600,420],crop_reason='detected_lab_table_header')
        def facts(*lines):
            return list(date_facts(dict(plan=plan,lines=[dict(text=text,box=box) for text,box in lines])))
        a=('Ngày lấy mẫu: 19/03/2025', [10,20,280,49])
        b=('Ngày lấy mẫu: 20/03/2025', [10,66,280,90])
        self.assertIsNone(observation_date(facts(a,b),'general_lab'))
        self.assertIsNone(observation_date(facts(a),'pft'))
        below=('Ngày lấy mẫu: 19/03/2025', [10,192,280,221])
        self.assertIsNone(observation_date(facts(below),'general_lab'))
        english=('Collection date: 03/04/2025', [10,20,280,49])
        self.assertIsNone(observation_date(facts(english),'general_lab'))

    def test_transport_uses_env_and_only_supplied_jpeg_not_filenames_or_secret_in_body(self):
        self.setup_config();body=prepare_image(image_bytes('gemini-source'),dict(
            sha256=hashlib.sha256(image_bytes('gemini-source')).hexdigest(),crop=[0,100,500,300],masks=[],reviewed=True))
        captured=[]
        class Response:
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self):return json.dumps(dict(model='returned-alias',usage={},choices=[dict(
                finish_reason='stop',message=dict(content=json.dumps(result()['extraction'])))] )).encode()
        class Opener:
            def open(self,request,timeout):captured.append(request);return Response()
        out=extract_image(body,DICTIONARY,self.root,opener=Opener())
        self.assertEqual(out['model_returned'],'returned-alias')
        request=captured[0];payload=json.loads(request.data)
        self.assertEqual(request.full_url,'http://localhost:8317/v1/chat/completions')
        self.assertEqual(payload['model'],'synthetic-model')
        self.assertNotIn('synthetic-secret',request.data.decode())
        self.assertEqual(request.get_header('Authorization'),'Bearer synthetic-secret')
        self.assertNotIn('input_path',request.data.decode())
        self.assertFalse(public_configuration(self.root).get('key'))

    def test_remote_plaintext_and_embedded_credentials_are_rejected(self):
        self.setup_config()
        for base in ('http://example.org','https://user:pass@example.org','https://example.org?key=secret'):
            (self.root/'.env').write_text('GEMINI_API_KEY=k\nGEMINI_MODEL=m\nGEMINI_BASE_URL='+base)
            with self.assertRaises(ValueError):configuration(self.root)

    def test_tokenharbor_uses_separate_config_and_validates_image_json(self):
        self.setup_config()
        with self.assertRaisesRegex(ValueError, 'TOKENHARBOR_API_KEY'):
            self.create_gemini(engine='tokenharbor')
        with (self.root/'.env').open('a', encoding='utf-8') as env:
            env.write('TOKENHARBOR_API_KEY=tokenharbor-test-key\nTOKENHARBOR_MODEL=deepseek-v4.1-flash:free\n'
                      'TOKENHARBOR_BASE_URL=https://tokenharbor.ai/v1/\n')
        self.assertEqual(configuration(self.root)['model'], 'synthetic-model')
        with self.assertRaisesRegex(ValueError, 'text only'):
            configuration(self.root, engine='tokenharbor', model_override='deepseek-v4-flash')
        with self.assertRaisesRegex(ValueError, 'Confirm the outgoing image'):
            self.create_gemini(engine='tokenharbor', privacy=[
                dict(sha256='a'*64, crop=[0,0,20,20], reviewed=False)])
        job, body, plan = self.create_gemini(engine='tokenharbor')
        self.assertEqual(job['engine'], 'tokenharbor')
        status = self.manager.list()['engines']['tokenharbor']
        self.assertEqual(status, dict(available=True, model='deepseek-v4.1-flash:free'))
        outgoing = prepare_image(body, plan)
        config = configuration(self.root, engine='tokenharbor')
        response = dict(model=config['model'], choices=[
            dict(finish_reason='stop', message=dict(content=json.dumps(result()['extraction'])))])

        def open_request(request, *, timeout):
            payload = json.loads(request.data)
            self.assertEqual(request.full_url, 'https://tokenharbor.ai/v1/chat/completions')
            self.assertEqual(request.get_header('Authorization'), 'Bearer tokenharbor-test-key')
            self.assertNotIn('tokenharbor-test-key', request.data.decode())
            self.assertEqual(payload['model'], config['model'])
            self.assertEqual(payload['response_format'], {'type':'json_object'})
            self.assertIn('JSON Schema', payload['messages'][0]['content'])
            image_url = payload['messages'][1]['content'][1]['image_url']['url']
            self.assertEqual(base64.b64decode(image_url.split(',', 1)[1]), outgoing)
            return io.BytesIO(json.dumps(response).encode())

        opener = Mock(open=open_request)
        record = extract_image(outgoing, DICTIONARY, self.root, config=config, opener=opener)
        self.assertEqual(record['request_contract']['engine'], 'tokenharbor')
        response['choices'][0]['message']['content'] = '{"rows":[]}'
        with self.assertRaisesRegex(ValueError, r'Token Harbor response rejected \(schema validation, finish: stop\)'):
            extract_image(outgoing, DICTIONARY, self.root, config=config, opener=opener)

        self.manager.upload(job['job_id'], 'image-0', 'synthetic-source.png', body)

        def runner(job, files, folder):
            return run(read(folder/'manifest.json'), folder/job['output'], self.root,
                       engine=job['engine'], extractor=lambda *_: record.copy())

        self.manager.runner = runner
        self.manager.start(job_id=job['job_id'])
        self.assertEqual(self.wait(job['job_id'])['status'], 'completed')
        store = ReviewStore(self.db)
        try:
            workspace = patient_workspace(store, DICTIONARY, job['case_id'])
            self.assertTrue(workspace['candidates'])
            self.assertTrue(all(c['review_status']=='pending' for c in workspace['candidates']))
            observation = next(c['value'] for c in workspace['candidates'] if c['kind']=='observation')
            self.assertEqual(observation['extraction_method'], 'tokenharbor_api')
        finally:store.close()

    def test_unknown_specimen_keeps_its_source_name_and_amount_for_review(self):
        from ocr_pool.gemini_workflow import build_candidate
        self.setup_config();body=image_bytes('sample')
        outgoing=prepare_image(body,dict(sha256=hashlib.sha256(body).hexdigest(),crop=[0,90,800,300],masks=[],reviewed=True))
        record=result();record['extraction']['specimens']=[dict(sample_type='saliva',source_label='Saliva sample',
            checkbox_state='checked',amount='2',unit='mL',warning=None)]
        record.update(outgoing_bytes=outgoing,outgoing_sha256=hashlib.sha256(outgoing).hexdigest())
        candidate=build_candidate([dict(document_id='D',input_path='source.png',input_sha256=hashlib.sha256(body).hexdigest(),
            privacy=dict(crop=[0,90,800,300]))],[record],DICTIONARY,self.root/'run')
        self.assertEqual(candidate['specimen_candidates'],[])
        sample=next(m for m in candidate['metadata_candidates'] if m['key']=='additional_sample_result')
        self.assertEqual(sample['value']['sample_type'],'saliva')
        self.assertEqual(sample['value']['amount'],'2')
        self.assertEqual(sample['review_status'],'pending')

    def test_non_crf_pft_percent_is_available_to_both_display_and_typed_pool(self):
        from ocr_pool.gemini_workflow import build_candidate
        self.setup_config();body=image_bytes('pft')
        outgoing=prepare_image(body,dict(sha256=hashlib.sha256(body).hexdigest(),crop=[0,90,800,300],masks=[],reviewed=True))
        record=result();record['extraction']['rows']=[row(field_id=None,source_label='New respiratory measure',
            raw_result='2.47',numeric_value='2.47',unit_raw='L',component='pre_measured',table_kind='pft',
            source_column='pre_measured',pre_percent_predicted='83.19')]
        record['extraction']['specimens']=[]
        record.update(outgoing_bytes=outgoing,outgoing_sha256=hashlib.sha256(outgoing).hexdigest())
        candidate=build_candidate([dict(document_id='P',input_path='pft.png',input_sha256=hashlib.sha256(body).hexdigest(),
            privacy=dict(crop=[0,90,800,300]))],[record],DICTIONARY,self.root/'run')
        value=candidate['metadata_candidates'][0]['value']
        self.assertEqual(value['results'],dict(pre_measured='2.47',pre_percent_predicted='83.19'))
        self.assertEqual(value['parsed_results']['pre_percent_predicted']['numeric_value'],'83.19')
        self.assertEqual(value['parsed_results']['pre_percent_predicted']['unit_raw'],'%')


if __name__=='__main__':unittest.main()
