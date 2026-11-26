"""Cross-check API numbers against local OCR on the same printed row.

Only rows whose printed label is found exactly once by confident local OCR are
checked. When that row carries confident OCR numbers and none equals the API
number, the row is reported so the reviewer opens the source cell. Values are
never changed here.
"""
from collections import Counter, defaultdict
from difflib import SequenceMatcher
import re
import unicodedata

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


def _loose_key(text):
    """Fold Vietnamese marks and punctuation: OCR often misreads the marks only."""
    plain = unicodedata.normalize('NFD', text or '')
    plain = ''.join(c for c in plain if not unicodedata.combining(c)).casefold().replace('đ', 'd')
    return re.sub(r'[^a-z0-9]+', '', plain)


def _near_label(label, lines, loose):
    """The one OCR line whose folded label nearly equals the API label, e.g. "Dinh luęng IgE".

    Long labels only (8+ letters), similarity ≥ 0.9, and a single candidate,
    so a short code never anchors to a different analyte.
    """
    key = _loose_key(label)
    if len(key) < 8:
        return None
    if len(loose.get(key, ())) == 1:
        return loose[key][0]
    codes = _codes(label)
    near = [line for line in lines if len(_loose_key(line['text'])) >= 8 and _codes(line['text']) == codes
            and SequenceMatcher(None, key, _loose_key(line['text'])).ratio() >= .9]
    return near[0] if len(near) == 1 else None


def _codes(text):
    """Analyte codes in a label (IgE, C3, KL-6): tokens with a capital or a digit.

    They must match exactly; only the Vietnamese words around them may differ,
    so "IgA" can never anchor an "IgE" row.
    """
    return sorted(_loose_key(token) for token in re.findall(r'[\w-]+', text or '')
                  if re.search(r'\d', token) or re.search(r'[A-Z]', token[1:]) or (len(token) == 1 and token.isupper()))


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
    loose = defaultdict(list)
    for line in lines:
        loose[_loose_key(line['text'])].append(line)
    for index, row in enumerate(rows):
        value = _number(row.get('numeric_value'))
        key = label_key(row.get('source_label'))
        if value is None or len(key) < 3 or counts[key] != 1:
            continue
        if len(labels[key]) == 1:
            anchor = labels[key][0]
        else:
            # Tolerant anchors only for plain numeric results: "Negative (<2)" style
            # cells carry bracketed numbers that pair poorly with a loose label.
            plain = re.fullmatch(r'[<>≤≥]?\s*\d+(?:[.,]\d+)?', str(row.get('raw_result') or row.get('numeric_value') or '').strip())
            anchor = None if labels[key] or not plain else _near_label(row.get('source_label'), lines, loose)
            if anchor is None:
                continue
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


RESULT_HEADERS = {'ketqua', 'result', 'results', 'intensity'}
THOUSANDS = re.compile(r'(?<![\d.,])\d{1,3}(?:,\d{3})+(?![\d,])')


def _printed_number(text):
    """(comparator, number) of a cell that prints exactly one number, else None."""
    text = THOUSANDS.sub(lambda m: m[0].replace(',', ''), text)
    found = list(NUMBER.finditer(text))
    if len(found) != 1:
        return None
    return found[0][1] or '=', _number(found[0][2])


def number_agreement(rows, scan, privacy, *, min_confidence=.9, label_confidence=.8):
    """'match', 'mismatch' or 'unchecked' for every API row.

    Unlike ``number_disagreements`` this separates a confirmed number from one that
    could not be checked. A match needs the row label once on the page, one
    confident OCR cell on that row under the printed result header, and the same
    number, comparator and (when the result has words) the same words.
    """
    result = ['unchecked'] * len(rows)
    if not scan:
        return result
    left, top, right, bottom = privacy['crop']
    masks = list(privacy.get('masks', []))
    for polygon in privacy.get('mask_polygons', []):
        xs, ys = zip(*polygon)
        masks.append((min(xs), min(ys), max(xs), max(ys)))
    lines = [line for line in _valid_lines(scan)
             if left <= line['box'][0] < line['box'][2] <= right and top <= line['box'][1] < line['box'][3] <= bottom
             and not any(line['box'][0] < r and line['box'][2] > l and line['box'][1] < b and line['box'][3] > t
                         for l, t, r, b in masks)]
    headers = [line for line in lines if _loose_key(line['text']) in RESULT_HEADERS]
    labels, loose = defaultdict(list), defaultdict(list)
    for line in lines:
        labels[label_key(line['text'])].append(line)
        loose[_loose_key(line['text'])].append(line)
    counts = Counter(label_key(row.get('source_label')) for row in rows)
    anchors = {}
    for index, row in enumerate(rows):
        key = label_key(row.get('source_label'))
        if _number(row.get('numeric_value')) is None or not key or counts[key] != 1:
            continue
        found = labels[key]
        anchor = found[0] if len(found) == 1 else None if found else _near_label(row.get('source_label'), lines, loose)
        if anchor and (anchor.get('confidence') or 0) >= label_confidence:
            anchors[index] = anchor
    if len({id(a) for a in anchors.values()}) != len(anchors) or not anchors:
        return result

    def middle(line):
        return (line['box'][1] + line['box'][3]) / 2

    # The one header printed above every row; a legend below the table may repeat the word.
    first = min(middle(a) for a in anchors.values())
    above = [line for line in headers if line['box'][3] <= first]
    if len(above) != 1:
        return result
    h0, _, h1, header_bottom = above[0]['box']
    below = min((middle(line) for line in headers if line is not above[0]), default=bottom)
    anchors = {index: a for index, a in anchors.items() if middle(a) < below and a['box'][2] <= (h0+h1)/2}

    # Cells under the result header only, never the reference or unit column.
    column = [line for line in lines if header_bottom <= middle(line) < below and line not in headers
              and abs((line['box'][0]+line['box'][2])/2 - (h0+h1)/2) <= .75*(h1-h0)
              and any(c.isdigit() for c in line['text'])]
    # Photographed pages slant: take the label-to-value offset from agreeing rows.
    offsets = []
    for index, anchor in anchors.items():
        near = [c for c in column if abs(middle(c) - middle(anchor)) <= anchor['box'][3] - anchor['box'][1]]
        if near:
            cell = min(near, key=lambda c: abs(middle(c) - middle(anchor)))
            printed = _printed_number(cell['text'])
            if printed and printed[1] == _number(rows[index]['numeric_value']):
                offsets.append(middle(cell) - middle(anchor))
    offset = _median(offsets) if len(offsets) >= 5 else 0
    for index, anchor in anchors.items():
        row = rows[index]
        height = anchor['box'][3] - anchor['box'][1]
        cells = [c for c in column if abs(middle(c) - middle(anchor) - offset) <= .4*height]
        if len(cells) != 1 or (cells[0].get('confidence') or 0) < min_confidence:
            continue
        printed = _printed_number(cells[0]['text'])
        if printed is None or printed[1] is None:
            continue
        comparator = {'<=': '≤', '>=': '≥'}.get(row.get('comparator'), row.get('comparator') or '=')
        same = abs(printed[1] - _number(row['numeric_value'])) < 1e-9 and printed[0] == comparator
        words, printed_words = (re.sub(r'[\W\d_]', '', str(text or ''))
                                for text in (row.get('raw_result'), cells[0]['text']))
        # A lone H/L marker beside the number is not part of the result.
        if same and _loose_key(words) != _loose_key(printed_words) and not {words, printed_words} <= {'', 'H', 'L'}:
            same = False
        result[index] = 'match' if same else 'mismatch'
    return result
