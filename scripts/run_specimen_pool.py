"""Extend a saved clinical pool locally without rerunning clinical OCR.

Inputs, source images, code, models and completed stages are hash-checked.
No reference answers or human approvals are accepted by this workflow.
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


def configuration(run,db):
    run=Path(run).resolve()
    envelope=read(run/'ocr-tables.json')
    if 'specimen_candidates' in read(run/'candidate-pool.json'):
        raise ValueError('Start from a clinical parent, not an already extended pool')
    # Freeze every parent artifact: the integration copies raw/crops and provenance.
    parent={p.relative_to(run).as_posix():sha(p) for p in sorted(run.rglob('*')) if p.is_file()}
    sources={d['input_path']:sha(ROOT/d['input_path']) for d in envelope['documents']}
    if any(sources[d['input_path']]!=d['input_sha256'] for d in envelope['documents']):
        raise ValueError('Parent source image hash mismatch')
    return dict(kind='saved-clinical-specimen-extension-1',parent_run=str(run),parent=parent,
        sources=sources,**fingerprints(ROOT),date_order='DMY',precision='float16',
        form_max_new_tokens=512,db=str(db.resolve()) if db else None)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--resume',action='store_true')
    parser.add_argument('--max-attempts',type=int,default=2,choices=[1,2,3])
    parser.add_argument('--db',type=Path,help='Optional separate local registry')
    args=parser.parse_args()
    root=args.output.resolve()
    parent=args.run.resolve()
    if root==parent or parent in root.parents:
        raise ValueError('Workflow output must be outside the frozen parent run')
    if root.exists() and not args.resume:
        raise FileExistsError('Choose a fresh workflow output or --resume')
    config=configuration(parent,args.db)
    root.mkdir(parents=True,exist_ok=True)
    with workflow_lock(root):
        flow=Workflow(root,config,resume=args.resume,max_attempts=args.max_attempts,cwd=ROOT)
        stages=RunnerStages(flow,ROOT)
        final=extend_specimens(stages,parent,start=1)
        bundle=stages.publish(final,start=6)
        if args.db:
            args.db.parent.mkdir(parents=True,exist_ok=True)
            registry=Registry(args.db)
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
