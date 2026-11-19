"""Provisional form-attribute comparison, separate from inference and lab scores."""
import argparse
from collections import Counter
import json
from pathlib import Path

PATHS={'checkbox_state':('checkbox_state',),
       'collection_date':('collection_datetime','date'),
       'collection_time':('collection_datetime','time'),
       'amount_numeric':('amount','numeric_value'),
       'amount_unit_raw':('amount','unit_raw')}


def compare(pool,reference):
    if len(reference['sources'])!=1:
        raise ValueError('This draft evaluator requires one document per reference')
    did=reference['sources'][0]['document_id']
    source_hash=reference['sources'][0].get('sha256')
    if source_hash and any(c['source_document_sha256']!=source_hash for c in pool['candidates']
                           if c['document_id']==did):
        raise ValueError('Form reference and candidate source image hashes differ')
    expected=Counter((did,row['row_key'],key,row[key]) for row in reference['rows']
                     for key in PATHS if row.get(key) is not None)
    scope={row['row_key']:row for row in reference['rows']}
    predictions=Counter()
    extra_in_blank=[]
    out_of_scope=[]
    for row in pool['candidates']:
        if row['document_id']!=did or row['sample_type'] not in scope:
            out_of_scope.append(row['sample_candidate_id'])
            continue
        for key,path in PATHS.items():
            value=row
            for segment in path:
                value=value.get(segment) if isinstance(value,dict) else None
            if value is None or (key=='checkbox_state' and value=='unreadable'):
                continue
            item=(did,row['sample_type'],key,value)
            predictions[item]+=1
            if scope[row['sample_type']].get(key) is None:
                extra_in_blank.append(item)
    matched=expected&predictions
    return dict(assessment_label='trợ lý tự đánh giá, chưa được người phụ trách xác nhận',
        human_verified=False,holdout=False,reference_status=reference['reference_status'],
        reference_source_hash_checked=bool(source_hash),
        expected_attributes=sum(expected.values()),predicted_attributes=sum(predictions.values()),
        matched_attributes=sum(matched.values()),
        missing_attributes=list((expected-predictions).elements()),
        wrong_or_extra_attributes=list((predictions-expected).elements()),
        unexpected_values_in_blank_fields=extra_in_blank,out_of_scope_candidates=out_of_scope,
        note='Explicit attributes of identified sample rows only. Blank cells receive no true-negative credit. Separate from clinical catalog coverage and lab tuple accuracy.')


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('pool',type=Path)
    p.add_argument('reference',type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh evaluation path')
    report=compare(json.loads(a.pool.read_text(encoding='utf-8')),json.loads(a.reference.read_text(encoding='utf-8')))
    a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ('expected_attributes','predicted_attributes','matched_attributes')}))


if __name__=='__main__':
    main()
