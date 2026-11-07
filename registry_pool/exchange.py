"""Lossless candidate adapter and portable, hash-checked local bundles."""
import copy
import hashlib
import json
from pathlib import Path
import shutil

from .dictionary import digest
from .schema import validate_package
from .specimens import evidence_region_id


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def clean(value,keys):
    return {k:copy.deepcopy(v) for k,v in value.items() if k not in keys}


def entity_id(prefix,item,identity_key,origin_key):
    return prefix+'-'+digest(clean(item,{identity_key,origin_key}))


def convert_candidate(candidate,dictionary,*,package_id=None,revision=1,supersedes=None,assets=None,source_run=None):
    if candidate.get('identity_status')!='unconfirmed' or candidate.get('case_id') is not None:
        raise ValueError('Candidate identity must be unconfirmed; assign separately after review')
    fields={f['field_id']:f for f in dictionary['fields']}
    if set(candidate['fields'])!=set(fields):
        raise ValueError('Candidate catalog differs from dictionary')
    documents=[]
    docmap={}
    for doc in candidate['source_documents']:
        sha=doc.get('input_sha256')
        if not sha:
            raise ValueError('Input source hash required')
        did='doc-'+sha
        docmap[doc['document_id']]=did
        suffix=Path(doc['input_path']).suffix.lower()
        documents.append(dict(document_id=did,source_document_id=doc['document_id'],input_sha256=sha,
                              source_key='sources/'+sha+suffix))
    if len({d['document_id'] for d in documents})!=len(documents):
        raise ValueError('Repeated source image in one package; resolve duplicate documents explicitly')
    evmap,evidence={},[]
    for original in candidate['evidence']:
        item=dict(document_id=docmap[original['document_id']],source_evidence_id=original['evidence_id'],
                  source_data=clean(original,{'evidence_id','document_id'}))
        item['evidence_id']=entity_id('ev',item,'evidence_id','source_evidence_id')
        evmap[original['evidence_id']]=item['evidence_id']
        evidence.append(item)
    mdmap,metadata={},[]
    for original in candidate.get('metadata_candidates',[]):
        item=dict(document_id=docmap[original['document_id']],source_candidate_id=original['candidate_id'],
            key=original['key'],evidence_ids=[evmap[e] for e in original['evidence_ids']],
            source_data=clean(original,{'candidate_id','document_id','evidence_ids'}))
        item['candidate_id']=entity_id('md',item,'candidate_id','source_candidate_id')
        mdmap[original['candidate_id']]=item['candidate_id']
        metadata.append(item)
    obsmap,observations={},[]
    for original in candidate['observations']:
        item=dict(document_id=docmap[original['document_id']],source_observation_id=original['observation_id'],
            field_id=original['field_id'],component=original['component'],
            evidence_ids=[evmap[e] for e in original['evidence_ids']],
            date_evidence_ids=[evmap[e] for e in original.get('date_evidence_ids',[])],
            metadata_candidate_id=mdmap.get(original.get('metadata_candidate_id')),
            source_data=clean(original,{'observation_id','document_id','evidence_ids','date_evidence_ids','metadata_candidate_id'}))
        item['observation_id']=entity_id('obs',item,'observation_id','source_observation_id')
        obsmap[original['observation_id']]=item['observation_id']
        observations.append(item)
    specimens=[]
    for original in candidate.get('specimen_candidates',[]):
        item=dict(document_id=docmap[original['document_id']],source_sample_candidate_id=original['sample_candidate_id'],
            evidence_ids=[evmap[e] for e in original['evidence_ids']],
            source_data=clean(original,{'sample_candidate_id','document_id','evidence_ids'}))
        item['sample_id']=entity_id('sample',item,'sample_id','source_sample_candidate_id')
        specimens.append(item)
    pool_fields={}
    for fid,definition in fields.items():
        legacy=candidate['fields'][fid]
        components={}
        for comp in definition['components']:
            cid=comp['component_id']
            items=[o for o in observations if (o['field_id'],o['component'])==(fid,cid)]
            status=('found' if any(o['source_data']['extraction_status']=='found' for o in items) else
                    'unreadable' if any(o['source_data']['extraction_status']=='unreadable' for o in items) else
                    'not_found' if items else 'not_processed')
            reason=('source_placeholder' if items and all(o['source_data'].get('missing_reason')=='source_placeholder' for o in items)
                    else None if items else 'parser_not_implemented_for_component' if not comp['parser_implemented'] else 'source_scope_incomplete')
            components[cid]=dict(status=status,reason=reason,observation_ids=[o['observation_id'] for o in items])
        pool_fields[fid]=dict(status=legacy['extraction_status'],reason=legacy.get('reason'),
            observation_ids=[obsmap[o] for o in legacy['observation_ids']],components=components)
    package=dict(schema_version='lupus-pool-exchange-1.0',dictionary_version=dictionary['dictionary_version'],
        dictionary_sha256=digest(dictionary),package_id=package_id or 'pending',revision=revision,supersedes=supersedes,
        created_at_utc=candidate['created_at_utc'],case_id=None,identity_status='unconfirmed',
        source_run=source_run or dict(parser_version=candidate['dictionary_version']),documents=documents,
        evidence=evidence,observations=observations,metadata_candidates=metadata,fields=pool_fields,
        source_issues=copy.deepcopy(candidate['issues']),assets=assets or [])
    if 'specimen_candidates' in candidate:
        package.update(schema_version='lupus-pool-exchange-1.1',specimen_candidates=specimens,
            specimen_schema_version=candidate['specimen_schema_version'])
    if package_id is None:
        package['package_id']='pkg-'+digest(clean(package,{'package_id','created_at_utc'}))[:32]
    validate_package(package,dictionary)
    return package


def safe_key(root,key):
    path=Path(key)
    target=(Path(root)/path).resolve()
    if path.is_absolute() or not target.is_relative_to(Path(root).resolve()):
        raise ValueError('Asset key escapes bundle root')
    return target


def verify_bundle(bundle,dictionary):
    bundle=Path(bundle)
    package=read(bundle/'package.json')
    validate_package(package,dictionary)
    listed={}
    for asset in package['assets']:
        if asset['key'] in listed:
            raise ValueError('Repeated asset key')
        path=safe_key(bundle,asset['key'])
        if not path.is_file() or path.stat().st_size!=asset['size'] or hashlib.sha256(path.read_bytes()).hexdigest()!=asset['sha256']:
            raise ValueError('Missing/changed bundle asset: '+asset['key'])
        listed[asset['key']]=asset
    extension=package.get('source_run',{}).get('provenance',{}).get('specimen_extension',{})
    for retry in extension.get('retry_artifacts',[]):
        for key,checksum in retry['artifacts'].items():
            asset=listed.get('artifacts/'+key)
            if asset is None or asset['sha256']!=checksum:
                raise ValueError('Specimen retry provenance asset missing or changed')
    for doc in package['documents']:
        if doc['source_key'] not in listed or listed[doc['source_key']]['sha256']!=doc['input_sha256']:
            raise ValueError('Document source asset/hash missing')
    source_images={}
    for ev in package['evidence']:
        data=ev['source_data']
        tid=evidence_region_id(data)
        raw_key='artifacts/raw/'+tid+'.txt'
        crop_key='artifacts/crops/'+tid+'.png'
        if raw_key not in listed or crop_key not in listed:
            raise ValueError('Evidence raw/crop asset missing or changed')
        # Evidence hashes describe decoded OCR text with universal newlines.
        # Asset hashes above independently protect the exact on-disk bytes.
        raw=safe_key(bundle,raw_key).read_text(encoding='utf-8')
        if hashlib.sha256(raw.encode('utf-8')).hexdigest()!=data['table_sha256']:
            raise ValueError('Evidence raw text hash differs from source')
        if data.get('evidence_kind')=='metadata':
            l,r=data['raw_span_0based']
            if raw[l:r]!=data['value_raw']:
                raise ValueError('Metadata span differs from raw')
        if data.get('evidence_kind')=='sample_form_row':
            from ocr_pool.tables import parse_tables
            tables=parse_tables(raw)
            index=data.get('row_index_0based')
            if (len(tables)!=1 or not isinstance(index,int) or index<0 or index>=len(tables[0].rows)
                    or tables[0].rows[index]!=data.get('row_raw')):
                raise ValueError('Specimen row evidence differs from raw source table')
        if data.get('evidence_kind')=='sample_form_cell' and data.get('raw')!=raw:
            raise ValueError('Specimen cell evidence differs from raw OCR')
        if data.get('evidence_kind') in {'sample_form_row','sample_form_cell'} and data.get('region'):
            from PIL import Image,ImageOps
            from ocr_pool.regions import prepare_region,spec_from_provenance
            did=ev['document_id']
            if did not in source_images:
                doc=next(d for d in package['documents'] if d['document_id']==did)
                with Image.open(safe_key(bundle,doc['source_key'])) as image:
                    source_images[did]=ImageOps.exif_transpose(image).convert('RGB')
            expected,_=prepare_region(source_images[did],spec_from_provenance(data['region']))
            with Image.open(safe_key(bundle,crop_key)) as crop:
                actual=crop.convert('RGB')
            if actual.size!=expected.size or actual.tobytes()!=expected.tobytes():
                raise ValueError('Specimen crop differs from its declared source image transform')
    return package


def build_bundle(run,output,dictionary,workspace,**options):
    run,output,workspace=Path(run),Path(output),Path(workspace).resolve()
    if output.exists():
        raise FileExistsError('Choose a new exchange bundle directory')
    candidate=read(run/'candidate-pool.json')
    # Validate all logical structures before copying any source assets.
    convert_candidate(candidate,dictionary,**options)
    output.mkdir(parents=True)
    assets=[]
    def copy_asset(source,key,role):
        target=safe_key(output,key)
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source,target)
        assets.append(dict(key=key,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),size=target.stat().st_size,role=role))
    for doc in candidate['source_documents']:
        source=safe_key(workspace,doc['input_path'])
        if source.suffix.lower() not in {'.png','.jpg','.jpeg','.tif','.tiff','.pdf'}:
            raise ValueError('Unsupported source asset type')
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['input_sha256']:
            raise ValueError('Source image changed')
        copy_asset(source,'sources/'+doc['input_sha256']+source.suffix.lower(),'source_document')
    for folder in ('raw','crops'):
        for source in sorted((run/folder).iterdir()):
            if source.is_file():
                copy_asset(source,'artifacts/'+folder+'/'+source.name,folder)
    for name in ('candidate-pool.json','ocr-tables.json','provenance.json','measurements.json','sample-candidates.json'):
        if (run/name).exists():
            copy_asset(run/name,'artifacts/'+name,'source_run')
    for source in sorted((run/'specimen-retries').rglob('*')):
        if source.is_file():
            copy_asset(source,'artifacts/'+source.relative_to(run).as_posix(),'specimen_retry_run')
    source_run=dict(parser_version=candidate['dictionary_version'],candidate_sha256=digest(candidate))
    if (run/'provenance.json').exists():
        source_run['provenance']=read(run/'provenance.json')
    package=convert_candidate(candidate,dictionary,assets=assets,source_run=source_run,**options)
    (output/'package.json').write_text(json.dumps(package,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'dictionary.json').write_text(json.dumps(dictionary,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    verify_bundle(output,dictionary)
    return package
