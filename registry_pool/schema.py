"""JSON Schema used by the exchange plus strict validation of its used subset.

This is not a general-purpose JSON Schema engine. Unknown validation keywords
fail explicitly; semantic checks cover field coverage and reference integrity.
"""
import re
from datetime import date,datetime
from decimal import Decimal,InvalidOperation

from .dictionary import STATUSES,digest


def obj(properties,required=None,extra=False):
    return dict(type='object',properties=properties,required=list(properties) if required is None else required,
                additionalProperties=extra)


STRING={'type':'string'}
ID={'type':'string','minLength':1,'pattern':r'^[A-Za-z0-9_.:-]+$'}
HASH={'type':'string','pattern':r'^[a-f0-9]{64}$'}
NULL_STRING={'type':['string','null']}


def package_schema(version='lupus-pool-exchange-1.0'):
    if version not in {'lupus-pool-exchange-1.0','lupus-pool-exchange-1.1'}:
        raise ValueError('Unknown exchange schema version')
    links=dict(type='array',items=ID,uniqueItems=True)
    component=obj(dict(status={'enum':STATUSES},observation_ids=links,reason=NULL_STRING))
    field=obj(dict(status={'enum':STATUSES},observation_ids=links,reason=NULL_STRING,
                   components=dict(type='object',additionalProperties=component)))
    doc=obj(dict(document_id=ID,source_document_id=ID,input_sha256=HASH,source_key=STRING))
    ev=obj(dict(evidence_id=ID,document_id=ID,source_evidence_id=ID,source_data=dict(type='object',additionalProperties=True)))
    obs=obj(dict(observation_id=ID,document_id=ID,source_observation_id=ID,field_id=ID,component=ID,
        evidence_ids=links,date_evidence_ids=links,metadata_candidate_id=NULL_STRING,
        source_data=dict(type='object',additionalProperties=True)))
    md=obj(dict(candidate_id=ID,document_id=ID,source_candidate_id=ID,key=ID,evidence_ids=links,
               source_data=dict(type='object',additionalProperties=True)))
    schema=obj(dict(schema_version={'enum':[version]},dictionary_version=ID,dictionary_sha256=HASH,
        package_id=ID,revision=dict(type='integer',minimum=1),supersedes={'type':['object','null'],
          'properties':{'package_id':ID,'revision':dict(type='integer',minimum=1)},
          'required':['package_id','revision'],'additionalProperties':False},
        created_at_utc=dict(type='string',format='date-time'),case_id={'type':'null'},
        identity_status={'enum':['unconfirmed']},source_run=dict(type='object',additionalProperties=True),
        documents=dict(type='array',items=doc,minItems=1),evidence=dict(type='array',items=ev),
        observations=dict(type='array',items=obs),metadata_candidates=dict(type='array',items=md),
        fields=dict(type='object',additionalProperties=field),source_issues=dict(type='array',items=dict(type='object',additionalProperties=True)),
        assets=dict(type='array',items=obj(dict(key=STRING,sha256=HASH,size=dict(type='integer',minimum=0),role=STRING)))))
    if version=='lupus-pool-exchange-1.1':
        schema['properties']['specimen_schema_version']={'enum':['sample-collection-candidates-0.1','sample-collection-candidates-0.2']}
        schema['properties']['specimen_candidates']=dict(type='array',items=obj(dict(sample_id=ID,document_id=ID,
            source_sample_candidate_id=ID,evidence_ids=links,source_data=dict(type='object',additionalProperties=True))))
        schema['required']+=['specimen_schema_version','specimen_candidates']
    return {'$schema':'https://json-schema.org/draft/2020-12/schema',
            '$id':'urn:lupus:pool-exchange:'+version.rsplit('-',1)[-1],**schema}


def validate_json(value,schema,path='$'):
    supported={'$schema','$id','title','description','type','enum','properties','required','additionalProperties',
               'items','minItems','uniqueItems','minimum','minLength','pattern','format'}
    unknown=set(schema)-supported
    if unknown:
        raise ValueError(f'Unsupported schema keywords: {sorted(unknown)}')
    types=schema.get('type')
    types=[types] if isinstance(types,str) else types
    actual='null' if value is None else 'boolean' if isinstance(value,bool) else 'integer' if isinstance(value,int) else 'number' if isinstance(value,float) else 'string' if isinstance(value,str) else 'array' if isinstance(value,list) else 'object' if isinstance(value,dict) else 'invalid'
    if types and actual not in types:
        raise ValueError(f'{path}: expected {types}, got {actual}')
    if 'enum' in schema and value not in schema['enum']:
        raise ValueError(f'{path}: value not in enum')
    if isinstance(value,dict):
        missing=set(schema.get('required',[]))-value.keys()
        if missing:
            raise ValueError(f'{path}: missing {sorted(missing)}')
        props=schema.get('properties',{})
        for key,item in value.items():
            rule=props.get(key,schema.get('additionalProperties',True))
            if rule is False:
                raise ValueError(f'{path}: unexpected property {key}')
            if isinstance(rule,dict):
                validate_json(item,rule,path+'.'+key)
    elif isinstance(value,list):
        if len(value)<schema.get('minItems',0):
            raise ValueError(f'{path}: too few items')
        if schema.get('uniqueItems') and len({digest(v) for v in value})!=len(value):
            raise ValueError(f'{path}: repeated item')
        for index,item in enumerate(value):
            validate_json(item,schema.get('items',{}),f'{path}[{index}]')
    elif isinstance(value,str):
        if len(value)<schema.get('minLength',0) or ('pattern' in schema and not re.search(schema['pattern'],value)):
            raise ValueError(f'{path}: invalid text')
        if schema.get('format')=='date-time':
            parsed=datetime.fromisoformat(value)
            if parsed.tzinfo is None:
                raise ValueError(f'{path}: package creation timestamp needs timezone')
        elif schema.get('format')=='date':
            date.fromisoformat(value)
        elif schema.get('format'):
            raise ValueError('Unsupported schema format')
    elif actual in ('integer','number') and value<schema.get('minimum',value):
        raise ValueError(f'{path}: below minimum')


def validate_package(package,dictionary):
    validate_json(package,package_schema(package.get('schema_version')))
    if package['dictionary_version']!=dictionary['dictionary_version'] or package['dictionary_sha256']!=digest(dictionary):
        raise ValueError('Dictionary version/hash mismatch')
    catalog={f['field_id']:f for f in dictionary['fields']}
    if set(package['fields'])!=set(catalog):
        raise ValueError('Every dictionary field must be accounted for exactly')
    def unique(items,key):
        mapped={item[key]:item for item in items}
        if len(mapped)!=len(items):
            raise ValueError('Repeated '+key)
        return mapped
    docs=unique(package['documents'],'document_id')
    evidence=unique(package['evidence'],'evidence_id')
    observations=unique(package['observations'],'observation_id')
    specimens=unique(package.get('specimen_candidates',[]),'sample_id')
    unique(package['metadata_candidates'],'candidate_id')
    for item in evidence.values():
        if item['document_id'] not in docs:
            raise ValueError('Evidence missing document')
        ev=item['source_data']
        if ev.get('input_sha256') and ev['input_sha256']!=docs[item['document_id']]['input_sha256']:
            raise ValueError('Evidence input hash mismatch')
        if ev.get('evidence_kind')=='sample_form_cell':
            parents=[p for p in evidence.values() if p['source_evidence_id']==ev.get('parent_evidence_id')]
            if len(parents)!=1 or parents[0]['document_id']!=item['document_id'] or parents[0]['source_data'].get('evidence_kind')!='sample_form_row':
                raise ValueError('Specimen retry evidence has no same-document parent row')
    from .specimens import validate_specimen
    for sample in specimens.values():
        did=sample['document_id']
        if did not in docs or not sample['evidence_ids'] or any(
                eid not in evidence or evidence[eid]['document_id']!=did or
                evidence[eid]['source_data'].get('evidence_kind') not in {'sample_form_row','sample_form_cell'} for eid in sample['evidence_ids']):
            raise ValueError('Specimen source evidence is missing or cross-document')
        if sample['source_data'].get('source_document_sha256')!=docs[did]['input_sha256']:
            raise ValueError('Specimen source image hash differs')
        validate_specimen(sample['source_data'])
    for item in package['observations']+package['metadata_candidates']:
        if item['document_id'] not in docs or not item['evidence_ids']:
            raise ValueError('Missing document/evidence')
        if any(eid not in evidence or evidence[eid]['document_id']!=item['document_id'] for eid in item['evidence_ids']):
            raise ValueError('Cross-document or missing evidence link')
        data=item['source_data']
        if data.get('review_status')!='pending' or data.get('eligible_for_verified_pool') is not False:
            raise ValueError('OCR exchange cannot approve data')
        if 'numeric_value' in data and data['numeric_value'] is not None:
            numeric=data['numeric_value']
            if not isinstance(numeric,str) or not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',numeric):
                raise ValueError('Numeric values must be explicit decimal strings')
            if not Decimal(numeric).is_finite():
                raise ValueError('Nonfinite numeric value')
        if data.get('source_date'):
            datetime.fromisoformat(data['source_date'])
        if 'field_id' in item:
            if item['field_id'] not in catalog:
                raise ValueError('Unknown field')
            components={c['component_id'] for c in catalog[item['field_id']]['components']}
            if item['component'] not in components:
                raise ValueError('Unknown field component')
            if item['field_id']!=data.get('field_id') or item['component']!=data.get('component'):
                raise ValueError('Observation source mapping differs')
            if not set(item['date_evidence_ids'])<=set(item['evidence_ids']):
                raise ValueError('Date evidence not linked')
            for eid in item['date_evidence_ids']:
                if evidence[eid]['source_data'].get('evidence_kind')!='metadata':
                    raise ValueError('Date evidence is not metadata')
    linked=[]
    for fid,field in package['fields'].items():
        expected_components={c['component_id'] for c in catalog[fid]['components']}
        if set(field['components'])!=expected_components:
            raise ValueError('Incomplete component accounting for '+fid)
        field_links=[]
        for cid,component in field['components'].items():
            for oid in component['observation_ids']:
                if oid not in observations or (observations[oid]['field_id'],observations[oid]['component'])!=(fid,cid):
                    raise ValueError('Broken component observation link')
                field_links.append(oid)
            if component['status']=='found' and not component['observation_ids']:
                raise ValueError('Found component without evidence-backed observation')
        if set(field_links)!=set(field['observation_ids']) or len(field_links)!=len(set(field_links)):
            raise ValueError('Field/component links disagree')
        linked.extend(field_links)
    if set(linked)!=set(observations) or len(linked)!=len(observations):
        raise ValueError('Unlinked or multiply linked observations')
