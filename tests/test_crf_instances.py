"""Same-page repeat measurements, using the schema's HEM05 (WBC) field."""
import copy
import hashlib
from io import BytesIO
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from ocr_pool import convert_documents
from registry_export.mapping import NS, build_mapping
from registry_pool.dictionary import digest
from registry_pool.exchange import convert_candidate
from registry_pool.slots import parse_slot
from registry_review.crf import CRFReview, form_fields
from registry_review.crf_knowledge import LAB_FINDINGS
from registry_review.crf_lab_findings import lab_finding_proposals
from registry_review.crf_scores import evaluate_scores
from registry_review.store import ReviewStore
from registry_review.workspace import patient_workspace
from test_source_review import CATALOG, DICTIONARY

ROOT = Path(__file__).resolve().parents[1]


def source(number, index=0, document='image', row=None, box=None):
    position = dict(table_id='cbc', row_index_0based=row)
    if box:
        position['region'] = dict(llm_row_location=dict(box=box))
    return dict(kind='observation', field_id='HEM05', component='result', selection_id=f'wbc{index}',
                current_revision=True, review_status='pending', confidence={}, document_id=document,
                source_positions=[position], value=dict(result_type='numeric', numeric_value=number,
                unit_raw='G/L', comparator='=', source_date='2026-11-10'))


def fields(*sources):
    return [f for f in form_fields(DICTIONARY, dict(candidates=list(sources), case={}))
            if parse_slot(f['slot'])[0] == 'HEM05']


class InstanceTests(unittest.TestCase):
    def test_slot_parser(self):
        self.assertEqual(parse_slot('HEM05/result'), ('HEM05', 'result', 1))
        self.assertEqual(parse_slot('HEM07/absolute_count#2'), ('HEM07', 'absolute_count', 2))
        for slot in ['HEM05/result#0', 'HEM05/result#x', 'HEM05', 'HEM05/result#2/extra']:
            with self.assertRaises(ValueError):
                parse_slot(slot)

    def test_repeats_follow_rows_not_extraction_order(self):
        first, second = source('9.54', row=2), source('8.70', 1, row=4)
        label = next(f['label'] for f in DICTIONARY['fields'] if f['field_id'] == 'HEM05')
        for sources, expected in [([first, second], ['9.54 G/L', '8.70 G/L']),
                                  ([second, first], ['9.54 G/L', '8.70 G/L'])]:
            result = fields(*sources)
            self.assertEqual([f['slot'] for f in result], ['HEM05/result', 'HEM05/result#2'])
            self.assertEqual([f['label'] for f in result], [label+' -1', label+' -2'])
            self.assertEqual([f['options'][0]['value'] for f in result], expected)
            self.assertEqual([(f['instance'], f['instances']) for f in result], [(1, 2), (2, 2)])
            self.assertTrue(all(len(f['options']) == len(f['options'][0]['sources']) == 1 for f in result))
        first['source_positions'][0]['row_index_0based'] = 5
        self.assertEqual(fields(first, second)[0]['options'][0]['value'], '8.70 G/L')

    def test_row_boxes_take_precedence_and_missing_positions_use_extraction_order(self):
        first = source('9.54', row=0, box=[0, 500, 900, 550])
        second = source('8.70', 1, row=1, box=[0, 200, 900, 250])
        self.assertEqual(fields(first, second)[0]['options'][0]['value'], '8.70 G/L')
        second['source_positions'][0].pop('region')
        self.assertEqual(fields(first, second)[0]['options'][0]['value'], '9.54 G/L')
        first['source_positions'] = second['source_positions'] = []
        self.assertEqual(fields(first, second)[0]['options'][0]['value'], '9.54 G/L')

    def test_equal_values_collapse_and_other_images_remain_choices(self):
        first, second = source('9.54'), source('9.54', 1)
        result = fields(first, second)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['instances'], 1)
        self.assertFalse(result[0]['label'].endswith(' -1'))
        self.assertEqual(result[0]['options'][0]['sources'], ['wbc0', 'wbc1'])
        second.update(document_id='other', value={**second['value'], 'numeric_value':'8.70'})
        result = fields(first, second)
        self.assertEqual(len(result), 1)
        self.assertEqual(len(result[0]['options']), 2)
        result = fields(first, source('8.70', 2), second)
        self.assertEqual(len(result), 2)
        self.assertEqual(len(result[0]['options']), 2)
        self.assertEqual(result[1]['options'][0]['sources'], ['wbc2'])

    def test_three_distinct_measurements_and_equal_duplicate(self):
        result = fields(source('9.54', row=0), source('8.70', 1, row=1),
                        source('8.70', 2, row=2), source('7.1', 3, row=3))
        self.assertEqual([f['slot'] for f in result], ['HEM05/result', 'HEM05/result#2', 'HEM05/result#3'])
        self.assertEqual(result[1]['options'][0]['sources'], ['wbc1', 'wbc2'])
        self.assertTrue(all(f['instances'] == 3 for f in result))

    def test_non_result_components_repeat_independently(self):
        sources = [source('1.8', row=1), source('0.9', 1, row=2)]
        for item in sources:
            item.update(field_id='HEM07', component='absolute_count')
        result = [f for f in form_fields(DICTIONARY, dict(candidates=sources, case={}))
                  if f['slot'].startswith('HEM07/absolute_count')]
        self.assertEqual([f['slot'] for f in result], ['HEM07/absolute_count', 'HEM07/absolute_count#2'])
        self.assertTrue(all(f['component'] == 'absolute_count' for f in result))

    def test_only_second_measurement_meets_lab_and_score_threshold_without_double_counting(self):
        sources = [source('9.54', row=0), source('2.9', 1, row=1)]
        report = evaluate_scores({'date':'2026-11-13'}, sources, {})
        self.assertEqual(set(report['suggestions']), {'EAC02', 'SDA24'})
        self.assertEqual(report['suggestions']['SDA24']['sources'], ['wbc1'])
        self.assertEqual(report['values'], {})
        proposals = lab_finding_proposals(dict(candidates=sources), {}, LAB_FINDINGS)
        self.assertEqual(proposals['HEM12/result']['sources'], ['wbc1'])
        self.assertEqual(proposals['HEM12/result']['value'], 'yes')
        self.assertTrue(proposals['HEM12/result']['requires_confirmation'])
        sources.append(source('2.8', 2, row=2))
        scored = evaluate_scores({'date':'2026-11-13', 'criteria':{'SDA24':'yes'}}, sources, {})
        self.assertEqual(scored['suggestions']['SDA24']['sources'], ['wbc1', 'wbc2'])
        self.assertEqual(scored['values']['SDA25/result']['value'], '1')


class InstanceReviewTests(unittest.TestCase):
    def setUp(self):
        (ROOT/'tmp').mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT/'tmp')
        self.root = Path(self.tmp.name)
        self.store = ReviewStore(self.root/'review.sqlite')
        self.person = dict(actor='Synthetic reviewer', role='source_reviewer')
        document = dict(document_id='SYNTHETIC', input_path='synthetic.png', input_sha256='b'*64,
                        tables=[dict(table_id='cbc', context={'specimen':'blood'},
                                     raw='Test\tResult\tUnit\nWBC\t9.54\tG/L\nWBC\t8.70\tG/L')])
        self.package = convert_candidate(convert_documents([document], CATALOG), DICTIONARY,
                                         package_id='SYNTHETIC-REPEATS')
        self.store.registry.import_package(self.package, DICTIONARY)
        self.case = self.store.create_case('SYNTHETIC-REPEATS', **self.person)
        self.store.assign_document(self.package['documents'][0]['document_id'],
                                   case_id=self.case['case_id'], reason='Synthetic', **self.person)
        self.crf = CRFReview(SimpleNamespace(bundles={}, exports=SimpleNamespace(
            configuration=lambda: (DICTIONARY, None, {}))))

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_workspace_positions_and_approval_of_instance_selection_and_manual_value(self):
        workspace = patient_workspace(self.store, DICTIONARY, self.case['case_id'])
        self.assertEqual([s['source_positions'][0]['row_index_0based'] for s in workspace['candidates']], [1, 2])
        view = self.crf.view(self.store, self.case['case_id'])
        by_slot = {f['slot']:f for f in view['fields']}
        request = dict(case_id=self.case['case_id'], source_snapshot=view['source_snapshot'],
                       draft_sha256=view['draft_sha256'], **self.person)
        selected = {slot:by_slot[slot]['options'][0]['id'] for slot in ['HEM05/result', 'HEM05/result#2']}
        receipt = self.crf.approve(self.store, selections=selected, **request)
        self.assertEqual(receipt['values']['HEM05/result#2']['value'], '8.70 G/L')
        self.assertEqual(len(receipt['sources']), 2)
        receipt = self.crf.approve(self.store, selections={'HEM05/result':selected['HEM05/result']},
                                   manual_values={'HEM05/result#2':'8.71 G/L'}, **request)
        self.assertEqual(receipt['values']['HEM05/result#2']['origin'], 'manual_entry')
        self.assertEqual(receipt['values']['HEM05/result#2']['sources'], [])
        with self.assertRaises(ValueError):
            self.crf.approve(self.store, selections={}, manual_values={'HEM05/result#3':'1'}, **request)

        # A generated minimal template verifies the real exporter without the
        # unavailable original Word file, while retaining all schema field IDs.
        template = self.root/'synthetic.docx'
        label = next(f['label'] for f in DICTIONARY['fields'] if f['field_id'] == 'HEM05')
        xml = f'''<w:document xmlns:w="{NS['w']}"><w:body><w:tbl><w:tr>
          <w:tc><w:p><w:r><w:t>{label}</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>(kết quả trích xuất từ hệ thống)</w:t></w:r></w:p></w:tc>
          </w:tr></w:tbl><w:sectPr/></w:body></w:document>'''
        with ZipFile(template, 'w') as archive:
            archive.writestr('word/document.xml', xml)
            archive.writestr('customXml/item.xml', 'preserved')
        dictionary = copy.deepcopy(DICTIONARY)
        dictionary['template_sha256'] = hashlib.sha256(template.read_bytes()).hexdigest()
        for field in dictionary['fields']:
            field['source_context'] = 'B1.' if field['field_id'] == 'HEM05' else 'B99.'
        mapping = build_mapping(dictionary, template)
        self.crf.application.exports = SimpleNamespace(template=template, configuration=lambda: (dictionary, mapping, {}))
        body = self.crf.word(self.store, self.case['case_id'], digest(receipt))
        with ZipFile(BytesIO(body)) as archive:
            root = ET.fromstring(archive.read('word/document.xml'))
            self.assertEqual(archive.read('customXml/item.xml'), b'preserved')
        cell = root.find('.//w:tr', NS).findall('w:tc', NS)[1]
        self.assertEqual(''.join(cell.itertext()), '9.54 G/L')
        paragraphs = [''.join(p.itertext()) for p in root.find('w:body', NS).findall('w:p', NS)]
        self.assertIn(label+' -2: 8.71 G/L', paragraphs)
