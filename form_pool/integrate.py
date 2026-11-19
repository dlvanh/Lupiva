"""Add versioned pending specimen candidates to a fresh clinical pool run."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil

from ocr_pool.pipeline import validate_package as validate_candidate
from .sample_collection import extract_sample_collections
from .retry import apply_cell_retries


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def integrate(run,output,retry_runs=()):
    run,output=Path(run),Path(output)
    if output.exists():
        raise FileExistsError('Choose a fresh integrated pool directory')
    pool,envelope=read(run/'candidate-pool.json'),read(run/'ocr-tables.json')
    if 'specimen_candidates' in pool:
        raise ValueError('Integrate from a clinical parent, not an already extended pool')
    forms=extract_sample_collections(envelope['documents'],date_order='DMY')
    retries=[]
    for retry in retry_runs:
        retries.extend(read(Path(retry)/'ocr-tables.json')['documents'])
    if retries:
        forms=apply_cell_retries(forms,retries,date_order='DMY')
    integrated=copy.deepcopy(pool)
    integrated['schema_version']='lupus-candidate-pool-0.3'
    integrated['specimen_schema_version']=forms['schema_version']
    integrated['specimen_candidates']=forms['candidates']
    for ev in forms['evidence']:
        item=copy.deepcopy(ev)
        item.setdefault('evidence_kind','sample_form_row')
        item.setdefault('row_index_0based',-1)
        item.setdefault('result_column_0based',None)
        integrated['evidence'].append(item)
    integrated['issues'].extend(forms['issues'])
    integrated['summary']['specimen_candidates']=len(forms['candidates'])
    integrated['summary']['verified_specimens']=0
    integrated['processing_scope']+='; document_sample_collection_metadata'
    validate_candidate(integrated,set(integrated['fields']))
    docmap={d['document_id']:d for d in envelope['documents']}
    for retry in retries:
        parent=docmap.get(retry['document_id'])
        if not parent or parent['input_sha256']!=retry['input_sha256']:
            raise ValueError('Retry document is outside the original source set')
        parent.setdefault('text_regions',[]).extend(copy.deepcopy(retry.get('text_regions',[])))
    # Logical structures are validated before any new files are published.
    output.mkdir(parents=True)
    for folder in ('raw','crops'):
        shutil.copytree(run/folder,output/folder)
        for retry in retry_runs:
            for file in sorted((Path(retry)/folder).iterdir()):
                target=output/folder/file.name
                if target.exists():
                    raise ValueError('Retry artifact name collides with a parent artifact')
                shutil.copy2(file,target)
    def save(name,value):
        (output/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    save('candidate-pool.json',integrated)
    save('ocr-tables.json',envelope)
    save('sample-candidates.json',forms)
    provenance=read(run/'provenance.json') if (run/'provenance.json').exists() else {}
    provenance['specimen_extension']=dict(schema_version=integrated['specimen_schema_version'],
        source_run=run.as_posix(),parent_candidate_sha256=hashlib.sha256((run/'candidate-pool.json').read_bytes()).hexdigest(),
        retry_runs=[Path(r).as_posix() for r in retry_runs],reference_values_used=False,
        clinical_observations_unchanged=integrated['observations']==pool['observations'],
        metadata_unchanged=integrated['metadata_candidates']==pool['metadata_candidates'])
    # Preserve retry runtime/model metadata separately from clinical measurements.
    # It must not be mistaken for the timing of a full image-to-pool run.
    records=[]
    for index,retry in enumerate(retry_runs,1):
        retry=Path(retry)
        artifacts={}
        for name in ('run.json','measurements.json','ocr-tables.json'):
            source=retry/name
            if source.is_file():
                target=output/'specimen-retries'/str(index)/name
                target.parent.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source,target)
                artifacts[target.relative_to(output).as_posix()]=hashlib.sha256(source.read_bytes()).hexdigest()
        records.append(dict(source_run=retry.as_posix(),artifacts=artifacts))
    provenance['specimen_extension']['retry_artifacts']=records
    save('provenance.json',provenance)
    if (run/'measurements.json').exists():
        shutil.copy2(run/'measurements.json',output/'measurements.json')
    return integrated,forms


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--retry-run',action='append',default=[],type=Path)
    args=parser.parse_args()
    pool,_=integrate(args.run,args.output,args.retry_run)
    print(json.dumps(dict(observations=len(pool['observations']),specimen_candidates=len(pool['specimen_candidates']),human_verified=False)))


if __name__=='__main__':
    main()
