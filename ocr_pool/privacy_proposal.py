"""Local, reviewable privacy proposals from OCR boxes and source geometry.

Never authorizes outbound transmission. No model calls, patient dictionaries,
template coordinates, CRF answers, date repair or clinical interpretation.
"""
from datetime import date
from itertools import combinations
import math
import re
import unicodedata

VERSION = 'privacy-proposal-0.20'
IDENTITY = re.compile(
    r'\b(?:ho\s*(?:va\s*)?ten|ten benh nhan|patient\s*name|full\s*name|l\s*name|f\s*name|'
    r'ngay\s*sinh|date\s*of\s*birth|birth\s*date|dob|dia\s*chi|address|dien\s*thoai|phone|mobile|'
    r'passport|cm[nt]d?|cccd|bhyt|ma\s*(?:bn|benh\s*nhan|ho\s*so)|pid|sid|mrn|identity\s*number|'
    r'patient\s*id|sample\s*id|medical\s*record)\b')
DATE_CONTEXT = re.compile(r'\b(?:ngay|gio|date|dated|dob|birth|collected|collection|received|reported|time)\b')
REFERENCE = re.compile(r'\b(?:tham\s*chieu|reference|ref\.?\s*(?:range|interval)|normal\s*range)\b')
EMAIL = re.compile(r'[\w.+-]+@[\w.-]+\.[a-z]{2,}', re.I)
PHONE = re.compile(r'(?<![\d.])(?:\+84|0)[ -]?(?:\d[ -]?){8,10}(?![\d.])')
# Same separator, no partial match inside a decimal, interval, identifier or URL.
DMY = re.compile(r'(?<![\w./-])(\d{1,2})([/.\-])\s*(\d{1,2})\2\s*(\d{4}|\d{2})(?![\w./-])')
ISO = re.compile(r'(?<![\w./-])(\d{4})-(\d{2})-(\d{2})(?![\w./-])')
VI_DATE = re.compile(r'\bngay\s+(\d{1,2})\s+thang\s+(\d{1,2})\s+na?m\s+(\d{4})\b')
STAFF_ROLE = re.compile(
    # "Người" is often misread (Nguòi/Ngròi/Nguròi); the role phrase after it stays required.
    r'^(?:ng[a-z]{0,3}i\s*(?:chi\s*dinh|la[yi]\s*ma?u|nha?n\s*ma?u|thu\s*ma?u|'
    r'thuc\s*hien|duyet|doc\s*ket\s*qua|kiem\s*tra|in\s*ket\s*qua)|'
    r'bac\s*s[iy](?:\s*(?:chi\s*dinh|doc\s*ket\s*qua|dieu\s*tri))?|'
    r'ky\s*thuat\s*vien|dieu\s*duong|nhan\s*vien|truong\s*khoa|phu\s*trach(?:\s*khoa)?|'
    r'(?:ordered|collected|received|performed|verified|approved|reviewed)\s*by|'
    r'ordering\s*(?:provider|physician)|technician|operator|physician|doctor)\s*(?::|：|$)')
# Academic prefixes (PGS/GS/ThS/TS) and physician grades (BSCK1/2, BSNT = resident).
STAFF_TITLE = re.compile(r'^(?:(?:p?gs|thss?|ts)\s*[.\s]+)*(?:bs\s*\.?\s*(?:ck\s*[12i]+|nt)?|bac\s*s[iy]|dr)\s*(?:[.:]|\s)')
LAB_SIGNER = re.compile(r'^ckt\s*[.:]\s*\S')
LAB_TECHNICIAN = re.compile(r'^cn\s*\.\s*[^\W\d_]+(?:\s+[^\W\d_]+){1,5}$')
SIGNATURE_LABEL = re.compile(r'^(?:chu\s*ky|ky\s*ten|da\s*ky|signature|signed\s*by|nguoi\s*ky)\b')
FOOTER_CLINICAL = re.compile(
    r'\b(?:ket\s*qua|nhan\s*xet|ket\s*luan|tham\s*chieu|result|reference|interpretation|'
    r'positive|negative|borderline|intensity|class|pred(?:icted)?|meas(?:ured)?|'
    r'am\s*tinh|duong\s*tinh|mmhg|mg|mmol|umol|coi)\b|%')


def fold(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower().replace('đ', 'd'))
                   if unicodedata.category(c) != 'Mn')


def date_mentions(text, *, contextual=False):
    """Recognize calendar dates; never repair an OCR digit or expand a short year."""
    s = fold(text); result = []
    for pattern, kind in ((ISO, 'iso'), (DMY, 'dmy'), (VI_DATE, 'vi_words')):
        for m in pattern.finditer(s):
            if kind == 'iso': yy, mm, dd = m.groups()
            elif kind == 'dmy': dd, _, mm, yy = m.groups()
            else: dd, mm, yy = m.groups()
            if len(yy) == 2:
                if not contextual: continue
                # Leap/calendar validation only. A century is not invented.
                year = 2000 + int(yy); normalized = None
            else: year = int(yy); normalized = f'{year:04}-{int(mm):02}-{int(dd):02}'
            try: date(year, int(mm), int(dd))
            except ValueError: continue
            if any(a['span'][0] < m.end() and m.start() < a['span'][1] for a in result): continue
            result.append(dict(raw=m.group(), span=list(m.span()), normalized=normalized,
                               short_year=len(yy) == 2, format=kind))
    return sorted(result, key=lambda x: x['span'])


def _center(box): return ((box[0]+box[2])/2, (box[1]+box[3])/2)
def _height(box): return box[3]-box[1]


def _temporal_field_only(text, mentions):
    remaining=fold(text)
    for m in sorted(mentions,key=lambda m:m['span'][0],reverse=True):
        a,b=m['span'];remaining=remaining[:a]+' '*(b-a)+remaining[b:]
    remaining=re.sub(r'\b\d{1,2}:\d{2}(?::\d{2})?\b',' ',remaining)
    allowed={'ngay','gio','sinh','lay','mau','nhan','tra','ket','qua','in','chi','dinh','va',
             'date','of','birth','birthdate','dob','collection','collected','received','reported',
             'report','time','at','on','printed','result','sampling'}
    return not re.search(r'\d',remaining) and set(re.findall(r'[a-z]+',remaining))<=allowed


def _date_token_boxes(line, mentions, lines, size, image=None):
    """Use OCR token positions, never a proportional guess across a mixed line."""
    text = fold(line['text'])
    tokens = []
    cursor = 0
    for word in line.get('words', []):
        token = fold(word['text'])
        start = text.find(token, cursor) if token else -1
        box = word['box']
        a,b,c,d = box
        if (start < 0 or text[cursor:start].strip() or not 0 <= a < c <= size[0]
                or not 0 <= b < d <= size[1]
                or a < line['box'][0]-3 or b < line['box'][1]-3
                or c > line['box'][2]+3 or d > line['box'][3]+3):
            return None
        tokens.append((start, start+len(token), box, word.get('confidence') or 0))
        cursor = start+len(token)
    if not tokens or text[cursor:].strip():
        return None
    masks = []
    for mention in mentions:
        start, end = mention['span']
        chosen = [(a,b,box) for a,b,box,score in tokens if a < end and start < b and score >= .90]
        if not chosen or chosen[0][0] != start or chosen[-1][1] != end:
            return None
        if any(a < end and start < b and score < .90 for a,b,box,score in tokens):
            return None
        bounds = [min(b[0] for _,_,b in chosen), min(b[1] for _,_,b in chosen),
                  max(b[2] for _,_,b in chosen), max(b[3] for _,_,b in chosen)]
        pad = max(2,min(3,round(.10*_height(bounds))))
        mask = expanded(bounds,size,pad=pad)
        neighbors = [box for a,b,box,_ in tokens if b <= start or a >= end]
        neighbors.extend(other['box'] for other in lines if other is not line)
        if any(_overlap(mask,other) for other in neighbors):
            from .privacy_geometry import text_ink_band
            tight = text_ink_band(image,bounds)
            if not tight:
                return None
            mask = expanded(tight,size,pad=pad)
            for other in neighbors:
                if not _overlap(mask,other):
                    continue
                other_ink = text_ink_band(image,other)
                if not other_ink or _overlap(mask,expanded(other_ink,size,pad=1)):
                    return None
        masks.append(mask)
    return masks


def _date_header_context(line, lines, crop, crop_reason):
    """A date in a verified header/sample row has context, not in the body."""
    if not re.fullmatch(r'detected_\w+_table_header', crop_reason):
        return False
    box = line['box']
    if not _overlap(box, crop) or _center(box)[1] > crop[1]+3*_height(box):
        return False
    # Require a nearby heading in the same horizontal band. An ordinary date
    # above a skewed header still needs its administrative label.
    row = _row(line, lines)
    context = ' '.join(fold(other['text']) for other in row if other is not line)
    return bool(re.search(r'\b(?:spirometry|plethysmography|sample\s*type|amount|antigen|intensity)\b', context)
                or any(other['box'] in [b for _,b in _lab_headings(lines)] for other in row))


def expanded(box, size, pad=10):
    w, h = size; x0, y0, x1, y1 = box
    return [max(0, math.floor(x0)-pad), max(0, math.floor(y0)-pad),
            min(w, math.ceil(x1)+pad), min(h, math.ceil(y1)+pad)]


def _row(line, lines):
    y = _center(line['box'])[1]
    return [r for r in lines if abs(_center(r['box'])[1]-y) <= max(12, _height(line['box'])*.6)]


def _overlap(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def _name_like(text):
    words = text.strip().split()
    return (2 <= len(words) <= 7 and all(word.strip(".-'").isalpha() for word in words)
            and sum(word[0].isupper() for word in words) >= 2 and not FOOTER_CLINICAL.search(fold(text)))


def _blue_ink_count(image, box):
    if image is None or box[0] >= box[2] or box[1] >= box[3]:
        return 0
    pixels = image.crop(box).convert('RGB').tobytes()
    return sum(b-r >= 13 and b-g >= 4 and r < 205
               for r,g,b in zip(pixels[::3],pixels[1::3],pixels[2::3]))


def _staff_footer(anchor, lines, crop, crop_reason, image):
    """Mask a spatially isolated signing block only when it has an ink cue."""
    box = anchor['box']
    x0,y0,x1,y1 = box
    height = y1-y0
    _, cy = _center(box)
    if cy < crop[1]+.55*(crop[3]-crop[1]) or (x0+x1)/2 < (crop[0]+crop[2])/2:
        return None
    panel = crop_reason=='detected_panel_table_header' and fold(anchor['text']).strip(' .:') in {
        'laboratory','phong xet nghiem'}
    pft = crop_reason=='detected_pft_table_header' and STAFF_TITLE.match(fold(anchor['text']))
    if not (panel or pft):
        return None
    left = max(crop[0],x0-round((4 if panel else 1.5)*height))
    top = max(crop[1],y0-round((.15 if panel else 3)*height))
    right = min(crop[2],x1+4*height)
    bottom = min(crop[3],y1+(6 if panel else 2)*height)
    region = [left,top,right,bottom]
    neighbors = [line for line in lines if line is not anchor and _overlap(line['box'],region)]
    if pft:
        # A separate same-line footer, such as printer software text, may be
        # inside the padding without touching the stamp or the signature.
        for line in neighbors:
            a,b,d,e = line['box']
            if abs((b+e)/2-cy) > .65*height:
                return None
            if d <= x0:
                left = max(left,d)
            elif a >= x1:
                right = min(right,a)
            else:
                return None
        if (_blue_ink_count(image,[region[0],top,left,bottom])
                or _blue_ink_count(image,[right,top,region[2],bottom])):
            return None
        region = [left,top,right,bottom]
    if panel and (len(neighbors)>4 or any(
            line['box'][1] < y0 or FOOTER_CLINICAL.search(fold(line['text']))
            or len(line['text'].split())>7 or re.search(r'\d{3,}|\d+[.,]\d+|[<>]=?\s*\d',line['text'])
            for line in neighbors)):
        return None
    ink_box = [left,y1,right,bottom] if panel else [left,top,right,y0]
    if _blue_ink_count(image,ink_box) < 32:
        return None
    return region


def _lab_signed_block(anchor, lines, crop, *, technician=False):
    x0, y0, x1, y1 = anchor['box']
    height = y1-y0
    headings = [line['box'] for line in lines
                if re.fullmatch(r'khoa\s+xet\s+nghiem', fold(line['text']).strip())
                and (line.get('confidence') or 0) >= .90
                and 0 < y0-line['box'][3] < (5 if technician else 4)*height
                and min(x1,line['box'][2]) > max(x0,line['box'][0])]
    if len(headings) != 1 or (not technician and _center(anchor['box'])[1] < crop[1]+.55*(crop[3]-crop[1])):
        return None
    left, top, right, heading_bottom = headings[0]
    region = [max(crop[0],min(left,x0)-2*height), heading_bottom,
              min(crop[2],max(right,x1)+2*height), min(crop[3],y1+height)]
    overlaps = [line for line in lines if line is not anchor and _overlap(line['box'],region)]
    if technician:
        if len(overlaps) != 1 or top < crop[1] + 5*height:
            return None
        mark = overlaps[0]
        a,b,c,d = mark['box']
        if (region[0] <= a < c <= region[2] and region[1] <= b < d < y0
                and (mark.get('confidence') or 0) < .80
                and not FOOTER_CLINICAL.search(fold(mark['text'])) and mark['text'].isalpha()):
            overlaps.clear()
    if overlaps:
        return None
    return region


def _isolated_lab_footer(anchor, lines, crop, crop_reason, size, image):
    """Bound signing ink below actual result rows, never a signature-only page."""
    if crop_reason != 'detected_lab_table_header' or image is None:
        return None
    text = fold(anchor['text']).strip()
    if FOOTER_CLINICAL.search(text) or re.search(r'\d',STAFF_TITLE.sub('',text,count=1)):
        return None
    from .rules import resolve
    from .privacy_geometry import blue_ink_bounds
    results = [box for role,box in _lab_headings(lines) if role == 'result']
    rows = []; clinical_rows = 0
    for value in lines:
        x,y = _center(value['box'])
        if not re.fullmatch(r'(?:[<>≤≥]?\s*\d+(?:[.,]\d+)?|positive|negative|am tinh|duong tinh)',
                            fold(value['text']).strip()):
            continue
        if not any(y > head[3] and head[0]-_height(head) <= x <= head[2]+_height(head) for head in results):
            continue
        row = _row(value, lines)
        rows.append(row)
        if any(other['box'][2] <= value['box'][0] and resolve(other['text'], {})[0] for other in row):
            clinical_rows += 1
    if clinical_rows < 2:
        return None
    last_bottom = max(other['box'][3] for row in rows for other in row)
    box = anchor['box']; height = _height(box)
    if box[1] <= last_bottom+height:
        return None
    search = [max(crop[0],box[0]-3*height), max(last_bottom+1,box[1]-5*height),
              min(crop[2],box[2]+3*height), min(crop[3],box[3]+4*height)]
    ink = blue_ink_bounds(image, search)
    if not ink:
        return None
    block = expanded([min(box[0],ink[0]),min(box[1],ink[1]),
                      max(box[2],ink[2]),max(box[3],ink[3])],size,pad=max(4,round(.2*height)))
    if block[1] <= last_bottom:
        return None
    for other in lines:
        if other is anchor or not _overlap(other['box'], block):
            continue
        text = fold(other['text']).strip()
        if not (_name_like(other['text']) or STAFF_TITLE.match(text) or SIGNATURE_LABEL.match(text)):
            return None
        if FOOTER_CLINICAL.search(text) or re.search(r'\d',text):
            return None
        # Do not leave a name partially outside the final block.
        block = expanded([min(block[0],other['box'][0]),min(block[1],other['box'][1]),
                          max(block[2],other['box'][2]),max(block[3],other['box'][3])],size,pad=2)
    if any(other is not anchor and _overlap(other['box'],block)
           and not (_name_like(other['text']) or STAFF_TITLE.match(fold(other['text']))
                    or SIGNATURE_LABEL.match(fold(other['text']))) for other in lines):
        return None
    return block if block[1] > last_bottom else None


def _staff_privacy(lines, crop, crop_reason, size, image):
    masks, reviews, covered = [], [], set()
    for line in lines:
        text = fold(line['text']).strip()
        if not _overlap(line['box'],crop):
            continue
        technician = LAB_TECHNICIAN.fullmatch(text) is not None
        if crop_reason == 'detected_lab_table_header' and (LAB_SIGNER.match(text) or technician):
            block = (_lab_signed_block(line,lines,crop,technician=technician)
                     or _isolated_lab_footer(line,lines,crop,crop_reason,size,image))
            if block:
                masks.append(dict(box=block,reasons=['staff_signature_footer'],line_id=line['line_id']))
            else:
                reviews.append(dict(code='staff_signature_needs_review',box=line['box'],
                                    line_ids=[line['line_id']]))
            continue
        footer_marker = (crop_reason=='detected_panel_table_header'
                         and text.strip(' .:') in {'laboratory','phong xet nghiem'}
                         and _center(line['box'])[1] >= crop[1]+.55*(crop[3]-crop[1]))
        titled = STAFF_TITLE.match(text) and not STAFF_ROLE.match(text)
        if footer_marker or titled or SIGNATURE_LABEL.match(text):
            footer = (_staff_footer(line,lines,crop,crop_reason,image)
                      or _isolated_lab_footer(line,lines,crop,crop_reason,size,image))
            if footer:
                masks.append(dict(box=footer,reasons=['staff_signature_footer'],line_id=line['line_id']))
                covered.update(other['line_id'] for other in lines if _overlap(other['box'],footer))
            else:
                reviews.append(dict(code='staff_signature_needs_review',box=line['box'],
                                    line_ids=[line['line_id']]))
    for line in lines:
        text = fold(line['text']).strip()
        if line['line_id'] in covered or not STAFF_ROLE.match(text):
            continue
        box = line['box']
        raw = re.split(r'[:：]',line['text'],maxsplit=1)
        inline = raw[1].strip() if len(raw)==2 else ''
        right = [other for other in _row(line,lines) if other['line_id'] != line['line_id']
                 and 0 <= other['box'][0]-box[2] <= 2.5*_height(box) and _name_like(other['text'])]
        fields = [line] if _name_like(inline) else [line,right[0]] if not inline and len(right)==1 else []
        if fields:
            if not any(_overlap(a['box'],crop) for a in fields):
                continue
            bounds = [min(a['box'][0] for a in fields),min(a['box'][1] for a in fields),
                      max(a['box'][2] for a in fields),max(a['box'][3] for a in fields)]
            mask = expanded(bounds,size,pad=max(3,round(.12*_height(box))))
            visible = [max(mask[0],crop[0]),max(mask[1],crop[1]),min(mask[2],crop[2]),min(mask[3],crop[3])]
            if not any(other not in fields and _overlap(other['box'],visible) for other in lines):
                masks.append(dict(box=mask,reasons=['staff_name_field'],line_id=line['line_id']))
                continue
            box = bounds
        if crop_reason == 'detected_lab_table_header' and _overlap(box,crop):
            # At a slanted table boundary the usual padded rectangle can touch
            # an adjacent administrative line. Bind it to the local column instead.
            if not fields and _staff_inline_value(inline):
                fields = [line]
            if fields:
                mask = _above_lab_columns(fields, lines, crop, size)
                if mask:
                    masks.append(dict(box=mask,reasons=['staff_name_field'],line_id=line['line_id']))
                    continue
        if _overlap(box,crop):
            reviews.append(dict(code='staff_name_needs_review',box=box,line_ids=[line['line_id']]))
    return masks,reviews


LAB_HEADINGS = (
    ('result', r'(?:ket\s*qua|results?)', None),
    ('test', r'(?:chi\s*dinh|(?:ten\s*)?xet\s*nghiem|tests?(?:\s*name)?)',
     (r'(?:ten\s*)?xet', r'nghiem')),
    ('unit', r'(?:don\s*vi|units?)', None),
    ('reference', r'(?:(?:khoang\s*|gia\s*tri\s*)?tham\s*chieu|reference\s*(?:range|interval))',
     (r'khoang', r'tham\s*chieu')),
    ('procedure', r'(?:quy\s*trinh|procedure|method)', (r'quy', r'trinh')),
    ('instrument', r'(?:thiet\s*bi|instrument)', (r'thiet', r'bi')),
)


def _lab_headings(lines):
    labels = [(line['box'], fold(line['text']).strip(' .:')) for line in lines]
    headings = []
    for role, full, wrapped in LAB_HEADINGS:
        for box, label in labels:
            if re.fullmatch(full, label):
                headings.append((role, box))
            if wrapped is None or not re.fullmatch(wrapped[0], label):
                continue
            for other, suffix in labels:
                overlap = min(box[2], other[2]) - max(box[0], other[0])
                if (overlap > .5 * min(box[2] - box[0], other[2] - other[0])
                        and box[1] < other[1] <= box[3] + .5 * _height(box)
                        and re.fullmatch(wrapped[1], suffix)):
                    headings.append((role, [min(box[0], other[0]), box[1], max(box[2], other[2]), other[3]]))
    return headings


def _lab_header(lines):
    """Require a result heading and two neighboring, distinct column headings."""
    headings = _lab_headings(lines)
    tops = []
    for role, result in headings:
        if role != 'result':
            continue
        columns = [(name, box) for name, box in headings if name != 'result'
                   and (box[2] <= result[0] or box[0] >= result[2])
                   and abs(box[1] - result[1]) <= .7 * _height(result)]
        for (first_role, first), (second_role, second) in combinations(columns, 2):
            if first_role != second_role and (first[2] <= second[0] or second[2] <= first[0]):
                tops.append(min(result[1], first[1], second[1]))
    return min(tops, default=None)


def _lab_header_fallback(lines):
    """Recover a missing result label using columns and repeated result rows."""
    from .rules import resolve
    headings = _lab_headings(lines)
    for role, unit in headings:
        if role != 'unit':
            continue
        refs = [box for name,box in headings if name == 'reference' and box[0] >= unit[2]
                and abs(box[1]-unit[1]) <= _height(unit)]
        tests = [box for name,box in headings if name == 'test' and box[2] < unit[0]
                 and abs(box[1]-unit[1]) <= _height(unit)]
        if len(refs) != 1 or len(tests) != 1:
            continue
        test = tests[0]; reference = refs[0]
        bottom = max(unit[3], test[3], reference[3])
        values = [line for line in lines if line['box'][1] > bottom
                  and test[2] < line['box'][0] < line['box'][2] < unit[0]
                  and re.fullmatch(r'[<>≤≥]?\s*\d+(?:[.,]\d+)?',line['text'].strip())
                  and (line.get('confidence') or 0) >= .90]
        rows = [value for value in values if any(
                other['box'][2] <= value['box'][0] and resolve(other['text'], {})[0]
                for other in _row(value,lines))]
        if len(rows) >= 2 and max(v['box'][1] for v in rows)-min(v['box'][1] for v in rows) > _height(unit):
            return min(test[1],unit[1],reference[1])
    return None


def _staff_inline_value(text):
    without_title = re.sub(r'^(?:cn|bs|ktv|ths)\.\s*', '', text, flags=re.I)
    return _name_like(without_title)


def _above_lab_columns(fields, lines, crop, size):
    """Cover a verified administrative field just above its part of a skewed header."""
    if any((line.get('confidence') or 0) < .90 for line in fields):
        return None
    bounds = [min(line['box'][0] for line in fields), min(line['box'][1] for line in fields),
              max(line['box'][2] for line in fields), max(line['box'][3] for line in fields)]
    mask = expanded(bounds, size, pad=3)
    heights = [line['box'][3] - line['box'][1] for line in fields]
    headings = [box for _, box in _lab_headings(lines) if box[0] < mask[2] and box[2] > mask[0]
                and crop[1] <= box[1] <= crop[1] + 3 * max(heights)]
    if not headings:
        return None
    heading_top = min(box[1] for box in headings)
    if bounds[3] > heading_top:
        return None
    mask[3] = min(mask[3], heading_top)
    return mask


def _skewed_lab_timestamp(line, row, lines, crop, size):
    """Recognize a timestamp beside a collection label with slightly overlapping OCR boxes."""
    if not re.match(r'^\d{1,2}:\d{2}\s+', line['text'].strip()):
        return None
    labels = [other for other in row if (other.get('confidence') or 0) >= .90
              and re.fullmatch(r'(?:gio|ngay)\s*(?:chi\s*dinh|la[yi]\s*ma?u|nha?n\s*ma?u)\s*:',
                               fold(other['text']).strip())
              and other['box'][0] <= line['box'][0]
              and -.5*_height(other['box']) <= line['box'][0]-other['box'][2] <= 2*_height(other['box'])]
    return _above_lab_columns([line], lines, crop, size) if len(labels) == 1 else None


def table_header_anchors(lines):
    anchors=[]
    for line in lines:
        y=_center(line['box'])[1]
        row=[r for r in lines if abs(_center(r['box'])[1]-y)<=max(14,_height(line['box'])*.8)]
        context=' '.join(fold(r['text']) for r in row)
        panel=sum(x in context for x in ['antigen', 'intensity', 'class'])
        pft=sum(bool(re.search(x, context)) for x in [r'upper\s*sd', r'lower\s*sd', r'pred\.?\s*val', r'%\s*pre'])
        sample='sample' in context and 'type' in context and 'amount' in context
        if panel>=2 or pft>=2 or sample:
            anchors.append((min(r['box'][1] for r in row),
                            'panel' if panel>=2 else 'pft' if pft>=2 else 'sample'))
    lab_top = _lab_header(lines)
    if lab_top is None:
        lab_top = _lab_header_fallback(lines)
    if lab_top is not None:
        anchors.append((lab_top, 'lab'))
    return anchors


def _diagnostic_report_crop(lines, size):
    """Find a narrative report between the technique and the signed footer."""
    headings = [(line['box'], fold(line['text']).strip()) for line in lines
                if (line.get('confidence') or 0) >= .80]
    title = r'^ket\s*qua\s*chan\s*doan\b'
    technique = r'^ky\s*thuat\s*:'
    findings = r'^mo\s*ta\s*:'
    impression = r'^ket\s*luan\s*:'
    signature = r'^ba[ce]\s*s[iy]?\s*chuyen\s*khoa\b'
    portal = r'^tra\s*cuu\s*ket\s*qua\b'
    signatures = [box for box, text in headings if re.search(signature, text)]
    if len(signatures) != 1:
        return None
    footer = signatures[0]
    portals = [box[1] for box, text in headings if box[1] > footer[1] and re.search(portal, text)]
    if not portals:
        return None
    bottom = footer[1]
    candidates = [box for box, text in headings if box[3] < bottom and re.search(technique, text)
                  and any(t[3] < box[1] and re.search(title, label) for t, label in headings)]
    if len(candidates) != 1:
        return None
    top = candidates[0][1]
    sections = [(box, text) for box, text in headings if top < box[1] < bottom]
    if not any(a[1] < b[1] for a, text in sections if re.search(findings, text)
               for b, label in sections if re.search(impression, label)):
        return None
    signature_mask = None
    crossing = [line['box'] for line in lines if line['box'][1] < bottom < line['box'][3]]
    if crossing:
        # On skewed pages the impression can extend below the start of the
        # signature label. Retain it only when it lies clearly to the left.
        pad = max(8, (footer[3]-footer[1])//3)
        bottom = max(box[3] for box in crossing) + pad
        signature_mask = [footer[0]-pad, max(top,footer[1]-pad), size[0], bottom]
        if (bottom >= min(portals) or signature_mask[0] <= 0
                or any(box[2] >= signature_mask[0] for box in crossing)
                or any(line['box'] != footer and _overlap(line['box'], signature_mask)
                       for line in lines)):
            return None
    for line in lines:
        box = line['box']
        if signature_mask is not None and box == footer:
            continue
        if box[1] < top < box[3] or box[1] < bottom < box[3]:
            return None
    return [0, top, size[0], bottom], signature_mask


def _ecg_report_crop(lines, size):
    headings = [(line['box'], fold(line['text']).strip()) for line in lines
                if (line.get('confidence') or 0) >= .85]
    titles = [box for box, text in headings if re.fullmatch(r'dien\s*tim\s*thuong', text)]
    techniques = [box for box, text in headings
                  if re.fullmatch(r'ky\s*thuat\s*:\s*d(?:ie|i|e)n\s*tim\s*thuong\.?', text)]
    if len(titles) != 1 or len(techniques) != 1:
        return None
    title, technique = titles[0], techniques[0]
    if title[3] >= _center(technique)[1]:
        return None
    pad = max(4, min(14, _height(technique)//10))
    left = max(0, technique[0]-pad)
    body = sorted((line for line in lines if line['box'] != title
                   and line['box'][0] >= left and line['box'][3] > title[3]),
                  key=lambda line: _center(line['box'])[1])
    section_lines = []
    bottom = technique[3]
    for line in body:
        box = line['box']
        if box[1] > bottom + _height(technique)//2:
            break
        if (line.get('confidence') or 0) < .70:
            return None
        section_lines.append(line)
        bottom = max(bottom, box[3])
    labels = [fold(line['text']).strip() for line in section_lines]
    findings = [i for i, label in enumerate(labels) if re.match(r'^m(?:o)?\s*ta\s*:', label)]
    impression = [i for i, label in enumerate(labels) if re.match(r'^ket\s*lu(?:a)?n\s*:', label)]
    if (not section_lines or section_lines[0]['box'] != technique or len(findings) != 1
            or len(impression) != 1 or not 1 == findings[0] < impression[0]):
        return None
    for i in (findings[0], impression[0]):
        if not labels[i].partition(':')[2].strip(' -'):
            return None
    if any(not label.startswith('-') for i, label in enumerate(labels[2:], start=2)
           if i != impression[0]):
        return None
    crop = [min(left, title[0]), max(0,title[1]-pad),
            min(size[0], max(title[2], *(line['box'][2] for line in section_lines))+pad),
            min(size[1],bottom+pad)]
    if crop[3] >= size[1] or any(_overlap(line['box'], crop) and line not in section_lines
                                and line['box'] != title for line in lines):
        return None
    return crop


def _echo_report_crop(lines, size):
    headings = sorted(((line['box'], fold(line['text']).strip()) for line in lines
                       if (line.get('confidence') or 0) >= .85), key=lambda item: _center(item[0])[1])

    def ordered_boxes(patterns):
        matches = [[box for box, text in headings if re.search(pattern, text)] for pattern in patterns]
        if any(len(boxes) != 1 for boxes in matches):
            return None
        boxes = [boxes[0] for boxes in matches]
        return boxes if all(_center(a)[1] < _center(b)[1] for a, b in zip(boxes, boxes[1:])) else None

    title = r'^sieu\s+am\s+tim,?\s+mang\s+tim\s+qua\s+thanh\b'
    if any(re.search(title, text) for _, text in headings):
        return None
    continuation = ordered_boxes((r'^\d+(?:\s+[<>=]?\d+){5,}\s*(?:/\s*){3,}$',
                                  r'^van\s+d[oa]?ng\s+vung\s+that\s+phai\s*:',
                                  r'^3\.\s*van\s+hai\s+la\b', r'^6\.\s*van\s+ba\s+la\b',
                                  r'^10\.\s*ap\s+l[uv]c\s+dong\s+mach\s+phoi\b',
                                  r'^12\.\s*mang\s+ngo(?:a)?i\s+tim\s*:\s*\S',
                                  r'^14\.\s*chat\s+l[uo]?[eo]?ng\s+hinh\s+anh\s*:',
                                  r'^ket\s*lu(?:a)?n\s*:', r'^so\s+sanh\s+voi\s+sieu\s+am\b',
                                  r'^phat\s+hi(?:e)?n\s+kh(?:a)?n\s+c(?:a)?p\s*/\s*nguy\s+hi(?:e)?m\s*:'))
    if not continuation:
        return None
    start, end = continuation[0], continuation[-1]
    pad = max(5, min(18, _height(start)//4))
    top, bottom = start[1]-pad, end[3]+pad
    if not 0 < top < bottom < size[1]:
        return None
    content = [line['box'] for line in lines if start[1] <= line['box'][1]
               and _center(line['box'])[1] <= _center(end)[1]]
    crop = [max(0,min(box[0] for box in content)-pad), top,
            min(size[0],max(box[2] for box in content)+2*pad), bottom]
    if (crop[0] == 0 or crop[2] == size[0]
            or any(_overlap(line['box'], crop) and (line['box'][1] < top or line['box'][3] > bottom
                   or _center(line['box'])[1] > _center(end)[1]) for line in lines)):
        return None
    return crop


def _echo_measurement_crop(lines, size):
    """Recognize an initial echo report from ordered sections and measurement units."""
    labels = [(line,fold(line['text']).strip()) for line in lines
              if (line.get('confidence') or 0) >= .85]
    patterns = (r'^sieu\s+am\s+tim,?\s+mang\s+tim\s+qua\s+thanh\b',
                r'^ky\s*thuat\s*:', r'^mo\s*ta\s*:',
                r'^chu[r]?c\s+n[a]?ng\s+tam\s+truong\b',
                r'^kich\s+thuoc\s+va\s+chu[r]?c\s+n[a]?ng\s+buong\s+tim\s+ph[a]?i\b')
    matches = [[line for line,text in labels if re.search(pattern,text)] for pattern in patterns]
    if any(len(found) != 1 for found in matches):
        return None
    title, technique, findings, diastolic, right = [found[0] for found in matches]
    ordered = [title,technique,findings,diastolic,right]
    if not all(_center(a['box'])[1] < _center(b['box'])[1] for a,b in zip(ordered,ordered[1:])):
        return None
    top = technique['box'][1]
    content = [line for line in lines if line['box'][1] >= top]
    text = ' '.join(fold(line['text']) for line in content)
    markers = sum(bool(re.search(r'\b'+marker+r'\b',text)) for marker in ('lvedd','lvesd','ef','tapse','lvmi'))
    units = sum(bool(re.search(pattern,text)) for pattern in (r'\bmm\b',r'\bcm/s\b',r'\bml?/m',r'%'))
    if (markers < 3 or units < 2 or not re.search(r'\d',text) or top <= 0
            or any(line is not title and line['box'][1] < top < line['box'][3] for line in lines)):
        return None
    return [0,top,*size]


def _pft_crop_top(lines, top):
    """Exclude a device timestamp above the Pre/Post table headings."""
    titles = [line for line in lines if (line.get('confidence') or 0) >= .90
              and re.fullmatch(r'spirometry\s*[-–]\s*plethysmography', fold(line['text']).strip())
              and line['box'][1] < top < line['box'][3]]
    if len(titles) != 1:
        return top
    title = titles[0]
    row = [line for line in _row(title, lines) if line['box'][0] > title['box'][2]
           and (line.get('confidence') or 0) >= .90]
    dates = [line for line in row if len(date_mentions(line['text'])) == 1
             and _temporal_field_only(line['text'], date_mentions(line['text']))]
    times = [line for line in row
             if re.fullmatch(r'(?:0?[1-9]|1[0-2]):[0-5]\d:[0-5]\d\s+[AP]M',
                             line['text'].strip(), re.I)]
    if len(dates) != 1 or len(times) != 1 or dates[0]['box'][2] > times[0]['box'][0]:
        return top
    candidate = max(dates[0]['box'][3], times[0]['box'][3]) + 4
    if candidate <= top:
        return top
    headers = [line for line in lines if fold(line['text']).strip() in {'pre', 'post'}
               and top <= line['box'][1] <= top+2*_height(title['box'])]
    if {fold(line['text']).strip() for line in headers} != {'pre', 'post'}:
        return top
    if candidate >= min(line['box'][1] for line in headers):
        return top
    if any(line is not title and line not in dates and line not in times
           and line['box'][1] < candidate and top < line['box'][3] for line in lines):
        return top
    return candidate


def _crop(lines, size):
    anchors = table_header_anchors(lines)
    if not anchors:
        report = _diagnostic_report_crop(lines, size)
        if report:
            crop, mask = report
            return crop, 'detected_diagnostic_report_sections', mask
        ecg = _ecg_report_crop(lines, size)
        if ecg:
            return ecg, 'detected_ecg_report_sections', None
        echo = _echo_report_crop(lines, size)
        if not echo:
            echo = _echo_measurement_crop(lines, size)
        if echo:
            return echo, 'detected_echo_report_sections', None
        return [0, 0, *size], 'no_reliable_result_header_keep_page', None
    top, kind=min(anchors)
    top = max(0, round(top)-16)
    if kind == 'pft':
        top = _pft_crop_top(lines, top)
    return [0, top, *size], 'detected_'+kind+'_table_header', None


def outgoing_review_items(lines, crop, masks, crop_reason):
    """Flag lost table headings or visible result labels before automatic send."""
    from .rules import resolve

    if not re.fullmatch(r'detected_\w+_table_header', crop_reason):
        return []
    left, top, right, bottom = crop

    def overlaps(box, other):
        return (max(box[0], other[0]) < min(box[2], other[2])
                and max(box[1], other[1]) < min(box[3], other[3]))

    inside = [line for line in lines if overlaps(line['box'], crop)]
    retained = [line for line in inside if left <= line['box'][0] and top <= line['box'][1]
                and line['box'][2] <= right and line['box'][3] <= bottom
                and not any(overlaps(line['box'], mask['box']) for mask in masks)]
    kind = crop_reason.removeprefix('detected_').removesuffix('_table_header')
    issues = []
    if kind not in {table for _, table in table_header_anchors(retained)}:
        issues.append(dict(code='outgoing_table_header_needs_review', box=crop))
    retained_ids = {line['line_id'] for line in retained}
    result_pattern = LAB_HEADINGS[0][1]
    result_heads = [line['box'] for line in retained
                    if kind == 'lab' and re.fullmatch(result_pattern, fold(line['text']).strip(' .:'))]
    if kind == 'lab' and not result_heads and _lab_header_fallback(retained) is not None:
        headings = _lab_headings(retained)
        result_heads = [[test[2],min(test[1],unit[1]),unit[0],max(test[3],unit[3])]
                        for role,test in headings if role == 'test'
                        for other,unit in headings if other == 'unit' and test[2] < unit[0]
                        and abs(test[1]-unit[1]) <= _height(unit)]
    for line in inside:
        confidence = line.get('confidence')
        if (line['line_id'] in retained_ids or not isinstance(confidence, (int, float))
                or confidence < .90 or line['box'][3] <= top):
            continue
        text = fold(line['text']).strip()
        x, y = _center(line['box'])
        result_cell = re.fullmatch(r'(?:[<>≤≥]?\s*\d+(?:[.,]\d+)?|positive|negative|am tinh|duong tinh|\(\+\))', text)
        under_result = any(y >= h[3] and h[0] - _height(h) <= x <= h[2] + _height(h) for h in result_heads)
        if resolve(line['text'], {})[0] or (result_cell and under_result) or re.fullmatch(
                r'(?:homogeneous|speckled|nucleolar|\d\+)', text):
            issues.append(dict(code='outgoing_result_needs_review', box=line['box'],
                               line_ids=[line['line_id']]))
    return issues


def _x_at(segment, y):
    x0,y0,x1,y1=segment
    return x0+(y-y0)*(x1-x0)/(y1-y0)


def collection_headers(lines):
    """Join wrapped header words, never a title or handwritten cell underneath."""
    allowed={'time','date','of','collection','collected','sampling','sample','specimen',
             'ngay','gio','lay','thu','mau','thoi','gian','and','at'}
    def is_header(r):
        words=re.findall(r'[a-z]+',fold(r['text']))
        return bool(words) and not re.search(r'\d',r['text']) and set(words)<=allowed
    headers=[];seen=set()
    for line in lines:
        if not is_header(line) or not re.search(r'\b(?:time|date|ngay|gio)\b', fold(line['text'])):continue
        b=line['box'];cx,cy=_center(b)
        fragments=[r for r in lines
                   if is_header(r) and min(b[2], r['box'][2])-max(b[0], r['box'][0]) > 0
                   and abs(_center(r['box'])[1]-cy) < 1.6*max(_height(b), _height(r['box']))]
        header=' '.join(fold(r['text']) for r in sorted(fragments,key=lambda r:r['box'][1]))
        if not re.search(r'\b(?:collection|collected|lay\s*mau|thu\s*mau)\b', header):continue
        # A labeled timestamp in an administrative block is not a table column.
        nearby=' '.join(fold(r['text']) for r in lines
                        if abs(_center(r['box'])[1]-cy)<2.3*max(_height(b),_height(r['box'])))
        roles=sum(bool(re.search(pattern,nearby)) for pattern in
                  [r'\bsample\s*type\b|\bloai\s*mau\b',r'\bamount\b|\bluong\s*mau\b|\bthe\s*tich\b',
                   r'\bcell\s*conc\b',r'\bcell\s*loaded\b',r'\bnote\b|\bghi\s*chu\b'])
        if roles<2:continue
        ids=tuple(sorted(r['line_id'] for r in fragments))
        if ids in seen:continue
        seen.add(ids)
        headers.append((line,fragments,ids))
    return headers


def _date_columns(lines, segments, size):
    """Mask only the body of a named collection-time column with two ruled sides."""
    columns=[]; concerns=[]
    for line,fragments,ids in collection_headers(lines):
        b=line['box'];cx,cy=_center(b)
        top=min(r['box'][1] for r in fragments); bottom=max(r['box'][3] for r in fragments)
        candidates=[]
        for seg in segments:
            x0,y0,x1,y1=seg;lo,hi=sorted([y0,y1])
            if y1==y0 or abs(x1-x0)>.10*abs(y1-y0):continue
            if lo>bottom or hi<bottom+1.8*(bottom-top):continue
            if lo>top+_height(b):continue
            candidates.append(seg)
        left=[s for s in candidates if _x_at(s,cy)<min(r['box'][0] for r in fragments)]
        right=[s for s in candidates if _x_at(s,cy)>max(r['box'][2] for r in fragments)]
        if not left or not right:
            concerns.append(dict(code='collection_column_geometry_unresolved', line_ids=list(ids)));continue
        l=max(left,key=lambda s:_x_at(s,cy));r=min(right,key=lambda s:_x_at(s,cy))
        end=min(max(l[1],l[3]),max(r[1],r[3]));start=bottom+1
        # OCR boxes can overlap the previous row. Use the ruled sides' endpoints,
        # never a loose text-box top that could leave the bottom of a date visible.
        merged=[_center(a['box'])[1] for a in lines if a['box'][1]>start+_height(b)
                and a['box'][0]<_x_at(l,a['box'][1]) and a['box'][2]>_x_at(r,a['box'][1])
                and re.match(r'[a-z]',fold(a['text']))
                and not DATE_CONTEXT.search(fold(a['text']))]
        if merged and end>=min(merged):
            concerns.append(dict(code='collection_column_crosses_merged_row',line_ids=list(ids)));continue
        if end-start<1.5*_height(b) or _x_at(r,start)-_x_at(l,start)>size[0]*.45:
            concerns.append(dict(code='collection_column_geometry_unresolved',line_ids=list(ids)));continue
        # Explicit other-column headings inside this column mean a bad boundary.
        other=[a for a in _row(line,lines) if a['line_id'] not in ids
               and _x_at(l,cy)<_center(a['box'])[0]<_x_at(r,cy)]
        if other:
            concerns.append(dict(code='collection_column_contains_other_heading',line_ids=list(ids)));continue
        polygon=[[_x_at(l,start)+1,start],[_x_at(r,start)-1,start],
                 [_x_at(r,end)-1,end],[_x_at(l,end)+1,end]]
        fragments_local=[dict(line_id=a['line_id'],raw=a['text'],box=a['box'],
                              confidence=a.get('confidence')) for a in lines
                         if start<=_center(a['box'])[1]<=end
                         and a['box'][0]<_x_at(r,_center(a['box'])[1])
                         and a['box'][2]>_x_at(l,_center(a['box'])[1])]
        columns.append(dict(polygon=polygon,box=[min(p[0] for p in polygon),start,max(p[0] for p in polygon),end],
                            reasons=['collection_datetime_column'],line_id=None,
                            local_fragments=fragments_local,header_line_ids=list(ids)))
    return columns,concerns


def propose(lines, barcodes, size, *, vertical_segments=(), image=None):
    w,h=size
    for line in lines:
        x0,y0,x1,y1=line['box']
        if not (0<=x0<x1<=w and 0<=y0<y1<=h):raise ValueError('OCR box outside image')
    crop,crop_reason,report_footer_mask=_crop(lines,size);masks=[];dates=[];reviews=[];ignored=[]
    if report_footer_mask:
        masks.append(dict(box=report_footer_mask,reasons=['staff_diagnostic_report_footer'],line_id=None))
    staff_masks,staff_reviews=_staff_privacy(lines,crop,crop_reason,size,image)
    masks.extend(staff_masks)
    reviews.extend(staff_reviews)
    columns,concerns=_date_columns(lines,vertical_segments,size);reviews.extend(concerns)
    for col in columns:
        masks.append({k:v for k,v in col.items() if k not in ('local_fragments','header_line_ids')})
        dates.append(dict(kind='collection_datetime_column',polygon=col['polygon'],
                          raw_fragments=col['local_fragments'],normalized_date=None,
                          requires_review=True,policy='local_only_no_date_repair'))
    for line in lines:
        s=fold(line['text']);reasons=[];row=_row(line,lines)
        # Only a nearby label to the left can qualify another OCR chunk.
        context=s+' '+' '.join(fold(a['text']) for a in row
                                 if a['box'][2]<=line['box'][0] and line['box'][0]-a['box'][2]<4*_height(line['box']))
        header_context = (_date_header_context(line, lines, crop, crop_reason)
                          and bool(_date_token_boxes(line, date_mentions(s,contextual=True), lines, size, image)))
        contextual=bool(DATE_CONTEXT.search(context)) or header_context
        mentions=date_mentions(s,contextual=contextual)
        if IDENTITY.search(s):reasons.append('identity_label')
        if mentions:
            if REFERENCE.search(context):
                ignored.append(dict(code='date_like_reference_value',line_id=line['line_id']))
            elif (crop_reason == 'detected_lab_table_header' and not contextual
                  and _overlap(line['box'], crop) and _temporal_field_only(s, mentions)):
                mask = _skewed_lab_timestamp(line, row, lines, crop, size)
                token_boxes = None if mask else _date_token_boxes(line, mentions, lines, size, image)
                if mask:
                    masks.append(dict(box=mask,reasons=['contextual_calendar_date'],line_id=line['line_id']))
                    dates.append(dict(kind='calendar_date',box=line['box'],raw=line['text'],mentions=mentions,
                                      policy='local_only_no_date_repair',masked_as_date_field=True,
                                      requires_review=any(m['short_year'] for m in mentions)))
                elif token_boxes:
                    masks.extend(dict(box=box,reasons=['calendar_date_token'],line_id=line['line_id'])
                                 for box in token_boxes)
                    dates.append(dict(kind='calendar_date',box=line['box'],raw=line['text'],mentions=mentions,
                                      policy='local_only_no_date_repair',masked_as_date_field=True,
                                      requires_review=True))
                else:
                    reviews.append(dict(code='date_without_context',line_ids=[line['line_id']],box=line['box']))
            elif contextual:
                safe_field=_temporal_field_only(s,mentions)
                token_boxes = _date_token_boxes(line, mentions, lines, size, image) if not safe_field or header_context else None
                if token_boxes:
                    masks.extend(dict(box=box,reasons=['contextual_calendar_date_token'],line_id=line['line_id'])
                                 for box in token_boxes)
                elif safe_field:reasons.append('contextual_calendar_date')
                else:reviews.append(dict(code='date_shares_line_with_other_content',line_ids=[line['line_id']],box=line['box']))
                safe_field = safe_field or bool(token_boxes)
                dates.append(dict(kind='calendar_date',box=line['box'],raw=line['text'],mentions=mentions,
                                  policy='local_only_no_date_repair',masked_as_date_field=safe_field,
                                  requires_review=not safe_field or any(m['short_year'] for m in mentions)))
            else:
                token_boxes = _date_token_boxes(line, mentions, lines, size, image)
                if token_boxes:
                    masks.extend(dict(box=box,reasons=['calendar_date_token'],line_id=line['line_id'])
                                 for box in token_boxes)
                    dates.append(dict(kind='calendar_date',box=line['box'],raw=line['text'],mentions=mentions,
                                      policy='local_only_no_date_repair',masked_as_date_field=True,
                                      requires_review=True))
                else:
                    reviews.append(dict(code='date_without_context',line_ids=[line['line_id']],box=line['box']))
        if EMAIL.search(s):reasons.append('email')
        if PHONE.search(s):reasons.append('phone_like')
        if not reasons:continue
        covered=row if 'identity_label' in reasons else [line]
        box=[min(a['box'][0] for a in covered),min(a['box'][1] for a in covered),
             max(a['box'][2] for a in covered),max(a['box'][3] for a in covered)]
        masks.append(dict(box=expanded(box,size),reasons=reasons,line_id=line['line_id']))
    trusted_boxes=[expanded(c['box'],size,16) for c in barcodes if isinstance(c,dict)
                   and c.get('decoded') is True and c.get('valid') is True and c.get('source')=='zxingcpp']
    for code in barcodes:
        if not isinstance(code,dict):
            reviews.append(dict(code='unverified_barcode',box=list(code)));continue
        if code.get('decoded') is True and code.get('valid') is True and code.get('source')=='zxingcpp':
            masks.append(dict(box=expanded(code['box'],size,16),reasons=['decoded_barcode_or_qr'],line_id=None))
        else:
            a,b,c,d=code['box']
            if any(x<=a and y<=b and c<=u and d<=v for x,y,u,v in trusted_boxes):continue
            reviews.append(dict(code='unverified_barcode',box=code['box'],
                                structural_assessment=code.get('structural_assessment','unknown')))
    merged={}
    for m in masks:
        key=(tuple(m['box']),str(m.get('polygon')))
        if key not in merged:merged[key]=m
        else:merged[key]['reasons']=sorted(set(merged[key]['reasons']+m['reasons']))
    visible=[];resolved=[]
    byid={r['line_id']:r for r in lines}
    staff_boxes = [mask['box'] for mask in staff_masks]
    if report_footer_mask:
        staff_boxes.append(report_footer_mask)
    for review in reviews:
        boxes=[review['box']] if 'box' in review else [byid[i]['box'] for i in review.get('line_ids',[]) if i in byid]
        if review['code'].startswith('staff_') and boxes and all(
                not _overlap(box, crop) or any(
                    left <= max(box[0], crop[0]) and top <= max(box[1], crop[1])
                    and right >= min(box[2], crop[2]) and bottom >= min(box[3], crop[3])
                    for left, top, right, bottom in staff_boxes) for box in boxes):
            resolved.append(review)
            continue
        (visible if not boxes or any(min(b[2],crop[2])>max(b[0],crop[0]) and min(b[3],crop[3])>max(b[1],crop[1]) for b in boxes) else resolved).append(review)
    visible.extend(outgoing_review_items(lines, crop, list(merged.values()), crop_reason))
    return dict(version=VERSION,crop=crop,crop_reason=crop_reason,masks=list(merged.values()),
                dates_local=dates,review_items=visible,resolved_by_crop=resolved,ignored_items=ignored,
                reviewed=False,outbound_allowed=False,
                limitations=['Staff detection needs a role label or an isolated signing block; unlabeled signatures can be missed',
                             'Unresolved dates and unverified barcodes require visual review',
                             'Local dates have not been mapped into CRF fields'])


def render(image, plan):
    """Rasterize masks on a new RGB image; never mutate the source."""
    from PIL import Image,ImageDraw
    crop=plan['crop'];pixels=image.convert('RGB').crop(crop)
    # A converted/cropped Pillow image can inherit source EXIF/ICC metadata.
    result=Image.new('RGB',pixels.size);result.paste(pixels);draw=ImageDraw.Draw(result)
    for mask in plan['masks']:
        if mask.get('polygon'):
            draw.polygon([(round(x-crop[0]),round(y-crop[1])) for x,y in mask['polygon']],fill='white')
        else:
            a,b,c,d=mask['box'];a=max(a,crop[0]);b=max(b,crop[1]);c=min(c,crop[2]);d=min(d,crop[3])
            if a<c and b<d:draw.rectangle((a-crop[0],b-crop[1],c-crop[0]-1,d-crop[1]-1),fill='white')
    return result
