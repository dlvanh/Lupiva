"""One bounded visual verification of flagged, uniquely labelled source rows."""
from collections import Counter
from copy import deepcopy
from .llm import extract_image
from .llm_extraction import normalize_extraction

REVIEW_FIELDS = {
    'numeric_value_conflicts_with_raw_result': {'numeric_value','comparator','raw_result','warning'},
    'comparator_conflicts_with_raw_result': {'numeric_value','comparator','raw_result','warning'},
    'grade_association_requires_review': {'grade_raw','grade_annotation','warning'},
    'class_without_printed_column': {'class_raw','class_header','qualitative_value','warning'},
    'source_header_conflicts_with_column': {'source_header','source_column','component','class_raw','class_header','qualitative_value','warning'},
    'component_conflicts_with_source_column': {'source_header','source_column','component','class_raw','class_header','qualitative_value','warning'},
}


def verify_extraction(body, record, dictionary, workspace, *, config=None, reviewer=None):
    """No reference answers. Leave duplicates/failed/uncertain checks pending.

    Primary raw response stays immutable. Merge only attributes implicated by
    a validation issue; a verification cannot change unrelated values or rows.
    """
    if record.get('verification',{}).get('attempted'):
        return deepcopy(record)
    out=deepcopy(record)
    image_size=record.get('request_contract',{}).get('image_size')
    result_rules=(config or {}).get('result_rules')
    # Compact transport rows are immutable evidence; verification uses the full
    # pre-normalization copy for both the initial and verification responses.
    source=record.get('expanded_extraction',record['raw_extraction'])
    normalized,audit,issues=normalize_extraction(source,dictionary,image_size=image_size,
                                                  result_rules=result_rules)
    out.update(extraction=normalized,normalization_audit=audit,validation_issues=issues)
    rows=normalized['rows'];counts=Counter(r['source_label'] for r in rows);targets={}
    for issue in issues:
        fields=REVIEW_FIELDS.get(issue['code']);index=issue['row_index']
        if fields and counts[rows[index]['source_label']]==1:
            targets.setdefault(index,set()).update(fields)
    if not targets:
        out['verification']=dict(attempted=False,reason='no_eligible_unique_flagged_rows')
        return out
    labels=[rows[i]['source_label'] for i in sorted(targets)]
    check=reviewer or extract_image
    try:
        reviewed=check(body,dictionary,workspace,config=config,review_labels=labels)
    except ValueError as error:
        out['verification']=dict(attempted=True,status='failed_retained_initial',error=str(error),labels=labels)
        return out
    returned=reviewed.get('expanded_extraction',reviewed['raw_extraction'])['rows']
    if Counter(r['source_label'] for r in returned)!=Counter(labels):
        out['verification']=dict(attempted=True,status='alignment_failed_retained_initial',labels=labels,response=reviewed)
        return out
    merged=deepcopy(source);changes=[]
    for index,allowed in targets.items():
        updated=next(r for r in returned if r['source_label']==rows[index]['source_label'])
        for key in sorted(allowed):
            if merged['rows'][index].get(key)!=updated.get(key):
                changes.append(dict(row_index=index,attribute=key,before=merged['rows'][index].get(key),after=updated.get(key)))
                merged['rows'][index][key]=updated.get(key)
    normalized,audit,issues=normalize_extraction(merged,dictionary,image_size=image_size,result_rules=result_rules)
    out.update(extraction=normalized,normalization_audit=audit,validation_issues=issues,verified_raw_extraction=merged,
               verification=dict(attempted=True,status='completed_pending_review',labels=labels,changes=changes,response=reviewed))
    return out
