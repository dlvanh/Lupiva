"""Additional API contract for the synthetic full-image prototype only."""
from .llm_extraction import valid_row_box
from .local_dates import _parse_date
from .metadata import ADM_FIELDS, normalize_value, select_fact


DATE_KEYS = ('sample_date', 'result_date', 'measurement_date')
HEADER_KEYS = (*ADM_FIELDS, 'ordering_provider', 'specimen_collector')
PII_KINDS = ('patient_name', 'patient_id', 'birth_date', 'address', 'phone', 'barcode', 'patient_signature')
PROMPT = '''
SYNTHETIC FULL-IMAGE PROTOTYPE:
The input is the whole original synthetic document, including its header. In addition to
results, return header_facts for every explicitly labelled sample/collection date,
result/report date, measurement date, sex, age, height, weight, ordering provider
(Physician) and specimen collector (Nurse). Use the schema's key for the printed role;
do not substitute receipt/order/birth/print dates for sample or result dates. Copy the
actual label into label_raw and its literal value (including units) into value_raw.
For each header fact return a tight box that covers both the label and the value,
or null if you cannot locate them reliably.
Keep repeated facts, including disagreements. Return header_facts=[] when absent.
Return pii_boxes for every occurrence of a patient name, patient ID (including record
and insurance numbers), birth date, address, phone, barcode or QR code, and patient
signature anywhere on the image. Return only the kind and box, never the text of the
identifier. Use patient_id for record and insurance numbers and barcode for QR codes.
Return pii_boxes=[] if none are visible. Both types of boxes are [left, top, right,
bottom] in integer coordinates from 0 to 1000 on the exact input image, with the
origin at the top left.
Keep Physician, Nurse, and requested sample/result/measurement date values as header
facts. Do not mark those requested values as patient identifiers. Do not infer missing
dates, units, demographics or staff roles. All values remain pending human review.
'''


def extend_schema(schema):
    box = dict(type='array', items=dict(type='integer', minimum=0, maximum=1000), minItems=4, maxItems=4)
    schema['properties']['header_facts'] = dict(type='array', items=dict(
        type='object', properties=dict(
            key=dict(type='string', enum=[*DATE_KEYS, *HEADER_KEYS]),
            label_raw=dict(type='string'), value_raw=dict(type='string'), box=dict(box, type=['array', 'null'])),
        required=['key', 'label_raw', 'value_raw', 'box'], additionalProperties=False))
    schema['properties']['pii_boxes'] = dict(type='array', items=dict(
        type='object', properties=dict(kind=dict(type='string', enum=list(PII_KINDS)), box=box),
        required=['kind', 'box'], additionalProperties=False))
    schema['required'].extend(['header_facts', 'pii_boxes'])
    return schema


def padded_pixel_box(box, image_size, padding):
    """Return clamped Pillow bounds, with padding in thousandths of each image dimension."""
    left, top, right, bottom = box
    width, height = image_size
    return (max(0, left - padding) * width // 1000,
            max(0, top - padding) * height // 1000,
            (min(1000, right + padding) * width + 999) // 1000,
            (min(1000, bottom + padding) * height + 999) // 1000)


def masked_display_page(image, pii_boxes):
    """Ignore invalid geometry and prepare the page used by all direct-LLM evidence."""
    page = image.convert('RGB')
    masks = [padded_pixel_box(item['box'], page.size, 15) for item in pii_boxes if valid_row_box(item.get('box'))]
    for bounds in masks:
        page.paste('black', bounds)
    if not masks:
        page.paste('black', (0, 0, page.width, (page.height + 3) // 4))
    return page, masks


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
        facts.append(dict(key=key, value=value, value_raw=raw, label_raw=label, flags=flags, box=item.get('box')))
    for fact in facts:
        if len({f['value'] for f in facts if f['key'] == fact['key'] and f['value'] is not None}) > 1:
            fact['flags'].append('metadata_conflict')
    return facts


def source_date(facts, table_kind):
    preferred = 'measurement_date' if table_kind == 'pft' else 'sample_date'
    # An explicitly present invalid/conflicting date blocks fallback.
    key = preferred if any(f['key'] == preferred for f in facts) else 'result_date'
    return select_fact(facts, key)
