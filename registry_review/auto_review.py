"""Which extracted values local OCR confirmed and may be approved as a group.

This only labels values. It never writes a review decision: the approval receipt
still needs a person (``CRFReview.approve``). The conditions are checkable facts,
not a model's own certainty, and any doubt leaves the value for a person.
"""
from collections import Counter

from .confidence import LLM_FLAGS, LLM_METHODS

VERSION = 'auto-review-1'
MATCH_FLAG = 'ocr_number_matches'
# Spirometry has several numeric columns per row and no single result header.
EXCLUDED = ('PFT',)
COMPONENTS = {'result', 'intensity', 'absolute_count', 'percentage'}


def assess_auto(candidate):
    value = candidate['value']
    reasons = []
    flags = set(value.get('flags') or [])
    if candidate['kind'] != 'observation' or value.get('extraction_method') not in LLM_METHODS:
        reasons.append('not_an_extracted_result')
    if value.get('result_type') not in {'numeric', 'mixed'}:
        reasons.append('not_a_number')
    if MATCH_FLAG not in flags:
        reasons.append('ocr_not_confirmed')
    if flags - LLM_FLAGS - {MATCH_FLAG}:
        reasons.append('has_warning')
    if str(candidate.get('field_id') or '').startswith(EXCLUDED) or candidate.get('component') not in COMPONENTS:
        reasons.append('section_needs_person')
    if value.get('result_type') == 'numeric' and candidate.get('component') != 'intensity' and not value.get('unit_raw'):
        reasons.append('missing_unit')
    confidence = candidate.get('confidence') or {}
    if confidence.get('blockers') or confidence.get('tier') != 'unverified':
        reasons.append('review_priority')
    if candidate.get('review_status') != 'pending' or candidate.get('pending_correction'):
        reasons.append('review_in_progress')
    return dict(eligible=not reasons, reasons=reasons)


def mark_auto_review(candidates):
    """Label current candidates; a slot read more than once always needs a person."""
    current = [c for c in candidates if c.get('current_revision') and not c.get('prior_ocr')]
    slots = Counter((c.get('field_id'), c.get('component')) for c in current if c['kind'] == 'observation')
    for item in current:
        result = assess_auto(item)
        if item['kind'] == 'observation' and slots[item.get('field_id'), item.get('component')] > 1:
            result['reasons'].append('repeated_result')
            result['eligible'] = False
        item['auto_review'] = result
