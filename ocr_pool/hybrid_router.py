"""Experimental flow C (hybrid): local OCR first, the LLM API only for pages OCR cannot settle.

Pure decision rules, kept separate from the existing flows:
  flow A  direct LLM            (ocr_pool.llm_workflow with LUPIVA_PROTOTYPE_DIRECT_LLM)
  flow B  OCR -> mask -> LLM    (scripts/run_llm_pool.py)
  flow C  hybrid                (scripts/run_hybrid_pool.py, this module)

A page is accepted from local OCR only when every value it produced is complete and
unflagged; anything doubtful goes to flow B for that page. A specialist still reviews
every value afterwards, so the rules favour sending a page on rather than keeping a
weak local reading.
"""

MIN_VALUES = 3


def local_decision(observations, issues, *, min_values=MIN_VALUES):
    """Return (accept, reasons) for one document's local OCR output."""
    reasons = []
    if len(observations) < min_values:
        reasons.append('too_few_values')
    if issues:
        reasons.append('local_issue')
    for obs in observations:
        if obs.get('extraction_status') != 'found':
            reasons.append('value_not_found')
        if obs.get('flags'):
            reasons.append('value_flagged')
        if obs.get('source_warning'):
            reasons.append('source_warning')
        if obs.get('result_type') == 'numeric':
            if obs.get('numeric_value') in (None, ''):
                reasons.append('number_not_parsed')
            if not obs.get('unit_raw'):
                reasons.append('missing_unit')
        elif not (obs.get('qualitative_value') or obs.get('result_raw')):
            reasons.append('empty_result')
    reasons = sorted(set(reasons))
    return not reasons, reasons


def route(pool, document_ids, *, min_values=MIN_VALUES):
    """Route each document of a local candidate pool: 'local' or 'api', with reasons."""
    by_doc = {d: [] for d in document_ids}
    for obs in pool.get('observations', []):
        by_doc.setdefault(obs.get('document_id'), []).append(obs)
    issues = {}
    for issue in pool.get('issues', []):
        issues.setdefault(issue.get('document_id'), []).append(issue)
    routes = {}
    for doc in document_ids:
        accept, reasons = local_decision(by_doc.get(doc, []), issues.get(doc, []), min_values=min_values)
        routes[doc] = dict(route='local' if accept else 'api', reasons=reasons,
                           local_values=len(by_doc.get(doc, [])))
    return routes
