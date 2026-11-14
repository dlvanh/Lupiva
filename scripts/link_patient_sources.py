"""Record explicit conversation-user patient linkage using already approved sources."""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from registry_pool.exchange import read,verify_bundle
from registry_review.patient import record_patient


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,required=True)
    parser.add_argument('--bundle',type=Path,required=True)
    parser.add_argument('--authorization',type=Path,required=True)
    parser.add_argument('--receipt',type=Path,required=True)
    parser.add_argument('--backup',type=Path,required=True)
    args=parser.parse_args()
    if not args.db.is_file():raise FileNotFoundError('Existing registry database required')
    if args.receipt.exists() or args.backup.exists():raise FileExistsError('Use fresh backup and receipt paths')
    package=verify_bundle(args.bundle,read(args.bundle/'dictionary.json'))
    authorization=read(args.authorization)
    if authorization.pop('scope',None)!='one_patient_existing_source_approvals_no_inferred_visits':
        raise ValueError('Explicit patient and source-approval scope required')
    args.backup.parent.mkdir(parents=True,exist_ok=True)
    source=sqlite3.connect(args.db.resolve().as_uri()+'?mode=ro',uri=True)
    backup=sqlite3.connect(args.backup)
    try:source.backup(backup)
    finally:backup.close();source.close()
    receipt=record_patient(args.db,package,**authorization)
    args.receipt.parent.mkdir(parents=True,exist_ok=True)
    with args.receipt.open('x',encoding='utf-8') as out:json.dump(receipt,out,ensure_ascii=False,indent=2)
    print(json.dumps(dict(status=receipt['status'],registry_code=receipt['case']['registry_code'],
        documents=receipt['document_count'],observations=receipt['accepted_observations'],
        encounters_created=receipt['encounters_created'],clinical_assessment=receipt['clinical_assessment'])))


if __name__=='__main__':main()
