"""Novel values/layouts and negative controls; no patient files or answers."""
import json
from pathlib import Path
import unittest

from ocr_pool import convert_documents
from ocr_pool.automatic import adapt_document, merge_region
from ocr_pool.pipeline import number, result_value
from scripts.refine_layout_regions import refinable_panel
from scripts.prepare_layout_headers import header_regions
from registry_review.store import validate_result
from registry_export.word import display

CATALOG = json.loads((Path(__file__).resolve().parents[1] / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))


def doc(raw, **context):
    return dict(document_id='novel-source', tables=[dict(table_id='grid', raw=raw, context=context)], text_regions=[])


class GenericLabRepairTests(unittest.TestCase):
    def test_grouped_numbers_require_valid_groups_and_convention(self):
        for raw, expected in [('2,765.08', '2765.08'), ('>=12,345,678.90', '12345678.90'),
                              ('-9,876.50', '-9876.50')]:
            self.assertEqual(number(raw)['numeric_value'], expected)
        self.assertEqual(number('2.765,08', ',')['numeric_value'], '2765.08')
        for raw in ('2,765', '27,65.08', '2.765,08', '1..5', 'NaN', '1,2,3', '1e4'):
            with self.subTest(raw=raw), self.assertRaises(ValueError): number(raw)
        with self.assertRaises(ValueError): number('2,765.08', ',')

    def test_lab_flags_do_not_become_positivity(self):
        for raw, value, flag in [('<7.50 L','7.50','L'), ('93.8 HH','93.8','HH'), ('2,876.9 H','2876.9','H'), ('14 ↓','14','↓')]:
            parsed, flags = result_value(raw, 'mixed', {})
            self.assertEqual(parsed['numeric_value'],value)
            self.assertEqual(parsed['source_flag_raw'],flag)
            self.assertNotIn('qualitative_value',parsed)
            self.assertIn('explicit_source_result_flag',flags)
        for raw in ('H 12', '18 High', '18 HL', 'H', '12 mg/L H'):
            self.assertEqual(result_value(raw,'numeric',{})[0]['result_type'],'unparsed')

    def test_pattern_titre_and_grade_remain_distinct(self):
        for raw, pattern, grade, titre in [('Speckled 1:640','Speckled',None,'1:640'),
                ('Nucleolar 2+ 1 : 80','Nucleolar','2+','1 : 80'), ('Centromere +++','Centromere','+++',None)]:
            value, flags = result_value(raw,'pattern',{})
            self.assertEqual((value['pattern_raw'],value['grade_raw'],value.get('titre_raw')), (pattern,grade,titre))
            self.assertFalse(flags)
        for raw in ('Speckled 2:640','Nucleolar 1:0','Speckled 1:160 positive','Unknown 1:80'):
            self.assertEqual(result_value(raw,'pattern',{})[0]['result_type'],'unparsed')

    def test_cbc_inference_is_table_scoped_and_not_value_based(self):
        rows = ['WBC\t8.27\tG/L','MCV\t91.3\tfL','RBC\t4.23\tT/L','PLT\t218\tG/L','HGB\t127\tg/L']
        source=doc('Test\tResult\tUnit\n'+'\n'.join(rows))
        source['tables'].append(dict(table_id='urine',raw='Test\tResult\tUnit\nRBC\t5\t/HPF'))
        source['text_regions'].append(dict(table_id='heading',raw='General Hematology',format='text'))
        adapted=adapt_document(source)
        self.assertEqual(adapted['tables'][0]['context']['specimen'],'blood')
        self.assertNotIn('specimen',adapted['tables'][1]['context'])
        for raw in ('Test\tResult\tUnit\nRBC\t5\tT/L\nWBC\t8\tG/L',
                    'Test\tResult\tUnit\n'+'\n'.join(rows+['Urine\t\t'])):
            self.assertNotIn('specimen',adapt_document(doc(raw))['tables'][0]['context'])
        wrong='Test\tResult\tUnit\n'+'\n'.join(rows).replace('G/L','g/L').replace('T/L','g/L')
        self.assertNotIn('specimen',adapt_document(doc(wrong))['tables'][0]['context'])

    def test_contradictory_cbc_rows_are_both_retained_and_flagged(self):
        source=doc('Test\tResult\tUnit\nNE%\t48.7\t%\nNE%\t63.9\t%',specimen='blood')
        pool=convert_documents([source],CATALOG)
        self.assertEqual([o['numeric_value'] for o in pool['observations']],['48.7','63.9'])
        self.assertTrue(all('conflicting_source_results' in o['flags'] and not o['eligible_for_verified_pool'] for o in pool['observations']))

    def test_pft_refinement_cannot_replace_valid_parent_with_lost_groups(self):
        parent=dict(table_id='parent',raw='Spirometry\tSpirometry\tSpirometry\tSpirometry\n'
            '\t\tPre\tPre\n\tPred.val.\tMeas.\t%Pre\nVC(L)\t3.9\t4.11\t105.38')
        child=dict(table_id='child',raw='Spirometry\tSpirometry\tSpirometry\tSpirometry\n'
            '\t\t\tPre\n\tPred.val.\tMeas.\t%Pre\nVC(L)\t3.9\t4.11\t105.38',
            region={'layout':{'original_region_id':'parent'}})
        source=dict(document_id='pft',tables=[parent],text_regions=[])
        merge_region(source,child,'tables')
        self.assertEqual(source['tables'][1]['replacement_rejected_reason'],'result_header_structure_lost')
        pool=convert_documents([adapt_document(source)],CATALOG)
        self.assertEqual({o['component']:o['numeric_value'] for o in pool['observations']},
                         {'pre_measured':'4.11','pre_percent_predicted':'105.38'})

    def test_truncation_retry_does_not_guess_panel_from_legend(self):
        source=dict(tables=[dict(table_id='broken',raw='<fcel>SID: 77<lcel>',truncated=True),
            dict(table_id='legend',raw='Class\tIntensity\tExplanation\n+\t16 - 39\tPositive')],text_regions=[])
        self.assertEqual(refinable_panel(source),'antibody_grid')
        adapted=adapt_document(dict(document_id='truncated',**source))
        self.assertNotIn('panel',adapted['automatic_context'])
        self.assertFalse(convert_documents([adapted],CATALOG)['observations'])

    def test_source_flags_survive_review_and_printing(self):
        value=dict(result_type='numeric',numeric_value='91.7',comparator='=',source_flag_raw='L')
        validate_result(value)
        self.assertEqual(display(value),'91.7 L')
        with self.assertRaises(ValueError): validate_result({**value,'source_flag_raw':'positive'})
        with self.assertRaises(ValueError): validate_result(dict(result_type='qualitative',qualitative_value='negative',source_flag_raw='L'))

    def test_spanning_pft_datetime_and_cmt_are_explicit_metadata(self):
        source=doc('<table><tr><td colspan="4">Spirometry - Plethysmography 21/09/2025 11:32:46 AM</td></tr>'
                   '<tr><td></td><td></td><td>Pre</td><td>Pre</td></tr>'
                   '<tr><td></td><td>Pred.val.</td><td>Meas.</td><td>%Pre</td></tr>'
                   '<tr><td>VC(L)</td><td>4.1</td><td>4.4</td><td>107.3</td></tr></table>')
        source['text_regions']=[dict(table_id='id',raw='CMT: 991122334455',format='text')]
        pool=convert_documents([adapt_document(source,date_order='DMY')],CATALOG)
        facts={m['key']:m['value'] for m in pool['metadata_candidates']}
        self.assertEqual(facts['measurement_date'],'2025-09-21T11:32:46')
        self.assertEqual(facts['identity_number'],'991122334455')
        self.assertTrue(all(o['source_date']=='2025-09-21T11:32:46' for o in pool['observations']))

    def test_missing_identifier_detector_uses_bounded_gap_after_patient_grid(self):
        def det(rid,box): return dict(detection_id=rid,label='table',bbox_xyxy=box)
        layout=dict(document_id='other',image_size=[1200,1800],detections=[
            det('patient',[80,250,1110,330]),det('assays',[80,380,1110,1100]),det('legend',[80,1200,1110,1400])])
        source=dict(tables=[dict(table_id='patient',raw='Patient name: X\tPID: 78\nDate of birth: 03/04/1991\tSex: F'),
            dict(table_id='assays',raw='Antigen\tIntensity\tClass\nKu\t6\to')],
            text_regions=[dict(table_id='title',raw='ANA Profile 23')])
        regions=header_regions(layout,source)
        self.assertEqual(len(regions),1)
        self.assertLess(regions[0]['bbox_xyxy'][1],350)
        self.assertLess(regions[0]['bbox_xyxy'][3],420)

    def test_supplemental_offset_and_equal_printed_occurrences_keep_evidence(self):
        source=doc('Spirometry\tSpirometry\tSpirometry\tSpirometry\n'
                   '\t\tPre\tPre\n\tPred.val.\tMeas.\t%Pre\n'
                   'MEF(L/S)\t4.9\t5.1\t104.1\nMEF(L/S)\t4.9\t5.1\t104.1')
        pool=convert_documents([adapt_document(source)],CATALOG)
        extras=[m for m in pool['metadata_candidates'] if m['key']=='additional_lab_result']
        self.assertEqual(len(extras),2)
        evidence={e['evidence_id']:e for e in pool['evidence']}
        self.assertEqual([evidence[m['evidence_ids'][0]]['row_index_0based'] for m in extras],[3,4])


if __name__ == '__main__': unittest.main()
