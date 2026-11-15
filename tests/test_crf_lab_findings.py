"""Lab-derived finding proposals: thresholds, units, guards, wiring and coverage.

Sources are built the same way as tests/test_crf_review.py (plain observation
dicts); every value is synthetic. No patient data and no network are used.
"""
from datetime import date
import importlib.util
import json
from pathlib import Path
import tempfile
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from registry_pool.dictionary import digest
from registry_review.crf import CRFReview, form_finding_proposals
from registry_review.crf_knowledge import (FINDINGS_VERSION, FORM_FINDINGS, LAB_FINDINGS,
                                           LAB_FINDINGS_VERSION, RULES, knowledge_library, read_knowledge)
from registry_review.crf_lab_findings import lab_finding_proposals
from registry_review.crf_scores import evaluate_scores
from registry_review.store import ReviewStore
from test_patient_workspace import PatientWorkspaceTests
from test_source_review import DICTIONARY

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('crf_coverage_script_lab', ROOT/'scripts/crf_coverage.py')
COVERAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(COVERAGE)


def source(field, component='result', selection=None, **value):
    return dict(kind='observation', field_id=field, component=component,
                selection_id=selection or field, document_id='report',
                current_revision=True, review_status='pending', confidence={}, value=dict(**value))


def workspace(*sources):
    return dict(candidates=list(sources), case={})


def proposals(*sources, references=None, assessment_date=None):
    return lab_finding_proposals(workspace(*sources), references or {}, LAB_FINDINGS,
                                 assessment_date=assessment_date)


class LabFindingRuleTests(unittest.TestCase):
    def test_thresholds_fire_just_past_not_at(self):
        cases = [
            ('HEM12/result', source('HEM02', numeric_value='119', unit_raw='g/L', comparator='='),
             source('HEM02', numeric_value='120', unit_raw='g/L', comparator='=')),
            ('HEM12/result', source('HEM05', numeric_value='3.9', unit_raw='10⁹/L', comparator='='),
             source('HEM05', numeric_value='4', unit_raw='10⁹/L', comparator='=')),
            ('HEM12/result', source('HEM07', component='absolute_count', numeric_value='0.9', unit_raw='10⁹/L', comparator='='),
             source('HEM07', component='absolute_count', numeric_value='1', unit_raw='10⁹/L', comparator='=')),
            ('HEM12/result', source('HEM11', numeric_value='99', unit_raw='10⁹/L', comparator='='),
             source('HEM11', numeric_value='100', unit_raw='10⁹/L', comparator='=')),
            ('REN07/result', source('REN08', numeric_value='0.51', unit_raw='g/24h', comparator='='),
             source('REN08', numeric_value='0.5', unit_raw='g/24h', comparator='=')),
            ('REN07/result', source('REN08', numeric_value='501', unit_raw='mg/24h', comparator='='),
             source('REN08', numeric_value='500', unit_raw='mg/24h', comparator='=')),
            ('REN07/result', source('REN01', numeric_value='0.51', unit_raw='mg/mg', comparator='='),
             source('REN01', numeric_value='0.5', unit_raw='mg/mg', comparator='=')),
            ('REN07/result', source('REN02', numeric_value='6', unit_raw='RBC/HPF', comparator='='),
             source('REN02', numeric_value='5', unit_raw='RBC/HPF', comparator='=')),
            ('REN07/result', source('REN06', numeric_value='59', unit_raw='mL/min/1.73m²', comparator='='),
             source('REN06', numeric_value='60', unit_raw='mL/min/1.73m²', comparator='=')),
            ('REN07/result', source('REN05', numeric_value='111', unit_raw='µmol/L', comparator='=', reference_range_raw='60 – 110'),
             source('REN05', numeric_value='110', unit_raw='µmol/L', comparator='=', reference_range_raw='60 – 110')),
            ('MUS02/result', source('MUS01', numeric_value='201', unit_raw='U/L', comparator='=', reference_range_raw='30 – 200'),
             source('MUS01', numeric_value='200', unit_raw='U/L', comparator='=', reference_range_raw='30 – 200')),
            ('LUNG01/result', source('PFT11', component='pre_percent_predicted', numeric_value='79', unit_raw='%', comparator='='),
             source('PFT11', component='pre_percent_predicted', numeric_value='80', unit_raw='%', comparator='=')),
            ('LUNG01/result', source('PFT02', component='pre_percent_predicted', numeric_value='79', unit_raw='%', comparator='='),
             source('PFT02', component='pre_percent_predicted', numeric_value='80', unit_raw='%', comparator='=')),
            ('LUNG01/result', source('IMM18', numeric_value='501', unit_raw='U/mL', comparator='='),
             source('IMM18', numeric_value='500', unit_raw='U/mL', comparator='=')),
            ('EAC21/result', source('IMM04', numeric_value='101', unit_raw='IU/mL', comparator='=', reference_range_raw='0 – 100'),
             source('IMM04', numeric_value='100', unit_raw='IU/mL', comparator='=', reference_range_raw='0 – 100')),
            ('EAC01/result', source('HIS12', numeric_value='38.4', unit_raw='°C', comparator='='),
             source('HIS12', numeric_value='38.3', unit_raw='°C', comparator='=')),
            ('HIS11/result', source('HIS12', numeric_value='38', unit_raw='°C', comparator='='),
             source('HIS12', numeric_value='37.9', unit_raw='°C', comparator='=')),
        ]
        for slot, fires, not_fires in cases:
            with self.subTest(slot=slot, value=fires['value'].get('numeric_value')):
                self.assertIn(slot, proposals(fires))
                self.assertNotIn(slot, proposals(not_fires))

    def test_sledai_fever_threshold_and_window(self):
        day = date(2026, 11, 13)
        fires = source('HIS12', numeric_value='38.1', unit_raw='°C', comparator='=', source_date='2026-11-10')
        at = source('HIS12', numeric_value='38', unit_raw='°C', comparator='=', source_date='2026-11-10')
        self.assertIn('SDA22/result', proposals(fires, assessment_date=day))
        self.assertNotIn('SDA22/result', proposals(at, assessment_date=day))

    def test_haemoglobin_unit_conversion_and_guard(self):
        converted = proposals(source('HEM02', numeric_value='11.9', unit_raw='g/dL', comparator='=', selection='hb'))
        self.assertIn('HEM12/result', converted)
        self.assertEqual(converted['HEM12/detail']['value'], 'Thiếu máu (Hb 11.9 g/dL)')
        self.assertNotIn('HEM12/result', proposals(source('HEM02', numeric_value='12.0', unit_raw='g/dL', comparator='=')))
        # G/L is a cell-count scale, never haemoglobin mass; g/L is mass.
        self.assertNotIn('HEM12/result', proposals(source('HEM02', numeric_value='119', unit_raw='G/L', comparator='=')))
        self.assertIn('HEM12/result', proposals(source('HEM02', numeric_value='119', unit_raw='g/L', comparator='=')))
        # The blood-count guard accepts G/L and rejects g/L for WBC.
        self.assertIn('HEM12/result', proposals(source('HEM05', numeric_value='3.5', unit_raw='G/L', comparator='=')))
        self.assertNotIn('HEM12/result', proposals(source('HEM05', numeric_value='3.5', unit_raw='g/L', comparator='=')))

    def test_above_reference_range_forms_and_missing(self):
        def cre(value, raw=None):
            value_dict = dict(numeric_value=value, unit_raw='µmol/L', comparator='=')
            if raw is not None:
                value_dict['reference_range_raw'] = raw
            return source('REN05', selection='cre', **value_dict)

        self.assertIn('REN07/result', proposals(cre('111', '60 – 110')))
        self.assertIn('REN07/result', proposals(cre('110', '< 110')))
        self.assertNotIn('REN07/result', proposals(cre('109', '< 110')))
        self.assertIn('REN07/result', proposals(cre('111', '<= 110')))
        self.assertNotIn('REN07/result', proposals(cre('110', '<= 110')))
        self.assertNotIn('REN07/result', proposals(cre('111')))
        self.assertNotIn('REN07/result', proposals(cre('111', 'không rõ')))
        self.assertNotIn('REN07/result', proposals(cre('111', '> 60')))
        self.assertIn('REN07/result', proposals(cre('95', '60 – 110'), references={'cre': {'range': '0 – 90'}}))

    def test_explicit_positive_criteria(self):
        coombs = source('HEM13', qualitative_value='Dương tính', result_raw='Dương tính')
        fired = proposals(coombs)
        self.assertIn('HEM12/result', fired)
        self.assertIn('EAC04/result', fired)
        self.assertEqual(fired['HEM12/detail']['value'], 'Coombs trực tiếp dương tính')
        self.assertNotIn('EAC04/result', proposals(source('HEM13', qualitative_value='Âm tính', result_raw='Âm tính')))
        self.assertNotIn('EAC04/result', proposals(source('HEM13', qualitative_value='Dương tính', result_raw='Không dương tính')))
        self.assertIn('EAC21/result', proposals(source('IMM04', qualitative_value='positive', result_raw='positive')))
        self.assertIn('EAC21/result', proposals(source('ANA01', qualitative_value='Dương tính', result_raw='17 Dương tính')))

    def test_guarded_sources_are_ignored(self):
        base = dict(numeric_value='90', unit_raw='10⁹/L', comparator='=')
        ok = source('HEM11', selection='ok', **base)
        self.assertIn('HEM12/result', proposals(ok))
        for mutation in [dict(review_status='conflict'), dict(pending_correction=True),
                         dict(confidence={'blockers': ['identity']})]:
            self.assertNotIn('HEM12/result', proposals({**ok, **mutation}))
        for value_mut in [dict(comparator='<'), dict(missing_reason='not found'),
                          dict(result_type='missing'), dict(result_type='unparsed')]:
            self.assertNotIn('HEM12/result', proposals({**ok, 'value': {**ok['value'], **value_mut}}))

    def test_direct_hem12_answer_blocks_proposal(self):
        plt = source('HEM11', numeric_value='90', unit_raw='10⁹/L', comparator='=')
        answer = source('HEM12', qualitative_value='yes')
        fired = proposals(plt, answer)
        self.assertNotIn('HEM12/result', fired)
        self.assertNotIn('HEM12/detail', fired)

    def test_hem12_detail_joins_findings_in_criteria_order(self):
        hb = source('HEM02', numeric_value='110', unit_raw='g/L', comparator='=', selection='hb')
        plt = source('HEM11', numeric_value='90', unit_raw='10⁹/L', comparator='=', selection='plt')
        fired = proposals(plt, hb)
        self.assertEqual(fired['HEM12/detail']['value'], 'Thiếu máu (Hb 110 g/L); Giảm tiểu cầu (PLT 90 10⁹/L)')
        self.assertEqual(fired['HEM12/detail']['sources'], ['hb', 'plt'])
        self.assertEqual(fired['HEM12/result']['sources'], ['hb', 'plt'])

    def test_proposals_only_yes_with_confirmation_and_metadata(self):
        fired = proposals(source('HEM02', numeric_value='110', unit_raw='g/L', comparator='='),
                          source('HIS12', numeric_value='39', unit_raw='°C', comparator='='))
        self.assertTrue(fired)
        self.assertEqual(fired['HEM12/detail']['value'], 'Thiếu máu (Hb 110 g/L)')
        for slot, item in fired.items():
            if slot.endswith('/result'):
                self.assertEqual(item['value'], 'yes')      # rules never answer "no"
            else:
                self.assertNotIn(item['value'], {'no', 'không'})
            self.assertTrue(item['requires_confirmation'])
            self.assertTrue(item['confirmation'])
            self.assertEqual(item['origin'], 'knowledge_rule')
            self.assertEqual(item['knowledge_version'], LAB_FINDINGS_VERSION)
            self.assertIn('source_url', item)
            self.assertTrue(item['sources'])
            self.assertTrue(item['reason'])

    def test_sledai_lab_findings_need_assessment_window(self):
        old = source('IMM04', numeric_value='150', unit_raw='IU/mL', comparator='=',
                     reference_range_raw='0 – 100', source_date='2026-10-01')
        with_date = proposals(old, assessment_date=date(2026, 11, 13))
        self.assertIn('EAC21/result', with_date)
        self.assertNotIn('SDA21/result', with_date)
        without_date = proposals(old)
        self.assertIn('EAC21/result', without_date)
        self.assertNotIn('SDA21/result', without_date)

    def test_form_finding_wins_over_lab_finding_for_lung(self):
        ild = source('LUNG02', qualitative_value='yes', selection='LUNG02')
        dlco = source('PFT11', component='pre_percent_predicted', numeric_value='70', unit_raw='%', comparator='=', selection='dlco')
        ws = workspace(ild, dlco)
        lab = lab_finding_proposals(ws, {}, LAB_FINDINGS)
        finding = form_finding_proposals(ws, FORM_FINDINGS)
        self.assertIn('LUNG01/result', lab)
        self.assertIn('LUNG01/result', finding)
        merged = {**lab, **finding}
        self.assertEqual(merged['LUNG01/result']['knowledge_version'], FINDINGS_VERSION)
        self.assertEqual(merged['LUNG01/result']['sources'], ['LUNG02'])

    def test_coverage_counts_lab_suggestions_and_blocked_inputs(self):
        plt = source('HEM11', numeric_value='90', unit_raw='10⁹/L', comparator='=')
        ws = workspace(plt)
        view = dict(review=None, fields=[
            dict(slot='HEM12/result', label='HEM12', section='Huyết học', options=[], proposal={'id': 'p', 'value': 'yes'}),
            dict(slot='HEM12/detail', label='HEM12', section='Huyết học', options=[], proposal={'id': 'd', 'value': 'Giảm tiểu cầu (PLT 90 10⁹/L)'}),
            dict(slot='REN07/result', label='REN07', section='Thận', options=[]),
            dict(slot='EAC21/result', label='EAC21', section='Score', options=[]),
            dict(slot='SDA21/result', label='SDA21', section='Score', options=[]),
        ])
        slots = COVERAGE.classify_slots(view, ws, {}, RULES, FORM_FINDINGS, LAB_FINDINGS)
        self.assertEqual(slots['HEM12/result']['state'], 'suggested')
        self.assertEqual(slots['HEM12/detail']['state'], 'suggested')
        self.assertEqual(slots['REN07/result']['state'], 'blocked')
        self.assertEqual(slots['REN07/result']['missing_inputs'], ['REN08', 'REN01', 'REN02', 'REN06', 'REN05'])
        self.assertEqual(slots['EAC21/result']['missing_inputs'], ['IMM04', 'ANA01'])
        self.assertEqual(slots['SDA21/result']['state'], 'blocked')
        self.assertEqual(slots['SDA21/result']['missing_inputs'], ['IMM04'])


class LabFindingsKnowledgeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = ReviewStore(Path(self.tmp.name)/'synthetic.sqlite')

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_library_installed_and_hash_checked(self):
        library = knowledge_library(self.store.db)
        self.assertIn(LAB_FINDINGS_VERSION, library['available_versions'])
        self.assertEqual(library['lab_findings']['version'], LAB_FINDINGS_VERSION)
        self.assertEqual(library['lab_findings']['rules'], LAB_FINDINGS)
        self.assertEqual(library['lab_findings']['sha256'], digest(LAB_FINDINGS))
        tampered = dict(LAB_FINDINGS, HIS11=dict(criteria=[], definition='x', confirmation='y',
                                                 standard='z', source=None, location='w'))
        self.store.db.execute('UPDATE crf_knowledge SET rules=? WHERE version=?',
                              (json.dumps(tampered, ensure_ascii=False), LAB_FINDINGS_VERSION))
        with self.assertRaises(ValueError):
            read_knowledge(self.store.db, LAB_FINDINGS_VERSION)


class LabFindingsWiringTests(PatientWorkspaceTests):
    def app(self):
        return SimpleNamespace(bundles={}, exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))

    def test_view_and_approve_store_lab_proposal_with_detail(self):
        hb = source('HEM02', numeric_value='110', unit_raw='g/L', comparator='=', selection='hb')
        plt = source('HEM11', numeric_value='90', unit_raw='10⁹/L', comparator='=', selection='plt')
        for item in (hb, plt):
            item.update(package_id='test', revision=1, evidence_ids=[])
        ws = dict(candidates=[hb, plt], case=self.case, review_snapshot_sha256='fixture')
        crf = CRFReview(self.app())
        case_id = self.case['case_id']
        with patch('registry_review.crf.patient_workspace', return_value=ws):
            view = crf.view(self.store, case_id)
            result = next(f for f in view['fields'] if f['slot'] == 'HEM12/result')
            detail = next(f for f in view['fields'] if f['slot'] == 'HEM12/detail')
            self.assertEqual(result['proposal']['origin'], 'knowledge_rule')
            self.assertEqual(result['proposal']['knowledge_version'], LAB_FINDINGS_VERSION)
            self.assertEqual(result['proposal']['sources'], ['hb', 'plt'])
            self.assertTrue(result['proposal']['requires_confirmation'])
            self.assertEqual(detail['proposal']['value'], 'Thiếu máu (Hb 110 g/L); Giảm tiểu cầu (PLT 90 10⁹/L)')
            receipt = crf.approve(self.store, case_id=case_id, source_snapshot=view['source_snapshot'],
                                  draft_sha256=view['draft_sha256'],
                                  selections={'HEM12/result': result['proposal']['id'],
                                              'HEM12/detail': detail['proposal']['id']}, **self.person)
        self.assertEqual(receipt['values']['HEM12/result']['knowledge_version'], LAB_FINDINGS_VERSION)
        self.assertEqual(receipt['values']['HEM12/result']['sources'], ['hb', 'plt'])
        self.assertEqual(receipt['values']['HEM12/result']['reason'], LAB_FINDINGS['HEM12']['definition'])
        self.assertEqual(receipt['values']['HEM12/detail']['value'], 'Thiếu máu (Hb 110 g/L); Giảm tiểu cầu (PLT 90 10⁹/L)')
        self.assertIn('hb', receipt['sources'])

    def test_scores_surface_lab_evidence_without_changing_engine(self):
        dsdna = source('IMM04', numeric_value='150', unit_raw='IU/mL', comparator='=',
                       reference_range_raw='0 – 100', source_date='2026-11-10', selection='dsdna')
        dsdna.update(package_id='test', revision=1, evidence_ids=[])
        ws = dict(candidates=[dsdna], case=self.case, review_snapshot_sha256='fixture')
        crf = CRFReview(self.app())
        assessment = dict(ana='yes', date='2026-11-13', criteria={})
        with patch('registry_review.crf.patient_workspace', return_value=ws):
            report = crf.scores(self.store, case_id=self.case['case_id'], source_snapshot='fixture', assessment=assessment)
        self.assertIn('EAC21', report['suggestions'])
        self.assertIn('SDA21', report['suggestions'])
        self.assertEqual(report['suggestions']['EAC21']['knowledge_version'], LAB_FINDINGS_VERSION)
        self.assertEqual(report['suggestions']['EAC21']['sources'], ['dsdna'])
        self.assertTrue(report['suggestions']['EAC21']['requires_confirmation'])
        self.assertEqual(report['values'], {})
        engine = evaluate_scores(assessment, [dsdna], {})
        self.assertNotIn('EAC21', engine['suggestions'])
        self.assertNotIn('SDA21', engine['suggestions'])

    def test_generate_sends_criteria_and_drops_locally_proposed_targets(self):
        plt = source('HEM11', numeric_value='90', unit_raw='10⁹/L', comparator='=', selection='plt')
        plt.update(package_id='test', revision=1, evidence_ids=[])
        ws = dict(candidates=[plt], case=self.case, review_snapshot_sha256='fixture')
        app = SimpleNamespace(database=self.path, bundles={}, intakes=SimpleNamespace(workspace=self.tmp.name),
                              exports=SimpleNamespace(configuration=lambda: (DICTIONARY, None, {})))
        crf = CRFReview(app)
        captured = {}

        def fake_request(config, facts, targets):
            captured['targets'] = targets
            return [], 'synthetic', {}

        with patch('registry_review.crf.patient_workspace', return_value=ws), \
                patch('registry_review.crf.configuration', return_value={}), \
                patch('registry_review.crf.request_suggestions', side_effect=fake_request):
            self.assertEqual(crf.generate(self.store, self.case['case_id'])['status'], 'running')
            deadline = time.monotonic() + 4
            while time.monotonic() < deadline:
                job = crf.view(self.store, self.case['case_id'])['job']
                if job and job['status'] != 'running':
                    break
                time.sleep(.02)
        targets = {target['slot']: target for target in captured['targets']}
        self.assertNotIn('HEM12/result', targets)
        self.assertIn('REN07/result', targets)
        self.assertTrue(any('Tổn thương thận' in item['definition'] for item in targets['REN07/result']['criteria']))
        self.assertTrue(any(item.get('confirmation') for item in targets['REN07/result']['criteria']))
        self.assertIn('HIS11/result', targets)
        self.assertEqual(len(targets['LUNG01/result']['criteria']), 2)


if __name__ == '__main__':
    unittest.main()