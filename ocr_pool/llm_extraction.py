"""Provider-independent contracts and source-checked LLM output normalization.

No network calls, reference answers, patient-specific rules, or auto-approval.
"""
from collections import defaultdict
from copy import deepcopy
from decimal import Decimal, InvalidOperation
import re
import unicodedata

from .pipeline import result_value
from .metadata import fold
from .result_rules import match_result_literal

VERSION = 'llm-extraction-0.5'
COMPARATORS = ('=', '<', '>', '<=', '>=')
SOURCE_COLUMNS = ('result', 'pre_measured', 'post_measured', 'intensity',
                  'absolute_count', 'percentage', 'pre_percent_predicted', 'post_percent_predicted', 'unknown')
# table_kind stays in the core: local source dates are mapped to rows by it,
# so a model that omits it from `extra` would leave every row undated.
CORE_ROW_KEYS = ('field_id', 'source_label', 'raw_result', 'unit_raw', 'component',
                 'source_column', 'row_box', 'numeric_value', 'comparator', 'qualitative_value',
                 'table_kind')
EXTRA_ROW_KEYS = ('class_raw', 'pre_percent_predicted', 'pattern_raw', 'grade_raw',
                  'titre_raw', 'method_raw', 'source_flag_raw', 'warning',
                  'source_header', 'class_header', 'post_percent_predicted')

COMPACT_PROMPT_ADDENDUM = '''
COMPACT ROWS: Keep the required core fields and grade_annotation on each row. Put all other row fields described above in extra as {"key": "field_name", "value": "source value"} items, listing only non-null extra fields, once per key. Use extra=[] when none apply; omitted extra fields mean null.
'''

PROMPT_ADDENDUM = '''
OUTPUT CONTRACT AND SOURCE ASSOCIATION:
For each result row, return row_box as [left, top, right, bottom] in integer coordinates from 0 to 1000 relative to the exact input image, with origin at its top left. Enclose only the physical row containing the printed test label and its result cells. Include wrapped lines belonging to that row, and exclude adjacent rows, column headers and reference text on other rows. For different measurement occasions on the same physical row, use the same row box. Return null when you cannot locate the row reliably. The box will be used as a visual aid for source review.
Normalize horizontal positions by image width and vertical positions by image height. Before returning a box, check that its vertical center crosses the printed label and its result, especially at the bottom of tables. Use visible cell boundaries or the text baseline of that specific row.

Map short analyte names using the nearest visible section heading, specimen, method and units. The same label may denote different CRF fields in different sections. For example, leukocytes in a urinalysis section describe urine WBC, while leukocytes in a CBC describe peripheral blood WBC. Preserve the printed label and use the context to select the catalog field. If the context is ambiguous, leave field_id null.

Copy qualifying words and symbols in the printed source_label, including method and Hb qualifiers. If a diffusion result has both Hb-adjusted and unadjusted variants, map the Hb-adjusted CRF field only from a row explicitly labelled for Hb adjustment. Keep the other result outside that CRF field even when its numbers match.

For every row copy the visible primary result column heading into source_header, and copy class_header only when a separate Class column is printed. Use null if the heading is not visible; never manufacture a heading from the assay name. Identify source_column from that heading, independently of field_id or assay family. A panel printed under Result is component=result, with its printed categorical interpretation in qualitative_value; it has no class_raw unless a separate Class column exists. In respiratory tables component is pre_measured or post_measured for its measurement occasion, even outside the CRF. Keep that occasion's percent-predicted cell in pre_percent_predicted or post_percent_predicted on the SAME row, not as another row. raw_result is the primary result cell; the percent cell has its own property. A second measurement occasion may have its own row; never label Post as Pre.

Use only the schema's comparator codes, with no surrounding whitespace. Plain numeric values have '='. For a nonnumeric result comparator is null. Preserve inequalities printed with the patient's result; never copy the reference interval comparator.

Inspect printed AND handwritten semiquantitative grades separately from free-text clinical annotations. Include literal text, placement, association and writing_style (printed, handwritten, unclear) in grade_annotation. A result cell may wrap across lines: a printed grade on the next line in the same result cell belongs to that result when the cell boundaries and alignment support it, even if an unrelated note is nearby. If association is uncertain, retain grade_raw=null and warn. Never assign a grade from notes or another result. Do not turn grades into dilution titres or invent annotations.

Before returning, compare each numeric_value character by character with its own raw_result; if conflicting or ambiguous, retain the literal raw_result, set numeric_value=null and warn instead of guessing. Recheck all nonblank measured and percent-predicted cells in source order. Preserve literal class symbols, including letter/number distinctions, using the printed Class legend as a visual reference without deriving an unprinted interpretation. A bilingual expanded analyte name and its printed abbreviation may identify the same catalog entry; check the entire catalog before returning field_id=null. Do not use the numeric value to select an analyte or field. Printed dotted fill-in leaders are not decimal separators; retain uncertainty for ambiguous handwriting.
'''


def extraction_schema(base_schema, dictionary):
    """Constrain codes, preserve source column independently of CRF membership."""
    schema = deepcopy(base_schema)
    row = schema['properties']['rows']['items']
    props = row['properties']
    fields = dictionary['fields']
    components = {c['component_id'] for f in fields for c in f['components']}
    props['field_id'] = {'anyOf': [
        {'type': 'string', 'enum': [f['field_id'] for f in fields]}, {'type': 'null'}]}
    props['component']['enum'] = sorted(components | set(SOURCE_COLUMNS[:-1]))
    props['comparator'] = {'anyOf': [
        {'type': 'string', 'enum': list(COMPARATORS)}, {'type': 'null'}]}
    props['table_kind'] = {'type': 'string', 'enum': ['general_lab', 'pft', 'immunoblot', 'cbc', 'other']}
    props['source_column'] = {'type': 'string', 'enum': list(SOURCE_COLUMNS)}
    props['source_header'] = {'type': ['string', 'null']}
    props['class_header'] = {'type': ['string', 'null']}
    props['post_percent_predicted'] = {'type': ['string', 'null']}
    props['row_box'] = {'type': ['array', 'null'], 'items': {'type': 'integer'}}
    props['grade_annotation'] = {
        'type': ['object', 'null'],
        'properties': {
            'text': {'type': 'string'},
            'placement': {'type': 'string', 'enum': ['result_cell', 'margin', 'overlapping_note', 'unclear']},
            'association': {'type': 'string', 'enum': ['confirmed', 'ambiguous']},
            'writing_style': {'type': 'string', 'enum': ['printed', 'handwritten', 'unclear']},
        },
        'required': ['text', 'placement', 'association', 'writing_style'], 'additionalProperties': False,
    }
    row['required'] = list(props)
    return schema


def compact_extraction_schema(base_schema, dictionary):
    """Opt-in sparse rows, retaining the full contract's types and enums."""
    schema = extraction_schema(base_schema, dictionary)
    row = schema['properties']['rows']['items']
    full = row['properties']
    props = {key: full[key] for key in CORE_ROW_KEYS}
    # Keep this structured, nullable annotation separate so extra values stay
    # strings and its source-association object keeps its own strict contract.
    props['grade_annotation'] = full['grade_annotation']
    # Group equal value schemas; table_kind retains its original string enum.
    # Context stays on each row: no table grouping or inherited-header guesses.
    groups = []
    for key, value_schema in full.items():
        if key in props:
            continue
        for keys, existing in groups:
            if existing == value_schema:
                keys.append(key)
                break
        else:
            groups.append(([key], value_schema))
    variants = [dict(type='object', properties={
        'key': {'type': 'string', 'enum': keys}, 'value': value_schema},
        required=['key', 'value'], additionalProperties=False)
        for keys, value_schema in groups]
    props['extra'] = {'type': 'array', 'items': {'anyOf': variants}}
    row.update(properties=props, required=list(props), additionalProperties=False)
    return schema


def expand_compact_extraction(raw):
    """Return full rows without mutating the model's compact audit record.

    First occurrences win, including null. Unknown keys cannot enter the full
    row contract; warn and discard them, and warn on any later occurrence too.
    """
    expanded = deepcopy(raw)
    warnings = expanded.setdefault('warnings', [])
    rows = []
    for index, compact in enumerate(expanded['rows']):
        row = {key: compact.get(key) for key in (*CORE_ROW_KEYS, 'grade_annotation')}
        if 'table_index' in compact:
            row['table_index'] = compact['table_index']
        row.update(dict.fromkeys(EXTRA_ROW_KEYS))
        seen = set()
        for item in compact.get('extra', []):
            key = item['key']
            if key in seen:
                warnings.append(f'Compact row {index}: duplicate extra key {key!r}; kept first value')
                continue
            seen.add(key)
            if key not in EXTRA_ROW_KEYS:
                warnings.append(f'Compact row {index}: unknown extra key {key!r}; ignored')
                continue
            row[key] = item['value']
        rows.append(row)
    expanded['rows'] = rows
    return expanded


def valid_row_box(box):
    return (isinstance(box, list) and len(box) == 4
            and all(type(coordinate) is int for coordinate in box)
            and 0 <= box[0] < box[2] <= 1000
            and 0 <= box[1] < box[3] <= 1000)


_DIFFUSION_LABEL = re.compile(r'\b(?:kco|tlco|dlco)(?:\b|(?=hb\b))')
_HB_LABEL = re.compile(r'\bhb\b|\b(?:kco|tlco|dlco)\s*hb\b')
_UNADJUSTED_LABEL = re.compile(r'\b(?:uncorrected|unadjusted|without|no|khong|chua)\b')


def _same_number(a, b):
    try:
        return a is not None and b is not None and Decimal(str(a)) == Decimal(str(b))
    except (ValueError, InvalidOperation):
        return False


def header_role(text):
    """Only explicit column words; never infer an assay role from a test name."""
    folded = ''.join(c for c in unicodedata.normalize('NFD', text or '')
                     if unicodedata.category(c) != 'Mn').lower().replace('đ', 'd')
    token = re.sub(r'[^a-z0-9%]', '', folded)
    return {'result': 'result', 'results': 'result', 'ketqua': 'result',
            'intensity': 'intensity', 'cuongdo': 'intensity',
            'class': 'class', 'phanloai': 'class', 'lop': 'class',
            '%pre': 'pre_percent_predicted', '%post': 'post_percent_predicted',
            'premeas': 'pre_measured', 'premeasured': 'pre_measured',
            'postmeas': 'post_measured', 'postmeasured': 'post_measured'}.get(token)


def _pixel_row_boxes(rows, image_size):
    """Only convert when every supplied box indicates a page-wide pixel scale."""
    if not image_size:
        return {}
    width, height = image_size
    boxes = {index: row['row_box'] for index, row in enumerate(rows) if row.get('row_box') is not None}
    if len(boxes) < 3 or not all(
        isinstance(box, list) and len(box) == 4 and all(type(value) is int for value in box)
        and 0 <= box[0] < box[2] <= width and 0 <= box[1] < box[3] <= height
        and (box[2] > 1000 or box[3] > 1000) for box in boxes.values()
    ):
        return {}
    return {index: [round(1000 * value / scale) for value, scale in zip(box, (width, height, width, height))]
            for index, box in boxes.items()}


def normalize_extraction(extraction, dictionary, *, image_size=None, result_rules=None):
    """Keep original response externally; return normalized copy + audit/issues.

    Invalid signs can only be recovered by parsing that same row's raw result,
    never by assuming equality. Ambiguous annotations remain review candidates.
    """
    normalized = deepcopy(extraction)
    audit, issues = [], []
    fields = {f['field_id']: {c['component_id'] for c in f['components']}
              for f in dictionary['fields']}
    lab_results = {f['field_id'] for f in dictionary['fields'] for c in f['components']
                   if c['component_id'] == 'result' and c.get('value_type') == 'lab_result'}
    hb_fields = {}
    for definition in dictionary['fields']:
        label = fold(definition.get('label', ''))
        analytes = set(_DIFFUSION_LABEL.findall(label))
        if analytes and _HB_LABEL.search(label):
            hb_fields[definition['field_id']] = analytes
    locations = defaultdict(list)
    pixel_boxes = _pixel_row_boxes(normalized['rows'], image_size)

    def change(index, row, attribute, value, reason, **details):
        if row.get(attribute) != value:
            audit.append({'row_index': index, 'attribute': attribute,
                          'before': row.get(attribute), 'after': value, 'reason': reason, **details})
            row[attribute] = value

    def issue(index, code):
        issues.append({'row_index': index, 'code': code, 'requires_review': True})

    for index, row in enumerate(normalized['rows']):
        if index in pixel_boxes and valid_row_box(pixel_boxes[index]):
            change(index, row, 'row_box', pixel_boxes[index], 'page_pixel_boxes_normalized')
        box = row.get('row_box')
        if valid_row_box(box):
            locations[tuple(box)].append(index)
        elif box is not None:
            change(index, row, 'row_box', None, 'invalid_row_box')
        numeric = row.get('numeric_value') is not None
        sign = row.get('comparator')
        if isinstance(sign, str):
            sign = {'≤': '<=', '≥': '>='}.get(sign.strip(), sign.strip())
            change(index, row, 'comparator', sign, 'canonical_comparator')
        if numeric:
            if not isinstance(row['numeric_value'], str) or not re.fullmatch(r'[+-]?\d+(?:\.\d+)?', row['numeric_value']):
                issue(index, 'invalid_numeric_decimal_string')
            parsed, _ = result_value(row.get('raw_result', ''), 'mixed', {})
            same = _same_number(parsed.get('numeric_value'), row['numeric_value'])
            if sign not in COMPARATORS:
                if same and parsed.get('comparator') in COMPARATORS:
                    change(index, row, 'comparator', parsed['comparator'], 'comparator_reparsed_from_same_raw_result')
                else:
                    issue(index, 'invalid_comparator_without_unambiguous_source')
            elif same and parsed.get('comparator') != sign:
                issue(index, 'comparator_conflicts_with_raw_result')
            if parsed.get('numeric_value') is not None and not same:
                issue(index, 'numeric_value_conflicts_with_raw_result')
        elif sign is not None:
            issue(index, 'comparator_on_nonnumeric_result')

        column = row.get('source_column')
        header = header_role(row.get('source_header'))
        if (result_rules and header == column == row.get('component') == 'result'
                and (row.get('field_id') is None or row['field_id'] in lab_results)):
            match = match_result_literal(row, result_rules)
            if match:
                value, rule = match
                change(index, row, 'qualitative_value', value, 'literal_result_from_source_cell', rule=rule)
        if header not in SOURCE_COLUMNS:
            header = None
        # CBC differential role is carried by the row's #/% label. A generic
        # Result heading can contain both; it must not collapse those roles.
        cbc_differential = (row.get('table_kind') == 'cbc'
                            and row.get('component') in ('absolute_count', 'percentage')
                            and column in ('result', row.get('component')))
        if cbc_differential and header == 'result':
            header = None
        if header and header != column:
            issue(index, 'source_header_conflicts_with_column')
            change(index, row, 'source_column', header, 'explicit_source_header_role')
            column = header
        if header and row.get('component') != header:
            if row.get('field_id') is None or header in fields.get(row.get('field_id'), set()):
                change(index, row, 'component', header, 'explicit_source_header_component')
        if ('class_header' in row and row.get('class_raw') is not None
                and header_role(row.get('class_header')) != 'class'):
            issue(index, 'class_without_printed_column')
        if 'source_header' in row and not row.get('source_header'):
            issue(index, 'missing_source_header_evidence')
        pft_percent = row.get('table_kind') == 'pft' and row.get('component') in (
            'pre_percent_predicted', 'post_percent_predicted')
        if column in SOURCE_COLUMNS[:-1]:
            if row.get('table_kind') == 'pft' and column in ('pre_measured', 'post_measured'):
                change(index, row, 'component', column, 'explicit_pft_measurement_column')
            elif column != row.get('component') and not (pft_percent and column == 'percentage') and not (
                    cbc_differential and column == 'result'):
                issue(index, 'component_conflicts_with_source_column')
        if row.get('table_kind') == 'pft' and column not in ('pre_measured', 'post_measured',
                'pre_percent_predicted', 'post_percent_predicted') and not (pft_percent and column == 'percentage'):
            issue(index, 'unresolved_pft_measurement_column')
        field = row.get('field_id')
        label = fold(row.get('source_label') or '')
        if field in hb_fields and (not _HB_LABEL.search(label) or _UNADJUSTED_LABEL.search(label)
                                   or not hb_fields[field].intersection(_DIFFUSION_LABEL.findall(label))):
            issue(index, 'crf_hb_qualifier_missing')
            change(index, row, 'field_id', None, 'hb_adjusted_field_requires_source_qualifier')
            field = None
        if field is not None:
            if field not in fields:
                issue(index, 'unknown_crf_field')
            elif row.get('component') not in fields[field]:
                issue(index, 'component_not_in_crf_field')

        annotation = row.get('grade_annotation')
        grade = row.get('grade_raw')
        if annotation:
            text = annotation['text'].strip()
            valid_grade = bool(re.fullmatch(r'(?:[1-4]\+|\+{1,4})', text))
            confirmed = annotation['association'] == 'confirmed' and annotation['placement'] == 'result_cell'
            if not valid_grade:
                issue(index, 'invalid_grade_annotation')
            if valid_grade and confirmed:
                if grade is not None and grade.strip() != text:
                    issue(index, 'grade_conflicts_with_annotation')
                else:
                    change(index, row, 'grade_raw', text, 'confirmed_result_cell_grade_annotation')
            else:
                issue(index, 'grade_association_requires_review')
                if grade is not None:
                    change(index, row, 'grade_raw', None, 'do_not_promote_ambiguous_grade')
        elif grade is not None:
            issue(index, 'grade_without_source_annotation')

    for indexes in locations.values():
        rows = [(fold(normalized['rows'][i].get('source_label') or '').strip(),
                 normalized['rows'][i].get('component')) for i in indexes]
        if len({label for label, _ in rows}) > 1 or len(set(rows)) < len(rows):
            for i in indexes:
                issue(i, 'source_row_box_reused')
                change(i, normalized['rows'][i], 'row_box', None, 'same_box_for_multiple_source_rows')

    for index, specimen in enumerate(normalized.get('specimens', [])):
        label = specimen.get('sample_type', '').strip().lower()
        label = 'other' if re.match(r'^others?\b', label) else label
        if label in ('blood', 'stool', 'other') and specimen.get('sample_type') != label:
            audit.append({'specimen_index': index, 'attribute': 'sample_type',
                          'before': specimen['sample_type'], 'after': label, 'reason': 'canonical_sample_type'})
            specimen['sample_type'] = label
    return normalized, audit, issues
