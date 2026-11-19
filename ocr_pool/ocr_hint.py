"""Local OCR layout hint restricted to what the outgoing image actually shows.

Only lines fully inside the reviewed crop and clear of every mask are kept,
in the outgoing image's pixel frame, so the vision model can cross-check
digits and row alignment without ever seeing masked or cropped-away text.
"""
from .local_dates import _valid_lines
from .outgoing_gate import identifying_text, staff_text


def ocr_hint_lines(scan, privacy, *, max_lines=400):
    """Return [x0, y0, x1, y1, text] items in outgoing-image pixels, or []."""
    if not scan:
        return []
    left, top, right, bottom = privacy['crop']
    masks = [tuple(m) for m in privacy.get('masks', [])]
    for polygon in privacy.get('mask_polygons', []):
        xs, ys = zip(*polygon)
        masks.append((min(xs), min(ys), max(xs), max(ys)))
    kept = []
    for line in _valid_lines(scan):
        x0, y0, x1, y1 = line['box']
        if not (left <= x0 and x1 <= right and top <= y0 and y1 <= bottom):
            continue
        if any(x0 < r and x1 > l and y0 < b and y1 > t for l, t, r, b in masks):
            continue
        if (line.get('confidence') or 0) < 0.3 or not line['text'].strip():
            continue
        kept.append(line)
    kept.sort(key=lambda line: (line['box'][1], line['box'][0]))
    kept = kept[:max_lines]
    if staff_text(kept) or identifying_text(kept):
        return []
    # prepare_image re-encodes the crop at native resolution (no resize), so
    # the outgoing frame is the crop frame shifted to its own origin, 1:1.
    hint = []
    for line in kept:
        x0, y0, x1, y1 = line['box']
        hint.append([x0 - left, y0 - top, x1 - left, y1 - top, line['text']])
    return hint