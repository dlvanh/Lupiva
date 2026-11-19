"""Attach exact, previously approved source documents to a user-confirmed patient."""
import json

from registry_pool.dictionary import digest
from .store import ReviewStore,text,instruction_provenance


def record_patient(database,package,*,document_ids,registry_code,request_id,actor,recorded_by,
                   authorization_quote,reason,expected_package_sha256):
    """No OCR, inferred identity/date/visit, edits, or new source approvals.

    The conversation user confirms that these documents belong to one patient.
    Existing explicit source approvals supply the values accepted for that case;
    the recorder is kept separate from the human source reviewer.
    """
    request_id=text(request_id,'Request ID');registry_code=text(registry_code,'Registry code')
    text(reason,'Reason');text(actor,'Human operator')
    instruction_provenance('user_instruction',recorded_by,authorization_quote)
    if not isinstance(document_ids,list) or not document_ids or len(set(document_ids))!=len(document_ids):
        raise ValueError('Select distinct source document IDs explicitly')
    if digest(package)!=expected_package_sha256:raise ValueError('Package snapshot differs')
    request=dict(request_id=request_id,registry_code=registry_code,document_ids=sorted(document_ids),
        package_id=package['package_id'],revision=package['revision'],expected_package_sha256=expected_package_sha256,
        actor=actor,recorded_by=recorded_by,authorization_quote=authorization_quote,reason=reason)
    request_hash=digest(request)
    store=ReviewStore(database)
    try:
        with store.atomic_batch():
            for row in store.db.execute("SELECT payload FROM audit_events WHERE kind='user_patient_batch_recorded'"):
                old=json.loads(row[0])
                if old['request_id']==request_id:
                    if old['request_sha256']!=request_hash:raise ValueError('Patient request ID reused with different content')
                    return dict(status='already_recorded',**old['receipt'])
            pid,rev=package['package_id'],package['revision']
            if digest(store.registry.package(pid,rev))!=expected_package_sha256:raise ValueError('Stored package differs')
            latest=store.db.execute('SELECT MAX(revision) FROM packages WHERE package_id=?',(pid,)).fetchone()[0]
            if latest!=rev:raise ValueError('Use the latest explicitly reviewed package revision')
            documents={d['document_id']:d for d in package['documents']}
            if set(document_ids)-set(documents):raise ValueError('Document is outside the selected package')
            if store.db.execute('SELECT 1 FROM registry_cases WHERE registry_code=?',(registry_code,)).fetchone():
                raise ValueError('Registry code already exists; do not silently merge patients')
            if any(store.assignment(did) is not None for did in document_ids):
                raise ValueError('Document already has identity history; review that association explicitly')
            reviewed=store.source_reviewed_pool(pid,rev)
            approved=[v for v in reviewed['observations'] if v['document_id'] in document_ids]
            raw=[v for v in package['observations'] if v['document_id'] in document_ids]
            if {v['observation_id'] for v in approved}!={v['observation_id'] for v in raw}:
                raise ValueError('Every selected observation requires an existing current source approval')
            who=dict(actor=actor,role='source_reviewer',origin='user_instruction',recorded_by=recorded_by,
                authorization_quote=authorization_quote)
            case=store.create_case(registry_code,**who)
            assignments={did:store.assign_document(did,case_id=case['case_id'],reason=reason,**who)
                         for did in sorted(document_ids)}
            decisions=[]
            for item in approved:
                decisions.append(store.review(pid,rev,item['observation_id'],action='accept',reason=reason,
                    expected_assignment_id=assignments[item['document_id']]['assignment_id'],
                    source_review_id=item['source_review_id'],**who))
            receipt=dict(case=case,document_count=len(assignments),accepted_observations=len(decisions),
                assignment_ids=[v['assignment_id'] for v in assignments.values()],
                review_ids=[v['review_id'] for v in decisions],encounters_created=0,
                verification_level='source_verified',clinical_assessment=False,
                package_id=pid,revision=rev,request_id=request_id,request_sha256=request_hash)
            store.registry._audit('user_patient_batch_recorded',dict(request_id=request_id,
                request_sha256=request_hash,request=request,receipt=receipt))
        return dict(status='recorded',**receipt)
    finally:store.close()
