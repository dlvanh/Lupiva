"""Make local synthetic look-alikes and text-free-source answer keys.

Folders are cases. Repeated fields share a sampled profile, not a clinical model.
Unsupported narrative layouts are flagged for visual review, never inferred.
Only the injected/local OCR sees source text; no source text is serialized/logged.
"""
import argparse
from contextlib import redirect_stderr, redirect_stdout
from datetime import date, timedelta
import hashlib
import io
import json
import math
from pathlib import Path
import random
import re
import socket
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
from ocr_pool.privacy_proposal import (STAFF_ROLE, EMAIL, IDENTITY, PHONE, RESULT_VALUE,
    _lab_headings, date_mentions, fold)
from ocr_pool.rules import resolve, unit_key

FONT = 'C:/Windows/Fonts/times.ttf'
FONT_BOLD = 'C:/Windows/Fonts/timesbd.ttf'
EXTENSIONS = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'}
NUMBER = re.compile(r'\d+(?:[.,]\d+)?')
TIME = re.compile(r'(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)')
QUALITATIVE = re.compile(r'\(?[+-]+\)?|o|borderline|equivocal', re.I)
# Baseline units: g/L, G/L, umol/L, mmol/L, mg/L, mm/h, U/L; UPCR g/g.
# Each entry is (usual interval, active-case interval, phenotype flag).
SLE_PROFILE = {
    'IMM11': ((.65, .88), (.30, .64), 'active'),
    'IMM12': ((.10, .16), (.03, .09), 'active'),
    'IMM04': ((35, 85), (90, 220), 'active'),
    'IMM19': ((2, 8), (8, 20), 'active'),
    'IMM20': ((18, 35), (36, 75), 'active'),
    'HEM01': ((3.9, 4.8), (3.0, 3.8), 'anaemia'),
    'HEM02': ((120, 145), (85, 115), 'anaemia'),
    'HEM03': ((82, 95), (78, 92), 'anaemia'),
    'HEM04': ((320, 350), (305, 335), 'anaemia'),
    'HEM05': ((4.0, 7.0), (2.0, 3.8), 'cytopenia'),
    'HEM07': ((1.1, 2.0), (.35, .95), 'cytopenia'),
    'HEM11': ((160, 300), (65, 140), 'platelets'),
    'REN01': ((.05, .18), (.4, 2.5), 'renal'),
    'REN02': ((0, 3), (8, 40), 'renal'),
    'REN03': ((0, 3), (4, 12), 'renal'),
    'REN04': ((3, 6), (6, 10), 'renal'),
    'REN05': ((55, 90), (95, 150), 'renal'),
    'REN09': ((37, 45), (25, 36), 'renal'),
    'GI01': ((16, 32), (33, 50), 'liver'),
    'GI02': ((12, 30), (32, 55), 'liver'),
    'GI03': ((14, 35), (36, 55), 'liver'),
    'MUS01': ((45, 150), (160, 260), 'muscle'),
    'MUS03': ((140, 240), (245, 340), 'active'),
}
LABELS = {
    'name': r'ho\s*(?:va\s*)?ten|ten benh nhan|patient name|full name',
    'dob': r'ngay sinh|date of birth|birth date|dob',
    'sex': r'gioi tinh|sex|gender',
    'age': r'tuoi|age',
    'address': r'dia chi|address',
    'phone': r'dien thoai|so dien thoai|sdt|phone|mobile|tel',
    'record': r'pid|sid|mrn|ma\s*(?:bn|benh nhan|ho so|so)|so ho so|'
              r'patient id|sample id|medical record|record number|cccd|cm[nt]d?|bhyt|passport',
    'staff': r'bac si(?: dieu tri| chi dinh| doc ket qua)?|ky thuat vien|dieu duong|'
             r'nguoi (?:thuc hien|duyet|kiem tra|chi dinh|lay mau|nhan mau|doc ket qua|in ket qua)|'
             r'nhan vien|truong khoa|phu trach(?: khoa)?|doctor|physician|technician|'
             r'(?:ordered|collected|received|performed|verified|approved|reviewed) by',
    'date': r'ngay(?: (?:lay mau|nhan mau|tra ket qua|in|chi dinh|kham|xet nghiem))?|'
            r'gio|date|time|collection date|report date|collected|received|reported|printed',
}
STAFF = re.compile(r'^(?:(?:ths|ts|pgs|gs)\s*[. ]+)*(?:bs|cn|ktv|cki|dr)\s*[. :]', re.I)


def seed_for(*parts):
    return int.from_bytes(hashlib.sha256(json.dumps(parts, ensure_ascii=False,
        separators=(',', ':')).encode('utf-8')).digest()[:16], 'big')


def overlaps(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def bounds(box, size):
    x0, y0, x1, y1 = box
    return [max(0, math.floor(x0)), max(0, math.floor(y0)),
            min(size[0], math.ceil(x1)), min(size[1], math.ceil(y1))]


def valid(box):
    return box[0] < box[2] and box[1] < box[3]


def center(box):
    return ((box[0]+box[2])/2, (box[1]+box[3])/2)


def same_row(line, lines):
    y = center(line['box'])[1]; h = line['box'][3]-line['box'][1]
    return sorted((other for other in lines if abs(center(other['box'])[1]-y)
                   <= max(3, .55*min(h, other['box'][3]-other['box'][1]))),
                  key=lambda other: other['box'][0])


def fake_name(rng, sex):
    surname = rng.choice(('Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'))
    middle = rng.choice(('Thị', 'Ngọc', 'Thu', 'Thanh')) if sex == 'Nữ' else rng.choice(('Văn', 'Đức', 'Hữu', 'Quang'))
    given = rng.choice(('Lan', 'Hương', 'Linh', 'Mai', 'Hà', 'Ngân', 'Thảo', 'Trang')) if sex == 'Nữ' else rng.choice(('Minh', 'Hùng', 'Tuấn', 'Nam', 'Hải', 'Dũng', 'Phong', 'Khánh'))
    return f'{surname} {middle} {given}'


def make_case(folder, seed, k, forbidden=(), source_rows=()):
    """No wall-clock dependency: adult age is relative to 15 June 2026."""
    case_seed = seed_for(seed, str(Path(folder).resolve()), k, 'case')
    rng = random.Random(case_seed); forbidden = set(forbidden)
    folded_forbidden = {fold(value).strip() for value in forbidden}
    sex = 'Nữ' if rng.random() < .88 else 'Nam'
    name = fake_name(rng, sex)
    while fold(name) in folded_forbidden:
        name = fake_name(rng, sex)
    dob = date(2026, 6, 15)-timedelta(days=rng.randint(18*366, 60*365))
    taken_dates = set()
    for text in forbidden:
        for mention in date_mentions(text, contextual=True):
            numbers = [int(n) for n in re.findall(r'\d+', mention['raw'])]
            if len(numbers) == 3:
                year, month, day = numbers if mention['format'] == 'iso' else (numbers[2], numbers[1], numbers[0])
                taken_dates.add((day, month, year % 100))
    while (dob.day, dob.month, dob.year % 100) in taken_dates:
        dob = date(2026, 6, 15)-timedelta(days=rng.randint(18*366, 60*365))
    patient = dict(name=name, sex=sex, dob=dob.isoformat(),
        age=2026-dob.year-((6, 15) < (dob.month, dob.day)),
        address=f'{rng.randint(10, 999)} đường Hoa Sen, phường An Bình, quận Bình An, thành phố An Hòa',
        phone='09'+''.join(str(rng.randrange(10)) for _ in range(8)),
        pid=''.join(str(rng.randrange(10)) for _ in range(10)),
        staff=[rng.choice(('BS.', 'ThS.BS.', 'CN.', 'KTV.', 'CKI.'))+' '+fake_name(rng, rng.choice(('Nam', 'Nữ')))
               for _ in range(5)])
    for key in ('phone', 'pid'):
        while patient[key] in forbidden:
            patient[key] = patient[key][:-1]+str((int(patient[key][-1])+1)%10)
    patient['record_numbers'] = {'10': patient['pid']}
    lengths = {len(value) for value in forbidden if value.isascii() and value.isdigit() and 4 <= len(value) <= 32}
    for length in sorted(lengths-{10}):
        record_rng = random.Random(seed_for(case_seed, 'record', length))
        number = ''.join(str(record_rng.randrange(10)) for _ in range(length))
        while number in forbidden:
            number = number[:-1]+str((int(number[-1])+1)%10)
        patient['record_numbers'][str(length)] = number
    for index, staff in enumerate(patient['staff']):
        while fold(staff) in folded_forbidden:
            staff = rng.choice(('BS.', 'ThS.BS.', 'CN.', 'KTV.', 'CKI.'))+' '+fake_name(rng, rng.choice(('Nam', 'Nữ')))
        patient['staff'][index] = staff
    flags = {key: rng.random() < p for key, p in dict(active=.7, anaemia=.4,
             cytopenia=.55, platelets=.25, renal=.4, liver=.08, muscle=.08).items()}
    profile = {field: rng.uniform(*(active if flags[flag] else usual))
               for field, (usual, active, flag) in SLE_PROFILE.items()}
    wbc = profile['HEM05']; lymph = min(profile['HEM07'], wbc*.42)
    profile.update(HEM07=lymph, HEM08=wbc*.065, HEM09=wbc*.025, HEM10=wbc*.005)
    profile['HEM06'] = wbc-sum(profile[key] for key in ('HEM07', 'HEM08', 'HEM09', 'HEM10'))
    for prefix, count in (('ANA', 23), ('MYO', 16)):
        for i in range(1, count+1):
            likely = prefix == 'ANA' and i in (1, 2, 4, 5, 7, 8) or prefix == 'MYO' and i == 14
            profile[f'{prefix}{i:02}'] = rng.randint(12, 85) if rng.random() < (.78 if likely else .06) else rng.randint(0, 5)
    profile['IMM01'] = 1
    volume = rng.uniform(2.6, 3.7) if sex == 'Nữ' else rng.uniform(3.7, 4.8)
    restriction = rng.uniform(.65, .82) if rng.random() < .25 else rng.uniform(.87, 1.02)
    predicted = dict(PFT01=volume*1.02, PFT02=volume, PFT03=volume*.83,
                     PFT04=82, PFT05=83, PFT06=volume*1.65, PFT07=volume*.65,
                     PFT08=39, PFT09=volume*1.45, PFT10=5.5, PFT11=22)
    for field, value in predicted.items():
        profile[field] = value*(restriction if field not in ('PFT04', 'PFT05', 'PFT08') else rng.uniform(.98, 1.04))
    originals = {}; taken_titers = set()
    for row in source_rows:
        if row['field_id']:
            if row['field_id'] == 'IMM01' and re.fullmatch(r'1:\d+', row['value']['text'].strip()):
                taken_titers.add(int(row['value']['text'].strip().split(':')[1]))
            match = NUMBER.search(row['value']['text'])
            if match:
                originals.setdefault((row['field_id'], unit_key(row['unit'])), set()).add(match[0])
    for field in profile:
        if field.startswith(('ANA', 'MYO')):
            taken = {int(float(v.replace(',', '.'))) for (f, _), values in originals.items()
                     if f == field for v in values}
            n = profile[field]
            choices = list(range(0, 6)) if n <= 5 else list(range(12, 86))
            choices = [candidate for candidate in choices if candidate not in taken]
            if n in taken:
                profile[field] = rng.choice(choices or [candidate for candidate in range(0, 100) if candidate not in taken] or [100])
    shift = rng.choice((-1, 1))*rng.randint(31, 730)
    ana_titer = rng.choice([n for n in (160, 320, 640, 1280, 2560) if n not in taken_titers] or [5120])
    return dict(patient=patient, profile=profile, date_shift_days=shift,
                seed=case_seed, forbidden=forbidden, original_numbers=originals,
                predicted=predicted, ana_titer=ana_titer)


def label_kind(text):
    text = fold(text).strip(' .:：')
    return next((kind for kind, pattern in LABELS.items() if re.fullmatch(pattern, text)), None)


def shift_dates(text, days, *, birthday=None, minutes=0):
    """Retain separators, digit widths, Vietnamese words/case, and time style."""
    out = text
    for mention in reversed(date_mentions(text, contextual=True)):
        a, b = mention['span']; token = text[a:b]
        nums = list(re.finditer(r'\d+', token))
        if len(nums) != 3:
            continue
        pieces = [int(m[0]) for m in nums]
        if mention['format'] == 'iso':
            yy, mm, dd = pieces
        else:
            dd, mm, yy = pieces
            if len(nums[2][0]) == 2:
                yy += 2000
        shifted = birthday or (date(yy, mm, dd)+timedelta(days=days))
        values = (shifted.year, shifted.month, shifted.day) if mention['format'] == 'iso' else (shifted.day, shifted.month, shifted.year)
        for m, value in reversed(list(zip(nums, values))):
            if len(m[0]) == 2 and value > 99:
                value %= 100
            token = token[:m.start()]+str(value).zfill(len(m[0]))+token[m.end():]
        out = out[:a]+token+out[b:]
    def clock(m):
        total = (int(m[1])*60+int(m[2])+minutes) % (24*60)
        seconds = (int(m[3])+17) % 60 if m[3] else None
        return f'{total//60:0{len(m[1])}d}:{total%60:02d}'+(f':{seconds:02d}' if seconds is not None else '')
    return TIME.sub(clock, out)


def digit_shape(text, case, kind):
    if kind == 'phone':
        return case['patient']['phone']
    digits = re.findall(r'\d', text)
    if not digits:
        return None
    n = len(digits); rng = random.Random(seed_for(case['seed'], kind, n))
    value = case['patient']['record_numbers'].get(str(n)) or ''.join(str(rng.randrange(10)) for _ in digits)
    original = ''.join(digits)
    while value == original or value in case['forbidden']:
        value = value[:-1]+str((int(value[-1])+1)%10)
    it = iter(value)
    # Preserve punctuation, never alphabetic fragments of an identifier.
    return ''.join(next(it) if c.isdigit() else c if c in ' -./()+' else '' for c in text)


def replacement(line, reasons, lines, case):
    text = line['text']; s = fold(text).strip(); patient = case['patient']
    if (line.get('confidence') or 0) < .5:
        return None, None
    split = re.match(r'^(.{1,55}?\s*[:：])\s*(.*)$', text)
    if split and not split[2].strip():
        split = None          # a label alone keeps its text; the value cell is replaced separately
    kind = label_kind(split[1]) if split else None
    if split and not kind and STAFF_ROLE.match(fold(split[1]).strip()):
        kind = 'staff'                 # "Người nhận mẫu: CN. X" keeps its role label
    prefix = split[1]+' ' if kind else ''
    value = split[2] if kind else text
    if not kind:
        pure = label_kind(text)
        role = STAFF_ROLE.match(s)
        if pure or (role and not s[role.end():].strip(' .:：')):
            return 'label', text      # "Người nhận mẫu:" alone is a label, not a name
        left = [other for other in same_row(line, lines) if other['box'][2] <= line['box'][0]
                and line['box'][0]-other['box'][2] < 8*(line['box'][3]-line['box'][1])]
        if left:
            kind = label_kind(left[-1]['text'])
    if not kind:
        for candidate, pattern in LABELS.items():
            match = re.match(r'^(?:'+pattern+r')\b\s*', s)
            if match:
                kind = candidate; value = text[match.end():].strip(' :：')
                # "Ngày 11 tháng 06 năm 2026": the label word belongs to the written date.
                if kind in ('date', 'dob') and not date_mentions(value, contextual=True) and date_mentions(text, contextual=True):
                    value = text
                break
    if not kind and (any('staff' in reason for reason in reasons) or STAFF.match(s)):
        kind = 'staff'
    if not kind and PHONE.fullmatch(text.strip()):
        kind = 'phone'
    if not kind and (date_mentions(text, contextual=True) or TIME.search(text)):
        # Only temporal words and numbers can survive this fallback.
        rest = text
        for m in reversed(date_mentions(text, contextual=True)):
            rest = rest[:m['span'][0]]+rest[m['span'][1]:]
        rest = TIME.sub('', rest)
        if not re.sub(r'[\s:.,;/-]', '', rest) or label_kind(rest) == 'date':
            kind = 'date'
    if kind == 'name': new = patient['name']
    elif kind == 'sex':
        new = ('Female' if patient['sex'] == 'Nữ' else 'Male') if s.endswith(('female', 'male')) else patient['sex']
        if new == value:
            new = ('Female' if patient['sex'] == 'Nữ' else 'Male') if new in ('Nữ', 'Nam') else patient['sex']
    elif kind == 'age': new = str(patient['age'])
    elif kind == 'address': new = patient['address']
    elif kind == 'phone': new = digit_shape(value, case, kind) or patient['phone']
    elif kind == 'record': new = digit_shape(value, case, kind)
    elif kind == 'staff': new = patient['staff'][seed_for(case['seed'], line['box'][0]) % len(patient['staff'])]
    elif kind in ('date', 'dob'):
        if not date_mentions(value, contextual=True) and not TIME.search(value):
            return None, None
        new = shift_dates(value, case['date_shift_days'], birthday=date.fromisoformat(patient['dob']) if kind == 'dob' else None,
                          minutes=1+case['seed']%179)
        # A temporal field may include a name or identifier after the date.
        rest = value
        for m in reversed(date_mentions(value, contextual=True)):
            rest = rest[:m['span'][0]]+rest[m['span'][1]:]
        rest = TIME.sub('', rest)
        if re.sub(r'[\s:.,;/-]', '', rest) and label_kind(rest) != 'date':
            return None, None
    else: return None, None
    if not new or new == value or new in case['forbidden']:
        return None, None
    return kind, prefix+new


def paper_ink(image, box):
    x0, y0, x1, y1 = box; pad = max(2, min(7, (y1-y0)//4))
    outer = bounds([x0-pad, y0-pad, x1+pad, y1+pad], image.size)
    pixels = np.asarray(image.crop(outer))
    ring = np.ones(pixels.shape[:2], dtype=bool)
    ring[y0-outer[1]:y1-outer[1], x0-outer[0]:x1-outer[0]] = False
    sample = pixels[ring]; sample = sample[sample.mean(axis=1) >= 145]
    # Never sample dark ink as the replacement background, even in dense stamps.
    paper = tuple(np.median(sample, axis=0).astype(int)) if len(sample) else (245, 245, 240)
    cell = np.asarray(image.crop(box)).reshape(-1, 3)
    dark = cell[cell.mean(axis=1) <= np.percentile(cell.mean(axis=1), 4)]
    ink = tuple(np.median(dark, axis=0).astype(int)) if len(dark) else (35, 35, 35)
    if sum(ink)/3 > 160:
        ink = (35, 35, 35)
    return paper, ink


def fit_text(text, box, font_path):
    width, height = box[2]-box[0], box[3]-box[1]
    for size in range(max(1, round(height*1.45)), 0, -1):
        try:
            font = ImageFont.truetype(str(font_path), size) if font_path else ImageFont.load_default(size=size)
        except (OSError, ValueError, TypeError):
            try: font = ImageFont.load_default(size=size)
            except TypeError: font = ImageFont.load_default()
        try:
            rect = font.getbbox(text)
        except UnicodeEncodeError:
            text = fold(text); rect = font.getbbox(text)
        if rect[2]-rect[0] <= width and rect[3]-rect[1] <= height:
            return text, font, rect
    return text, font, rect


def draw_text(image, source, box, text, font_path):
    box = bounds(box, image.size)
    if not valid(box):
        return False
    paper, ink = paper_ink(source, box)
    tile = Image.new('RGB', (box[2]-box[0], box[3]-box[1]), paper)
    # Match the original glyph height and start, not the looser OCR box.
    gray = np.asarray(source.crop(box).convert('L')).astype(int)
    dark = gray < np.median(gray)-60
    rows, cols = np.flatnonzero(dark.any(axis=1)), np.flatnonzero(dark.any(axis=0))
    left, top, height = 0, None, box[3]-box[1]
    if len(rows) >= 3 and len(cols) >= 2:
        left, top, height = int(cols[0]), int(rows[0]), int(rows[-1]-rows[0]+1)
    fit_box = [box[0]+left, box[1], box[2], box[1]+max(4, height)]
    text, font, rect = fit_text(text, fit_box, font_path)
    y = (top-rect[1]) if top is not None else (tile.height-(rect[3]-rect[1]))/2-rect[1]
    ImageDraw.Draw(tile).text((left-rect[0], y), text, font=font, fill=ink)
    image.paste(tile, (box[0], box[1]))
    return True


def privacy_regions(plan, lines, size):
    masks = list(plan.get('masks', []))
    by_id = {line['line_id']: line for line in lines}
    # The privacy proposal assumes a later crop. We retain the whole sheet, so
    # reviews resolved only by that crop must also be erased/replaced here.
    for review in plan.get('review_items', [])+plan.get('resolved_by_crop', []):
        code = review.get('code', '')
        reason = 'staff_signature' if 'staff_signature' in code else 'staff_name_field' if 'staff' in code else 'synthetic_barcode' if 'barcode' in code else 'unknown_review'
        boxes = [review['box']] if review.get('box') else [by_id[i]['box'] for i in review.get('line_ids', []) if i in by_id]
        masks.extend(dict(box=box, reasons=[reason]) for box in boxes)
    for line in lines:
        text = fold(line['text']); prefix = re.split(r'[:：]', text, maxsplit=1)[0]
        known_label = label_kind(prefix)
        if IDENTITY.search(text) or PHONE.search(text) or EMAIL.search(text) or STAFF.match(text) or known_label:
            if not any(overlaps(line['box'], m['box']) for m in masks):
                masks.append(dict(box=line['box'], reasons=['staff_name_field' if STAFF.match(text) or known_label == 'staff' else 'identity_label']))
    # Dates/times may occur outside privacy-proposal masks (e.g. table stamps).
    for line in lines:
        if re.fullmatch(r'1:\d+', line['text'].strip()) and any(
                (resolve(other['text'], {})[0] or {}).get('field_id') == 'IMM01'
                for other in same_row(line, lines) if other is not line):
            continue
        if date_mentions(line['text'], contextual=True) or TIME.search(line['text']):
            if not any(overlaps(line['box'], m['box']) for m in masks):
                masks.append(dict(box=line['box'], reasons=['synthetic_date'], line_id=line['line_id']))
    regions = []
    for mask in masks:
        box = list(mask['box'])
        if mask.get('polygon'):
            xs, ys = zip(*mask['polygon'])
            box = [min(box[0], *xs), min(box[1], *ys), max(box[2], *xs), max(box[3], *ys)]
        box = bounds(box, size)
        if not valid(box):
            continue
        regions.append(dict(box=box, reasons=mask.get('reasons', []), original=True))
    # A mask intersecting a line must erase the entire line, not leave its tail.
    covered = []; seen = set()
    while True:
        additions = [line for i, line in enumerate(lines) if i not in seen
                     and any(overlaps(line['box'], m['box']) for m in regions)]
        if not additions:
            break
        for line in additions:
            seen.update(i for i, other in enumerate(lines) if other is line)
            reasons = sorted({r for mask in regions if overlaps(line['box'], mask['box']) for r in mask['reasons']})
            regions.append(dict(box=bounds(line['box'], size), reasons=reasons, original=False))
            covered.append(line)
    return regions, covered


def render_privacy(image, source, regions, covered, lines, case, rng, font):
    replaced, painted = [], []; coverage = Image.new('L', image.size)
    coverage_draw = ImageDraw.Draw(coverage)
    # Paint every region first. Overlapping masks can never restore source pixels.
    for region in regions:
        box = region['box']; paper, _ = paper_ink(source, box)
        image.paste(paper, box); coverage_draw.rectangle((box[0], box[1], box[2]-1, box[3]-1), fill=255)
        painted.append(dict(reason='privacy_background', box=box))
    special = []
    for region in regions:
        if not region['original']:
            continue
        reasons = region['reasons']; box = region['box']
        if any('barcode' in r or 'qr' in r for r in reasons):
            kind = 'barcode'
        else:
            # Signature blocks are painted; their printed staff lines are then replaced
            # like other staff text. A drawn scribble made the local proposal ask for review.
            continue
        # Covered OCR extensions are painted but only the original special box is drawn.
        if any(box == existing for existing in special):
            continue
        special.append(box); draw = ImageDraw.Draw(image)
        if kind == 'barcode' and box[2]-box[0] > 4 and box[3]-box[1] > 4:
            x = box[0]+2
            while x < box[2]-2:
                width = rng.randint(1, max(1, (box[2]-box[0])//45))
                draw.rectangle((x, box[1]+2, min(box[2]-2, x+width), max(box[1]+2, box[3]-3)), fill=(25, 25, 25))
                x += width+rng.randint(1, 5)
        elif kind == 'signature':
            w, h = box[2]-box[0], box[3]-box[1]
            points = [(box[0]+w*(i+1)/20, box[1]+h*(.15+.35*rng.random())) for i in range(18)]
            draw.line(points, fill=(25, 65, 155), width=max(1, round(h/50)))
            name_box = [box[0], box[1]+round(h*.6), box[2], box[3]]
            if valid(name_box):
                draw_text(image, source, name_box, case['patient']['staff'][0], font)
        replaced.append(dict(kind=kind, box=box))
    for line in covered:
        if any(overlaps(line['box'], box) for box in special):
            continue
        reasons = sorted({r for region in regions if overlaps(line['box'], region['box']) for r in region['reasons']})
        kind, text = replacement(line, reasons, lines, case)
        if kind == 'label':
            # A recognised label alone is not personal: restore the printed pixels.
            box = bounds(line['box'], image.size)
            if valid(box):
                image.paste(source.crop(box), box[:2])
            continue
        label = re.match(r'^(.{1,55}?\s*[:：])\s*', line['text'])
        if text is not None and label and text.startswith(label[1]) and len(text) > len(label[1]):
            # Keep the printed label pixels (OCR may misspell it) and redraw only the value.
            x0, y0, x1, y1 = bounds(line['box'], image.size); width = (x1-x0)/max(1, len(line['text']))
            split = int(x0+width*(len(label[1])-.5))
            if x0 < split < x1-width:
                image.paste(source.crop((x0, y0, split, y1)), (x0, y0))
                draw_text(image, source, [split+int(width), y0, x1, y1], text[len(label[1]):].strip(), font)
                replaced.append(dict(kind=kind, box=[split, y0, x1, y1], value_text=text))
                continue
        if text is not None:
            draw_text(image, source, line['box'], text, font)
            replaced.append(dict(kind=kind, box=bounds(line['box'], image.size), value_text=text))
        else:
            painted.append(dict(reason='unrecognized_or_low_confidence', box=bounds(line['box'], image.size)))
    missing = sum(not valid(bounds(mask['box'], image.size)) or
                  coverage.crop(bounds(mask['box'], image.size)).getextrema() != (255, 255)
                  for mask in regions)
    return replaced, painted, missing


def is_result(text):
    s = fold(text).strip()
    return bool(RESULT_VALUE.fullmatch(s) or QUALITATIVE.fullmatch(s) or
                re.fullmatch(r'\d{1,3}(?:,\d{3})+(?:\.\d+)?', s) or
                re.fullmatch(r'1:\d+|[<>≤≥]=?\s*\d+(?:[.,]\d+)?(?:\s*[hl*↑↓]+)?', s) or
                re.fullmatch(r'\d+(?:[.,]\d+)?\s*[hl*↑↓]+', s) or
                re.fullmatch(r'\d+\s+(?:negative|positive|borderline|am tinh|duong tinh)', s))


def safe_context(text, kind):
    """Reject merged identity/narrative OCR rather than copy it into a key."""
    s = fold(text).strip()
    if IDENTITY.search(s) or PHONE.search(s) or date_mentions(text, contextual=True):
        return ''
    if kind == 'unit':
        words = set(re.findall(r'[a-z]+', s.replace('µ', 'u').replace('μ', 'u')))
        allowed = {'g', 'mg', 'ug', 'ng', 'pg', 'l', 'dl', 'ml', 'ul', 'fl', 'u', 'iu',
                   'mmol', 'umol', 'mol', 'mm', 'mmhg', 'h', 'min', 'mi', 's', 'coi', 'cells', 'hpf', 'leu'}
        return text if words <= allowed and (words or '%' in text) and len(text) < 40 and re.fullmatch(r'[\wµμ%/^.* −⁻¹²³⁹()+-]+', text) else ''
    words = set(re.findall(r'[a-z]+', s))
    allowed = {'negative', 'positive', 'borderline', 'am', 'tinh', 'duong', 'nam', 'nu',
               'male', 'female', 'normal', 'to', 'den', 'nho', 'hon', 'lon'}
    return text if words <= allowed and len(text) < 100 else ''


def tolerant_resolve(text, context):
    """resolve() on the label, then on parts OCR keeps readable when Vietnamese marks are misread."""
    rule, info = resolve(text, context)
    if rule:
        return rule, info
    plain = fold(text)
    core = re.sub(r'^d\S{0,2}nh\s+l\S{1,4}ng\s+', '', plain)          # "Định lượng" read as "Dinh luęng"
    core = re.sub(r'\s+(?:m\S{0,3}n\s+d\S{0,3}ch|t\S{0,2}\s+\S{0,3}ng).*$', '', core)  # "miễn dịch tự động"
    inner = re.findall(r'\(([^()]+)\)', core)
    for candidate in [core, re.sub(r'\s*[\(\[].*$', '', core), *inner]:
        candidate = candidate.strip(' -#:.')
        if candidate and candidate != plain:
            rule, info = resolve(candidate, context)
            if rule:
                return rule, info
    return None, None


def table_rows(lines):
    """Yield source row geometry for separated lab/panel/PFT columns only."""
    headings = _lab_headings(lines)
    panel_heads = [line for line in lines if fold(line['text']).strip(' .:') == 'intensity']
    groups = []
    for head in panel_heads:
        row = same_row(head, lines)
        roles = {fold(r['text']).strip(' .:'): r['box'] for r in row}
        if 'antigen' in roles and 'class' in roles:
            groups.append(('panel', head['box'], dict(test=roles['antigen'], result=head['box'], class_box=roles['class'])))
    for role, box in headings:
        if role != 'result':
            continue
        local = {r: b for r, b in headings if abs(center(b)[1]-center(box)[1]) <= max(8, (box[3]-box[1])*.8)}
        if 'test' not in local and {'unit', 'reference'} & local.keys():
            # "CHỈ ĐỊNH" and similar test headings are not in LAB_HEADINGS: the test
            # column is everything left of the result column.
            local['test'] = [0, box[1], box[0]-1, box[3]]
        if 'test' in local:
            groups.append(('lab', box, local))
    for role, box in headings:
        if role != 'unit':
            continue
        local = {r: b for r, b in headings if abs(center(b)[1]-center(box)[1]) <= max(8, (box[3]-box[1])*.8)}
        if 'result' not in local and 'test' in local:
            fake = [local['test'][2]+1, box[1], box[0]-1, box[3]]
            if valid(fake):
                groups.append(('lab', fake, local))
    pft_roles = {'pre': 'pre', 'post': 'post', 'meas': 'pre', 'measured': 'pre',
                 'actual': 'pre', 'best': 'pre', '%pre': 'percent_pre', '%post': 'percent_post',
                 '% pre': 'percent_pre', '% post': 'percent_post',
                 'pred.val': 'predicted', 'pred. val': 'predicted', 'predicted': 'predicted'}
    pft_heads = [r for r in lines if fold(r['text']).strip(' .:') in pft_roles]
    for entry in pft_heads:
        box = entry['box']; row = same_row(entry, pft_heads)
        # Do not mistake a prose word such as "best" for a PFT table.
        if len(row) < 2 or not any(resolve(r['text'], dict(panel='pft'))[0] for r in lines if r['box'][1] > box[3]):
            continue
        next_x = min((r['box'][0] for r in row if r['box'][0] > box[0]), default=box[2]+box[2]-box[0])
        roles = dict(test=[0, box[1], min(r['box'][0] for r in row)-1, box[3]],
                     result=box, limit=[next_x, box[1], next_x+1, box[3]])
        groups.append(('pft:'+pft_roles[fold(entry['text']).strip(' .:')], box, roles))
    groups.sort(key=lambda group: group[1][1]); seen = set()
    for index, (kind, head, roles) in enumerate(groups):
        bottom = min((g[1][1] for g in groups[index+1:] if g[1][1] > head[3]), default=float('inf'))
        test = roles['test']; right = roles.get('unit', roles.get('class_box', roles.get('limit', [head[2]+head[2]-head[0]])))[0]
        left = max(test[2], head[0]-(head[2]-head[0])*.5)
        for value in lines:
            box = value['box']; x, y = center(box)
            if not (head[3] < box[1] < bottom and left <= x < right):
                continue
            key = tuple(box)
            if key in seen:
                continue
            row = same_row(value, lines)
            labels = [r for r in row if r['box'][2] <= box[0] and not is_result(r['text'])]
            if not labels:
                continue
            label = labels[0]
            if label['box'][0] > test[2]:
                continue
            def column(role):
                if role not in roles:
                    return None
                b = roles[role]; stops = [other[0] for other in roles.values() if other[0] > b[0]]
                lo = b[0]-max(5, (b[2]-b[0])*.15); hi = min(stops, default=float('inf'))
                candidates = [r for r in row if r is not value and r is not label and lo <= center(r['box'])[0] < hi]
                return candidates[0] if candidates else None
            unit = column('unit'); reference = column('reference'); cls = column('class_box')
            rule, _ = tolerant_resolve(label['text'], {})
            if kind == 'panel':
                titles = [r for r in lines if r['box'][3] <= head[1] and
                          re.search(r'myositis|16\s*(?:ag|antigen)|viem co|ana\s*profile|23\s*(?:ag|antigen)', fold(r['text']))]
                title = max(titles, key=lambda r: r['box'][3])['text'] if titles else ''
                context = dict(panel='myositis' if re.search(r'myositis|16\s*(?:ag|antigen)|viem co', fold(title)) else 'ana_profile_23')
                rule, _ = tolerant_resolve(label['text'], context)
            elif kind.startswith('pft:'):
                rule, _ = tolerant_resolve(label['text'], dict(panel='pft'))
            elif rule is None:
                # Printed urine headings disambiguate RBC/WBC; otherwise CBC labels.
                titles = [r for r in lines if r['box'][3] <= box[1] and
                          re.search(r'nuoc tieu|urinalysis|urine|blood|huyet hoc|cong thuc mau|\bcbc\b', fold(r['text']))]
                title = max(titles, key=lambda r: r['box'][3])['text'] if titles else ''
                urine = bool(re.search(r'nuoc tieu|urinalysis|urine', fold(title)))
                rule, _ = tolerant_resolve(label['text'], dict(specimen='urine' if urine else 'blood', panel='immunocap'))
            seen.add(key)
            printed_unit = safe_context(unit['text'], 'unit') if unit else ''
            pft_column = kind.split(':', 1)[1] if kind.startswith('pft:') else None
            if pft_column:
                suffix = re.search(r'\(([^()]+)\)$', label['text'])
                printed_unit = '%' if pft_column.startswith('percent') else safe_context(suffix[1], 'unit') if suffix else ''
            yield dict(kind='pft' if pft_column else kind, column=pft_column,
                       recognized=is_result(value['text']),
                       label=label, value=value, cls=cls,
                       field_id=rule['field_id'] if rule else None,
                       unit=printed_unit,
                       reference=safe_context(reference['text'], 'reference') if reference else '')


def reference_interval(reference):
    text = fold(reference).strip(); numbers = [float(m[0].replace(',', '.')) for m in NUMBER.finditer(text)]
    if len(numbers) == 2 and re.search(r'[-–—~]|\b(?:to|den)\b', text) and numbers[0] < numbers[1]:
        return numbers[0], numbers[1]
    if len(numbers) == 1 and re.match(r'\s*[<≤]', text):
        return 0, numbers[0]
    if len(numbers) == 1 and re.match(r'\s*[>≥]', text):
        return numbers[0], numbers[0]*1.8+1
    return None


def scaled_profile(field, unit, case):
    value = case['profile'].get(field)
    if value is None:
        return None
    u = unit_key(unit)
    if field in ('IMM11', 'IMM12') and u == 'mg/dl': value *= 100
    if field in ('HEM02', 'HEM04', 'REN09') and u == 'g/dl': value /= 10
    if field in ('HEM06', 'HEM07', 'HEM08', 'HEM09', 'HEM10') and u == '%': value *= 100/case['profile']['HEM05']
    if field == 'REN05' and u == 'mg/dl': value /= 88.4
    if field == 'REN04' and u == 'mg/dl': value *= 6
    if field == 'REN01' and u == 'mg/g': value *= 1000
    if field == 'REN01' and u == 'mg/mmol': value *= 113
    return value


def qualitative_style(original, positive, borderline=False, grade=1):
    s = fold(original)
    if 'tinh' in s:
        text = 'Dương tính' if positive else 'Âm tính'
    elif any(word in s for word in ('positive', 'negative', 'borderline', 'equivocal')):
        text = 'Borderline' if borderline else 'Positive' if positive else 'Negative'
    else:
        if re.fullmatch(r'\([+-]+\)', original.strip()):
            return '(+)' if positive or borderline else '(-)'
        return '(+)' if borderline else '+'*grade if positive else ('O' if original.strip() == 'O' else '0' if original.strip() == '0' else 'o')
    if original.isupper(): return text.upper()
    if original.islower(): return text.lower()
    return text


def format_value(original, value, rng, forbidden=()):
    grouped = re.search(r'\d{1,3}(?:,\d{3})+\.\d+|\d{1,3}(?:,\d{3}){2,}', original)  # '5,200' alone stays a decimal comma
    if grouped:
        # "1,184.5": comma groups thousands, the dot is the decimal mark.
        decimals = len(grouped[0].split('.')[1]) if '.' in grouped[0] else 0
        token = f'{value:,.{decimals}f}'
        while token in set(forbidden) | {grouped[0]}:
            value += 10**-decimals; token = f'{value:,.{decimals}f}'
        return original[:grouped.start()]+token+original[grouped.end():]
    match = NUMBER.search(original)
    if not match:
        return qualitative_style(original, value > .5)
    decimals = len(re.split('[.,]', match[0])[1]) if re.search('[.,]', match[0]) else 0
    quantum = 10**-decimals
    token = f'{value:.{decimals}f}'
    if ',' in match[0]: token = token.replace('.', ',')
    forbidden = set(forbidden) | {match[0]}
    while token in forbidden:
        value = max(0, value+quantum)
        token = f'{value:.{decimals}f}'
        if ',' in match[0]: token = token.replace('.', ',')
    # Preserve comparator, words, spacing and punctuation, but not extra source digits.
    return original[:match.start()]+token+original[match.end():]


def new_value(row, case, rng):
    original = row['value']['text']; field = row['field_id']
    if re.fullmatch(r'1:\d+', original.strip()):
        denominator = case['ana_titer']
        if str(denominator) == original.strip().split(':')[1]:
            denominator *= 2
        return '1:'+str(denominator)
    value = scaled_profile(field, row['unit'], case)
    if row.get('column') and field in case['predicted']:
        predicted = case['predicted'][field]
        if row['column'] == 'predicted':
            value = predicted
        elif row['column'].startswith('percent'):
            value = case['profile'][field]/predicted*100
        if row['column'] in ('post', 'percent_post'):
            value *= 1.025
    if value is None:
        interval = reference_interval(row['reference'])
        if interval:
            lo, hi = interval; span = hi-lo
            value = rng.uniform(lo, hi) if rng.random() < .8 else (max(0, lo-span*.15) if lo > 0 and rng.random() < .5 else hi+span*rng.uniform(.03, .20))
        else:
            match = NUMBER.search(original)
            if match:
                # Shape-only fallback: new digits, same separator/precision.
                token = ''.join(str((int(c)+rng.randint(1, 9))%10) if c.isdigit() else c for c in match[0])
                return original[:match.start()]+token+original[match.end():]
            value = rng.choice((0, 1))
    if not NUMBER.search(original):
        positive = field == 'IMM01' or value > (10 if field and field.startswith(('ANA', 'MYO')) else .5)
        return qualitative_style(original, positive)
    return format_value(original, value, rng, case.get('original_numbers', {}).get((field, unit_key(row['unit'])), ()))


def panel_class(intensity, original):
    borderline = 6 <= intensity <= 10; positive = intensity >= 11
    grade = 1 if intensity <= 25 else 2 if intensity <= 50 else 3
    if re.fullmatch(r'\([+-]+\)', original.strip()):
        original = '+' if positive else 'o'
    return qualitative_style(original, positive, borderline, grade)


def finish_image(image, rng):
    blurred = np.asarray(image.filter(ImageFilter.GaussianBlur(.4))).astype(np.int16)
    noise = np.random.default_rng(rng.getrandbits(64)).normal(0, .45, blurred.shape[:2])
    image = Image.fromarray(np.clip(blurred+noise[:, :, None], 0, 255).astype(np.uint8))
    encoded = io.BytesIO(); image.save(encoded, format='JPEG', quality=95, subsampling=0)
    encoded.seek(0)
    with Image.open(encoded) as decoded:
        return decoded.convert('RGB')


class DiscardOutput:
    def write(self, text): return len(text)
    def flush(self): pass


def quiet_analyze(analyze, image, models):
    # OCR exceptions and Python-level OCR logs may contain recognized identities.
    with redirect_stdout(DiscardOutput()), redirect_stderr(DiscardOutput()):
        return analyze(image, models)


def normalized(text):
    return re.sub(r'\s+', '', fold(text)).replace(',', '.')


def check_page(image, key, analyze, models):
    written = key['values']; failed = 0; matches = 0
    try:
        _, lines = quiet_analyze(analyze, image, models)
        for value in written:
            box = value['value_box']; expected = normalized(value['value_text'])
            nearby = [line for line in lines if overlaps(box, line['box']) and
                      abs(center(box)[1]-center(line['box'])[1]) <= max(5, (box[3]-box[1])*.75)]
            reads = [normalized(line['text']) for line in nearby]
            # OCR may merge intensity and class; accept complete tokens only.
            candidates = reads+[''.join(normalized(line['text']) for line in sorted(nearby, key=lambda r: r['box'][0]))]
            if expected in candidates:
                matches += 1
    except Exception:
        failed = 1
    check = dict(values_written=len(written), values_read_back=matches,
                 mask_regions_uncovered=key.pop('_uncovered'), ocr_errors=failed)
    key['self_check'] = check
    key['needs_visual_check'] = bool(failed or check['mask_regions_uncovered'] or
        matches < .8*len(written) or key['unresolved_rows'] or key.pop('_unsupported', False))


def synthesize_page(source, plan, lines, case, *, source_sha256, seed=0, k=0,
                    font=FONT, font_bold=FONT_BOLD, analyze=None, models=None):
    """Pure in-memory rendering; analyze is injected, including for read-back."""
    page_seed = seed_for(seed, source_sha256, k); rng = random.Random(page_seed)
    source = ImageOps.exif_transpose(source).convert('RGB'); image = source.copy()
    regions, covered = privacy_regions(plan, lines, source.size)
    replaced, painted, missing = render_privacy(image, source, regions, covered, lines, case, rng, font)
    values, unresolved = [], []; detected = 0
    for row in table_rows(lines):
        detected += 1
        cells = [row['value']]+([row['cls']] if row['cls'] else [])
        if any(overlaps(cell['box'], region['box']) for cell in cells for region in regions):
            unresolved.append(dict(label_box=row['label']['box'], value_box=row['value']['box']))
            continue
        if not row['recognized'] or (row['value'].get('confidence') or 0) < .5:
            for cell in cells:
                box = bounds(cell['box'], source.size)
                if valid(box):
                    image.paste(paper_ink(source, box)[0], box)
                    painted.append(dict(reason='unrecognized_result', box=box))
            unresolved.append(dict(label_box=row['label']['box'], value_box=row['value']['box']))
            continue
        row_rng = random.Random(seed_for(case['seed'], row['field_id'] or fold(row['label']['text']),
                                         row['unit'], row.get('column')))
        if row['kind'] == 'panel':
            intensity = case['profile'].get(row['field_id'], row_rng.randint(0, 85))
            intensity = int(intensity)
            old = NUMBER.search(row['value']['text'])
            if old and int(float(old[0].replace(',', '.'))) == intensity:
                intensity = intensity+1 if intensity < 5 or intensity in (11, 26, 51) else intensity-1
            text = str(intensity)
            # Sometimes OCR puts "3 Negative" together in the intensity cell.
            if re.search(r'[a-z]', fold(row['value']['text'])):
                text += ' '+panel_class(intensity, row['value']['text'])
            outputs = [('intensity', row['value'], text)]
            if row['cls']:
                outputs.append(('class', row['cls'], panel_class(intensity, row['cls']['text'])))
            else:
                unresolved.append(dict(label_box=row['label']['box'], value_box=row['value']['box']))
        else:
            outputs = [('result', row['value'], new_value(row, case, row_rng))]
        if row['field_id'] is None:
            unresolved.append(dict(label_box=row['label']['box'], value_box=row['value']['box']))
        for component, cell, text in outputs:
            draw_text(image, source, cell['box'], text, font)
            values.append(dict(field_id=row['field_id'], label_box=row['label']['box'],
                value_box=cell['box'], value_text=text, unit=row['unit'],
                reference=row['reference'], component=component))
            if row.get('column'):
                values[-1]['column'] = row['column']
    unresolved = list({(tuple(r['label_box']), tuple(r['value_box'])): r for r in unresolved}.values())
    key = dict(source_sha256=source_sha256, seed=page_seed, k=k,
        patient=case['patient'], date_shift_days=case['date_shift_days'], values=values,
        replaced=replaced, painted=painted, unresolved_rows=unresolved,
        _uncovered=missing+sum(not valid(bounds(m['box'], source.size)) for m in plan.get('masks', [])),
        _unsupported=not detected or bool(plan.get('review_items') or plan.get('resolved_by_crop')))
    image = finish_image(image, rng)
    if analyze is not None:
        check_page(image, key, analyze, models)
    else:
        key['self_check'] = dict(values_written=len(values), values_read_back=0,
                                mask_regions_uncovered=key.pop('_uncovered'), ocr_errors=1)
        key.pop('_unsupported', None); key['needs_visual_check'] = True
    key.pop('_unsupported', None)
    return image, key


def input_files(inputs, out):
    out = Path(out).resolve(); found = set()
    for item in inputs:
        path = Path(item).resolve()
        candidates = path.rglob('*') if path.is_dir() else [path]
        for candidate in candidates:
            if candidate.is_file() and candidate.suffix.lower() in EXTENSIONS and out not in candidate.parents:
                found.add(candidate)
    return sorted(found, key=lambda path: path.as_posix())


def run(inputs, models, out, *, analyze, seed=0, variants=1, font=FONT, font_bold=FONT_BOLD):
    if variants < 1:
        raise ValueError('variants must be positive')
    out = Path(out); paths = input_files(inputs, out); prepared = {}; errors = 0
    if not paths:
        raise ValueError('No local input images')
    # Gather folder cases before rendering, so avoidance of original identity
    # strings is independent of page enumeration and all pages use one case.
    for index, path in enumerate(paths):
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            with Image.open(path) as opened:
                image = ImageOps.exif_transpose(opened).convert('RGB')
            plan, lines = quiet_analyze(analyze, image, models)
            prepared[path] = (image, plan, lines, digest)
        except Exception:
            errors += 1
            print(f'image {index+1}: local processing failed')
    out.mkdir(parents=True, exist_ok=True)
    summary = ['# Synthetic page summary', '',
        '| Image | Rows replaced | Rows unresolved | Masks replaced/painted | OCR read/written | Uncovered masks | OCR errors | Needs visual check |',
        '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |']
    for index, path in enumerate(paths):
        if path not in prepared:
            summary.append(f'| Image {index+1} (processing failed) | 0 | 0 | 0/0 | 0/0 | 0 | 1 | True |')
    cases = {}; results = []
    folders = sorted({path.parent for path in paths}, key=str)
    folder_tags = {}
    for folder in folders:
        tag = folder.name
        if sum(other.name == tag for other in folders) > 1:
            tag += '-'+hashlib.sha256(str(folder).encode()).hexdigest()[:8]
        folder_tags[folder] = tag
    for path, (source, plan, lines, digest) in prepared.items():
        successful = 0
        for k in range(variants):
            try:
                case_key = (path.parent, k)
                if case_key not in cases:
                    forbidden = []; source_rows = []
                    for other, (_, _, group_lines, _) in prepared.items():
                        if other.parent == path.parent:
                            source_rows.extend(table_rows(group_lines))
                            for line in group_lines:
                                forbidden.extend((line['text'], line['text'].split(':')[-1].strip(),
                                                  re.sub(r'\D', '', line['text'])))
                    cases[case_key] = make_case(path.parent, seed, k, forbidden, source_rows)
                image, key = synthesize_page(source, plan, lines, cases[case_key],
                    source_sha256=digest, seed=seed, k=k, font=font, font_bold=font_bold,
                    analyze=analyze, models=models)
                dest = out/f'{folder_tags[path.parent]}-k{k}'; dest.mkdir(parents=True, exist_ok=True)
                # Preserve the requested stem unless different source extensions collide.
                stem = path.stem
                if sum(p.parent == path.parent and p.stem == stem for p in paths) > 1:
                    stem += '-'+path.suffix[1:].lower()
                image.save(dest/(stem+'.png'))
                (dest/(stem+'.json')).write_text(json.dumps(key, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
                rows = len({tuple(v['label_box']) for v in key['values']})
                check = key['self_check']; ordinal = paths.index(path)+1
                mask_count = len(plan.get('masks', []))
                replaced_count = sum(any(overlaps(mask['box'], entry['box']) for entry in key['replaced'])
                                     for mask in plan.get('masks', []))
                # No source filename/path is included in logs or summary: it may be an identity.
                summary.append(f'| Image {ordinal}, k={k} | {rows} | {len(key["unresolved_rows"])} | '
                    f'{replaced_count}/{mask_count-replaced_count} | {check["values_read_back"]}/{check["values_written"]} | '
                    f'{check["mask_regions_uncovered"]} | {check["ocr_errors"]} | {key["needs_visual_check"]} |')
                results.append(key); successful += 1
            except Exception:
                errors += 1
                summary.append(f'| Image {paths.index(path)+1}, k={k} (processing failed) | 0 | 0 | 0/0 | 0/0 | 0 | 1 | True |')
        print(f'image {paths.index(path)+1}: {successful}/{variants} synthetic variants written'+
              ('; local processing failed' if successful < variants else ''))
    summary.extend(('', f'Processing errors: {errors}.',
        'Review unsupported layouts and unrecognized rows locally before use.'))
    (out/'summary.md').write_text('\n'.join(summary)+'\n', encoding='utf-8')
    return results, errors


def main(argv=None, analyze=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--variants', type=int, default=1)
    parser.add_argument('--font', default=FONT)
    parser.add_argument('--font-bold', default=FONT_BOLD)
    parser.add_argument('inputs', type=Path, nargs='+')
    args = parser.parse_args(argv)
    if args.variants < 1:
        parser.error('--variants must be positive')
    def offline(*args, **kwargs):
        raise RuntimeError('Network is disabled for local synthesis')
    socket.socket.connect = offline
    socket.socket.connect_ex = offline
    socket.create_connection = offline
    socket.socket.sendto = offline
    try:
        if analyze is None:
            from ocr_pool.privacy_ocr import analyze
        _, errors = run(args.inputs, args.models, args.out, analyze=analyze, seed=args.seed,
                        variants=args.variants, font=args.font, font_bold=args.font_bold)
        return int(bool(errors))
    except Exception:
        print('Local synthesis failed')
        return 1


if __name__ == '__main__':
    sys.exit(main())
