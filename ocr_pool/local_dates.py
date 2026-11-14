"""Attach explicit dates from local OCR of the exact original image."""
from datetime import datetime
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess

from PIL import Image, ImageOps

from .metadata import DATE_VALUE, fold, normalize_value, select_fact
from .regions import prepare_region
from .workflow import venv_python


_ROLE_LABEL = re.compile(
    # Latin OCR occasionally drops the accented vowel in "mẫu".
    r'(?P<sample_date>\b(?:(?:ngay|gio)\s+lay\s+m(?:a)?u|(?:sample\s+)?collection\s+date|'
    r'date\s+of\s+collection|collected\s+on))\b|'
    r'(?P<measurement_date>\b(?:ngay\s+do|measurement\s+date|date\s+of\s+measurement))\b|'
    r'(?P<other>\b(?:(?:ngay|gio)\s+(?:nhan\s+mau|chi\s+dinh|tra\s+ket\s+qua|sinh)|'
    r'(?:date\s+of\s+birth|received\s+date|report\s+date|date\s+received|ordered\s+date|print\s+date)))\b'
)
_ISO = re.compile(r'\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?')
_LOCAL_FACT_LABELS = (
    ('pid', r'\bpid\b'), ('sid', r'\bsid\b'),
    ('identity_number', r'\b(?:identity\s+number|cmt|cmnd|cccd)\b'),
    ('birth_date', r'\b(?:ngay\s+sinh|date\s+of\s+birth)\b'),
    ('sex', r'\b(?:gioi\s+tinh|sex|gender)\b'),
    ('age', r'\b(?:age|tuoi)\b'),
    ('height', r'\b(?:height|chieu\s+cao)(?:\s*\(cm\))?\b'),
    ('weight', r'\b(?:weight|can\s+nang)(?:\s*\(kg\))?\b'),
    ('ordered_date', r'\b(?:ngay|gio)\s+chi\s+dinh\b'),
    ('received_date', r'\b(?:ngay|gio)\s+nhan\s+mau\b'),
    ('source_diagnosis', r'\b(?:chan\s+doan|diagnosis)\b'),
    ('ordering_provider', r'\b(?:nguoi|ngui)\s+chi\s+dinh\b'),
    ('specimen_collector', r'\b(?:nguoi|ngui)\s+la[yi]\s+mau\b'),
)
_LOCAL_TEXT_KEYS = {'source_diagnosis', 'ordering_provider', 'specimen_collector'}


def _read_scan(folder, source_hash):
    plan = json.loads((folder / 'proposal.json').read_text(encoding='utf-8'))
    ocr = (folder / 'ocr-local.json').read_bytes()
    if (not isinstance(plan, dict) or plan.get('sha256') != source_hash
            or plan.get('ocr_sha256') != sha256(ocr).hexdigest()):
        raise ValueError('Local OCR provenance differs from the uploaded image')
    size, crop = plan['size'], plan['crop']
    lines = json.loads(ocr)['lines']
    if (len(size) != 2 or len(crop) != 4 or not isinstance(plan['crop_reason'], str)
            or any(type(value) is not int for value in [*size,*crop]) or not isinstance(lines, list)
            or not (0 <= crop[0] < crop[2] <= size[0] and 0 <= crop[1] < crop[3] <= size[1])):
        raise ValueError('Invalid local OCR geometry')
    return dict(plan=plan, lines=lines)


def scan_source_dates(workspace, source, doc, scratch):
    """Reuse hash-bound preview OCR or perform a local pass for manual crops."""
    source_hash = doc['input_sha256']
    proposal = doc['privacy'].get('proposal_id')
    if isinstance(proposal, str) and re.fullmatch(r'privacy-[a-f0-9]{32}', proposal):
        root = (workspace / 'research/privacy-proposals').resolve()
        folder = (root / proposal).resolve()
        if folder.is_relative_to(root) and root.is_relative_to(workspace):
            try:
                return 'preview_ocr', _read_scan(folder, source_hash)
            except (OSError, ValueError, KeyError, TypeError):
                pass
    python = venv_python(workspace / '.venv-privacy-trial')
    script = workspace / 'scripts/propose_privacy.py'
    if not python.is_file() or not script.is_file():
        return 'local_ocr_unavailable', None
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        with (scratch / 'local-ocr.log').open('wb') as log:
            subprocess.run([str(python), '-X', 'utf8', str(script), '--source', str(source),
                            '--output', str(scratch / 'proposal.json'), '--models', str(workspace / 'models/privacy')],
                           cwd=workspace, stdout=log, stderr=log, timeout=180, check=True,
                           creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        return 'fresh_local_ocr', _read_scan(scratch, source_hash)
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return 'local_ocr_failed', None


def unmasked_crop_lines(scan, plan):
    """OCR lines visible in the reviewed result crop."""
    left, top, right, bottom = plan['crop']
    masks = list(plan.get('masks', []))
    for polygon in plan.get('mask_polygons', []):
        xs, ys = zip(*polygon)
        masks.append((min(xs), min(ys), max(xs), max(ys)))
    lines = []
    for line in _valid_lines(scan):
        x1, y1, x2, y2 = line['box']
        if (left <= x1 < x2 <= right and top <= y1 < y2 <= bottom
                and not any(x1 < r and x2 > l and y1 < b and y2 > t for l, t, r, b in masks)):
            lines.append(line)
    return lines


def _parse_date(role, raw, label):
    raw = ' '.join(raw.split())
    if _ISO.fullmatch(raw):
        try:
            value = datetime.fromisoformat(raw)
        except ValueError:
            return None, ['invalid_metadata_date']
        return (value.date().isoformat() if len(raw) == 10 else value.isoformat(timespec='seconds')), []
    date = re.search(r'\b(\d{1,2})/\d{1,2}/\d{4}\b', raw)
    vietnamese = fold(label).startswith(('ngay ', 'gio '))
    order = 'DMY' if vietnamese or date and int(date[1]) > 12 else None
    return normalize_value(role, raw, label, {'date_order': order})


def _same_line_right(anchor, lines, *, overlap=0):
    _, top, right, bottom = anchor['box']
    height = bottom - top
    return sorted((line for line in lines if line is not anchor
                   and -overlap * height <= line['box'][0] - right <= 4 * height
                   and abs((line['box'][1] + line['box'][3]) - (top + bottom)) <= height),
                  key=lambda line: line['box'][0])


def _valid_lines(scan):
    width, height = scan['plan']['size']
    return [line for line in scan['lines'] if isinstance(line, dict) and isinstance(line.get('text'), str)
            and isinstance(line.get('box'), list) and len(line['box']) == 4
            and all(type(v) is int for v in line['box'])
            and 0 <= line['box'][0] < line['box'][2] <= width and 0 <= line['box'][1] < line['box'][3] <= height]


def _local_fact_values(scan, header_bottom=None):
    """Read only explicit, labeled background or administrative values locally."""
    lines = _valid_lines(scan)
    if header_bottom is not None:
        lines = [line for line in lines if (line['box'][1] + line['box'][3]) / 2 < header_bottom]
    patterns = [(key, re.compile(pattern)) for key, pattern in _LOCAL_FACT_LABELS]
    for line in lines:
        source = line['text']
        normalized = fold(source)
        if len(source) != len(normalized):
            continue
        matches = [(key, pattern.search(normalized)) for key, pattern in patterns]
        matches = sorted(((key, match) for key, match in matches if match), key=lambda pair: pair[1].start())
        if not matches or normalized[:matches[0][1].start()].strip():
            continue
        key, match = matches[0]
        next_start = min((other.start() for _, other in matches if other.start() > match.start()), default=len(source))
        label_end = match.end()
        if key in {'height', 'weight'}:
            unit = 'cm' if key == 'height' else 'kg'
            suffix = re.match(r'\s*\('+unit+r'\)', normalized[label_end:next_start])
            if suffix:
                label_end += suffix.end()
        label = source[match.start():label_end]
        value = source[label_end:next_start].strip(' :\t')
        box = list(line['box'])
        if not value:
            nearby = _same_line_right(line, lines, overlap=.7)
            if nearby:
                neighbor = nearby[0]
                value = ' '.join(neighbor['text'].split())
                box = [min(box[0], neighbor['box'][0]), min(box[1], neighbor['box'][1]),
                       max(box[2], neighbor['box'][2]), max(box[3], neighbor['box'][3])]
        value = ' '.join(value.split())
        if not value:
            continue
        if key in _LOCAL_TEXT_KEYS:
            parsed, flags = value, ['local_text_ocr_requires_review']
        else:
            parsed, flags = normalize_value(key, value, label, {'date_order': 'DMY'})
        yield dict(key=key, label_raw=label, value_raw=value, value=parsed, flags=flags, box=box)


def date_facts(scan):
    """Return date candidates; only clear header dates can apply to a result table."""
    plan = scan['plan']
    header_top = (plan['crop'][1] if plan['crop_reason'] in
                  {'detected_lab_table_header', 'detected_pft_table_header', 'detected_panel_table_header'} else 0)
    lines = _valid_lines(scan)
    for line in lines:
        text = line['text']
        normalized = fold(text)
        if len(text) != len(normalized):
            continue
        labels = list(_ROLE_LABEL.finditer(normalized))
        for index, match in enumerate(labels):
            role = match.lastgroup
            if role == 'other':
                continue
            label = text[match.start():match.end()]
            end = labels[index+1].start() if index+1 < len(labels) else len(text)
            raw = text[match.end():end].strip(' :\t;')
            box = list(line['box'])
            if not raw and index+1 == len(labels):
                nearby = _same_line_right(line, lines)
                if nearby:
                    neighbor = nearby[0]
                    value_text = ' '.join(neighbor['text'].split())
                    if DATE_VALUE.fullmatch(value_text) or _ISO.fullmatch(value_text):
                        raw = value_text
                        box = [min(box[0], neighbor['box'][0]), min(box[1], neighbor['box'][1]),
                               max(box[2], neighbor['box'][2]), max(box[3], neighbor['box'][3])]
            raw = ' '.join(raw.split())
            label = ' '.join(label.split())
            value, flags = _parse_date(role, raw, label)
            if box[3] > header_top:
                flags.append('local_date_scope_unconfirmed')
            yield dict(key=role, label_raw=label, value_raw=raw, value=value, flags=flags, box=box)


def local_date_evidence(doc, source, scan, run, index):
    """Keep source date crops and text with the bundle, separate from API images."""
    facts = list(date_facts(scan))
    if not facts:
        return [], []
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGB')
    if list(image.size) != scan['plan']['size']:
        raise ValueError('Local OCR dimensions differ from the source')
    for role in ('sample_date', 'measurement_date'):
        selected = [fact for fact in facts if fact['key'] == role]
        if len({fact['value'] for fact in selected if fact['value']}) > 1:
            for fact in selected:
                fact['flags'].append('metadata_conflict')
    candidates, evidence = [], []
    for n, fact in enumerate(facts):
        rid = f'LOCALDATE-{index:04}-{n:03}'
        prefix = fact['label_raw'] + ': '
        raw = prefix + fact['value_raw']
        crop, region = prepare_region(image, {'bbox_xyxy': fact['box']})
        (run/'raw'/(rid+'.txt')).write_text(raw, encoding='utf-8')
        crop.save(run/'crops'/(rid+'.png'))
        evidence.append(dict(evidence_id=rid, document_id=doc['document_id'], evidence_kind='metadata',
            table_id=rid, input_sha256=doc['input_sha256'], table_sha256=sha256(raw.encode('utf-8')).hexdigest(),
            row_index_0based=0, raw_span_0based=[len(prefix),len(raw)], label_raw=fact['label_raw'],
            value_raw=fact['value_raw'], region=region, generation_status='ok', extraction_method='local_ocr',
            mapping_method='local_ocr_date_label', date_type=fact['key']))
        candidates.append(dict(**{k:v for k,v in fact.items() if k!='box'}, candidate_id='MD-'+rid,
            document_id=doc['document_id'], evidence_ids=[rid], extraction_method='local_ocr',
            validation_status='needs_review', review_status='pending', eligible_for_verified_pool=False))
    return candidates, evidence


def local_metadata_evidence(doc, source, scan, run, index):
    """Keep labeled local background and administrative facts out of the API image."""
    boundaries = [box[1] for box in (scan['plan']['crop'], doc['privacy'].get('crop', [0, 0])) if box[1] > 0]
    if not boundaries:
        return [], []
    facts = list(_local_fact_values(scan, min(boundaries)))
    unique = {}
    for fact in facts:
        unique.setdefault((fact['key'], fact['value_raw']), fact)
    facts = list(unique.values())
    for fact in facts:
        if len({item['value'] for item in facts if item['key'] == fact['key'] and item['value'] is not None}) > 1:
            fact['flags'].append('metadata_conflict')
    if not facts:
        return [], []
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert('RGB')
    if list(image.size) != scan['plan']['size']:
        raise ValueError('Local OCR dimensions differ from the source')
    candidates, evidence = [], []
    for n, fact in enumerate(facts):
        rid = f'LOCALMETA-{index:04}-{n:03}'
        prefix = fact['label_raw'] + ': '
        raw = prefix + fact['value_raw']
        crop, region = prepare_region(image, {'bbox_xyxy': fact['box']})
        (run/'raw'/(rid+'.txt')).write_text(raw, encoding='utf-8')
        crop.save(run/'crops'/(rid+'.png'))
        evidence.append(dict(evidence_id=rid, document_id=doc['document_id'], evidence_kind='metadata',
            table_id=rid, input_sha256=doc['input_sha256'], table_sha256=sha256(raw.encode('utf-8')).hexdigest(),
            row_index_0based=0, raw_span_0based=[len(prefix), len(raw)], label_raw=fact['label_raw'],
            value_raw=fact['value_raw'], region=region, generation_status='ok', extraction_method='local_ocr',
            mapping_method='local_ocr_explicit_label'))
        candidates.append(dict(**{k:v for k,v in fact.items() if k!='box'}, candidate_id='MD-'+rid,
            document_id=doc['document_id'], evidence_ids=[rid], extraction_method='local_ocr',
            validation_status='needs_review' if fact['flags'] else 'structure_checks_passed',
            review_status='pending', eligible_for_verified_pool=False))
    return candidates, evidence


def observation_date(facts, table_kind):
    if table_kind == 'pft':
        return select_fact(facts, 'measurement_date')
    if table_kind in {'general_lab', 'cbc', 'immunoblot'}:
        return select_fact(facts, 'sample_date')
    return None
