import json
from pathlib import Path
import unittest

from ocr_pool import convert_documents
from ocr_pool.pipeline import number
from ocr_pool.tables import parse_tables, TableError

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))


def convert(raw, context=None, **table_options):
    return convert_documents([{'document_id': 'SYNTHETIC-DOC', 'source_kind': 'synthetic',
                               'context': context or {}, 'tables': [{'raw': raw, **table_options}]}], CATALOG)


class PoolTests(unittest.TestCase):
    def test_pattern_grade_continuation_keeps_both_source_rows(self):
        p = convert('Test\tResult\nKháng thể kháng nhân (anti -ANA)\tHomogeneous\n'
                    'bằng kỹ thuật huyền quang\t3+\nUnrecognized prose\tNonsense')
        o = p['observations'][0]
        self.assertEqual((o['pattern_raw'], o['grade_raw'], o['result_raw']), ('Homogeneous','3+','Homogeneous'))
        self.assertEqual(len(o['evidence_ids']),2)
        self.assertEqual([e['row_index_0based'] for e in p['evidence']],[1,2])
        self.assertEqual(p['evidence'][1]['row_raw'][1],'3+')
        self.assertIn('explicit_method_row_continuation',o['flags'])
        self.assertEqual(p['issues'][0]['name_raw'],'Unrecognized prose')

    def test_pattern_never_joins_grade_from_another_test_or_later_row(self):
        for suffix in ('C3\t3+', 'Unrecognized\t\nbằng kỹ thuật huỳnh quang\t3+'):
            p = convert('Test\tResult\nANA\tHomogeneous\n'+suffix)
            self.assertIsNone(p['observations'][0]['grade_raw'])
        p = convert('Test\tResult\nANA\tHomogeneous 2+\nbằng kỹ thuật huỳnh quang\t3+')
        self.assertEqual(p['observations'][0]['grade_raw'],'2+')
        self.assertIn('conflicting_continuation_grade',p['observations'][0]['flags'])
        self.assertEqual(len(p['observations'][0]['evidence_ids']),2)

    def test_full_width_note_is_not_a_second_upcr_result(self):
        p = convert('Test\tResult\tUnit\nUPCR\t0.10\tmg/mg\nUPCR\tUPCR\tUPCR', {'specimen': 'urine'})
        self.assertEqual(len(p['observations']), 1)
        self.assertEqual(p['observations'][0]['numeric_value'], '0.10')
        note = next(i for i in p['issues'] if i['reason'] == 'non_result_merged_row')
        self.assertEqual(note['row_raw'], ['UPCR', 'UPCR', 'UPCR'])

    def test_reordered_lab_columns_and_decimal_comma(self):
        p = convert('Test\tReference\tUnit\tResult\nC3\t0,9 - 1,8\tg/L\t0,65', {'decimal_separator': ','})
        o = p['observations'][0]
        self.assertEqual((o['field_id'], o['numeric_value'], o['unit_raw']), ('IMM11', '0.65', 'g/L'))
        self.assertEqual(o['reference_range_raw'], '0,9 - 1,8')
        self.assertEqual(p['fields']['EAC19']['extraction_status'], 'not_processed')
        self.assertEqual(len(p['fields']), 261)
        self.assertEqual(p['summary']['mapped_fields'], 1)
        self.assertFalse(o['eligible_for_verified_pool'])

    def test_malformed_and_plain_text_rejected(self):
        for text in ('C3 0.65 g/L 0.9-1.8', 'Test\tResult\tUnit\nC3\t0.65'):
            p = convert(text)
            self.assertFalse(p['observations'])
            self.assertEqual(p['fields']['IMM11']['extraction_status'], 'not_processed')
            self.assertEqual(p['issues'][0]['reason'], 'invalid_table_structure')

    def test_reject_truncation_even_if_html_closed(self):
        p = convert('Test\tResult\nC3\t0.65', truncated=True)
        self.assertEqual(p['issues'][0]['reason'], 'incomplete_generation')
        self.assertFalse(p['observations'])

    def test_panel_context_required(self):
        p = convert('Antigen\tIntensity\tClass\nKu\t8\tBorderline')
        self.assertFalse(p['observations'])
        self.assertEqual(p['fields']['ANA11']['extraction_status'], 'ambiguous_mapping')
        self.assertEqual(p['fields']['MYO06']['extraction_status'], 'ambiguous_mapping')

    def test_panel_identity_no_immunocap_leak(self):
        raw = 'Antigen\tIntensity\tClass\ndsDNA [AC-1] (dsDNA)\t0\to\nKu [AC-4] (Ku)\t8\t(+)\nScl-70 [AC-29] (Scl-70)\t124\t+++'
        p = convert(raw, {'panel': 'ana_profile_23', 'class_legend': {'o': 'negative', '(+)': 'borderline', '+++': 'strong_positive'}})
        self.assertEqual([o['field_id'] for o in p['observations']], ['ANA01', 'ANA11', 'ANA16'])
        self.assertEqual(p['observations'][-1]['qualitative_value'], 'strong_positive')
        self.assertFalse(p['fields']['IMM04']['observation_ids'])
        self.assertTrue(all(not o['flags'] for o in p['observations']))

    def test_do_not_interpret_symbol_without_legend(self):
        p = convert('Antigen\tIntensity\tClass\nKu\t8\t(+)', {'panel': 'myositis'})
        o = p['observations'][0]
        self.assertEqual(o['field_id'], 'MYO06')
        self.assertIn('unresolved_class_symbol', o['flags'])
        self.assertNotIn('qualitative_value', o)

    def test_explicit_source_legend_inconsistency_flagged(self):
        p = convert('Antigen\tIntensity\tClass\nKu\t8\t+++', {
            'panel': 'myositis', 'class_legend': {'+++': 'strong_positive'},
            'intensity_ranges': {'+++': [71, 255]}})
        self.assertIn('intensity_class_mismatch', p['observations'][0]['flags'])

    def test_numeric_and_qualitative_not_conflated(self):
        p = convert('Test\tResult\tUnit\nHBsAg\tÂm tính/Negative (0.376)\tCOI')
        o = p['observations'][0]
        self.assertEqual(o['numeric_value'], '0.376')
        self.assertEqual(o['qualitative_value'], 'negative')
        self.assertEqual(o['result_type'], 'mixed')

    def test_unsupported_antigen_not_forced_into_word(self):
        p = convert('Antigen\tIntensity\tClass\nOJ\t11\tBorderline\nNXP2\t4\tNegative', {'panel': 'myositis'})
        self.assertFalse(p['observations'])
        self.assertEqual([i['reason'] for i in p['issues']], ['unmapped_test', 'unmapped_test'])

    def test_blood_and_urine_rbc(self):
        blood = convert('Test\tResult\tUnit\nRBC\t4.8\tT/L', {'specimen': 'blood'})
        urine = convert('Test\tResult\tUnit\nRBC\tNegative\t', {'specimen': 'urine'})
        self.assertEqual(blood['observations'][0]['field_id'], 'HEM01')
        self.assertEqual(urine['observations'][0]['field_id'], 'REN02')
        self.assertFalse(convert('Test\tResult\tUnit\nRBC\t4.8\tT/L')['observations'])

    def test_numeric_error_not_corrected(self):
        p = convert('Test\tResult\tUnit\nCRP\t4.O\tmg/L')
        self.assertEqual(p['observations'][0]['result_type'], 'unparsed')
        self.assertEqual(p['fields']['IMM19']['extraction_status'], 'unreadable')
        self.assertIsNone(p['observations'][0]['numeric_value'])

    def test_comparator_kept_and_unit_mismatch_flagged(self):
        p = convert('Test\tResult\tUnit\nRF\t<10\tIU/mL\nCreatinine\t0.8\tmmol/L')
        self.assertEqual(p['observations'][0]['comparator'], '<')
        self.assertEqual(p['observations'][0]['numeric_value'], '10')
        self.assertIn('unit_mismatch', p['observations'][1]['flags'])

    def test_count_unit_G_is_not_mass_unit_g(self):
        p = convert('Test\tResult\tUnit\nWBC\t9.1\tg/L\nHGB\t135\tG/L', {'specimen': 'blood'})
        self.assertTrue(all('unit_mismatch' in o['flags'] for o in p['observations']))

    def test_latex_micro_is_typographic_not_dimensional_conversion(self):
        p = convert('Test\tResult\tUnit\nCreatinine\t50.6\t\\mu mol/L')
        self.assertEqual(p['observations'][0]['unit_raw'], '\\mu mol/L')
        self.assertNotIn('unit_mismatch', p['observations'][0]['flags'])

    def test_multiheader_html_pft(self):
        raw = '<table><tr><th rowspan="2">Test</th><th rowspan="2">Pred</th><th colspan="2">Pre</th><th colspan="2">Post</th></tr><tr><th>Meas.</th><th>%Pred</th><th>Meas.</th><th>%Pred</th></tr><tr><td>FVC(L)</td><td>4.0</td><td>3.0</td><td>75</td><td>3.2</td><td>80</td></tr></table>'
        p = convert(raw, {'panel': 'pft'})
        self.assertEqual([o['numeric_value'] for o in p['observations']], ['3.0', '75', '3.2', '80'])
        self.assertEqual([o['unit_raw'] for o in p['observations']], ['L', '%', 'L', '%'])
        self.assertTrue(all(o['field_id'] == 'PFT02' for o in p['observations']))
        self.assertNotIn('4.0', [o['numeric_value'] for o in p['observations']])

    def test_missing_post_preserved(self):
        p = convert('Test\tPre / Meas.\tPre / %Pred\tPost / Meas.\nFVC(L)\t3.0\t75\t----', {'panel': 'pft'})
        self.assertEqual(p['observations'][-1]['result_type'], 'missing')
        self.assertIsNone(p['observations'][-1]['numeric_value'])
        self.assertEqual(p['observations'][-1]['missing_reason'], 'source_placeholder')
        self.assertNotIn('unreadable_result', p['observations'][-1]['flags'])

    def test_repeat_dates_kept_separately(self):
        docs = [{'document_id': str(i), 'context': {'source_date': date, 'date_type': 'sample_date'},
                 'tables': [{'raw': 'Test\tResult\tUnit\nC3\t' + value + '\tg/L'}]}
                for i, (date, value) in enumerate([('2026-08-01', '0.65'), ('2026-08-14', '0.82')])]
        p = convert_documents(docs, CATALOG)
        self.assertEqual(len(p['fields']['IMM11']['observation_ids']), 2)
        self.assertEqual([o['source_date'] for o in p['observations']], ['2026-08-01', '2026-08-14'])

    def test_unprocessed_document_does_not_become_absent(self):
        docs = [{'document_id': 'good', 'tables': [{'raw': 'Test\tResult\tUnit\nC3\t0.65\tg/L'}]},
                {'document_id': 'pending', 'tables': []}]
        p = convert_documents(docs, CATALOG)
        self.assertEqual(p['fields']['IMM12']['extraction_status'], 'not_processed')
        self.assertEqual(p['processing_status'], 'partial')

    def test_html_truncation_and_overlap_rejected(self):
        for html in ('<table><tr><th>Test</th><th>Result</th></tr><tr><td>C3</td>',
                     '<table><tr><th>Test</th><th>Result</th></tr><tr><td>C3</td></tr></table>'):
            with self.assertRaises(TableError):
                parse_tables(html)

    def test_html_section_title_and_body_row_header(self):
        raw = '<table><tr><th colspan="3">Biochemistry</th></tr><tr><th>Test</th><th>Result</th><th>Unit</th></tr><tr><th>C3</th><td>0.65</td><td>g/L</td></tr></table>'
        p = convert(raw)
        self.assertEqual(p['observations'][0]['field_id'], 'IMM11')
        self.assertEqual(p['observations'][0]['numeric_value'], '0.65')

    def test_markdown_table(self):
        p = convert('| Test | Result | Unit |\n| --- | --- | --- |\n| CRP | 4.6 | mg/L |')
        self.assertEqual(p['observations'][0]['numeric_value'], '4.6')

    def test_otsl_and_case_variant_of_explicit_legend(self):
        raw = '<fcel>Antigen<fcel>Intensity<fcel>Class<nl><fcel>Ku [AC-4] (Ku)<fcel>8<fcel>(+)<nl><fcel>dsDNA [AC-1] (dsDNA)<fcel>0<fcel>O<nl>'
        p = convert(raw, {'panel': 'ana_profile_23', 'class_legend': {'o': 'negative', '(+)': 'borderline'}})
        self.assertEqual([o['qualitative_value'] for o in p['observations']], ['borderline', 'negative'])
        self.assertEqual(p['observations'][1]['class_raw'], 'O')

    def test_otsl_spans_and_empty_cells(self):
        table = parse_tables('<fcel>A<lcel><fcel>C<nl><ucel><xcel><ecel><nl>')[0]
        self.assertEqual(table.rows, [['A', 'A', 'C'], ['A', 'A', '']])
        for bad in ('<fcel>A<fcel>B<nl><fcel>C<nl>', '<ucel><fcel>B<nl>',
                    '<fcel>A<ecel>not empty<nl>', '<fcel>A<fcel>B'):
            with self.assertRaises(TableError):
                parse_tables(bad, 'otsl')

    def test_decimal_requires_source_convention(self):
        with self.assertRaises(ValueError):
            number('1,234')
        with self.assertRaises(ValueError):
            number('1,234.5', ',')
        self.assertEqual(number('0,65', ',')['numeric_value'], '0.65')

    def test_pft_blank_header_requires_explicit_context(self):
        raw = [['', '', '', '', 'Pre', 'Pre', 'Post', 'Post'],
               ['', 'Upper SD', 'Pred.val.', 'Lower SD', 'Meas.', '%Pre', 'Meas.', '%Post'],
               ['FVC(L)', '5.0', '4.0', '3.0', '3.2', '80', '----', '----']]
        p = convert(raw, {'panel': 'pft'}, header_rows=2)
        self.assertEqual([o['numeric_value'] for o in p['observations'][:2]], ['3.2', '80'])
        self.assertFalse(convert(raw, header_rows=2)['observations'])

    def test_urine_grade_is_preserved_without_panel_interpretation(self):
        p = convert('Test\tResult\nWBC\t(+)', {'specimen': 'urine'})
        o = p['observations'][0]
        self.assertEqual((o['field_id'], o['symbolic_value']), ('REN03', '(+)'))
        self.assertNotIn('qualitative_value', o)

    def test_cbc_terminal_abbreviation_and_latex_name(self):
        p = convert('Test\tResult\tUnit\nThế tích trung bình hồng cầu-MCV ✓\t85.2\tfL', {'specimen': 'blood'})
        self.assertEqual(p['observations'][0]['field_id'], 'HEM03')
        p = convert('Test\tResult\tUnit\n\\(\\beta\\)-hCG\t1.72\tmIU/mL')
        self.assertEqual(p['observations'][0]['field_id'], 'HIS01')

    def test_pattern_grade_kept_and_unknown_annotation_rejected(self):
        p = convert('Test\tResult\nANA\tHomogeneous 3+')
        self.assertEqual(p['observations'][0]['pattern_raw'], 'Homogeneous')
        self.assertEqual(p['observations'][0]['grade_raw'], '3+')
        self.assertEqual(convert('Test\tResult\nANA\tHomogeneous invented note')['observations'][0]['result_type'], 'unparsed')


if __name__ == '__main__':
    unittest.main()
