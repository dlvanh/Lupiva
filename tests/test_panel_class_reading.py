"""Source-driven Class readings with novel intensities, legends and symbols."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

from ocr_pool import convert_documents
from ocr_pool.automatic import adapt_document
from ocr_pool.layout_context import round_class_reading


CATALOG = json.loads((Path(__file__).resolve().parents[1] /
                     'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))


def context(symbol='O'):
    return dict(panel='myositis', class_legend={symbol: 'negative', '+': 'positive'},
                intensity_ranges={symbol: [2, 19], '+': [20, 48]},
                ocr_context_evidence=[dict(purpose='printed_class_legend',
                                          region_id='legend-new', raw_sha256='source-hash')])


class PanelClassReadingTests(unittest.TestCase):
    def test_round_glyph_variants_have_one_reading_without_rewriting_ocr(self):
        for printed in ('o', 'O', '0'):
            for recognized in ('o', 'O', '0'):
                with self.subTest(printed=printed, recognized=recognized):
                    ctx = context(printed)
                    before = copy.deepcopy(ctx)
                    reading = round_class_reading(recognized,
                        dict(numeric_value='17.5', comparator='='), ctx)
                    self.assertEqual(reading['class_symbol'], 'o')
                    self.assertEqual(reading['qualitative_value'], 'negative')
                    self.assertEqual(reading['class_legend_symbol'], printed)
                    self.assertEqual(reading['class_interpretation_range'], [2, 19])
                    self.assertEqual(reading['class_interpretation_origin'], 'source_legend')
                    self.assertEqual(ctx, before)

    def test_ranges_come_from_each_source_including_boundaries(self):
        for intensity, expected in [('2', True), ('19', True), ('1', False), ('20', False)]:
            with self.subTest(intensity=intensity):
                self.assertEqual(bool(round_class_reading('0',
                    dict(numeric_value=intensity, comparator='='), context())), expected)

    def test_incomplete_conflicting_or_ambiguous_sources_cannot_normalize(self):
        contexts = []
        for missing in ('panel', 'class_legend', 'intensity_ranges', 'ocr_context_evidence'):
            ctx = context(); del ctx[missing]; contexts.append(ctx)
        ctx = context(); ctx['context_conflicts'] = ['printed_class_legends_disagree']; contexts.append(ctx)
        ctx = context(); ctx['intensity_ranges']['+'] = [15, 48]; contexts.append(ctx)
        ctx = context(); ctx['class_legend']['O'] = 'positive'; contexts.append(ctx)
        ctx = context(); ctx['ocr_context_evidence'][0].pop('raw_sha256'); contexts.append(ctx)
        ctx = context(); ctx['panel'] = 'unrelated_assay'; contexts.append(ctx)
        for ctx in contexts:
            with self.subTest(ctx=ctx):
                self.assertIsNone(round_class_reading('0', dict(numeric_value='17', comparator='='), ctx))
        for numeric, comparator in [('NaN', '='), ('Infinity', '='), ('', '='), ('17', '<'), (None, '=')]:
            self.assertIsNone(round_class_reading('0', dict(numeric_value=numeric, comparator=comparator), context()))
        for symbol in ('+', '++', '+++', '(+)', '', None, 'negative'):
            self.assertIsNone(round_class_reading(symbol, dict(numeric_value='17', comparator='='), context()))

    def test_pipeline_keeps_two_printed_columns_and_separate_legend_derivation(self):
        raw = 'Antigen\tIntensity\tClass\nKu\t17\t0\nNXP2\t18\t0'
        doc = dict(document_id='new-document', text_regions=[dict(table_id='heading', raw='Myositis')],
                   tables=[dict(table_id='results', raw=raw), dict(table_id='legend-new',
                       raw='Class\tIntensity\tExplanation\nO\t2 - 19\tNegative\n+\t20 - 48\tPositive')])
        pool = convert_documents([adapt_document(doc)], CATALOG)
        observation = next(o for o in pool['observations'] if o['field_id'] == 'MYO06')
        self.assertEqual(observation['numeric_value'], '17')
        self.assertEqual(observation['class_raw'], '0')
        self.assertEqual(observation['class_symbol'], 'o')
        self.assertEqual(observation['qualitative_value'], 'negative')
        self.assertEqual(observation['class_interpretation_origin'], 'source_legend')
        self.assertIn('class_symbol_ocr_variant', observation['flags'])  # Scoring policy unchanged.
        self.assertEqual(observation['review_status'], 'pending')
        self.assertFalse(observation['eligible_for_verified_pool'])
        ev = next(e for e in pool['evidence'] if e['evidence_id'] in observation['evidence_ids'])
        self.assertEqual(ev['row_raw'], ['Ku', '17', '0'])
        self.assertEqual(ev['table_sha256'], hashlib.sha256(raw.encode()).hexdigest())
        supplemental = next(m['value'] for m in pool['metadata_candidates']
                            if m['key'] == 'additional_lab_result' and m['value']['name'] == 'NXP2')
        self.assertEqual(supplemental['class_raw'], '0')
        self.assertEqual(supplemental['class_symbol'], 'o')
        self.assertEqual(supplemental['interpretation'], 'negative')

    def test_no_class_or_no_same_document_legend_does_not_invent_a_class(self):
        heading = [dict(table_id='heading', raw='Myositis')]
        for raw in ('Antigen\tIntensity\nKu\t17', 'Antigen\tIntensity\tClass\nKu\t17\t0'):
            pool = convert_documents([adapt_document(dict(document_id='unseen', text_regions=heading,
                         tables=[dict(table_id='result', raw=raw)]))], CATALOG)
            observation = pool['observations'][0]
            self.assertNotIn('class_symbol', observation)
            self.assertNotIn('qualitative_value', observation)
        legend_only = adapt_document(dict(document_id='other-document', text_regions=heading,
            tables=[dict(table_id='legend', raw='Class\tIntensity\tExplanation\nO\t2 - 19\tNegative')]))
        results_only = adapt_document(dict(document_id='result-document', text_regions=heading,
            tables=[dict(table_id='result', raw='Antigen\tIntensity\tClass\nKu\t17\t0')]))
        result = convert_documents([legend_only, results_only], CATALOG)['observations'][0]
        self.assertNotIn('class_symbol', result)
        self.assertIn('unresolved_class_symbol', result['flags'])


if __name__ == '__main__':
    unittest.main()
