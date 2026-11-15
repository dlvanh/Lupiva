"""One explicit image submission creates one patient; OCR stays pending review."""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import time
from uuid import uuid4
import warnings

from PIL import Image,UnidentifiedImageError
from registry_pool.dictionary import digest
from registry_pool.exchange import read,verify_bundle
from registry_pool.store import encode
from ocr_pool.gemini import API_ENGINES, configuration, prepare_image, privacy_plan, public_configuration
from ocr_pool.workflow import process_token,venv_python,write
from .store import ReviewStore,actor_info,text,now,HUMAN_ROLES

ROOT=Path(__file__).resolve().parents[1]
MAX_IMAGE=20*1024*1024
MAX_BATCH=100*1024*1024
MAX_FILES=50
# One submission may not hold the queue longer than this (seconds).
INTAKE_TIME_LIMIT=int(os.environ.get('LUPIVA_INTAKE_TIME_LIMIT','3600'))
# A record with unclear launch state stops blocking once its workflow is idle this long.
INTAKE_STALE_SECONDS=int(os.environ.get('LUPIVA_INTAKE_STALE_SECONDS','7200'))
# One image taking longer than this through the API marks the service as slow.
API_SLOW_SECONDS=int(os.environ.get('LUPIVA_API_SLOW_SECONDS','180'))
FORMATS={'JPEG':('.jpg','image/jpeg'),'PNG':('.png','image/png'),
         'TIFF':('.tif','image/tiff'),'BMP':('.bmp','image/bmp'),'WEBP':('.webp','image/webp')}
DDL='''
CREATE TABLE IF NOT EXISTS patient_intakes(
 job_id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,
 case_id TEXT NOT NULL REFERENCES registry_cases,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS patient_intake_files(
 job_id TEXT NOT NULL REFERENCES patient_intakes,file_id TEXT NOT NULL,sha256 TEXT NOT NULL,
 payload TEXT NOT NULL,PRIMARY KEY(job_id,file_id),UNIQUE(job_id,sha256));
'''


class IntakeManager:
    def __init__(self,application,*,workspace=ROOT,root=None,runner=None):
        self.application=application;self.workspace=Path(workspace).resolve()
        self.root=Path(root or self.workspace/'research/patient-intakes'/application.database.stem).resolve()
        if not self.root.is_relative_to(self.workspace):raise ValueError('Intake storage must remain inside the workspace')
        self.runner=runner;self.wake=threading.Event();self.stop=threading.Event()
        self.children={}
        store=ReviewStore(application.database)
        try:
            store.db.executescript(DDL)
            for action in ('UPDATE','DELETE'):
                store.db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_intake_files_{action} BEFORE {action} ON patient_intake_files BEGIN SELECT RAISE(ABORT,'immutable uploaded source'); END")
            store.db.commit()
            completed=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM patient_intakes')]
        finally:store.close()
        for job in completed:
            if job['status']=='completed':
                try:self.register_bundle(job)
                except (OSError,ValueError,KeyError) as error:
                    store=ReviewStore(application.database)
                    try:
                        with store.atomic_batch():
                            job.update(status='needs_attention',error='Saved OCR sources require inspection: '+str(error)[:300])
                            self.save(store,job)
                    finally:store.close()
        self.worker=None;self.worker_lock=threading.Lock()
        if any(j['status'] in {'queued','launching','processing'} for j in completed):self.ensure_worker()

    def ensure_worker(self):
        with self.worker_lock:
            if self.worker is None:
                self.worker=threading.Thread(target=self.loop,name='patient-intake-queue',daemon=True)
                self.worker.start()

    def close(self):
        self.stop.set();self.wake.set()
        if self.worker:self.worker.join(timeout=3)

    def path(self,job_id):
        if not isinstance(job_id,str) or not re.fullmatch(r'intake-[a-f0-9]{32}',job_id):raise ValueError('Invalid intake ID')
        return self.root/job_id

    @staticmethod
    def load(store,job_id):
        row=store.db.execute('SELECT payload FROM patient_intakes WHERE job_id=?',(job_id,)).fetchone()
        if not row:raise KeyError('Unknown patient submission')
        return json.loads(row[0])

    @staticmethod
    def files(store,job_id):
        return [json.loads(r[0]) for r in store.db.execute(
            'SELECT payload FROM patient_intake_files WHERE job_id=? ORDER BY rowid',(job_id,))]

    @staticmethod
    def save(store,job):
        job['updated_at_utc']=now()
        store.db.execute('UPDATE patient_intakes SET payload=? WHERE job_id=?',(encode(job),job['job_id']))

    def public(self,store,job):
        result={k:v for k,v in job.items() if k not in {'pid','process_token','output','bundle','manifest'}}
        files=self.files(store,job['job_id'])
        result['files']=[{k:v for k,v in f.items() if k!='path'} for f in files]
        result['uploaded_files']=len(files)
        workflow=self.path(job['job_id'])/job.get('output','not-started')/'workflow.json'
        if workflow.is_file():
            try:
                state=read(workflow)
                result['completed_stages']=sum(s.get('status') in {'completed','skipped'} for s in state['stages'].values())
                result['stage']=next((name for name,s in reversed(list(state['stages'].items())) if s.get('status')=='running'),None)
            except (OSError,ValueError,KeyError):pass
        return result

    def list(self):
        store=ReviewStore(self.application.database,read_only=True)
        try:
            jobs=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM patient_intakes ORDER BY rowid DESC')]
            return dict(jobs=[self.public(store,job) for job in jobs],api_health=self.api_health(jobs),
                limits=dict(max_files=MAX_FILES,max_image_bytes=MAX_IMAGE,max_batch_bytes=MAX_BATCH),
                engines=dict(local=dict(available=True),**{engine:public_configuration(self.workspace,engine=engine)
                                                           for engine in API_ENGINES}))
        finally:store.close()

    def create(self,*,request_id,registry_code=None,file_count,actor,role,same_patient,engine='local',privacy=None):
        person=actor_info(actor,role);request_id=text(request_id,'Submission request ID')
        if role not in HUMAN_ROLES or same_patient is not True:raise ValueError('Confirm these images belong to one patient')
        if type(file_count) is not int or not 1<=file_count<=MAX_FILES:raise ValueError('Choose 1 to 50 source images')
        code=text(registry_code,'Patient registry code') if registry_code else None
        request=dict(registry_code=code,file_count=file_count,submitted_by=person,same_patient=True)
        if engine not in ('local',*API_ENGINES):raise ValueError('Choose a supported image extraction engine')
        if engine in API_ENGINES:
            configuration(self.workspace,engine=engine)
            privacy_plan(privacy,file_count)
            request.update(engine=engine,privacy=privacy)
        elif privacy:raise ValueError('Privacy selections apply only to API submissions')
        store=ReviewStore(self.application.database)
        try:
            with store.atomic_batch():
                old=store.db.execute('SELECT request_sha256,payload FROM patient_intakes WHERE request_id=?',(request_id,)).fetchone()
                if old:
                    if old[0]!=digest(request):raise ValueError('Submission request ID reused with different content')
                    return dict(status='already_created',job=self.public(store,json.loads(old[1])))
                job_id='intake-'+uuid4().hex
                case=store.create_case(code or 'BN-'+uuid4().hex[:12].upper(),actor=actor,role=role)
                job=dict(job_id=job_id,case_id=case['case_id'],registry_code=case['registry_code'],
                    expected_files=file_count,submitted_by=person,created_at_utc=now(),updated_at_utc=now(),
                    status='uploading',attempt=0,patient_scope='all_images_in_this_explicit_submission',error=None,
                    engine=engine,privacy=privacy if engine in API_ENGINES else None)
                store.db.execute('INSERT INTO patient_intakes VALUES(?,?,?,?,?)',(job_id,request_id,digest(request),case['case_id'],encode(job)))
                store.registry._audit('patient_intake_created',dict(**job,request_id=request_id,same_patient=True))
            return dict(status='created',job=self.public(store,job))
        finally:store.close()

    def upload(self,job_id,file_id,name,body):
        folder=self.path(job_id)
        if not isinstance(file_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',file_id):raise ValueError('Invalid source file ID')
        if (not isinstance(name,str) or not name.strip() or len(name)>240 or
                '/' in name or '\\' in name or any(ord(c)<32 for c in name)):
            raise ValueError('Supply a source filename without directory paths')
        if not body or len(body)>MAX_IMAGE:raise ValueError('Each source image must be at most 20 MiB')
        try:
            with warnings.catch_warnings():
                warnings.simplefilter('error',Image.DecompressionBombWarning)
                with Image.open(io.BytesIO(body)) as image:
                    kind=image.format
                    if kind not in FORMATS or image.width*image.height>50_000_000 or getattr(image,'n_frames',1)!=1:
                        raise ValueError('Use a single-page JPEG, PNG, TIFF, BMP or WebP image under 50 million pixels')
                    image.verify()
        except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning) as error:
            raise ValueError('The uploaded bytes are not a supported image') from error
        checksum=hashlib.sha256(body).hexdigest();suffix,mime=FORMATS[kind]
        store=ReviewStore(self.application.database)
        try:
            with store.atomic_batch():
                job=self.load(store,job_id);files=self.files(store,job_id)
                existing=next((f for f in files if f['file_id']==file_id),None)
                if existing:
                    if existing['sha256']!=checksum or existing['name']!=name:raise ValueError('Upload ID reused for a different image')
                    return dict(status='already_uploaded',job=self.public(store,job))
                if job['status']!='uploading':raise ValueError('This submission no longer accepts images')
                if len(files)>=job['expected_files'] or sum(f['size'] for f in files)+len(body)>MAX_BATCH:
                    raise ValueError('Submission image count or 100 MiB limit exceeded')
                if any(f['sha256']==checksum for f in files):raise ValueError('This image is already in the submission')
                prior=store.assignment('doc-'+checksum)
                if prior and prior['identity_status']=='confirmed' and prior['case_id']!=job['case_id']:
                    raise ValueError('This exact source image is already linked to another patient; review that identity separately')
                folder.mkdir(parents=True,exist_ok=True)
                target=folder/(file_id+suffix)
                if target.exists():
                    if hashlib.sha256(target.read_bytes()).hexdigest()!=checksum:raise ValueError('Saved source differs from this upload')
                else:
                    with target.open('xb') as stream:stream.write(body)
                item=dict(file_id=file_id,name=name,path=target.relative_to(self.workspace).as_posix(),
                    sha256=checksum,size=len(body),mime=mime,source_document_id='U-'+job_id[7:15]+'-'+file_id)
                store.db.execute('INSERT INTO patient_intake_files VALUES(?,?,?,?)',(job_id,file_id,checksum,encode(item)))
                store.registry._audit('patient_intake_image_uploaded',dict(job_id=job_id,**item))
            return dict(status='uploaded',job=self.public(store,job))
        finally:store.close()

    def source(self,job_id,file_id):
        self.path(job_id)
        store=ReviewStore(self.application.database,read_only=True)
        try:item=next((f for f in self.files(store,job_id) if f['file_id']==file_id),None)
        finally:store.close()
        if not item:raise KeyError('Unknown uploaded source')
        path=(self.workspace/item['path']).resolve()
        if not path.is_relative_to(self.path(job_id)):raise ValueError('Uploaded source escapes submission storage')
        body=path.read_bytes()
        if hashlib.sha256(body).hexdigest()!=item['sha256']:raise ValueError('Uploaded source changed')
        return body,item['mime']

    def start(self,*,job_id,retry=False):
        self.path(job_id)
        store=ReviewStore(self.application.database)
        try:
            with store.atomic_batch():
                job=self.load(store,job_id);files=self.files(store,job_id)
                if job['status'] in {'queued','launching','processing','completed'}:
                    return dict(status='already_started',job=self.public(store,job))
                if job['status']!='uploading' and not (job['status']=='failed' and retry is True):
                    raise ValueError('Inspect the previous process before retrying this submission')
                if self.live_process(job):raise ValueError('A previous OCR process is still running; do not start another attempt')
                if len(files)!=job['expected_files']:raise ValueError('Upload every selected image before starting OCR')
                for item in files:self.source(job_id,item['file_id'])
                if job.get('engine') in API_ENGINES:
                    configuration(self.workspace,engine=job['engine'])
                    plans=privacy_plan(job['privacy'],len(files));index={p['sha256']:p for p in plans}
                    if set(index)!={f['sha256'] for f in files}:raise ValueError('Privacy review does not match every uploaded source')
                    for item in files:prepare_image(self.source(job_id,item['file_id'])[0],index[item['sha256']])
                job.update(status='queued',error=None)
                self.save(store,job);store.registry._audit('patient_intake_queued',dict(job_id=job_id,retry=retry))
            self.ensure_worker();self.wake.set()
            return dict(status='queued',job=self.public(store,job))
        finally:store.close()

    def register_bundle(self,job):
        path=(self.path(job['job_id'])/job['bundle']).resolve()
        if not path.is_relative_to(self.path(job['job_id'])):raise ValueError('Intake bundle escaped job storage')
        package=verify_bundle(path,read(path/'dictionary.json'))
        store=ReviewStore(self.application.database,read_only=True)
        try:
            if digest(store.registry.package(package['package_id'],package['revision']))!=digest(package):raise ValueError('Intake bundle differs from registry')
        finally:store.close()
        self.application.bundles[package['package_id'],package['revision']]=(path,package)

    def publish(self,job_id,bundle):
        folder=self.path(job_id);bundle=Path(bundle).resolve()
        if not bundle.is_relative_to(folder):raise ValueError('OCR output must belong to this submission')
        dictionary=read(bundle/'dictionary.json');package=verify_bundle(bundle,dictionary)
        store=ReviewStore(self.application.database)
        try:
            with store.atomic_batch():
                job=self.load(store,job_id)
                if job['status']=='completed':return
                if job['status']!='processing':raise ValueError('Submission is not processing')
                files=self.files(store,job_id)
                expected={f['sha256']:f['source_document_id'] for f in files}
                actual={d['input_sha256']:d['source_document_id'] for d in package['documents']}
                if expected!=actual or len(package['documents'])!=len(files):raise ValueError('OCR output does not contain exactly this patient submission')
                for item in files:self.source(job_id,item['file_id'])
                for row in store.db.execute('SELECT sha256 FROM dictionaries'):
                    if row[0]!=digest(dictionary):raise ValueError('Submission dictionary differs from this registry')
                for document in package['documents']:
                    prior=store.assignment(document['document_id'])
                    if prior and (prior['identity_status']!='confirmed' or prior['case_id']!=job['case_id']):
                        raise ValueError('Source identity changed; review its patient link separately')
                store.registry.import_package(package,dictionary)
                who=job['submitted_by']
                for document in package['documents']:
                    if store.assignment(document['document_id']) is None:
                        store.assign_document(document['document_id'],case_id=job['case_id'],actor=who['name'],
                            role=who['declared_role'],reason='User explicitly submitted these images together for one patient; OCR values still await review.')
                job.update(status='completed',error=None,bundle=bundle.relative_to(folder).as_posix(),
                    package_id=package['package_id'],revision=package['revision'],
                    observations=len(package['observations']),metadata=len(package['metadata_candidates']),
                    specimens=len(package.get('specimen_candidates',[])),issues=len(package.get('source_issues',[])),completed_at_utc=now())
                self.save(store,job);store.registry._audit('patient_intake_completed',dict(job_id=job_id,case_id=job['case_id'],
                    package_id=package['package_id'],revision=package['revision'],all_values_pending=True))
            self.application.bundles[package['package_id'],package['revision']]=(bundle,package)
        finally:store.close()

    def live_process(self,job):
        if job.get('pid'):
            token=process_token(job['pid'])
            if token and (job.get('process_token') is None or token==job['process_token']):return True
        path=self.path(job['job_id'])/job.get('output','not-started')/'workflow.json'
        # A crash during atomic replacement may leave a newer .tmp containing
        # the child PID while the published state still says "launching".
        snapshots=[p for p in (path,path.with_suffix('.json.tmp')) if p.is_file()]
        if snapshots:
            latest=max(snapshots,key=lambda p:(p.stat().st_mtime_ns,p.suffix=='.tmp'))
            try:
                state=read(latest)
                if not isinstance(state.get('stages'),dict):raise ValueError('Invalid workflow stages')
            except (OSError,ValueError,AttributeError) as error:
                raise RuntimeError('Child process state uncertain; inspect saved workflow before recovery') from error
            for stage in state.get('stages',{}).values():
                for attempt in stage.get('attempts',[]):
                    if attempt.get('status')!='running':continue
                    if attempt.get('pid'):
                        token=process_token(attempt['pid'])
                        if token and (attempt.get('process_token') is None or token==attempt['process_token']):return True
                    elif not attempt.get('launch_failed'):
                        raise RuntimeError('Child launch state uncertain; inspect local process before recovery')
        return False

    def api_health(self,jobs,recent=5):
        """Warnings about the external API from the most recent finished API submissions (newest first)."""
        finished=[j for j in jobs if j.get('engine') in API_ENGINES and j['status'] in {'completed','failed','needs_attention'}][:recent]
        warnings=[]
        streak=0
        for job in finished:
            if job['status']=='completed':break
            streak+=1
        if streak>=2:
            warnings.append(f'{streak} lượt gửi API gần nhất đều lỗi; kiểm tra kết nối hoặc khóa API trước khi gửi tiếp.')
        failed=sent=0;slow=[]
        for job in finished:
            path=self.path(job['job_id'])/job.get('output','not-started')/'api-health.json'
            try:health=read(path)
            except (OSError,ValueError):continue
            failed+=int(health.get('failed') or 0);sent+=int(health.get('sent') or 0)
            slow+=[s for s in health.get('seconds',[]) if isinstance(s,(int,float)) and s>API_SLOW_SECONDS]
        if failed:
            warnings.append(f'{failed}/{sent} ảnh trong các lượt gần đây không đọc được qua API (đã tách riêng, cần chạy lại).')
        if slow:
            warnings.append(f'{len(slow)} ảnh gần đây mất hơn {API_SLOW_SECONDS} giây qua API; dịch vụ đang chậm.')
        return dict(checked=len(finished),warnings=warnings)

    def may_be_running(self,job):
        """A job needing attention blocks the queue only while a child process could still run.

        Unclear launch state blocks until its saved workflow has been idle for
        INTAKE_STALE_SECONDS, so a stuck record cannot hold the queue forever.
        """
        folder=self.path(job['job_id'])
        workflow=[p for p in (folder/job.get('output','not-started')/'workflow.json',
                              folder/job.get('output','not-started')/'workflow.json.tmp') if p.is_file()]
        try:
            if self.live_process(job):return True
            # No live PID and a readable workflow record: the child has ended.
            if workflow:return False
        except Exception:
            pass
        # Launch state unknown: keep blocking until the saved files have been idle long enough.
        stamps=[p.stat().st_mtime for p in (*workflow,folder/'manifest.json') if p.is_file()]
        return not stamps or time.time()-max(stamps)<INTAKE_STALE_SECONDS

    def process(self,job):
        job_id=job['job_id'];folder=self.path(job_id)
        if job['status']=='queued':
            store=ReviewStore(self.application.database)
            try:
                with store.atomic_batch():
                    job=self.load(store,job_id)
                    if job['status']!='queued':return
                    files=self.files(store,job_id)
                    folder.mkdir(parents=True,exist_ok=True)
                    manifest=folder/'manifest.json'
                    if job.get('engine') in API_ENGINES:
                        plans={p['sha256']:p for p in job['privacy']}
                        docs=[dict(document_id=f['source_document_id'],input_path=f['path'],input_sha256=f['sha256'],privacy=plans[f['sha256']]) for f in files]
                    else:docs=[dict(document_id=f['source_document_id'],input_path=f['path']) for f in files]
                    write(manifest,dict(documents=docs))
                    job.update(status='launching',attempt=job['attempt']+1,output='workflow-'+str(job['attempt']+1),pid=None,process_token=None)
                    self.save(store,job)
                if self.runner:
                    with store.atomic_batch():job['status']='processing';self.save(store,job)
                    bundle=self.runner(job,files,folder)
                    self.publish(job_id,bundle)
                    return
                uses_api=job.get('engine') in API_ENGINES
                python=Path(sys.executable) if uses_api else venv_python(self.workspace/'.venv-senocr')
                runner='scripts/run_gemini_pool.py' if uses_api else 'scripts/run_automatic_pool.py'
                engine_args=['--engine',job['engine']] if uses_api else []
                try:
                    if not python.is_file():raise ValueError('Processing Python environment is missing')
                    with (folder/('attempt-'+str(job['attempt'])+'.log')).open('wb') as log:
                        child=subprocess.Popen([str(python),'-X','utf8',str(self.workspace/runner),
                            '--manifest',str(manifest),'--output',str(folder/job['output']),*engine_args],cwd=self.workspace,
                            stdout=log,stderr=log,shell=False,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
                except Exception:
                    job['status']='failed'
                    with store.atomic_batch():self.save(store,job)
                    raise
                self.children[job_id]=child
                job.update(status='processing',pid=child.pid,process_token=process_token(child.pid),
                           started_at_epoch=time.time())
                with store.atomic_batch():self.save(store,job)
            finally:store.close()
        elif job['status']=='launching':
            raise RuntimeError('Launch state uncertain after restart; inspect local process before recovery')
        elif job['status']=='processing':
            child=self.children.get(job_id)
            if child and child.poll() is None:
                # A hung API call must not hold the queue forever. Only our own
                # child is stopped; originals stay so the submission can be rerun.
                started=job.get('started_at_epoch')
                if started and time.time()-started>INTAKE_TIME_LIMIT:
                    child.terminate()
                    try:child.wait(timeout=30)
                    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=30)
                    raise ValueError('OCR exceeded the %d-minute limit and was stopped; originals are retained'
                                     % (INTAKE_TIME_LIMIT//60))
                return
            if self.live_process(job):return
            output=folder/job['output'];receipt=output/'result.json'
            if not receipt.is_file():raise ValueError('OCR stopped without completed output; originals are retained')
            result=read(receipt)
            if result.get('status')!='completed' or read(output/'workflow.json').get('status')!='completed':
                raise ValueError('OCR did not complete')
            self.publish(job_id,result['bundle'])

    def loop(self):
        while not self.stop.is_set():
            store=ReviewStore(self.application.database,read_only=True)
            try:
                jobs=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM patient_intakes ORDER BY rowid')]
            finally:store.close()
            active=next((j for j in jobs if j['status'] in {'launching','processing'}),None)
            uncertain=any(j['status']=='needs_attention' and self.may_be_running(j) for j in jobs)
            job=active or (None if uncertain else next((j for j in jobs if j['status']=='queued'),None))
            if job:
                try:self.process(job)
                except Exception as error:
                    store=ReviewStore(self.application.database)
                    try:
                        with store.atomic_batch():
                            latest=self.load(store,job['job_id'])
                            try:
                                uncertain=latest['status'] in {'launching','completed'} or self.live_process(latest)
                            except Exception:
                                uncertain=True
                            latest.update(status='needs_attention' if uncertain else 'failed',error=str(error)[:500])
                            self.save(store,latest);store.registry._audit('patient_intake_failed',dict(job_id=job['job_id'],status=latest['status'],error=latest['error']))
                    finally:store.close()
            self.wake.wait(1);self.wake.clear()
