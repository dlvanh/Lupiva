"""Complete patient catalog and atomic, snapshot-bound human batch decisions."""
import copy
import json
import unicodedata
from collections import defaultdict
from uuid import uuid4

from registry_pool.dictionary import digest
from .source import GROUPS
from .corrections import editable_source
from .store import HUMAN_ROLES,actor_info,now,text
from .confidence import assess as assess_confidence, summary as confidence_summary, feedback as confidence_feedback
from .confidence import coverage_alerts, identity_conflict_documents


class StalePatient(ValueError):
    pass


def supplemental_fields(candidates):
    """Display fields only: keep source metadata IDs and review history intact."""
    groups={}
    for item in candidates:
        if item['kind']!='metadata' or item['metadata_key']!='additional_lab_result':continue
        value=item['value'].get('value')
        if not isinstance(value,dict):continue
        name=value.get('name') or value.get('name_raw') or 'Xét nghiệm bổ sung'
        canonical=' '.join(unicodedata.normalize('NFKC',name).casefold().split())
        key=(canonical,value.get('specimen'),value.get('panel'))
        group=groups.setdefault(key,dict(name=name,items=[],specimen=value.get('specimen')))
        group['items'].append(item)
    fields=[]
    for key,group in groups.items():
        items=group['items']
        state=('accepted' if all(i['review_status']=='accepted' for i in items) else
               'partial' if any(i['review_status']=='accepted' for i in items) else 'pending')
        fields.append(dict(field_id='SUP-'+digest(key)[:12],label=group['name'],crf_membership='non_crf',
            section={'blood':'Xét nghiệm máu','urine':'Xét nghiệm nước tiểu'}.get(group['specimen'],'Xét nghiệm bổ sung'),
            components=[dict(component_id='result',status=state,
                candidate_ids=[i['selection_id'] for i in items])]))
    return fields


def mark_prior_ocr(candidates, packages, document_ids):
    """Select a rerun for display without moving any human review decision.

    Only an explicit, hash-bound replacement of the same source documents can
    retire a prior OCR view. The old candidates remain addressable for history,
    approved exports and pending source corrections.
    """
    replacements = {}
    for new_key, package in sorted(packages.items(), key=lambda p:p[1]['created_at_utc']):
        policy = package.get('source_run', {}).get('provenance', {}).get('review_workspace', {})
        mode = policy.get('mode')
        if mode not in {'complete_document_rerun', 'partial_document_rerun'}:
            continue
        new_docs = {d['document_id'] for d in package['documents']} & document_ids
        for reference in policy.get('replaces', []):
            old_key = (reference.get('package_id'), reference.get('revision'))
            old = packages.get(old_key)
            if not old or old_key == new_key or digest(old) != reference.get('sha256'):
                continue
            old_docs = {d['document_id'] for d in old['documents']} & document_ids
            if package['created_at_utc'] <= old['created_at_utc']:
                continue
            if mode == 'complete_document_rerun' and not old_docs <= new_docs:
                continue
            for document_id in old_docs & new_docs:
                replacements[(*old_key, document_id)] = dict(package_id=new_key[0], revision=new_key[1])
    for item in candidates:
        replacement = replacements.get((item['package_id'],item['revision'],item.get('document_id')))
        if replacement:
            item['prior_ocr'] = replacement
    prior = [c for c in candidates if c.get('prior_ocr')]
    return dict(candidates=len(prior), pending_corrections=sum(bool(c.get('pending_correction')) for c in prior))


def patient_workspace(store,dictionary,case_id):
    """Caller holds a consistent read transaction or an atomic write batch.

    Empty slots describe absent candidates, never an inferred negative result.
    Package-wide not_found states are not assigned to one patient's documents.
    """
    summary=store.summary()
    case=next((c for c in summary['cases'] if c['case_id']==case_id),None)
    if case is None:raise ValueError('Chọn một ca registry hợp lệ.')
    effective=store.effective_pool(case_id)['observations']
    active={(o['package_id'],o['revision'],o['observation_id']):o for o in effective}
    latest={}
    for p in summary['packages']:latest[p['package_id']]=max(p['revision'],latest.get(p['package_id'],0))
    # Include accepted historical revisions as separate, read-only results.
    versions=set((pid,rev) for pid,rev in latest.items())|{(o['package_id'],o['revision']) for o in effective}
    candidates=[];documents={};packages=[];confidence_alerts=[];loaded_packages={}
    for pid,rev in sorted(versions):
        package=store.registry.package(pid,rev)
        assignments={}
        for d in package['documents']:
            identity=store.assignment(d['document_id'])
            if identity and identity['identity_status']=='confirmed' and identity['case_id']==case_id:
                assignments[d['document_id']]=identity
                documents[d['document_id']]=dict(document_id=d['document_id'],source_document_id=d['source_document_id'],
                    assignment_id=identity['assignment_id'],encounter_id=identity['encounter_id'])
        if not assignments:continue
        loaded_packages[pid,rev]=package
        if rev==latest[pid]:confidence_alerts.extend(coverage_alerts(package,set(assignments)))
        packages.append(dict(package_id=pid,revision=rev,sha256=digest(package)))
        sources=store.source_review_index(pid,rev)
        evidence_index={e['evidence_id']:e['source_data'] for e in package['evidence']}
        for kind,(group,id_key) in GROUPS.items():
            for item in package.get(group,[]):
                cid=item[id_key];identity=assignments.get(item['document_id'])
                accepted=active.get((pid,rev,cid)) if kind=='observation' else None
                if not identity or (rev!=latest[pid] and not accepted):continue
                source=sources.get((kind,cid))
                history=store.history(pid,rev,cid) if kind=='observation' else []
                human=next((h for h in reversed(history) if h['reviewer']['declared_role'] in HUMAN_ROLES),None)
                value=store.source_value(kind,item,source)
                if human and human['action'] in {'accept','correct'}:value=copy.deepcopy(human['after'])
                status=('conflict' if accepted and not accepted['eligible_for_verified_pool'] else 'accepted' if accepted else
                    human['action'] if human else 'pending') if kind=='observation' else (
                    'accepted' if source and source['action']=='approve' else source['action'] if source else 'pending')
                key=digest(dict(package_id=pid,revision=rev,kind=kind,candidate_id=cid))
                candidates.append(dict(selection_id=key,kind=kind,candidate_id=cid,package_id=pid,revision=rev,
                    current_revision=rev==latest[pid],document_id=item['document_id'],assignment_id=identity['assignment_id'],
                    encounter_id=identity['encounter_id'],field_id=item.get('field_id'),component=item.get('component'),
                    metadata_key=item.get('key'),value=value,review_status=status,
                    latest_review=history[-1] if history else None,latest_human_review=human,
                    source_review=source,source_candidate_sha256=digest(item),
                    correction_history=store.correction_history(pid,rev,kind,cid),
                    correction_fields=editable_source(kind,item),
                    pending_correction=store.pending_correction(pid,rev,kind,cid,source),
                    evidence_ids=list(dict.fromkeys(item['evidence_ids']+item.get('date_evidence_ids',[])))))
                candidates[-1]['confidence']=assess_confidence(candidates[-1],
                    [evidence_index[eid] for eid in candidates[-1]['evidence_ids'] if eid in evidence_index])
                # Result evidence precedes date evidence. Keep its row provenance
                # available to CRF repeat numbering, even after a value correction.
                candidates[-1]['source_positions'] = [
                    {key: evidence_index[eid].get(key)
                     for key in ('table_id', 'row_index_0based', 'region')}
                    for eid in item['evidence_ids'] if eid in evidence_index]
                # Calibration uses the original extraction, before observing a
                # correction/rejection label. Never score a corrected value as
                # though it were the model's original successful prediction.
                original_confidence=assess_confidence({**candidates[-1], 'value':item['source_data'],
                    'review_status':'pending','pending_correction':None},
                    [evidence_index[eid] for eid in candidates[-1]['evidence_ids'] if eid in evidence_index])
                candidates[-1]['confidence'].update(extraction_score=original_confidence['score'],
                    extraction_tier=original_confidence['tier'],extraction_blockers=original_confidence['blockers'])
    identity_conflicts=identity_conflict_documents(candidates)
    for candidate in candidates:
        if candidate['document_id'] not in identity_conflicts:continue
        confidence=candidate['confidence']
        confidence['tier']='low';confidence['score']=max(0,confidence['score']-50)
        confidence['blockers'].append('patient_identity_conflict')
        confidence['extraction_tier']='low'
        confidence['extraction_score']=max(0,confidence['extraction_score']-50)
        confidence['extraction_blockers'].append('patient_identity_conflict')
        confidence['reasons'].append(dict(code='patient_identity_conflict',severity='block',
            message='Thông tin định danh giữa các ảnh trong hồ sơ khác nhau; cần xác nhận liên kết.'))
    prior_ocr=mark_prior_ocr(candidates,loaded_packages,set(documents))
    displayed=[c for c in candidates if not c.get('prior_ocr')]
    by_component=defaultdict(list)
    for item in candidates:
        if item['kind']=='observation':by_component[item['field_id'],item['component']].append(item)
    fields=[]
    for definition in dictionary['fields']:
        fid=definition['field_id'];components=[]
        for component in definition['components']:
            all_items=by_component[fid,component['component_id']]
            items=[c for c in all_items if not c.get('prior_ocr')]
            state=('conflict' if any(i['review_status']=='conflict' for i in items) else
                'source_placeholder' if items and all(i['value'].get('result_type')=='missing' for i in items) else
                'accepted' if items and all(i['review_status']=='accepted' for i in items) else
                'partial' if any(i['review_status']=='accepted' for i in items) else
                'pending' if items else 'requires_clinical_assessment' if
                    definition['extraction_policy']=='recorded_only_no_score_computation' else 'not_processed')
            components.append(dict(component_id=component['component_id'],value_type=component['value_type'],
                parser_implemented=component['parser_implemented'],status=state,
                reason=None if items else ('clinical_assessment_required' if
                    definition['extraction_policy']=='recorded_only_no_score_computation' else
                    'no_linked_documents' if not documents else
                    'identifier_not_assigned' if component['value_type']=='identifier' else
                    'no_candidate_in_linked_documents' if component['parser_implemented'] else 'extraction_not_supported'),
                candidate_ids=[i['selection_id'] for i in all_items]))
        fields.append(dict(field_id=fid,label=definition['label'],section=definition['section'],
            crf_membership='crf',
            source_type=definition['source_type'],choices=definition['choices'],
            extraction_policy=definition['extraction_policy'],components=components))
    batches=[]
    for row in store.db.execute("SELECT payload FROM audit_events WHERE kind='patient_review_batch_recorded' ORDER BY sequence"):
        payload=json.loads(row[0])
        if payload['request']['case_id']==case_id:batches.append(payload['receipt'])
    extra_fields=supplemental_fields(candidates)
    result=dict(schema_version='patient-field-review-0.1',case=case,dictionary_sha256=digest(dictionary),
        fields=fields,supplemental_fields=extra_fields,candidates=candidates,documents=list(documents.values()),source_packages=packages,review_batches=batches,
        prior_ocr=prior_ocr,
        counts=dict(fields=len(fields),components=sum(len(f['components']) for f in fields),
            fields_with_candidates=len({c['field_id'] for c in displayed if c['kind']=='observation'}),
            observations=sum(i['kind']=='observation' for i in displayed),
            metadata=sum(i['kind']=='metadata' for i in displayed),specimens=sum(i['kind']=='specimen' for i in displayed)),
        missing_policy='No inferred negatives, dates, scores or normal results; empty slots cannot be approved.')
    result['confidence_summary']=confidence_summary(displayed)
    result['confidence_feedback']=confidence_feedback(candidates)
    retired={(c['package_id'],c['revision'],c['document_id']) for c in candidates if c.get('prior_ocr')}
    result['confidence_alerts']=[a for a in confidence_alerts
                                 if (a['package_id'],a['revision'],a['document_id']) not in retired]
    current_extras=supplemental_fields(displayed)
    result['counts'].update(non_crf_fields=len(current_extras),
        non_crf_results=sum(len(c['candidate_ids']) for f in current_extras for c in f['components']))
    result['review_snapshot_sha256']=digest(result)
    return result


def record_patient_batch(store,dictionary,*,case_id,selection_ids,action,request_id,
                         expected_snapshot_sha256,actor,role,reason,verify_sources):
    reviewer=actor_info(actor,role)
    if role not in HUMAN_ROLES:raise ValueError('Duyệt hàng loạt cần người dùng đối chiếu nguồn.')
    reason=text(reason,'Lý do duyệt');request_id=text(request_id,'Mã yêu cầu')
    if action not in {'approve','reject','needs_clarification','withdraw'}:raise ValueError('Thao tác duyệt không hợp lệ.')
    if (not isinstance(selection_ids,list) or not selection_ids or len(selection_ids)>5000 or
            any(not isinstance(s,str) for s in selection_ids) or len(set(selection_ids))!=len(selection_ids)):
        raise ValueError('Chọn các giá trị cụ thể, không trùng lặp; không duyệt ô trống.')
    request=dict(case_id=case_id,selection_ids=sorted(selection_ids),action=action,request_id=request_id,
        expected_snapshot_sha256=expected_snapshot_sha256,reviewer=reviewer,reason=reason)
    checksum=digest(request)
    with store.atomic_batch():
        for row in store.db.execute("SELECT payload FROM audit_events WHERE kind='patient_review_batch_recorded'"):
            old=json.loads(row[0])
            if old['request']['request_id']==request_id:
                if old['request_sha256']!=checksum:raise ValueError('Mã yêu cầu đã dùng cho nội dung khác.')
                return dict(status='already_recorded',batch=old['receipt'])
        workspace=patient_workspace(store,dictionary,case_id)
        if workspace['review_snapshot_sha256']!=expected_snapshot_sha256:
            raise StalePatient('Dữ liệu hoặc liên kết đã đổi. Tải lại hồ sơ trước khi duyệt.')
        index={c['selection_id']:c for c in workspace['candidates']}
        if set(selection_ids)-set(index):raise ValueError('Giá trị không thuộc bệnh nhân hoặc không có dữ liệu nguồn.')
        selected=[index[sid] for sid in selection_ids]
        if any(not c['current_revision'] for c in selected):raise ValueError('Kết quả phiên bản cũ chỉ để đối chiếu; duyệt phiên bản hiện hành.')
        if action=='approve' and any(c['review_status']=='conflict' for c in selected):
            raise ValueError('Giải quyết mâu thuẫn từng kết quả trước khi duyệt hàng loạt.')
        if action=='approve':verify_sources({(c['package_id'],c['revision']) for c in selected})
        batch_id='patient-batch-'+uuid4().hex;decisions=[];source_groups=defaultdict(list)
        for candidate in selected:
            pid,rev=candidate['package_id'],candidate['revision']
            if candidate['kind']=='observation':
                decision=store.review(pid,rev,candidate['candidate_id'],action='accept' if action=='approve' else action,
                    actor=actor,role=role,reason=reason,verification_level='source_verified',
                    expected_assignment_id=candidate['assignment_id'],
                    replaces_review_ids=(candidate['latest_human_review'] or {}).get('replaces_review_ids',[]) if action=='approve' else [],
                    expected_review_id=candidate['latest_review']['review_id'] if candidate['latest_review'] else None)
                decisions.append(dict(kind='observation',candidate_id=candidate['candidate_id'],review_id=decision['review_id']))
            else:
                source=candidate['source_review']
                source_groups[pid,rev].append(dict(candidate_type=candidate['kind'],candidate_id=candidate['candidate_id'],
                    action=action,expected_review_id=source['review_id'] if source else None,
                    expected_candidate_sha256=candidate['source_candidate_sha256']))
        packages={(p['package_id'],p['revision']):p['sha256'] for p in workspace['source_packages']}
        for (pid,rev),items in source_groups.items():
            result=store.record_source_batch(pid,rev,decisions=items,request_id=batch_id+':'+digest([pid,rev]),
                expected_package_sha256=packages[pid,rev],actor=actor,role=role,reason=reason)
            decisions.extend(dict(kind=i['candidate_type'],candidate_id=i['candidate_id'],source_batch_id=result['batch']['batch_id']) for i in items)
        receipt=dict(batch_id=batch_id,case_id=case_id,request_id=request_id,action=action,reviewer=reviewer,reason=reason,
            created_at_utc=now(),counts={kind:sum(c['kind']==kind for c in selected) for kind in GROUPS},
            decisions=decisions,previous_snapshot_sha256=expected_snapshot_sha256,
            verification_level='source_verified' if action=='approve' else None,clinical_assessment=False,
            missing_values_preserved=True)
        store.registry._audit('patient_review_batch_recorded',dict(request=request,request_sha256=checksum,receipt=receipt))
    return dict(status='recorded',batch=receipt)
