"""Coverage checks for the opt-in laboratory profile, with synthetic rows."""
import unittest
from unittest.mock import patch

from ocr_pool.llm import InvalidAPIResponse
from ocr_pool.lab_api import _expand, extract_lab_image, lab_crop_evidence
from ocr_pool.mixed_lab import fluorescence_split
from ocr_pool.lab_reference_cells import attach_complement_ranges
from ocr_pool.result_rules import load_result_rules
from test_source_review import DICTIONARY


def line(text, x, y):
    return dict(text=text, box=[x,y,x+42,y+12], confidence=.99)


def cell(label, value, **overrides):
    base = dict(label=label, value=value, unit=None, header='Kết quả', code=None, number=None,
                op=None, qualitative=None, cls=None, class_header=None, pattern=None, grade=None,
                titre=None, method=None, box=None)
    return base | overrides


class FastLaboratoryTests(unittest.TestCase):
    def panel_scan(self, heading_y):
        lines = [line('Antigen',30,20), line('Intensity',250,20), line('Class',370,20),
                 line('Panel Viêm đa cơ tự miễn 16 Ag',30,heading_y),
                 line('PM-Scl100',30,70),line('7',250,70),
                 line('PM-Scl75',30,100),line('8',250,100),line('Jo-1',30,200)]
        return dict(plan=dict(size=[800,400]),lines=lines), dict(crop=[0,0,800,400])

    def test_continuation_rows_before_panel_heading_reject_fast_route(self):
        scan, plan = self.panel_scan(160)
        routing = {}
        self.assertIsNone(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'rows_before_panel_heading')
        scan['lines'] = [item for item in scan['lines'] if item['box'][1] not in (70,100)]
        scan['lines'].extend([line('Synthetic unknown analyte',30,70),line('Negative',250,70)])
        self.assertIsNone(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'rows_before_panel_heading')
        # Unknown analytes with aligned result cells also precede the panel.
        scan, plan = self.panel_scan(160)
        scan['lines'] = [item for item in scan['lines'] if item['text'] not in ('PM-Scl100','PM-Scl75')]
        self.assertIsNone(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'rows_before_panel_heading')

    def test_panel_heading_at_top_remains_eligible(self):
        scan, plan = self.panel_scan(40)
        routing = {}
        self.assertEqual(lab_crop_evidence(scan, plan, routing=routing)['panel'], 'myositis')
        self.assertEqual(routing['lab'], 'eligible')

    def test_route_preview_uses_same_panel_continuation_guard(self):
        from registry_review.privacy import PrivacyProposals
        preview = PrivacyProposals.__new__(PrivacyProposals)
        preview.workspace = None
        with patch('registry_review.privacy.configuration', return_value=dict(
                model='deepseek-v4.1-flash:free',fast_labs=True)):
            for heading_y, expected in ((160,'standard'), (40,'fast_labs')):
                scan, plan = self.panel_scan(heading_y)
                with patch('registry_review.privacy._read_scan', return_value=scan):
                    self.assertEqual(preview.route_preview(None, {**plan,'sha256':'synthetic'}),expected)

    def test_repeated_analytes_require_each_printed_row_and_keep_literal_results(self):
        plan = dict(crop=[0,0,800,400])
        lines = [line('Chỉ định',30,20),line('Kết quả',250,20),line('Đơn vị',370,20),
                 line('Urea',30,60),line('Urea',30,62),line('Urea',30,120)]
        scan = dict(plan=dict(size=[800,400]),lines=lines)
        evidence = lab_crop_evidence(scan,plan)
        self.assertEqual(evidence['repeated_slots'],{('REN04','result'):2})
        rows = [cell('Urea',value,code='REN04',number=value,op='=',unit='mmol/L') for value in ('4.2','4.6')]
        rows.append(cell('Other assay','Âm tính'))
        config = dict(model='synthetic',key='synthetic',result_rules=load_result_rules())
        with patch('ocr_pool.lab_api.request_json', return_value=(dict(rows=rows,notes=[]),{},'synthetic',{},'stop')):
            record = extract_lab_image(b'fake',DICTIONARY,config=config,evidence=evidence,image_size=[800,400])
        self.assertEqual(record['extraction']['rows'][-1]['qualitative_value'],'Âm tính')
        with patch('ocr_pool.lab_api.request_json', return_value=(dict(rows=rows[1:],notes=[]),{},'synthetic',{},'stop')):
            with self.assertRaisesRegex(InvalidAPIResponse,'coverage'):
                extract_lab_image(b'fake',DICTIONARY,config=config,evidence=evidence,image_size=[800,400])

    def test_cbc_continuation_preserves_repeated_result_occurrences(self):
        plan = dict(crop=[0,0,800,400])
        lines = [line('Chỉ định',30,20), line('Kết quả',250,20),
                 line('Đơn vị',370,20), line('Tham chiếu',490,20)]
        cells = [('Bạch cầu ưa axit-EO%','1.1','%'), ('Bạch cầu ưa axit-EO%','1.4','%'),
                 ('Bạch cầu ưa bazơ-BA%','0.6','%'), ('Bạch cầu ưa bazơ-BA%','0.6','%'),
                 ('Số lượng tiểu cầu-PLT','278','G/L'), ('Số lượng tiểu cầu-PLT','244','G/L')]
        for i, (label, value, unit) in enumerate(cells):
            y=55+25*i
            lines.extend([line(label,30,y),line(value,250,y),line(unit,370,y)])
        scan=dict(plan=dict(size=[800,400]),lines=lines)
        evidence=lab_crop_evidence(scan,plan)
        self.assertEqual(evidence['continuation_rows']['HEM10','percentage','0.6'],2)
        self.assertIsNone(lab_crop_evidence({**scan,'lines':lines+[line('Bệnh phẩm phân',30,270)]},plan))
        rows=[cell(label,value,number=value,unit=unit,op='=') for label,value,unit in cells]
        config=dict(model='synthetic',key='synthetic')
        for returned, accepted in [(rows,True),(rows[:2]+rows[3:],False),
                                   (rows+[rows[-1]],False),(rows[:-1]+[{**rows[-1],'unit':'g/L'}],False)]:
            with patch('ocr_pool.lab_api.request_json', return_value=(dict(rows=returned,notes=[]),{},'synthetic',{},'stop')):
                if accepted:
                    result=extract_lab_image(b'fake',DICTIONARY,config=config,evidence=evidence,image_size=[800,400])
                    self.assertEqual(len(result['extraction']['rows']),6)
                else:
                    with self.assertRaises(InvalidAPIResponse):
                        extract_lab_image(b'fake',DICTIONARY,config=config,evidence=evidence,image_size=[800,400])

    def test_reference_requires_matching_value_and_unit_on_exact_complement_row(self):
        lines = [line('Kết quả',250,20),line('Đơn vị',370,20),line('Tham chiếu',490,20),
                 line('C3',30,65),line('0,76',250,65),line('g/L',370,65),line('0,8 – 1,6',490,65),
                 line('C4',30,95),line('0.15',250,95),line('g/L',370,95),line('0.1 – 0.4',490,95)]
        scan = dict(plan=dict(size=[800,400]),lines=lines)
        plan = dict(crop=[0,0,800,400])
        rows = [dict(field_id='IMM11',component='result',numeric_value='0.76',unit_raw='g/L',comparator='='),
                dict(field_id='IMM12',component='result',numeric_value='0.15',unit_raw='mg/dL',comparator='=')]
        record = dict(extraction=dict(rows=rows),normalization_audit=[])
        attach_complement_ranges(record,scan,plan)
        self.assertEqual(rows[0]['reference_range_raw'],'0.8 – 1.6')
        self.assertNotIn('reference_range_raw',rows[1])
        self.assertEqual(len(record['normalization_audit']),1)

    def test_split_requires_blank_boundaries_around_fluorescence_row(self):
        lines = [line('Kết quả', 250, 20), line('Đơn vị', 370, 20), line('Tham chiếu', 490, 20),
                 line('Urea', 30, 50), line('Creatinine', 30, 75), line('ANA', 30, 110),
                 line('Homogeneous', 250, 110), line('Huỳnh quang', 30, 124), line('C3', 30, 165)]
        plan = dict(crop=[0, 0, 800, 400])
        scan = dict(plan=dict(size=[800, 400]), lines=lines)
        top, bottom, evidence = fluorescence_split(scan, plan)
        self.assertEqual((top, bottom), (107, 142))
        self.assertEqual(evidence['required_fields'], {'REN04', 'REN05', 'IMM11'})
        self.assertIsNone(fluorescence_split({**scan, 'lines': [*lines, line('Another row', 30, 138)]}, plan))

    def test_two_headers_require_aligned_distinct_numeric_rows(self):
        headings = [line('Xét nghiệm', 30, 20), line('Kết quả', 250, 20)]
        labels = [line('Urea', 30, 65), line('Creatinine', 30, 90), line('C3', 30, 115)]
        numbers = [line('1.25', 250, y) for y in (65, 90, 115)]
        plan = dict(crop=[0, 0, 800, 400])
        routing = {}
        scan = dict(plan=dict(size=[800, 400]), lines=headings + labels + numbers)
        self.assertTrue(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'eligible')
        self.assertIsNone(lab_crop_evidence({**scan, 'lines': scan['lines'][:-1]}, plan, routing=routing))
        self.assertEqual(routing['lab'], 'insufficient_table_headers_or_aligned_rows')

    def test_class_and_control_handling_depends_on_visible_context(self):
        patient = cell('Mi-2a','7',header='Intensity',code='MYO09',number='7',op='=',cls='o',class_header='Class')
        control = cell('Control (Co)','120',header='Intensity',number='120',op='=',cls='+++',class_header='Class')
        raw = dict(rows=[patient,control],notes=[])
        out, excluded, audit = _expand(raw, dict(panel='myositis',layout='panel'), {'MYO09'})
        self.assertEqual([row['class_raw'] for row in out['rows']], ['o'])
        self.assertEqual([row['label'] for row in excluded], ['Control (Co)'])
        self.assertFalse(audit)
        result = cell('Other assay','(++)',qualitative='(++)',cls='(++)')
        out, excluded, audit = _expand(dict(rows=[result],notes=[]),dict(panel=None,layout='lab'),set())
        self.assertEqual(out['rows'][0]['qualitative_value'],'(++)')
        self.assertIsNone(out['rows'][0]['class_raw'])
        self.assertEqual(audit[0]['reason'],'duplicate_literal_in_result_without_class_column')
        self.assertFalse(excluded)
        result['cls'] = 'o'
        with self.assertRaisesRegex(InvalidAPIResponse, 'without a Class column'):
            _expand(dict(rows=[result],notes=[]),dict(panel=None,layout='lab'),set())

    def test_routes_familiar_lab_and_preserves_standard_for_mixed_or_fluorescence(self):
        headings = [line('Kết quả',250,20),line('Đơn vị',370,20),line('Khoảng tham chiếu',490,20)]
        basic = [*headings,line('Urea',30,65),line('Creatinine',30,90)]
        plan = dict(crop=[0,0,800,400])
        scan = dict(plan=dict(size=[800,400]),lines=basic)
        result = lab_crop_evidence(scan,plan)
        self.assertEqual(result,dict(panel=None,required_fields={'REN04','REN05'},required_slots=set(),
                                     layout='lab',blood=False))
        for extra in ([line('ANA huỳnh quang',30,140)],
                      [line('ANA Profile 23',30,1),line('PCNA',30,140)],
                      [line('Upper SD',250,150),line('%Pre',380,150)]):
            with self.subTest(extra=extra):
                self.assertIsNone(lab_crop_evidence({**scan,'lines':[*basic,*extra]},plan))

    def test_cbc_alias_completes_distinct_count_and_percent_slots(self):
        rows = [cell('Số lượng bạch cầu trung tính-NE#','6.7',code='HEM06',number='6.7',op='=',unit='G/L'),
                cell('%Bạch cầu trung tính-NE%','62.9',number='62.9',op='=',unit='%'),
                cell('Nồng độ HGB trung bình hồng cầu-MCHC','318',number='318',op='=',unit='g/L')]
        evidence = dict(panel=None, layout='lab', blood=True)
        out, _, audit = _expand(dict(rows=rows,notes=[]),evidence,{'HEM04','HEM06','HEM07'})
        self.assertEqual([(r['field_id'],r['component']) for r in out['rows']],
                         [('HEM06','absolute_count'),('HEM06','percentage'),('HEM04','result')])
        self.assertEqual(audit[0]['reason'],'cbc_exact_local_alias_and_unit')
        rows[1]['code'] = 'HEM07'
        rows.append(cell('Lượng HGB trung bình hồng cầu-MCH','27.7',code='HEM04',number='27.7',op='=',unit='pg'))
        out, _, audit = _expand(dict(rows=rows,notes=[]),evidence,{'HEM04','HEM06','HEM07'})
        self.assertEqual(out['rows'][1]['field_id'],'HEM06')
        self.assertIsNone(out['rows'][-1]['field_id'])
        self.assertEqual(out['rows'][-1]['numeric_value'],'27.7')
        self.assertEqual(audit[-1]['reason'],'cbc_mapping_requires_exact_local_alias')

    def test_known_unit_mismatch_requires_the_standard_contract(self):
        row = cell('ESR','21',code='IMM20',number='21',op='=',unit='mm/lh')
        with self.assertRaisesRegex(InvalidAPIResponse,'outside the known field units'):
            _expand(dict(rows=[row],notes=[]),dict(panel=None,layout='lab'),{'IMM20'})

    def test_cbc_differential_tail_without_red_cells_is_blood(self):
        plan = dict(crop=[0, 0, 800, 400])
        lines = [line('Chỉ định', 30, 20), line('Kết quả', 250, 20),
                 line('Đơn vị', 370, 20), line('Tham chiếu', 490, 20)]
        rows = [('Số lượng bạch cầu-WBC', '6.7', 'G/L'),
                ('Số lượng bạch cầu-WBC', '6.8', 'G/L'),
                ('Số lượng bạch cầu trung tính-NE#', '4.8', 'G/L'),
                ('Số lượng bạch cầu lympho-LY#', '1.5', 'G/L'),
                ('%Bạch cầu trung tính-NE%', '62.9', '%'),
                ('%Bạch cầu lympho-LY%', '23.3', '%'),
                ('%Bạch cầu mono-MO%', '7.0', '%')]
        for i, (label, value, unit) in enumerate(rows):
            y = 55 + 25 * i
            lines.extend([line(label, 30, y), line(value, 250, y), line(unit, 370, y)])
        scan = dict(plan=dict(size=[800, 400]), lines=lines)
        routing = {}
        evidence = lab_crop_evidence(scan, plan, routing=routing)
        self.assertEqual(routing['lab'], 'eligible')
        self.assertTrue(evidence['blood'])
        self.assertIsNone(evidence['panel'])
        self.assertTrue({'HEM05', 'HEM06', 'HEM07', 'HEM08'} <= evidence['required_fields'])
        self.assertEqual(evidence['repeated_slots'], {('HEM05', 'result'): 2})
        self.assertIn(('HEM06', 'percentage'), evidence['required_slots'])
        self.assertIn(('HEM06', 'absolute_count'), evidence['required_slots'])

    def test_bare_cbc_markers_without_differential_or_red_cells_are_not_blood(self):
        plan = dict(crop=[0, 0, 800, 400])
        lines = [line('Chỉ định', 30, 20), line('Kết quả', 250, 20), line('Đơn vị', 370, 20)]
        for i, (label, value, unit) in enumerate([('RBC', '4.5', 'T/L'), ('WBC', '6.7', 'G/L'), ('PLT', '288', 'G/L')]):
            y = 55 + 25 * i
            lines.extend([line(label, 30, y), line(value, 250, y), line(unit, 370, y)])
        scan = dict(plan=dict(size=[800, 400]), lines=lines)
        routing = {}
        self.assertIsNone(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'insufficient_or_conflicting_analyte_labels')

    def test_single_differential_marker_is_insufficient_for_blood(self):
        plan = dict(crop=[0, 0, 800, 400])
        lines = [line('Chỉ định', 30, 20), line('Kết quả', 250, 20), line('Đơn vị', 370, 20)]
        for i, (label, value, unit) in enumerate([('%Bạch cầu trung tính-NE%', '62.9', '%'),
                                                  ('Số lượng tiểu cầu-PLT', '288', 'G/L'),
                                                  ('Số lượng bạch cầu-WBC', '6.7', 'G/L')]):
            y = 55 + 25 * i
            lines.extend([line(label, 30, y), line(value, 250, y), line(unit, 370, y)])
        scan = dict(plan=dict(size=[800, 400]), lines=lines)
        routing = {}
        self.assertIsNone(lab_crop_evidence(scan, plan, routing=routing))
        self.assertEqual(routing['lab'], 'insufficient_or_conflicting_analyte_labels')

    def test_red_cell_cbc_markers_still_recognize_blood(self):
        plan = dict(crop=[0, 0, 800, 400])
        lines = [line('Chỉ định', 30, 20), line('Kết quả', 250, 20), line('Đơn vị', 370, 20)]
        for i, (label, value, unit) in enumerate([('Số lượng hồng cầu-RBC', '4.5', 'T/L'),
                                                  ('Lượng huyết sắc tố-HGB', '142', 'g/L'),
                                                  ('Số lượng bạch cầu-WBC', '6.7', 'G/L')]):
            y = 55 + 25 * i
            lines.extend([line(label, 30, y), line(value, 250, y), line(unit, 370, y)])
        scan = dict(plan=dict(size=[800, 400]), lines=lines)
        evidence = lab_crop_evidence(scan, plan)
        self.assertTrue(evidence['blood'])
        self.assertTrue({'HEM01', 'HEM02', 'HEM05'} <= evidence['required_fields'])
