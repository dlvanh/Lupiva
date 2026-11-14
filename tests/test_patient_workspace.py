"""Complete catalogs and real transactions, using exclusively synthetic values."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace,record_patient_batch,StalePatient,mark_prior_ocr
from registry_pool.dictionary import digest
from registry_export.view import snapshot
from test_source_review import fixture,DICTIONARY


class PatientWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'synthetic.sqlite'
        self.store=ReviewStore(self.path);self.package=fixture()
        self.store.registry.import_package(self.package,DICTIONARY)
        self.person=dict(actor='Synthetic bulk reviewer',role='source_reviewer')
        self.case=self.store.create_case('SYNTHETIC-BULK',**self.person)
        self.did=self.package['documents'][0]['document_id']
        self.assignment=self.store.assign_document(self.did,case_id=self.case['case_id'],reason='Synthetic',**self.person)

    def tearDown(self):self.store.close();self.tmp.cleanup()

    def view(self,case=None):return patient_workspace(self.store,DICTIONARY,(case or self.case)['case_id'])

    def payload(self,**changes):
        view=self.view()
        request=dict(case_id=self.case['case_id'],selection_ids=[c['selection_id'] for c in view['candidates']],
            action='approve',request_id='synthetic-batch-1',expected_snapshot_sha256=view['review_snapshot_sha256'],
            reason='Synthetic batch only',**self.person)
        request.update(changes);return request

    def record(self,payload=None,**changes):
        return record_patient_batch(self.store,DICTIONARY,verify_sources=lambda keys:None,**(payload or self.payload(**changes)))

    def rerun(self,reference=None):
        package=copy.deepcopy(self.package)
        package.update(package_id='SYNTHETIC-RERUN',created_at_utc='2099-01-01T00:00:00+00:00')
        package['source_run']['provenance']={'review_workspace':{'mode':'complete_document_rerun',
            'replaces':[reference or dict(package_id=self.package['package_id'],revision=1,sha256=digest(self.package))]}}
        self.store.registry.import_package(package,DICTIONARY)
        return package

    def test_rerun_display_preserves_approvals_exports_and_pending_correction(self):
        self.record()
        original=self.view()
        blood=next(c for c in original['candidates'] if c['kind']=='specimen' and c['value']['sample_type']=='blood')
        proposed=self.store.propose_source_correction(self.package['package_id'],1,candidate_type='specimen',
            candidate_id=blood['candidate_id'],changes={'collection_date':'17/02/2031'},
            evidence_ids=blood['evidence_ids'],reason='Synthetic pending correction',request_id='before-rerun',
            expected_package_sha256=digest(self.package),expected_candidate_sha256=blood['source_candidate_sha256'],
            expected_review_id=blood['source_review']['review_id'],expected_correction_id=None,**self.person)
        effective=copy.deepcopy(self.store.effective_pool(self.case['case_id']))
        exported=snapshot(self.path,DICTIONARY)
        review_counts={t:self.store.db.execute('SELECT COUNT(*) FROM '+t).fetchone()[0]
            for t in ('review_decisions','source_review_decisions','source_corrections')}
        self.rerun()
        view=self.view()
        self.assertEqual(view['prior_ocr'],{'candidates':5,'pending_corrections':1})
        self.assertEqual(len(view['candidates']),10)
        active=[c for c in view['candidates'] if not c.get('prior_ocr')]
        self.assertEqual(len(active),5)
        self.assertTrue(all(c['review_status']=='pending' for c in active))
        self.assertEqual(view['counts']['observations'],1)
        self.assertEqual(view['confidence_summary']['pending'],5)
        self.assertEqual(self.store.effective_pool(self.case['case_id']),effective)
        for group in ('observations','metadata','specimens'):
            self.assertEqual(snapshot(self.path,DICTIONARY)[group],exported[group])
        for table,count in review_counts.items():
            self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],count)
        old_blood=next(c for c in view['candidates'] if c.get('prior_ocr') and c['candidate_id']==blood['candidate_id'])
        self.assertEqual(old_blood['pending_correction']['correction_id'],proposed['correction']['correction_id'])
        self.assertTrue(old_blood['current_revision'])
        # The proposal is still actionable against its original immutable source.
        self.store.record_source_batch(self.package['package_id'],1,decisions=[dict(candidate_type='specimen',
            candidate_id=blood['candidate_id'],action='approve',expected_review_id=blood['source_review']['review_id'],
            expected_candidate_sha256=blood['source_candidate_sha256'],correction_id=proposed['correction']['correction_id'])],
            request_id='after-rerun-correction',expected_package_sha256=digest(self.package),
            reason='Synthetic explicit correction approval',**self.person)
        corrected=self.store.source_reviewed_pool(self.package['package_id'],1)['specimen_candidates']
        self.assertEqual(next(s for s in corrected if s['value']['sample_type']=='blood')['value']['collection_datetime']['date'],'2031-02-17')

    def test_rerun_requires_exact_old_package_hash_and_same_document_coverage(self):
        self.rerun(dict(package_id=self.package['package_id'],revision=1,sha256='f'*64))
        self.assertEqual(self.view()['prior_ocr']['candidates'],0)
        newer=copy.deepcopy(self.package)
        newer.update(package_id='OTHER',created_at_utc='2099-01-01T00:00:00+00:00')
        newer['documents'][0]['document_id']='doc-'+'b'*64
        newer['source_run']['provenance']={'review_workspace':{'mode':'complete_document_rerun',
            'replaces':[dict(package_id=self.package['package_id'],revision=1,sha256=digest(self.package))]}}
        row=dict(package_id=self.package['package_id'],revision=1,pending_correction=None)
        result=mark_prior_ocr([row],{(self.package['package_id'],1):self.package,('OTHER',1):newer},
            {self.did,'doc-'+'b'*64})
        self.assertEqual(result['candidates'],0)
        self.assertNotIn('prior_ocr',row)

    def test_complete_catalog_without_values_and_patient_isolation(self):
        view=self.view()
        self.assertEqual(len(view['fields']),261)
        self.assertEqual(sum(len(f['components']) for f in view['fields']),377)
        self.assertEqual(view['counts']['observations'],1)
        self.assertEqual(view['counts']['metadata'],1)
        self.assertEqual(view['counts']['specimens'],3)
        self.assertEqual({f['field_id'] for f in view['fields']},{f['field_id'] for f in DICTIONARY['fields']})
        empty=self.store.create_case('SYNTHETIC-EMPTY',**self.person)
        other=self.view(empty)
        self.assertEqual(other['candidates'],[])
        self.assertEqual(other['counts']['fields'],261)
        self.assertTrue(all(not c['candidate_ids'] for f in other['fields'] for c in f['components']))
        self.assertTrue(any(c['status']=='requires_clinical_assessment' for f in other['fields'] for c in f['components']))
        # No patient-scoped claim that a whole package was searched and negative.
        self.assertFalse(any(c['status']=='not_found' for f in other['fields'] for c in f['components']))
        with self.assertRaises(ValueError):self.record(self.payload(case_id=empty['case_id'],expected_snapshot_sha256=other['review_snapshot_sha256']))

    def test_approve_all_types_preserves_missing_and_unchecked_source_values(self):
        original=copy.deepcopy(self.package);result=self.record()
        self.assertEqual(result['batch']['counts'],{'observation':1,'metadata':1,'specimen':3})
        self.assertFalse(result['batch']['clinical_assessment'])
        self.assertEqual(len(self.store.effective_pool(self.case['case_id'])['observations']),1)
        view=self.view()
        self.assertTrue(all(c['review_status']=='accepted' for c in view['candidates']))
        self.assertEqual(view['candidates'][0]['value'].get('source_date'),None)
        samples=[c for c in view['candidates'] if c['kind']=='specimen']
        self.assertTrue(all(c['value']['collection_datetime']['date'] is None for c in samples))
        self.assertIn('unchecked',{c['value']['checkbox_state'] for c in samples})
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),original)
        self.assertEqual(len(view['review_batches']),1)
        self.assertEqual(self.store.summary()['encounters'],[])
        self.assertEqual(self.store.registry.integrity()['sqlite'],'ok')

    def test_retry_is_idempotent_but_request_id_cannot_change_scope(self):
        request=self.payload();first=self.record(request)
        before=self.store.registry.integrity()['audit_events']
        again=self.record(request)
        self.assertEqual(again['status'],'already_recorded')
        self.assertEqual(again['batch'],first['batch'])
        self.assertEqual(self.store.registry.integrity()['audit_events'],before)
        with self.assertRaisesRegex(ValueError,'nội dung khác'):self.record(dict(request,action='reject'))

    def test_stale_case_review_and_reassignment_rejected_without_partial_writes(self):
        request=self.payload()
        self.store.review(self.package['package_id'],1,self.package['observations'][0]['observation_id'],
            action='accept',expected_assignment_id=self.assignment['assignment_id'],reason='Synthetic',**self.person)
        with self.assertRaises(StalePatient):self.record(request)
        request=self.payload()
        self.store.assign_document(self.did,case_id=self.case['case_id'],expected_assignment_id=self.assignment['assignment_id'],
            reason='Synthetic reassignment',**self.person)
        before=self.store.registry.integrity()['audit_events']
        with self.assertRaises(StalePatient):self.record(request)
        self.assertEqual(self.store.registry.integrity()['audit_events'],before)
        self.assertEqual(self.view()['review_batches'],[])

    def test_failure_after_observation_decision_rolls_back_everything(self):
        before=self.store.registry.integrity()['audit_events']
        with patch.object(self.store,'record_source_batch',side_effect=ValueError('Synthetic source failure')):
            with self.assertRaisesRegex(ValueError,'Synthetic source failure'):self.record()
        self.assertEqual(self.store.effective_pool(self.case['case_id'])['observations'],[])
        self.assertEqual(self.store.source_review_index(self.package['package_id'],1),{})
        self.assertEqual(self.store.registry.integrity()['audit_events'],before)
        self.assertEqual(self.record()['status'],'recorded')

    def test_correction_overlay_kept_when_reapproved_in_bulk(self):
        oid=self.package['observations'][0]['observation_id']
        self.store.review(self.package['package_id'],1,oid,action='correct',changes={'numeric_value':'0.6600'},
            expected_assignment_id=self.assignment['assignment_id'],reason='Synthetic corrected value',**self.person)
        self.record()
        obs=self.store.effective_pool(self.case['case_id'])['observations']
        self.assertEqual(obs[0]['value']['numeric_value'],'0.6600')
        self.assertEqual(obs[0]['review_status'],'source_verified')
        # Case review does not rewrite or claim approval of the original OCR.
        self.assertNotIn(('observation',oid),self.store.source_review_index(self.package['package_id'],1))

    def test_no_empty_duplicate_assistant_unknown_or_stale_revision_approval(self):
        request=self.payload();sid=request['selection_ids'][0]
        for changes in [dict(selection_ids=[]),dict(selection_ids=[sid,sid]),dict(selection_ids=['missing']),
                        dict(role='assistant'),dict(reason=''),dict(action='correct')]:
            with self.assertRaises(ValueError):self.record(dict(request,**changes))
        self.assertEqual(self.view()['review_batches'],[])

    def test_withdraw_batch_revokes_export_eligibility_without_changing_source(self):
        self.record()
        self.record(request_id='synthetic-withdraw',action='withdraw')
        self.assertEqual(self.store.effective_pool(self.case['case_id'])['observations'],[])
        self.assertTrue(all(c['review_status']=='withdraw' for c in self.view()['candidates']))
        self.assertEqual(len(self.view()['review_batches']),2)
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),self.package)

    def test_source_verification_failure_is_atomic_and_does_not_affect_nonapproval_actions(self):
        verify=lambda keys:(_ for _ in ()).throw(ValueError('Synthetic changed bundle'))
        with self.assertRaisesRegex(ValueError,'changed bundle'):
            record_patient_batch(self.store,DICTIONARY,verify_sources=verify,**self.payload())
        self.assertEqual(self.view()['review_batches'],[])
        record_patient_batch(self.store,DICTIONARY,verify_sources=verify,**self.payload(action='needs_clarification'))
        self.assertTrue(all(c['review_status']=='needs_clarification' for c in self.view()['candidates']))


if __name__=='__main__':unittest.main()
