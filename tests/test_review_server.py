"""Exercise HTTP review and source verification using synthetic local assets."""
import copy
import csv
import hashlib
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import zipfile
from urllib.parse import urlencode

from PIL import Image,ImageDraw
from ocr_pool import convert_documents
from registry_pool.dictionary import build_dictionary,digest
from registry_pool.exchange import build_bundle
from registry_pool.store import Registry
from registry_review import ReviewStore
from registry_review.server import create_server,ReviewApplication

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)


def synthetic_bundle(root,dictionary=DICTIONARY,*,source_fields=False):
    """Source and every record are artificial; suitable for interactive demos."""
    run=root/'run'
    (run/'raw').mkdir(parents=True)
    (run/'crops').mkdir()
    image=Image.new('RGB',(900,350),'white')
    draw=ImageDraw.Draw(image)
    draw.text((30,30),'SYNTHETIC DEMO - NO PATIENT DATA',fill='black',font_size=26)
    draw.text((30,100),'Test                    Result              Unit',fill='black',font_size=25)
    draw.line((25,145,860,145),fill='gray',width=2)
    draw.text((30,180),'C3                      0.65                g/L',fill='black',font_size=26)
    image.save(root/'source.png')
    image.save(run/'crops'/'T.png')
    raw='Test\tResult\tUnit\nC3\t0.65\tg/L'
    (run/'raw'/'T.txt').write_text(raw,encoding='utf-8')
    document=dict(document_id='SYNTHETIC',input_path='source.png',
        input_sha256=hashlib.sha256((root/'source.png').read_bytes()).hexdigest(),
        tables=[dict(table_id='T',raw=raw,format='auto')])
    if source_fields:
        header='SID: FUTURE-123'
        form=('Sample type\tTime of collection\tAmount collected\tCell conc. (cell/mL)\tCell loaded on chip\tNote\n'
              '☑ Blood\t10:30 bad-date\t4 mL\t\t\t')
        document['text_regions']=[dict(table_id='H',raw=header,purpose='metadata')]
        document['tables'].append(dict(table_id='F',raw=form,format='auto'))
        for key,text in [('H',header),('F',form)]:
            image.save(run/'crops'/(key+'.png'))
            (run/'raw'/(key+'.txt')).write_text(text,encoding='utf-8')
    source=convert_documents([document],CATALOG)
    if source_fields:
        from form_pool.sample_collection import extract_sample_collections
        forms=extract_sample_collections([document],date_order='DMY')
        source.update(schema_version='lupus-candidate-pool-0.3',specimen_schema_version=forms['schema_version'],specimen_candidates=forms['candidates'])
        for evidence in forms['evidence']:
            evidence.update(evidence_kind='sample_form_row',result_column_0based=None)
        source['evidence'].extend(forms['evidence'])
    (run/'candidate-pool.json').write_text(json.dumps(source),encoding='utf-8')
    package=build_bundle(run,root/'bundle',dictionary,root,package_id='SYNTHETIC-UI')
    registry=Registry(root/'synthetic.sqlite')
    try:
        registry.import_package(package,dictionary)
    finally:
        registry.close()
    return package


class ReviewServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.package=synthetic_bundle(self.root)
        self.server,self.app=create_server(self.root/'synthetic.sqlite',[self.root/'bundle'],port=0,synthetic=True)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':0.02},daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.tmp.cleanup()

    def request(self,path,payload=None,headers=None):
        connection=HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        standard={'X-Review-Token':self.app.token,'Content-Type':'application/json'} if payload is not None else {}
        standard.update(headers or {})
        connection.request('POST' if payload is not None else 'GET',path,
            body=json.dumps(payload).encode() if payload is not None else None,headers=standard)
        response=connection.getresponse()
        status,response_headers,body=response.status,dict(response.getheaders()),response.read()
        connection.close()
        return status,response_headers,body

    def api(self,path,payload=None,expected=200):
        status,headers,body=self.request(path,payload)
        self.assertEqual(status,expected,body)
        self.assertEqual(headers['Cache-Control'],'no-store')
        return json.loads(body)

    def view(self):
        return self.api('/api/package?'+urlencode(dict(package_id='SYNTHETIC-UI',revision=1)))

    def test_crf_knowledge_can_be_read_without_a_patient(self):
        library = self.api('/api/crf/knowledge')
        version = library['version']
        self.assertIn(version, library['available_versions'])
        self.assertEqual(self.api('/api/crf/knowledge?'+urlencode({'version':version}))['rules'], library['rules'])
        self.assertEqual(library['rules']['EAC12']['fields'], ['CV06'])

    def case_and_assignment(self):
        person=dict(actor='Synthetic reviewer',role='source_reviewer')
        case=self.api('/api/cases',dict(registry_code='DEMO-ONLY',**person))
        assignment=self.api('/api/assign',dict(document_id=self.package['documents'][0]['document_id'],
            case_id=case['case_id'],reason='Synthetic test only',**person))
        return case,assignment

    def review_payload(self,assignment):
        return dict(package_id='SYNTHETIC-UI',revision=1,
            observation_id=self.package['observations'][0]['observation_id'],
            action='accept',actor='Synthetic reviewer',role='source_reviewer',reason='Synthetic test only',
            expected_assignment_id=assignment['assignment_id'])

    def test_page_sources_and_pending_history_are_visible(self):
        status,headers,body=self.request('/')
        self.assertEqual(status,200)
        self.assertIn('frame-ancestors',headers['Content-Security-Policy'])
        self.assertNotIn(b'{{CSRF_TOKEN}}',body)
        self.assertIn(self.app.token.encode(),body)
        view=self.view()
        self.assertTrue(view['source_available'])
        self.assertEqual(view['observations'][0]['history'],[])
        self.assertIsNone(view['documents'][0]['assignment'])
        evidence=view['observations'][0]['evidence'][0]
        status,headers,body=self.request(evidence['crop_url'])
        self.assertEqual(status,200)
        self.assertEqual(headers['Content-Type'],'image/png')
        self.assertTrue(body.startswith(b'\x89PNG'))
        self.assertIn(b'C3',self.request(evidence['raw_url'])[2])

    def test_complete_human_workflow_exports_only_explicit_accepted_values(self):
        case,assignment=self.case_and_assignment()
        before=self.api('/api/effective?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(before['observations'],[])
        decision=self.api('/api/review',self.review_payload(assignment))
        view=self.view()
        self.assertEqual(view['observations'][0]['history'][0]['review_id'],decision['review_id'])
        status,headers,body=self.request('/api/export?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(status,200)
        self.assertIn('attachment',headers['Content-Disposition'])
        exported=json.loads(body)
        self.assertEqual(exported['observations'][0]['value']['numeric_value'],'0.65')
        self.assertNotIn('review_status',exported['observations'][0]['value'])
        self.assertEqual(exported['excluded_conflict_count'],0)
        registry=Registry(self.root/'synthetic.sqlite')
        try:
            self.assertEqual(registry.package('SYNTHETIC-UI'),self.package)
        finally:
            registry.close()

    def test_untrusted_origin_host_and_missing_token_cannot_mutate(self):
        payload=dict(registry_code='BLOCKED',actor='X',role='source_reviewer')
        for headers in [{'Origin':'https://example.org'},{'Host':'example.org'},
                        {'Sec-Fetch-Site':'cross-site'},{'X-Review-Token':''}]:
            status,_,_=self.request('/api/cases',payload,headers)
            self.assertEqual(status,403)
        self.assertEqual(self.api('/api/summary')['cases'],[])

    def test_source_changes_after_load_block_acceptance(self):
        _,assignment=self.case_and_assignment()
        raw=self.root/'bundle/artifacts/raw/T.txt'
        raw.write_text('changed',encoding='utf-8')
        self.api('/api/review',self.review_payload(assignment),expected=400)
        self.assertEqual(self.view()['observations'][0]['history'],[])
        self.assertEqual(self.request(self.view()['observations'][0]['evidence'][0]['raw_url'])[0],400)

    def test_changed_bundle_manifest_cannot_replace_startup_source(self):
        _,assignment=self.case_and_assignment()
        manifest=self.root/'bundle/package.json'
        altered=json.loads(manifest.read_text(encoding='utf-8'))
        altered['source_issues'].append(dict(reason='changed after page load'))
        manifest.write_text(json.dumps(altered),encoding='utf-8')
        result=self.api('/api/review',self.review_payload(assignment),expected=400)
        self.assertIn('changed',result['error'])
        self.assertEqual(self.view()['observations'][0]['history'],[])

    def test_missing_bundle_disables_acceptance_but_allows_pending_inspection(self):
        app=ReviewApplication(self.root/'synthetic.sqlite')
        store=ReviewStore(self.root/'synthetic.sqlite')
        try:
            view=app.package_view(store,'SYNTHETIC-UI',1)
        finally:
            store.close()
        self.assertFalse(view['source_available'])
        self.assertIsNone(view['observations'][0]['evidence'][0]['crop_url'])
        self.app.bundles.clear()
        _,assignment=self.case_and_assignment()
        self.api('/api/review',self.review_payload(assignment),expected=400)

    def test_cannot_serve_unlisted_or_escaping_assets(self):
        for key in ['../synthetic.sqlite','artifacts/raw/unknown.txt']:
            status,_,_=self.request('/asset?'+urlencode(dict(package_id='SYNTHETIC-UI',revision=1,key=key)))
            self.assertEqual(status,404)

    def test_missing_database_is_not_silently_created(self):
        path=self.root/'missing.sqlite'
        with self.assertRaises(FileNotFoundError):
            ReviewApplication(path)
        self.assertFalse(path.exists())

    def test_older_accepted_results_are_offered_for_explicit_replacement(self):
        _,assignment=self.case_and_assignment()
        decision=self.api('/api/review',self.review_payload(assignment))
        second=copy.deepcopy(self.package)
        second.update(revision=2,supersedes={'package_id':'SYNTHETIC-UI','revision':1})
        store=ReviewStore(self.root/'synthetic.sqlite')
        try:
            store.registry.import_package(second,DICTIONARY)
            view=self.app.package_view(store,'SYNTHETIC-UI',2)
        finally:
            store.close()
        options=view['observations'][0]['replacement_options']
        self.assertEqual(len(options),1)
        self.assertEqual(options[0]['review_ids'],[decision['review_id']])
        self.assertEqual(options[0]['value']['numeric_value'],'0.65')

    def test_export_excludes_conflicting_accepted_values(self):
        case,assignment=self.case_and_assignment()
        self.api('/api/review',self.review_payload(assignment))
        second=copy.deepcopy(self.package)
        second.update(revision=2,supersedes={'package_id':'SYNTHETIC-UI','revision':1})
        store=ReviewStore(self.root/'synthetic.sqlite')
        try:
            store.registry.import_package(second,DICTIONARY)
            store.review('SYNTHETIC-UI',2,second['observations'][0]['observation_id'],
                action='correct',changes={'numeric_value':'0.7'},reason='Synthetic conflict',
                actor='Synthetic reviewer',role='source_reviewer',expected_assignment_id=assignment['assignment_id'])
        finally:
            store.close()
        view=self.api('/api/effective?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(len(view['observations']),2)
        self.assertTrue(all(not o['eligible_for_verified_pool'] for o in view['observations']))
        exported=self.api('/api/export?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(exported['observations'],[])
        self.assertEqual(exported['excluded_conflict_count'],2)

    def source_payload(self,request_id='synthetic-source-request',action='approve'):
        view=self.view()
        item=view['observations'][0]
        return dict(package_id=view['package_id'],revision=view['revision'],request_id=request_id,
            expected_package_sha256=view['package_sha256'],actor='Synthetic source reviewer',role='source_reviewer',
            reason='Synthetic source comparison only',decisions=[dict(candidate_type='observation',
                candidate_id=item['observation_id'],action=action,expected_review_id=item['source_review']['review_id'] if item['source_review'] else None,
                expected_candidate_sha256=item['source_candidate_sha256'])])

    def test_source_approval_and_export_are_visible_without_assigning_a_case(self):
        decision=self.api('/api/source-review',self.source_payload())
        view=self.view()
        self.assertEqual(view['source_review_summary']['observations']['approved'],1)
        self.assertEqual(view['observations'][0]['source_review_status'],'source_verified')
        self.assertEqual(view['observations'][0]['source_review']['batch_id'],decision['batch']['batch_id'])
        self.assertEqual(view['observations'][0]['history'],[])
        self.assertIsNone(view['documents'][0]['assignment'])
        exported=self.api('/api/source-reviewed?'+urlencode(dict(package_id='SYNTHETIC-UI',revision=1)))
        self.assertEqual(exported['observations'][0]['value']['numeric_value'],'0.65')
        self.assertFalse(exported['observations'][0]['eligible_for_verified_pool'])
        self.assertEqual(len(exported['fields']),261)
        self.assertEqual(self.api('/api/summary')['cases'],[])

    def test_tampered_source_or_missing_bundle_blocks_source_approval_and_export(self):
        payload=self.source_payload()
        (self.root/'bundle/artifacts/raw/T.txt').write_text('changed',encoding='utf-8')
        self.api('/api/source-review',payload,expected=400)
        self.assertEqual(self.view()['observations'][0]['source_review_history'],[])
        query='/api/source-reviewed?'+urlencode(dict(package_id='SYNTHETIC-UI',revision=1))
        self.api(query,expected=400)
        self.app.bundles.clear()
        self.api('/api/source-review',payload,expected=400)
        self.api(query,expected=400)

    def test_source_withdrawal_revises_export_and_stale_tab_cannot_restore_approval(self):
        stale=self.source_payload()
        self.api('/api/source-review',stale)
        stale['request_id']='stale-source-tab'
        self.api('/api/source-review',stale,expected=400)
        self.api('/api/source-review',self.source_payload(request_id='synthetic-withdraw',action='withdraw'))
        exported=self.api('/api/source-reviewed?'+urlencode(dict(package_id='SYNTHETIC-UI',revision=1)))
        self.assertEqual(exported['observations'],[])
        self.assertEqual(exported['summary']['observations']['excluded'],1)

    def preview(self,case,encounter=None):
        return self.api('/api/exports/preview',dict(case_id=case['case_id'],encounter_id=encounter))

    def test_export_options_and_preview_require_case_and_separate_source_acceptance(self):
        options=self.api('/api/exports/options')
        self.assertEqual(options['cases'],[])
        self.assertEqual(options['field_count'],261)
        self.assertTrue(options['word_disabled_reason'])
        self.api('/api/exports/preview',dict(case_id='unknown'),expected=400)
        self.api('/api/source-review',self.source_payload())
        case,_=self.case_and_assignment()
        p=self.preview(case)
        self.assertEqual(p['redcap']['counts']['observations'],0)
        self.assertEqual(p['excluded']['count'],1)
        self.assertFalse(p['word']['enabled'])
        self.assertEqual(p['unassigned_global_count'],0)

    def test_export_preview_scopes_exclusions_to_selected_case(self):
        first,_=self.case_and_assignment()
        other=self.api('/api/cases',dict(registry_code='OTHER',actor='Synthetic',role='source_reviewer'))
        p=self.preview(other)
        self.assertEqual(p['excluded']['count'],0)
        self.assertNotIn(first['case_id'],json.dumps(p))
        self.assertEqual(self.preview(first)['excluded']['count'],1)
        self.api('/api/exports/preview',dict(case_id=first['case_id'],encounter_id='other-visit'),expected=400)

    def test_redcap_export_download_is_scoped_stable_idempotent_and_hash_checked(self):
        case,assignment=self.case_and_assignment()
        self.api('/api/review',self.review_payload(assignment))
        # CSV always includes all visits, regardless of the Word selection.
        visits=[self.api('/api/encounters',dict(case_id=case['case_id'],label='Visit '+str(i),
            actor='Synthetic',role='source_reviewer')) for i in range(2)]
        other=self.api('/api/cases',dict(registry_code='OTHER',actor='Synthetic',role='source_reviewer'))
        p=self.preview(case,visits[0]['encounter_id'])
        self.assertEqual(p['redcap']['counts'],dict(encounters=2,observations=1,metadata=0,specimens=0))
        self.assertEqual(p['redcap']['missing_measurement_dates'],1)
        self.assertTrue(p['synthetic'])
        payload=dict(preview_id=p['preview_id'],format='redcap')
        result=self.api('/api/exports/create',payload)
        self.assertEqual(self.api('/api/exports/create',payload),result)
        item=next(f for f in result['files'] if f['name']=='redcap-import.csv')
        status,headers,body=self.request(item['url'])
        self.assertEqual(status,200)
        self.assertEqual(headers['Content-Disposition'],'attachment; filename="redcap-import.csv"')
        rows=list(csv.DictReader(body.decode('utf-8-sig').splitlines()))
        self.assertEqual(len(rows),4)
        self.assertEqual({r['record_id'] for r in rows},{case['registry_code']})
        self.assertEqual(sum(r['redcap_repeat_instrument']=='registry_visits' for r in rows),2)
        self.assertEqual(next(r for r in rows if r['redcap_repeat_instrument']=='pool_results')['numeric_value'],'0.65')
        second=self.api('/api/exports/create',dict(preview_id=self.preview(case)['preview_id'],format='redcap'))
        second_url=next(f['url'] for f in second['files'] if f['name']=='redcap-import.csv')
        self.assertEqual(self.request(second_url)[2],body)
        exported_other=self.api('/api/exports/create',dict(preview_id=self.preview(other)['preview_id'],format='redcap'))
        self.assertEqual(exported_other['report']['reconciliation_required'],[])
        path=self.app.exports.root/result['export_id']/'redcap-import.csv'
        path.write_bytes(b'changed')
        self.api(item['url'],expected=400)

    def test_export_stale_preview_rejects_new_review_and_changed_configuration(self):
        case,assignment=self.case_and_assignment()
        p=self.preview(case)
        self.api('/api/review',self.review_payload(assignment))
        self.api('/api/exports/create',dict(preview_id=p['preview_id'],format='redcap'),expected=409)
        p=self.preview(case)
        self.app.exports.project='different-project'
        self.api('/api/exports/create',dict(preview_id=p['preview_id'],format='redcap'),expected=409)
        self.assertFalse(self.app.exports.root.exists())

    def test_export_rechecks_sources_and_does_not_offer_partial_failure(self):
        case,assignment=self.case_and_assignment()
        self.api('/api/review',self.review_payload(assignment))
        p=self.preview(case)
        payload=dict(preview_id=p['preview_id'],format='redcap')
        with patch('registry_review.exports.write_csv',side_effect=OSError('Synthetic disk failure')):
            self.api('/api/exports/create',payload,expected=500)
        self.assertEqual(self.app.exports.downloads,{})
        self.assertEqual(self.app.exports.previews[p['preview_id']]['created'],{})
        result=self.api('/api/exports/create',payload)
        self.assertEqual(result['report']['observations'],1)
        (self.root/'bundle/artifacts/raw/T.txt').write_text('changed',encoding='utf-8')
        self.api('/api/exports/create',payload,expected=400)

    def test_export_endpoints_reject_unknown_files_tokens_paths_and_expired_previews(self):
        case,_=self.case_and_assignment()
        p=self.preview(case)
        payload=dict(preview_id=p['preview_id'],format='redcap')
        self.assertEqual(self.request('/api/exports/create',payload,{'X-Review-Token':''})[0],403)
        self.api('/api/exports/create',dict(**payload,path='../arbitrary.csv'),expected=400)
        self.api('/api/exports/create',dict(preview_id=p['preview_id'],format='../file'),expected=400)
        self.api('/api/exports/download?'+urlencode(dict(export_id='../db',name='../synthetic.sqlite')),expected=404)
        self.app.exports.previews[p['preview_id']]['expires']=0
        self.api('/api/exports/create',payload,expected=409)
        self.assertFalse(self.app.exports.root.exists())

    def test_word_preview_bindings_visit_selection_generation_and_template_change(self):
        root=self.root/'word-test';root.mkdir()
        template=root/'template.docx'
        xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>CASE REPORT FORM</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>C3</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>(kết quả trích xuất từ hệ thống)</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>'
        with zipfile.ZipFile(template,'w') as out:out.writestr('word/document.xml',xml)
        dictionary=copy.deepcopy(DICTIONARY)
        dictionary['template_sha256']=hashlib.sha256(template.read_bytes()).hexdigest()
        for field in dictionary['fields']:field['source_context']='B2.' if field['field_id']=='IMM11' else 'B99.'
        package=synthetic_bundle(root,dictionary)
        app=ReviewApplication(root/'synthetic.sqlite',[root/'bundle'],export_template=template,synthetic=True)
        store=ReviewStore(root/'synthetic.sqlite')
        person=dict(actor='Synthetic operator',role='source_reviewer')
        try:
            case=store.create_case('WORD-TEST',**person)
            visit=store.create_encounter(case['case_id'],label='Synthetic visit',**person)
            assignment=store.assign_document(package['documents'][0]['document_id'],case_id=case['case_id'],
                encounter_id=visit['encounter_id'],reason='Synthetic',**person)
            store.review('SYNTHETIC-UI',1,package['observations'][0]['observation_id'],action='accept',reason='Synthetic',
                expected_assignment_id=assignment['assignment_id'],**person)
        finally:store.close()
        before=(root/'synthetic.sqlite').read_bytes()
        self.assertTrue(app.exports.preview(case_id=case['case_id'])['word']['enabled'])
        self.assertEqual(app.exports.preview(case_id=case['case_id'])['word']['scope'],'whole_patient')
        p=app.exports.preview(case_id=case['case_id'],encounter_id=visit['encounter_id'])
        self.assertEqual((p['word']['bound_observations'],p['word']['appendix_observations']),(1,0))
        result=app.exports.create(preview_id=p['preview_id'],format='word')
        self.assertEqual(result['report']['selected_observations'],1)
        self.assertEqual(result['report']['layout_status'],'draft_requires_visual_review')
        self.assertEqual((root/'synthetic.sqlite').read_bytes(),before)
        file=next(f for f in result['files'] if f['name']=='filled-crf.docx')
        data,kind,_=app.exports.download(result['export_id'],file['name'])
        self.assertTrue(data.startswith(b'PK'))
        self.assertIn('wordprocessingml',kind)
        p=app.exports.preview(case_id=case['case_id'],encounter_id=visit['encounter_id'])
        with zipfile.ZipFile(template,'a') as out:out.writestr('changed.txt','changed')
        from registry_review.exports import StalePreview
        with self.assertRaises(StalePreview):app.exports.create(preview_id=p['preview_id'],format='word')

    def test_patient_data_includes_documents_without_results_and_keeps_cases_separate(self):
        case,assignment=self.case_and_assignment()
        before=self.api('/api/patient?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(len(before['documents']),1)
        self.assertEqual(before['observations'],[])
        self.api('/api/review',self.review_payload(assignment))
        patient=self.api('/api/patient?'+urlencode(dict(case_id=case['case_id'])))
        self.assertEqual(len(patient['observations']),1)
        self.assertEqual(len(patient['field_states'][case['case_id']]),261)
        self.assertEqual(patient['observations'][0]['review_status'],'source_verified')
        other=self.api('/api/cases',dict(registry_code='OTHER',actor='Synthetic',role='source_reviewer'))
        second=self.api('/api/patient?'+urlencode(dict(case_id=other['case_id'])))
        self.assertEqual(second['documents'],[])
        self.assertEqual(second['observations'],[])
        self.api('/api/patient?case_id=missing',expected=400)

    def test_patient_catalog_download_and_atomic_batch_http_workflow(self):
        case,assignment=self.case_and_assignment()
        query=urlencode(dict(case_id=case['case_id']))
        patient=self.api('/api/patient?'+query)
        workspace=patient['workspace']
        self.assertEqual((workspace['counts']['fields'],workspace['counts']['components']),(261,377))
        self.assertEqual(workspace['candidates'][0]['review_status'],'pending')
        self.assertTrue(workspace['candidates'][0]['evidence'][0]['crop_url'].startswith('/asset?'))
        status,headers,body=self.request('/api/patient/export?'+query)
        self.assertEqual(status,200)
        self.assertIn('patient-fields.json',headers['Content-Disposition'])
        self.assertEqual(len(json.loads(body)['workspace']['fields']),261)
        payload=dict(case_id=case['case_id'],selection_ids=[c['selection_id'] for c in workspace['candidates']],
            action='approve',request_id='http-patient-batch',expected_snapshot_sha256=workspace['review_snapshot_sha256'],
            actor='Synthetic HTTP batch reviewer',role='source_reviewer',reason='Synthetic HTTP only')
        self.api('/api/patient-review',payload,expected=200)
        self.assertEqual(self.api('/api/patient-review',payload)['status'],'already_recorded')
        after=self.api('/api/patient?'+query)
        self.assertEqual(after['workspace']['candidates'][0]['review_status'],'accepted')
        self.assertEqual(len(after['workspace']['review_batches']),1)
        self.assertEqual(len(after['observations']),1)
        self.api('/api/patient-review',dict(payload,request_id='stale-http-batch'),expected=409)
        self.assertEqual(self.request('/api/patient-review',payload,headers={'X-Review-Token':'wrong'})[0],403)

    def test_patient_batch_rechecks_bundled_source_before_any_decision(self):
        case,_=self.case_and_assignment()
        workspace=self.api('/api/patient?'+urlencode(dict(case_id=case['case_id'])))['workspace']
        crop=self.root/'bundle'/'artifacts'/'crops'/'T.png'
        crop.write_bytes(b'SYNTHETIC CHANGED SOURCE')
        payload=dict(case_id=case['case_id'],selection_ids=[c['selection_id'] for c in workspace['candidates']],
            action='approve',request_id='http-source-check',expected_snapshot_sha256=workspace['review_snapshot_sha256'],
            actor='Synthetic HTTP batch reviewer',role='source_reviewer',reason='Synthetic HTTP only')
        self.api('/api/patient-review',payload,expected=400)
        store=ReviewStore(self.root/'synthetic.sqlite',read_only=True)
        try:self.assertEqual(store.effective_pool(case['case_id'])['observations'],[])
        finally:store.close()


class SourceCorrectionServerTests(unittest.TestCase):
    request=ReviewServerTests.request
    api=ReviewServerTests.api
    view=ReviewServerTests.view
    tearDown=ReviewServerTests.tearDown
    case_and_assignment=ReviewServerTests.case_and_assignment

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.package=synthetic_bundle(self.root,source_fields=True)
        self.server,self.app=create_server(self.root/'synthetic.sqlite',[self.root/'bundle'],port=0,synthetic=True)
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':0.02},daemon=True)
        self.thread.start()

    def proposal(self):
        view=self.view();item=view['specimen_candidates'][0]
        return dict(package_id=view['package_id'],revision=view['revision'],candidate_type='specimen',
            candidate_id=item['sample_id'],changes={'collection_date':'14/03/2033'},
            evidence_ids=[item['evidence'][0]['evidence_id']],reason='Synthetic source date correction',
            request_id='synthetic-http-correction',actor='Synthetic editor',role='source_reviewer',
            expected_package_sha256=view['package_sha256'],expected_candidate_sha256=item['source_candidate_sha256'],
            expected_review_id=None,expected_correction_id=None)

    def test_correction_http_requires_token_bundle_evidence_and_explicit_human_approval(self):
        payload=self.proposal()
        self.assertEqual(self.request('/api/source-correction',payload,headers={'X-Review-Token':'bad'})[0],403)
        self.api('/api/source-correction',dict(payload,evidence_ids=['wrong-document']),expected=400)
        proposal=self.api('/api/source-correction',payload)['correction']
        self.assertEqual(self.api('/api/source-correction',payload)['status'],'already_recorded')
        view=self.view();item=view['specimen_candidates'][0]
        self.assertEqual(item['pending_correction']['correction_id'],proposal['correction_id'])
        self.assertIsNone(item['effective_source_data']['collection_datetime']['date'])
        request=dict(package_id=view['package_id'],revision=1,request_id='approve-http-edit',
            expected_package_sha256=view['package_sha256'],reason='Read synthetic source',
            actor='Synthetic reviewer',role='source_reviewer',decisions=[dict(candidate_type='specimen',
                candidate_id=item['sample_id'],action='approve',expected_candidate_sha256=item['source_candidate_sha256'],
                expected_review_id=None,correction_id=proposal['correction_id'])])
        self.api('/api/source-review',dict(request,role='assistant'),expected=400)
        self.api('/api/source-review',request)
        view=self.view();item=view['specimen_candidates'][0]
        self.assertIsNone(item['pending_correction'])
        self.assertEqual(item['effective_source_data']['collection_datetime']['date'],'2033-03-14')
        self.assertIsNone(item['source_data']['collection_datetime']['date'])
        pool=self.api('/api/source-reviewed?'+urlencode(dict(package_id=view['package_id'],revision=1)))
        self.assertEqual(pool['specimen_candidates'][0]['value']['collection_datetime']['date'],'2033-03-14')

    def test_correction_and_approval_reverify_assets_at_each_write(self):
        payload=self.proposal();proposal=self.api('/api/source-correction',payload)['correction']
        crop=self.root/'bundle'/'artifacts'/'crops'/'F.png'
        crop.write_bytes(b'CHANGED SYNTHETIC SOURCE')
        self.api('/api/source-correction',dict(payload,request_id='new-proposal',expected_correction_id=proposal['correction_id']),expected=400)
        item=self.view()['specimen_candidates'][0]
        self.api('/api/source-review',dict(package_id=self.package['package_id'],revision=1,
            request_id='changed-approval',expected_package_sha256=digest(self.package),reason='Synthetic',
            actor='Synthetic reviewer',role='source_reviewer',decisions=[dict(candidate_type='specimen',
                candidate_id=item['sample_id'],action='approve',expected_candidate_sha256=item['source_candidate_sha256'],
                expected_review_id=None,correction_id=proposal['correction_id'])]),expected=400)
        self.assertEqual(self.view()['specimen_candidates'][0]['source_review_status'],'pending')
        self.api('/api/source-correction',dict(payload,request_id='withdraw-http-proposal',action='withdraw',changes={},
            expected_correction_id=proposal['correction_id'],reason='Discard synthetic proposal, preserve current value'))
        item=self.view()['specimen_candidates'][0]
        self.assertIsNone(item['pending_correction'])
        self.assertIsNone(item['source_review'])
        self.assertEqual(item['correction_history'][-1]['status'],'withdrawn')


if __name__=='__main__':
    unittest.main()
