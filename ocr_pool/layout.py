"""Deterministic routing of detector boxes, with no document-specific coordinates."""
import math

TEXT_LABELS = {'text', 'header', 'doc_title', 'paragraph_title'}


def bounded_box(box, size, padding=8):
    width, height = size
    if len(box) != 4 or any(not math.isfinite(v) for v in box):
        raise ValueError('Nonfinite/invalid detector box')
    left, top, right, bottom = box
    if right <= left or bottom <= top:
        raise ValueError('Degenerate detector box')
    result = [max(0, math.floor(left) - padding), max(0, math.floor(top) - padding),
              min(width, math.ceil(right) + padding), min(height, math.ceil(bottom) + padding)]
    if result[2] <= result[0] or result[3] <= result[1]:
        raise ValueError('Detector box outside source image')
    return result


def route_document(document):
    size = document['image_size']
    detections = document['detections']
    tables = [d for d in detections if d['label'] == 'table']
    regions, decisions = [], []
    first_table_y = min((d['bbox_xyxy'][1] for d in tables), default=size[1])
    # Whole-image-relative grouping only. Do not load development annotations.
    header_text = [d for d in detections if d['label'] in TEXT_LABELS
                   and d['bbox_xyxy'][3] <= first_table_y + size[1] * 0.01]
    groups = {'left': [], 'right': [], 'wide': []}
    for d in header_text:
        l, t, r, b = d['bbox_xyxy']
        group = 'wide' if r - l > size[0] * 0.58 else 'left' if (l + r) / 2 < size[0] * 0.55 else 'right'
        groups[group].append(d)
    for group, items in groups.items():
        if not items:
            continue
        box = [min(d['bbox_xyxy'][0] for d in items), min(d['bbox_xyxy'][1] for d in items),
               max(d['bbox_xyxy'][2] for d in items), max(d['bbox_xyxy'][3] for d in items)]
        rid = document['document_id'] + '-auto-header-' + group
        regions.append(dict(region_id=rid, bbox_xyxy=bounded_box(box, size), task='text', purpose='metadata',
                            max_pixels=1003520, context={}, layout_provenance=dict(
                                method='detector_pre_table_text_union', detection_ids=[d['detection_id'] for d in items])))
    for d in tables:
        regions.append(dict(region_id=d['detection_id'], bbox_xyxy=bounded_box(d['bbox_xyxy'], size),
                            task='table', max_pixels=1003520, layout_provenance=dict(
                                method='detector_table_bbox', detection_ids=[d['detection_id']],
                                score=d['score'], polygon_xy=d['polygon_xy'])))
    used = {id for r in regions for id in r['layout_provenance']['detection_ids']}
    for d in detections:
        decisions.append(dict(detection_id=d['detection_id'], label=d['label'],
                              decision='routed' if d['detection_id'] in used else 'retained_unprocessed',
                              reason=None if d['detection_id'] in used else 'non_table_or_post_table_content'))
    return dict(document_id=document['document_id'], input_path=document['input_path'],
                expected_input_sha256=document['input_sha256'], regions=regions,
                layout_decisions=decisions)
