"""Anchor displaced LLM overlays to uniquely located printed OCR labels."""
from collections import Counter, defaultdict
import re
import unicodedata

from .llm_extraction import valid_row_box
from .local_dates import _valid_lines


def label_key(text):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', text or '').casefold()).rstrip(':')


def anchor_row_boxes(record, scan, privacy):
    left, top, right, bottom = privacy['crop']
    width, height = right-left, bottom-top
    excluded = list(privacy.get('masks', []))
    for polygon in privacy.get('mask_polygons', []):
        xs, ys = zip(*polygon)
        excluded.append((min(xs), min(ys), max(xs), max(ys)))
    anchors = defaultdict(list)
    for line in _valid_lines(scan):
        x1, y1, x2, y2 = line['box']
        if not (left <= x1 < x2 <= right and top <= y1 < y2 <= bottom):
            continue
        if any(x1 < r and x2 > l and y1 < b and y2 > t for l, t, r, b in excluded):
            continue
        anchors[label_key(line['text'])].append(line)
    rows = record['extraction']['rows']
    counts = Counter(label_key(row.get('source_label')) for row in rows)
    for index, row in enumerate(rows):
        key = label_key(row.get('source_label'))
        matches = anchors[key]
        if len(key) < 3 or counts[key] != 1 or len(matches) != 1:
            continue
        confidence = matches[0].get('confidence')
        if not isinstance(confidence, (int, float)) or not .9 <= confidence <= 1:
            continue
        x1, y1, x2, y2 = matches[0]['box']
        anchor = [round(1000*(x1-left)/width), round(1000*(y1-top)/height),
                  round(1000*(x2-left)/width), round(1000*(y2-top)/height)]
        before = row.get('row_box')
        if not valid_row_box(anchor):
            continue
        if before and before[1] <= (anchor[1]+anchor[3])/2 <= before[3]:
            continue
        row['row_box'] = anchor
        record['normalization_audit'].append(dict(row_index=index, attribute='row_box', before=before,
            after=anchor, reason='unique_local_ocr_label_anchor'))
