"""Local human review interface over immutable registry packages.

Declared roles record provenance only. This pilot binds to IPv4 loopback;
it does not provide user authentication or a shared network service.
"""
import argparse
import hashlib
import json
import mimetypes
from pathlib import Path
import secrets
from http.server import BaseHTTPRequestHandler,HTTPServer
from urllib.parse import parse_qs,urlsplit,urlencode

from registry_pool.dictionary import digest
from registry_pool.exchange import read,safe_key,verify_bundle
from registry_pool.specimens import evidence_region_id
from ocr_pool.llm import API_ENGINES
from .store import ReviewStore,EDITABLE
from .source import GROUPS
from .corrections import editable_source
from .exports import ExportManager,StalePreview
from .workspace import record_patient_batch,StalePatient
from .intake import IntakeManager,MAX_IMAGE
from .privacy import PrivacyProposals
from .crf import CRFReview
from .crf_knowledge import knowledge_library, read_knowledge


class ReviewApplication:
    def __init__(self,database,bundles=(),*,intake_workspace=None,intake_root=None,intake_runner=None,privacy_runner=None,**export_options):
        self.database=Path(database).resolve()
        if not self.database.is_file():
            raise FileNotFoundError('Import a registry database before opening review')
        self.token=secrets.token_hex(32)
        self.nonce=secrets.token_hex(20)
        self.bundles={}
        store=ReviewStore(self.database)
        try:
            for path in bundles:
                root=Path(path).resolve()
                package=verify_bundle(root,read(root/'dictionary.json'))
                key=(package['package_id'],package['revision'])
                if key in self.bundles:
                    raise ValueError('Duplicate package revision bundle')
                if digest(store.registry.package(*key))!=digest(package):
                    raise ValueError('Bundle differs from imported registry package')
                self.bundles[key]=(root,package)
        finally:
            store.close()
        self.exports=ExportManager(self,**export_options)
        intake_options=dict(root=intake_root,runner=intake_runner)
        if intake_workspace is not None:intake_options['workspace']=intake_workspace
        self.intakes=IntakeManager(self,**intake_options)
        self.privacy=PrivacyProposals(self.intakes.workspace,runner=privacy_runner)
        self.crf=CRFReview(self)

    def asset_url(self,key,asset):
        return '/asset?'+urlencode(dict(package_id=key[0],revision=key[1],key=asset))

    def package_view(self,store,package_id,revision):
        package=store.registry.package(package_id,revision)
        key=(package['package_id'],package['revision'])
        has_bundle=key in self.bundles
        source_latest=store.source_review_index(*key)
        def source_status(kind,item,identity_key):
            latest=source_latest.get((kind,item[identity_key]))
            return dict(source_candidate_sha256=digest(item),source_review=latest,
                source_review_status='source_verified' if latest and latest['action']=='approve' else
                    latest['action'] if latest else 'pending',
                source_review_history=store.source_history(*key,kind,item[identity_key]),
                effective_source_data=store.source_value(kind,item,latest),
                correction_fields=editable_source(kind,item),
                pending_correction=store.pending_correction(*key,kind,item[identity_key],latest),
                correction_history=store.correction_history(*key,kind,item[identity_key]))
        evidence={e['evidence_id']:e for e in package['evidence']}
        dictionary=json.loads(store.db.execute('SELECT payload FROM dictionaries WHERE version=?',
            (package['dictionary_version'],)).fetchone()[0])
        labels={f['field_id']:f['label'] for f in dictionary['fields']}
        documents=[]
        effective={}
        for document in package['documents']:
            assignment=store.assignment(document['document_id'])
            if assignment and assignment['identity_status']=='confirmed' and assignment['case_id'] not in effective:
                effective[assignment['case_id']]=store.effective_pool(assignment['case_id'])['observations']
            documents.append(dict(**document,assignment=assignment,
                source_url=self.asset_url(key,document['source_key']) if has_bundle else None))
        observations=[]
        for observation in package['observations']:
            history=store.history(*key,observation['observation_id'])
            human=[r for r in history if r['reviewer']['declared_role']!='assistant']
            base=human[-1]['after'] if human and human[-1]['action'] in {'accept','correct'} else observation['source_data']
            entries=[]
            for eid in dict.fromkeys(observation['evidence_ids']+observation.get('date_evidence_ids',[])):
                ev=evidence[eid]
                data=ev['source_data']
                tid=evidence_region_id(data)
                entries.append(dict(**ev,crop_url=self.asset_url(key,'artifacts/crops/'+tid+'.png') if has_bundle else None,
                    raw_url=self.asset_url(key,'artifacts/raw/'+tid+'.txt') if has_bundle else None))
            replacement_options=[]
            identity=store.assignment(observation['document_id'])
            if identity and identity['identity_status']=='confirmed':
                for accepted in effective.get(identity['case_id'],[]):
                    if ((accepted['document_id'],accepted['field_id'],accepted['component'])==
                            (observation['document_id'],observation['field_id'],observation['component'])
                            and (accepted['package_id'],accepted['revision'],accepted['observation_id'])!=
                            (*key,observation['observation_id'])):
                        replacement_options.append(dict(review_ids=accepted['review_ids'],value=accepted['value'],
                            revision=accepted['revision'],review_status=accepted['review_status']))
            observations.append(dict(**observation,label=labels[observation['field_id']],history=history,
                latest_review=history[-1] if history else None,
                editable_value={k:v for k,v in base.items() if k in EDITABLE},evidence=entries,
                replacement_options=replacement_options,**source_status('observation',observation,'observation_id')))
        specimens=[]
        for sample in package.get('specimen_candidates',[]):
            entries=[]
            for eid in sample['evidence_ids']:
                ev=evidence[eid]
                tid=evidence_region_id(ev['source_data'])
                entries.append(dict(**ev,crop_url=self.asset_url(key,'artifacts/crops/'+tid+'.png') if has_bundle else None,
                    raw_url=self.asset_url(key,'artifacts/raw/'+tid+'.txt') if has_bundle else None))
            specimens.append(dict(**sample,evidence=entries,**source_status('specimen',sample,'sample_id')))
        metadata=[]
        for item in package['metadata_candidates']:
            entries=[]
            for eid in item['evidence_ids']:
                ev=evidence[eid]
                tid=evidence_region_id(ev['source_data'])
                entries.append(dict(**ev,crop_url=self.asset_url(key,'artifacts/crops/'+tid+'.png') if has_bundle else None,
                    raw_url=self.asset_url(key,'artifacts/raw/'+tid+'.txt') if has_bundle else None))
            metadata.append(dict(**item,evidence=entries,**source_status('metadata',item,'candidate_id')))
        return dict(package_id=key[0],revision=key[1],documents=documents,observations=observations,
            package_sha256=digest(package),specimen_candidates=specimens,
            metadata_candidates=metadata,source_available=has_bundle,
            source_review_batches=store.source_batches(*key),
            source_review_summary={group:dict(total=len(package.get(group,[])),
                approved=sum(r['action']=='approve' and r['candidate_type']==kind for r in source_latest.values()))
                for kind,(group,_) in GROUPS.items()},
            note='Source approvals are versioned separately. Case identity and clinical acceptance require separate decisions.')

    def asset(self,package_id,revision,key):
        bundle=self.bundles.get((package_id,revision))
        if not bundle:
            raise KeyError('No verified source bundle for this revision')
        root,package=bundle
        asset=next((a for a in package['assets'] if a['key']==key),None)
        if asset is None:
            raise KeyError('Unknown bundled asset')
        path=safe_key(root,key)
        if path.suffix.lower() not in {'.png','.jpg','.jpeg','.tif','.tiff','.pdf','.txt'}:
            raise ValueError('Only source images, PDFs and raw text can be viewed')
        body=path.read_bytes()
        if len(body)!=asset['size'] or hashlib.sha256(body).hexdigest()!=asset['sha256']:
            raise ValueError('Source asset changed since the bundle was verified')
        return body,'text/plain; charset=utf-8' if path.suffix=='.txt' else mimetypes.guess_type(path.name)[0] or 'application/octet-stream'


def make_handler(application):
    class Handler(BaseHTTPRequestHandler):
        server_version='LocalRegistryReview/0.1'

        def log_message(self,*args):
            # Requests may contain clinical identifiers. Keep them out of logs.
            pass

        def allowed_request(self):
            authority='127.0.0.1:'+str(self.server.server_port)
            if self.headers.get('Host')!=authority:
                raise PermissionError('Open the exact 127.0.0.1 review address')
            if self.headers.get('Origin') not in {None,'http://'+authority}:
                raise PermissionError('Cross-origin review requests are not allowed')
            # A top-level navigation may open the empty UI shell from a link.
            # Same-origin checks still protect every data/asset/API request.
            shell_navigation=(self.command=='GET' and self.path=='/'
                and self.headers.get('Sec-Fetch-Mode')=='navigate'
                and self.headers.get('Sec-Fetch-Dest')=='document')
            if self.headers.get('Sec-Fetch-Site')=='cross-site' and not shell_navigation:
                raise PermissionError('Cross-site review requests are not allowed')

        def send(self,status,body,content_type='application/json; charset=utf-8',download=False):
            if not isinstance(body,bytes):
                body=json.dumps(body,ensure_ascii=False,allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; script-src 'nonce-"+application.nonce+"'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            if download:
                filename=download if isinstance(download,str) else 'reviewed-pool.json'
                self.send_header('Content-Disposition','attachment; filename="'+filename+'"')
            self.end_headers()
            self.wfile.write(body)

        def process(self):
            store=None
            try:
                body=None
                url=urlsplit(self.path)
                if self.command=='POST':
                    length=int(self.headers.get('Content-Length','0'))
                    limit=MAX_IMAGE if url.path in {'/api/intakes/image','/api/privacy-proposals'} else 262144
                    if length<1 or length>limit:
                        raise ValueError('Invalid review request size')
                    # Drain a bounded body before an HTTP rejection. Closing a
                    # Windows socket with unread POST bytes can reset it before
                    # the client receives the 403 response.
                    self.connection.settimeout(10)
                    body=self.rfile.read(length)
                    if len(body)!=length:
                        raise ValueError('Incomplete review request body')
                self.allowed_request()
                params=parse_qs(url.query,strict_parsing=True)
                def param(name):
                    values=params.get(name,[])
                    if len(values)!=1 or not values[0]:
                        raise ValueError('Supply one '+name)
                    return values[0]
                if self.command=='GET' and url.path=='/':
                    page=Path(__file__).with_name('review.html').read_text(encoding='utf-8')
                    page=page.replace('{{CSRF_TOKEN}}',json.dumps(application.token)).replace('{{NONCE}}',application.nonce)
                    self.send(200,page.encode('utf-8'),'text/html; charset=utf-8')
                    return
                if self.command=='GET' and url.path=='/asset':
                    body,kind=application.asset(param('package_id'),int(param('revision')),param('key'))
                    self.send(200,body,kind)
                    return
                if self.command=='GET' and url.path=='/api/intakes/source':
                    body,kind=application.intakes.source(param('job_id'),param('file_id'))
                    self.send(200,body,kind)
                    return
                if self.command=='POST' and url.path=='/api/privacy-proposals':
                    if self.headers.get('X-Review-Token')!=application.token:
                        raise PermissionError('Missing or invalid local review token')
                    if self.headers.get('Content-Type')!='application/octet-stream':
                        raise ValueError('Upload image bytes as application/octet-stream')
                    self.send(200,application.privacy.create(body,param('sha256')))
                    return
                if self.command=='GET' and url.path=='/api/privacy-proposals':
                    self.send(200,application.privacy.get(param('job_id')))
                    return
                if self.command=='POST' and url.path=='/api/intakes/image':
                    if self.headers.get('X-Review-Token')!=application.token:
                        raise PermissionError('Missing or invalid local review token')
                    if self.headers.get('Content-Type')!='application/octet-stream':
                        raise ValueError('Upload source image bytes as application/octet-stream')
                    result=application.intakes.upload(param('job_id'),param('file_id'),param('name'),body)
                    self.send(200,result)
                    return
                if self.command=='GET' and url.path=='/api/exports/download':
                    body,kind,name=application.exports.download(param('export_id'),param('name'))
                    self.send(200,body,kind,download=name)
                    return
                store=ReviewStore(application.database)
                if self.command=='GET':
                    if url.path=='/api/intakes':
                        result=application.intakes.list()
                    elif url.path=='/api/exports/options':
                        result=application.exports.options()
                    elif url.path in {'/api/patient','/api/patient/export'}:
                        result=application.exports.patient(param('case_id'))
                        if url.path=='/api/patient/export':
                            self.send(200,result,download='patient-fields.json')
                            return
                    elif url.path=='/api/summary':
                        result=store.summary()
                        result['crf_available']=True
                        for package in result['packages']:
                            package['source_available']=(package['package_id'],package['revision']) in application.bundles
                        result['mode']='Local pilot: declared roles, no user authentication'
                    elif url.path=='/api/crf/knowledge':
                        result=read_knowledge(store.db,param('version')) if 'version' in params else knowledge_library(store.db)
                    elif url.path=='/api/crf':
                        store.db.execute('BEGIN')
                        result=application.crf.view(store,param('case_id'))
                        result['review_sha256']=digest(result['review']) if result['review'] else None
                    elif url.path=='/api/crf/word':
                        store.db.execute('BEGIN')
                        data=application.crf.word(store,param('case_id'),param('review_sha256'))
                        self.send(200,data,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',download='CRF-da-duyet.docx')
                        return
                    elif url.path=='/api/crf/references':
                        store.db.execute('BEGIN')
                        result=application.crf.references(store,param('case_id'))
                    elif url.path=='/api/package':
                        result=application.package_view(store,param('package_id'),int(param('revision')))
                    elif url.path=='/api/source-reviewed':
                        key=(param('package_id'),int(param('revision')))
                        if key not in application.bundles:
                            raise ValueError('Load the verified source bundle before exporting source-reviewed data')
                        root,package=application.bundles[key]
                        verified=verify_bundle(root,read(root/'dictionary.json'))
                        if digest(verified)!=digest(package):
                            raise ValueError('Source bundle changed since review was loaded')
                        result=store.source_reviewed_pool(*key)
                        self.send(200,result,download=True)
                        return
                    elif url.path in {'/api/effective','/api/export'}:
                        result=store.effective_pool(param('case_id'),encounter_id=params.get('encounter_id',[None])[0])
                        if url.path=='/api/export':
                            excluded=[o for o in result['observations'] if not o['eligible_for_verified_pool']]
                            result['observations']=[o for o in result['observations'] if o['eligible_for_verified_pool']]
                            result['excluded_conflict_count']=len(excluded)
                            result['export_policy']='accepted_only_conflicts_excluded; JSON_pool; REDCap_Word_use_preview_exports'
                            self.send(200,result,download=True)
                            return
                    else:
                        raise KeyError('Unknown review route')
                elif self.command=='POST':
                    if self.headers.get('X-Review-Token')!=application.token:
                        raise PermissionError('Missing or invalid local review token')
                    if self.headers.get('Content-Type')!='application/json':
                        raise ValueError('Review requests require application/json')
                    payload=json.loads(body)
                    if not isinstance(payload,dict):
                        raise ValueError('Review request must be an object')
                    if url.path=='/api/intakes':
                        if payload.get('engine') in API_ENGINES:
                            application.privacy.validate_intake_plans(payload.get('privacy'))
                        result=application.intakes.create(**payload)
                    elif url.path=='/api/intakes/start':
                        result=application.intakes.start(**payload)
                    elif url.path=='/api/crf/generate':
                        result=application.crf.generate(store,**payload)
                    elif url.path=='/api/crf/scores':
                        result=application.crf.scores(store,**payload)
                    elif url.path=='/api/crf/approve':
                        result=application.crf.approve(store,**payload)
                    elif url.path=='/api/crf/references':
                        result=application.crf.save_references(store,**payload)
                    elif url.path=='/api/exports/preview':
                        result=application.exports.preview(**payload)
                    elif url.path=='/api/exports/create':
                        result=application.exports.create(**payload)
                    elif url.path=='/api/cases':
                        result=store.create_case(**payload)
                    elif url.path=='/api/encounters':
                        result=store.create_encounter(**payload)
                    elif url.path=='/api/assign':
                        result=store.assign_document(**payload)
                    elif url.path=='/api/review':
                        key=(payload.get('package_id'),payload.get('revision'))
                        if payload.get('action') in {'accept','correct'}:
                            if key not in application.bundles:
                                raise ValueError('Load the verified source bundle before accepting values')
                            # Recheck assets at acceptance, not just server startup.
                            root,package=application.bundles[key]
                            verified=verify_bundle(root,read(root/'dictionary.json'))
                            if digest(verified)!=digest(package):
                                raise ValueError('Source bundle changed since the review was loaded')
                        result=store.review(**payload)
                    elif url.path=='/api/patient-review':
                        dictionary,_,_=application.exports.configuration()
                        def verify_patient_sources(keys):
                            for key in keys:
                                if key not in application.bundles:
                                    raise ValueError('Nạp đủ bundle nguồn trước khi duyệt dữ liệu bệnh nhân.')
                                root,package=application.bundles[key]
                                verified=verify_bundle(root,read(root/'dictionary.json'))
                                if digest(verified)!=digest(package) or digest(verified)!=digest(store.registry.package(*key)):
                                    raise ValueError('Nguồn đã đổi; không lưu duyệt hàng loạt.')
                        result=record_patient_batch(store,dictionary,verify_sources=verify_patient_sources,**payload)
                    elif url.path=='/api/source-correction':
                        key=(payload.get('package_id'),payload.get('revision'))
                        if payload.get('action')!='withdraw':
                            if key not in application.bundles:
                                raise ValueError('Load the verified source bundle before proposing a correction')
                            root,package=application.bundles[key]
                            verified=verify_bundle(root,read(root/'dictionary.json'))
                            if digest(verified)!=digest(package) or digest(verified)!=digest(store.registry.package(*key)):
                                raise ValueError('Source bundle changed; reload before correcting')
                        result=store.propose_source_correction(**payload)
                    elif url.path=='/api/source-review':
                        key=(payload.get('package_id'),payload.get('revision'))
                        decisions=payload.get('decisions')
                        if isinstance(decisions,list) and any(isinstance(d,dict) and d.get('action')=='approve' for d in decisions):
                            if key not in application.bundles:
                                raise ValueError('Load the verified source bundle before source approval')
                            root,package=application.bundles[key]
                            verified=verify_bundle(root,read(root/'dictionary.json'))
                            if digest(verified)!=digest(package):
                                raise ValueError('Source bundle changed since review was loaded')
                        result=store.record_source_batch(**payload)
                    else:
                        raise KeyError('Unknown review route')
                else:
                    raise ValueError('Unsupported review method')
                self.send(200,result)
            except PermissionError as error:
                self.send(403,dict(error=str(error)))
            except KeyError as error:
                self.send(404,dict(error=str(error)))
            except (StalePreview,StalePatient) as error:
                self.send(409,dict(error=str(error)))
            except (ValueError,TypeError) as error:
                self.send(400,dict(error=str(error)))
            except Exception as error:
                import sqlite3
                if isinstance(error,sqlite3.IntegrityError):
                    self.send(409,dict(error='Record conflicts with the stored history or identifier'))
                else:
                    self.send(500,dict(error='Local review failed; no decision should be assumed saved'))
            finally:
                if store is not None:
                    store.close()

        do_GET=process
        do_POST=process
    return Handler


def create_server(database,bundles=(),port=8765,**export_options):
    application=ReviewApplication(database,bundles,**export_options)
    class ReviewHTTPServer(HTTPServer):
        def server_close(self):
            application.privacy.close()
            application.intakes.close()
            super().server_close()
    return ReviewHTTPServer(('127.0.0.1',port),make_handler(application)),application


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',required=True,type=Path)
    parser.add_argument('--bundle',action='append',default=[],type=Path)
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--export-dir',type=Path)
    parser.add_argument('--export-template',type=Path)
    parser.add_argument('--export-ledger',type=Path)
    parser.add_argument('--redcap-project',default='local-draft')
    parser.add_argument('--synthetic',action='store_true',help='Explicitly mark exports as synthetic test data')
    args=parser.parse_args()
    server,_=create_server(args.db,args.bundle,args.port,export_dir=args.export_dir,
        export_template=args.export_template,export_ledger=args.export_ledger,
        redcap_project=args.redcap_project,synthetic=args.synthetic)
    print('Local review: http://127.0.0.1:'+str(server.server_port),flush=True)
    print('Declared reviewer roles only; use on this computer. Ctrl+C to stop.',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__=='__main__':
    main()
