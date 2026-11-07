import unittest
from scripts.evaluate_automatic_pool import unresolved_findings


class EvaluationFindingsTests(unittest.TestCase):
    def test_success_does_not_repeat_historical_ana_upcr_failure(self):
        actual=[dict(observation_id='ANA',field_id='IMM01',result_type='pattern',
            flags=['explicit_method_row_continuation']),
            dict(observation_id='UPCR',field_id='REN01',result_type='numeric',flags=[]),
            dict(observation_id='CLASS',result_type='numeric',flags=['class_symbol_ocr_variant'])]
        self.assertEqual(unresolved_findings(actual,dict(expected_count=3,predicted_count=3,matched_count=3)),[])

    def test_actual_failures_include_only_current_observations_and_mismatches(self):
        actual=[dict(observation_id='A',result_type='unparsed',flags=['unparsed_result']),
            dict(observation_id='B',result_type='numeric',flags=['unresolved_class_symbol']),
            dict(observation_id='C',result_type='missing',flags=['unreadable_result'])]
        results=unresolved_findings(actual,dict(expected_count=4,predicted_count=3,matched_count=1))
        by_category={r['category']:r for r in results}
        self.assertEqual(by_category['unparsed_result']['observation_ids'],['A'])
        self.assertEqual(by_category['legend_symbol_ocr']['observation_ids'],['B'])
        self.assertEqual(by_category['unreadable_result']['observation_ids'],['C'])
        self.assertEqual(by_category['scoped_tuple_mismatch']['unmatched_expected_count'],3)
        self.assertEqual(by_category['scoped_tuple_mismatch']['unmatched_predicted_count'],2)


if __name__=='__main__':
    unittest.main()
