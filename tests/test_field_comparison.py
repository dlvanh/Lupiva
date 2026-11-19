import unittest
from scripts.compare_pool_fields import compare


class FieldComparisonTests(unittest.TestCase):
    def test_does_not_reward_empty_fields_or_ignore_duplicates(self):
        expected = dict(document_id='D', field_id='IMM11', component='result',
                        numeric_value='0.65', comparator='=', unit_raw='g/L', panel=None)
        reference = dict(status='draft_unreviewed', scope=[['D', 'IMM11', 'result']], observations=[expected])
        predicted = {**expected, 'numeric_value': '0.650', 'observation_id': 'O1', 'flags': []}
        package = {'observations': [predicted, {**predicted, 'observation_id': 'O2'}], 'fields': {}}
        report = compare(package, reference)
        self.assertEqual(report['matched_count'], 1)
        self.assertEqual(report['precision'], 0.5)
        self.assertEqual(report['recall'], 1.0)
        self.assertTrue(report['provisional'])

    def test_wrong_column_value_is_missing_and_extra(self):
        expected = dict(document_id='D', field_id='PFT02', component='pre_measured',
                        numeric_value='3.0', comparator='=', unit_raw='L', panel='pft')
        ref = dict(status='draft_unreviewed', scope=[['D', 'PFT02', 'pre_measured']], observations=[expected])
        pred = {**expected, 'numeric_value': '75', 'observation_id': 'O1', 'flags': []}
        report = compare({'observations': [pred]}, ref)
        self.assertEqual(report['matched_count'], 0)
        self.assertEqual(len(report['missing_tuples']), 1)
        self.assertEqual(len(report['extra_or_wrong_tuples']), 1)

    def test_pattern_and_symbol_are_compared(self):
        expected = dict(document_id='D', field_id='IMM01', pattern_raw='Homogeneous', grade_raw='3+')
        ref = dict(status='draft_unreviewed', scope=[['D', 'IMM01', 'result']], observations=[expected])
        pred = {**expected, 'component': 'result', 'grade_raw': '1+', 'observation_id': 'O1', 'flags': []}
        self.assertEqual(compare({'observations': [pred]}, ref)['matched_count'], 0)


if __name__ == '__main__':
    unittest.main()
