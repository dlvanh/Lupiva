"""Strict sample-form extraction. No clinical field inference or date repair."""
import hashlib
import re
from datetime import datetime

from ocr_pool.metadata import fold,normalize_value
from ocr_pool.tables import TableError,parse_tables
from registry_pool.dictionary import digest

HEADERS=['sample type','time of collection','amount collected','cell conc. (cell/ml)',
         'cell loaded on chip','note']


def collection_time(raw,date_order):
    value=raw.strip()
    result=dict(date_raw=None,date=None,time_raw=None,time=None)
    flags=[]
    if not value:
        return result,['collection_datetime_not_reported_in_ocr']
    clock=re.match(r'^(\d{1,2}:\d{2})(?:\s+|$)',value)
    if clock:
        result['time_raw']=clock[1]
        try:
            result['time']=datetime.strptime(clock[1],'%H:%M').strftime('%H:%M')
        except ValueError:
            flags.append('invalid_collection_time')
        value=value[clock.end():].strip()
    if value:
        result['date_raw']=value
        result['date'],date_flags=normalize_value('sample_date',value,'Time of collection',dict(date_order=date_order))
        flags.extend(date_flags)
    else:
        flags.append('collection_date_not_reported_in_ocr')
    return result,flags


def amount(raw):
    value=raw.strip()
    result=dict(raw=raw,numeric_value=None,unit_raw=None,mapping_method=None)
    explicit_unit=re.search(r'\b(mL|samples?)$',value,re.I)
    if explicit_unit:
        result['unit_raw']=explicit_unit[1]
    # Two or more dots are printed fill-in leaders, retained in raw. A single
    # dot around digits can be a decimal and is never stripped as punctuation.
    match=re.fullmatch(r'(\d+(?:[.,]\d+)?)(\.{2,})?\s*(mL|samples?)',value,re.I)
    if not match:
        return result,['amount_not_reported_in_ocr' if not value else 'unparsed_collection_amount']
    number,leader,unit=match.groups()
    if ',' in number or (unit.lower().startswith('sample') and not number.isdigit()):
        return result,['ambiguous_collection_amount']
    from decimal import Decimal
    result.update(numeric_value=format(Decimal(number),'f'),unit_raw=unit,
                  mapping_method='printed_dot_leader_after_number' if leader else 'explicit_number_and_unit')
    return result,[]


def extract_sample_collections(documents,*,date_order=None):
    records,evidence,issues=[],[],[]
    for doc in documents:
        if not re.fullmatch(r'[a-f0-9]{64}',doc.get('input_sha256','')):
            raise ValueError('Source image hash required for form extraction')
        for payload in doc.get('tables',[]):
            raw=payload['raw']
            if not isinstance(raw,str) or 'sample type' not in fold(raw):
                continue
            tid=payload['table_id']
            if payload.get('truncated') or payload.get('generation_status','ok')!='ok':
                issues.append(dict(document_id=doc['document_id'],table_id=tid,reason='incomplete_form_generation'))
                continue
            try:
                tables=parse_tables(raw,payload.get('format','auto'))
            except TableError as error:
                issues.append(dict(document_id=doc['document_id'],table_id=tid,reason='invalid_form_structure',detail=str(error)))
                continue
            if len(tables)!=1:
                issues.append(dict(document_id=doc['document_id'],table_id=tid,reason='ambiguous_form_table'))
                continue
            rows=tables[0].rows
            starts=[i for i,row in enumerate(rows) if [fold(c.strip()) for c in row]==HEADERS]
            if len(starts)!=1:
                issues.append(dict(document_id=doc['document_id'],table_id=tid,reason='unrecognized_sample_form_headers'))
                continue
            raw_rows=raw.split('<nl>') if '<fcel>' in raw else None
            raw_hash=hashlib.sha256(raw.encode()).hexdigest()
            for index,row in enumerate(rows[starts[0]+1:],starts[0]+1):
                if raw_rows is not None:
                    origin=re.match(r'\s*<(fcel|ucel|lcel|ecel)>',raw_rows[index])
                    if origin and origin[1]=='ucel':
                        continue  # explicit source row span, not another sample
                label=row[0].strip()
                if not label:
                    continue
                marker=re.match(r'([☑☒☐□])\s*(.*)',label)
                text=marker[2] if marker else label
                name=fold(text)
                sample_type='blood' if name=='blood' else 'stool' if name=='stool' else 'other' if name.startswith('others, specify:') else None
                if sample_type is None:
                    issues.append(dict(document_id=doc['document_id'],table_id=tid,row_index_0based=index,
                        reason='unmapped_sample_type',row_raw=row))
                    continue
                state=('checked' if marker[1] in {'☑','☒'} else 'unchecked') if marker else 'unreadable'
                flags=[] if marker else ['checkbox_marker_missing_in_ocr']
                if sample_type=='other':
                    # This full-width row contains printed examples, no values
                    # in the repeated cells produced by OTSL colspan expansion.
                    timing=dict(date_raw=None,date=None,time_raw=None,time=None)
                    collected=dict(raw=None,numeric_value=None,unit_raw=None,mapping_method=None)
                    other_cells=None
                else:
                    timing,time_flags=collection_time(row[1],date_order)
                    collected,amount_flags=amount(row[2])
                    flags.extend(time_flags+amount_flags)
                    other_cells=dict(cell_concentration_raw=row[3] or None,
                                     cell_loaded_on_chip_raw=row[4] or None,note_raw=row[5] or None)
                ev=dict(document_id=doc['document_id'],input_sha256=doc['input_sha256'],table_id=tid,
                    table_sha256=raw_hash,row_index_0based=index,row_raw=row,region=payload.get('region'),
                    mapping_method='explicit_sample_form_columns_and_ocr_marker')
                eid='formev-'+digest(ev)
                evidence.append(dict(evidence_id=eid,**ev))
                record=dict(document_id=doc['document_id'],source_document_sha256=doc['input_sha256'],
                    sample_type=sample_type,sample_type_raw=text,checkbox_raw=marker[1] if marker else None,
                    checkbox_state=state,collection_datetime=timing,amount=collected,other_source_cells=other_cells,
                    source_scope='document_sample_collection_metadata',clinical_field_id=None,
                    flags=flags,review_status='pending',eligible_for_verified_pool=False,
                    evidence_ids=[eid])
                record['sample_candidate_id']='sample-'+digest(record)
                records.append(record)
    return dict(schema_version='sample-collection-candidates-0.1',identity_status='unconfirmed',case_id=None,
        candidates=records,evidence=evidence,issues=issues,
        note='Operational source-form candidates; not clinical No/Yes and not a confirmed specimen identity. No cross-row date/time propagation.')
