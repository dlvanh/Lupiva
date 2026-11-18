"""Validation for source-form specimen candidates; never confirmed samples."""
from datetime import date,datetime
from decimal import Decimal
import re


def validate_specimen(data):
    if (data.get('review_status')!='pending' or data.get('eligible_for_verified_pool') is not False
            or data.get('clinical_field_id') is not None or data.get('source_scope')!='document_sample_collection_metadata'):
        raise ValueError('Specimen extraction cannot approve samples or infer clinical fields')
    if data.get('sample_type') not in {'blood','stool','other'}:
        raise ValueError('Unknown specimen source type')
    if data.get('checkbox_state') not in {'checked','unchecked','unreadable'}:
        raise ValueError('Unknown source checkbox state')
    marker=data.get('checkbox_raw')
    expected={'☑':'checked','☒':'checked','☐':'unchecked','□':'unchecked',None:'unreadable'}
    if marker not in expected or expected[marker]!=data['checkbox_state']:
        raise ValueError('Checkbox state differs from explicit raw marker')
    timing=data.get('collection_datetime')
    amount=data.get('amount')
    if not isinstance(timing,dict) or not isinstance(amount,dict):
        raise ValueError('Specimen date/time and amount structures are required')
    for key in ('date','date_raw','time','time_raw'):
        if key not in timing or (timing[key] is not None and not isinstance(timing[key],str)):
            raise ValueError('Specimen date/time attributes require explicit strings or null')
    if timing['date'] is not None:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',timing['date']) or not timing['date_raw']:
            raise ValueError('Specimen date requires ISO date and its source text')
        date.fromisoformat(timing['date'])
        try:
            normalized=datetime.strptime(timing['date_raw'],'%d/%m/%Y').date().isoformat()
        except ValueError as error:
            raise ValueError('Specimen date raw cannot support its normalized value') from error
        if normalized!=timing['date']:
            raise ValueError('Specimen date differs from its explicit source date')
    if timing['time'] is not None:
        if not re.fullmatch(r'\d{2}:\d{2}',timing['time']) or not timing['time_raw']:
            raise ValueError('Specimen time requires explicit source clock')
        datetime.strptime(timing['time'],'%H:%M')
        if datetime.strptime(timing['time_raw'],'%H:%M').strftime('%H:%M')!=timing['time']:
            raise ValueError('Specimen time differs from source clock')
    for key in ('raw','numeric_value','unit_raw','mapping_method'):
        if key not in amount or (amount[key] is not None and not isinstance(amount[key],str)):
            raise ValueError('Specimen amount attributes require explicit strings or null')
    number=amount['numeric_value']
    if number is not None:
        if not re.fullmatch(r'\d+(?:\.\d+)?',number) or not Decimal(number).is_finite():
            raise ValueError('Specimen amount requires a finite nonnegative decimal string')
        if not amount['raw'] or not amount['unit_raw'] or not amount['mapping_method']:
            raise ValueError('Specimen quantity needs raw text, unit and derivation')
        if amount['mapping_method'] not in {'explicit_number_and_unit','printed_dot_leader_after_number',
                                           'source_numeric_cell_and_same_parent_cell_unit'}:
            raise ValueError('Unknown specimen amount derivation')
        if amount['unit_raw'].lower() in {'sample','samples'} and not number.isdigit():
            raise ValueError('Sample counts cannot be decimal fractions')
        raw=amount['raw'].strip()
        if amount['mapping_method']=='source_numeric_cell_and_same_parent_cell_unit':
            if not re.fullmatch(r'\d+',raw) or Decimal(raw)!=Decimal(number):
                raise ValueError('Specimen numeric retry differs from its raw source cell')
        else:
            match=re.fullmatch(r'(\d+(?:\.\d+)?)(?:\.{2,})?\s*(mL|samples?)',raw,re.I)
            if not match or Decimal(match[1])!=Decimal(number) or match[2]!=amount['unit_raw']:
                raise ValueError('Specimen amount differs from explicit source number/unit')
    if not isinstance(data.get('flags'),list) or any(not isinstance(f,str) for f in data['flags']):
        raise ValueError('Specimen flags must be explicit strings')


def evidence_region_id(data):
    if data.get('evidence_kind') in {'metadata','sample_form_row','sample_form_cell'}:
        return data['table_id']
    return data['table_id'].rsplit('.',1)[0]


def evidence_crop_id(data):
    return (data.get('region') or {}).get('display_crop_id') or evidence_region_id(data)
