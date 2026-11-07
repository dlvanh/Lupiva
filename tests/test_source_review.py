"""User source approval history, immutable snapshots, and identity separation."""
import copy
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from ocr_pool import convert_documents
from registry_pool.dictionary import build_dictionary,digest
from registry_pool.exchange import convert_candidate
from registry_review import ReviewStore
from registry_review.source import candidates
from form_pool.sample_collection import extract_sample_collections

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)


def fixture():
    raw=('Sample type\tTime of collection\tAmount collected\tCell conc. (cell/mL)\tCell loaded on chip\tNote\n'
         '☑ Blood\t10:30 0510812026\t10 mL\t\t\t\n☑ Stool\t0510812026\t1 sample\t\t\t\n☐ Others, specify: skin\t\t\t\t\t')
    document=dict(document_id='SYNTHETIC',input_path='synthetic.png',input_sha256='a'*64,
        tables=[dict(table_id='T',raw='Test\tResult\tUnit\nC3\t0.65\tg/L',format='auto'),dict(table_id='F',raw=raw)],
        text_regions=[dict(table_id='H',raw='SID: 000123',purpose='metadata')])
    candidate=convert_documents([document],CATALOG)
    form=extract_sample_collections([document],date_order='DMY')
    candidate.update(schema_version='lupus-candidate-pool-0.3',specimen_schema_version=form['schema_version'],specimen_candidates=form['candidates'])
    for evidence in form['evidence']:
        evidence.setdefault('evidence_kind','sample_form_row')
        evidence.setdefault('row_index_0based',-1)
        evidence.setdefault('result_column_0based',None)
    candidate['evidence'].extend(form['evidence'])
    return convert_candidate(candidate,DICTIONARY,package_id='SYNTHETIC-SOURCE')


class SourceReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=ReviewStore(Path(self.tmp.name)/'synthetic.sqlite')
        self.package=fixture()
        self.store.registry.import_package(self.package,DICTIONARY)
        self.person=dict(actor='Synthetic source reviewer',role='source_reviewer')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def request(self,action='approve',kind=None,request_id='synthetic-request',**options):
        latest=self.store.source_review_index('SYNTHETIC-SOURCE',1)
        decisions=[]
        for (candidate_type,cid),item in candidates(self.package).items():
            if kind and kind!=candidate_type:
                continue
            previous=latest.get((candidate_type,cid))
            decisions.append(dict(candidate_type=candidate_type,candidate_id=cid,action=action,
                expected_review_id=previous['review_id'] if previous else None,expected_candidate_sha256=digest(item)))
        result=dict(decisions=decisions,request_id=request_id,expected_package_sha256=digest(self.package),
            reason='Synthetic source comparison only',**self.person)
        result.update(options)
        return result

    def record(self,**kwargs):
        return self.store.record_source_batch('SYNTHETIC-SOURCE',1,**self.request(**kwargs))

    def test_approval_covers_all_types_without_assigning_identity_or_mutating_ocr(self):
        result=self.record()
        self.assertEqual(result['batch']['counts'],{'observation':1,'metadata':1,'specimen':3})
        pool=self.store.source_reviewed_pool('SYNTHETIC-SOURCE',1)
        self.assertEqual(len(pool['fields']),261)
        self.assertEqual(pool['metadata_candidates'][0]['value']['value'],'000123')
        for group in ('observations','metadata_candidates','specimen_candidates'):
            self.assertTrue(all(r['review_status']=='source_verified' for r in pool[group]))
            self.assertTrue(all(r['eligible_for_verified_pool'] is False for r in pool[group]))
            self.assertTrue(all('review_status' not in r['value'] for r in pool[group]))
        self.assertEqual(self.store.registry.package('SYNTHETIC-SOURCE',1),self.package)
        self.assertEqual(self.store.summary()['cases'],[])
        self.assertTrue(all(d['assignment'] is None for d in pool['documents']))
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM review_decisions').fetchone()[0],0)

    def test_proxy_records_actual_authorization_and_separates_recorder_from_reviewer(self):
        result=self.record(origin='user_instruction',recorded_by='Synthetic assistant recorder',authorization_quote='SYNTHETIC authorization to approve this source snapshot')
        self.assertEqual(result['batch']['reviewer']['name'],self.person['actor'])
        self.assertEqual(result['batch']['recorded_by'],'Synthetic assistant recorder')
        self.assertIn('SYNTHETIC authorization',result['batch']['authorization_quote'])
        self.assertEqual(result['batch']['reviewer_identity_status'],'conversation_user_not_authenticated')
        with self.assertRaisesRegex(ValueError,'authorization'):
            self.record(request_id='no-authorization',origin='user_instruction',recorded_by='Assistant')

    def test_assistant_cannot_self_approve_and_proxy_provenance_cannot_be_omitted(self):
        with self.assertRaisesRegex(ValueError,'human reviewer'):
            self.record(actor='Assistant',role='assistant')
        with self.assertRaisesRegex(ValueError,'Proxy'):
            self.record(recorded_by='Assistant')
        self.assertEqual(self.store.source_review_index('SYNTHETIC-SOURCE',1),{})

    def test_missing_dates_and_unchecked_rows_remain_explicit_after_approval(self):
        self.record()
        samples=self.store.source_reviewed_pool('SYNTHETIC-SOURCE',1)['specimen_candidates']
        self.assertEqual(len(samples),3)
        for sample in samples:
            self.assertIsNone(sample['value']['collection_datetime']['date'])
            self.assertIn('collection_date',sample['incomplete_attributes'])
        self.assertEqual(samples[-1]['value']['checkbox_state'],'unchecked')
        self.assertIsNone(samples[-1]['value']['clinical_field_id'])

    def test_request_retry_is_idempotent_and_reused_id_cannot_change_content(self):
        request=self.request()
        first=self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        second=self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        self.assertEqual(second['status'],'already_recorded')
        self.assertEqual(second['batch'],first['batch'])
        self.assertEqual(self.store.db.execute('SELECT COUNT(*) FROM source_review_decisions').fetchone()[0],5)
        changed=dict(request,reason='changed')
        with self.assertRaisesRegex(ValueError,'reused'):
            self.store.record_source_batch('SYNTHETIC-SOURCE',1,**changed)

    def test_stale_previous_review_and_tampered_snapshots_rollback_entire_batch(self):
        request=self.request()
        self.record(request_id='other-request',kind='metadata')
        with self.assertRaisesRegex(ValueError,'review changed'):
            self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        self.assertEqual(len(self.store.source_review_index('SYNTHETIC-SOURCE',1)),1)
        request=self.request(request_id='tampered')
        request['decisions'][-1]['expected_candidate_sha256']='b'*64
        with self.assertRaisesRegex(ValueError,'snapshot changed'):
            self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        self.assertEqual(len(self.store.source_review_index('SYNTHETIC-SOURCE',1)),1)

    def test_withdrawal_excludes_values_without_resurrecting_prior_approvals(self):
        self.record()
        self.record(action='withdraw',kind='observation',request_id='withdraw')
        pool=self.store.source_reviewed_pool('SYNTHETIC-SOURCE',1)
        self.assertEqual(pool['observations'],[])
        self.assertEqual(len(pool['specimen_candidates']),3)
        self.assertEqual(pool['fields']['IMM06']['observation_ids'],[])
        for field in pool['fields'].values():
            self.assertEqual(field['observation_ids'],[])
        self.assertEqual(len(self.store.source_history('SYNTHETIC-SOURCE',1,'observation',self.package['observations'][0]['observation_id'])),2)

    def test_approval_does_not_transfer_to_new_ocr_revision_even_for_identical_values(self):
        self.record()
        second=copy.deepcopy(self.package)
        second.update(revision=2,supersedes={'package_id':'SYNTHETIC-SOURCE','revision':1})
        self.store.registry.import_package(second,DICTIONARY)
        self.assertEqual(self.store.source_reviewed_pool('SYNTHETIC-SOURCE',2)['observations'],[])
        self.assertEqual(len(self.store.source_reviewed_pool('SYNTHETIC-SOURCE',1)['observations']),1)

    def test_source_approval_never_auto_accepts_into_a_case_even_after_identity_confirmation(self):
        self.record()
        case=self.store.create_case('SYNTHETIC-CASE',**self.person)
        self.store.assign_document(self.package['documents'][0]['document_id'],case_id=case['case_id'],
            reason='Synthetic identity confirmation',**self.person)
        self.assertEqual(self.store.effective_pool(case['case_id'])['observations'],[])

    def test_wrong_package_hash_and_duplicate_candidates_are_rejected(self):
        request=self.request()
        request['expected_package_sha256']='b'*64
        with self.assertRaisesRegex(ValueError,'package changed'):
            self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        request=self.request()
        request['decisions'].append(copy.deepcopy(request['decisions'][0]))
        with self.assertRaisesRegex(ValueError,'repeated'):
            self.store.record_source_batch('SYNTHETIC-SOURCE',1,**request)
        self.assertEqual(self.store.source_batches('SYNTHETIC-SOURCE',1),[])

    def test_history_is_immutable_and_audit_failure_rolls_back_every_decision(self):
        with patch.object(self.store.registry,'_audit',side_effect=RuntimeError('Synthetic audit failure')):
            with self.assertRaises(RuntimeError):
                self.record()
        self.assertEqual(self.store.source_review_index('SYNTHETIC-SOURCE',1),{})
        self.assertEqual(self.store.source_batches('SYNTHETIC-SOURCE',1),[])
        self.record()
        for table in ('source_review_batches','source_review_decisions'):
            with self.assertRaises(sqlite3.IntegrityError):
                self.store.db.execute('DELETE FROM '+table)
            self.store.db.rollback()
        self.assertEqual(self.store.registry.integrity()['foreign_key_errors'],[])


if __name__=='__main__':
    unittest.main()
