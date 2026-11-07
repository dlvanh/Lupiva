"""Append-only case, event, identity and review decisions for a local pilot.

Declared reviewer roles are recorded provenance, not an authentication system.
OCR imports remain pending forever; effective reviewed values are derived views.
"""
import copy
from contextlib import contextmanager
from datetime import datetime,date,timezone
from decimal import Decimal
import json
import re
from uuid import uuid4

from registry_pool.store import Registry,encode
from .source import SourceReviews,SOURCE_DDL


DDL='''
CREATE TABLE IF NOT EXISTS registry_cases(case_id TEXT PRIMARY KEY,registry_code TEXT NOT NULL UNIQUE,
 study_id TEXT,payload TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS unique_explicit_study_id ON registry_cases(study_id) WHERE study_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS registry_encounters(encounter_id TEXT PRIMARY KEY,case_id TEXT NOT NULL REFERENCES registry_cases,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS document_identity_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 assignment_id TEXT NOT NULL UNIQUE,document_id TEXT NOT NULL REFERENCES documents,
 case_id TEXT REFERENCES registry_cases,encounter_id TEXT REFERENCES registry_encounters,
 previous_assignment_id TEXT REFERENCES document_identity_events(assignment_id),payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS identity_by_document ON document_identity_events(document_id,sequence);
CREATE TABLE IF NOT EXISTS review_decisions(sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 review_id TEXT NOT NULL UNIQUE,package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 observation_id TEXT NOT NULL REFERENCES observations,assignment_id TEXT REFERENCES document_identity_events(assignment_id),
 previous_review_id TEXT REFERENCES review_decisions(review_id),payload TEXT NOT NULL,
 FOREIGN KEY(package_id,revision,observation_id) REFERENCES package_observations(package_id,revision,observation_id));
CREATE INDEX IF NOT EXISTS reviews_by_candidate ON review_decisions(package_id,revision,observation_id,sequence);
'''
HUMAN_ROLES={'source_reviewer','clinician'}
ACTIONS={'accept','correct','reject','needs_clarification','withdraw','suggest'}
EDITABLE={'numeric_value','comparator','qualitative_value','symbolic_value','pattern_raw','grade_raw',
          'unit_raw','source_date','date_type','specimen','panel','method_raw','titre_raw','result_type','missing_reason'}


def now():
    return datetime.now(timezone.utc).isoformat()


def text(value,name):
    if not isinstance(value,str) or not value.strip():
        raise ValueError(name+' is required')
    return value.strip()


def actor_info(actor,role):
    actor=text(actor,'Reviewer name')
    if role not in HUMAN_ROLES|{'assistant'}:
        raise ValueError('Unknown declared reviewer role')
    return dict(name=actor,declared_role=role)


def validate_values(values):
    if not isinstance(values,dict) or set(values)-EDITABLE:
        raise ValueError('Only explicit value attributes may be corrected')
    for key,value in values.items():
        if value is not None and not isinstance(value,str):
            raise ValueError('Review values must be strings or null')
        if key=='numeric_value' and value is not None:
            if not re.fullmatch(r'[+-]?\d+(?:\.\d+)?',value) or not Decimal(value).is_finite():
                raise ValueError('Numeric correction requires a finite decimal string')
        if key=='comparator' and value not in {'=','<','<=','>','>=',None}:
            raise ValueError('Unknown comparator')
        if key=='source_date' and value:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?',value):
                raise ValueError('Source date requires an explicit ISO date or datetime')
            datetime.fromisoformat(value)
        if key=='result_type' and value not in {'numeric','qualitative','mixed','pattern','semiquantitative','unparsed','missing'}:
            raise ValueError('Unknown result type')


def validate_result(values,component=None):
    """Validate the complete accepted value, including attributes left by OCR."""
    validate_values({k:v for k,v in values.items() if k in EDITABLE})
    kind=values.get('result_type')
    required={'numeric':('numeric_value',),'qualitative':('qualitative_value',),
              'mixed':('numeric_value','qualitative_value'),'pattern':('pattern_raw',),
              'semiquantitative':('symbolic_value',),'missing':('missing_reason',)}
    if kind not in required:
        raise ValueError('An unreadable result needs an explicit typed correction')
    if any(not isinstance(values.get(k),str) or not values[k].strip() for k in required[kind]):
        raise ValueError('Result type requires its explicit value attributes')
    if kind=='missing' and values.get('missing_reason')!='source_placeholder':
        raise ValueError('Only an explicit source placeholder can be accepted as missing')
    groups={'numeric_value':{'numeric','mixed'},'comparator':{'numeric','mixed'},
            'qualitative_value':{'qualitative','mixed'},'pattern_raw':{'pattern'},
            'grade_raw':{'pattern'},'symbolic_value':{'semiquantitative'}}
    if component=='intensity':
        groups['qualitative_value'].add('numeric')
    for key,kinds in groups.items():
        if values.get(key) is not None and kind not in kinds:
            raise ValueError('Clear incompatible value attributes when changing result type: '+key)
    if kind in {'numeric','mixed'} and values.get('comparator') is None:
        raise ValueError('Numeric results require an explicit comparator')
    if kind!='missing' and values.get('missing_reason') is not None:
        raise ValueError('Clear missing reason when supplying a result')
    if bool(values.get('source_date'))!=bool(values.get('date_type')):
        raise ValueError('Source date and date role must be supplied together')


class ReviewStore(SourceReviews):
    def __init__(self,path):
        self.registry=Registry(path)
        self.db=self.registry.db
        self.db.executescript(DDL)
        self.db.executescript(SOURCE_DDL)
        for table in ('registry_cases','registry_encounters','document_identity_events','review_decisions',
                      'source_review_batches','source_review_decisions'):
            for operation in ('UPDATE','DELETE'):
                self.db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT,'immutable review history'); END")
        self.db.commit()

    def close(self):
        self.registry.close()

    @contextmanager
    def transaction(self):
        if self.db.in_transaction:
            raise RuntimeError('Nested review transaction is not supported')
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
            self.db.commit()
        except BaseException:
            self.db.rollback()
            raise

    def create_case(self,registry_code,*,study_id=None,actor,role):
        reviewer=actor_info(actor,role)
        if role not in HUMAN_ROLES:
            raise ValueError('Case creation requires an explicit human operator')
        code=text(registry_code,'Registry code')
        study_id=text(study_id,'Study ID') if study_id is not None else None
        item=dict(case_id='case-'+uuid4().hex,registry_code=code,study_id=study_id,
                  created_at_utc=now(),created_by=reviewer)
        with self.transaction():
            self.db.execute('INSERT INTO registry_cases VALUES(?,?,?,?)',(item['case_id'],code,study_id,encode(item)))
            self.registry._audit('case_created',item)
        return item

    def create_encounter(self,case_id,*,label,event_type='visit',event_date=None,actor,role):
        reviewer=actor_info(actor,role)
        if role not in HUMAN_ROLES or event_type not in {'visit','sample_collection','hospitalization','other'}:
            raise ValueError('Human operator and known event type required')
        if event_date is not None:
            if not isinstance(event_date,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',event_date):
                raise ValueError('Event date must be explicit ISO date')
            date.fromisoformat(event_date)
        item=dict(encounter_id='event-'+uuid4().hex,case_id=case_id,label=text(label,'Event label'),
                  event_type=event_type,event_date=event_date,created_at_utc=now(),created_by=reviewer)
        with self.transaction():
            self.db.execute('INSERT INTO registry_encounters VALUES(?,?,?)',(item['encounter_id'],case_id,encode(item)))
            self.registry._audit('encounter_created',item)
        return item

    def assignment(self,document_id):
        row=self.db.execute('SELECT payload FROM document_identity_events WHERE document_id=? ORDER BY sequence DESC LIMIT 1',
                            (document_id,)).fetchone()
        return json.loads(row[0]) if row else None

    def assign_document(self,document_id,*,case_id,encounter_id=None,expected_assignment_id=None,actor,role,reason):
        reviewer=actor_info(actor,role)
        if role not in HUMAN_ROLES:
            raise ValueError('Document identity requires explicit human confirmation')
        reason=text(reason,'Identity confirmation reason')
        if case_id is None and encounter_id is not None:
            raise ValueError('A revoked document cannot retain an encounter')
        with self.transaction():
            old=self.assignment(document_id)
            if (old['assignment_id'] if old else None)!=expected_assignment_id:
                raise ValueError('Document association changed; reload before confirming')
            if encounter_id:
                event=self.db.execute('SELECT case_id FROM registry_encounters WHERE encounter_id=?',(encounter_id,)).fetchone()
                if not event or event[0]!=case_id:
                    raise ValueError('Encounter belongs to another case')
            item=dict(assignment_id='identity-'+uuid4().hex,document_id=document_id,case_id=case_id,
                encounter_id=encounter_id,identity_status='confirmed' if case_id else 'revoked',
                previous_assignment_id=expected_assignment_id,confirmed_by=reviewer,reason=reason,
                created_at_utc=now(),previous_identity=dict(case_id=old['case_id'],encounter_id=old['encounter_id']) if old else None)
            self.db.execute('INSERT INTO document_identity_events(assignment_id,document_id,case_id,encounter_id,previous_assignment_id,payload) VALUES(?,?,?,?,?,?)',
                (item['assignment_id'],document_id,case_id,encounter_id,expected_assignment_id,encode(item)))
            self.registry._audit('document_identity_confirmed' if case_id else 'document_identity_revoked',item)
        return item

    def latest_review(self,package_id,revision,observation_id):
        row=self.db.execute('SELECT payload FROM review_decisions WHERE package_id=? AND revision=? AND observation_id=? ORDER BY sequence DESC LIMIT 1',
                            (package_id,revision,observation_id)).fetchone()
        return json.loads(row[0]) if row else None

    def history(self,package_id,revision,observation_id):
        return [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM review_decisions WHERE package_id=? AND revision=? AND observation_id=? ORDER BY sequence',
                                                       (package_id,revision,observation_id))]

    def review(self,package_id,revision,observation_id,*,action,actor,role,reason,
               changes=None,expected_review_id=None,expected_assignment_id=None,
               verification_level='source_verified',replaces_review_ids=None):
        reviewer=actor_info(actor,role)
        reason=text(reason,'Review reason')
        if action not in ACTIONS:
            raise ValueError('Unknown review action')
        if role=='assistant' and action!='suggest':
            raise ValueError('Assistant assessment cannot verify or reject source data')
        if action=='suggest' and role!='assistant':
            raise ValueError('Suggestions must be labelled assistant assessments')
        if verification_level not in {'source_verified','clinically_assessed'} or (
                verification_level=='clinically_assessed' and role!='clinician'):
            raise ValueError('Clinical assessment requires declared clinician role')
        changes={} if changes is None else changes
        validate_values(changes)
        if action not in {'correct','suggest'} and changes:
            raise ValueError('Only correction/suggestion actions may change values')
        if action=='correct' and not changes:
            raise ValueError('Correction needs an explicit value change')
        replaces_review_ids=[] if replaces_review_ids is None else replaces_review_ids
        if (not isinstance(replaces_review_ids,list) or any(not isinstance(r,str) for r in replaces_review_ids)
                or len(set(replaces_review_ids))!=len(replaces_review_ids)):
            raise ValueError('Replacement decision IDs must be unique')
        if replaces_review_ids and action not in {'accept','correct'}:
            raise ValueError('Only an accepted result may explicitly replace another reviewed result')
        with self.transaction():
            package=self.registry.package(package_id,revision)
            original=next((o for o in package['observations'] if o['observation_id']==observation_id),None)
            if original is None:
                raise ValueError('Observation is outside this package revision')
            previous=self.latest_review(package_id,revision,observation_id)
            if (previous['review_id'] if previous else None)!=expected_review_id:
                raise ValueError('Review changed; reload before saving')
            # Correction snapshots start with the last human value, never a
            # pending assistant suggestion. Withdraw/reject never mutate raw.
            prior_human=[r for r in self.history(package_id,revision,observation_id)
                         if r['reviewer']['declared_role'] in HUMAN_ROLES]
            previous_human=prior_human[-1] if prior_human else None
            before=copy.deepcopy(previous_human['after'] if previous_human and previous_human['action'] in {'accept','correct'}
                                 else original['source_data'])
            after=copy.deepcopy(before)
            after.update(changes)
            validate_values({k:v for k,v in after.items() if k in EDITABLE})
            identity=self.assignment(original['document_id'])
            if action in {'accept','correct'} and (not identity or identity['identity_status']!='confirmed'):
                raise ValueError('Confirm document case identity before accepting values')
            if action in {'accept','correct'}:
                if identity['assignment_id']!=expected_assignment_id:
                    raise ValueError('Document association changed; reload before accepting values')
                validate_result(after,original['component'])
            for rid in replaces_review_ids:
                row=self.db.execute('SELECT payload FROM review_decisions WHERE review_id=?',(rid,)).fetchone()
                prior=json.loads(row[0]) if row else None
                if not prior or prior['action'] not in {'accept','correct'} or prior['reviewer']['declared_role'] not in HUMAN_ROLES:
                    raise ValueError('Replacement must reference a previous human accepted decision')
                history=self.history(prior['package_id'],prior['revision'],prior['observation_id'])
                human=[r for r in history if r['reviewer']['declared_role'] in HUMAN_ROLES]
                if human[-1]['review_id']!=rid:
                    raise ValueError('Replacement target is no longer the current human decision')
                if prior['assignment_id']!=identity['assignment_id']:
                    raise ValueError('Replacement target has a different document association')
                if (prior['document_id'],prior['field_id'],prior['component'],prior['case_id'])!=(
                        original['document_id'],original['field_id'],original['component'],identity['case_id']):
                    raise ValueError('Replacement must refer to the same document, field and confirmed case')
            item=dict(review_id='review-'+uuid4().hex,package_id=package_id,revision=revision,
                observation_id=observation_id,document_id=original['document_id'],field_id=original['field_id'],component=original['component'],
                action=action,reviewer=reviewer,verification_level=verification_level if action in {'accept','correct'} else None,
                reason=reason,created_at_utc=now(),before=before,after=after,
                original_source=copy.deepcopy(original['source_data']),evidence_ids=original['evidence_ids'],
                original_date_evidence_ids=original.get('date_evidence_ids',[]),
                original_metadata_candidate_id=original.get('metadata_candidate_id'),
                date_review_method='explicit_human_source_review' if action in {'accept','correct'} else None,
                previous_review_id=expected_review_id,assignment_id=identity['assignment_id'] if identity else None,
                case_id=identity['case_id'] if identity else None,encounter_id=identity['encounter_id'] if identity else None,
                replaces_review_ids=replaces_review_ids)
            self.db.execute('INSERT INTO review_decisions(review_id,package_id,revision,observation_id,assignment_id,previous_review_id,payload) VALUES(?,?,?,?,?,?,?)',
                (item['review_id'],package_id,revision,observation_id,item['assignment_id'],expected_review_id,encode(item)))
            self.registry._audit('review_decision_recorded',item)
        return item

    def effective_pool(self,case_id,*,encounter_id=None):
        """All explicitly accepted measurements; OCR revisions never choose latest values."""
        if not self.db.execute('SELECT 1 FROM registry_cases WHERE case_id=?',(case_id,)).fetchone():
            raise KeyError('Unknown registry case')
        # Assistant suggestions are a separate history layer and do not revoke
        # or supersede a human decision.
        latest={}
        replaced=set()
        for row in self.db.execute('SELECT payload FROM review_decisions ORDER BY sequence'):
            review=json.loads(row[0])
            if review['reviewer']['declared_role'] in HUMAN_ROLES:
                latest[(review['package_id'],review['revision'],review['observation_id'])]=review
                # Replacement is an explicit historical decision. Withdrawing
                # the replacement must not silently resurrect superseded data.
                replaced.update(review['replaces_review_ids'])
        accepted=[]
        for review in latest.values():
            if review['action'] not in {'accept','correct'} or review['case_id']!=case_id:
                continue
            identity=self.assignment(review['document_id'])
            if not identity or identity['assignment_id']!=review['assignment_id'] or identity['identity_status']!='confirmed':
                continue
            if encounter_id is not None and identity['encounter_id']!=encounter_id:
                continue
            accepted.append(review)
        selected={}
        for review in accepted:
            if review['review_id'] in replaced:
                continue
            key=(review['observation_id'],review['assignment_id'])
            selected.setdefault(key,[]).append(review)
        observations=[]
        for reviews in selected.values():
            # The exact same source entity can be reviewed in two revisions.
            # Preserve both human decisions; conflicting accepted values are
            # exposed and excluded until a human resolves them explicitly.
            values={encode({k:v for k,v in r['after'].items() if k in EDITABLE}) for r in reviews}
            conflict=len(values)>1
            for review in reviews[:1] if not conflict else reviews:
                observations.append(dict(observation_id=review['observation_id'],field_id=review['field_id'],
                    component=review['component'],document_id=review['document_id'],case_id=case_id,
                    encounter_id=review['encounter_id'],value={k:v for k,v in review['after'].items() if k in EDITABLE},
                    evidence_ids=review['evidence_ids'],review_ids=[r['review_id'] for r in reviews],
                    original_date_evidence_ids=review.get('original_date_evidence_ids',[]),
                    original_metadata_candidate_id=review.get('original_metadata_candidate_id'),
                    date_review_method=review.get('date_review_method'),
                    package_id=review['package_id'],revision=review['revision'],
                    review_status='conflict' if conflict else review['verification_level'],
                    eligible_for_verified_pool=not conflict))
        return dict(schema_version='reviewed-pool-view-0.1',case_id=case_id,encounter_id=encounter_id,
                    observations=observations,selection_policy='explicit_human_decisions_preserve_measurements',
                    identity_status='confirmed_document_associations_only')

    def summary(self):
        return dict(cases=[json.loads(r[0]) for r in self.db.execute('SELECT payload FROM registry_cases ORDER BY registry_code')],
            encounters=[json.loads(r[0]) for r in self.db.execute('SELECT payload FROM registry_encounters')],
            packages=[dict(r) for r in self.db.execute('SELECT package_id,revision,dictionary_version FROM packages ORDER BY package_id,revision')],
            integrity=self.registry.integrity())
