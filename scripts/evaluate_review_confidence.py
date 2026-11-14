"""Evaluate a frozen policy on local human-labelled held-out audit data."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from registry_review.calibration import evaluate


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dataset',type=Path,required=True)
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--max-group-error',type=float,default=.01)
    p.add_argument('--alpha',type=float,default=.05)
    args=p.parse_args()
    if args.output.exists():raise FileExistsError('Use a fresh report path')
    dataset=json.loads(args.dataset.read_text(encoding='utf-8-sig'))
    report=evaluate(dataset,max_group_error=args.max_group_error,alpha=args.alpha)
    report['dataset_sha256']=hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({k:report[k] for k in ('status','threshold','calibration','validation')},ensure_ascii=False))


if __name__=='__main__':main()
