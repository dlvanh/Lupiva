import json
from pathlib import Path
import unittest

from ocr_pool import convert_documents
from ocr_pool.automatic import adapt_document, merge_region, select_metadata_replacement, select_row_retries, select_focused_metadata
from ocr_pool.grid_geometry import refine_table
from ocr_pool.layout import bounded_box, route_document
from ocr_pool.layout_context import document_context, explicit_panel, round_symbol_agreement
from ocr_pool.regions import prepare_region, spec_from_provenance
from scripts.prepare_layout_identifiers import identifier_regions
from scripts.prepare_layout_headers import header_regions
from scripts.refine_layout_regions import refinable_panel

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))


def region(rid, raw, **kwargs):
    return dict(table_id=rid, raw=raw, format='auto', **kwargs)


class AutomaticTests(unittest.TestCase):
    def test_empty_or_self_referential_metadata_retry_cannot_replace_header(self):
        for raw in ('', 'As an AI language model, PID: MADEUP',
                    '作为一个人工智能语言模型，PID: MADEUP'):
            old=region('old','ANA Profile 23',purpose='metadata')
            retry=region('retry',raw,purpose='metadata')
            doc=dict(document_id='S',tables=[],text_regions=[old,retry])
            self.assertFalse(select_metadata_replacement(doc,[retry],date_order='DMY')['accepted'])
            self.assertEqual(old['purpose'],'metadata')
            self.assertEqual(retry['purpose'],'superseded_context')
            if raw:
                self.assertIn('ocr_self_referential_response',retry['ocr_quality_flags'])
                pool=convert_documents([doc],CATALOG)
                self.assertTrue(any(i['reason']=='ocr_region_needs_review' for i in pool['issues']))
                self.assertEqual(document_context(doc)['panel'],'ana_profile_23')

    def test_self_referential_response_cannot_inject_panel_context(self):
        doc=dict(tables=[],text_regions=[region('header','ANA Profile 23'),
            region('bad','As an AI language model, Myositis')])
        self.assertEqual(document_context(doc)['panel'],'ana_profile_23')

    def test_assay_header_band_avoids_larger_legend_and_empty_strip(self):
        def detection(rid,label,box):
            return dict(detection_id=rid,label=label,bbox_xyxy=box)
        doc=dict(document_id='S',image_size=[1000,1500],detections=[
            detection('assay','table',[50,400,950,600]),
            detection('legend','table',[50,700,950,1200])])
        ocr=dict(tables=[region('assay','Antigen\tIntensity\tClass\nKu\t8\t(+)'),
                         region('legend','Class\tIntensity\tExplanation\n(+)\t8 - 14\tBorderline')],
                 text_regions=[region('heading','ANA Profile 23')])
        self.assertEqual(header_regions(doc,ocr),[])
        doc['detections'].append(detection('sid','text',[700,360,940,385]))
        regions=header_regions(doc,ocr)
        self.assertEqual(len(regions),1)
        self.assertEqual(regions[0]['layout_provenance']['detection_ids'],['assay'])
        self.assertLess(regions[0]['bbox_xyxy'][3],450)

    def test_assay_word_in_lab_test_does_not_select_assay_grid_refinement(self):
        ocr=dict(tables=[region('lab','Chỉ định\tKết quả\tĐơn vị\nMyositis\tNegative\t')],text_regions=[])
        self.assertIsNone(refinable_panel(ocr))
        ocr=dict(tables=[region('panel','Antigen\tIntensity\tClass\nKu\t5\to')],
                 text_regions=[region('heading','Myositis')])
        self.assertEqual(refinable_panel(ocr),'myositis')

    def test_unusable_refinement_cannot_discard_parent_result_headers(self):
        parent=region('parent','Test\tResult\tUnit\nC3\t0.65\tg/L')
        target=dict(tables=[parent],text_regions=[])
        child=region('child','Value\tUnit\n0.65\tg/L',
                     region=dict(layout=dict(original_region_id='parent')))
        self.assertIsNone(merge_region(target,child,'tables'))
        pool=convert_documents([dict(document_id='S',**target)],CATALOG)
        self.assertEqual(pool['observations'][0]['numeric_value'],'0.65')
        self.assertEqual(target['tables'][1]['replacement_rejected_reason'],'result_header_structure_lost')

    def test_selective_row_retry_does_not_replace_good_parent_results(self):
        parent = region('parent', 'Test\tResult\nC3\t0.65\n'
            'Kháng thể kháng nhân (anti -ANA) extra notes\tHomogeneous 3+ notes')
        child = region('child', 'Test\tResult\nKháng thể kháng nhân (anti -ANA)\tHomogeneous\n'
            'bằng kỹ thuật huỳnh quang\t3+\nInvented prose\tNonsense',
            region=dict(layout=dict(row_parent_region_id='parent')))
        doc = adapt_document(dict(document_id='S',tables=[parent,child]))
        decisions = select_row_retries(doc,CATALOG)
        self.assertTrue(decisions[0]['accepted'])
        p = convert_documents([doc],CATALOG)
        self.assertEqual([o['field_id'] for o in p['observations']],['IMM11','IMM01'])
        self.assertEqual(p['observations'][1]['grade_raw'],'3+')
        # A second candidate is not selected arbitrarily.
        import copy
        second = copy.deepcopy(child)
        second['table_id'] = 'child2'
        doc['tables'].append(second)
        self.assertTrue(all(not d['accepted'] for d in select_row_retries(doc,CATALOG)))
        self.assertEqual(len(convert_documents([doc],CATALOG)['observations']),1)

    def test_row_retry_rejects_missing_lineage_and_unrelated_parent(self):
        child = region('child','Test\tResult\nANA\tHomogeneous 3+',
                       region=dict(layout=dict(row_parent_region_id='missing')))
        doc = adapt_document(dict(document_id='S',tables=[child]))
        with self.assertRaises(ValueError):
            select_row_retries(doc,CATALOG)
        doc['tables'].append(region('missing','Test\tResult\nC3\t0.65'))
        self.assertFalse(select_row_retries(doc,CATALOG)[0]['accepted'])
        doc['tables'][-1]['raw']='Test\tResult\nANAother notes\tHomogeneous 3+ notes'
        self.assertFalse(select_row_retries(doc,CATALOG)[0]['accepted'])

    def test_failed_metadata_reconsideration_does_not_disable_selected_ids(self):
        old=region('old','Sex: F',purpose='metadata')
        focused=region('focused','PID: 123\nSID: A12',purpose='metadata')
        rejected=region('retry','PID: 123',purpose='superseded_context')
        doc=dict(document_id='S',text_regions=[old,focused,rejected])
        decision=select_metadata_replacement(doc,[focused,rejected],reconsider=True)
        self.assertFalse(decision['accepted'])
        self.assertEqual(focused['purpose'],'metadata')
        self.assertEqual(rejected['purpose'],'superseded_context')

    def test_combined_metadata_reconsideration_activates_complete_group(self):
        old=region('old','PID: 123\nSex: F\nNgày sinh:',purpose='metadata')
        lines=region('lines','PID: 123\nSex: F',purpose='superseded_context')
        focused=region('focused','PID: 123\nSID: A12',purpose='metadata')
        doc=dict(document_id='S',tables=[],text_regions=[old,lines,focused])
        self.assertTrue(select_metadata_replacement(doc,[lines,focused],reconsider=True)['accepted'])
        select_focused_metadata(doc,['focused'],['pid','sid'])
        facts=convert_documents([doc],CATALOG)['metadata_candidates']
        self.assertEqual([c['key'] for c in facts],['sex','pid','sid'])
        self.assertEqual(old['purpose'],'superseded_context')

    def test_focused_identifier_retry_retains_other_metadata_and_rejects_partial(self):
        old = region('old','PID: 123\nSID: A1\nSex: F',purpose='metadata')
        new = region('new','PID: 123\nSID: A12',purpose='metadata')
        doc = dict(document_id='S',tables=[],text_regions=[old,new])
        self.assertTrue(select_focused_metadata(doc,['new'],['pid','sid'])['accepted'])
        p = convert_documents([doc],CATALOG)
        self.assertEqual([(c['key'],c['value']) for c in p['metadata_candidates']],
                         [('sex','female'),('pid','123'),('sid','A12')])
        old = region('old','PID: 123\nSID: A1',purpose='metadata')
        new = region('new','PID: 123',purpose='metadata')
        doc = dict(document_id='S',tables=[],text_regions=[old,new])
        self.assertFalse(select_focused_metadata(doc,['new'],['pid','sid'])['accepted'])
        self.assertEqual(convert_documents([doc],CATALOG)['metadata_candidates'][1]['value'],'A1')

    def test_identifier_band_includes_gap_and_full_barcode_width(self):
        def d(rid,label,box):
            return dict(detection_id=rid,label=label,bbox_xyxy=box)
        doc=dict(document_id='S',image_size=[1000,1500],detections=[
            d('line','text',[650,50,800,80]),d('image','image',[700,130,950,170]),
            d('table','table',[50,400,950,1400])])
        box=identifier_regions(doc)[0]['bbox_xyxy']
        self.assertLess(box[0],650)
        self.assertGreater(box[2],950)
        self.assertGreaterEqual(box[3],130)
        doc['detections'].append(d('ambiguous','image',[600,200,850,240]))
        self.assertEqual(identifier_regions(doc),[])

    def test_recorded_transform_reconstructs_same_pixels(self):
        from PIL import Image
        im=Image.new('RGB',(100,100),'white')
        im.putpixel((20,70),(255,0,0))
        spec=dict(parent_region=dict(bbox_xyxy=[10,10,90,90]),
                  crop_parts=[dict(bbox_xyxy=[0,40,80,80],role='body')])
        first,provenance=prepare_region(im,spec)
        second,_=prepare_region(im,spec_from_provenance(provenance))
        self.assertEqual(first.tobytes(),second.tobytes())
        with self.assertRaises(ValueError):
            spec_from_provenance(dict(method='unknown'))

    def test_boxes_reject_invalid_and_clamp(self):
        for box in ([0, 0, float('nan'), 10], [10, 1, 2, 20], [200, 0, 300, 10]):
            with self.assertRaises(ValueError):
                bounded_box(box, (100, 100))
        self.assertEqual(bounded_box([-3, 2, 98.5, 101], (100, 100)), [0, 0, 100, 100])

    def test_charts_retained_without_numeric_inference(self):
        result = route_document(dict(document_id='S', input_path='local.png', input_sha256='hash',
            image_size=[100,100], detections=[dict(detection_id='chart', label='chart', bbox_xyxy=[0,0,100,100])]))
        self.assertEqual(result['regions'], [])
        self.assertEqual(result['layout_decisions'][0]['decision'], 'retained_unprocessed')

    def test_panel_needs_heading_and_rejects_conflicting_headings(self):
        self.assertIsNone(explicit_panel('Ku 8 (+) Scl-70 124 +++'))
        self.assertEqual(explicit_panel('ANA Profile 23'), 'ana_profile_23')
        context = document_context(dict(text_regions=[region('a','ANA Profile 23'), region('b','Myositis')]))
        self.assertNotIn('panel', context)
        self.assertIn('explicit_panel_headings_disagree', context['context_conflicts'])

    def test_supersession_keeps_metadata_without_duplicate_observation(self):
        doc = dict(document_id='S', tables=[], text_regions=[])
        merge_region(doc, region('parent', 'PID: 123\t\t\nTest\tResult\tUnit\nC3\t0.65\tg/L'), 'tables')
        merge_region(doc, region('child', 'Test\tResult\tUnit\nC3\t0.65\tg/L',
                                region={'layout': {'original_region_id':'parent'}}), 'tables')
        adapted = adapt_document(doc)
        pool = convert_documents([adapted], CATALOG)
        self.assertEqual(len(pool['observations']), 1)
        self.assertEqual(pool['observations'][0]['numeric_value'], '0.65')
        self.assertEqual(len(pool['metadata_candidates']), 1)
        self.assertEqual(pool['metadata_candidates'][0]['value'], '123')
        self.assertEqual(adapted['text_regions'][0]['derivation']['parent_table_id'], 'parent')
        with self.assertRaises(ValueError):
            merge_region(doc, region('second', 'Test\tResult\nC3\t1', region={'layout':{'original_region_id':'parent'}}), 'tables')

    def test_header_offset_keeps_source_row_index(self):
        doc = adapt_document(dict(document_id='S',input_sha256='source-hash', tables=[region('t', 'Title\tTitle\tTitle\nTest\tResult\tUnit\nC3\t0.65\tg/L')]))
        pool = convert_documents([doc], CATALOG)
        self.assertEqual(doc['tables'][0]['row_start'] + doc['tables'][0]['header_rows'], 2)
        self.assertEqual(pool['evidence'][0]['row_index_0based'], 2)
        self.assertEqual(pool['evidence'][0]['input_sha256'],'source-hash')

    def test_selected_legend_wins_over_manifest_and_parent(self):
        old = region('old', 'Class\tIntensity\tExplanation\no\t0 - 7\tNegative', superseded_by='new')
        new = region('new', 'Class\tIntensity\tExplanation\n0\t0 - 7\tNegative',
                     context={'class_legend': {'o':'negative'}})
        doc = adapt_document(dict(document_id='S', tables=[old,new]))
        self.assertEqual(doc['automatic_context']['class_legend'], {'0':'negative'})
        self.assertNotIn('o', doc['tables'][1]['context']['class_legend'])

    def test_conflicting_legends_do_not_choose_last(self):
        doc = dict(tables=[region('a','Class\tIntensity\tExplanation\no\t0 - 7\tNegative'),
                           region('b','Class\tIntensity\tExplanation\no\t0 - 7\tPositive')])
        context = document_context(doc)
        self.assertNotIn('class_legend', context)
        self.assertIn('printed_class_legends_disagree', context['context_conflicts'])

    def test_round_symbol_requires_corroboration_and_keeps_raw(self):
        doc = adapt_document(dict(document_id='S', text_regions=[region('heading','Myositis', purpose='source_context')],
            tables=[region('legend','Class\tIntensity\tExplanation\n0\t0 - 7\tNegative'),
                    region('t','Antigen\tIntensity\tClass\nKu\t5\tO')]))
        pool = convert_documents([doc], CATALOG)
        obs=pool['observations'][0]
        self.assertEqual(obs['qualitative_value'],'negative')
        self.assertEqual(obs['class_raw'],'O')
        self.assertEqual(obs['class_legend_symbol'],'0')
        self.assertIn('class_symbol_ocr_variant',obs['flags'])
        self.assertFalse(obs['eligible_for_verified_pool'])
        self.assertEqual(obs['review_status'],'pending')
        self.assertEqual(obs['class_interpretation_evidence'][0]['region_id'],'legend')

    def test_round_symbol_rejects_missing_evidence_range_or_panel(self):
        parsed={'numeric_value':'5','comparator':'='}
        context=dict(panel='myositis',class_legend={'0':'negative'},intensity_ranges={'0':[0,7]},
                     ocr_context_evidence=[dict(purpose='printed_class_legend',region_id='legend',raw_sha256='hash')])
        for missing in ('panel','intensity_ranges','ocr_context_evidence'):
            reduced={k:v for k,v in context.items() if k!=missing}
            self.assertIsNone(round_symbol_agreement('o',parsed,reduced))
        self.assertIsNone(round_symbol_agreement('o',{'numeric_value':'8','comparator':'='},context))
        self.assertIsNone(round_symbol_agreement('o',{'numeric_value':'5','comparator':'<'},context))
        self.assertIsNone(round_symbol_agreement('+',parsed,context))
        context['class_legend']['0']='positive'
        self.assertIsNone(round_symbol_agreement('o',parsed,context))

    def test_round_symbol_rejects_conflicts_and_overlapping_ranges(self):
        context=dict(panel='ana_profile_23',class_legend={'0':'negative','(+)':'borderline'},
            intensity_ranges={'0':[0,7],'(+)':[7,14]},
            ocr_context_evidence=[dict(purpose='printed_class_legend',region_id='legend',raw_sha256='hash')])
        self.assertIsNone(round_symbol_agreement('o',{'numeric_value':'7','comparator':'='},context))
        context['context_conflicts']=['printed_class_legends_disagree']
        self.assertIsNone(round_symbol_agreement('o',{'numeric_value':'5','comparator':'='},context))

    def test_printed_plus_levels_remain_distinct(self):
        legend='Class\tIntensity\tExplanation\n0\t0 - 7\tNegative\n(+)\t8 - 14\tBorderline\n+\t15 - 35\tPositive\n++\t36 - 70\tPositive\n+++\t71 - 255\tStrong positive'
        raw='Antigen\tIntensity\tClass\nKu\t7\to\nKu\t8\t(+)\nKu\t15\t+\nKu\t36\t++\nKu\t71\t+++'
        doc=adapt_document(dict(document_id='S',text_regions=[region('heading','Myositis')],
            tables=[region('legend',legend),region('results',raw)]))
        observations=convert_documents([doc],CATALOG)['observations']
        self.assertEqual([o['class_raw'] for o in observations],['o','(+)','+','++','+++'])
        self.assertEqual([o['qualitative_value'] for o in observations],
                         ['negative','borderline','positive','positive','strong_positive'])
        self.assertTrue(all('class_symbol_ocr_variant' not in o['flags'] for o in observations[1:]))

    def test_transformed_parts_keep_all_requested_pixels_and_bounds(self):
        from PIL import Image
        im = Image.new('RGB', (120,100), 'white')
        im.putpixel((30,90), (255,0,0))
        spec = dict(parent_region={'bbox_xyxy':[10,0,110,100]},
                    crop_parts=[dict(bbox_xyxy=[0,10,100,100], role='body')])
        crop, evidence = prepare_region(im,spec)
        self.assertEqual(crop.getpixel((20,80)), (255,0,0))
        self.assertEqual(evidence['parent']['bbox_xyxy'], [10,0,110,100])
        spec['crop_parts'][0]['bbox_xyxy'][3] = 101
        with self.assertRaises(ValueError):
            prepare_region(im,spec)

    def test_uncertain_grid_rejected(self):
        from PIL import Image
        im = Image.new('RGB',(500,500),'white')
        with self.assertRaises(ValueError):
            refine_table(im, {'polygon_xy': [[0,0],[499,0],[499,499],[0,499]]}, 'myositis')

    def test_metadata_retry_cannot_drop_valid_keys(self):
        old=region('old','PID: 123\nSex: F')
        old['purpose']='metadata'
        new=region('new','PID: 123',purpose='metadata')
        doc=dict(document_id='S',text_regions=[old,new])
        decision=select_metadata_replacement(doc,[new])
        self.assertFalse(decision['accepted'])
        self.assertEqual(old['purpose'],'metadata')
        self.assertEqual(new['purpose'],'superseded_context')

    def test_complete_metadata_retry_replaces_all_prior_groups(self):
        old=region('old','PID: 123\nSex: F',purpose='metadata')
        new=region('new','PID: 123\nSex: F',purpose='metadata')
        doc=dict(document_id='S',text_regions=[old,new])
        self.assertTrue(select_metadata_replacement(doc,[new])['accepted'])
        pool=convert_documents([doc],CATALOG)
        self.assertEqual(len(pool['metadata_candidates']),2)
        self.assertEqual(old['superseded_by'],['new'])

    def test_lab_header_takes_priority_over_assay_panel_context(self):
        def detection(rid,label,box):
            return dict(detection_id=rid,label=label,bbox_xyxy=box)
        doc=dict(document_id='S',image_size=[1000,1500],detections=[
            detection('title','doc_title',[300,250,650,300]),
            detection('metadata','text',[550,320,900,350]),
            detection('table','table',[50,400,950,1400])])
        ocr=dict(tables=[region('table','Chỉ định\tKết quả\tĐơn vị\nMyositis\tNegative\t')])
        regions=header_regions(doc,ocr)
        self.assertTrue(any('clinical-header' in r['region_id'] for r in regions))
        self.assertFalse(any('table-header' in r['region_id'] for r in regions))

    def test_header_only_ocr_is_not_a_missing_clinical_value(self):
        pool=convert_documents([dict(document_id='S',tables=[region('t','<fcel>Test<fcel>Result<nl>')])],CATALOG)
        self.assertEqual(pool['observations'],[])
        self.assertEqual(pool['issues'][0]['reason'],'header_only_no_data_rows')


if __name__ == '__main__':
    unittest.main()
