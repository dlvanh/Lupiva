"""Human source approvals independent of case identity and clinical assessment.

Original OCR snapshots remain immutable. An approval may explicitly select a
separately recorded source transcription; identity and clinical decisions stay
independent, and pending corrections never replace an approved value.
"""
import copy
import json
from uuid import uuid4

from registry_pool.dictionary import digest
from registry_pool.store import encode
from .corrections import SourceCorrections,CORRECTION_DDL

SOURCE_DDL='''
CREATE TABLE IF NOT EXISTS source_review_batches(
 batch_id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_sha256 TEXT NOT NULL,
 package_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,
 FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS source_review_decisions(
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,review_id TEXT NOT NULL UNIQUE,
 batch_id TEXT NOT NULL REFERENCES source_review_batches,package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 candidate_type TEXT NOT NULL CHECK(candidate_type IN ('observation','metadata','specimen')),
 candidate_id TEXT NOT NULL,document_id TEXT NOT NULL REFERENCES documents,
 previous_review_id TEXT REFERENCES source_review_decisions(review_id),payload TEXT NOT NULL,
 FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE INDEX IF NOT EXISTS source_review_candidate
 ON source_review_decisions(package_id,revision,candidate_type,candidate_id,sequence);
'''+CORRECTION_DDL
GROUPS={'observation':('observations','observation_id'),
        'metadata':('metadata_candidates','candidate_id'),
        'specimen':('specimen_candidates','sample_id')}
SOURCE_ACTIONS={'approve','reject','needs_clarification','withdraw'}


def candidates(package):
    return {(kind,item[key]):item for kind,(group,key) in GROUPS.items() for item in package.get(group,[])}


def incomplete_attributes(kind,item):
    data=item['source_data']
    if kind=='specimen':
        return [key for key,value in (
            ('collection_date',data['collection_datetime']['date']),
            ('collection_time',data['collection_datetime']['time']),
            ('amount',data['amount']['numeric_value'])) if value is None]
    if kind=='observation':
        return ['source_date'] if not data.get('source_date') else []
    return ['value'] if data.get('value') in (None,'') else []


class SourceReviews(SourceCorrections):
    def source_review_index(self,package_id,revision):
        latest={}
        for row in self.db.execute('SELECT payload FROM source_review_decisions WHERE package_id=? AND revision=? ORDER BY sequence',
                                   (package_id,revision)):
            item=json.loads(row[0])
            latest[(item['candidate_type'],item['candidate_id'])]=item
        return latest

    def source_history(self,package_id,revision,kind,candidate_id):
        return [json.loads(r[0]) for r in self.db.execute(
            'SELECT payload FROM source_review_decisions WHERE package_id=? AND revision=? AND candidate_type=? AND candidate_id=? ORDER BY sequence',
            (package_id,revision,kind,candidate_id))]

    def source_batches(self,package_id,revision):
        return [json.loads(r[0]) for r in self.db.execute(
            'SELECT payload FROM source_review_batches WHERE package_id=? AND revision=? ORDER BY rowid',
            (package_id,revision))]

    def record_source_batch(self,package_id,revision,*,decisions,request_id,expected_package_sha256,
                            actor,role,reason,origin='local_ui',recorded_by=None,authorization_quote=None):
        from .store import actor_info,text,now,validate_result,HUMAN_ROLES
        reviewer=actor_info(actor,role)
        if role not in HUMAN_ROLES:
            raise ValueError('Source approval requires an explicit human reviewer')
        reason=text(reason,'Source review reason')
        request_id=text(request_id,'Source review request ID')
        if origin not in {'local_ui','user_instruction'}:
            raise ValueError('Unknown source review origin')
        if origin=='user_instruction':
            recorded_by=text(recorded_by,'Recorder')
            authorization_quote=text(authorization_quote,'Explicit user authorization')
        elif recorded_by is not None or authorization_quote is not None:
            raise ValueError('Proxy recording requires explicit user instruction provenance')
        if not isinstance(decisions,list) or not decisions:
            raise ValueError('Select source candidates explicitly')
        required={'candidate_type','candidate_id','action','expected_review_id','expected_candidate_sha256'}
        seen=set()
        for decision in decisions:
            if not isinstance(decision,dict) or not required<=set(decision) or set(decision)-required-{'correction_id'}:
                raise ValueError('Source review requires candidate and previous snapshot hashes')
            if 'correction_id' in decision and (decision['action']!='approve' or not isinstance(decision['correction_id'],str)):
                raise ValueError('A correction must be selected explicitly for approval')
            key=(decision['candidate_type'],decision['candidate_id'])
            if key in seen or key[0] not in GROUPS or decision['action'] not in SOURCE_ACTIONS:
                raise ValueError('Unknown action/type or repeated source candidate')
            seen.add(key)
        request=dict(package_id=package_id,revision=revision,decisions=decisions,
            expected_package_sha256=expected_package_sha256,reviewer=reviewer,reason=reason,
            origin=origin,recorded_by=recorded_by,authorization_quote=authorization_quote)
        request_hash=digest(request)
        with self.transaction():
            old=self.db.execute('SELECT request_sha256,payload FROM source_review_batches WHERE request_id=?',(request_id,)).fetchone()
            if old:
                if old[0]!=request_hash:
                    raise ValueError('Source request ID reused with different content')
                return dict(status='already_recorded',batch=json.loads(old[1]))
            package=self.registry.package(package_id,revision)
            if digest(package)!=expected_package_sha256:
                raise ValueError('Source package changed; reload before reviewing')
            items=candidates(package)
            latest=self.source_review_index(package_id,revision)
            records=[]
            batch_id='source-batch-'+uuid4().hex
            timestamp=now()
            for decision in decisions:
                kind,cid=decision['candidate_type'],decision['candidate_id']
                item=items.get((kind,cid))
                if item is None or digest(item)!=decision['expected_candidate_sha256']:
                    raise ValueError('Source candidate outside revision or snapshot changed')
                previous=latest.get((kind,cid))
                if (previous['review_id'] if previous else None)!=decision['expected_review_id']:
                    raise ValueError('Source review changed; reload before saving')
                effective_item=copy.deepcopy(item)
                effective_item['source_data']=self.source_value(kind,item,previous)
                correction_id=previous.get('correction_id') if previous and previous['action']=='approve' else None
                if 'correction_id' in decision:
                    current_revision=self.db.execute('SELECT MAX(revision) FROM packages WHERE package_id=?',(package_id,)).fetchone()[0]
                    if revision!=current_revision:raise ValueError('Only the current revision can approve a correction')
                    history=self.correction_history(package_id,revision,kind,cid)
                    if not history or history[-1]['status']!='pending' or history[-1]['correction_id']!=decision['correction_id']:
                        raise ValueError('Correction changed or outside candidate; reload before approving')
                    correction=history[-1]
                    if correction['expected_review_id']!=decision['expected_review_id'] or correction['before']!=effective_item['source_data']:
                        raise ValueError('Correction base review changed; propose again after reloading')
                    effective_item['source_data']=copy.deepcopy(correction['after'])
                    correction_id=correction['correction_id']
                if decision['action']=='approve':
                    if kind=='observation':
                        validate_result(item['source_data'],item['component'])
                    if kind=='metadata' and effective_item['source_data'].get('value') in (None,''):
                        raise ValueError('Missing metadata cannot be approved as a value')
                records.append(dict(review_id='source-review-'+uuid4().hex,batch_id=batch_id,
                    package_id=package_id,revision=revision,candidate_type=kind,candidate_id=cid,
                    document_id=item['document_id'],action=decision['action'],reviewer=reviewer,
                    verification_level='source_verified' if decision['action']=='approve' else None,
                    reason=reason,created_at_utc=timestamp,previous_review_id=decision['expected_review_id'],
                    source_candidate_sha256=digest(item),source_snapshot=copy.deepcopy(item),
                    incomplete_attributes=incomplete_attributes(kind,effective_item),missing_values_preserved=not bool(correction_id),
                    missing_values_policy='unchanged_except_explicit_source_correction',
                    identity_confirmed_by_this_decision=False,clinical_assessment=False))
                if correction_id and decision['action']=='approve':
                    records[-1].update(correction_id=correction_id,after=effective_item['source_data'])
            batch=dict(batch_id=batch_id,request_id=request_id,package_id=package_id,revision=revision,
                package_sha256=expected_package_sha256,created_at_utc=timestamp,reviewer=reviewer,
                reason=reason,origin=origin,recorded_by=recorded_by,authorization_quote=authorization_quote,
                reviewer_identity_status='conversation_user_not_authenticated' if origin=='user_instruction' else 'declared_local_operator',
                counts={kind:sum(r['candidate_type']==kind for r in records) for kind in GROUPS},
                review_ids=[r['review_id'] for r in records])
            self.db.execute('INSERT INTO source_review_batches VALUES(?,?,?,?,?,?)',
                (batch_id,request_id,request_hash,package_id,revision,encode(batch)))
            for item in records:
                self.db.execute('INSERT INTO source_review_decisions(review_id,batch_id,package_id,revision,candidate_type,candidate_id,document_id,previous_review_id,payload) VALUES(?,?,?,?,?,?,?,?,?)',
                    (item['review_id'],batch_id,package_id,revision,item['candidate_type'],item['candidate_id'],
                     item['document_id'],item['previous_review_id'],encode(item)))
            self.registry._audit('source_review_batch_recorded',batch)
        return dict(status='recorded',batch=batch)

    def source_reviewed_pool(self,package_id,revision):
        package=self.registry.package(package_id,revision)
        latest=self.source_review_index(package_id,revision)
        result=dict(schema_version='source-reviewed-pool-0.1',package_id=package_id,revision=revision,
            package_sha256=digest(package),dictionary_version=package['dictionary_version'],
            dictionary_sha256=package['dictionary_sha256'],case_id=None,
            selection_policy='explicit_source_approvals_for_this_revision_only',
            identity_policy='document_case_and_encounter_links_require_separate_confirmation',
            documents=[dict(**d,assignment=self.assignment(d['document_id'])) for d in package['documents']],
            fields=copy.deepcopy(package['fields']),evidence=[],source_review_batches=self.source_batches(package_id,revision))
        referenced=set()
        for kind,(group,key) in GROUPS.items():
            result[group]=[]
            for item in package.get(group,[]):
                decision=latest.get((kind,item[key]))
                if not decision or decision['action']!='approve':
                    continue
                # Never expose OCR's pending flag as the effective review status.
                value={k:copy.deepcopy(v) for k,v in self.source_value(kind,item,decision).items()
                       if k not in {'review_status','eligible_for_verified_pool','validation_status'}}
                record={k:copy.deepcopy(v) for k,v in item.items() if k!='source_data'}
                record.update(value=value,review_status='source_verified',source_review_id=decision['review_id'],
                    review_batch_id=decision['batch_id'],incomplete_attributes=decision['incomplete_attributes'],
                    eligible_for_verified_pool=False,case_acceptance_required=True)
                if decision.get('correction_id'):
                    record.update(correction_id=decision['correction_id'],
                        correction_history=self.correction_history(package_id,revision,kind,item[key]))
                result[group].append(record)
                referenced.update(item['evidence_ids']+item.get('date_evidence_ids',[]))
        approved={o['observation_id'] for o in result['observations']}
        for field in result['fields'].values():
            original_ids=field['observation_ids']
            field['source_observation_ids']=original_ids
            field['observation_ids']=[oid for oid in original_ids if oid in approved]
            field['review_status']=('source_verified' if original_ids and len(field['observation_ids'])==len(original_ids)
                                    else 'partial' if field['observation_ids'] else 'pending' if original_ids else 'not_processed')
            for component in field['components'].values():
                component['source_observation_ids']=component['observation_ids']
                component['observation_ids']=[oid for oid in component['observation_ids'] if oid in approved]
        metadata_ids={m['candidate_id'] for m in result['metadata_candidates']}
        for observation in result['observations']:
            observation['source_metadata_candidate_id']=observation.get('metadata_candidate_id')
            if observation.get('metadata_candidate_id') not in metadata_ids:
                observation['metadata_candidate_id']=None
        result['evidence']=[copy.deepcopy(e) for e in package['evidence'] if e['evidence_id'] in referenced]
        result['summary']={group:dict(total=len(package.get(group,[])),approved=len(result[group]),
            excluded=len(package.get(group,[]))-len(result[group])) for group,_ in GROUPS.values()}
        return result
