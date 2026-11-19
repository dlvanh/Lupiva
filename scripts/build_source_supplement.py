"""Build an additive pending bundle; never rewrites previously approved results."""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool import convert_documents
from registry_pool.dictionary import digest
from registry_pool.exchange import read, build_bundle, verify_bundle
from registry_pool.specimens import evidence_region_id


def build_supplement(base_bundle, retry_runs, output, *, transcriptions=None, region_ids=(),mapping_fields=(),workspace=ROOT,
                     package_id=None,revision=1,supersedes=None):
    base_bundle, output = Path(base_bundle), Path(output)
    dictionary = read(base_bundle/'dictionary.json')
    base = verify_bundle(base_bundle, dictionary)
    mapping_fields=set(mapping_fields)
    if mapping_fields-set(f['field_id'] for f in dictionary['fields']):
        raise ValueError('Mapping extension requires known CRF fields')
    if mapping_fields and (retry_runs or transcriptions or region_ids):
        raise ValueError('Mapping extension uses only verified cached OCR, without retries or transcriptions')
    documents = copy.deepcopy(read(base_bundle/'artifacts/ocr-tables.json')['documents'])
    for document in documents:
        for region in document.get('text_regions', []):
            region['supplemental_exclude'] = True
    by_id = {d['document_id']:d for d in documents}
    origins = {p.stem:(base_bundle/'artifacts') for p in (base_bundle/'artifacts/raw').glob('*.txt')}
    runs = []
    for run in map(Path, retry_runs):
        run_data = read(run/'ocr-tables.json')
        for d in run_data['documents']:
            original = by_id[d['document_id']]
            if original['input_sha256'] != d['input_sha256']:
                raise ValueError('Retry source hash differs')
            for region in d.get('text_regions', []):
                if region_ids and region['table_id'] not in region_ids: continue
                original.setdefault('text_regions', []).append(copy.deepcopy(region))
                origins[region['table_id']] = run
        runs.append(dict(path=run.as_posix(),ocr_sha256=hashlib.sha256((run/'ocr-tables.json').read_bytes()).hexdigest()))
    if transcriptions:
        # Explicit, separately labelled assistant transcription; original OCR is retained.
        for item in read(transcriptions)['transcriptions']:
            original = by_id[item['document_id']]
            if item['input_sha256'] != original['input_sha256']:
                raise ValueError('Transcription source hash differs')
            region = copy.deepcopy(item['region'])
            region['transcription_method'] = 'assistant_visual_transcription'
            original.setdefault('text_regions', []).append(region)
            origins[region['table_id']] = Path(item['artifact_root'])
    candidate = convert_documents(documents, read(ROOT/'schemas/crf-template-fields.json'))
    doc_ids = {d['document_id']:'doc-'+d['input_sha256'] for d in documents}
    if mapping_fields:
        # Only fill previously absent document/field/components. Existing OCR,
        # human corrections and rejected values cannot be replaced or revived.
        occupied={(o['document_id'],o['field_id'],o['component']) for o in base['observations']}
        candidate['observations']=[o for o in candidate['observations'] if
            o['field_id'] in mapping_fields and o['extraction_status']=='found' and
            (doc_ids[o['document_id']],o['field_id'],o['component']) not in occupied]
        candidate['metadata_candidates']=[]
        if not candidate['observations']:raise ValueError('No newly mapped components to add')
    else:
        candidate['observations'] = [o for o in candidate['observations'] if o.get('extraction_method')=='explicit_source_rules']
        candidate['metadata_candidates'] = [m for m in candidate['metadata_candidates'] if m.get('extraction_method')=='explicit_source_rules']
    # Avoid duplicates for metadata already included in the approved bundle.
    old = {(m['document_id'],m['key'],json.dumps(m['source_data'].get('value'),sort_keys=True,ensure_ascii=False)) for m in base['metadata_candidates']}
    candidate['metadata_candidates'] = [m for m in candidate['metadata_candidates'] if
        (doc_ids[m['document_id']],m['key'],json.dumps(m['value'],sort_keys=True,ensure_ascii=False)) not in old]
    needed = {eid for item in candidate['observations']+candidate['metadata_candidates'] for eid in item['evidence_ids']}
    candidate['evidence'] = [e for e in candidate['evidence'] if e['evidence_id'] in needed]
    if mapping_fields:
        needed_docs={o['document_id'] for o in candidate['observations']}
        candidate['source_documents']=[d for d in candidate['source_documents'] if d['document_id'] in needed_docs]
        documents=[d for d in documents if d['document_id'] in needed_docs]
    candidate['issues'] = [dict(reason='additive_pending_source_extension', base_package_id=base['package_id'],
        base_revision=base['revision'], prior_approvals_reused_without_change=True)]
    for fid, field in candidate['fields'].items():
        items = [o for o in candidate['observations'] if o['field_id']==fid]
        field.update(observation_ids=[o['observation_id'] for o in items],extraction_status='found' if items else 'not_processed',
            reason=None if items else 'outside_additive_extension_scope', review_status='pending' if items else 'not_reviewed')
    candidate['summary'] = dict(fields=len(candidate['fields']),observations=len(candidate['observations']),
        metadata_candidates=len(candidate['metadata_candidates']),evidence=len(candidate['evidence']),
        field_status_counts=dict(Counter(f['extraction_status'] for f in candidate['fields'].values())))
    candidate['processing_scope']='additive_source_extension_only'
    run = output.parent/(output.name+'-run')
    if run.exists() or output.exists(): raise FileExistsError('Use fresh output directories')
    run.mkdir(parents=True)
    for name in ('raw','crops'): (run/name).mkdir()
    for region in {evidence_region_id(e) for e in candidate['evidence']}:
        for folder, extension in (('raw','.txt'),('crops','.png')):
            shutil.copy2(origins[region]/folder/(region+extension),run/folder/(region+extension))
    for name, data in [('candidate-pool.json',candidate),('ocr-tables.json',{'documents':documents}),
                       ('provenance.json',dict(method='additive_cached_mapping_rules' if mapping_fields else 'additive_explicit_source_rules',
                         base_package_id=base['package_id'],base_revision=base['revision'],retries=runs,
                         base_package_sha256=digest(base),
                         transcriptions=str(transcriptions) if transcriptions else None,
                         selected_retry_region_ids=list(region_ids),reference_answers_used_by_ocr=False,
                         mapping_fields=sorted(mapping_fields),inference_rerun=False if mapping_fields else None,
                         supplemental_rules_version='explicit-source-extension-0.1',
                         source_code_sha256={str(p):hashlib.sha256((ROOT/p).read_bytes()).hexdigest()
                            for p in map(Path,('ocr_pool/rules.py','ocr_pool/pipeline.py','ocr_pool/supplemental.py','scripts/build_source_supplement.py'))},
                         automatic_approval=False))]:
        (run/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return build_bundle(run,output,dictionary,workspace,package_id=package_id,revision=revision,supersedes=supersedes)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base-bundle',required=True,type=Path)
    p.add_argument('--retry-run',action='append',default=[],type=Path)
    p.add_argument('--transcriptions',type=Path)
    p.add_argument('--region-id',action='append',default=[])
    p.add_argument('--mapping-field',action='append',default=[],help='Add only newly mapped components from cached OCR for this CRF field')
    p.add_argument('--package-id')
    p.add_argument('--revision',type=int,default=1)
    p.add_argument('--supersedes-revision',type=int)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    if a.supersedes_revision is not None and not a.package_id:p.error('--supersedes-revision requires --package-id')
    supersedes=dict(package_id=a.package_id,revision=a.supersedes_revision) if a.supersedes_revision is not None else None
    package=build_supplement(a.base_bundle,a.retry_run,a.output,transcriptions=a.transcriptions,region_ids=a.region_id,
        mapping_fields=a.mapping_field,package_id=a.package_id,revision=a.revision,supersedes=supersedes)
    print(json.dumps(dict(package_id=package['package_id'],observations=len(package['observations']),
                          metadata=len(package['metadata_candidates']),status='pending')))


if __name__=='__main__': main()
