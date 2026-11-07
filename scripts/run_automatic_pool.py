"""Whole-image offline OCR to a portable candidate pool, with bounded stages.

No development references are accepted. Optional evaluation is a separate step.
Resume verifies inputs, code, model hashes and completed output hashes.
"""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.workflow import Workflow,workflow_lock,sha,read,write
from ocr_pool.runner import RunnerStages,fingerprints
from form_pool.workflow import extend_specimens
from registry_pool.store import Registry


def configuration(manifest,db):
    source=read(manifest)
    if set(source)!={'documents'} or not source['documents']:
        raise ValueError('Source manifest requires only nonempty documents')
    if any(set(d)!={'document_id','input_path'} for d in source['documents']):
        raise ValueError('Source inputs accept IDs/paths only, never annotations or reference answers')
    if len({d['document_id'] for d in source['documents']})!=len(source['documents']):
        raise ValueError('Repeated source document ID')
    sources={d['input_path']:sha(ROOT/d['input_path']) for d in source['documents']}
    return dict(source_manifest_sha256=sha(manifest),sources=sources,**fingerprints(ROOT),
                date_order='DMY',precision='float16',max_new_tokens=2048,form_max_new_tokens=512,
                db=str(db.resolve()) if db else None)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--resume',action='store_true')
    p.add_argument('--max-attempts',type=int,default=2,choices=[1,2,3])
    p.add_argument('--db',type=Path,help='Optional persistent local candidate registry')
    a=p.parse_args()
    root=a.output.resolve()
    if root.exists() and not a.resume:
        raise FileExistsError('Choose a fresh workflow output or --resume')
    root.mkdir(parents=True,exist_ok=True)
    with workflow_lock(root):
        flow=Workflow(root,configuration(a.manifest,a.db),resume=a.resume,max_attempts=a.max_attempts,cwd=ROOT)
        stages=RunnerStages(flow,ROOT)
        stage=stages.script
        runs=[]
        def recognize(name,manifest):
            run=stages.recognize(name,manifest)
            if run:
                # File-level stages can exit successfully with per-region errors;
                # those remain explicit issues, never an unbounded rerun.
                runs.append(run)
            return run
        def assemble(name):
            args=['--layout',layout,'--date-order','DMY']
            for run in runs:
                args.extend(['--run',run])
            return stage(name,'assemble_automatic_pool.py',args)
        layout_dir=stage('01-layout','detect_layout.py',['--manifest',a.manifest])
        layout=layout_dir/'layout.json'
        regions=stage('02-regions','prepare_layout_regions.py',[layout],output='manifest.json')
        initial=recognize('03-initial-ocr',regions)
        if not initial:
            raise ValueError('No OCR regions; inspect preserved layout detections')
        grid_manifest=stage('04-grid-regions','refine_layout_regions.py',[layout,'--ocr-run',initial],output='manifest.json')
        grid=recognize('05-grid-ocr',grid_manifest)
        lab_manifest=stage('06-lab-retry-regions','prepare_layout_retry.py',
            ['--manifest',regions,'--ocr-run',initial],output='manifest.json')
        recognize('07-lab-retry-ocr',lab_manifest)
        if grid:
            retry=stage('08-grid-retry-regions','prepare_layout_retry.py',
                ['--manifest',grid_manifest,'--ocr-run',grid],output='manifest.json')
            recognize('09-grid-retry-ocr',retry)
        preliminary=assemble('10-assemble-grids')
        headers=stage('11-header-regions','prepare_layout_headers.py',
            ['--layout',layout,'--ocr-run',preliminary],output='manifest.json')
        recognize('12-header-ocr',headers)
        lines=stage('13-metadata-line-regions','prepare_layout_metadata_lines.py',
            ['--layout',layout,'--ocr-run',preliminary],output='manifest.json')
        recognize('14-metadata-line-ocr',lines)
        identifiers=stage('15-identifier-regions','prepare_layout_identifiers.py',['--layout',layout],output='manifest.json')
        recognize('16-identifier-ocr',identifiers)
        with_headers=assemble('17-assemble-metadata')
        rows_manifest=stage('18-row-regions','prepare_layout_rows.py',['--ocr-run',with_headers],output='manifest.json')
        rows=recognize('19-row-ocr',rows_manifest)
        if rows:
            details=stage('20-detail-regions','prepare_layout_row_details.py',['--ocr-run',rows],output='manifest.json')
            recognize('21-detail-ocr',details)
        clinical=assemble('22-final')
        final=extend_specimens(stages,clinical)
        bundle=stages.publish(final,start=28)
        if a.db:
            a.db.parent.mkdir(parents=True,exist_ok=True)
            registry=Registry(a.db)
            try:
                result=registry.import_bundle(bundle,read(bundle/'dictionary.json'))
                write(root/'registry-import.json',dict(result=result,integrity=registry.integrity()))
            finally:
                registry.close()
        flow.complete(final)
        print(json.dumps(dict(status='completed',final=str(final),bundle=str(bundle),
            clinical_verification=False,reference_values_used=False)))


if __name__=='__main__':
    main()
