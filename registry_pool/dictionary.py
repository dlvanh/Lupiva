"""Versioned, source-linked field/component dictionary. No clinical inference."""
import hashlib
import json
import re
from pathlib import Path

from ocr_pool.rules import RULES
from ocr_pool.metadata import ADM_FIELDS

ROOT=Path(__file__).resolve().parents[1]
STATUSES=['found','not_processed','processing_failed','not_found','unreadable','conflict',
          'ambiguous_mapping','not_applicable','requires_clinical_assessment','not_computed']
VERSION='lupus-dictionary-1.0-draft'
VALUE_ATTRIBUTES={
    'numeric_value':'decimal_string','comparator':'comparison','qualitative_value':'string',
    'pattern_raw':'string','grade_raw':'string','symbolic_value':'string',
    'class_raw':'string','unit_raw':'string','reference_range_raw':'string',
    'source_date':'iso_datetime','date_type':'string','specimen':'string','panel':'string',
}


def choices_from_label(field):
    label=field['label']
    if field['field_id']=='ADM03':
        return [{'code':'female','label':'Female'},{'code':'male','label':'Male'}]
    if field['field_id']=='TRT02':
        return [{'code':v.lower(),'label':v} for v in ('Medication','Vaccine','Other')]
    return [{'code':v.lower(),'label':v} for v in ('Yes','No','Unknown')
            if re.search(r'\b'+v+r'\b',label,re.I)]


def build_dictionary(catalog):
    supported={r['field_id'] for r in RULES}|{v[0] for v in ADM_FIELDS.values()}
    fields=[]
    for entry in catalog['field_catalog']:
        fid,kind=entry['field_id'],entry['field_type']
        value_type=('recorded_assessment' if kind=='ASSESSMENT_RECORDED' else
                    'decimal' if kind=='NUM' else 'date' if kind=='DATE' else
                    'identifier' if kind=='ID' else 'lab_result' if kind.startswith('LAB') else
                    'finding' if kind.startswith('FINDING') else 'text')
        components=['result']
        if fid.startswith('PFT'):
            components=['pre_measured','pre_percent_predicted','post_measured','post_percent_predicted']
            value_type='decimal'
        elif fid in {f'HEM{i:02}' for i in range(6,11)}:
            components=['absolute_count','percentage']
            value_type='decimal'
        elif fid.startswith(('ANA','MYO')):
            # Some source layouts place intensity in a generic Result column;
            # preserve that component instead of relabelling existing evidence.
            components=['result','intensity']
            value_type='panel_result'
        if '+ TEXT' in kind or any(s in entry['label'].lower() for s in ('specify','which diseases')):
            components.append('detail')
        if fid=='IMM01':
            components.extend(['titre','method'])
        if fid=='TRT05':
            components.extend(['dose_unit','dose_basis'])
        if kind.startswith('REPORT'):
            components.extend(['conclusion','performed_date'])
        choices=choices_from_label(entry)
        fields.append(dict(field_id=fid,label=entry['label'],section=entry['section'],family=entry['family'],
            source_type=kind,source_context=entry['word_source_context'],source_columns=entry['catalog_columns'],
            semantic_review_status='draft_requires_domain_review',
            choices=choices,choices_status='source_label_only' if choices else 'not_specified_in_catalog_label',
            repeatable=True,source_repeated_slot=entry['preserve_repeated_slots'],
            repeat_note='Preserve each source occurrence; different dates/samples never overwrite.',
            extraction_policy='recorded_only_no_score_computation' if kind=='ASSESSMENT_RECORDED' else 'explicit_source_only',
            components=[dict(component_id=component,value_type=value_type if component not in
                 {'detail','titre','method','dose_unit','dose_basis','conclusion','performed_date'} else
                 'date' if component=='performed_date' else 'text',
                 parser_implemented=fid in supported and component not in
                 {'detail','titre','method','dose_unit','dose_basis','conclusion','performed_date'},
                 value_attributes=VALUE_ATTRIBUTES,
                 allowed_units=sorted({u for rule in RULES if rule['field_id']==fid for u in rule['units']}),
                 source_evidence_required=True) for component in components],allowed_statuses=STATUSES))
    return dict(dictionary_version=VERSION,authority='filtered_lupus_word_catalog',
        template_sha256=catalog['template_sha256'],catalog_entry_count=len(fields),
        semantic_status='draft_not_clinically_validated',
        note='Atomic attributes are named for export. Unspecified choices/definitions require domain review; no invented clinical options.',
        fields=fields)


def load_dictionary(path=None):
    path=Path(path) if path else ROOT/'schemas/pool-dictionary.json'
    return json.loads(path.read_text(encoding='utf-8'))


def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()
