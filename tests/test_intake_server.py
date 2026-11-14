"""Real upload/status/review HTTP against synthetic images and stub OCR."""
from http.client import HTTPConnection
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib.parse import urlencode

from registry_review.server import create_server
import test_review_server as review_fixture
from test_patient_intake import image_bytes,synthetic_result


class IntakeServerTests(unittest.TestCase):
    api=review_fixture.ReviewServerTests.api
    request=review_fixture.ReviewServerTests.request
    tearDown=review_fixture.ReviewServerTests.tearDown

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.package=review_fixture.synthetic_bundle(self.root)
        self.server,self.app=create_server(self.root/'synthetic.sqlite',[self.root/'bundle'],port=0,synthetic=True,
            intake_workspace=self.root,intake_root=self.root/'uploads',
            intake_runner=lambda job,files,folder:synthetic_result(self.root,job,files,folder))
        self.thread=threading.Thread(target=self.server.serve_forever,kwargs={'poll_interval':.02},daemon=True);self.thread.start()

    def upload(self,job_id,file_id='image-0',name='new-report.png',body=None,token=True,content_type='application/octet-stream'):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        headers={'Content-Type':content_type,'X-Review-Token':self.app.token if token else 'invalid'}
        conn.request('POST','/api/intakes/image?'+urlencode(dict(job_id=job_id,file_id=file_id,name=name)),
            body=image_bytes(file_id) if body is None else body,headers=headers)
        response=conn.getresponse();status=response.status;raw=response.read();conn.close();return status,raw

    def create(self,**changes):
        payload=dict(request_id='upload-http',file_count=2,same_patient=True,actor='Synthetic uploader',role='source_reviewer')
        payload.update(changes);return self.api('/api/intakes',payload)['job']

    def wait(self,job_id):
        deadline=time.monotonic()+12
        while time.monotonic()<deadline:
            job=next(j for j in self.api('/api/intakes')['jobs'] if j['job_id']==job_id)
            if job['status']=='completed':return job
            self.assertNotIn(job['status'],{'failed','needs_attention'},job.get('error'))
            time.sleep(.03)
        self.fail('Synthetic upload did not complete')

    def test_binary_upload_creates_one_patient_all_fields_ocr_pending_and_can_be_reviewed(self):
        job=self.create();self.assertEqual(self.create()['job_id'],job['job_id'])
        query=urlencode(dict(case_id=job['case_id']))
        early=self.api('/api/patient?'+query)['workspace']
        self.assertEqual(early['counts']['fields'],261);self.assertEqual(early['counts']['components'],377)
        self.assertEqual(self.upload(job['job_id'],token=False)[0],403)
        self.assertEqual(self.upload(job['job_id'],name='../escape.png')[0],400)
        self.assertEqual(self.upload(job['job_id'],body=b'not an image')[0],400)
        self.assertEqual(self.upload(job['job_id'],name='synthetic Vietnamese report.png')[0],200)
        self.api('/api/intakes/start',dict(job_id=job['job_id']),expected=400)
        self.assertEqual(self.upload(job['job_id'],file_id='image-1')[0],200)
        self.api('/api/intakes/start',dict(job_id=job['job_id']))
        done=self.wait(job['job_id']);self.assertEqual(done['uploaded_files'],2)
        view=self.api('/api/patient?'+query)['workspace']
        self.assertEqual(view['counts']['observations'],2)
        self.assertTrue(all(c['review_status']=='pending' for c in view['candidates']))
        self.assertEqual(self.api('/api/effective?'+query)['observations'],[])
        for candidate in view['candidates']:
            self.assertTrue(candidate['source_available'])
            self.assertEqual(self.request(candidate['evidence'][0]['crop_url'])[0],200)
        source='/api/intakes/source?'+urlencode(dict(job_id=job['job_id'],file_id='image-0'))
        self.assertEqual(self.request(source)[2],image_bytes('image-0'))
        self.api('/api/patient-review',dict(case_id=job['case_id'],selection_ids=[c['selection_id'] for c in view['candidates']],
            action='approve',request_id='new-patient-http-review',expected_snapshot_sha256=view['review_snapshot_sha256'],
            actor='Synthetic reviewer',role='source_reviewer',reason='Compare synthetic source images'))
        self.assertEqual(len(self.api('/api/effective?'+query)['observations']),2)
        self.assertEqual(len(self.api('/api/summary')['cases']),1)

    def test_upload_scope_and_body_type_are_checked_and_failed_input_creates_no_values(self):
        self.api('/api/intakes',dict(request_id='bad',file_count=1,same_patient=False,actor='Synthetic',role='source_reviewer'),expected=400)
        self.assertEqual(self.api('/api/summary')['cases'],[])
        job=self.create(file_count=1)
        self.assertEqual(self.upload(job['job_id'],content_type='application/json')[0],400)
        self.assertEqual(self.api('/api/intakes')['jobs'][0]['uploaded_files'],0)

    def test_external_navigation_can_open_shell_but_cannot_read_data_or_upload(self):
        navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        status,headers,body=self.request('/',headers=navigation)
        self.assertEqual(status,200)
        self.assertIn(b'intakeEngine',body)
        self.assertIn("img-src 'self' blob: data:",headers['Content-Security-Policy'])
        self.assertEqual(self.request('/api/intakes',headers=navigation)[0],403)
        self.assertEqual(self.request('/',headers={'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.request('/api/intakes',dict(request_id='attack',file_count=1,same_patient=True,
            actor='Synthetic',role='source_reviewer'),headers=navigation)[0],403)
        self.assertEqual(self.api('/api/summary')['cases'],[])
