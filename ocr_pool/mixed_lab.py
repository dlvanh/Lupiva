"""Separate an isolated ANA fluorescence row inside an already reviewed crop."""
import io
import re
from hashlib import sha256

from PIL import Image, ImageDraw

from .gemini import InvalidAPIResponse, extract_image
from .lab_api import FLUORESCENCE, extract_lab_image, lab_crop_evidence
from .llm_extraction import valid_row_box
from .llm_verification import verify_extraction
from .local_dates import unmasked_crop_lines
from .metadata import fold


def fluorescence_split(scan, plan):
    if not scan:
        return None
    lines = unmasked_crop_lines(scan, plan)
    marked = [line for line in lines if FLUORESCENCE.search(fold(line['text']))]
    if not marked or not any(re.search(r'huynh\s*quang|immunofluorescen', fold(l['text'])) for l in marked):
        return None
    left, top, right, bottom = plan['crop']
    ana = [l for l in lines if re.search(r'\b(?:anti\s*-?\s*ana|ana)\b', fold(l['text']))
           and any(abs(l['box'][1] - m['box'][1]) <= 2 * (m['box'][3] - m['box'][1]) for m in marked)]
    if len(ana) != 1:
        return None
    anchor = ana[0]['box']
    height = anchor[3] - anchor[1]
    if any(abs(l['box'][1] - anchor[1]) > 2 * height for l in marked):
        return None
    start = min(anchor[1], *(l['box'][1] for l in marked)) - height // 4
    end = max(anchor[3], *(l['box'][3] for l in marked)) + height // 2
    # A boundary that intersects any visible text can cut a value or continuation.
    if not top < start < end < bottom or any(
            y1 < start < y2 or y1 < end < y2 for _, y1, _, y2 in (l['box'] for l in lines)):
        return None
    ordinary = {**plan, 'masks': [*plan.get('masks', []), [left, start, right, end]]}
    evidence = lab_crop_evidence(scan, ordinary)
    if not evidence or evidence['panel'] or len(evidence['required_fields']) < 2:
        return None
    return start - top, end - top, evidence


def extract_split_lab(body, split, dictionary, workspace, config):
    start, end, evidence = split
    with Image.open(io.BytesIO(body)) as source:
        width, height = source.size
        special = source.crop((0, start, width, end))
        ordinary = source.copy()
        ImageDraw.Draw(ordinary).rectangle((0, start, width - 1, end - 1), fill='white')

    def jpeg(image):
        stream = io.BytesIO()
        image.save(stream, 'JPEG', quality=95)
        return stream.getvalue()

    fast = extract_lab_image(jpeg(ordinary), dictionary, config=config, evidence=evidence, image_size=[width, height])
    special_body = jpeg(special)
    detailed = extract_image(special_body, dictionary, workspace, config=config)
    detailed = verify_extraction(special_body, detailed, dictionary, workspace, config=config)
    ordinary_rows = fast['extraction']['rows']
    special_rows = detailed['extraction']['rows']
    if (len(special_rows) != 1 or detailed['extraction'].get('specimens')
            or not re.search(r'\bana\b', fold(special_rows[0]['source_label']))
            or any('ana' in fold(row['source_label']) or row.get('pattern_raw') for row in ordinary_rows)):
        raise InvalidAPIResponse('Separated fluorescence results did not pass row checks')
    for row in special_rows:
        box = row.get('row_box')
        if valid_row_box(box):
            row['row_box'] = [box[0], round((1000 * start + box[1] * (end - start)) / height),
                              box[2], round((1000 * start + box[3] * (end - start)) / height)]
    offset = len(ordinary_rows)
    return dict(extraction={**fast['extraction'], 'rows': [*ordinary_rows, *special_rows],
                            'notes': [*fast['extraction']['notes'], *detailed['extraction']['notes']],
                            'warnings': [*fast['extraction']['warnings'], *detailed['extraction']['warnings']]},
                raw_extraction={'ordinary': fast['raw_extraction'], 'fluorescence': detailed['raw_extraction'],
                                'fluorescence_verification': detailed.get('verification')},
                raw_response={'ordinary': fast['raw_response'], 'fluorescence': detailed['raw_response']},
                normalization_audit=[*fast['normalization_audit'],
                                     *({**a, 'row_index': a['row_index'] + offset}
                                       for a in detailed['normalization_audit'])],
                validation_issues=[*fast['validation_issues'],
                                   *({**a, 'row_index': a['row_index'] + offset}
                                     for a in detailed['validation_issues'])],
                model_requested=config['model'], model_returned=detailed['model_returned'],
                usage={'ordinary': fast['usage'], 'fluorescence': detailed['usage']},
                finish_reason=detailed['finish_reason'],
                request_contract=dict(profile='lab-split-fluorescence-1', engine='tokenharbor',
                                      image_sha256=sha256(body).hexdigest(), image_size=[width, height],
                                      fluorescence_band=[start, end],
                                      segments=[fast['request_contract'], detailed['request_contract']]))
