"""Exercise HTTP review and source verification using synthetic local assets."""
import copy
import hashlib
from http.client import HTTPConnection
import json
from pathlib import Path
import tempfile
import threading
import unittest
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


def synthetic_bundle(root):
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
    source=convert_documents([dict(document_id='SYNTHETIC',input_path='source.png',
        input_sha256=hashlib.sha256((root/'source.png').read_bytes()).hexdigest(),
        tables=[dict(table_id='T',raw=raw,format='auto')])],CATALOG)
    (run/'candidate-pool.json').write_text(json.dumps(source),encoding='utf-8')
    package=build_bundle(run,root/'bundle',DICTIONARY,root,package_id='SYNTHETIC-UI')
    registry=Registry(root/'synthetic.sqlite')
    try:
        registry.import_package(package,DICTIONARY)
    finally:
        registry.close()
    return package


class ReviewServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.package=synthetic_bundle(self.root)
        self.server,self.app=create_server(self.root/'synthetic.sqlite',[self.root/'bundle'],port=0)
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


if __name__=='__main__':
    unittest.main()
