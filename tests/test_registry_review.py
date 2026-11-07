"""Review transitions on synthetic sources only; no actual human decisions."""
import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ocr_pool import convert_documents
from registry_pool.dictionary import build_dictionary
from registry_pool.exchange import convert_candidate
from registry_review import ReviewStore
from registry_review.store import validate_result

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)


def fixture(value='0.65',revision=1):
    source=convert_documents([dict(document_id='SYNTHETIC',input_path='synthetic.png',input_sha256='a'*64,
        tables=[dict(table_id='T',raw='Test\tResult\tUnit\nC3\t'+value+'\tg/L',format='auto')])],CATALOG)
    return convert_candidate(source,DICTIONARY,package_id='SYNTHETIC',revision=revision,
        supersedes={'package_id':'SYNTHETIC','revision':revision-1} if revision>1 else None)


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'synthetic.sqlite'
        self.store=ReviewStore(self.path)
        self.package=fixture()
        self.store.registry.import_package(self.package,DICTIONARY)
        self.oid=self.package['observations'][0]['observation_id']
        self.did=self.package['documents'][0]['document_id']
        self.person=dict(actor='Synthetic operator',role='source_reviewer')
        self.case=self.store.create_case('SYNTHETIC-CASE',**self.person)
        self.cid=self.case['case_id']

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def assign(self,case_id=None,**kwargs):
        return self.store.assign_document(self.did,case_id=case_id or self.cid,
            reason='Synthetic identity test',**self.person,**kwargs)

    def decide(self,action='accept',revision=1,oid=None,**kwargs):
        oid=oid or self.oid
        previous=self.store.latest_review('SYNTHETIC',revision,oid)
        identity=self.store.assignment(self.did)
        defaults=dict(action=action,reason='Synthetic review test',**self.person,
            expected_review_id=previous['review_id'] if previous else None,
            expected_assignment_id=identity['assignment_id'] if identity else None)
        defaults.update(kwargs)
        return self.store.review('SYNTHETIC',revision,oid,**defaults)

    def values(self):
        return self.store.effective_pool(self.cid)['observations']

    def test_import_is_pending_until_explicit_identity_and_acceptance(self):
        self.assertIsNone(self.case['study_id'])
        with self.assertRaisesRegex(ValueError,'Confirm document'):
            self.decide()
        self.assign()
        self.assertEqual(self.values(),[])
        self.decide()
        self.assertEqual(len(self.values()),1)
        self.assertEqual(self.values()[0]['value']['numeric_value'],'0.65')
        self.assertNotIn('review_status',self.values()[0]['value'])
        self.assertEqual(self.store.registry.package('SYNTHETIC'),self.package)
        self.assertEqual(self.package['observations'][0]['source_data']['review_status'],'pending')

    def test_case_and_encounter_need_human_and_explicit_distinct_identifiers(self):
        with self.assertRaises(ValueError):
            self.store.create_case('OTHER',actor='Assistant',role='assistant')
        second=self.store.create_case('SECOND',study_id='STUDY-002',**self.person)
        event=self.store.create_encounter(second['case_id'],label='Synthetic sample',**self.person)
        with self.assertRaisesRegex(ValueError,'another case'):
            self.assign(encounter_id=event['encounter_id'])
        with self.assertRaises(ValueError):
            self.store.create_encounter(self.cid,label='Bad date',event_date='20260805',**self.person)
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.create_case('THIRD',study_id='STUDY-002',**self.person)

    def test_encounter_filter_keeps_explicit_sample_event(self):
        event=self.store.create_encounter(self.cid,label='Sample A',event_type='sample_collection',
            event_date='2026-08-05',**self.person)
        self.assign(encounter_id=event['encounter_id'])
        self.decide()
        self.assertEqual(len(self.store.effective_pool(self.cid,encounter_id=event['encounter_id'])['observations']),1)
        self.assertEqual(self.store.effective_pool(self.cid,encounter_id='other')['observations'],[])

    def test_correction_preserves_before_original_evidence_and_audit(self):
        self.assign()
        review=self.decide('correct',changes={'numeric_value':'0.67'})
        self.assertEqual(review['before']['numeric_value'],'0.65')
        self.assertEqual(review['after']['numeric_value'],'0.67')
        self.assertEqual(review['original_source'],self.package['observations'][0]['source_data'])
        self.assertEqual(review['evidence_ids'],self.package['observations'][0]['evidence_ids'])
        self.assertEqual(self.store.registry.integrity()['audit_events'],4)
        self.assertEqual(self.store.registry.integrity()['foreign_key_errors'],[])
        self.assertEqual(self.values()[0]['value']['numeric_value'],'0.67')

    def test_date_evidence_and_metadata_origin_survive_a_human_date_correction(self):
        source=convert_documents([dict(document_id='SYNTHETIC',input_path='synthetic.png',input_sha256='b'*64,
            metadata_context={'date_order':'DMY'},text_regions=[dict(table_id='DATE',raw='Ngay lay mau: 05/08/2026')],
            tables=[dict(table_id='T',raw='Test\tResult\tUnit\nC3\t0.65\tg/L',format='auto')])],CATALOG)
        package=convert_candidate(source,DICTIONARY,package_id='SYNTHETIC-DATED')
        self.store.registry.import_package(package,DICTIONARY)
        observation=package['observations'][0]
        assignment=self.store.assign_document(package['documents'][0]['document_id'],case_id=self.cid,
            reason='Synthetic dated source',**self.person)
        self.assertTrue(observation['date_evidence_ids'])
        decision=self.store.review('SYNTHETIC-DATED',1,observation['observation_id'],action='correct',
            changes={'source_date':'2026-08-06'},reason='Synthetic human date correction',
            expected_assignment_id=assignment['assignment_id'],**self.person)
        value=self.values()[0]
        self.assertEqual(decision['original_date_evidence_ids'],observation['date_evidence_ids'])
        self.assertEqual(value['original_date_evidence_ids'],observation['date_evidence_ids'])
        self.assertEqual(value['original_metadata_candidate_id'],observation['metadata_candidate_id'])
        self.assertEqual(value['date_review_method'],'explicit_human_source_review')
        self.assertEqual(decision['original_source']['source_date'],'2026-08-05')
        self.assertEqual(value['value']['source_date'],'2026-08-06')

    def test_assistant_can_only_suggest_and_cannot_revoke_human_acceptance(self):
        self.assign()
        first=self.decide()
        for action in ['accept','correct','reject','withdraw','needs_clarification']:
            with self.assertRaisesRegex(ValueError,'Assistant assessment'):
                self.decide(action,actor='Assistant',role='assistant')
        suggestion=self.decide('suggest',actor='Assistant',role='assistant',changes={'numeric_value':'0.99'})
        self.assertIsNone(suggestion['verification_level'])
        self.assertEqual(self.values()[0]['value']['numeric_value'],'0.65')
        self.assertEqual(self.values()[0]['review_ids'],[first['review_id']])

    def test_source_reviewer_cannot_claim_clinical_assessment(self):
        self.assign()
        with self.assertRaisesRegex(ValueError,'Clinical assessment'):
            self.decide(verification_level='clinically_assessed')
        self.decide(actor='Synthetic clinician',role='clinician',verification_level='clinically_assessed')
        self.assertEqual(self.values()[0]['review_status'],'clinically_assessed')

    def test_review_and_identity_optimistic_concurrency(self):
        identity=self.assign()
        self.decide()
        with self.assertRaisesRegex(ValueError,'Review changed'):
            self.decide('reject',expected_review_id=None)
        with self.assertRaisesRegex(ValueError,'association changed'):
            self.assign(expected_assignment_id=None)
        self.assign(expected_assignment_id=identity['assignment_id'])
        with self.assertRaisesRegex(ValueError,'association changed'):
            self.decide(expected_assignment_id=identity['assignment_id'])
        self.assertEqual(self.values(),[])
        self.decide()
        self.assertEqual(len(self.values()),1)

    def test_concurrent_connection_cannot_save_stale_review(self):
        self.assign()
        other=ReviewStore(self.path)
        try:
            stale=other.latest_review('SYNTHETIC',1,self.oid)
            self.assertIsNone(stale)
            self.decide()
            with self.assertRaisesRegex(ValueError,'Review changed'):
                other.review('SYNTHETIC',1,self.oid,action='reject',reason='Stale',**self.person)
        finally:
            other.close()

    def test_identity_revocation_and_reassignment_require_new_acceptance(self):
        identity=self.assign()
        self.decide()
        revoked=self.store.assign_document(self.did,case_id=None,expected_assignment_id=identity['assignment_id'],
            reason='Synthetic revoke',**self.person)
        self.assertEqual(self.values(),[])
        self.assign(expected_assignment_id=revoked['assignment_id'])
        self.assertEqual(self.values(),[])
        self.decide()
        self.assertEqual(len(self.values()),1)

    def test_reject_clarify_and_withdraw_remove_eligibility(self):
        self.assign()
        for action in ['reject','needs_clarification','withdraw']:
            self.decide()
            self.decide(action)
            self.assertEqual(self.values(),[])

    def test_reaccept_after_withdrawal_does_not_restore_old_correction(self):
        self.assign()
        self.decide('correct',changes={'numeric_value':'0.7'})
        self.decide('withdraw')
        review=self.decide()
        self.assertEqual(review['before']['numeric_value'],'0.65')
        self.assertEqual(self.values()[0]['value']['numeric_value'],'0.65')

    def test_new_ocr_revision_does_not_override_accepted_value(self):
        self.assign()
        old=self.decide('correct',changes={'numeric_value':'0.7'})
        second=fixture('0.8',2)
        self.store.registry.import_package(second,DICTIONARY)
        self.assertEqual(self.values()[0]['review_ids'],[old['review_id']])
        self.assertEqual(self.values()[0]['revision'],1)

    def test_same_source_in_two_revisions_deduplicates_or_exposes_conflict(self):
        self.assign()
        self.decide()
        self.store.registry.import_package(fixture(revision=2),DICTIONARY)
        self.decide(revision=2)
        self.assertEqual(len(self.values()),1)
        self.assertEqual(len(self.values()[0]['review_ids']),2)
        self.decide('correct',revision=2,changes={'numeric_value':'0.9'})
        self.assertEqual(len(self.values()),2)
        self.assertTrue(all(o['review_status']=='conflict' and not o['eligible_for_verified_pool'] for o in self.values()))

    def test_withdrawing_replacement_does_not_resurrect_old_acceptance(self):
        self.assign()
        first=self.decide()
        second=fixture('0.8',2)
        self.store.registry.import_package(second,DICTIONARY)
        oid=second['observations'][0]['observation_id']
        self.decide(revision=2,oid=oid,replaces_review_ids=[first['review_id']])
        self.assertEqual(len(self.values()),1)
        self.assertEqual(self.values()[0]['value']['numeric_value'],'0.8')
        self.decide('withdraw',revision=2,oid=oid)
        self.assertEqual(self.values(),[])
        # Restoring an older measurement requires another explicit decision.
        self.decide()
        self.assertEqual(len(self.values()),1)

    def test_replacement_chain_cannot_resurrect_intermediate_values(self):
        self.assign()
        previous=self.decide()
        for revision,value in [(2,'0.8'),(3,'0.9')]:
            package=fixture(value,revision)
            self.store.registry.import_package(package,DICTIONARY)
            oid=package['observations'][0]['observation_id']
            previous=self.decide(revision=revision,oid=oid,replaces_review_ids=[previous['review_id']])
        self.assertEqual(len(self.values()),1)
        self.decide('withdraw',revision=3,oid=oid)
        self.assertEqual(self.values(),[])

    def test_cannot_replace_noncurrent_or_unaccepted_human_decision(self):
        self.assign()
        old=self.decide()
        rejected=self.decide('reject')
        second=fixture('0.8',2)
        self.store.registry.import_package(second,DICTIONARY)
        oid=second['observations'][0]['observation_id']
        for target in [old['review_id'],rejected['review_id'],'missing']:
            with self.assertRaises(ValueError):
                self.decide(revision=2,oid=oid,replaces_review_ids=[target])

    def test_failure_after_insert_rolls_back_review_and_audit(self):
        self.assign()
        before=self.store.registry.integrity()
        original=self.store.registry._audit
        def fail(*args):
            original(*args)
            raise RuntimeError('Synthetic audit failure')
        with patch.object(self.store.registry,'_audit',side_effect=fail):
            with self.assertRaisesRegex(RuntimeError,'audit failure'):
                self.decide()
        self.assertEqual(self.store.history('SYNTHETIC',1,self.oid),[])
        self.assertEqual(self.store.registry.integrity(),before)

    def test_review_tables_and_sources_are_immutable(self):
        self.assign()
        self.decide()
        for table in ['review_decisions','document_identity_events','registry_cases','observations']:
            with self.assertRaises(sqlite3.IntegrityError):
                self.store.db.execute('DELETE FROM '+table)
            self.store.db.rollback()
        self.assertEqual(self.store.registry.integrity()['sqlite'],'ok')

    def test_invalid_correction_attributes_and_typed_values_leave_no_review(self):
        self.assign()
        for changes in [
            {'numeric_value':None},{'numeric_value':'NaN'},{'numeric_value':0.7},
            {'result_type':'qualitative','qualitative_value':'positive'},
            {'comparator':None},{'source_date':'20260805'},
            {'source_date':'2026-08-05'},{'review_status':'source_verified'},
            {'result_type':None},{'numeric_value':'0.9','pattern_raw':'Homogeneous'},
        ]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):
                self.decide('correct',changes=changes)
        self.assertEqual(self.store.history('SYNTHETIC',1,self.oid),[])
        valid=self.decide('correct',changes={'result_type':'qualitative','qualitative_value':'positive',
            'numeric_value':None,'comparator':None})
        self.assertEqual(valid['after']['qualitative_value'],'positive')

    def test_typed_missing_and_intensity_interpretation_preserve_source_semantics(self):
        validate_result({'result_type':'missing','missing_reason':'source_placeholder','numeric_value':None})
        with self.assertRaises(ValueError):
            validate_result({'result_type':'missing','missing_reason':'unreadable'})
        validate_result({'result_type':'numeric','numeric_value':'6','comparator':'=',
            'qualitative_value':'negative'},component='intensity')
        for values in [
            {'result_type':'mixed','numeric_value':'1','comparator':'='},
            {'result_type':'pattern','pattern_raw':''},
            {'result_type':'semiquantitative','symbolic_value':None},
            {'result_type':'numeric','numeric_value':'0','comparator':'=','missing_reason':'source_placeholder'},
        ]:
            with self.subTest(values=values),self.assertRaises(ValueError):
                validate_result(values)


if __name__=='__main__':
    unittest.main()
