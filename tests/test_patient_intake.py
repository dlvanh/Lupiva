"""Synthetic image upload -> one patient -> pending catalog -> human review."""
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from PIL import Image,ImageDraw
from ocr_pool import convert_documents
from registry_pool.exchange import build_bundle
from registry_pool.dictionary import digest
from registry_pool.store import encode
from registry_review import ReviewStore
from registry_review.intake import IntakeManager
from registry_review.workspace import patient_workspace,record_patient_batch
from ocr_pool.workflow import process_token
from test_source_review import CATALOG,DICTIONARY


def image_bytes(label):
    image=Image.new('RGB',(900,350),'white');draw=ImageDraw.Draw(image)
    draw.text((20,20),'SYNTHETIC ONLY '+label,fill='black',font_size=24)
    draw.text((20,110),'Test       Result       Unit',fill='black',font_size=24)
    draw.text((20,180),'C3         0.65         g/L',fill='black',font_size=24)
    out=io.BytesIO();image.save(out,format='PNG');return out.getvalue()


def synthetic_result(workspace,job,files,folder):
    """Stub OCR only; still exercise the production immutable bundle/importer."""
    run=folder/job['output']/'synthetic-run';(run/'raw').mkdir(parents=True);(run/'crops').mkdir()
    documents=[]
    for index,file in enumerate(files):
        tid='T'+str(index);raw='Test\tResult\tUnit\nC3\t0.65\tg/L'
        with Image.open(workspace/file['path']) as image:image.save(run/'crops'/(tid+'.png'))
        (run/'raw'/(tid+'.txt')).write_text(raw,encoding='utf-8')
        documents.append(dict(document_id=file['source_document_id'],input_path=file['path'],input_sha256=file['sha256'],
            tables=[dict(table_id=tid,raw=raw,format='auto')]))
    candidate=convert_documents(documents,CATALOG)
    (run/'candidate-pool.json').write_text(json.dumps(candidate),encoding='utf-8')
    bundle=folder/job['output']/'bundle'
    build_bundle(run,bundle,DICTIONARY,workspace)
    return bundle


class PatientIntakeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.db=self.root/'registry.sqlite'
        store=ReviewStore(self.db)
        store.db.execute('INSERT INTO dictionaries VALUES(?,?,?)',(DICTIONARY['dictionary_version'],digest(DICTIONARY),encode(DICTIONARY)))
        store.db.commit();store.close()
        self.app=SimpleNamespace(database=self.db,bundles={})
        self.manager=IntakeManager(self.app,workspace=self.root,root=self.root/'intakes',
            runner=lambda job,files,folder:synthetic_result(self.root,job,files,folder))
        self.person=dict(actor='Synthetic submitter',role='source_reviewer')

    def tearDown(self):self.manager.close();self.tmp.cleanup()

    def create(self,count=1,request='new-submission',**changes):
        args=dict(request_id=request,file_count=count,same_patient=True,**self.person);args.update(changes)
        return self.manager.create(**args)['job']

    def wait(self,job_id,status='completed'):
        deadline=time.monotonic()+12
        while time.monotonic()<deadline:
            job=next(j for j in self.manager.list()['jobs'] if j['job_id']==job_id)
            if job['status']==status:return job
            if job['status'] in {'failed','needs_attention'} and status=='completed':self.fail(job['error'])
            time.sleep(.03)
        self.fail('Synthetic job did not reach '+status)

    def uploaded(self,count=1,request='new-submission'):
        job=self.create(count,request)
        for index in range(count):self.manager.upload(job['job_id'],'image-'+str(index),'report-'+str(index)+'.png',image_bytes(request+str(index)))
        return job

    def test_images_create_one_patient_with_complete_pending_catalog_then_explicit_review(self):
        job=self.uploaded(2)
        store=ReviewStore(self.db)
        try:
            early=patient_workspace(store,DICTIONARY,job['case_id'])
            self.assertEqual(early['counts']['fields'],261);self.assertEqual(early['counts']['components'],377)
            self.assertEqual(early['candidates'],[])
        finally:store.close()
        self.manager.start(job_id=job['job_id']);done=self.wait(job['job_id'])
        self.assertEqual(done['uploaded_files'],2)
        store=ReviewStore(self.db)
        try:
            self.assertEqual(len(store.summary()['cases']),1)
            view=patient_workspace(store,DICTIONARY,job['case_id'])
            self.assertEqual(len(view['documents']),2);self.assertEqual(view['counts']['fields'],261)
            self.assertEqual(view['counts']['observations'],2)
            self.assertTrue(all(c['review_status']=='pending' for c in view['candidates']))
            self.assertEqual(store.effective_pool(job['case_id'])['observations'],[])
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM source_review_decisions').fetchone()[0],0)
            record_patient_batch(store,DICTIONARY,case_id=job['case_id'],selection_ids=[c['selection_id'] for c in view['candidates']],
                action='approve',request_id='human-review',expected_snapshot_sha256=view['review_snapshot_sha256'],
                reason='Synthetic human source comparison',verify_sources=lambda keys:None,**self.person)
            self.assertEqual(len(store.effective_pool(job['case_id'])['observations']),2)
            self.assertEqual(store.summary()['encounters'],[])
        finally:store.close()

    def test_retries_do_not_create_extra_patients_uploads_jobs_or_source_decisions(self):
        job=self.uploaded()
        self.assertEqual(self.create()['job_id'],job['job_id'])
        self.assertEqual(self.manager.upload(job['job_id'],'image-0','report-0.png',image_bytes('new-submission0'))['status'],'already_uploaded')
        self.manager.start(job_id=job['job_id']);done=self.wait(job['job_id'])
        self.assertEqual(self.manager.start(job_id=job['job_id'])['status'],'already_started')
        with self.assertRaises(ValueError):self.create(count=2)
        self.assertEqual(done['attempt'],1)
        store=ReviewStore(self.db,read_only=True)
        try:self.assertEqual(len(store.summary()['cases']),1)
        finally:store.close()

    def test_two_submissions_remain_separate_and_duplicate_source_cannot_reassign_patient(self):
        first=self.uploaded(request='patient-one');self.manager.start(job_id=first['job_id']);self.wait(first['job_id'])
        second=self.uploaded(request='patient-two');self.manager.start(job_id=second['job_id']);self.wait(second['job_id'])
        store=ReviewStore(self.db,read_only=True)
        try:
            one=patient_workspace(store,DICTIONARY,first['case_id']);two=patient_workspace(store,DICTIONARY,second['case_id'])
            self.assertTrue(set(d['document_id'] for d in one['documents']).isdisjoint(d['document_id'] for d in two['documents']))
            self.assertEqual(one['counts']['observations'],1);self.assertEqual(two['counts']['observations'],1)
        finally:store.close()
        third=self.create(request='duplicate-other-patient')
        with self.assertRaisesRegex(ValueError,'another patient'):
            self.manager.upload(third['job_id'],'image-0','copy.png',image_bytes('patient-one0'))

    def test_rejects_unconfirmed_scope_incomplete_upload_invalid_images_paths_and_tampering(self):
        for changes in ({'same_patient':False},{'file_count':0},{'role':'assistant'}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):self.create(**changes)
        job=self.create(count=2)
        for file_id,name,body in [('..','report.png',image_bytes('a')),('image-0','../report.png',image_bytes('a')),('image-0','report.png',b'not an image')]:
            with self.assertRaises(ValueError):self.manager.upload(job['job_id'],file_id,name,body)
        self.manager.upload(job['job_id'],'image-0','report.png',image_bytes('a'))
        with self.assertRaises(ValueError):self.manager.start(job_id=job['job_id'])
        with self.assertRaises(ValueError):self.manager.upload(job['job_id'],'image-1','copy.png',image_bytes('a'))
        self.manager.upload(job['job_id'],'image-1','second.png',image_bytes('b'))
        (self.manager.path(job['job_id'])/'image-0.png').write_bytes(b'CHANGED')
        with self.assertRaisesRegex(ValueError,'changed'):self.manager.start(job_id=job['job_id'])

    def test_failed_ocr_keeps_originals_and_retry_uses_same_patient(self):
        self.manager.runner=lambda *args:(_ for _ in ()).throw(ValueError('Synthetic OCR error'))
        job=self.uploaded();self.manager.start(job_id=job['job_id']);failed=self.wait(job['job_id'],'failed')
        self.assertEqual(failed['uploaded_files'],1)
        self.assertEqual(self.manager.source(job['job_id'],'image-0')[0],image_bytes('new-submission0'))
        self.manager.runner=lambda job,files,folder:synthetic_result(self.root,job,files,folder)
        self.manager.start(job_id=job['job_id'],retry=True);done=self.wait(job['job_id'])
        self.assertEqual(done['case_id'],job['case_id']);self.assertEqual(done['attempt'],2)

    def test_import_and_all_patient_links_roll_back_together(self):
        job=self.uploaded(2)
        with patch.object(ReviewStore,'assign_document',side_effect=RuntimeError('Synthetic association failure')):
            self.manager.start(job_id=job['job_id']);self.wait(job['job_id'],'failed')
        store=ReviewStore(self.db,read_only=True)
        try:
            self.assertEqual(store.summary()['packages'],[])
            self.assertEqual(store.db.execute('SELECT COUNT(*) FROM document_identity_events').fetchone()[0],0)
            self.assertEqual(store.db.execute("SELECT COUNT(*) FROM audit_events WHERE kind='package_imported'").fetchone()[0],0)
            self.assertEqual(len(store.summary()['cases']),1)
        finally:store.close()

    def test_restart_recovers_completed_bundle_and_patient_without_reimport_or_approval(self):
        job=self.uploaded();self.manager.start(job_id=job['job_id']);done=self.wait(job['job_id'])
        self.manager.close();self.app.bundles={}
        self.manager=IntakeManager(self.app,workspace=self.root,root=self.root/'intakes')
        self.assertIn((done['package_id'],done['revision']),self.app.bundles)
        self.assertEqual(self.manager.list()['jobs'][0]['status'],'completed')
        self.assertIsNone(self.manager.worker)

    def test_restart_observes_live_process_without_launching_another(self):
        job=self.uploaded();self.manager.close()
        store=ReviewStore(self.db)
        try:
            with store.atomic_batch():
                saved=self.manager.load(store,job['job_id'])
                saved.update(status='processing',attempt=1,output='workflow-1',pid=os.getpid(),process_token=process_token(os.getpid()))
                self.manager.save(store,saved)
        finally:store.close()
        with patch('registry_review.intake.subprocess.Popen') as spawn:
            self.manager=IntakeManager(self.app,workspace=self.root,root=self.root/'intakes')
            time.sleep(.12)
            self.assertEqual(self.manager.list()['jobs'][0]['status'],'processing')
            spawn.assert_not_called()

    def test_uncertain_launch_blocks_relaunch_and_the_next_gpu_job(self):
        first=self.uploaded(request='uncertain');second=self.uploaded(request='queued-next');self.manager.close()
        store=ReviewStore(self.db)
        try:
            with store.atomic_batch():
                for job,status in [(first,'launching'),(second,'queued')]:
                    saved=self.manager.load(store,job['job_id']);saved.update(status=status,attempt=1,output='workflow-1')
                    self.manager.save(store,saved)
        finally:store.close()
        with patch('registry_review.intake.subprocess.Popen') as spawn:
            self.manager=IntakeManager(self.app,workspace=self.root,root=self.root/'intakes')
            self.wait(first['job_id'],'needs_attention')
            jobs=self.manager.list()['jobs']
            self.assertEqual(next(j for j in jobs if j['job_id']==second['job_id'])['status'],'queued')
            spawn.assert_not_called()

    def test_recovery_reads_newer_temporary_state_to_check_orphan_child(self):
        job=self.uploaded();job.update(output='workflow-1')
        folder=self.manager.path(job['job_id'])/'workflow-1';folder.mkdir()
        state=dict(stages={'ocr':dict(attempts=[dict(status='running')])})
        path=folder/'workflow.json';path.write_text(json.dumps(state),encoding='utf-8')
        with self.assertRaisesRegex(RuntimeError,'uncertain'):self.manager.live_process(job)
        state['stages']['ocr']['attempts'][0].update(pid=os.getpid(),process_token=process_token(os.getpid()))
        temporary=folder/'workflow.json.tmp';temporary.write_text(json.dumps(state),encoding='utf-8')
        os.utime(temporary,ns=(path.stat().st_mtime_ns+1000000,)*2)
        self.assertTrue(self.manager.live_process(job))
        with patch('registry_review.intake.process_token',return_value=None):
            self.assertFalse(self.manager.live_process(job))

    def test_needs_attention_blocks_only_while_a_child_could_still_run(self):
        job=self.uploaded();job.update(output='workflow-1')
        folder=self.manager.path(job['job_id']);(folder/'workflow-1').mkdir(parents=True)
        (folder/'manifest.json').write_text('{}',encoding='utf-8')
        self.assertTrue(self.manager.may_be_running(job))            # launch state unknown, recent
        with patch('registry_review.intake.INTAKE_STALE_SECONDS',0):
            self.assertFalse(self.manager.may_be_running(job))       # unknown but long idle
        state=dict(stages={'ocr':dict(attempts=[dict(status='running')])})
        (folder/'workflow-1'/'workflow.json').write_text(json.dumps(state),encoding='utf-8')
        self.assertTrue(self.manager.may_be_running(job))            # running attempt without PID
        state['stages']['ocr']['attempts'][0].update(pid=os.getpid(),process_token='gone')
        (folder/'workflow-1'/'workflow.json').write_text(json.dumps(state),encoding='utf-8')
        with patch('registry_review.intake.process_token',return_value=None):
            self.assertFalse(self.manager.may_be_running(job))       # recorded child has ended

    def test_processing_child_past_time_limit_is_stopped(self):
        from unittest.mock import Mock
        job=self.uploaded();self.manager.close()
        job.update(status='processing',output='workflow-1',started_at_epoch=time.time()-10)
        child=Mock();child.poll.return_value=None
        self.manager.children[job['job_id']]=child
        with patch('registry_review.intake.INTAKE_TIME_LIMIT',5):
            with self.assertRaisesRegex(ValueError,'limit'):self.manager.process(job)
        child.terminate.assert_called_once()
        job['started_at_epoch']=time.time()
        self.manager.process(job)                                    # within limit: keep waiting
        child.terminate.assert_called_once()

    def test_unknown_ocr_child_blocks_queue_with_needs_attention(self):
        first=self.uploaded(request='unknown-child');second=self.uploaded(request='queued-next');self.manager.close()
        folder=self.manager.path(first['job_id'])/'workflow-1';folder.mkdir()
        (folder/'workflow.json').write_text(json.dumps(dict(stages={'ocr':dict(attempts=[dict(status='running')])})),encoding='utf-8')
        store=ReviewStore(self.db)
        try:
            with store.atomic_batch():
                for job,status in [(first,'processing'),(second,'queued')]:
                    saved=self.manager.load(store,job['job_id']);saved.update(status=status,attempt=1,output='workflow-1')
                    self.manager.save(store,saved)
        finally:store.close()
        with patch('registry_review.intake.subprocess.Popen') as spawn:
            self.manager=IntakeManager(self.app,workspace=self.root,root=self.root/'intakes')
            self.wait(first['job_id'],'needs_attention')
            self.assertEqual(next(j for j in self.manager.list()['jobs'] if j['job_id']==second['job_id'])['status'],'queued')
            spawn.assert_not_called()
