"""Last local privacy check of the exact outgoing image before any API request.

The crop/mask proposal can miss staff text when OCR misreads a role word.
This gate re-reads the prepared (cropped and masked) bytes locally and
blocks automatic sending when staff roles, titles or signature labels remain
readable, or when the re-read image still shows a date, an identity label, a
phone number or an e-mail address (a mask that slipped on a skewed or
compressed photo). Nothing here leaves the machine.
"""
import io
import re
from pathlib import Path

from PIL import Image

from .metadata import fold
from .privacy_proposal import (EMAIL, IDENTITY, LAB_SIGNER, LAB_TECHNICIAN, PHONE, SIGNATURE_LABEL,
                               STAFF_ROLE, STAFF_TITLE, date_mentions)

# Role phrases may follow other text on the same OCR line.
ROLE_ANYWHERE = re.compile(r'(?<![a-z])' + STAFF_ROLE.pattern.lstrip('^'))


def staff_text(lines):
    """OCR line texts that name a staff role, title or signature."""
    hits = []
    for line in lines:
        text = fold(line.get('text') or '').strip()
        if (ROLE_ANYWHERE.search(text) or STAFF_TITLE.match(text) or SIGNATURE_LABEL.match(text)
                or LAB_SIGNER.match(text) or LAB_TECHNICIAN.fullmatch(text)):
            hits.append(line.get('text'))
    return hits


def identifying_text(lines):
    """OCR line texts that still show a date, identity label, phone or e-mail."""
    hits = []
    for line in lines:
        text = fold(line.get('text') or '').strip()
        if (IDENTITY.search(text) or PHONE.search(text) or EMAIL.search(text)
                or date_mentions(text, contextual=True)):
            hits.append(line.get('text'))
    return hits


def visible_source_lines(scan, privacy):
    """Source OCR lines at least partly visible in the crop and not fully masked."""
    left, top, right, bottom = privacy['crop']
    masks = [tuple(m) for m in privacy.get('masks', [])]
    for polygon in privacy.get('mask_polygons', []):
        xs, ys = zip(*polygon)
        masks.append((min(xs), min(ys), max(xs), max(ys)))
    visible = []
    for line in scan.get('lines', []) if scan else []:
        x1, y1, x2, y2 = line['box']
        cx1, cy1, cx2, cy2 = max(x1, left), max(y1, top), min(x2, right), min(y2, bottom)
        if cx1 >= cx2 or cy1 >= cy2:
            continue
        if any(l <= cx1 and t <= cy1 and cx2 <= r and cy2 <= b for l, t, r, b in masks):
            continue
        visible.append(line)
    return visible


def check_outgoing(body, privacy, scan, models):
    """Return (method, staff texts) for a prepared outgoing image."""
    if Path(models).is_dir():
        try:
            from .privacy_ocr import analyze
            with Image.open(io.BytesIO(body)) as image:
                _, lines = analyze(image.convert('RGB'), Path(models))
            # Only a re-read of the masked pixels can tell a masked date from a visible one.
            return 'outgoing_ocr', staff_text(lines) + identifying_text(lines)
        except Exception as error:  # an unreadable check must not silently pass
            return 'outgoing_ocr_failed', [f'local OCR failed: {type(error).__name__}']
    if scan is None:
        return 'unchecked_no_ocr', []
    return 'source_ocr', staff_text(visible_source_lines(scan, privacy))
