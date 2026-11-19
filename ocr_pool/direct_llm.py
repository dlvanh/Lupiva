"""Additional API contract for the synthetic full-image prototype only."""
from .local_dates import _parse_date
from .metadata import ADM_FIELDS, normalize_value, select_fact


DATE_KEYS = ('sample_date', 'result_date', 'measurement_date')
HEADER_KEYS = (*ADM_FIELDS, 'ordering_provider', 'specimen_collector')
PROMPT = '''
SYNTHETIC FULL-IMAGE PROTOTYPE:
The input is the whole original synthetic document, including its header. In addition to
results, return header_facts for every explicitly labelled sample/collection date,
result/report date, measurement date, sex, age, height, weight, ordering provider
(Physician) and specimen collector (Nurse). Use the schema's key for the printed role;
do not substitute receipt/order/birth/print dates for sample or result dates. Copy the
actual label into label_raw and its literal value (including units) into value_raw.
Keep repeated facts, including disagreements. Return header_facts=[] when absent.
For this prototype, staff names in these two roles are requested header values; do not
extract patient names, IDs, addresses or unrelated identifiers. Do not infer missing
dates, units, demographics or staff roles. All values remain pending human review.
'''


def extend_schema(schema):
    schema['properties']['header_facts'] = dict(type='array', items=dict(
        type='object', properties=dict(
            key=dict(type='string', enum=[*DATE_KEYS, *HEADER_KEYS]),
            label_raw=dict(type='string'), value_raw=dict(type='string')),
        required=['key', 'label_raw', 'value_raw'], additionalProperties=False))
    schema['required'].append('header_facts')
    return schema


def header_facts(extraction):
    """Normalize literal API facts using the same checks as local header values."""
    facts = []
    for item in extraction.get('header_facts', []):
        key, raw, label = item['key'], item['value_raw'], item['label_raw']
        if key in DATE_KEYS:
            value, flags = _parse_date(key if key != 'result_date' else 'measurement_date', raw, label)
        elif key in ADM_FIELDS:
            value, flags = normalize_value(key, raw, label, {'decimal_separator': ','})
        elif key in HEADER_KEYS:
            value, flags = raw, []
        else:
            continue
        facts.append(dict(key=key, value=value, value_raw=raw, label_raw=label, flags=flags))
    for fact in facts:
        if len({f['value'] for f in facts if f['key'] == fact['key'] and f['value'] is not None}) > 1:
            fact['flags'].append('metadata_conflict')
    return facts


def source_date(facts, table_kind):
    preferred = 'measurement_date' if table_kind == 'pft' else 'sample_date'
    # An explicitly present invalid/conflicting date blocks fallback.
    key = preferred if any(f['key'] == preferred for f in facts) else 'result_date'
    return select_fact(facts, key)
