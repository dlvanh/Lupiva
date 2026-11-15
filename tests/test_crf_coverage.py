"""CRF coverage classification and leak-free reporting on synthetic databases.

Builds a small registry the same way tests/test_review_server.synthetic_bundle
does (OCR table -> candidate pool -> bundle -> SQLite), then checks the five
coverage states, the missing-input ranking, the cross-case table and that the
report never carries extracted values or patient identifiers.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image, ImageDraw
from ocr_pool import convert_documents
from registry_pool.dictionary import build_dictionary
from registry_pool.exchange import build_bundle
from registry_pool.store import Registry
from registry_review.crf import CRFReview
from registry_review.store import ReviewStore

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)
SPEC=importlib.util.spec_from_file_location('crf_coverage_script',ROOT/'scripts/crf_coverage.py')
COVERAGE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COVERAGE)

PERSON=dict(actor='Synthetic reviewer',role='source_reviewer')


def synthetic_database(root,rows,*,specimen=None):
    """Artificial source and records only; mirrors test_review_server.synthetic_bundle."""
    run=root/'run'
    (run/'raw').mkdir(parents=True)
    (run/'crops').mkdir()
    image=Image.new('RGB',(900,350),'white')
    draw=ImageDraw.Draw(image)
    draw.text((30,30),'SYNTHETIC COVERAGE - NO PATIENT DATA',fill='black',font_size=26)
    image.save(root/'source.png')
    image.save(run/'crops'/'T.png')
    raw='Test\tResult\tUnit\n'+'\n'.join('\t'.join(row) for row in rows)
    (run/'raw'/'T.txt').write_text(raw,encoding='utf-8')
    table=dict(table_id='T',raw=raw,format='auto')
    if specimen:table['context']={'specimen':specimen}
    document=dict(document_id='SYNTHETIC',input_path='source.png',
        input_sha256=hashlib.sha256((root/'source.png').read_bytes()).hexdigest(),tables=[table])
    source=convert_documents([document],CATALOG)
    (run/'candidate-pool.json').write_text(json.dumps(source),encoding='utf-8')
    package=build_bundle(run,root/'bundle',DICTIONARY,root,package_id='SYNTHETIC-COV')
    registry=Registry(root/'synthetic.sqlite')
    try:registry.import_package(package,DICTIONARY)
    finally:registry.close()
    return package


class CrfCoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        # C3 -> IMM11 (candidate); PLT -> HEM11 (candidate, and 87.6543 < 100
        # fires the EAC03 platelet rule -> a suggested score).
        self.package=synthetic_database(self.root,[('C3','0.6543','g/L'),('PLT','87.6543','10^9/L')],specimen='blood')
        self.db=self.root/'synthetic.sqlite'
        store=ReviewStore(self.db)
        try:
            self.case=store.create_case('COV-REG',study_id='COV-STUDY-SECRET',**PERSON)
            self.case_id=self.case['case_id']
            store.assign_document(self.package['documents'][0]['document_id'],case_id=self.case_id,
                reason='Synthetic coverage test',**PERSON)
        finally:store.close()

    def tearDown(self):
        self.tmp.cleanup()

    def case_report(self,report,case_id=None):
        return next(c for c in report['cases'] if c['case_id']==(case_id or self.case_id))

    def slots(self,report,case_id=None):
        case=self.case_report(report,case_id)
        return {f['field_id']+'/'+c['component']:c for f in case['fields'] for c in f['components']}

    def test_candidate_suggested_blocked_empty_states(self):
        report=COVERAGE.coverage(self.db)
        slots=self.slots(report)
        self.assertEqual(slots['IMM11/result']['state'],'candidate')
        self.assertEqual(slots['HEM11/result']['state'],'candidate')
        # Platelets 87.6543 < 100 -> EAC03 evidence proposal from the knowledge base.
        self.assertEqual(slots['EAC03/result']['state'],'suggested')
        # C3 present but no reference range and C4 absent -> complement rules blocked.
        self.assertEqual(slots['EAC19/result']['state'],'blocked')
        self.assertEqual(slots['EAC19/result']['missing_inputs'],['IMM12'])
        self.assertEqual(slots['EAC02/result']['state'],'blocked')
        self.assertEqual(slots['EAC02/result']['missing_inputs'],['HEM05'])
        # Judgment-only finding rule has no input fields.
        self.assertEqual(slots['REN07/result']['state'],'blocked')
        self.assertEqual(slots['REN07/result']['missing_inputs'],[])
        # SLEDAI platelet rule needs an assessment date, not a field input.
        self.assertEqual(slots['SDA23/result']['state'],'blocked')
        self.assertEqual(slots['SDA23/result']['missing_inputs'],[])
        # A field with no rule and no value is empty.
        self.assertEqual(slots['ADM02/result']['state'],'empty')

    def test_totals_and_fill_rate(self):
        report=COVERAGE.coverage(self.db)
        case=self.case_report(report)
        self.assertEqual(report['field_count'],261)
        self.assertEqual(report['component_count'],377)
        self.assertEqual(sum(case['totals']['fields'].values()),261)
        self.assertEqual(sum(case['totals']['components'].values()),377)
        filled=sum(case['totals']['fields'][s] for s in ('reviewed','candidate','suggested'))
        self.assertEqual(case['fill_rate']['fields'],round(filled/261,4))
        self.assertEqual(case['totals']['fields']['candidate'],2)
        self.assertEqual(case['totals']['fields']['suggested'],1)
        self.assertEqual(case['totals']['fields']['reviewed'],0)

    def test_missing_input_ranking(self):
        report=COVERAGE.coverage(self.db)
        ranking=self.case_report(report)['missing_inputs']
        top=ranking[0]
        # IMM12 (C4) is the single missing input of EAC19, EAC20 and SDA20.
        self.assertEqual(top['field_id'],'IMM12')
        self.assertEqual(top['unblocks'],3)
        self.assertEqual(top['needed_by'],3)
        self.assertEqual(top['targets'],['EAC19','EAC20','SDA20'])
        by_id={item['field_id']:item for item in ranking}
        self.assertEqual(by_id['CV06']['targets'],['CV01','EAC12'])
        self.assertEqual(by_id['HEM05']['targets'],['EAC02','SDA24'])
        # REN08/REN01 are both required by the proteinuria rules, so neither alone unblocks.
        self.assertEqual(by_id['REN08']['unblocks'],0)
        self.assertEqual(by_id['REN08']['needed_by'],2)
        self.assertTrue(all(a['unblocks']>=b['unblocks'] for a,b in zip(ranking,ranking[1:])))

    def test_form_review_marks_slot_reviewed(self):
        app=COVERAGE.ReadOnlyApplication(self.db)
        crf=CRFReview(app)
        store=ReviewStore(self.db)
        try:
            view=crf.view(store,self.case_id)
            field=next(f for f in view['fields'] if f['slot']=='IMM11/result')
            crf.approve(store,case_id=self.case_id,source_snapshot=view['source_snapshot'],
                draft_sha256=view['draft_sha256'],selections={'IMM11/result':field['options'][0]['id']},
                actor='Synthetic clinician',role='clinician')
        finally:store.close()
        report=COVERAGE.coverage(self.db)
        slots=self.slots(report)
        self.assertEqual(slots['IMM11/result']['state'],'reviewed')
        case=self.case_report(report)
        self.assertEqual(case['totals']['fields']['reviewed'],1)
        self.assertEqual(case['totals']['fields']['candidate'],1)

    def test_empty_case_and_cross_case_table(self):
        store=ReviewStore(self.db)
        try:empty=store.create_case('COV-EMPTY',**PERSON)
        finally:store.close()
        report=COVERAGE.coverage(self.db)
        self.assertEqual(report['cross_case']['case_count'],2)
        # The case with no linked documents has no filled field anywhere.
        empty_case=self.case_report(report,empty['case_id'])
        self.assertEqual(sum(empty_case['totals']['fields'][s] for s in ('reviewed','candidate','suggested')),0)
        cross={s['section']:s['entirely_empty_cases'] for s in report['cross_case']['sections']}
        # Every section is entirely empty for the empty case; the populated case
        # fills the sections holding IMM11, HEM11 and EAC03, so those count 1 not 2.
        filled_sections={f['section'] for f in self.case_report(report)['fields']
            if f['state'] in ('reviewed','candidate','suggested')}
        for section,count in cross.items():
            self.assertEqual(count,1 if section in filled_sections else 2)

    def test_case_filter_and_unknown_case(self):
        report=COVERAGE.coverage(self.db,[self.case_id])
        self.assertEqual([c['case_id'] for c in report['cases']],[self.case_id])
        with self.assertRaises(ValueError):COVERAGE.coverage(self.db,['case-does-not-exist'])

    def test_database_is_opened_read_only(self):
        before=self.db.read_bytes()
        COVERAGE.coverage(self.db)
        self.assertEqual(self.db.read_bytes(),before)

    def test_cli_report_leaks_no_values_or_identifiers(self):
        out=self.root/'report.md';js=self.root/'report.json'
        argv=['crf_coverage.py','--db',str(self.db),'--out',str(out),'--json',str(js)]
        with patch.object(sys,'argv',argv):COVERAGE.main()
        md=out.read_text(encoding='utf-8');data=js.read_text(encoding='utf-8')
        for text in (md,data):
            self.assertNotIn('0.6543',text)
            self.assertNotIn('87.6543',text)
            self.assertNotIn('COV-STUDY-SECRET',text)
            self.assertNotIn('COV-REG',text)
            self.assertNotIn('Test\tResult',text)
            self.assertNotIn('SYNTHETIC',text)
            self.assertIn(self.case_id,text)
        self.assertIn('IMM11',data)
        report=json.loads(data)
        def walk(node):
            if isinstance(node,dict):
                self.assertFalse(set(node)&{'value','values','sources','source_data','study_id',
                    'registry_code','reviewer','options','proposal','evidence'})
                for v in node.values():walk(v)
            elif isinstance(node,list):
                for v in node:walk(v)
        walk(report)


if __name__=='__main__':unittest.main()