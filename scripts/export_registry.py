"""Local SQL -> draft REDCap/Word exports. Never uploads or approves records."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from registry_pool.dictionary import load_dictionary
from registry_export.mapping import build_mapping,validate_mapping
from registry_export.view import snapshot
from registry_export.redcap import data_dictionary,DD_COLUMNS,write_csv,export_data,REPEATING


def save(path,data):
    with path.open('x',encoding='utf-8') as out:json.dump(data,out,ensure_ascii=False,indent=2,allow_nan=False);out.write('\n')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dictionary',type=Path,default=Path('schemas/pool-dictionary.json'))
    commands=parser.add_subparsers(dest='command',required=True)
    schema=commands.add_parser('schema');schema.add_argument('--template',required=True,type=Path);schema.add_argument('--out',required=True,type=Path)
    for name in ('data','word','check'):
        p=commands.add_parser(name);p.add_argument('--db',required=True,type=Path);p.add_argument('--out',required=True,type=Path)
        p.add_argument('--synthetic',action='store_true',help='Explicit label for a wholly synthetic source fixture only')
        if name=='data':
            p.add_argument('--ledger',required=True,type=Path);p.add_argument('--project',required=True)
        if name=='word':
            p.add_argument('--template',required=True,type=Path);p.add_argument('--mapping',required=True,type=Path)
            p.add_argument('--record',required=True)
            scope=p.add_mutually_exclusive_group(required=True)
            scope.add_argument('--visit');scope.add_argument('--patient',action='store_true',help='All accepted patient results; do not infer visits')
    args=parser.parse_args()
    dictionary=load_dictionary(args.dictionary)
    # Every run uses a new directory; source files are never overwritten.
    args.out.mkdir(parents=True,exist_ok=False)
    if args.command=='schema':
        mapping=build_mapping(dictionary,args.template);validate_mapping(mapping,dictionary)
        save(args.out/'word-redcap-mapping.json',mapping)
        rows=data_dictionary(dictionary);write_csv(args.out/'redcap-data-dictionary.csv',DD_COLUMNS,rows)
        flat=[dict(field_id=f['field_id'],label=f['label'],section=f['section'],component=c['component_id'],
            value_type=c['value_type'],parser_implemented=c['parser_implemented'],redcap_form='pool_results',
            redcap_field_id=f['field_id'],redcap_component=c['component_id'],word_status=m['word']['status'],
            word_anchor=(m['word']['binding'] or {}).get('anchor',''),semantic_status=f['semantic_review_status'])
            for f,m in zip(dictionary['fields'],mapping['fields']) for c in f['components']]
        write_csv(args.out/'component-mapping.csv',list(flat[0]),flat)
        report=dict(status='draft_not_imported_into_REDCap',fields=len(mapping['fields']),components=len(flat),
            redcap_variables=len(rows),word_bound_fields=sum(f['word']['binding'] is not None for f in mapping['fields']),
            word_unresolved_fields=sum(f['word']['binding'] is None for f in mapping['fields']),
            project_type='nonlongitudinal',manual_setup=dict(repeating_instruments=REPEATING),
            automatic_upload=False)
        save(args.out/'project-setup.json',report)
    else:
        if args.command=='data' and args.db.resolve()==args.ledger.resolve():raise ValueError('Ledger must differ from source database')
        data=snapshot(args.db,dictionary,synthetic=args.synthetic)
        save(args.out/'pool-snapshot.json',data)
        report=dict(readiness=data['readiness'],synthetic=data['synthetic'],counts={k:len(data[k]) for k in
            ('cases','encounters','observations','metadata','specimens','excluded')},snapshot_sha256=data['snapshot_sha256'])
        if args.command=='data':report.update(export_data(data,args.out/'redcap-import.csv',args.ledger,args.project))
        if args.command=='word':
            from registry_export.word import export_word
            mapping=json.loads(args.mapping.read_text(encoding='utf-8-sig'))
            report.update(export_word(data,args.template,mapping,dictionary,args.out/'filled-crf.docx',registry_code=args.record,
                encounter_id=args.visit,patient_summary=args.patient))
        save(args.out/'export-report.json',report)
    print(json.dumps(report,ensure_ascii=False,indent=2))


if __name__=='__main__':main()
