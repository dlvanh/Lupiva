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

NUMBER = re.compile(r'(?<![\w.,])[<>≤≥]?\s*(\d+(?:[.,]\d+)?)(?![\w.,]*\d)')


def _number(value):
    try:
        return float(str(value).replace(',', '.'))
    except (TypeError, ValueError):
        return None


def number_disagreements(rows, scan, privacy, *, min_confidence=.9):
    """Indexes of API rows whose number is absent from the same-row local OCR numbers."""
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
        if (anchor.get('confidence') or 0) >= min_confidence:
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
                found += [(n, dy) for match in NUMBER.finditer(line['text'])
                          if (n := _number(match[1])) is not None]
        return found

    # Photographed pages are often slanted: the result column sits a fraction
    # of a row above or below its label. Estimate that offset from rows whose
    # API number is the nearest same-band OCR number, then check every row.
    offsets = []
    for index, value, anchor in checked:
        near = numbers_near(anchor, 0, 1.0)
        if near:
            nearest = min(near, key=lambda item: abs(item[1]))
            if abs(nearest[0] - value) < 1e-9:
                offsets.append(nearest[1])
    if len(offsets) < 5:
        return []
    offsets.sort()
    offset = offsets[len(offsets)//2]
    flagged = []
    for index, value, anchor in checked:
        numbers = [n for n, _ in numbers_near(anchor, offset, .4)]
        if numbers and not any(abs(n - value) < 1e-9 for n in numbers):
            flagged.append(index)
    return flagged
