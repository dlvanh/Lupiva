"""Draft REDCap dictionary and imports with stable repeated measurement IDs."""
import csv
import json
import re

from .ledger import InstanceLedger

DD_COLUMNS=['Variable / Field Name','Form Name','Section Header','Field Type','Field Label',
    'Choices, Calculations, OR Slider Labels','Field Note','Text Validation Type OR Show Slider Number',
    'Text Validation Min','Text Validation Max','Identifier?','Branching Logic (Show field only if...)',
    'Required Field?','Custom Alignment','Question Number (surveys only)','Matrix Group Name',
    'Matrix Ranking?','Field Annotation']
FORMS={
    'registry_profile':['record_id','registry_code','case_id','study_id','is_synthetic'],
    'registry_visits':['visit_id','visit_label','visit_type','visit_date'],
    'pool_results':['observation_id','result_visit_id','field_id','component','result_type',
        'numeric_value','comparator','qualitative_value','text_value','symbolic_value','pattern_raw',
        'grade_raw','class_raw','titre_raw','source_flag_raw','unit_raw','reference_range_raw','source_date','date_type',
        'specimen','panel','method_raw','missing_reason','result_raw','result_document_id','result_package_id',
        'result_revision','result_review_status','result_review_ids','result_evidence_ids',
        'result_assignment_id','result_provenance_json'],
    'source_metadata':['metadata_id','metadata_visit_id','metadata_key','metadata_value','metadata_raw',
        'metadata_document_id','metadata_package_id','metadata_revision','metadata_review_status',
        'metadata_review_id','metadata_evidence_ids','metadata_assignment_id','metadata_payload_json'],
    'sample_collection':['sample_id','sample_visit_id','sample_type','sample_type_raw','sample_amount',
        'sample_unit','collection_date','collection_time','checkbox_state','sample_document_id',
        'sample_package_id','sample_revision','sample_review_status','sample_review_id','sample_evidence_ids',
        'sample_assignment_id','sample_payload_json'],
}
META=['redcap_repeat_instrument','redcap_repeat_instance']
REPEATING=[f for f in FORMS if f!='registry_profile']
ATTRIBUTES=['result_type','numeric_value','comparator','qualitative_value','text_value','symbolic_value',
    'pattern_raw','grade_raw','class_raw','titre_raw','source_flag_raw','unit_raw','reference_range_raw','source_date','date_type',
    'specimen','panel','method_raw','missing_reason','result_raw']


def compact(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)


def choice_label(text):return re.sub(r'\s+',' ',text).replace('|','/').strip()


def data_dictionary(dictionary):
    rows=[]
    for form,names in FORMS.items():
        for index,name in enumerate(names):
            row=dict.fromkeys(DD_COLUMNS,'')
            row.update({'Variable / Field Name':name,'Form Name':form,'Field Type':'notes' if name.endswith('_json') else 'text',
                'Field Label':name.replace('_',' ').capitalize(),
                'Section Header':({'registry_profile':'Registry identity / Mã hồ sơ',
                    'registry_visits':'Confirmed visits / Lần ghi nhận',
                    'pool_results':'Accepted measurements / Kết quả đã duyệt cho ca',
                    'source_metadata':'Source approved metadata / Thông tin đã đối chiếu nguồn',
                    'sample_collection':'Source approved sample records / Thông tin thu mẫu'}[form]) if index==0 else ''})
            if name=='record_id':row['Required Field?']='y';row['Field Note']='Explicit registry_code; not Study ID, PID or SID.'
            if name=='study_id':row['Field Note']='Explicit study ID only; leave blank if unavailable.'
            if name=='is_synthetic':row['Field Type']='yesno';row['Field Note']='1 = synthetic fixture; 0 = real registry source.'
            if name=='field_id':
                row['Field Type']='dropdown'
                row['Field Label']='Word CRF item / Mục trong mẫu Word'
                row['Choices, Calculations, OR Slider Labels']=' | '.join(f["field_id"]+', '+choice_label(f["field_id"]+' '+f['label']) for f in dictionary['fields'])
            if name=='component':
                row['Field Type']='dropdown'
                components=sorted({c['component_id'] for f in dictionary['fields'] for c in f['components']})
                row['Choices, Calculations, OR Slider Labels']=' | '.join(c+', '+c.replace('_',' ') for c in components)
                row['Field Note']='Allowed field/component pairs are in the mapping JSON; verify pairs before manual entry.'
            if name in ('numeric_value','source_date','metadata_value','metadata_raw','result_raw'):
                row['Field Note']='Preserve source string, precision and date granularity. Blank means absent, not zero/negative.'
            if name=='checkbox_state':row['Field Note']='Operational collection checkbox; never a clinical Yes/No.'
            if name in ('metadata_review_status','sample_review_status'):
                row['Field Note']='Source verification plus confirmed identity; does not assert clinical case acceptance.'
            if name.endswith('_visit_id'):row['Field Note']='Explicit visit_id link; blank if no encounter was confirmed.'
            rows.append(row)
    names=[r['Variable / Field Name'] for r in rows]
    if len(names)!=len(set(names)) or any(not re.fullmatch('[a-z][a-z0-9_]*',n) for n in names):
        raise ValueError('Invalid REDCap variable names')
    return rows


def write_csv(path,columns,rows):
    # Import CSV must preserve literals exactly, including leading + or =.
    # Open with REDCap or import all columns as text when previewing in Excel.
    with open(path,'x',encoding='utf-8-sig',newline='') as out:
        writer=csv.DictWriter(out,fieldnames=columns,extrasaction='raise')
        writer.writeheader();writer.writerows(rows)


def import_rows(snapshot,ledger,*,record_ids=None):
    cases={c['case_id']:c for c in snapshot['cases']}
    rows=[];active=set()
    for c in sorted(cases.values(),key=lambda c:c['registry_code']):
        rid=c['registry_code'];ledger.owner(rid,c['case_id'])
        rows.append(dict(record_id=rid,registry_code=rid,case_id=c['case_id'],study_id=c['study_id'],
            is_synthetic='1' if snapshot['synthetic'] else '0'))

    def append(form,item,key,values):
        rid=cases[item['case_id']]['registry_code']
        instance=ledger.allocate(rid,form,key)
        active.add((rid,form,key))
        rows.append(dict(record_id=rid,redcap_repeat_instrument=form,redcap_repeat_instance=instance,**values))

    for item in sorted(snapshot['encounters'],key=lambda x:x['encounter_id']):
        append('registry_visits',item,item['encounter_id'],dict(visit_id=item['encounter_id'],visit_label=item['label'],
            visit_type=item['event_type'],visit_date=item['event_date']))
    for item in sorted(snapshot['observations'],key=lambda x:x['observation_id']):
        values={k:item['value'].get(k) for k in ATTRIBUTES}
        values.update(observation_id=item['observation_id'],result_visit_id=item['encounter_id'],field_id=item['field_id'],
            component=item['component'],result_document_id=item['document_id'],result_package_id=item['package_id'],
            result_revision=item['revision'],result_review_status=item['review_status'],
            result_review_ids=compact(item['review_ids']),result_evidence_ids=compact(item['evidence_ids']),
            result_assignment_id=item['assignment_id'],result_provenance_json=compact(item))
        append('pool_results',item,item['observation_id'],values)
    for item in sorted(snapshot['metadata'],key=lambda x:x['candidate_id']):
        v=item['value']
        values=dict(metadata_id=item['candidate_id'],metadata_visit_id=item['encounter_id'],metadata_key=item['key'],
            metadata_value=v.get('value'),metadata_raw=v.get('value_raw'),metadata_document_id=item['document_id'],
            metadata_package_id=item['package_id'],metadata_revision=item['revision'],metadata_review_status='source_verified',
            metadata_review_id=item['source_review_id'],metadata_evidence_ids=compact(item['evidence_ids']),
            metadata_assignment_id=item['assignment_id'],metadata_payload_json=compact(item))
        append('source_metadata',item,item['candidate_id'],values)
    for item in sorted(snapshot['specimens'],key=lambda x:x['sample_id']):
        v=item['value'];amount=v.get('amount') or {};collected=v.get('collection_datetime') or {}
        values=dict(sample_id=item['sample_id'],sample_visit_id=item['encounter_id'],sample_type=v.get('sample_type'),
            sample_type_raw=v.get('sample_type_raw'),sample_amount=amount.get('numeric_value'),sample_unit=amount.get('unit_raw'),
            collection_date=collected.get('date'),collection_time=collected.get('time'),checkbox_state=v.get('checkbox_state'),
            sample_document_id=item['document_id'],sample_package_id=item['package_id'],sample_revision=item['revision'],
            sample_review_status='source_verified',sample_review_id=item['source_review_id'],
            sample_evidence_ids=compact(item['evidence_ids']),sample_assignment_id=item['assignment_id'],sample_payload_json=compact(item))
        append('sample_collection',item,item['sample_id'],values)
    return rows,ledger.absent(active,record_ids)


def export_data(snapshot,path,ledger_path,namespace,*,record_ids=None):
    if snapshot['readiness']!='ready_for_draft_export':
        raise ValueError('No confirmed registry cases; source approvals alone cannot create patient exports')
    ledger=InstanceLedger(ledger_path,namespace)
    try:
        ledger.db.execute('BEGIN IMMEDIATE')
        rows,reconcile=import_rows(snapshot,ledger,record_ids=record_ids)
        columns=['record_id',*META]+[n for names in FORMS.values() for n in names if n!='record_id']
        write_csv(path,columns,rows)
        ledger.db.commit()
        return dict(rows=len(rows),records=len(snapshot['cases']),observations=len(snapshot['observations']),
            metadata=len(snapshot['metadata']),specimens=len(snapshot['specimens']),
            project_namespace=namespace,reconciliation_required=reconcile)
    finally:ledger.close()
