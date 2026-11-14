"""Generic source correction lifecycle using new, exclusively synthetic records."""
import copy
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from registry_pool.dictionary import digest
from registry_review import ReviewStore
from registry_review.workspace import patient_workspace,record_patient_batch,StalePatient
from registry_export.view import snapshot
from registry_export.redcap import export_data
from test_source_review import fixture,DICTIONARY


class SourceCorrectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'future-document.sqlite'
        self.store=ReviewStore(self.path);self.package=fixture()
        self.package['package_id']='FUTURE-SYNTHETIC-DOCUMENT'
        self.store.registry.import_package(self.package,DICTIONARY)
        self.person=dict(actor='Synthetic reviewer',role='source_reviewer')
        self.sample=self.package['specimen_candidates'][0]
        self.metadata=self.package['metadata_candidates'][0]
        self.case=self.store.create_case('FUTURE-CASE',**self.person)
        self.store.assign_document(self.sample['document_id'],case_id=self.case['case_id'],reason='Synthetic',**self.person)

    def tearDown(self):self.store.close();self.tmp.cleanup()

    def proposal(self,kind='specimen',item=None,**changes):
        item=item or (self.sample if kind=='specimen' else self.metadata)
        cid=item['sample_id' if kind=='specimen' else 'candidate_id']
        review=self.store.source_review_index(self.package['package_id'],1).get((kind,cid))
        history=self.store.correction_history(self.package['package_id'],1,kind,cid)
        result=dict(package_id=self.package['package_id'],revision=1,candidate_type=kind,candidate_id=cid,
            changes={'collection_date':'17/02/2031'} if kind=='specimen' else {'value_raw':'NEW-SID-987'},
            evidence_ids=item['evidence_ids'],reason='Read the synthetic source',request_id='proposal-1',
            expected_package_sha256=digest(self.package),expected_candidate_sha256=digest(item),
            expected_review_id=review['review_id'] if review else None,
            expected_correction_id=history[-1]['correction_id'] if history else None,**self.person)
        result.update(changes);return result

    def review(self,kind='specimen',item=None,correction=None,action='approve',request_id='approval-1',**options):
        item=item or (self.sample if kind=='specimen' else self.metadata)
        cid=item['sample_id' if kind=='specimen' else 'candidate_id']
        previous=self.store.source_review_index(self.package['package_id'],1).get((kind,cid))
        decision=dict(candidate_type=kind,candidate_id=cid,action=action,expected_candidate_sha256=digest(item),
            expected_review_id=previous['review_id'] if previous else None)
        if correction:decision['correction_id']=correction['correction_id']
        return self.store.record_source_batch(self.package['package_id'],1,decisions=[decision],request_id=request_id,
            expected_package_sha256=digest(self.package),reason='Synthetic source approval',**dict(self.person,**options))

    def pool(self):return self.store.source_reviewed_pool(self.package['package_id'],1)

    def test_pending_then_explicit_approval_exports_corrected_value_and_history(self):
        self.review()
        original=copy.deepcopy(self.package)
        proposal=self.store.propose_source_correction(**self.proposal())['correction']
        self.assertIsNone(self.pool()['specimen_candidates'][0]['value']['collection_datetime']['date'])
        self.review(correction=proposal,request_id='approve-edit')
        item=self.pool()['specimen_candidates'][0]
        self.assertEqual(item['value']['collection_datetime']['date'],'2031-02-17')
        self.assertNotIn('collection_date',item['incomplete_attributes'])
        self.assertEqual(item['correction_id'],proposal['correction_id'])
        self.assertIsNone(item['correction_history'][0]['before']['collection_datetime']['date'])
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),original)
        exported=snapshot(self.path,DICTIONARY,synthetic=True)
        self.assertEqual(exported['specimens'][0]['value']['collection_datetime']['date'],'2031-02-17')
        csv_path=Path(self.tmp.name)/'out.csv'
        export_data(exported,csv_path,Path(self.tmp.name)/'ledger.sqlite','synthetic-correction')
        import csv
        with csv_path.open(encoding='utf-8-sig') as stream:rows=list(csv.DictReader(stream))
        self.assertEqual(next(r for r in rows if r['redcap_repeat_instrument']=='sample_collection')['collection_date'],'2031-02-17')
        self.assertEqual(self.store.summary()['encounters'],[])

    def test_approval_retry_and_new_proposal_are_idempotent_and_snapshot_bound(self):
        request=self.proposal()
        first=self.store.propose_source_correction(**request)
        again=self.store.propose_source_correction(**request)
        self.assertEqual(again['status'],'already_recorded');self.assertEqual(again['correction'],first['correction'])
        with self.assertRaises(ValueError):self.store.propose_source_correction(**dict(request,reason='Changed'))
        second=self.store.propose_source_correction(**self.proposal(request_id='second',changes={'collection_date':'02/11/2030'}))['correction']
        with self.assertRaisesRegex(ValueError,'Correction changed'):self.review(correction=first['correction'])
        self.review(correction=second)
        self.assertEqual(self.pool()['specimen_candidates'][0]['value']['collection_datetime']['date'],'2030-11-02')

    def test_correction_requires_same_source_evidence_and_valid_explicit_text(self):
        for changes in ({'collection_date':'0510812026'},{'collection_date':'31/02/2031'},
                        {'collection_time':'25:20'},{'amount':'-2 mL'},{'amount':'1.5 samples'},
                        {'clinical_field_id':'YES'},{'sample_type':'stool'},{'checkbox_state':'negative'}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):
                self.store.propose_source_correction(**self.proposal(changes=changes))
        for extra in ({'evidence_ids':[]},{'evidence_ids':['not-this-document']},{'expected_candidate_sha256':'f'*64},
                      {'expected_package_sha256':'f'*64},{'expected_correction_id':'old'},{'expected_review_id':'old'}):
            with self.subTest(extra=extra),self.assertRaises(ValueError):
                self.store.propose_source_correction(**self.proposal(**extra))
        self.assertEqual(self.store.correction_history(self.package['package_id'],1,'specimen',self.sample['sample_id']),[])

    def test_metadata_edit_uses_normalization_and_preserves_separate_observations(self):
        proposal=self.store.propose_source_correction(**self.proposal(kind='metadata'))['correction']
        self.assertEqual(self.pool()['metadata_candidates'],[])
        self.review(kind='metadata',correction=proposal)
        self.assertEqual(self.pool()['metadata_candidates'][0]['value']['value'],'NEW-SID-987')
        self.assertEqual(self.store.registry.package(self.package['package_id'],1)['observations'],self.package['observations'])
        with self.assertRaisesRegex(ValueError,'withdraw source approval'):
            self.store.propose_source_correction(**self.proposal(kind='metadata',request_id='empty-metadata',changes={'value_raw':None}))
        # Identifier formatting is checked independently of this fixture's value.
        with self.assertRaises(ValueError):
            self.store.propose_source_correction(**self.proposal(kind='metadata',request_id='bad-id',changes={'value_raw':'bad id with spaces'}))

    def test_reapprove_preserves_corrected_values_and_new_pending_does_not_replace_them(self):
        proposal=self.store.propose_source_correction(**self.proposal())['correction']
        self.review(correction=proposal)
        self.review(request_id='reapprove')
        self.store.propose_source_correction(**self.proposal(request_id='new-pending',changes={'collection_date':'09/12/2032'}))
        workspace=patient_workspace(self.store,DICTIONARY,self.case['case_id'])
        sample=next(c for c in workspace['candidates'] if c['candidate_id']==self.sample['sample_id'])
        self.assertEqual(sample['value']['collection_datetime']['date'],'2031-02-17')
        self.assertIsNotNone(sample['pending_correction'])
        record_patient_batch(self.store,DICTIONARY,case_id=self.case['case_id'],selection_ids=[sample['selection_id']],
            action='approve',request_id='bulk-current',expected_snapshot_sha256=workspace['review_snapshot_sha256'],
            reason='Keep the approved current value',verify_sources=lambda keys:None,**self.person)
        self.assertEqual(self.pool()['specimen_candidates'][0]['value']['collection_datetime']['date'],'2031-02-17')

    def test_stale_proposals_do_not_cross_reviews_candidates_or_revisions(self):
        proposal=self.store.propose_source_correction(**self.proposal())['correction']
        self.review(request_id='approve-original')
        with self.assertRaisesRegex(ValueError,'base review changed'):self.review(correction=proposal,request_id='stale')
        with self.assertRaisesRegex(ValueError,'Correction changed'):
            self.review(item=self.package['specimen_candidates'][1],correction=proposal,request_id='other-sample')
        revised=copy.deepcopy(self.package);revised['revision']=2
        revised['supersedes']=dict(package_id=self.package['package_id'],revision=1)
        self.store.registry.import_package(revised,DICTIONARY)
        with self.assertRaisesRegex(ValueError,'current package revision'):
            self.store.propose_source_correction(**self.proposal(request_id='old-revision'))
        with self.assertRaisesRegex(ValueError,'current revision'):self.review(correction=proposal,request_id='old-approval')

    def test_assistant_may_propose_but_cannot_approve_and_history_is_immutable(self):
        proposal=self.store.propose_source_correction(**self.proposal(actor='Synthetic assistant',role='assistant'))['correction']
        with self.assertRaisesRegex(ValueError,'human reviewer'):
            self.review(correction=proposal,role='assistant')
        with self.assertRaises(sqlite3.IntegrityError):
            self.store.db.execute('DELETE FROM source_corrections')
        self.store.db.rollback()
        self.assertEqual(len(self.store.correction_history(self.package['package_id'],1,'specimen',self.sample['sample_id'])),1)

    def test_audit_failure_rolls_back_proposal_and_new_proposal_invalidates_patient_snapshot(self):
        workspace=patient_workspace(self.store,DICTIONARY,self.case['case_id'])
        with patch.object(self.store.registry,'_audit',side_effect=RuntimeError('Synthetic failure')):
            with self.assertRaises(RuntimeError):self.store.propose_source_correction(**self.proposal())
        self.assertEqual(self.store.correction_history(self.package['package_id'],1,'specimen',self.sample['sample_id']),[])
        self.store.propose_source_correction(**self.proposal())
        with self.assertRaises(StalePatient):
            record_patient_batch(self.store,DICTIONARY,case_id=self.case['case_id'],
                selection_ids=[workspace['candidates'][0]['selection_id']],action='approve',request_id='stale-bulk',
                expected_snapshot_sha256=workspace['review_snapshot_sha256'],reason='Synthetic',verify_sources=lambda keys:None,**self.person)

    def test_missing_reasons_follow_new_patient_documents_and_dictionary(self):
        empty=self.store.create_case('NO-DOCUMENT',**self.person)
        workspace=patient_workspace(self.store,DICTIONARY,empty['case_id'])
        self.assertTrue(any(c['reason']=='no_linked_documents' for f in workspace['fields'] for c in f['components']))
        workspace=patient_workspace(self.store,DICTIONARY,self.case['case_id'])
        self.assertTrue(any(c['reason']=='extraction_not_supported' for f in workspace['fields'] for c in f['components']))
        self.assertTrue(any(c['reason']=='no_candidate_in_linked_documents' for f in workspace['fields'] for c in f['components']))
        self.assertFalse(any(c['reason']=='target_not_recorded' for f in workspace['fields'] for c in f['components']))

    def test_withdrawing_pending_proposal_preserves_current_approval_and_allows_new_proposal(self):
        self.review()
        current=self.pool()
        proposal=self.store.propose_source_correction(**self.proposal())['correction']
        request=self.proposal(action='withdraw',changes={},request_id='cancel-pending')
        with self.assertRaisesRegex(ValueError,'human reviewer'):
            self.store.propose_source_correction(**dict(request,role='assistant'))
        result=self.store.propose_source_correction(**request)
        self.assertEqual(result['correction']['status'],'withdrawn')
        self.assertEqual(self.store.propose_source_correction(**request)['status'],'already_recorded')
        self.assertEqual(self.pool(),current)
        self.assertIsNone(self.store.pending_correction(self.package['package_id'],1,'specimen',self.sample['sample_id'],
            self.store.source_review_index(self.package['package_id'],1)['specimen',self.sample['sample_id']]))
        with self.assertRaises(ValueError):self.review(correction=proposal,request_id='resurrect-cancelled')
        self.store.propose_source_correction(**self.proposal(request_id='replacement',changes={'collection_date':'07/04/2034'}))
