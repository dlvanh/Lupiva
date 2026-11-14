"""Synthetic source statements: no patient identity, diagnosis or score inference."""
import copy
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import sqlite3

from ocr_pool import convert_documents
from registry_pool.exchange import convert_candidate
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace
from scripts.export_pool_sqlite import export_pool

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=json.loads((ROOT/'schemas/pool-dictionary.json').read_text(encoding='utf-8-sig'))


def doc(text='', tables=(), purpose='clinical_context', **options):
    return dict(document_id='SYNTHETIC',input_sha256='a'*64,input_path='synthetic.jpg',
        text_regions=[dict(table_id='SYNTHETIC-text',raw=text,purpose=purpose,**options)] if text else [],
        tables=list(tables))


def table(rows, **context):
    return dict(table_id='SYNTHETIC-table',raw=rows,format='html',context=context)


class SupplementalTests(unittest.TestCase):
    def convert(self,d):return convert_documents([d],CATALOG)

    def test_sqlite_exports_text_span_evidence_without_inventing_table_rows(self):
        pool=self.convert(doc('Ordering provider: Synthetic Physician',tables=[table(
            '<table><tr><th>Test</th><th>Result</th><th>Unit</th></tr>'
            '<tr><td>Ure</td><td>5.2</td><td>mmol/L</td></tr></table>')]))
        non_rows=[e for e in pool['evidence'] if 'row_index_0based' not in e]
        self.assertTrue(non_rows)
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/'synthetic.sqlite';export_pool(pool,target)
            db=sqlite3.connect(target)
            try:
                for e in non_rows:
                    row,payload=db.execute('SELECT row_index,attributes_json FROM evidence WHERE evidence_id=?',(e['evidence_id'],)).fetchone()
                    self.assertIsNone(row)
                    self.assertEqual(json.loads(payload),e)
                self.assertTrue(db.execute('SELECT count(*) FROM evidence WHERE row_index IS NOT NULL').fetchone()[0])
                self.assertFalse(db.execute('PRAGMA foreign_key_check').fetchall())
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertFalse(db.execute("SELECT count(*) FROM observations WHERE review_status!='pending' OR eligible_for_verified_pool!=0").fetchone()[0])
            finally:db.close()

    def test_sqlite_still_rejects_table_evidence_without_a_source_row(self):
        pool=self.convert(doc(tables=[table('<table><tr><th>Test</th><th>Result</th></tr>'
            '<tr><td>Ure</td><td>5.2</td></tr></table>')]))
        del pool['evidence'][0]['row_index_0based']
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError,'source row index'):
                export_pool(pool,Path(tmp)/'invalid.sqlite')

    def test_source_roles_and_uncertainty_preserved_without_disease_flags(self):
        c=self.convert(doc('Chẩn đoán: Theo dõi xơ cứng bì- viêm phổi kẽ Passport:\n'
            'Người chỉ định: Bác sĩ Tổng hợp Giờ chỉ định: 09:00 01/02/2026\n'
            'Người lấy mẫu: Nhân viên Tổng hợp\n'))
        facts={m['key']:m for m in c['metadata_candidates']}
        self.assertTrue(facts['source_diagnosis']['source_uncertain'])
        self.assertNotIn('Passport',facts['source_diagnosis']['value'])
        self.assertEqual(facts['ordering_provider']['value'],'Bác sĩ Tổng hợp')
        self.assertEqual([(o['field_id'],o['component']) for o in c['observations']],[('ADM08','result')])
        self.assertEqual(c['observations'][0]['source_role'],'ordering_provider')
        self.assertTrue(all(m['review_status']=='pending' for m in c['metadata_candidates']))
        convert_candidate(c,DICTIONARY)

    def test_questions_empty_names_dates_and_bad_generations_do_not_become_values(self):
        for text in ['Chẩn đoán: direct coombs test? lấy ở đâu?',
                     'Người chỉ định:\nNgười lấy mẫu: 09:41 01/02/2026']:
            c=self.convert(doc(text))
            self.assertFalse(c['observations'])
            self.assertFalse(c['metadata_candidates'])
        for options in [dict(truncated=True),dict(generation_status='error'),dict(supplemental_exclude=True)]:
            self.assertFalse(self.convert(doc('Diagnosis: possible ILD',**options))['metadata_candidates'])

    def test_ana_explicit_method_without_inventing_titre_or_equipment_method(self):
        c=self.convert(doc(tables=[table('<table><tr><th>Test</th><th>Result</th></tr>'
            '<tr><td>Kháng thể kháng nhân (anti-ANA) bằng kỹ thuật huỳnh quang</td>'
            '<td>Homogeneous 3+</td></tr></table>')]))
        method=[o for o in c['observations'] if o['component']=='method']
        self.assertEqual(method[0]['qualitative_value'],'huỳnh quang')
        self.assertFalse(any(o['component']=='titre' for o in c['observations']))
        convert_candidate(c,DICTIONARY)
        d=doc(tables=[table('<table><tr><th>Test</th><th>Result</th></tr>'
            '<tr><td>ANA EuroLine</td><td>Negative</td></tr></table>')])
        self.assertFalse(any(o['component']=='method' for o in self.convert(d)['observations']))

    def test_unmapped_antigens_retain_class_and_exclude_controls_and_legends(self):
        t=table('<table><tr><th>Antigen</th><th>Intensity</th><th>Class</th></tr>'
            '<tr><td>NXP2 (NXP2)</td><td>4</td><td>o</td></tr>'
            '<tr><td>OJ (OJ)</td><td>11</td><td>(+)</td></tr>'
            '<tr><td>Control (Co)</td><td>192</td><td>+++</td></tr>'
            '<tr><td>Label (La)</td><td>-1</td><td></td></tr></table>',
            panel='myositis',class_legend={'0':'negative','(+)':'borderline'},
            intensity_ranges={'0':[0,7],'(+)':[8,14]},
            ocr_context_evidence=[dict(purpose='printed_class_legend',region_id='legend',raw_sha256='synthetic')])
        legend=table('<table><tr><th>Class</th><th>Intensity</th><th>Explanation</th></tr>'
            '<tr><td>0</td><td>0 - 7</td><td>Negative</td></tr></table>')
        legend.update(table_id='legend',purpose='source_legend')
        t['context']['ocr_context_evidence'][0]['raw_sha256']=hashlib.sha256(legend['raw'].encode()).hexdigest()
        c=self.convert(doc(tables=[t,legend]))
        extra=[m['value'] for m in c['metadata_candidates'] if m['key']=='additional_lab_result']
        self.assertEqual([x['name'] for x in extra],['NXP2','OJ'])
        self.assertEqual([x['interpretation'] for x in extra],['negative','borderline'])
        self.assertTrue(all(x['clinical_field_id'] is None for x in extra))
        convert_candidate(c,DICTIONARY)  # Shared legend evidence must not duplicate content-addressed IDs.
        self.assertEqual(sum(e.get('label_raw')=='Printed class legend' for e in c['evidence']),1)
        del t['context']['intensity_ranges']
        unresolved=self.convert(doc(tables=[t,legend]))
        nxp=next(m for m in unresolved['metadata_candidates'] if m['value']['name']=='NXP2')
        self.assertIsNone(nxp['value']['interpretation'])
        self.assertIn('unresolved_class_symbol',nxp['flags'])
        t['purpose']='source_legend'
        self.assertFalse(self.convert(doc(tables=[t]))['metadata_candidates'])

    def test_pft_supplement_separates_measured_and_percent_and_omits_blank_post(self):
        c=self.convert(doc(tables=[table('<table><tr><th>Parameter</th><th>Pre Meas.</th>'
            '<th>Pre %Pred</th><th>Post Meas.</th></tr><tr><td>IC(L)</td><td>1.13</td>'
            '<td>106.04</td><td>---</td></tr></table>',panel='pft')]))
        values=[m['value'] for m in c['metadata_candidates'] if m['key']=='additional_lab_result']
        self.assertEqual(len(values),1)
        self.assertEqual(values[0]['results'],{'pre_measured':'1.13','pre_percent_predicted':'106.04'})

    def test_conclusion_only_explicit_pft_crop_and_transcription_is_labelled(self):
        text='Không rối loạn thông khí hạn chế, tắc nghẽn\nGiảm DLCO, giảm KCO'
        c=self.convert(doc(text,purpose='clinical_conclusion',context={'panel':'pft'},
            transcription_method='assistant_visual_transcription'))
        self.assertEqual([(o['field_id'],o['component']) for o in c['observations']],[('LUNG05','detail')])
        self.assertEqual(c['observations'][0]['qualitative_value'],text)
        self.assertEqual(c['observations'][0]['transcription_method'],'assistant_visual_transcription')
        self.assertFalse(self.convert(doc(text,purpose='source_context'))['observations'])
        self.assertFalse(self.convert(doc(text,purpose='clinical_conclusion'))['observations'])

    def test_additive_package_preserves_prior_acceptance_and_new_values_pending(self):
        old=convert_candidate(self.convert(doc(tables=[table('<table><tr><th>Test</th><th>Result</th><th>Unit</th></tr>'
            '<tr><td>Ure</td><td>4.9</td><td>mmol/L</td></tr></table>')])),DICTIONARY)
        new=convert_candidate(self.convert(doc('Ordering provider: Synthetic Physician')),DICTIONARY)
        with tempfile.TemporaryDirectory() as tmp:
            s=ReviewStore(Path(tmp)/'synthetic.sqlite')
            try:
                s.registry.import_package(old,DICTIONARY)
                person=dict(actor='Synthetic reviewer',role='source_reviewer')
                case=s.create_case('SYNTHETIC-EXTENSION',**person)
                assignment=s.assign_document(old['documents'][0]['document_id'],case_id=case['case_id'],reason='Synthetic',**person)
                s.review(old['package_id'],1,old['observations'][0]['observation_id'],action='accept',
                    expected_assignment_id=assignment['assignment_id'],reason='Synthetic',**person)
                before=copy.deepcopy(s.effective_pool(case['case_id']))
                s.registry.import_package(new,DICTIONARY)
                self.assertEqual(s.effective_pool(case['case_id']),before)
                w=patient_workspace(s,DICTIONARY,case['case_id'])
                self.assertEqual(sorted(c['review_status'] for c in w['candidates'] if c['kind']=='observation'),['accepted','pending'])
                self.assertEqual(s.registry.integrity()['sqlite'],'ok')
            finally:s.close()


if __name__=='__main__':unittest.main()
