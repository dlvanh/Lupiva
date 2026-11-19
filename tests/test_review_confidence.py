"""Synthetic signals and independent patient groups; no existing image answers."""
import copy
import json
from pathlib import Path
import unittest

from registry_review.confidence import assess,summary,feedback,coverage_alerts,identity_conflict_documents,VERSION
from registry_review.calibration import evaluate,error_upper
from ocr_pool.confidence import summarize,greedy_collector
from ocr_pool import convert_documents


def candidate(**value):
    return dict(kind='observation',value=dict(result_type='numeric',numeric_value='7.83',
        comparator='=',flags=[],**value),current_revision=True,review_status='pending')


def evidence(**changes):
    return [dict(table_sha256='synthetic-sha',region={'bbox_xyxy':[2,3,450,600]},**changes)]


class ConfidenceTests(unittest.TestCase):
    def test_llm_proposal_is_unverified_with_or_without_location(self):
        c=candidate(extraction_method='gemini_api')
        ev=evidence()
        self.assertEqual(assess(c,ev)['tier'],'unverified')
        ev[0]['region']['llm_row_location']={'box':[5,70,950,160]}
        self.assertEqual(assess(c,ev)['tier'],'unverified')
        c['value']['grade_annotation']={'writing_style':'handwritten'}
        self.assertEqual(assess(c,ev)['tier'],'medium')
        c['value']['flags']=['unit_mismatch']
        self.assertEqual(assess(c,ev)['tier'],'low')

    def test_score_is_never_a_probability_or_automatic_approval(self):
        c=candidate();q=assess(c,evidence())
        self.assertEqual(q['tier'],'high')
        self.assertEqual(q['score'],90)
        self.assertIsNone(q['probability_correct'])
        self.assertFalse(q['auto_accept_eligible'])
        self.assertFalse(q['ocr_signal_available'])

    def test_abnormal_values_flags_and_non_crf_are_not_low_confidence(self):
        c=candidate();base=assess(c,evidence())
        c['value'].update(numeric_value='987654.3',flags=['explicit_source_result_flag','outside_word_catalog'],source_flag_raw='H')
        self.assertEqual(assess(c,evidence()),base)

    def test_conflicts_unknown_flags_and_pending_changes_require_attention(self):
        for flag,tier in [('conflicting_source_results','low'),('unit_mismatch','low'),
                          ('unexpected_new_flag','medium'),('class_symbol_ocr_variant','medium')]:
            c=candidate();c['value']['flags']=[flag]
            with self.subTest(flag=flag):self.assertEqual(assess(c,evidence())['tier'],tier)
        c=candidate();c['pending_correction']={'id':'change'}
        self.assertEqual(assess(c,evidence())['tier'],'low')

    def test_bad_values_and_missing_sources_cannot_be_high(self):
        for value in [dict(result_type='unparsed'),dict(numeric_value='NaN'),
                      dict(numeric_value=''),dict(comparator=None),
                      dict(result_type='pattern',pattern_raw=None),
                      dict(result_type='qualitative',qualitative_value=None)]:
            c=candidate();c['value'].update(value)
            with self.subTest(value=value):self.assertEqual(assess(c,evidence())['tier'],'low')
        self.assertEqual(assess(candidate(),[])['tier'],'low')

    def test_regional_signals_are_not_claimed_as_cell_accuracy(self):
        signal=summarize([-.01]*15,[3.0]*15)
        q=assess(candidate(),evidence(ocr_confidence=signal))
        self.assertTrue(q['ocr_signal_available'])
        self.assertEqual(q['ocr_signal_granularity'],'region')
        self.assertIsNone(q['probability_correct'])
        uncertain=summarize([-2.2]*15,[.1]*15)
        self.assertEqual(assess(candidate(),evidence(ocr_confidence=uncertain))['tier'],'medium')
        self.assertEqual(assess(candidate(),evidence(truncated=True))['tier'],'low')

    def test_nested_supplemental_values_and_raw_transcription(self):
        c=dict(kind='metadata',metadata_key='additional_lab_result',review_status='pending',
               value={'flags':['outside_word_catalog'],'value':{'parsed_results':{'result':dict(result_type='unparsed',flags=['unparsed_result'])}}})
        self.assertEqual(assess(c,evidence())['tier'],'low')
        c=candidate();c['value']['transcription_method']='assistant_visual_transcription'
        self.assertEqual(assess(c,evidence())['tier'],'low')

    def test_summary_separates_placeholders_reviewed_and_real_values(self):
        rows=[candidate() for _ in range(4)]
        rows[1]['value'].update(result_type='missing',missing_reason='source_placeholder')
        rows[2]['review_status']='accepted'
        rows[3]['value']['flags']=['metadata_conflict']
        for c in rows:c['confidence']=assess(c,evidence())
        s=summary(rows)
        self.assertEqual((s['pending'],s['meaningful_pending'],s['routine'],s['attention'],s['placeholders']),(3,2,1,1,1))
        self.assertFalse(s['auto_accept_enabled'])
        rows[2]['latest_human_review']={'action':'correct'}
        self.assertEqual(feedback(rows)['approved_with_correction'],1)
        self.assertIsNone(feedback(rows)['probability_correct'])

    def test_unextracted_rows_are_visible_even_when_existing_values_are_high(self):
        package=dict(package_id='p',revision=1,documents=[dict(document_id='d',source_document_id='input')],
            observations=[dict(evidence_ids=['e'])],evidence=[dict(evidence_id='e',document_id='d',
                source_data=dict(table_id='T.1',row_raw=['IC(L)','2.7']))],source_issues=[
                dict(document_id='input',table_id='T.1',reason='unmapped_test',name_raw='IC(L)',row_raw=['IC(L)','2.7']),
                dict(document_id='input',table_id='T.1',reason='unmapped_test',name_raw='New assay',row_raw=['New assay','3.21']),
                dict(document_id='input',table_id='T.1',reason='unmapped_test',name_raw='Control (Co)',row_raw=['Control (Co)','200']),
                dict(document_id='input',table_id='T.2',reason='incomplete_generation')])
        alerts=coverage_alerts(package,{'d'})
        self.assertEqual([a['reason'] for a in alerts],['unmapped_test','incomplete_generation'])
        self.assertEqual(coverage_alerts(package,{'other'}),[])

    def test_generation_summaries_validate_empty_and_nonfinite_signals(self):
        for logs,margins in [([],[]),([float('nan')],[1]),([.5],[1]),([-1],[-1])]:
            self.assertIsNone(summarize(logs,margins))

    def test_patient_identity_disagreement_is_distinct_from_expected_sample_ids(self):
        rows=[dict(kind='metadata',metadata_key=k,document_id=d,value={'value':v,'flags':[]})
              for k,d,v in [('pid','d1','110'),('pid','d2','110'),('sid','d1','sample-a'),('sid','d2','sample-b')]]
        self.assertEqual(identity_conflict_documents(rows),set())
        rows[1]['value']['value']='220'
        self.assertEqual(identity_conflict_documents(rows),{'d1','d2'})

    def test_collector_keeps_logits_and_tracks_selected_greedy_tokens(self):
        import torch
        collect=greedy_collector();scores=torch.tensor([[1.,4.,2.,-1.]])
        unchanged=scores.clone()
        self.assertIs(collect(torch.tensor([[9]]),scores),scores)
        self.assertTrue(torch.equal(scores,unchanged))
        signal=collect.finish(torch.tensor([1]))
        self.assertEqual(signal['token_count'],1)
        self.assertAlmostEqual(signal['geometric_mean_token_probability'],torch.softmax(scores,dim=-1)[0,1].item(),places=6)
        self.assertIsNone(collect.finish(torch.tensor([2])))

    def test_extraction_carries_signals_to_exact_source_evidence(self):
        catalog=json.loads((Path(__file__).resolve().parents[1]/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
        signal=summarize([-.02,-.03],[2.,3.])
        pool=convert_documents([dict(document_id='unseen',tables=[dict(table_id='T',
            raw='Test\tResult\tUnit\nC3\t0.83\tg/L',ocr_confidence=signal)],text_regions=[])],catalog)
        self.assertEqual(pool['evidence'][0]['ocr_confidence'],signal)
        self.assertEqual(pool['observations'][0]['numeric_value'],'0.83')


class CalibrationTests(unittest.TestCase):
    def dataset(self,count=60):
        return dict(confidence_version=VERSION,extraction_fingerprint='synthetic-model-and-code-sha',samples=[
            dict(sample_id=f'{partition}-{i}',patient_group=f'{partition}-patient-{i}',partition=partition,
                score=90,correct=True,reviewer='Synthetic human label',human_verified=True,sampling_strategy='random_audit')
            for partition in ('calibration','validation') for i in range(count)])

    def test_no_errors_does_not_imply_perfect_reliability(self):
        self.assertAlmostEqual(error_upper(0,1),.95)
        self.assertGreater(error_upper(0,100),.01)
        self.assertLess(error_upper(0,300),.01)
        self.assertEqual(error_upper(0,0),1)
        self.assertEqual(error_upper(3,3),1)
        self.assertAlmostEqual(error_upper(1,2),(.95)**.5)

    def test_validation_is_required_and_no_probability_is_manufactured(self):
        report=evaluate(self.dataset(),max_group_error=.05)
        self.assertEqual(report['status'],'validated_candidate_threshold')
        self.assertIsNone(report['probability_correct'])
        self.assertFalse(report['automatic_approval_enabled'])
        small=evaluate(self.dataset(2),max_group_error=.05)
        self.assertEqual(small['status'],'insufficient_validation')
        self.assertIsNone(small['threshold'])

    def test_overlapping_patients_biased_samples_and_assistant_labels_rejected(self):
        for change in [{'human_verified':False},{'sampling_strategy':'flagged_only'},
                       {'correct':'yes'},{'score':float('nan')},{'reviewer':''}]:
            d=self.dataset();d['samples'][0].update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):evaluate(d)
        d=self.dataset();d['samples'][-1]['patient_group']=d['samples'][0]['patient_group']
        with self.assertRaises(ValueError):evaluate(d)

    def test_many_correlated_fields_do_not_count_as_independent_patients(self):
        d=self.dataset(500)
        for r in d['samples']:r['patient_group']=r['partition']+'-only-one-patient'
        self.assertEqual(evaluate(d)['status'],'insufficient_validation')

    def test_failing_validation_cannot_retune_threshold_on_test_labels(self):
        d=self.dataset()
        for r in d['samples']:
            if r['partition']=='validation':r['correct']=False
        report=evaluate(d,max_group_error=.05)
        self.assertEqual(report['threshold'],90)
        self.assertEqual(report['status'],'insufficient_validation')
        self.assertEqual(report['validation']['selected_errors'],60)

    def test_blocked_values_never_enter_selected_group_even_with_high_score(self):
        d=self.dataset()
        for r in d['samples']:r['blockers']=['unit_mismatch']
        self.assertEqual(evaluate(d,max_group_error=.05)['status'],'insufficient_validation')


if __name__=='__main__':unittest.main()
