"""Synthetic non-CRF fields keep source identity, corrections and human review."""
import copy
from pathlib import Path
import tempfile
import unittest

from ocr_pool import convert_documents
from registry_pool.dictionary import digest
from registry_pool.exchange import convert_candidate
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace,record_patient_batch,StalePatient
from registry_review.corrections import editable_source,corrected_value
from registry_export.view import snapshot
from test_source_review import CATALOG,DICTIONARY


class NonCrfFieldTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.path=Path(self.tmp.name)/'synthetic.sqlite'
        docs=[]
        for i,rows in enumerate(['HCT\t0.350\tL/L\nC3\t0.75\tg/L','HCT\t0.360\tL/L\nMCH\t29.2\tpg'],1):
            docs.append(dict(document_id=f'SYNTHETIC-{i}',input_path=f'synthetic-{i}.png',
                input_sha256=str(i)*64,context={'specimen':'blood'},tables=[dict(
                    table_id=f'T-{i}',raw='Test\tResult\tUnit\n'+rows)]))
        self.package=convert_candidate(convert_documents(docs,CATALOG),DICTIONARY,package_id='SYNTHETIC-NON-CRF')
        self.store=ReviewStore(self.path);self.store.registry.import_package(self.package,DICTIONARY)
        self.person=dict(actor='Synthetic reviewer',role='source_reviewer')
        self.case=self.store.create_case('SYNTHETIC-NON-CRF',**self.person)
        for d in self.package['documents']:
            self.store.assign_document(d['document_id'],case_id=self.case['case_id'],reason='Synthetic',**self.person)

    def tearDown(self):self.store.close();self.tmp.cleanup()

    def view(self):return patient_workspace(self.store,DICTIONARY,self.case['case_id'])

    def test_separate_fields_preserve_repeated_source_values_and_empty_catalog(self):
        view=self.view()
        self.assertEqual((view['counts']['fields'],view['counts']['components']),(261,377))
        self.assertEqual((view['counts']['non_crf_fields'],view['counts']['non_crf_results']),(2,3))
        self.assertEqual({f['crf_membership'] for f in view['fields']},{'crf'})
        extra={f['label']:f for f in view['supplemental_fields']}
        self.assertEqual(set(extra),{'HCT','MCH'})
        self.assertTrue(all(f['crf_membership']=='non_crf' for f in extra.values()))
        ids=extra['HCT']['components'][0]['candidate_ids']
        self.assertEqual(len(ids),2)
        values=[c for c in view['candidates'] if c['selection_id'] in ids]
        self.assertEqual(len({c['document_id'] for c in values}),2)
        self.assertEqual({c['value']['value']['results']['result'] for c in values},{'0.350','0.360'})
        self.assertTrue(all(c['correction_fields']==['result:result','unit_raw'] for c in values))
        empty=self.store.create_case('SYNTHETIC-EMPTY',**self.person)
        other=patient_workspace(self.store,DICTIONARY,empty['case_id'])
        self.assertEqual(other['supplemental_fields'],[])
        self.assertEqual(other['counts']['non_crf_results'],0)

    def test_mixed_batch_approves_selected_crf_and_non_crf_with_one_receipt(self):
        before=copy.deepcopy(self.package);view=self.view()
        selected=[c for c in view['candidates'] if c['kind']=='observation' or c['value']['value']['name']=='HCT']
        request=dict(case_id=self.case['case_id'],selection_ids=[c['selection_id'] for c in selected],
            action='approve',request_id='synthetic-mixed',expected_snapshot_sha256=view['review_snapshot_sha256'],
            reason='Synthetic source comparison',verify_sources=lambda keys:None,**self.person)
        result=record_patient_batch(self.store,DICTIONARY,**request)
        self.assertEqual(result['batch']['counts'],{'observation':1,'metadata':2,'specimen':0})
        updated=self.view();fields={f['label']:f for f in updated['supplemental_fields']}
        self.assertEqual(fields['HCT']['components'][0]['status'],'accepted')
        self.assertEqual(fields['MCH']['components'][0]['status'],'pending')
        self.assertEqual([f['field_id'] for f in view['supplemental_fields']],
                         [f['field_id'] for f in updated['supplemental_fields']])
        self.assertEqual(record_patient_batch(self.store,DICTIONARY,**request)['status'],'already_recorded')
        exported=snapshot(self.path,DICTIONARY,synthetic=True)
        self.assertEqual(len(exported['metadata']),2)
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),before)
        self.assertEqual(self.store.summary()['encounters'],[])

    def correction_request(self,**overrides):
        item=self.package['metadata_candidates'][0]
        request=dict(package_id=self.package['package_id'],revision=1,candidate_type='metadata',
            candidate_id=item['candidate_id'],changes={'result:result':'0.355','unit_raw':'%'},
            evidence_ids=item['evidence_ids'],reason='Synthetic source transcription',request_id='synthetic-correct',
            expected_package_sha256=digest(self.package),expected_candidate_sha256=digest(item),
            expected_review_id=None,expected_correction_id=None,**self.person)
        return dict(request,**overrides)

    def test_typed_extra_correction_stays_pending_until_explicit_approval(self):
        before=self.view();item=self.package['metadata_candidates'][0]
        proposal=self.store.propose_source_correction(**self.correction_request())['correction']
        current=next(c for c in self.view()['candidates'] if c['candidate_id']==item['candidate_id'])
        self.assertEqual(current['value']['value']['results']['result'],'0.350')
        self.assertEqual(current['pending_correction']['correction_id'],proposal['correction_id'])
        self.store.record_source_batch(self.package['package_id'],1,request_id='synthetic-approve-edit',
            expected_package_sha256=digest(self.package),reason='Synthetic verify edit',decisions=[dict(
                candidate_type='metadata',candidate_id=item['candidate_id'],action='approve',
                expected_review_id=None,expected_candidate_sha256=digest(item),correction_id=proposal['correction_id'])],**self.person)
        updated=self.view();current=next(c for c in updated['candidates'] if c['candidate_id']==item['candidate_id'])
        self.assertEqual(current['value']['value']['results']['result'],'0.355')
        self.assertEqual(current['value']['value']['parsed_results']['result']['numeric_value'],'0.355')
        self.assertEqual(current['value']['value']['unit_raw'],'%')
        self.assertEqual(len(current['correction_history']),1)
        self.assertEqual(len(current['evidence_ids']),len(item['evidence_ids']))
        exported=snapshot(self.path,DICTIONARY,synthetic=True)
        self.assertEqual(exported['metadata'][0]['value']['value']['unit_raw'],'%')
        self.assertEqual(self.store.registry.package(self.package['package_id'],1),self.package)
        with self.assertRaises(StalePatient):
            record_patient_batch(self.store,DICTIONARY,case_id=self.case['case_id'],
                selection_ids=[current['selection_id']],action='approve',request_id='stale',
                expected_snapshot_sha256=before['review_snapshot_sha256'],reason='Synthetic',
                verify_sources=lambda keys:None,**self.person)

    def test_extra_editor_rejects_json_unknown_slots_missing_and_remapping(self):
        for changes in ({'value_raw':'{}'},{'result:unknown':'4'},{'clinical_field_id':'HEM01'},
                        {'result:result':None},{'result:result':'---'},{'result:result':{'numeric_value':'4'}}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):
                self.store.propose_source_correction(**self.correction_request(changes=changes))
        self.assertEqual(self.store.correction_history(self.package['package_id'],1,'metadata',
            self.package['metadata_candidates'][0]['candidate_id']),[])

    def test_unit_only_and_qualitative_corrections_keep_explicit_strings(self):
        item=copy.deepcopy(self.package['metadata_candidates'][0]);data=item['source_data']
        data['value'].update(specimen='urine',results={'result':'Negative'})
        changed=corrected_value('metadata',item,data,{'result:result':'(+)','unit_raw':None})
        self.assertEqual(changed['value']['parsed_results']['result']['symbolic_value'],'(+)')
        self.assertIsNone(changed['value']['unit_raw'])
        data['value'].update(class_raw='o',interpretation='borderline')
        self.assertEqual(editable_source('metadata',item),['unit_raw'])
        with self.assertRaises(ValueError):corrected_value('metadata',item,data,{'result:result':'2'})
        self.assertEqual(corrected_value('metadata',item,data,{'unit_raw':'U/mL'})['value']['interpretation'],'borderline')


if __name__=='__main__':unittest.main()
