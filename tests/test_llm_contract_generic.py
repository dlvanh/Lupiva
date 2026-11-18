"""Unseen values, reordered roles and import checks; no patient/reference data."""
import copy
import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from ocr_pool.llm_extraction import normalize_extraction
from ocr_pool.llm_row_anchors import anchor_row_boxes
from ocr_pool.result_rules import load_result_rules
from ocr_pool.llm_verification import verify_extraction
from ocr_pool.llm_workflow import build_candidate
from registry_pool.exchange import convert_candidate
from registry_pool.store import Registry
from registry_review.confidence import assess
from test_llm_intake import row, result, image_bytes, DICTIONARY
from test_registry import candidate


class GenericContractTests(unittest.TestCase):
    def test_ocr_anchor_is_crop_relative_and_skips_duplicates_and_masks(self):
        old = [60, 800, 800, 825]
        labels = ('Test A (Hb)', 'Test A', 'Duplicate', 'Masked')
        record = dict(extraction=dict(rows=[row(source_label=label, row_box=old) for label in labels]),
                      normalization_audit=[])
        lines = [dict(text=text, box=[140, y, 230, y+25], confidence=.98)
                 for text, y in zip((*labels, 'Duplicate'), (420, 590, 670, 740, 705))]
        anchor_row_boxes(record, dict(plan=dict(size=[1200, 1000]), lines=lines),
                         dict(crop=[100, 300, 1100, 900], masks=[[135, 730, 235, 775]]))
        boxes = [item['row_box'] for item in record['extraction']['rows']]
        self.assertEqual(boxes, [[40, 200, 130, 242], [40, 483, 130, 525], old, old])
        self.assertEqual(len(record['normalization_audit']), 2)

    def test_page_wide_pixel_coordinates_are_normalized_using_both_axes(self):
        boxes = [[210, 300, 1680, 340], [210, 350, 1680, 390], [210, 400, 1680, 440]]
        raw = dict(rows=[row(source_label=f'Analyte {i}', row_box=box) for i, box in enumerate(boxes)])
        normalized, audit, _ = normalize_extraction(raw, DICTIONARY, image_size=(2100, 800))
        self.assertEqual([item['row_box'] for item in normalized['rows']],
                         [[100, 375, 800, 425], [100, 438, 800, 488], [100, 500, 800, 550]])
        self.assertEqual([item['row_box'] for item in raw['rows']], boxes)
        self.assertEqual(sum(change['reason'] == 'page_pixel_boxes_normalized' for change in audit), 3)

    def test_mixed_scales_do_not_rescale_existing_normalized_boxes(self):
        boxes = [[100, 375, 800, 425], [210, 350, 1680, 390], [210, 400, 1680, 440]]
        raw = dict(rows=[row(source_label=f'Analyte {i}', row_box=box) for i, box in enumerate(boxes)])
        normalized, _, _ = normalize_extraction(raw, DICTIONARY, image_size=(2100, 800))
        self.assertEqual([item['row_box'] for item in normalized['rows']], [boxes[0], None, None])

    def normalize(self, **overrides):
        item=row(numeric_value='67.29', raw_result='67.29', source_header='Result', **overrides)
        raw=dict(rows=[item], specimens=[], notes=[], warnings=[])
        original=copy.deepcopy(raw)
        out,audit,issues=normalize_extraction(raw,DICTIONARY)
        self.assertEqual(raw,original)
        return out['rows'][0],audit,{i['code'] for i in issues}

    def test_role_follows_printed_heading_not_panel_family(self):
        for header in ('Kết quả','RESULTS'):
            item=row(field_id='MYO03', component='intensity', table_kind='immunoblot',
                     source_column='intensity', source_header=header, class_header=None, class_raw='-',
                     numeric_value='29.8', raw_result='29.8 Positive', qualitative_value='Positive')
            out,audit,issues=normalize_extraction(dict(rows=[item]),DICTIONARY)
            self.assertEqual(out['rows'][0]['component'],'result')
            self.assertEqual(out['rows'][0]['source_column'],'result')
            self.assertEqual(out['rows'][0]['class_raw'],'-')
            self.assertIn('class_without_printed_column',{i['code'] for i in issues})
            self.assertTrue(audit)

    def test_class_requires_actual_class_heading_and_is_never_guessed(self):
        for header in (None,'Result','Interpretation'):
            _,_,issues=self.normalize(class_raw='o',class_header=header)
            self.assertIn('class_without_printed_column',issues)
        for header in ('Class','Phân loại'):
            out,_,issues=self.normalize(class_raw='o',class_header=header)
            self.assertNotIn('class_without_printed_column',issues)
            self.assertEqual(out['class_raw'],'o')

    def test_sqlite_result_literals_require_unambiguous_result_cell(self):
        db_path = Path(self.temp.name)/'rules.sqlite'
        schema = Path(__file__).resolve().parents[1]/'schemas/result-literals.sql'
        db = sqlite3.connect(db_path)
        try:
            db.executescript(schema.read_text(encoding='utf-8'))
        finally:
            db.close()
        rules = load_result_rules(db_path)
        def cell(literal, **overrides):
            fields = dict(numeric_value=None, comparator=None, unit_raw=None, source_header='Kết quả',
                          raw_result=literal)
            return row(**(fields | overrides))
        rows = [cell(' ++ '), cell('(++)'), cell('Âm tính'), cell('Yellow', field_id=None, source_label='Màu sắc'),
                cell('Yellow'), cell('o'), cell('0'), cell('-'), cell('2+'), cell('19.7 Positive'),
                cell('++', class_header='Class', class_raw='o'), cell('Negative', source_header=None),
                cell('++', source_column='intensity'), cell('Positive', qualitative_value='Ambiguous')]
        original = copy.deepcopy(rows)
        normalized, audit, _ = normalize_extraction(dict(rows=rows), DICTIONARY, result_rules=rules)
        self.assertEqual(rows, original)
        self.assertEqual([r['qualitative_value'] for r in normalized['rows']],
                         ['++', '(++)', 'Âm tính', 'Yellow']+[None]*9+['Ambiguous'])
        self.assertEqual(normalized['rows'][10]['class_raw'], 'o')
        edits = [a for a in audit if a['reason'] == 'literal_result_from_source_cell']
        self.assertEqual([a['row_index'] for a in edits], [0, 1, 2, 3])
        self.assertTrue(all(a['rule']['version'] == 'result-literals-1' for a in edits))
        self.assertEqual(normalize_extraction(dict(rows=rows), DICTIONARY, result_rules=rules)[0], normalized)

        record = result()
        record.update(raw_extraction=dict(rows=rows), normalization_audit=audit,
                      extraction=dict(rows=normalized['rows'][:4], specimens=[]))
        body = image_bytes('result-literal-evidence')
        record.update(outgoing_bytes=body, outgoing_sha256=hashlib.sha256(body).hexdigest())
        candidate_pool = build_candidate([dict(document_id='NEW', input_path='new.png',
            input_sha256=hashlib.sha256(body).hexdigest(), privacy=dict(crop=[0,0,40,40]))],
            [record], DICTIONARY, Path(self.temp.name)/'literal-evidence')
        self.assertEqual(candidate_pool['observations'][0]['qualitative_value'], '++')
        self.assertEqual(candidate_pool['evidence'][0]['result_literal_rule'],
                         dict(version='result-literals-1', scope='result', token='++'))

    def test_numeric_conflict_is_retained_and_review_required(self):
        item=row(numeric_value='6.7',raw_result='67 Positive',source_header='Result')
        out,_,issues=normalize_extraction(dict(rows=[item]),DICTIONARY)
        self.assertEqual(out['rows'][0]['numeric_value'],'6.7')
        self.assertIn('numeric_value_conflicts_with_raw_result',{i['code'] for i in issues})
        q=assess(dict(kind='observation',review_status='pending',value=dict(result_type='numeric',
            numeric_value='6.7',comparator='=',flags=['numeric_value_conflicts_with_raw_result'])),
            [dict(table_sha256='a'*64,region={'bbox_xyxy':[0,0,20,30]})])
        self.assertEqual(q['tier'],'low')
        self.assertFalse(q['auto_accept_eligible'])

    def test_percent_role_is_valid_for_legacy_and_explicit_headers(self):
        for column in ('percentage','pre_percent_predicted'):
            item=row(field_id='PFT03',table_kind='pft',component='pre_percent_predicted',
                     source_column=column,source_header='%Pre',numeric_value='87.63',raw_result='87.63',unit_raw='%')
            _,_,issues=normalize_extraction(dict(rows=[item]),DICTIONARY)
            self.assertFalse(any(i['code'] in {'component_conflicts_with_source_column',
                                              'unresolved_pft_measurement_column'} for i in issues))

    def test_cbc_generic_result_header_preserves_differential_roles(self):
        for component,value,unit in [('absolute_count','3.71','G/L'),('percentage','42.6','%')]:
            for column in ('result',component):
                item=row(field_id='HEM08',table_kind='cbc',source_header='Kết quả',
                         component=component,source_column=column,numeric_value=value,raw_result=value,unit_raw=unit)
                out,_,issues=normalize_extraction(dict(rows=[item]),DICTIONARY)
                self.assertEqual(out['rows'][0]['component'],component)
                self.assertFalse(issues)

    def test_printed_or_handwritten_grade_needs_cell_association(self):
        for style in ('printed','handwritten','unclear'):
            item=row(numeric_value=None,comparator=None,raw_result='Nucleolar',pattern_raw='Nucleolar',
                     grade_annotation=dict(text='2+',placement='result_cell',association='confirmed',writing_style=style))
            out,_,_=normalize_extraction(dict(rows=[item]),DICTIONARY)
            self.assertEqual(out['rows'][0]['grade_raw'],'2+')
            item['grade_annotation']['association']='ambiguous'
            out,_,issues=normalize_extraction(dict(rows=[item]),DICTIONARY)
            self.assertIsNone(out['rows'][0]['grade_raw'])
            self.assertIn('grade_association_requires_review',{i['code'] for i in issues})

    def build(self, rows):
        record=result();record['extraction']=copy.deepcopy(record['extraction'])
        record['extraction'].update(rows=rows,specimens=[])
        body=image_bytes('new-values-and-layout')
        record.update(outgoing_bytes=body,outgoing_sha256=hashlib.sha256(body).hexdigest())
        return build_candidate([dict(document_id='NEW',input_path='new.png',input_sha256=hashlib.sha256(body).hexdigest(),
            privacy=dict(crop=[0,0,40,40],masks=[],transform_manifest={'additional_masks':[[0,30,40,40]]}))],
            [record],DICTIONARY,Path(self.temp.name)/'adapter')

    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()

    def tearDown(self):
        self.temp.cleanup()

    def test_adapter_emits_percent_once_and_keeps_equal_physical_occurrences(self):
        item=row(field_id='PFT03',source_label='FEV1',component='pre_percent_predicted',table_kind='pft',
                 source_column='percentage',numeric_value='87.63',raw_result='87.63',pre_percent_predicted='87.63',unit_raw='%')
        c=self.build([item,copy.deepcopy(item)])
        self.assertEqual(len(c['observations']),2)
        self.assertNotEqual(c['observations'][0]['evidence_ids'],c['observations'][1]['evidence_ids'])
        self.assertEqual(c['observations'][0]['source_column'],'percentage')
        self.assertIn('transform_manifest',c['evidence'][0]['region'])
        p=convert_candidate(c,DICTIONARY)
        self.assertEqual(len(p['observations']),2)

    def test_pre_and_post_percent_slots_and_non_crf_values_survive(self):
        c=self.build([row(field_id='PFT03',source_label='FEV1',component='post_measured',
            source_column='post_measured',table_kind='pft',numeric_value='2.73',raw_result='2.73',
            post_percent_predicted='93.18',unit_raw='L'),
            row(field_id=None,source_label='Novel diffusion measure',component='pre_measured',
                source_column='pre_measured',table_kind='pft',numeric_value='4.28',raw_result='4.28',pre_percent_predicted='102.56')])
        self.assertEqual([(x['component'],x['numeric_value']) for x in c['observations']],
                         [('post_measured','2.73'),('post_percent_predicted','93.18')])
        self.assertEqual(c['metadata_candidates'][0]['value']['parsed_results']['pre_percent_predicted']['numeric_value'],'102.56')
        self.assertTrue(all(x['review_status']=='pending' for x in c['observations']))

    def test_export_content_id_after_dedup_is_importable_and_repeatable(self):
        c=candidate();original=copy.deepcopy(c['observations'][0]);duplicate=copy.deepcopy(original)
        duplicate['observation_id']='EXTRA-SOURCE-ID';c['observations'].append(duplicate)
        c['fields'][original['field_id']]['observation_ids'].append(duplicate['observation_id'])
        before=copy.deepcopy(c)
        p=convert_candidate(c,DICTIONARY,package_id='NEW-DEDUP')
        again=convert_candidate(c,DICTIONARY,package_id='NEW-DEDUP')
        self.assertEqual(p['observations'],again['observations'])
        self.assertEqual(c,before)
        self.assertEqual(len(p['observations']),1)
        with tempfile.TemporaryDirectory() as tmp:
            store=Registry(Path(tmp)/'test.sqlite')
            try:
                self.assertEqual(store.import_package(p,DICTIONARY)['status'],'imported')
                self.assertEqual(store.import_package(p,DICTIONARY)['status'],'already_imported')
                self.assertEqual(store.integrity()['foreign_key_errors'],[])
            finally:store.close()

    def verification_record(self):
        item=row(field_id='IMM01',source_label='Novel pattern source',numeric_value=None,comparator=None,
                 raw_result='Centromere',pattern_raw='Centromere',grade_raw=None,source_header='Result',
                 grade_annotation=dict(text='4+',placement='unclear',association='ambiguous',writing_style='unclear'))
        raw=dict(rows=[item,row(source_label='Unrelated assay',raw_result='6.91',numeric_value='6.91')],
                 specimens=[],notes=[],warnings=[])
        return dict(raw_extraction=raw)

    def test_bounded_review_changes_only_flagged_attributes_preserves_raw(self):
        original=self.verification_record();snapshot=copy.deepcopy(original);calls=[]
        def review(*args,**kwargs):
            calls.append(kwargs);updated=copy.deepcopy(original['raw_extraction']['rows'][0])
            updated.update(numeric_value='999',pattern_raw='WRONG',grade_raw='4+',
                grade_annotation=dict(text='4+',placement='result_cell',association='confirmed',writing_style='printed'))
            return dict(raw_extraction=dict(rows=[updated]))
        out=verify_extraction(b'image',original,DICTIONARY,self.temp.name,reviewer=review)
        self.assertEqual(original,snapshot)
        self.assertEqual(out['raw_extraction'],original['raw_extraction'])
        self.assertEqual(out['extraction']['rows'][0]['grade_raw'],'4+')
        self.assertEqual(out['extraction']['rows'][0]['pattern_raw'],'Centromere')
        self.assertIsNone(out['extraction']['rows'][0]['numeric_value'])
        self.assertEqual(out['extraction']['rows'][1],original['raw_extraction']['rows'][1])
        self.assertEqual(calls[0]['review_labels'],['Novel pattern source'])
        verify_extraction(b'image',out,DICTIONARY,self.temp.name,reviewer=review)
        self.assertEqual(len(calls),1)

    def test_review_does_not_force_ambiguous_grade_or_accept_wrong_labels(self):
        original=self.verification_record()
        def still_ambiguous(*args,**kwargs):return dict(raw_extraction=dict(rows=[original['raw_extraction']['rows'][0]]))
        out=verify_extraction(b'image',original,DICTIONARY,self.temp.name,reviewer=still_ambiguous)
        self.assertIsNone(out['extraction']['rows'][0]['grade_raw'])
        def wrong(*args,**kwargs):return dict(raw_extraction=dict(rows=[row(source_label='different source')]))
        out=verify_extraction(b'image',original,DICTIONARY,self.temp.name,reviewer=wrong)
        self.assertEqual(out['verification']['status'],'alignment_failed_retained_initial')
        self.assertIsNone(out['extraction']['rows'][0]['grade_raw'])

    def test_review_skips_labels_that_cannot_be_aligned_without_guessing(self):
        original=self.verification_record()
        original['raw_extraction']['rows'].append(copy.deepcopy(original['raw_extraction']['rows'][0]))
        def forbidden(*args,**kwargs):self.fail('Duplicate source labels require manual alignment')
        out=verify_extraction(b'image',original,DICTIONARY,self.temp.name,reviewer=forbidden)
        self.assertFalse(out['verification']['attempted'])


if __name__=='__main__':unittest.main()
