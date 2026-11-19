"""Local dictionary, exchange bundle and transactional registry commands."""
import argparse
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from registry_pool.dictionary import build_dictionary,load_dictionary,digest
from registry_pool.exchange import read,build_bundle
from registry_pool.schema import package_schema
from registry_pool.store import Registry


def save(path,value):
    path=Path(path)
    if path.exists():
        raise FileExistsError('Choose a fresh output path: '+str(path))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def coverage(dictionary,candidate=None):
    rows=[]
    for field in dictionary['fields']:
        current=candidate['fields'].get(field['field_id'],{}) if candidate else {}
        rows.append(dict(field_id=field['field_id'],label=field['label'],section=field['section'],
            parser_implemented=any(c['parser_implemented'] for c in field['components']),
            components=[dict(component_id=c['component_id'],parser_implemented=c['parser_implemented'],
                            value_type=c['value_type']) for c in field['components']],
            extraction_status=current.get('extraction_status','not_processed'),
            observations=len(current.get('observation_ids',[])),
            choices_status=field['choices_status'],semantic_review_status=field['semantic_review_status']))
    return dict(dictionary_version=dictionary['dictionary_version'],dictionary_sha256=digest(dictionary),
        catalog_fields=len(rows),components=sum(len(r['components']) for r in rows),
        parser_supported_fields=sum(r['parser_implemented'] for r in rows),
        observed_fields=sum(bool(r['observations']) for r in rows),
        note='Coverage of implemented extraction and observed candidates; not patient completeness or clinical accuracy.',fields=rows)


def main():
    p=argparse.ArgumentParser(description=__doc__)
    sub=p.add_subparsers(dest='command',required=True)
    d=sub.add_parser('dictionary')
    d.add_argument('--output-dir',required=True,type=Path)
    d.add_argument('--candidate',type=Path)
    b=sub.add_parser('bundle')
    b.add_argument('--run',required=True,type=Path)
    b.add_argument('--output',required=True,type=Path)
    b.add_argument('--dictionary',type=Path)
    b.add_argument('--package-id')
    b.add_argument('--revision',type=int,default=1)
    b.add_argument('--supersedes-package')
    b.add_argument('--supersedes-revision',type=int)
    i=sub.add_parser('import')
    i.add_argument('--bundle',required=True,type=Path)
    i.add_argument('--db',required=True,type=Path)
    s=sub.add_parser('inspect')
    s.add_argument('--db',required=True,type=Path)
    s.add_argument('--package-id')
    s.add_argument('--revision',type=int)
    s.add_argument('--output',type=Path)
    a=p.parse_args()
    if a.command=='dictionary':
        dictionary=build_dictionary(read(ROOT/'schemas/crf-template-fields.json'))
        report=coverage(dictionary,read(a.candidate) if a.candidate else None)
        save(a.output_dir/'pool-dictionary.json',dictionary)
        save(a.output_dir/'pool-package.schema.json',package_schema())
        save(a.output_dir/'field-coverage.json',report)
        print(json.dumps({k:report[k] for k in ('catalog_fields','components','parser_supported_fields','observed_fields')}))
    elif a.command=='bundle':
        if bool(a.supersedes_package)!=bool(a.supersedes_revision):
            raise ValueError('Supply both supersedes package and revision')
        supersedes=dict(package_id=a.supersedes_package,revision=a.supersedes_revision) if a.supersedes_package else None
        package=build_bundle(a.run,a.output,load_dictionary(a.dictionary),ROOT,
            package_id=a.package_id,revision=a.revision,supersedes=supersedes)
        print(json.dumps(dict(package_id=package['package_id'],revision=package['revision'],
            fields=len(package['fields']),observations=len(package['observations']),assets=len(package['assets']))))
    else:
        if a.command=='inspect' and not a.db.is_file():
            raise FileNotFoundError('Registry database not found')
        a.db.parent.mkdir(parents=True,exist_ok=True)
        registry=Registry(a.db)
        try:
            if a.command=='import':
                result=registry.import_bundle(a.bundle,read(a.bundle/'dictionary.json'))
                print(json.dumps(dict(**result,integrity=registry.integrity())))
            else:
                result=registry.package(a.package_id,a.revision) if a.package_id else registry.integrity()
                if a.output:
                    save(a.output,result)
                else:
                    print(json.dumps(result,ensure_ascii=False))
        finally:
            registry.close()


if __name__=='__main__':
    main()
