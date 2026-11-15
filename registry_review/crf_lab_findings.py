"""Local lab-derived finding proposals from the versioned knowledge pool.

Every proposal is a 'yes' suggestion that still needs the doctor's confirmation.
Only current sources passing the same guards as crf_scores.matches_rule are used;
missing data is never treated as negative and incompatible units are skipped.
"""
from collections import defaultdict
from decimal import Decimal
import re

from .crf_knowledge import LAB_FINDINGS_VERSION
from .crf_scores import NUMBER, iso_date, matches_rule
from .references import interval

REUSABLE = {'blood_count', 'proteinuria', 'urine_microscopy'}
MASS_UNIT = re.compile(r'g\s*/\s*(?:d)?[Ll]')
DECILITRE = re.compile(r'g\s*/\s*d[Ll]')


def usable(source):
    value = source['value']
    return not (source['review_status'] == 'conflict' or source.get('pending_correction')
                or source['confidence'].get('blockers') or value.get('missing_reason')
                or value.get('result_type') in {'missing', 'unparsed'})


def measured(source):
    value = source['value']
    number = value.get('numeric_value')
    if (not isinstance(number, str) or not NUMBER.fullmatch(number)
            or value.get('comparator') not in (None, '=')):
        return None
    return Decimal(number.replace(',', '.'))


def compact_unit(source):
    return ''.join((source['value'].get('unit_raw') or '').casefold().split()).replace('²', '2')


def above_reference(source, references):
    """True when the value is above the printed or confirmed upper reference limit."""
    number = measured(source)
    if number is None:
        return False
    value = source['value']
    raw = references.get(source['selection_id'], {}).get('range') or value.get('reference_range_raw')
    limits = interval(raw) if isinstance(raw, str) else None
    if not limits:
        return False
    if ' – ' in limits:
        upper, strict = limits.split(' – ', 1)[1], False
    elif limits.startswith(('< ', '<= ')):
        upper, strict = limits.split()[1], limits.startswith('< ')
    else:
        return False
    limit = Decimal(upper)
    return number > limit or (strict and number == limit)


def hemoglobin(source, criterion):
    # g/L is mass; G/L is a cell-count scale and never a haemoglobin unit.
    unit = (source['value'].get('unit_raw') or '').strip()
    if not MASS_UNIT.fullmatch(unit):
        return False
    number = measured(source)
    if number is None:
        return False
    if DECILITRE.fullmatch(unit):
        number *= 10
    return number < Decimal(criterion['below'])


def matches(source, references, criterion):
    if not usable(source):
        return False
    kind = criterion['kind']
    if kind == 'positive':
        return matches_rule(source, references, dict(rule='anti_smith'))
    if kind in REUSABLE:
        rule = dict(rule=kind)
        for key in ('below', 'above', 'cell_unit', 'above_by_unit'):
            if key in criterion:
                rule[key] = criterion[key]
        return matches_rule(source, references, rule)
    if kind == 'hemoglobin':
        return hemoglobin(source, criterion)
    if kind == 'above_reference':
        return above_reference(source, references)
    number = measured(source)
    if number is None or compact_unit(source) not in criterion['units']:
        return False
    if kind == 'below':
        return number < Decimal(criterion['below'])
    if kind == 'above':
        return number > Decimal(criterion['above'])
    if kind == 'at_least':
        return number >= Decimal(criterion['at_least'])
    return False


def in_window(source, assessment_date, days):
    stamp = source['value'].get('source_date')
    day = iso_date(stamp[:10]) if isinstance(stamp, str) else None
    return bool(day) and 0 <= (assessment_date - day).days <= days


def lab_finding_proposals(workspace, references, rules, assessment_date=None):
    from .crf import current_sources

    by_slot = defaultdict(list)
    for source in current_sources(workspace):
        if source['kind'] == 'observation':
            by_slot[source['field_id'], source['component']].append(source)

    proposals = {}
    for target, rule in rules.items():
        # A directly recorded answer on the target field takes precedence.
        if by_slot[target, 'result']:
            continue
        if rule.get('days') and assessment_date is None:
            continue
        matched = []
        for criterion in rule['criteria']:
            for source in by_slot[criterion['field'], criterion.get('component', 'result')]:
                if rule.get('days') and not in_window(source, assessment_date, rule['days']):
                    continue
                if matches(source, references, criterion):
                    matched.append((criterion, source))
        if not matched:
            continue
        first = matched[0][0]
        proposal = dict(value='yes',
                        sources=sorted({source['selection_id'] for _, source in matched}),
                        reason=rule['definition'], requires_confirmation=True,
                        confirmation=rule['confirmation'], origin='knowledge_rule',
                        knowledge_version=LAB_FINDINGS_VERSION,
                        source_url=first.get('source', rule.get('source')))
        proposals[target + '/result'] = proposal
        details = [criterion['detail'].format(v=source['value'].get('numeric_value') or '',
                                              unit=source['value'].get('unit_raw') or '')
                   for criterion, source in matched if 'detail' in criterion]
        if details and not by_slot[target, 'detail']:
            proposals[target + '/detail'] = dict(proposal, value='; '.join(details))
    return proposals