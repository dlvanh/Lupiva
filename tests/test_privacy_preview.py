"""Local upload previews bind geometry to bytes without creating patient data."""
import hashlib
from http.client import HTTPConnection
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib.parse import urlencode

from PIL import Image
from ocr_pool.gemini import prepare_image, privacy_plan
from registry_review.privacy import PrivacyProposals
from registry_review.server import create_server
from test_review_server import synthetic_bundle


def source_bytes(orientation=None):
    image = Image.new('RGB', (180, 240), '#173437')
    stream = io.BytesIO()
    if orientation:
        exif = Image.Exif(); exif[274] = orientation
        image.save(stream, 'JPEG', exif=exif)
    else:
        image.save(stream, 'PNG')
    return stream.getvalue()


def synthetic_proposal(path):
    from PIL import ImageOps
    with Image.open(path) as source:
        size = list(ImageOps.exif_transpose(source).size)
    return dict(sha256=hashlib.sha256(path.read_bytes()).hexdigest(), size=size,
        crop=[0, 60, *size], crop_reason='detected_panel_table_header',
        masks=[dict(box=[20, 70, 60, 110]), dict(box=[70, 80, 110, 130],
            polygon=[[70, 80], [100, 90], [110, 130], [80, 120]])],
        review_items=[dict(code='date_without_context')], reviewed=False, outbound_allowed=False,
        dates_local=[dict(raw='SENSITIVE LOCAL TEXT')])


class PreviewTests(unittest.TestCase):
    def wait(self, manager, job_id):
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            job = manager.get(job_id)
            if job['status'] not in {'queued','processing'}:
                return job
            time.sleep(.01)
        self.fail('Preview did not complete')

    def test_source_hash_orientation_geometry_and_failure_do_not_authorize_send(self):
        with tempfile.TemporaryDirectory() as folder:
            manager = PrivacyProposals(folder, runner=synthetic_proposal)
            self.addCleanup(manager.close)
            body = source_bytes(6); sha = hashlib.sha256(body).hexdigest()
            with self.assertRaises(ValueError):manager.create(body, '0'*64)
            with self.assertRaises(ValueError):manager.create(b'broken', hashlib.sha256(b'broken').hexdigest())
            job = manager.create(body, sha)
            done = self.wait(manager, job['job_id'])
            self.assertEqual(done['status'], 'completed')
            self.assertIsNone(done['automatic_plan'])
            self.assertEqual(done['proposal']['size'], [240,180])
            self.assertEqual(manager.create(body,sha)['job_id'], job['job_id'])
            self.assertNotIn('SENSITIVE LOCAL TEXT', json.dumps(done))
            plan = done['proposal']
            with self.assertRaises(ValueError):privacy_plan([plan],1)
            self.assertEqual(len(plan['mask_polygons']),1)
            plan['reviewed'] = True
            privacy_plan([plan],1)
            image = Image.open(io.BytesIO(prepare_image(body,plan)))
            self.assertEqual(image.size,(240,120))
            self.assertGreater(min(image.getpixel((35,30))),240)
            self.assertGreater(min(image.getpixel((88,45))),240)
            self.assertLess(max(image.getpixel((60,65))),100,'Polygon must not become a rectangular mask')
            self.assertEqual(len(image.getexif()),0)
            plan['mask_polygons'][0][0] = [300,20]
            with self.assertRaises(ValueError):prepare_image(body,plan)
            plan['mask_polygons'] = [[[1,2], [3,4]]]
            with self.assertRaises(ValueError):privacy_plan([plan],1)

    def test_automatic_plan_requires_header_and_is_bound_to_server_geometry(self):
        for detected in (True, False):
            with self.subTest(detected=detected), tempfile.TemporaryDirectory() as folder:
                def runner(path):
                    plan = synthetic_proposal(path)
                    plan['review_items'] = []
                    if not detected:
                        plan.update(crop=[0, 0, *plan['size']], crop_reason='no_reliable_result_header_keep_page')
                    return plan
                manager = PrivacyProposals(folder, runner=runner)
                try:
                    body = source_bytes()
                    job = manager.create(body, hashlib.sha256(body).hexdigest())
                    plan = self.wait(manager, job['job_id'])['automatic_plan']
                    if not detected:
                        self.assertIsNone(plan)
                        continue
                    manager.validate_intake_plans([plan])
                    privacy_plan([plan], 1)
                    with Image.open(io.BytesIO(prepare_image(body, plan))) as cropped:
                        self.assertEqual(cropped.size, (180, 180))
                    for override in (dict(sha256='0'*64), dict(crop=[0, 0, 180, 240]), dict(proposal_id='unknown')):
                        with self.assertRaises(ValueError):
                            manager.validate_intake_plans([{**plan, **override}])
                finally:
                    manager.close()

    def test_chart_only_page_is_automatically_kept_as_reference_and_never_sent(self):
        with tempfile.TemporaryDirectory() as folder:
            def runner(path):
                plan = synthetic_proposal(path)
                plan.update(crop=[0, 0, *plan['size']], crop_reason='chart_only_page', review_items=[])
                return plan
            manager = PrivacyProposals(folder, runner=runner)
            try:
                body = source_bytes()
                job = manager.create(body, hashlib.sha256(body).hexdigest())
                plan = self.wait(manager, job['job_id'])['automatic_plan']
                self.assertEqual((plan['skip'], plan['automatic']), (True, True))
                self.assertNotIn('crop', plan)
                manager.validate_intake_plans([plan])
                self.assertIsNone(prepare_image(body, plan))
                with self.assertRaises(ValueError):          # never the only image of an API intake
                    privacy_plan([plan], 1)
            finally:
                manager.close()

    def test_unresolved_staff_blocks_automatic_plan_and_keeps_ocr_text_local(self):
        with tempfile.TemporaryDirectory() as folder:
            def runner(path):
                plan = synthetic_proposal(path)
                plan['review_items'] = [dict(code='staff_signature_needs_review', raw='LOCAL STAFF NAME')]
                return plan
            manager = PrivacyProposals(folder,runner=runner)
            try:
                body = source_bytes()
                job = manager.create(body,hashlib.sha256(body).hexdigest())
                done = self.wait(manager,job['job_id'])
                self.assertEqual(done['proposal']['staff_review_count'],1)
                self.assertIsNone(done['automatic_plan'])
                self.assertNotIn('LOCAL STAFF NAME',json.dumps(done))
            finally:
                manager.close()

    def test_worker_failure_is_retryable_and_leaves_registry_absent(self):
        with tempfile.TemporaryDirectory() as folder:
            manager = PrivacyProposals(folder,runner=lambda p:(_ for _ in ()).throw(ValueError('internal')))
            self.addCleanup(manager.close)
            body=source_bytes();sha=hashlib.sha256(body).hexdigest()
            job=manager.create(body,sha);done=self.wait(manager,job['job_id'])
            self.assertEqual(done['status'],'failed')
            self.assertNotIn('internal',done['error'])
            self.assertNotEqual(manager.create(body,sha)['job_id'],job['job_id'])
            self.assertFalse(list(Path(folder).rglob('*.sqlite')))

    def test_http_preview_is_background_protected_and_creates_no_patient(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);synthetic_bundle(root)
            gate=threading.Event()
            def runner(path):
                gate.wait(3)
                return synthetic_proposal(path)
            server,app=create_server(root/'synthetic.sqlite',[root/'bundle'],port=0,
                intake_workspace=root,privacy_runner=runner)
            thread=threading.Thread(target=server.serve_forever,kwargs={'poll_interval':.01},daemon=True);thread.start()
            def request(path,body=None,token=True):
                conn=HTTPConnection('127.0.0.1',server.server_port,timeout=3)
                conn.request('POST' if body else 'GET',path,body=body,
                    headers={'Content-Type':'application/octet-stream','X-Review-Token':app.token if token else 'bad'})
                response=conn.getresponse();result=json.loads(response.read());status=response.status;conn.close()
                return status,result
            try:
                body=source_bytes();path='/api/privacy-proposals?'+urlencode(dict(sha256=hashlib.sha256(body).hexdigest()))
                self.assertEqual(request(path,body,token=False)[0],403)
                status,job=request(path,body);self.assertEqual(status,200)
                self.assertIn(request('/api/privacy-proposals?job_id='+job['job_id'])[1]['status'],{'queued','processing'})
                self.assertEqual(request('/api/summary')[1]['cases'],[],'OCR must not block the server or create a patient')
                gate.set();self.wait(app.privacy,job['job_id'])
                self.assertEqual(request('/api/privacy-proposals?job_id='+job['job_id'])[1]['proposal']['reviewed'],False)
                self.assertEqual(request('/api/summary')[1]['cases'],[])
            finally:
                gate.set();server.shutdown();server.server_close();thread.join(3)


class TestAutoSendFlag(unittest.TestCase):
    """LUPIVA_TEST_AUTO_SEND: test data only; off unless set to exactly 1."""

    def summary(self, **over):
        base = dict(sha256='a'*64, crop=[0, 120, 800, 900], masks=[], mask_polygons=[],
                    crop_reason='needs_manual_selection', review_count=2)
        base.update(over)
        return base

    def test_review_page_waits_unless_forced(self):
        from registry_review.privacy import automatic_plan
        self.assertIsNone(automatic_plan(self.summary(), 'privacy-x'))
        forced = automatic_plan(self.summary(), 'privacy-x', force=True)
        self.assertEqual(forced['crop'], [0, 120, 800, 900])
        self.assertTrue(forced['automatic'] and forced['reviewed'] and forced['forced_test_send'])
        chart = automatic_plan(self.summary(crop_reason='chart_only_page'), 'privacy-x', force=True)
        self.assertTrue(chart['skip'])

    def test_flag_reads_environment_then_env_file(self):
        import os, tempfile
        from pathlib import Path
        from unittest import mock
        from registry_review.privacy import test_auto_send
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.dict(os.environ, {}, clear=False):
                os.environ.pop('LUPIVA_TEST_AUTO_SEND', None)
                self.assertFalse(test_auto_send(folder))
                Path(folder, '.env').write_text('GEMINI_MODEL=x\nLUPIVA_TEST_AUTO_SEND=1\n', encoding='utf-8')
                self.assertTrue(test_auto_send(folder))
                Path(folder, '.env').write_text('LUPIVA_TEST_AUTO_SEND=true\n', encoding='utf-8')
                self.assertFalse(test_auto_send(folder))
            with mock.patch.dict(os.environ, {'LUPIVA_TEST_AUTO_SEND': '0'}):
                Path(folder, '.env').write_text('LUPIVA_TEST_AUTO_SEND=1\n', encoding='utf-8')
                self.assertFalse(test_auto_send(folder))
