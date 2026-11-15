"""Synthetic null-field catalogue mapping and candidate integration checks."""
import copy
import io
from pathlib import Path
import tempfile
import unittest

from PIL import Image
from ocr_pool.catalog_alias import CatalogAliases
from ocr_pool.gemini_workflow import build_candidate
from test_source_review import DICTIONARY


def row(label, **changes):
    return dict(field_id=None, source_label=label, component='result', raw_result='7.25',
                numeric_value='7.25', comparator='=', table_kind='general_lab') | changes


class CatalogAliasTests(unittest.TestCase):
    def setUp(self):
        self.aliases = CatalogAliases(DICTIONARY)

    def test_comparator_literal_recovers_number_only_from_plain_cells(self):
        from ocr_pool.gemini_workflow import _comparator_literal
        self.assertEqual(_comparator_literal(dict(raw_result='<10', numeric_value=None, comparator='<')),
                         dict(numeric_value='10', comparator='<'))
        self.assertEqual(_comparator_literal(dict(raw_result='≥ 2,5', numeric_value=None, comparator=None)),
                         dict(numeric_value='2.5', comparator='>='))
        self.assertIsNone(_comparator_literal(dict(raw_result='<10', numeric_value=None, comparator='>')))
        self.assertIsNone(_comparator_literal(dict(raw_result='10 (+)', numeric_value=None, comparator=None)))
        self.assertIsNone(_comparator_literal(dict(raw_result='<10', numeric_value='10', comparator='<')))

    def test_generic_request_prefix_and_panel_label_guard(self):
        self.assertEqual(self.aliases.match(row('Định lượng CRP'), {}), ('IMM19', 'result'))
        self.assertEqual(self.aliases.match(row('Định lượng IgE (Immunoglobuline E)'), {}), ('IMM13', 'result'))
        self.assertIsNone(self.aliases.match(row('Định lượng kẽm (Zn) máu'), {}))
        self.assertTrue(self.aliases.panel_mismatch(dict(field_id='MYO13', source_label='OJ')))
        self.assertTrue(self.aliases.panel_mismatch(dict(field_id='MYO05', source_label='NXP2')))
        for field, label in (('MYO13', 'EJ'), ('MYO09', 'Jo-1'), ('ANA07', 'nRNP/Sm'), ('ANA19', 'RP11 (subunit POLR3K)'),
                             ('ANA09', 'Mi-2α protein'), ('MYO15', 'cN-1A'), ('GI01', 'OJ')):
            self.assertFalse(self.aliases.panel_mismatch(dict(field_id=field, source_label=label)), label)

    def test_cbc_analyser_code_contradicting_assigned_field_is_unmapped(self):
        for field, label in (('HEM02', 'Nồng độ HGB trung bình hồng cầu-MCHC'), ('HEM03', 'Dải phân bố hồng cầu-RDW-CV'),
                             ('HEM04', 'Dải phân bố hồng cầu-RDW-SD'), ('HEM04', 'Lượng HGB trung bình-MCH')):
            self.assertTrue(self.aliases.panel_mismatch(dict(field_id=field, source_label=label, component='result')), label)
        for field, label, component in (('HEM04', 'Nồng độ HGB trung bình hồng cầu-MCHC', 'result'),
                                        ('HEM02', 'Huyết sắc tố-HGB', 'result'), ('HEM02', 'Hb', 'result'),
                                        ('HEM03', 'Thể tích trung bình hồng cầu-MCV', 'result'),
                                        ('HEM06', 'Bạch cầu trung tính-NE#', 'absolute_count'),
                                        ('HEM01', 'Số lượng hồng cầu-RBC', 'result'), ('HEM05', 'WBC', 'result')):
            self.assertFalse(self.aliases.panel_mismatch(dict(field_id=field, source_label=label, component=component)), label)
        self.assertEqual(self.aliases.match(row('Nồng độ HGB trung bình hồng cầu-MCHC'), {}), ('HEM04', 'result'))

    def test_urine_cells_need_explicit_urine_context(self):
        urine = dict(qualitative_value='positive', numeric_value=None, raw_result='(+)')
        self.assertEqual(self.aliases.match(row('Bạch cầu:', warning='Urine WBC qualitative', **urine), {}),
                         ('REN03', 'result'))
        self.assertEqual(self.aliases.match(row('Hồng cầu', specimen='Nước tiểu', **urine), {}),
                         ('REN02', 'result'))
        self.assertIsNone(self.aliases.match(row('Hồng cầu', **urine), {}))
        self.assertIsNone(self.aliases.match(row('Hồng cầu', warning='stool microscopy, not urine', **urine), {}))

    def test_catalogue_and_cbc_examples(self):
        for label, expected in (
                ('ASAT (GOT)', ('GI01','result')),
                ('ANA Profile 23 - dsDNA', ('ANA01','result')),
                ('%Bạch cầu ưa axit-EO%', ('HEM09','percentage')),
                ('%Bạch cầu bazơ-BA%', ('HEM10','percentage')),
                ('NE#', ('HEM06','absolute_count')), ('LY%', ('HEM07','percentage')),
                ('MCHC (g/L)', ('HEM04','result')), ('ASAT', ('GI01','result'))):
            with self.subTest(label=label):
                self.assertEqual(self.aliases.match(row(label), {}), expected)

    def test_duplicates_and_unknown_analytes_remain_unmapped(self):
        for label in ('Ku', 'PM-Scl100', 'PM-Scl75', 'Ro-52', 'Mi-2', 'Anti-TPO'):
            with self.subTest(label=label):
                self.assertIsNone(self.aliases.match(row(label), {}))

    def test_explicit_row_panel_disambiguates_duplicates(self):
        for label, field in (('ANA Profile 23 - Ku','ANA11'),
                             ('Myositis - Ku','MYO06'),
                             ('ANA Profile 23 - PM-Scl100','ANA17')):
            self.assertEqual(self.aliases.match(row(label), {}), (field,'result'))

    def test_existing_mapping_and_invalid_components_are_untouched(self):
        self.assertIsNone(self.aliases.match(row('ASAT (GOT)',field_id='GI02'), {}))
        self.assertIsNone(self.aliases.match(row('ASAT (GOT)',component='percentage'), {}))
        self.assertIsNone(self.aliases.match(row('EO',component='percentage'), {}))

    def test_urine_and_stool_context_block_blood_aliases(self):
        for context in ('urine', 'Nước tiểu', 'urinalysis', 'stool', 'Bệnh phẩm phân'):
            with self.subTest(context=context):
                wbc = self.aliases.match(row('WBC',specimen=context), {})
                # Never a blood field; explicit urine context may map to the urine-cell field.
                self.assertIn(wbc, (None, ('REN03', 'result')))
                if context in ('stool', 'Bệnh phẩm phân'):
                    self.assertIsNone(wbc)
                self.assertIsNone(self.aliases.match(row('EO%'), dict(table_context=context)))
                self.assertIsNone(self.aliases.match(row('NE#'), dict(specimens=[dict(sample_type=context)])))
        self.assertEqual(self.aliases.match(row('WBC',table_kind='urine'), {}), ('REN03', 'result'))

    def test_alias_collisions_across_dictionary_fields_remain_unmapped(self):
        dictionary = copy.deepcopy(DICTIONARY)
        field = copy.deepcopy(next(f for f in dictionary['fields'] if f['field_id']=='GI01'))
        field['field_id'] = 'SYNTHETIC'
        dictionary['fields'].append(field)
        self.assertIsNone(CatalogAliases(dictionary).match(row('ASAT (GOT)'), {}))

    def test_candidate_marks_mapping_and_preserves_values_and_source_rows(self):
        rows = [row(label) for label in ('ASAT (GOT)', 'ANA Profile 23 - dsDNA',
                '%Bạch cầu ưa axit-EO%', '%Bạch cầu bazơ-BA%', 'Ku', 'Anti-TPO')]
        original = copy.deepcopy(rows)
        body = io.BytesIO()
        Image.new('RGB',(20,20),'white').save(body,format='PNG')
        extraction = dict(rows=rows,specimens=[],notes=[],warnings=[])
        record = dict(extraction=extraction,raw_extraction=extraction,outgoing_bytes=body.getvalue(),
                      outgoing_sha256='a'*64,validation_issues=[])
        doc = dict(document_id='SYNTHETIC',input_path='synthetic.png',input_sha256='b'*64,
                   privacy=dict(crop=[0,0,20,20]))
        with tempfile.TemporaryDirectory() as folder:
            candidate = build_candidate([doc],[record],DICTIONARY,Path(folder))
        self.assertEqual([(o['field_id'],o['component']) for o in candidate['observations']],
                         [('GI01','result'),('ANA01','result'),('HEM09','percentage'),('HEM10','percentage')])
        for observation in candidate['observations']:
            self.assertIn('catalog_alias_mapped',observation['flags'])
            self.assertEqual(observation['validation_status'],'needs_review')
            self.assertEqual(observation['numeric_value'],'7.25')
            self.assertEqual(observation['result_raw'],'7.25')
        self.assertEqual(rows,original)
        self.assertEqual(len([m for m in candidate['metadata_candidates'] if m['key']=='additional_lab_result']),2)
