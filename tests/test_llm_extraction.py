"""Different analytes, values, inequalities and annotation placements."""
import unittest
from copy import deepcopy

from ocr_pool.llm_extraction import normalize_extraction, extraction_schema

DICTIONARY = {'fields': [
    {'field_id': 'TEST_A', 'components': [{'component_id': 'result'}]},
    {'field_id': 'TEST_B', 'components': [{'component_id': 'pre_measured'}, {'component_id': 'post_measured'}]},
]}


def row(**overrides):
    return {'field_id': None, 'component': 'result', 'numeric_value': '8.73',
            'comparator': '=', 'raw_result': '8.73', 'grade_raw': None,
            'source_column': 'result', 'table_kind': 'general_lab',
            'grade_annotation': None, **overrides}


def normalize(item):
    return normalize_extraction({'rows': [item], 'specimens': [], 'notes': [], 'warnings': []}, DICTIONARY)


class LlmExtractionTests(unittest.TestCase):
    def test_diffusion_mapping_requires_source_hb_and_correct_analyte(self):
        dictionary={'fields':[dict(field_id='TEST_HB',label='DLCO Hb (or TLco)',
                                  components=[dict(component_id='pre_measured')])]}
        labels=['Tlco(mL/mmHg/Mi)','Tlco without Hb','Kco (Hb)','Tlco (Hb)','DLCO Hb']
        rows=[row(field_id='TEST_HB',source_label=label,table_kind='pft',
                  component='pre_measured',source_column='pre_measured') for label in labels]
        fixed,_,issues=normalize_extraction(dict(rows=rows),dictionary)
        self.assertEqual([r['field_id'] for r in fixed['rows']],[None,None,None,'TEST_HB','TEST_HB'])
        self.assertEqual([i['row_index'] for i in issues if i['code']=='crf_hb_qualifier_missing'],[0,1,2])
        self.assertEqual([r['numeric_value'] for r in fixed['rows']],['8.73']*5)

    def test_reused_box_is_hidden_but_values_remain(self):
        box=[30,100,890,185]
        data=dict(rows=[row(row_box=box,source_label='C3'),row(row_box=box,source_label='C4')])
        result,_,issues=normalize_extraction(data,DICTIONARY)
        self.assertEqual([r['row_box'] for r in result['rows']],[None,None])
        self.assertEqual([i['code'] for i in issues],['source_row_box_reused']*2)

    def test_invalid_location_leaves_extracted_value_usable_for_review(self):
        for box in ([20,300,900,280],[0,-1,900,200],[0,100,1001,200],[0,100,900], [True,100,900,200]):
            with self.subTest(box=box):
                result, audit, issues = normalize(row(row_box=box))
                self.assertIsNone(result['rows'][0]['row_box'])
                self.assertEqual(result['rows'][0]['numeric_value'],'8.73')
                self.assertTrue(any(a['reason']=='invalid_row_box' for a in audit))
                self.assertEqual(issues,[])

    def test_schema_uses_nullable_branches_without_null_enum_members(self):
        base={'properties':{'rows':{'items':{'properties':{
            'field_id':{'type':['string','null']},'component':{'type':'string'},
            'comparator':{'type':['string','null']}},'required':[]}}}}
        schema=extraction_schema(base,DICTIONARY)
        props=schema['properties']['rows']['items']['properties']
        for name in ('field_id','comparator'):
            self.assertEqual(props[name]['anyOf'][1],{'type':'null'})
            self.assertNotIn(None,props[name]['anyOf'][0]['enum'])
        self.assertIn('pre_measured',props['component']['enum'])
        self.assertNotIn('source_column',base['properties']['rows']['items']['properties'])

    def test_invalid_sign_reparsed_only_when_raw_number_matches(self):
        for raw, value, sign in [('>=41.25', '41.25', '>='), ('Negative (<6.8)', '6.8', '<'), ('93.62', '93.62', '=')]:
            with self.subTest(raw=raw):
                result, audit, issues = normalize(row(raw_result=raw, numeric_value=value, comparator='?'))
                self.assertEqual(result['rows'][0]['comparator'], sign)
                self.assertTrue(audit)
                self.assertFalse(issues)
        for raw in ('see note', '8.73 or 9.84', '1,234', '17.5'):
            _, _, issues = normalize(row(raw_result=raw, comparator='?'))
            self.assertIn('invalid_comparator_without_unambiguous_source', [i['code'] for i in issues])

    def test_trim_and_unicode_preserve_inequality(self):
        result, _, issues = normalize(row(raw_result='≤8.73', comparator=' ≤ '))
        self.assertEqual(result['rows'][0]['comparator'], '<=')
        self.assertFalse(issues)
        _, _, issues = normalize(row(raw_result='<8.73', comparator='>'))
        self.assertIn('comparator_conflicts_with_raw_result', [i['code'] for i in issues])

    def test_pft_column_independent_of_crf_membership_and_value(self):
        for field in (None, 'TEST_B'):
            for column in ('pre_measured', 'post_measured'):
                result, _, issues = normalize(row(field_id=field, table_kind='pft', source_column=column))
                self.assertEqual(result['rows'][0]['component'], column)
                self.assertFalse(issues)
        _, _, issues = normalize(row(table_kind='pft', source_column='unknown', pre_percent_predicted='62.7'))
        self.assertIn('unresolved_pft_measurement_column', [i['code'] for i in issues])
        result, _, _ = normalize(row(pre_percent_predicted='73.2'))
        self.assertEqual(result['rows'][0]['component'], 'result')

    def test_grade_requires_explicit_result_cell_association(self):
        for text in ('2+', '++++', '+'):
            result, _, issues = normalize(row(numeric_value=None, comparator=None, raw_result='Speckled',
                grade_annotation={'text': text, 'placement': 'result_cell', 'association': 'confirmed'}))
            self.assertEqual(result['rows'][0]['grade_raw'], text)
            self.assertFalse(issues)
        result, _, issues = normalize(row(grade_raw='2+', grade_annotation={
            'text': '2+', 'placement': 'overlapping_note', 'association': 'ambiguous'}))
        self.assertIsNone(result['rows'][0]['grade_raw'])
        self.assertEqual(result['rows'][0]['grade_annotation']['text'], '2+')
        self.assertTrue(issues)
        source = {'rows': [row()], 'notes': ['Other source says 4+'], 'specimens': [], 'warnings': []}
        original = deepcopy(source)
        result, _, _ = normalize_extraction(source, DICTIONARY)
        self.assertIsNone(result['rows'][0]['grade_raw'])
        self.assertEqual(source, original)

    def test_unknown_field_or_wrong_component_is_not_accepted(self):
        for overrides in ({'field_id': 'UNLISTED'}, {'field_id': 'TEST_B'}):
            _, _, issues = normalize(row(**overrides))
            self.assertTrue(issues)

    def test_nonfinite_or_malformed_numeric_values_are_flagged(self):
        for value in ('NaN', 'Infinity', '1e3', 'twelve'):
            _, _, issues = normalize(row(numeric_value=value))
            self.assertIn('invalid_numeric_decimal_string', [i['code'] for i in issues])


if __name__ == '__main__': unittest.main()
