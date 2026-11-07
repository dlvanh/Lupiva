"""Record an explicitly authorized, revision-specific source approval locally.

Authorization is stored verbatim; a proxy recorder is not the human reviewer.
Bulk approval starts from pending source decisions. It never assigns a case.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.workflow import read,write
from registry_pool.dictionary import digest
from registry_pool.exchange import verify_bundle
from registry_review import ReviewStore
from registry_review.source import candidates


def record(database,bundle,authorization):
    package=verify_bundle(bundle,read(Path(bundle)/'dictionary.json'))
    pid,revision=package['package_id'],package['revision']
    if authorization.pop('scope',None)!='all_recorded_candidates_in_exact_revision':
        raise ValueError('Bulk review requires explicit scope of all candidates in one revision')
    if (authorization.pop('package_id',None),authorization.pop('revision',None))!=(pid,revision):
        raise ValueError('Authorization scope differs from bundle revision')
    if authorization.get('expected_package_sha256')!=digest(package):
        raise ValueError('Authorization package snapshot differs')
    store=ReviewStore(database)
    try:
        if digest(store.registry.package(pid,revision))!=digest(package):
            raise ValueError('Bundle differs from imported package')
        decisions=[dict(candidate_type=kind,candidate_id=cid,action='approve',expected_review_id=None,
                        expected_candidate_sha256=digest(item)) for (kind,cid),item in candidates(package).items()]
        result=store.record_source_batch(pid,revision,decisions=decisions,**authorization)
        return dict(result=result,integrity=store.registry.integrity()),store.source_reviewed_pool(pid,revision)
    finally:
        store.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',required=True,type=Path)
    parser.add_argument('--bundle',required=True,type=Path)
    parser.add_argument('--authorization',required=True,type=Path)
    parser.add_argument('--receipt',required=True,type=Path)
    parser.add_argument('--export',required=True,type=Path)
    parser.add_argument('--backup',type=Path)
    args=parser.parse_args()
    if not args.db.is_file():
        raise FileNotFoundError('Import the registry before source review')
    for path in (args.receipt,args.export,args.backup):
        if path and path.exists():
            raise FileExistsError('Choose fresh receipt/export/backup paths')
    if args.backup:
        args.backup.parent.mkdir(parents=True,exist_ok=True)
        source=sqlite3.connect(args.db.resolve().as_uri()+'?mode=ro',uri=True)
        target=sqlite3.connect(args.backup)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()
    receipt,pool=record(args.db,args.bundle,read(args.authorization))
    for path,value in ((args.receipt,receipt),(args.export,pool)):
        path.parent.mkdir(parents=True,exist_ok=True)
        write(path,value)
    print(json.dumps(dict(status=receipt['result']['status'],counts=receipt['result']['batch']['counts'],
        integrity=receipt['integrity'],case_identity_confirmed=False)))


if __name__=='__main__':
    main()
