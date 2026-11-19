"""Novel annotated CBCs; no image names, patient IDs or existing test values."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

from ocr_pool import convert_documents
from ocr_pool.automatic import adapt_document
from ocr_pool.layout_context import blood_table_context
from ocr_pool.pipeline import roles, result_value
from ocr_pool.rules import resolve, strip_label_checkmarks
from ocr_pool.tables import parse_tables

CATALOG = json.loads((Path(__file__).resolve().parents[1] /
                     'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
ANCHORS = [('RBC','3.72','10^12/L'), ('HGB','118','g/L'),
           ('MCV','92.6','fL'), ('WBC','11.63','10^9/L'), ('PLT','417','10^9/L')]


def raw_table(rows):
    return 'Unit\tTest\tResult\n' + '\n'.join('\t'.join((unit,name,value)) for name,value,unit in rows)


def source(raw, **context):
    return dict(document_id='new-cbc', tables=[dict(table_id='cbc',raw=raw,context=context)], text_regions=[])


def context_for(rows):
    table = parse_tables(raw_table(rows))[0]
    return blood_table_context(table, roles(table.headers))


class CBCLabelAnnotationTests(unittest.TestCase):
    def test_explicit_checkmarks_at_both_edges_and_unicode_styles(self):
        for mark in ('✓','✔','☑','✅','✔\ufe0f','✓\ufe0e','✓ ✔'):
            for text in (f'RBC{mark}',f' {mark} RBC ',f'{mark} RBC {mark}'):
                with self.subTest(text=text):
                    self.assertEqual(strip_label_checkmarks(text),'RBC')

    def test_unknown_or_meaningful_annotations_are_not_erased(self):
        for label in ('RBC v','RBC V','RBC x','RBC X','RBC √','RBC +','RBC H',
                      'RBC →','RBC ✗','RBC ☒','RBC negative','RBC ghi chú','RB✓C','RBC (Hb)'):
            with self.subTest(label=label):
                self.assertEqual(strip_label_checkmarks(label),label)
        for suffix in (' v',' x',' +',' H',' ghi chú',' negative'):
            self.assertEqual(context_for([(n+suffix,v,u) for n,v,u in ANCHORS]),{})

    def test_shuffled_annotated_anchors_use_units_not_values_and_do_not_mutate_source(self):
        rows = [(f'✓ Thông số-{n} ✔\ufe0f',v,u) for n,v,u in reversed(ANCHORS)]
        table = parse_tables(raw_table(rows))[0]
        before = copy.deepcopy(table)
        context = blood_table_context(table,roles(table.headers))
        self.assertEqual(context['specimen'],'blood')
        self.assertEqual(context['specimen_context_labels'],['HGB','MCV','PLT','RBC','WBC'])
        self.assertEqual(context['specimen_context_label_normalization'],'edge_checkmarks_for_matching_only')
        self.assertEqual(table,before)
        changed_values = [(n,'unreadable',u) for n,_,u in rows]
        self.assertEqual(context_for(changed_values),context)

    def test_insufficient_repeated_or_wrong_units_cannot_establish_blood(self):
        for rows in (ANCHORS[:3], [ANCHORS[0]]*5, ANCHORS[1:],
                     [r for r in ANCHORS if r[0]!='WBC'],
                     [(n+' ✓',v,'g/L') for n,v,_ in ANCHORS],
                     [('RBC ✓','4','/HPF'),('WBC ✓','6','cells/uL')]):
            with self.subTest(rows=rows):
                self.assertEqual(context_for(rows),{})
        # Exactly four distinct coherent labels, including RBC/WBC, remain sufficient.
        self.assertEqual(context_for([r for r in ANCHORS if r[0]!='HGB'])['specimen'],'blood')

    def test_urine_and_mixed_sections_cannot_inherit_blood_from_annotations(self):
        for section in ('Urine','Nước tiểu','Biochemistry','Hóa sinh'):
            with self.subTest(section=section):
                self.assertEqual(context_for([(n+' ✓',v,u) for n,v,u in ANCHORS]+[(section,'','')]),{})
        doc = source(raw_table([(n+' ✓',v,u) for n,v,u in ANCHORS]))
        doc['tables'].append(dict(table_id='urine',raw=raw_table([('RBC ✓','9','/HPF'),('WBC ✔','4','cells/uL')]),context={'specimen':'urine'}))
        adapted = adapt_document(doc)
        self.assertEqual(adapted['tables'][0]['context']['specimen'],'blood')
        self.assertNotEqual(adapted['tables'][1]['context'].get('specimen'),'blood')
        # Explicit urine rows may be interpreted as urine; checkmarks never select blood.
        for label in ('RBC ✓','WBC ✔'):
            rule,_ = resolve(label,{'specimen':'urine'})
            self.assertTrue(rule['field_id'].startswith('REN'))

    def test_automatic_pipeline_recovers_counts_percentages_and_preserves_raw(self):
        rows = [(f'Chỉ số-{n} ☑',v,u) for n,v,u in ANCHORS]
        rows += [('Số lượng bạch cầu trung tính-NE# ✔\ufe0f','6.42','G/L'),
                 ('%Bạch cầu trung tính-NE% ✓','55.2','%')]
        raw = raw_table(rows)
        pool = convert_documents([adapt_document(source(raw))],CATALOG)
        self.assertEqual(len(pool['observations']),7)
        by_field = {(o['field_id'],o['component']):o for o in pool['observations']}
        self.assertEqual(by_field['HEM01','result']['numeric_value'],'3.72')
        self.assertEqual(by_field['HEM06','absolute_count']['numeric_value'],'6.42')
        self.assertEqual(by_field['HEM06','percentage']['numeric_value'],'55.2')
        for observation in pool['observations']:
            self.assertEqual(observation['specimen'],'blood')
            self.assertEqual(observation['review_status'],'pending')
            self.assertFalse(observation['eligible_for_verified_pool'])
            self.assertTrue(any(m in observation['name_raw'] for m in ('✓','☑','✔')))
        self.assertTrue(all(e['table_sha256']==hashlib.sha256(raw.encode()).hexdigest() for e in pool['evidence']))
        self.assertEqual([e['row_raw'] for e in pool['evidence']],[[u,n,v] for n,v,u in rows])

    def test_signs_and_handwritten_result_content_are_not_removed_from_cells(self):
        for raw in ('17 ✓','✓ 17','1O.2','12.8 ghi chú'):
            with self.subTest(raw=raw):
                parsed,flags=result_value(raw,'numeric',{})
                self.assertEqual(parsed['result_type'],'unparsed')
        # Existing H/L handling and numeric comparators retain their meaning.
        parsed,_=result_value('<4.25 H','numeric',{})
        self.assertEqual((parsed['numeric_value'],parsed['comparator'],parsed['source_flag_raw']),('4.25','<','H'))

    def test_panel_class_and_full_assay_names_remain_distinct(self):
        doc = source('Antigen\tIntensity\tClass\nKu\t22\t++',panel='myositis',
                     class_legend={'++':'positive'},intensity_ranges={'++':[15,34]})
        pool = convert_documents([doc],CATALOG)
        self.assertEqual(pool['observations'][0]['class_raw'],'++')
        self.assertEqual(pool['observations'][0]['qualitative_value'],'positive')
        self.assertEqual(resolve('MCV ghi chú ✓',{'specimen':'blood'}),(None,[]))
        mchc,_=resolve('Nồng độ huyết sắc tố-MCHC ✔\ufe0f',{'specimen':'blood'})
        self.assertEqual(mchc['field_id'],'HEM04')
        self.assertEqual(resolve('MCH ✔\ufe0f',{'specimen':'blood'}),(None,[]))


if __name__=='__main__':
    unittest.main()
