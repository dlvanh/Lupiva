"""Cached mapping fixes add pending components without replacing reviewed data."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from ocr_pool import convert_documents
from registry_pool.exchange import build_bundle,verify_bundle,read
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace
from scripts.build_source_supplement import build_supplement
from test_source_review import CATALOG,DICTIONARY


class MappingSupplementTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        image=self.root/'synthetic.png';Image.new('RGB',(8,8),'white').save(image)
        raw=('Test\tResult\tUnit\nC3\t0.81\tg/L\n'
             'Tỉ lệ Protein niệu / Creatinin niệu UPCR\t0.19\tmg/mg\n'
             'Kháng thể kháng nhân (anti-ANA) bằng kỹ thuật huyền quang\tNucleolar\t')
        self.docs=[dict(document_id='SYNTHETIC',input_path='synthetic.png',
            input_sha256=hashlib.sha256(image.read_bytes()).hexdigest(),context={'specimen':'urine'},
            tables=[dict(table_id='T',raw=raw)])]
        candidate=convert_documents(self.docs,CATALOG)
        # A source snapshot with only C3 models a previously unmapped row. The
        # cached OCR still contains the full source, never reference answers.
        candidate['observations']=[o for o in candidate['observations'] if o['field_id']=='IMM11']
        candidate['metadata_candidates']=[]
        needed={e for o in candidate['observations'] for e in o['evidence_ids']}
        candidate['evidence']=[e for e in candidate['evidence'] if e['evidence_id'] in needed]
        for fid,f in candidate['fields'].items():
            items=[o for o in candidate['observations'] if o['field_id']==fid]
            f.update(observation_ids=[o['observation_id'] for o in items],
                extraction_status='found' if items else 'not_processed',reason=None,
                review_status='pending' if items else 'not_reviewed')
        run=self.root/'run';run.mkdir();(run/'raw').mkdir();(run/'crops').mkdir()
        (run/'raw/T.txt').write_text(raw,encoding='utf-8');Image.new('RGB',(8,8),'white').save(run/'crops/T.png')
        (run/'candidate-pool.json').write_text(json.dumps(candidate,ensure_ascii=False),encoding='utf-8')
        (run/'ocr-tables.json').write_text(json.dumps({'documents':self.docs},ensure_ascii=False),encoding='utf-8')
        self.base_path=self.root/'base'
        self.base=build_bundle(run,self.base_path,DICTIONARY,self.root)

    def tearDown(self):self.tmp.cleanup()

    def build(self,**options):
        return build_supplement(self.base_path,[],self.root/'extension',
            mapping_fields=['REN01','IMM01'],workspace=self.root,**options)

    def test_bundle_adds_only_missing_components_and_keeps_raw_evidence(self):
        before=copy.deepcopy(self.base);package=self.build()
        self.assertEqual({(o['field_id'],o['component']) for o in package['observations']},
                         {('REN01','result'),('IMM01','result'),('IMM01','method')})
        self.assertEqual(package['metadata_candidates'],[])
        self.assertEqual(verify_bundle(self.base_path,DICTIONARY),before)
        self.assertEqual(verify_bundle(self.root/'extension',DICTIONARY),package)
        self.assertEqual((self.root/'extension/artifacts/raw/T.txt').read_text(encoding='utf-8'),self.docs[0]['tables'][0]['raw'])
        pattern=next(o for o in package['observations'] if o['component']=='result' and o['field_id']=='IMM01')
        self.assertEqual(pattern['source_data']['pattern_raw'],'Nucleolar')
        self.assertIn('huyền quang',pattern['source_data']['name_raw'])
        provenance=package['source_run']['provenance']
        self.assertFalse(provenance['inference_rerun']);self.assertFalse(provenance['automatic_approval'])
        self.assertTrue(all(o['source_data']['review_status']=='pending' for o in package['observations']))
        with self.assertRaisesRegex(ValueError,'No newly mapped'):
            build_supplement(self.root/'extension',[],self.root/'duplicate',
                mapping_fields=['REN01','IMM01'],workspace=self.root)

    def test_import_preserves_old_accepted_values_and_patient_assignment(self):
        store=ReviewStore(self.root/'synthetic.sqlite')
        try:
            store.registry.import_package(self.base,DICTIONARY)
            person=dict(actor='Synthetic reviewer',role='source_reviewer')
            case=store.create_case('SYNTHETIC-MAPPING',**person)
            assignment=store.assign_document(self.base['documents'][0]['document_id'],
                case_id=case['case_id'],reason='Synthetic',**person)
            store.review(self.base['package_id'],1,self.base['observations'][0]['observation_id'],action='accept',
                reason='Synthetic',expected_assignment_id=assignment['assignment_id'],**person)
            before=copy.deepcopy(store.effective_pool(case['case_id']))
            store.registry.import_package(self.build(),DICTIONARY)
            self.assertEqual(store.effective_pool(case['case_id']),before)
            view=patient_workspace(store,DICTIONARY,case['case_id'])
            self.assertEqual(sorted(c['review_status'] for c in view['candidates']),['accepted','pending','pending','pending'])
            self.assertEqual(store.assignment(self.base['documents'][0]['document_id']),assignment)
        finally:store.close()

    def test_changed_cached_artifact_is_rejected(self):
        (self.base_path/'artifacts/raw/T.txt').write_text('changed',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'Missing/changed bundle asset'):self.build()

    def test_new_extension_revision_does_not_duplicate_pending_components(self):
        first=self.build()
        second=build_supplement(self.base_path,[],self.root/'extension-v2',
            mapping_fields=['REN01','IMM01'],workspace=self.root,package_id=first['package_id'],revision=2,
            supersedes=dict(package_id=first['package_id'],revision=1))
        store=ReviewStore(self.root/'revision.sqlite')
        try:
            for package in (self.base,first):store.registry.import_package(package,DICTIONARY)
            person=dict(actor='Synthetic reviewer',role='source_reviewer')
            case=store.create_case('SYNTHETIC-REVISION',**person)
            store.assign_document(self.base['documents'][0]['document_id'],case_id=case['case_id'],reason='Synthetic',**person)
            store.registry.import_package(second,DICTIONARY)
            view=patient_workspace(store,DICTIONARY,case['case_id'])
            added=[c for c in view['candidates'] if c['package_id']==first['package_id']]
            self.assertEqual(len(view['candidates']),4)
            self.assertEqual(len(added),3)
            self.assertTrue(all(c['revision']==2 and c['review_status']=='pending' for c in added))
            self.assertEqual(verify_bundle(self.root/'extension',DICTIONARY),first)
        finally:store.close()

    def test_mapping_mode_forbids_transcriptions_retries_and_unknown_fields(self):
        for options in ({'transcriptions':self.root/'unknown.json'},{'region_ids':['T']}):
            with self.subTest(options=options),self.assertRaisesRegex(ValueError,'only verified cached OCR'):
                self.build(**options)
        with self.assertRaisesRegex(ValueError,'known CRF fields'):
            build_supplement(self.base_path,[],self.root/'invalid',mapping_fields=['UNKNOWN'],workspace=self.root)
        with self.assertRaisesRegex(ValueError,'only verified cached OCR'):
            build_supplement(self.base_path,[self.root/'retry'],self.root/'invalid',mapping_fields=['REN01'],workspace=self.root)


if __name__=='__main__':unittest.main()
