"""Explainable review triage; never approve or estimate uncalibrated accuracy."""
from collections import Counter
from decimal import Decimal, InvalidOperation
import re

VERSION = 'source-review-priority-3'
LLM_METHODS = {'gemini_api', 'tokenharbor_api'}
LLM_FLAGS = {method+'_extraction' for method in LLM_METHODS}
BENIGN = {'outside_word_catalog', 'explicit_source_result_flag', *LLM_FLAGS,
          'explicit_method_from_test_name', 'explicit_method_row_continuation',
          'source_placeholder', 'ocr_number_matches'}
WATCH = {
    'crf_hb_qualifier_missing': 'Kiểm tra nhãn có Hb. Kết quả này đang được giữ ngoài trường CRF hiệu chỉnh Hb.',
    'source_row_box_reused': 'AI trả cùng vùng cho nhiều dòng. Đối chiếu hàng trực tiếp trên ảnh.',
    'local_date_scope_unconfirmed': 'Chưa xác định ngày này áp dụng cho nhóm kết quả nào.',
    'class_symbol_ocr_variant': 'Ký hiệu phân loại được chuẩn hóa từ biến thể OCR; nên đối chiếu vùng ảnh.',
    'ocr_method_spelling_variant': 'Tên phương pháp có biến thể chính tả OCR.',
}
BLOCK = {
    'numeric_value_conflicts_with_raw_result': 'Giá trị số mâu thuẫn với kết quả nguyên văn.',
    'source_header_conflicts_with_column': 'Vai trò cột không khớp tiêu đề đã đọc.',
    'class_without_printed_column': 'Có ký hiệu Class nhưng chưa có bằng chứng cột Class.',
    'component_conflicts_with_source_column': 'Thành phần dữ liệu không khớp cột nguồn.',
    'patient_identity_conflict': 'Thông tin định danh giữa các ảnh của hồ sơ không thống nhất.',
    'conflicting_source_results': 'Cùng xét nghiệm có các kết quả nguồn khác nhau.',
    'metadata_conflict': 'Thông tin nguồn có giá trị mâu thuẫn.',
    'source_date_conflict': 'Ngày nguồn mâu thuẫn.',
    'unit_mismatch': 'Đơn vị chưa khớp với xét nghiệm.',
    'missing_unit': 'Thiếu đơn vị cần thiết để diễn giải số.',
    'unparsed_result': 'Kết quả chưa chuyển được thành giá trị có cấu trúc.',
    'unreadable_result': 'Kết quả có phần chưa đọc rõ.',
    'unresolved_class_symbol': 'Chưa xác định được ý nghĩa ký hiệu phân loại.',
    'intensity_class_mismatch': 'Cường độ và phân loại không khớp chú giải nguồn.',
    'handwritten_source_requires_review': 'Nội dung viết tay cần đối chiếu.',
    'source_statement_not_confirmed_diagnosis': 'Chẩn đoán trên phiếu cần người xác nhận.',
    'ordering_provider_role_requires_review': 'Cần xác nhận vai trò người chỉ định.',
    'source_conclusion_not_clinical_assessment': 'Kết luận nguồn cần người xác nhận.',
}


def assess(candidate, evidence):
    """Evaluate the *presented* value, while keeping extraction provenance.

    Scores rank workload only. Region token confidence is a coarse signal;
    absent signals on old runs must never be filled with invented values.
    """
    value = candidate['value']
    reasons = []
    score = 100

    def add(code, message, severity='warning', penalty=15):
        nonlocal score
        if any(r['code'] == code for r in reasons):
            return
        reasons.append(dict(code=code, message=message, severity=severity))
        score -= penalty

    flags = set(value.get('flags', []))
    llm = (value.get('extraction_method') in LLM_METHODS or bool(LLM_FLAGS & flags)
           or any(e.get('extraction_method') in LLM_METHODS for e in evidence))
    lab = value.get('value') if candidate.get('metadata_key') == 'additional_lab_result' else None
    typed = [value] if candidate['kind'] == 'observation' else []
    if isinstance(lab, dict):
        typed = list(lab.get('parsed_results', {}).values())
        if not typed:
            add('missing_typed_slots', 'Kết quả bổ sung chưa có các ô giá trị được phân tích.', 'block', 60)
    for part in typed:
        flags.update(part.get('flags', []))
        annotation = part.get('grade_annotation')
        if llm and isinstance(annotation, dict) and annotation.get('writing_style') in {'handwritten', 'unclear'}:
            add('llm_grade_style_review', 'Đối chiếu kiểu chữ của grade với ảnh nguồn.', penalty=25)
        kind = part.get('result_type')
        if kind in {'unparsed', None}:
            add('unparsed_value', 'Chưa phân tích được kiểu giá trị.', 'block', 60)
        elif kind == 'missing' and part.get('missing_reason') != 'source_placeholder':
            add('unreadable_value', 'Giá trị chưa đọc được.', 'block', 60)
        if kind in {'numeric', 'mixed'}:
            try:
                numeric = Decimal(part.get('numeric_value', ''))
                if not numeric.is_finite() or part.get('comparator') not in {'=', '<', '<=', '>', '>='}:
                    raise ValueError
            except (InvalidOperation, TypeError, ValueError):
                add('invalid_numeric', 'Giá trị số hoặc dấu so sánh chưa hợp lệ.', 'block', 60)
        required = {'qualitative': 'qualitative_value', 'pattern': 'pattern_raw',
                    'semiquantitative': 'symbolic_value', 'mixed': 'qualitative_value'}.get(kind)
        if required and not part.get(required):
            add('missing_typed_value', 'Thiếu thành phần của giá trị có cấu trúc.', 'block', 60)
    if candidate['kind'] == 'metadata' and not isinstance(lab, dict) and value.get('value') in (None, ''):
        add('empty_metadata', 'Thông tin nguồn còn trống.', 'block', 60)
    if candidate['kind'] == 'specimen':
        add('specimen_review', 'Thông tin thu mẫu cần đối chiếu lượng, thời gian và ô đánh dấu.', penalty=25)
    for flag in sorted(flags):
        if flag in BLOCK:
            add(flag, BLOCK[flag], 'block', 50)
        elif flag in WATCH:
            add(flag, WATCH[flag])
        elif flag not in BENIGN:
            add(flag, 'Có cờ cần kiểm tra: '+flag, penalty=25)
    if candidate.get('pending_correction'):
        add('pending_correction', 'Có đề xuất sửa chưa được quyết định.', 'block', 60)
    if candidate.get('review_status') in {'conflict', 'needs_clarification', 'reject'}:
        add('review_attention', 'Quyết định hiện tại yêu cầu xem lại hoặc loại.', 'block', 60)
    if value.get('transcription_method') == 'assistant_visual_transcription':
        add('assistant_transcription', 'Giá trị do trợ lý chép từ ảnh, cần người xác nhận.', 'block', 60)
    if not evidence:
        add('missing_evidence', 'Chưa có bằng chứng nguồn liên kết.', 'block', 60)
    elif any(not e.get('table_sha256') or not e.get('region') for e in evidence):
        add('incomplete_evidence', 'Bằng chứng chưa đủ vùng ảnh hoặc dấu vết kiểm tra.', penalty=25)
    signals = [e['ocr_confidence'] for e in evidence if isinstance(e.get('ocr_confidence'), dict)]
    if llm:
        add('llm_source_review', 'Kết quả LLM cần được đối chiếu với ảnh nguồn.', 'info', 0)
    elif not signals:
        add('ocr_signal_unavailable', 'Lượt OCR này chưa lưu tín hiệu chắc chắn từ mô hình.', 'info', 10)
    elif any(s.get('p10_token_probability', 0) < .5 or
             s.get('low_probability_token_fraction', 1) > .1 for s in signals):
        add('uncertain_ocr_region', 'Vùng OCR có nhiều ký tự mô hình chưa chắc chắn.', penalty=25)
    if any(e.get('generation_status') not in (None, 'ok') or e.get('truncated') for e in evidence):
        add('incomplete_ocr_region', 'Bằng chứng OCR chưa hoàn chỉnh.', 'block', 60)
    score = max(0, score)
    blockers = [r['code'] for r in reasons if r['severity'] == 'block']
    if blockers or score < 50:
        tier = 'low'
    elif score < 80 or llm and any(r['severity'] == 'warning' for r in reasons):
        tier = 'medium'
    else:
        tier = 'unverified' if llm else 'high'
    placeholder = bool(typed) and all(p.get('result_type') == 'missing' and
                       p.get('missing_reason') == 'source_placeholder' for p in typed)
    return dict(version=VERSION, score=score, score_kind='rule_priority_not_probability', tier=tier,
        probability_correct=None, calibrated=False, auto_accept_eligible=False, llm=llm,
        placeholder=placeholder, reasons=reasons, blockers=blockers,
        ocr_signal_available=bool(signals), ocr_signal_granularity='region' if signals else None,
        human_verified=candidate.get('review_status') == 'accepted')


def summary(candidates):
    pending = [c for c in candidates if c.get('current_revision') and
               (c['review_status'] != 'accepted' or c.get('pending_correction'))]
    meaningful = [c for c in pending if not c['confidence']['placeholder']]
    def source_reviewed(c):
        return (c.get('kind') == 'observation' and c['review_status'] == 'pending'
                and (c.get('source_review') or {}).get('action') == 'approve' and not c.get('pending_correction'))
    tiers = Counter(c['confidence']['tier'] for c in meaningful if not source_reviewed(c))
    return dict(version=VERSION, pending=len(pending), meaningful_pending=len(meaningful),
        placeholders=sum(c['confidence']['placeholder'] for c in pending),
        high=tiers['high'], medium=tiers['medium'], low=tiers['low'], unverified=tiers['unverified'],
        source_reviewed_pending=sum(source_reviewed(c) for c in meaningful),
        attention=tiers['medium']+tiers['low'], routine=tiers['high'],
        probability_status='not_calibrated', auto_accept_enabled=False,
        message='Điểm theo quy tắc giúp ưu tiên xem lại, chưa phải % đọc đúng. Duyệt nhóm vẫn cần xác nhận nguồn.')


def identity_conflict_documents(candidates):
    facts={}
    for c in candidates:
        if c['kind']!='metadata' or c.get('metadata_key') not in {'pid','birth_date','sex'}:continue
        value=c['value'].get('value')
        if value is None or c['value'].get('flags'):continue
        facts.setdefault(c['metadata_key'],{}).setdefault(str(value),set()).add(c['document_id'])
    return set().union(*(docs for values in facts.values() if len(values)>1 for docs in values.values()))


def feedback(candidates):
    """Observed manual edits; a selected review queue is not a held-out sample."""
    reviewed = [c for c in candidates if c['review_status'] == 'accepted']
    changed = sum(bool(c.get('source_review', {}).get('correction_id')) if c.get('source_review') else
                  (c.get('latest_human_review') or {}).get('action') == 'correct' for c in reviewed)
    return dict(reviewed=len(reviewed), approved_with_correction=changed,
        approved_without_correction=len(reviewed)-changed,
        corrected_fraction=changed/len(reviewed) if reviewed else None,
        random_audit=False, probability_correct=None,
        label='Tỷ lệ sửa trong các giá trị được duyệt; chưa phải tỷ lệ lỗi của toàn bộ tài liệu.')


def coverage_alerts(package, document_ids):
    """Keep failed/unmapped source regions visible outside candidate scores.

    A high score for extracted values says nothing about a missing row. Ignore
    only rows already represented by candidate evidence, empty headings and
    explicitly named technical controls. No expected answer lists are used.
    """
    documents={d['source_document_id']:d['document_id'] for d in package['documents']
               if d['document_id'] in document_ids}
    linked={eid for group in ('observations','metadata_candidates','specimen_candidates')
            for c in package.get(group,[]) for eid in c['evidence_ids']}
    represented={(e['document_id'],e['source_data'].get('table_id'),
                  tuple(e['source_data'].get('row_raw',[]))) for e in package['evidence']
                 if e['evidence_id'] in linked and e['source_data'].get('row_raw')}
    alerts=[]
    for issue in package.get('source_issues',[]):
        did=documents.get(issue.get('document_id'))
        if did is None:continue
        reason=issue['reason'];row=issue.get('row_raw',[])
        if reason in {'non_result_merged_row','header_only_no_data_rows'}:continue
        if row and not any(str(cell).strip() for cell in row):continue
        if row and (did,issue.get('table_id'),tuple(row)) in represented:continue
        if reason=='unmapped_test':
            if re.fullmatch(r'(?:control|label)(?:\s*\([^)]*\))?',issue.get('name_raw',''),re.I):continue
            if len(row)>1 and not row[1].strip():continue
        alerts.append(dict(document_id=did,source_document_id=issue['document_id'],
            table_id=issue.get('table_id'),reason=reason,name_raw=issue.get('name_raw'),
            row=issue.get('row'),package_id=package['package_id'],revision=package['revision']))
    return alerts
