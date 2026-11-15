"""Cross-check API numbers against local OCR on the same printed row.

Only rows whose printed label is found exactly once by confident local OCR are
checked. When that row carries confident OCR numbers and none equals the API
number, the row is reported so the reviewer opens the source cell. Values are
never changed here.
"""
from collections import Counter, defaultdict
import re

from .llm_row_anchors import label_key
from .local_dates import _valid_lines

NUMBER = re.compile(r'(?<![\w.,])([<>≤≥]?)\s*(\d+(?:[.,]\d+)?)(?![\w.,]*\d)')


def _number(value):
    try:
        return float(str(value).replace(',', '.'))
    except (TypeError, ValueError):
        return None


VALUE_CELL = re.compile(r'([<>≤≥]?)\s*(\d+(?:[.,]\d+)?)(?:\s+[^\W\d_]+)?\s*')


def _median(values):
    values = sorted(values)
    return values[len(values)//2]


def _rank_disagreements(rows, lines, checked, min_confidence):
    """Pair the label column with the value column by vertical order.

    A table has one value per row, so the i-th label from the top belongs to the
    i-th value from the top even when the photo is slanted and every value sits
    half a row above or below its label. That is exactly where a model (and the
    offset estimate below) can pair each label with its neighbour's value. Only
    used when both columns are read completely: equal counts over the same span.
    """
    anchors = [anchor for _, _, anchor in checked]
    if len(anchors) < 5:
        return []
    height = _median([a['box'][3]-a['box'][1] for a in anchors])
    left = _median([a['box'][0] for a in anchors])
    top = min(a['box'][1] for a in anchors) - 1.5*height
    bottom = max(a['box'][3] for a in anchors) + 1.5*height
    label_column = sorted((line for line in lines if abs(line['box'][0]-left) <= 1.5*height
                           and top <= line['box'][1] and line['box'][3] <= bottom), key=lambda l: l['box'][1])
    right = min(a['box'][2] for a in anchors)
    cells = [line for line in lines if line['box'][0] > right and top <= line['box'][1]
             and line['box'][3] <= bottom and (m := VALUE_CELL.fullmatch(line['text'].strip()))
             and not m[1]]   # "<35" is usually a reference limit, never a paired result
    if not cells:
        return []
    # The value column is the densest column of value cells right of the labels.
    column = max(cells, key=lambda c: sum(abs(o['box'][0]-c['box'][0]) <= 2*height for o in cells))['box'][0]
    values = sorted((c for c in cells if abs(c['box'][0]-column) <= 2*height), key=lambda c: c['box'][1])
    first, last = label_column[0]['box'][1], label_column[-1]['box'][1]
    if (len(values) != len(label_column) or len(values) < 5
            or any((v.get('confidence') or 0) < min_confidence for v in values)
            or abs(values[0]['box'][1]-first) > height or abs(values[-1]['box'][1]-last) > height):
        return []
    paired = {id(label): float(VALUE_CELL.fullmatch(value['text'].strip())[2].replace(',', '.'))
              for label, value in zip(label_column, values)}
    return [index for index, value, anchor in checked
            if id(anchor) in paired and abs(paired[id(anchor)] - value) > 1e-9]


def number_disagreements(rows, scan, privacy, *, min_confidence=.9, label_confidence=.8):
    """Indexes of API rows whose number is absent from the same-row local OCR numbers.

    Numbers must be read with ``min_confidence``. The row label only anchors the
    row and must already equal the API label exactly (once on the page), so it
    may be read with the lower ``label_confidence``: short codes such as "cN-1A"
    are often read correctly with a slightly lower score.
    """
    if not scan:
        return []
    left, top, right, bottom = privacy['crop']
    masks = list(privacy.get('masks', []))
    lines = [line for line in _valid_lines(scan)
             if left <= line['box'][0] < line['box'][2] <= right and top <= line['box'][1] < line['box'][3] <= bottom
             and not any(line['box'][0] < r and line['box'][2] > l and line['box'][1] < b and line['box'][3] > t
                         for l, t, r, b in masks)]
    labels = defaultdict(list)
    for line in lines:
        labels[label_key(line['text'])].append(line)
    counts = Counter(label_key(row.get('source_label')) for row in rows)
    checked = []
    for index, row in enumerate(rows):
        value = _number(row.get('numeric_value'))
        key = label_key(row.get('source_label'))
        if value is None or len(key) < 3 or counts[key] != 1 or len(labels[key]) != 1:
            continue
        anchor = labels[key][0]
        if (anchor.get('confidence') or 0) >= label_confidence:
            checked.append((index, value, anchor))

    def numbers_near(anchor, offset, tolerance):
        x1, y1, x2, y2 = anchor['box']
        cy, height = (y1+y2)/2 + offset, y2-y1
        found = []
        for line in lines:
            if (line is anchor or line['box'][0] < x2 - .2*height
                    or (line.get('confidence') or 0) < min_confidence):
                continue
            dy = (line['box'][1]+line['box'][3])/2 - cy
            if abs(dy) <= tolerance*height:
                found += [(n, dy, bool(match[1])) for match in NUMBER.finditer(line['text'])
                          if (n := _number(match[2])) is not None]
        return found

    flagged = set(_rank_disagreements(rows, lines, checked, min_confidence))

    # Photographed pages are often slanted: the result column sits a fraction
    # of a row above or below its label. Estimate that offset from rows whose
    # API number is the nearest same-band OCR number (labels read with full
    # confidence only), then check every row.
    offsets = []
    for index, value, anchor in checked:
        if (anchor.get('confidence') or 0) < min_confidence:
            continue
        near = numbers_near(anchor, 0, 1.0)
        if near:
            nearest = min(near, key=lambda item: abs(item[1]))
            if abs(nearest[0] - value) < 1e-9:
                offsets.append(nearest[1])
    if len(offsets) < 5:
        return sorted(flagged)
    offsets.sort()
    offset = offsets[len(offsets)//2]
    for index, value, anchor in checked:
        near = numbers_near(anchor, offset, .4)
        # A bare "<35" next to an unread result is usually the reference
        # limit: it may confirm the API number but is not evidence against it.
        if (any(not limit for _, _, limit in near)
                and not any(abs(n - value) < 1e-9 for n, _, _ in near)):
            flagged.add(index)
    return sorted(flagged)
