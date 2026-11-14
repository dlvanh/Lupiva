"""Check scoring failures that could otherwise inflate the pilot result. No models."""
import json
import unittest
from scripts.benchmark_registry_vlm import extraction_score, norm


class VlmScoringTests(unittest.TestCase):
    def setUp(self):
        self.ref = dict(transcript='C3: 0.83 g/L\nC4: [blank]\nHistory: No kidney disease.', facts={
            'C3': dict(values=['0.83 g/L'], evidence=['C3: 0.83 g/L']),
            'history_text': dict(values=['No kidney disease.'], evidence=['History: No kidney disease.']),
        })

    def score(self, facts):
        return extraction_score(json.dumps(dict(facts=facts)), self.ref)

    def test_supported_and_missing(self):
        result = self.score([dict(field='C3', value='0.83 g/L', evidence='C3: 0.83 g/L')])
        self.assertEqual((result['correct'], result['supported_correct']), (1, 1))
        self.assertEqual(result['missing'], ['history_text'])

    def test_wrong_decimal_is_not_correct(self):
        result = self.score([dict(field='C3', value='0.38 g/L', evidence='C3: 0.83 g/L')])
        self.assertEqual(result['correct'], 0)
        self.assertEqual(result['wrong'], ['C3'])

    def test_negation_is_not_dropped(self):
        result = self.score([dict(field='history_text', value='Kidney disease.', evidence='History: No kidney disease.')])
        self.assertEqual(result['correct'], 0)

    def test_fabricated_quote_does_not_ground_correct_value(self):
        result = self.score([dict(field='C3', value='0.83 g/L', evidence='C3: 0.83 g/L confirmed')])
        self.assertEqual(result['correct'], 1)
        self.assertEqual(result['supported_correct'], 0)
        self.assertEqual(result['unsupported_quotes'], 1)

    def test_unrelated_quote_does_not_ground_correct_value(self):
        result = self.score([dict(field='C3', value='0.83 g/L', evidence='History: No kidney disease.')])
        self.assertEqual(result['supported_correct'], 0)

    def test_blank_and_unknown_are_extra(self):
        result = self.score([dict(field='C4', value='0', evidence='C4: [blank]'),
            dict(field='diagnosis_text', value='Lupus', evidence='Lupus')])
        self.assertEqual(result['extra'], ['C4', 'diagnosis_text'])

    def test_duplicates_cannot_inflate_correct_count(self):
        fact = dict(field='C3', value='0.83 g/L', evidence='C3: 0.83 g/L')
        result = self.score([fact, fact])
        self.assertEqual(result['correct'], 0)
        self.assertEqual(result['duplicates'], ['C3'])

    def test_invalid_json_is_missing_all_not_empty_perfect_score(self):
        result = extraction_score('C3 = 0.83 g/L', self.ref)
        self.assertFalse(result['valid_json'])
        self.assertEqual(result['expected'], 2)
        self.assertEqual(len(result['missing']), 2)

    def test_normalization_preserves_decimal_negation_and_accents(self):
        self.assertNotEqual(norm('0.83'), norm('0.38'))
        self.assertNotEqual(norm('Không sốt'), norm('sốt'))
        self.assertNotEqual(norm('thuốc'), norm('thuoc'))
        self.assertEqual(norm('  C3:\n 0.83  '), 'c3: 0.83')


if __name__ == '__main__':
    unittest.main()
