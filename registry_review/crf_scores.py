"""Local CRF scoring from the EULAR/ACR and SLEDAI-2K reference tables."""
from collections import defaultdict
from datetime import date
from decimal import Decimal
import re

from registry_pool.dictionary import digest
from ocr_pool.metadata import fold
from ocr_pool.rules import unit_key
from .crf_knowledge import RULES, VERSION as KNOWLEDGE_VERSION
from .references import interval


# 261112_EULAR.docx, in clinical then immunological domain order.
EULAR_DOMAINS = (
    (2,), (3, 4, 4), (2, 3, 5), (2, 2, 4, 6), (5, 6), (6,), (4, 8, 10),
    (2,), (3, 4), (6,),
)
# 261112_SLEDAI-2K.docx. Use the original 10-day assessment window.
SLEDAI_WEIGHTS = (8,) * 8 + (4,) * 6 + (2,) * 7 + (1,) * 3
EULAR_WEIGHTS = tuple(weight for domain in EULAR_DOMAINS for weight in domain)
EULAR_IDS = tuple(f'EAC{i:02}' for i in range(1, len(EULAR_WEIGHTS) + 1))
SLEDAI_IDS = tuple(f'SDA{i:02}' for i in range(1, len(SLEDAI_WEIGHTS) + 1))
GROUPS = {'eular': (EULAR_IDS, EULAR_WEIGHTS, 'EAC22'), 'sledai': (SLEDAI_IDS, SLEDAI_WEIGHTS, 'SDA25')}
SCORE_FIELDS = frozenset((*EULAR_IDS, *SLEDAI_IDS, 'EAC22', 'SDA25'))
RULE_VERSION = 'eular-acr-2019_sledai-2k-10d-v2'
NUMBER = re.compile(r'\d{1,12}(?:[.,]\d{1,12})?')
COUNT_UNIT = re.compile(r'(?:[x×])?10\^?9/l')
EXPLICIT_POSITIVE = {'positive', 'duong tinh', 'strong positive', 'duong tinh manh'}


def assessment_form(dictionary, rules=RULES):
    fields = {field['field_id']: field for field in dictionary['fields']}
    if not SCORE_FIELDS <= fields.keys():
        return {}
    return {group: [dict(field_id=fid, label=fields[fid]['label'], weight=weight,
                         definition=(fields[fid]['source_columns'][3] if group == 'sledai' else ''),
                         knowledge=rules.get(fid))
                    for fid, weight in zip(ids, weights)]
            for group, (ids, weights, _) in GROUPS.items()}


def iso_date(raw):
    if not isinstance(raw, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def low_complement(source, references):
    value = source['value']
    number, units = value.get('numeric_value'), value.get('unit_raw')
    if (not isinstance(number, str) or not NUMBER.fullmatch(number) or not units
            or value.get('comparator') not in (None, '=')):
        return None
    printed = value.get('reference_range_raw')
    raw = references.get(source['selection_id'], {}).get('range') or printed
    limits = interval(raw) if isinstance(raw, str) else None
    if not limits:
        return None
    normal_minimum = limits.split(' – ', 1)[0]
    if ' – ' in limits:
        strict = False
    elif limits.startswith(('> ', '>= ')):
        strict = limits.startswith('> ')
        normal_minimum = limits.split()[1]
    else:
        return None
    lower = Decimal(normal_minimum)
    measured = Decimal(number.replace(',', '.'))
    return measured < lower or (strict and measured == lower)


def matches_rule(source, references, rule):
    value = source['value']
    if (source['review_status'] == 'conflict' or source.get('pending_correction')
            or source['confidence'].get('blockers') or value.get('missing_reason')
            or value.get('result_type') in {'missing', 'unparsed'}):
        return False
    kind = rule['rule']
    field = source['field_id']
    qualitative = fold(value.get('qualitative_value') or '').strip().replace('_', ' ')
    if kind == 'imaging_effusion':
        return qualitative == 'yes' and value.get('extraction_method') == 'local_ocr' and (
            'explicit_report_finding' in (value.get('flags') or ()))
    if kind == 'anti_smith' or field in rule.get('positive_fields', ()):
        raw = ' '.join(fold(value.get('result_raw') or '').split())
        raw = re.sub(r'^\d+(?:[.,]\d+)?\s+', '', raw)
        return qualitative in EXPLICIT_POSITIVE and raw == qualitative
    if kind == 'low_complement':
        return low_complement(source, references) is True
    number = value.get('numeric_value')
    if (not isinstance(number, str) or not NUMBER.fullmatch(number)
            or value.get('comparator') not in (None, '=')):
        return False
    measured = Decimal(number.replace(',', '.'))
    unit = value.get('unit_raw') or ''
    compact_unit = ''.join(unit.casefold().split())
    if kind == 'blood_count':
        # G/L denotes cell count on these reports while g/L denotes mass.
        return bool(not re.fullmatch(r'g\s*/\s*[Ll]', unit.strip())
                    and COUNT_UNIT.fullmatch(unit_key(unit.replace('⁹', '^9')))
                    and measured < Decimal(rule['below']))
    if kind == 'proteinuria':
        limit = rule['above_by_unit'][field].get(compact_unit)
        return limit is not None and measured > Decimal(limit)
    if kind == 'urine_microscopy':
        return compact_unit in {'/hpf', 'cells/hpf', 'cell/hpf', 'tếbào/hpf', rule['cell_unit']} and (
            measured > Decimal(rule['above']))
    if kind == 'antiphospholipid':
        return compact_unit in rule['units_by_field'][field] and measured > Decimal(rule['above'])
    return False


NORMAL_CONFIRMATION = ('Mọi kết quả của chỉ số này trong 10 ngày trước ngày đánh giá đều không đạt ngưỡng. '
                       'Xác nhận không có kết quả bất thường nào khác trong cửa sổ đánh giá.')


def normal_for_rule(source, references, rule):
    """True when a measured value clearly does not meet a SLEDAI-2K laboratory rule.

    Only measured, comparable values qualify: missing, conflicting, unit-incompatible
    or comparator results return False (no claim), never "normal".
    """
    value = source['value']
    if (source['review_status'] == 'conflict' or source.get('pending_correction')
            or source['confidence'].get('blockers') or value.get('missing_reason')
            or value.get('result_type') in {'missing', 'unparsed'}):
        return False
    kind = rule['rule']
    if kind == 'low_complement':
        return low_complement(source, references) is False
    number = value.get('numeric_value')
    if (not isinstance(number, str) or not NUMBER.fullmatch(number)
            or value.get('comparator') not in (None, '=')):
        return False
    measured = Decimal(number.replace(',', '.'))
    unit = value.get('unit_raw') or ''
    compact_unit = ''.join(unit.casefold().split())
    if kind == 'blood_count':
        return bool(not re.fullmatch(r'g\s*/\s*[Ll]', unit.strip())
                    and COUNT_UNIT.fullmatch(unit_key(unit.replace('⁹', '^9')))
                    and measured >= Decimal(rule['below']))
    if kind == 'proteinuria':
        limit = rule['above_by_unit'][source['field_id']].get(compact_unit)
        return limit is not None and measured <= Decimal(limit)
    if kind == 'urine_microscopy':
        return compact_unit in {'/hpf', 'cells/hpf', 'cell/hpf', 'tếbào/hpf', rule['cell_unit']} and (
            measured <= Decimal(rule['above']))
    return False


def normal_proposals(sources, references, assessment_date, rules, positive):
    """Suggest "no" for SLEDAI-2K laboratory items measured normal in the 10-day window.

    SLEDAI-2K scores only the window before the assessment, so a measured normal
    result there is evidence for "no". EULAR/ACR items count any past occurrence
    and never receive a "no" from a single normal result.
    """
    if not assessment_date:
        return {}
    window = defaultdict(list)
    for source in sources:
        if source['kind'] != 'observation' or source['component'] != 'result':
            continue
        stamp = source['value'].get('source_date')
        day = iso_date(stamp[:10]) if isinstance(stamp, str) else None
        if day and 0 <= (assessment_date - day).days <= 10:
            window[source['field_id']].append(source)
    proposals = {}
    for fid, rule in rules.items():
        if (not fid.startswith('SDA') or fid in positive
                or rule.get('rule') not in {'blood_count', 'proteinuria', 'urine_microscopy', 'low_complement'}):
            continue
        present = [field for field in rule['fields'] if window[field]]
        if not present or (rule.get('all_fields') or rule['rule'] == 'low_complement') and len(present) != len(rule['fields']):
            continue
        evidence = [source for field in present for source in window[field]]
        if all(normal_for_rule(source, references, rule) for source in evidence):
            proposals[fid] = dict(value='no', sources=sorted(source['selection_id'] for source in evidence),
                                  reason='Kết quả đo trong cửa sổ đánh giá không đạt định nghĩa: ' + rule['definition'],
                                  requires_confirmation=True, confirmation=NORMAL_CONFIRMATION,
                                  knowledge_version=KNOWLEDGE_VERSION, source_url=rule['source'])
    return proposals


def evidence_proposals(sources, references, assessment_date, rules):
    grouped = defaultdict(lambda: defaultdict(list))
    for source in sources:
        if source['kind'] != 'observation' or source['component'] != 'result':
            continue
        stamp = source['value'].get('source_date')
        day = iso_date(stamp[:10]) if isinstance(stamp, str) else None
        grouped[source['document_id'], day][source['field_id']].append(source)

    proposals = {}
    for fid, rule in rules.items():
        evidence = set()
        for (_, day), findings in grouped.items():
            if rule.get('days') and (not day or not assessment_date
                                     or not 0 <= (assessment_date - day).days <= rule['days']):
                continue
            matched = []
            for field in rule['fields']:
                group = [source for source in findings[field] if matches_rule(source, references, rule)]
                # Repeated laboratory measurements are independent evidence.
                # Preserve the existing guard for contradictory clinical findings.
                if group and (rule['rule'] != 'imaging_effusion' or len(group) == len(findings[field])):
                    matched.append(group)
            if matched and (not rule.get('all_fields') or len(matched) == len(rule['fields'])):
                evidence.update(source['selection_id'] for group in matched for source in group)
        if evidence:
            condition = rule.get('exclude')
            proposals[fid] = dict(value='yes', sources=sorted(evidence), reason=rule['definition'],
                                  requires_confirmation=bool(condition), confirmation=condition,
                                  knowledge_version=KNOWLEDGE_VERSION, source_url=rule['source'])
    proposals.update(normal_proposals(sources, references, assessment_date, rules, set(proposals)))
    return proposals


def evaluate_scores(assessment, sources, references, *, rules=RULES):
    if not isinstance(assessment, dict) or set(assessment) - {'ana', 'date', 'criteria'}:
        raise ValueError('Dữ liệu chấm điểm CRF không hợp lệ.')
    ana = assessment.get('ana', '')
    stamp = assessment.get('date', '')
    criteria = assessment.get('criteria', {})
    if ana not in ('', 'yes', 'no') or (stamp != '' and not iso_date(stamp)):
        raise ValueError('Kiểm tra lại xác nhận ANA hoặc ngày đánh giá SLEDAI-2K.')
    if not isinstance(criteria, dict) or any(
            fid not in SCORE_FIELDS or fid in {'EAC22', 'SDA25'} or value not in ('yes', 'no')
            for fid, value in criteria.items()):
        raise ValueError('Chọn Có hoặc Không cho từng tiêu chí đã đánh giá.')
    if not stamp and any(fid in criteria for fid in SLEDAI_IDS):
        raise ValueError('Nhập ngày đánh giá trước khi chấm các tiêu chí SLEDAI-2K.')
    if criteria.get('EAC19') == 'no' and criteria.get('EAC20') == 'yes':
        raise ValueError('Xem lại C3/C4. Cả hai cùng thấp thì mục C3 hoặc C4 thấp cũng đạt.')
    assessment = dict(ana=ana, date=stamp, criteria=criteria)
    suggestions = evidence_proposals(sources, references, iso_date(stamp), rules)
    values = {}
    summaries = {}
    for group, (ids, weights, total_id) in GROUPS.items():
        recorded = {fid: criteria[fid] for fid in ids if fid in criteria}
        subtotal = sum(weight for fid, weight in zip(ids, weights) if recorded.get(fid) == 'yes')
        reason = ('Cộng trọng số của các tiêu chí được xác nhận Có trong cửa sổ 10 ngày; '
                  'tiêu chí chưa trả lời tính 0 điểm.')
        missing = len(ids) - len(recorded)
        if group == 'eular':
            offset, subtotal, unresolved = 0, 0, 0
            for domain in EULAR_DOMAINS:
                domain_ids = ids[offset:offset + len(domain)]
                scored = max((w for fid, w in zip(domain_ids, domain) if recorded.get(fid) == 'yes'), default=0)
                possible = max((w for fid, w in zip(domain_ids, domain) if recorded.get(fid) != 'no'), default=0)
                subtotal += scored
                unresolved += possible > scored
                offset += len(domain)
            clinical = any(recorded.get(fid) == 'yes' for fid in ids[:17])
            complete = ana == 'yes' and not unresolved
            classification = ('ana_not_met' if ana == 'no' else 'undetermined' if not complete else
                              'meets' if subtotal >= 10 and clinical else
                              'undetermined' if subtotal >= 10 and any(fid not in recorded for fid in ids[:17])
                              else 'does_not_meet')
            summaries[group] = dict(total=subtotal if complete else None, missing=missing,
                                    unresolved_domains=unresolved, classification=classification)
            reason = 'Lấy điểm cao nhất của mỗi nhóm sau khi xác nhận điều kiện ANA.'
        else:
            # As on the paper form, SLEDAI-2K is the sum of the criteria marked present: a
            # criterion left unanswered adds nothing. The count of unanswered ones is kept.
            complete = bool(stamp) and bool(recorded)
            summaries[group] = dict(total=subtotal if complete else None, missing=missing)
        for fid, answer in recorded.items():
            evidence = suggestions.get(fid) if answer == 'yes' else None
            values[fid+'/result'] = dict(value=answer, origin='score_assessment',
                sources=evidence['sources'] if evidence else [],
                reason=evidence['reason'] if evidence else 'Tiêu chí được người duyệt xác nhận.')
            if fid in rules:
                values[fid+'/result'].update(knowledge_version=KNOWLEDGE_VERSION, source_url=rules[fid]['source'])
            if evidence and evidence['confirmation']:
                values[fid+'/result']['confirmation'] = evidence['confirmation']
        if complete:
            evidence = sorted({ref for fid in recorded for ref in values[fid+'/result']['sources']})
            values[total_id+'/result'] = dict(value=str(subtotal), origin='score_calculated',
                                            reason=reason, sources=evidence)
    for slot, item in values.items():
        item['id'] = digest([slot, RULE_VERSION, assessment, item])
    return dict(assessment=assessment, summaries=summaries, suggestions=suggestions,
                values=values, rule_version=RULE_VERSION)
