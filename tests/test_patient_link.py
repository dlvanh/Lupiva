"""Explicit user patient linkage on synthetic sources; atomic and retry-safe."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from registry_pool.dictionary import digest
from registry_review.store import ReviewStore
from registry_review.source import candidates
from registry_review.patient import record_patient
from registry_export.view import snapshot
from test_source_review import fixture,DICTIONARY


class PatientLinkTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'test.sqlite'
        self.package=fixture();self.store=ReviewStore(self.path)
        self.store.registry.import_package(self.package,DICTIONARY)
        self.person=dict(actor='Synthetic conversation user',role='source_reviewer')
        self.payload=dict(document_ids=[d['document_id'] for d in self.package['documents']],
            registry_code='SYNTHETIC-PATIENT',request_id='patient-test',actor=self.person['actor'],
            recorded_by='Synthetic assistant recorder',authorization_quote='SYNTHETIC: These documents belong to one patient; use the approved values.',
            reason='Synthetic source approval plus explicit patient linkage',expected_package_sha256=digest(self.package))

    def tearDown(self):self.store.close();self.tmp.cleanup()

    def approve(self):
        return self.store.record_source_batch(self.package['package_id'],1,
            decisions=[dict(candidate_type=k,candidate_id=cid,action='approve',expected_review_id=None,
                expected_candidate_sha256=digest(item)) for (k,cid),item in candidates(self.package).items()],
            request_id='source-test',expected_package_sha256=digest(self.package),reason='Synthetic',**self.person)

    def record(self,**overrides):return record_patient(self.path,self.package,**dict(self.payload,**overrides))

    def test_source_approvals_and_user_quote_required_before_any_patient_mutation(self):
        with self.assertRaisesRegex(ValueError,'source approval'):self.record()
        self.assertEqual(self.store.summary()['cases'],[])
        self.approve()
        with self.assertRaisesRegex(ValueError,'authorization'):self.record(authorization_quote='')
        self.assertEqual(self.store.summary()['cases'],[])

    def test_patient_pool_keeps_source_provenance_no_inferred_visits_and_retry_is_idempotent(self):
        self.approve();before=self.store.registry.package(self.package['package_id'],1)
        result=self.record();count=self.store.registry.integrity()['audit_events']
        self.assertEqual(result['accepted_observations'],1)
        self.assertEqual(result['encounters_created'],0)
        self.assertFalse(result['clinical_assessment'])
        case=result['case'];self.assertEqual(case['recorded_by'],self.payload['recorded_by'])
        self.assertEqual(case['authorization_quote'],self.payload['authorization_quote'])
        self.assertIsNone(case['study_id'])
        s=snapshot(self.path,DICTIONARY,synthetic=True)
        self.assertEqual((len(s['cases']),len(s['documents']),len(s['observations']),len(s['metadata']),len(s['specimens'])),(1,1,1,1,3))
        self.assertEqual(s['encounters'],[])
        self.assertIsNone(s['observations'][0]['encounter_id'])
        self.assertIsNone(s['observations'][0]['value']['source_date'])
        review=self.store.latest_review(self.package['package_id'],1,self.package['observations'][0]['observation_id'])
        self.assertEqual(review['origin'],'user_instruction')
        self.assertEqual(review['reviewer']['name'],self.person['actor'])
        self.assertEqual(review['recorded_by'],self.payload['recorded_by'])
        self.assertTrue(review['source_review_id'])
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),before)
        self.assertEqual(self.record()['status'],'already_recorded')
        self.assertEqual(self.store.registry.integrity()['audit_events'],count)
        with self.assertRaisesRegex(ValueError,'reused'):self.record(registry_code='different')

    def test_batch_rolls_back_case_assignments_acceptances_and_audit_after_failure(self):
        self.approve();before=self.store.registry.integrity()['audit_events']
        with patch.object(ReviewStore,'review',side_effect=ValueError('Synthetic failure')):
            with self.assertRaisesRegex(ValueError,'Synthetic failure'):self.record()
        self.assertEqual(self.store.summary()['cases'],[])
        self.assertEqual(self.store.registry.integrity()['audit_events'],before)
        self.assertIsNone(self.store.assignment(self.payload['document_ids'][0]))
        self.assertEqual(self.record()['accepted_observations'],1)

    def test_never_silently_reassign_existing_document_or_accept_wrong_source_approval(self):
        self.approve();other=self.store.create_case('OTHER',**self.person)
        identity=self.store.assign_document(self.payload['document_ids'][0],case_id=other['case_id'],reason='Synthetic',**self.person)
        with self.assertRaisesRegex(ValueError,'identity history'):self.record()
        self.assertEqual(len(self.store.summary()['cases']),1)
        with self.assertRaisesRegex(ValueError,'source approval'):
            self.store.review(self.package['package_id'],1,self.package['observations'][0]['observation_id'],
                action='accept',reason='Synthetic',expected_assignment_id=identity['assignment_id'],
                source_review_id='wrong-source-id',**self.person)


if __name__=='__main__':unittest.main()
