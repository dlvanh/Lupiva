"""Local, preview-bound draft exports. Paths and project settings are server-owned."""
import copy
import hashlib
import json
from pathlib import Path
import secrets
import time
import zipfile
from xml.etree.ElementTree import ParseError
from urllib.parse import urlencode

from registry_pool.dictionary import digest
from registry_pool.exchange import read,verify_bundle
from registry_export.view import snapshot
from registry_export.mapping import build_mapping
from registry_export.redcap import export_data,data_dictionary,write_csv,DD_COLUMNS,REPEATING
from registry_export.word import export_word
from .store import ReviewStore
from .workspace import patient_workspace


class StalePreview(ValueError):
    pass


class ExportManager:
    def __init__(self,application,*,export_dir=None,export_template=None,
                 redcap_project='local-draft',export_ledger=None,synthetic=False):
        self.application=application
        self.root=Path(export_dir or application.database.parent/'review-exports'/application.database.stem).resolve()
        self.ledger=Path(export_ledger or self.root/'redcap-instances.sqlite').resolve()
        if self.ledger==application.database:
            raise ValueError('Export ledger must be separate from the clinical database')
        if not isinstance(redcap_project,str) or not redcap_project.strip():
            raise ValueError('REDCap project namespace required')
        self.project=redcap_project
        self.synthetic=bool(synthetic)
        self.template=Path(export_template).resolve() if export_template else None
        self.previews={};self.downloads={}

    def configuration(self):
        store=ReviewStore(self.application.database,read_only=True)
        try:
            dictionaries=[json.loads(r[0]) for r in store.db.execute('SELECT payload FROM dictionaries')]
        finally:store.close()
        if not dictionaries or any(digest(d)!=digest(dictionaries[0]) for d in dictionaries):
            raise ValueError('One consistent export dictionary is required')
        dictionary=dictionaries[0];mapping=None;reason='Chưa cấu hình mẫu Word cho máy chủ.'
        if self.template:
            try:
                mapping=build_mapping(dictionary,self.template)
                reason=None
            except (OSError,ValueError,KeyError,zipfile.BadZipFile,ParseError) as error:
                reason='Mẫu Word không hợp lệ: '+str(error)
        config=dict(dictionary_sha256=digest(dictionary),project_namespace=self.project,
            synthetic=self.synthetic,word_mapping_sha256=mapping['mapping_sha256'] if mapping else None,
            word_disabled_reason=reason,output_directory=str(self.root),ledger_path=str(self.ledger))
        return dictionary,mapping,config

    def options(self):
        dictionary,mapping,config=self.configuration()
        store=ReviewStore(self.application.database,read_only=True)
        try:summary=store.summary()
        finally:store.close()
        return dict(**config,cases=summary['cases'],encounters=summary['encounters'],
            field_count=len(dictionary['fields']),component_count=sum(len(f['components']) for f in dictionary['fields']),
            word_bound_fields=sum(bool(f['word']['binding']) for f in mapping['fields']) if mapping else 0,
            repeat_forms=REPEATING,redcap_scope='whole_case_all_visits',word_scope='whole_patient_or_selected_visit')

    @staticmethod
    def scope(full,case_id):
        scoped=copy.deepcopy(full)
        scoped['cases']=[c for c in full['cases'] if c['case_id']==case_id]
        if not scoped['cases']:raise ValueError('Chọn một ca registry hợp lệ.')
        for group in ('encounters','observations','metadata','specimens','excluded'):
            scoped[group]=[v for v in full[group] if v.get('case_id')==case_id]
        scoped['documents']=[v for v in full.get('documents',[]) if v['case_id']==case_id]
        scoped['field_states']={case_id:full['field_states'][case_id]}
        keys={(v['package_id'],v['revision']) for group in ('observations','metadata','specimens','excluded')
              for v in scoped[group]}
        scoped['source_packages']=[p for p in full['source_packages'] if (p['package_id'],p['revision']) in keys]
        scoped.pop('snapshot_sha256',None)
        scoped['snapshot_sha256']=digest(scoped)
        return scoped

    def preview(self,*,case_id,encounter_id=None):
        dictionary,mapping,config=self.configuration()
        full=snapshot(self.application.database,dictionary,synthetic=self.synthetic)
        scoped=self.scope(full,case_id)
        if encounter_id and not any(e['encounter_id']==encounter_id for e in scoped['encounters']):
            raise ValueError('Lần ghi nhận không thuộc ca đã chọn.')
        selected=[v for v in scoped['observations'] if not encounter_id or v['encounter_id']==encounter_id]
        bound={f['field_id'] for f in mapping['fields'] if f['word']['binding']} if mapping else set()
        reasons={}
        for item in scoped['excluded']:reasons[item['reason']]=reasons.get(item['reason'],0)+1
        word_reason=config['word_disabled_reason'] or ('Phạm vi đã chọn chưa có kết quả được chấp nhận cho ca.' if not selected else None)
        report=dict(case=scoped['cases'][0],encounter_id=encounter_id,synthetic=self.synthetic,
            project_namespace=self.project,output_directory=str(self.root),
            redcap=dict(enabled=True,scope='whole_case_all_visits',
                counts={g:len(scoped[g]) for g in ('encounters','observations','metadata','specimens')},
                missing_measurement_dates=sum(not v['value'].get('source_date') for v in scoped['observations']),
                placeholders=sum(bool(v['value'].get('missing_reason')) for v in scoped['observations']),
                accepted_fields=len({v['field_id'] for v in scoped['observations']}),catalog_fields=len(dictionary['fields']),
                repeat_forms=REPEATING),
            word=dict(enabled=word_reason is None,disabled_reason=word_reason,scope='selected_visit' if encounter_id else 'whole_patient',
                observations=len(selected),bound_observations=sum(v['field_id'] in bound for v in selected),
                appendix_observations=sum(v['field_id'] not in bound for v in selected),
                layout_status='draft_requires_visual_review'),
            excluded=dict(count=len(scoped['excluded']),reasons=reasons),
            unassigned_global_count=sum(v.get('case_id') is None for v in full['excluded']),
            snapshot_sha256=scoped['snapshot_sha256'])
        now=time.monotonic()
        self.previews={k:v for k,v in self.previews.items() if v['expires']>now}
        while len(self.previews)>=64:self.previews.pop(next(iter(self.previews)))
        preview_id=secrets.token_hex(24)
        self.previews[preview_id]=dict(case_id=case_id,encounter_id=encounter_id,
            full_hash=full['snapshot_sha256'],config_hash=digest(config),expires=now+1800,created={},report=report)
        return dict(preview_id=preview_id,expires_in_seconds=1800,**report)

    def verify_sources(self,scoped):
        keys={(v['package_id'],v['revision']) for group in ('observations','metadata','specimens') for v in scoped[group]}
        expected={(p['package_id'],p['revision']):p['sha256'] for p in scoped['source_packages']}
        for key in keys:
            bundle=self.application.bundles.get(key)
            if not bundle:raise ValueError('Nạp đủ bundle nguồn của dữ liệu đã duyệt trước khi xuất.')
            root,package=bundle
            verified=verify_bundle(root,read(root/'dictionary.json'))
            if digest(verified)!=digest(package) or digest(verified)!=expected.get(key):
                raise ValueError('Source bundle changed since review was loaded')

    def create(self,*,preview_id,format):
        if format not in {'redcap','word'}:raise ValueError('Định dạng xuất không hợp lệ.')
        entry=self.previews.get(preview_id)
        if not entry or entry['expires']<=time.monotonic():
            raise StalePreview('Bản xem trước đã hết hạn. Hãy xem trước lại.')
        dictionary,mapping,config=self.configuration()
        full=snapshot(self.application.database,dictionary,synthetic=self.synthetic)
        if full['snapshot_sha256']!=entry['full_hash'] or digest(config)!=entry['config_hash']:
            raise StalePreview('Dữ liệu duyệt hoặc cấu hình đã thay đổi. Hãy xem trước lại.')
        scoped=self.scope(full,entry['case_id'])
        self.verify_sources(scoped)
        if not entry['report'][format]['enabled']:
            raise ValueError(entry['report'][format]['disabled_reason'])
        if format in entry['created']:return entry['created'][format]
        export_id=secrets.token_hex(24)
        run=self.root/export_id
        run.mkdir(parents=True,exist_ok=False)
        files=[]
        if format=='redcap':
            self.ledger.parent.mkdir(parents=True,exist_ok=True)
            report=export_data(scoped,run/'redcap-import.csv',self.ledger,self.project,
                record_ids={scoped['cases'][0]['registry_code']})
            write_csv(run/'redcap-data-dictionary.csv',DD_COLUMNS,data_dictionary(dictionary))
            report['repeat_forms_to_enable']=REPEATING
            report['actual_redcap_import_tested']=False
            files=['redcap-import.csv','redcap-data-dictionary.csv']
        else:
            report=export_word(scoped,self.template,mapping,dictionary,run/'filled-crf.docx',
                registry_code=scoped['cases'][0]['registry_code'],encounter_id=entry['encounter_id'],
                patient_summary=entry['encounter_id'] is None)
            report['layout_status']='draft_requires_visual_review'
            files=['filled-crf.docx']
        report.update(preview=entry['report'],export_id=export_id,format=format)
        for name,value in [('pool-snapshot.json',scoped),('export-report.json',report)]:
            with (run/name).open('x',encoding='utf-8') as out:json.dump(value,out,ensure_ascii=False,indent=2,allow_nan=False)
            files.append(name)
        manifest={name:hashlib.sha256((run/name).read_bytes()).hexdigest() for name in files}
        self.downloads[export_id]=(run,manifest)
        result=dict(export_id=export_id,report=report,files=[dict(name=name,url='/api/exports/download?'+
            urlencode(dict(export_id=export_id,name=name))) for name in files])
        entry['created'][format]=result
        return result

    def patient(self,case_id):
        dictionary,_,_=self.configuration()
        full=snapshot(self.application.database,dictionary,synthetic=self.synthetic)
        scoped=self.scope(full,case_id)
        for document in scoped['documents']:
            key=(document['package_id'],document['revision'])
            document['source_url']=self.application.asset_url(key,document['source_key']) if key in self.application.bundles else None
        scoped['labels']={f['field_id']:f['label'] for f in dictionary['fields']}
        scoped['metadata_conflicts']={}
        for key in ('birth_date','sex','age','height','weight'):
            selected=[m for m in scoped['metadata'] if m['key']==key]
            values={digest(m['value'].get('value')) for m in selected}
            if len(values)>1:scoped['metadata_conflicts'][key]=[m['candidate_id'] for m in selected]
        store=ReviewStore(self.application.database,read_only=True)
        try:
            store.db.execute('BEGIN')
            workspace=patient_workspace(store,dictionary,case_id)
            for candidate in workspace['candidates']:
                key=(candidate['package_id'],candidate['revision'])
                candidate['source_available']=key in self.application.bundles
                candidate['evidence']=[]
                if key in self.application.bundles:
                    from registry_pool.specimens import evidence_region_id
                    package=self.application.bundles[key][1]
                    evidence={e['evidence_id']:e for e in package['evidence']}
                    document=next(d for d in package['documents'] if d['document_id']==candidate['document_id'])
                    candidate['source_url']=self.application.asset_url(key,document['source_key'])
                    for eid in candidate['evidence_ids']:
                        tid=evidence_region_id(evidence[eid]['source_data'])
                        candidate['evidence'].append(dict(crop_url=self.application.asset_url(key,'artifacts/crops/'+tid+'.png'),
                            raw_url=self.application.asset_url(key,'artifacts/raw/'+tid+'.txt')))
            scoped['workspace']=workspace
        finally:store.close()
        return scoped

    def download(self,export_id,name):
        if export_id not in self.downloads:raise KeyError('Unknown export')
        root,manifest=self.downloads[export_id]
        if name not in manifest:raise KeyError('Unknown export artifact')
        body=(root/name).read_bytes()
        if hashlib.sha256(body).hexdigest()!=manifest[name]:raise ValueError('Export artifact changed; generate a new export')
        kind={'csv':'text/csv; charset=utf-8','json':'application/json; charset=utf-8',
            'docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}[name.rsplit('.',1)[1]]
        return body,kind,name
