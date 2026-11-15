"""Only hand-made OCR and drawn, nonpatient pages; no OCR models/network."""
from contextlib import redirect_stdout
from datetime import date, timedelta
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from scripts import synthesize_pages as synth


def line(i, text, box, confidence=.98):
    return dict(line_id=i, text=text, box=box, confidence=confidence)


def drawn(lines, size=(950, 650)):
    image = Image.new('RGB', size, (246, 244, 238))
    draw = ImageDraw.Draw(image); font = ImageFont.load_default(size=18)
    for row in lines:
        draw.text(tuple(row['box'][:2]), row['text'], font=font, fill=(25, 30, 36))
    return image


def lab_lines():
    return [line(0, 'CHỈ ĐỊNH', [25, 180, 225, 204]),
        line(1, 'KẾT QUẢ', [325, 180, 440, 204]),
        line(2, 'ĐƠN VỊ', [480, 180, 570, 204]),
        line(3, 'KHOẢNG THAM CHIẾU', [625, 180, 900, 204]),
        line(4, 'C3', [25, 230, 180, 252]),
        line(5, '1.29', [335, 230, 415, 252]),
        line(6, 'g/L', [485, 230, 550, 252]),
        line(7, '0.90 - 1.80', [635, 230, 870, 252]),
        line(8, 'WBC', [25, 275, 180, 297]),
        line(9, '7,124', [335, 275, 415, 297]),
        line(10, 'G/L', [485, 275, 550, 297]),
        line(11, '4.0 - 10.0', [635, 275, 870, 297]),
        line(12, 'AST', [25, 320, 180, 342]),
        line(13, '< 29.3', [335, 320, 415, 342]),
        line(14, 'U/L', [485, 320, 550, 342]),
        line(15, '< 40', [635, 320, 870, 342]),
        line(16, 'Unmapped analyte', [25, 365, 225, 387]),
        line(17, '12.73', [335, 365, 415, 387]),
        line(18, 'mg/L', [485, 365, 550, 387]),
        line(19, '10 - 20', [635, 365, 870, 387])]


def panel_lines(merged=False):
    result = [line(0, 'Myositis 16 Ag', [30, 90, 290, 114]),
        line(1, 'Antigen', [30, 160, 230, 184]),
        line(2, 'Intensity', [335, 160, 440, 184]),
        line(3, 'Class', [530, 160, 670, 184])]
    for i, label in enumerate(('Ro-52', 'Ku', 'Jo-1', 'NXP2')):
        y = 215+50*i
        result.extend((line(10+3*i, label, [30, y, 230, y+23]),
            line(11+3*i, '3 Negative' if merged else '3', [340, y, 455, y+23]),
            line(12+3*i, 'Negative' if merged else 'o', [535, y, 690, y+23])))
    return result


class SynthesisTests(unittest.TestCase):
    def setUp(self):
        self.case = synth.make_case(Path.cwd()/'invented-case', 17, 0)

    def render(self, lines, plan=None, case=None, analyze=None, k=0):
        plan = plan or dict(masks=[])
        return synth.synthesize_page(drawn(lines), plan, lines, case or self.case,
            source_sha256='0'*64, seed=17, k=k, font=None, font_bold=None, analyze=analyze)

    def test_identity_label_kept_value_replaced(self):
        rows = [line(0, 'Họ tên: ORIGINAL PERSON', [25, 30, 470, 62]),
                line(1, 'PID: 87654321', [25, 80, 300, 110]),
                line(2, 'Giới tính: Nữ', [25, 125, 300, 150])]
        plan = dict(masks=[dict(box=r['box'], reasons=['identity_label'], line_id=r['line_id']) for r in rows])
        image, key = self.render(rows, plan)
        name = next(r for r in key['replaced'] if r['kind'] == 'name')
        self.assertEqual(name['value_text'], 'Họ tên: '+self.case['patient']['name'])
        pid = next(r for r in key['replaced'] if r['kind'] == 'record')
        self.assertRegex(pid['value_text'], r'^PID: \d{8}$')
        self.assertNotIn('87654321', pid['value_text'])
        self.assertFalse(np.array_equal(np.asarray(image.crop(rows[0]['box'])),
                                        np.asarray(drawn(rows).crop(rows[0]['box']))))
        self.assertEqual(key['self_check']['mask_regions_uncovered'], 0)

    def test_split_label_and_value_and_partial_mask(self):
        rows = [line(0, 'Họ tên:', [20, 25, 130, 50]),
                line(1, 'ORIGINAL PERSON', [150, 25, 480, 50])]
        plan = dict(masks=[dict(box=[170, 25, 220, 50], reasons=['identity_value'], line_id=1)])
        _, key = self.render(rows, plan)
        name = next(r for r in key['replaced'] if r['kind'] == 'name')
        self.assertEqual(name['value_text'], self.case['patient']['name'])
        self.assertEqual(name['box'], rows[1]['box'])

    def test_whole_page_handles_identity_and_staff_resolved_only_by_crop(self):
        rows = [line(0, 'Họ tên: SOURCE PERSON', [20, 25, 500, 55]),
                line(1, 'SOURCE STAFF', [350, 520, 750, 550])]
        plan = dict(masks=[], crop=[0, 150, 950, 450],
                    resolved_by_crop=[dict(code='staff_name_needs_review', box=rows[1]['box'], line_ids=[1])])
        _, key = self.render(rows, plan)
        self.assertEqual({entry['kind'] for entry in key['replaced']}, {'name', 'staff'})
        self.assertNotIn('SOURCE', json.dumps(key))
        self.assertTrue(key['needs_visual_check'])

    def test_dates_preserve_formats_and_time_changes(self):
        days = self.case['date_shift_days']
        expected = date(2026, 6, 11)+timedelta(days=days)
        for text, result in [('11/06/2026', expected.strftime('%d/%m/%Y')),
            ('11-06-26', expected.strftime('%d-%m-%y')),
            ('Ngày 11 tháng 06 năm 2026', f'Ngày {expected.day:02} tháng {expected.month:02} năm {expected.year}'),
            ('2026-06-11', expected.isoformat())]:
            with self.subTest(text=text):
                self.assertEqual(synth.shift_dates(text, days), result)
                rows = [line(0, text, [20, 25, 600, 55])]
                _, key = self.render(rows)
                value = next(r['value_text'] for r in key['replaced'] if r['kind'] == 'date')
                self.assertEqual(value, result)
                self.assertNotEqual(value, text)
        self.assertEqual(synth.shift_dates('Ngày: 11/06/2026 23:59', 1, minutes=2),
                         'Ngày: 12/06/2026 00:01')
        self.assertEqual(synth.shift_dates('Ngày 29 tháng 02 năm 2024', 1), 'Ngày 01 tháng 03 năm 2024')

    def test_dob_uses_one_fake_birthday_and_staff_titles(self):
        rows = [line(0, 'Ngày sinh: 21/05/1980', [20, 20, 470, 50]),
                line(1, 'DOB: 21-05-80', [20, 75, 470, 105]),
                line(2, 'Bác sĩ: ORIGINAL DOCTOR', [20, 125, 620, 155])]
        plan = dict(masks=[dict(box=r['box'], reasons=['identity_label']) for r in rows])
        _, key = self.render(rows, plan)
        birthday = date.fromisoformat(key['patient']['dob'])
        dates = [r['value_text'] for r in key['replaced'] if r['kind'] == 'dob']
        self.assertEqual(dates, ['Ngày sinh: '+birthday.strftime('%d/%m/%Y'),
                                 'DOB: '+birthday.strftime('%d-%m-%y')])
        staff = next(r['value_text'] for r in key['replaced'] if r['kind'] == 'staff')
        self.assertRegex(staff, r'Bác sĩ: (?:BS\.|ThS.BS\.|CN\.|KTV\.|CKI\.) ')

    def test_phone_and_ten_digit_pid_agree_with_patient_key(self):
        rows = [line(0, 'Phone: +84 987 123 456', [20, 25, 650, 55]),
                line(1, 'PID: 8765432190', [20, 85, 650, 115])]
        plan = dict(masks=[dict(box=r['box'], reasons=['identity_label']) for r in rows])
        _, key = self.render(rows, plan)
        phone = next(r['value_text'] for r in key['replaced'] if r['kind'] == 'phone')
        pid = next(r['value_text'] for r in key['replaced'] if r['kind'] == 'record')
        self.assertEqual(phone, 'Phone: '+key['patient']['phone'])
        self.assertRegex(phone, r'^Phone: 09\d{8}$')
        self.assertEqual(pid, 'PID: '+key['patient']['pid'])

    def test_lab_field_mapping_column_geometry_and_formats(self):
        rows = lab_lines(); _, key = self.render(rows)
        self.assertEqual([v['field_id'] for v in key['values']], ['IMM11', 'HEM05', 'GI01', None])
        self.assertEqual([v['value_box'] for v in key['values']], [rows[i]['box'] for i in (5, 9, 13, 17)])
        for value, source_index, pattern in zip(key['values'], (5, 9, 13, 17),
                (r'^\d+\.\d{2}$', r'^\d+,\d{3}$', r'^< \d+\.\d$', r'^\d+\.\d{2}$')):
            self.assertRegex(value['value_text'], pattern)
            self.assertNotEqual(value['value_text'], rows[source_index]['text'])
            self.assertEqual(value['component'], 'result')
        self.assertEqual(key['values'][0]['unit'], 'g/L')
        self.assertEqual(key['values'][0]['reference'], '0.90 - 1.80')
        self.assertEqual(len(key['unresolved_rows']), 1)
        self.assertNotIn('Unmapped analyte', json.dumps(key))

    def test_missing_result_heading_falls_back_between_test_and_unit(self):
        rows = [r for r in lab_lines() if r['line_id'] != 1]
        _, key = self.render(rows)
        self.assertEqual(len(key['values']), 4)
        self.assertTrue(all(225 < v['value_box'][0] < 480 for v in key['values']))

    def test_profiles_convert_units_and_share_differentials(self):
        self.assertAlmostEqual(synth.scaled_profile('IMM11', 'mg/dL', self.case), self.case['profile']['IMM11']*100)
        self.assertAlmostEqual(synth.scaled_profile('HEM02', 'g/dL', self.case), self.case['profile']['HEM02']/10)
        self.assertAlmostEqual(sum(self.case['profile'][f'HEM{i:02}'] for i in range(6, 11)), self.case['profile']['HEM05'])
        self.assertAlmostEqual(sum(synth.scaled_profile(f'HEM{i:02}', '%', self.case) for i in range(6, 11)), 100)

    def test_pft_columns_resolve_and_replace_measured_predicted_and_percent(self):
        rows = [line(0, 'Parameter', [20, 100, 170, 125]),
                line(1, 'Pred.val.', [250, 100, 340, 125]),
                line(2, 'Pre', [400, 100, 470, 125]),
                line(3, '%Pre', [550, 100, 640, 125]),
                line(4, 'FEV1(L)', [20, 170, 190, 195]),
                line(5, '3.97', [260, 170, 330, 195]),
                line(6, '2.31', [410, 170, 480, 195]),
                line(7, '58.2', [560, 170, 630, 195])]
        _, key = self.render(rows)
        self.assertEqual(len(key['values']), 3)
        self.assertEqual([v['field_id'] for v in key['values']], ['PFT03']*3)
        self.assertEqual([v['column'] for v in key['values']], ['predicted', 'pre', 'percent_pre'])
        self.assertAlmostEqual(float(key['values'][2]['value_text']),
            float(key['values'][1]['value_text'])/float(key['values'][0]['value_text'])*100, delta=.6)

    def test_panel_mapping_and_intensity_class_consistency(self):
        for merged in (False, True):
            with self.subTest(merged=merged):
                _, key = self.render(panel_lines(merged))
                self.assertEqual([v['field_id'] for v in key['values'][::2]], ['MYO14', 'MYO06', 'MYO09', None])
                for intensity, cls in zip(key['values'][::2], key['values'][1::2]):
                    n = int(intensity['value_text'].split()[0])
                    self.assertEqual(cls['component'], 'class')
                    self.assertEqual(cls['value_text'], synth.panel_class(n, 'Negative' if merged else 'o'))
                    if merged:
                        self.assertTrue(intensity['value_text'].endswith(cls['value_text']))
        for n, expected in [(0, 'o'), (5, 'o'), (6, '(+)'), (10, '(+)'),
                            (11, '+'), (25, '+'), (26, '++'), (50, '++'), (51, '+++')]:
            self.assertEqual(synth.panel_class(n, 'o'), expected)

    def test_mask_pixel_erasure_covers_unknown_low_confidence_and_no_lines(self):
        rows = [line(0, 'SECRET HANDWRITING', [50, 50, 400, 85], .3),
                line(1, 'SECRET UNKNOWN', [50, 130, 400, 165])]
        source = drawn(rows)
        # Fill regions with saturated ink: not one source pixel can survive.
        for box in (rows[0]['box'], rows[1]['box'], [500, 50, 700, 150]):
            ImageDraw.Draw(source).rectangle(box, fill=(180, 0, 210))
        plan = dict(masks=[dict(box=r['box'], reasons=['above_table_header']) for r in rows]+
                          [dict(box=[500, 50, 700, 150], reasons=['unknown'])])
        image, key = synth.synthesize_page(source, plan, rows, self.case,
            source_sha256='1'*64, font=None)
        for mask in plan['masks']:
            box = mask['box']
            self.assertTrue(np.all(np.any(np.asarray(image.crop(box)) != np.asarray(source.crop(box)), axis=2)))
            self.assertTrue(np.asarray(image.crop(box)).mean() > 200)
        self.assertEqual(key['self_check']['mask_regions_uncovered'], 0)
        self.assertFalse(key['replaced'])
        self.assertNotIn('SECRET', json.dumps(key))

    def test_polygon_mask_and_transitive_line_extensions_are_erased(self):
        rows = [line(0, 'UNKNOWN ALPHA', [30, 40, 240, 70]),
                line(1, 'UNKNOWN BETA', [225, 45, 460, 75])]
        plan = dict(masks=[dict(box=[35, 40, 80, 65], polygon=[[35, 40], [100, 40], [100, 72], [35, 72]],
                                reasons=['unknown'])])
        _, key = self.render(rows, plan)
        boxes = [r['box'] for r in key['painted']]
        self.assertIn(rows[0]['box'], boxes)
        self.assertIn(rows[1]['box'], boxes)
        self.assertIn([35, 40, 100, 72], boxes)
        self.assertEqual(key['self_check']['mask_regions_uncovered'], 0)

    def test_ana_titer_is_not_mistaken_for_a_clock_time(self):
        rows = lab_lines()[:4]+[line(4, 'ANA', [25, 230, 180, 252]),
                                line(5, '1:40', [335, 230, 415, 252])]
        _, key = self.render(rows)
        self.assertEqual(len(key['values']), 1)
        self.assertEqual(key['values'][0]['field_id'], 'IMM01')
        self.assertRegex(key['values'][0]['value_text'], r'^1:\d+$')
        self.assertNotEqual(key['values'][0]['value_text'], '1:40')

    def test_unreadable_result_is_painted_and_marked_unresolved(self):
        rows = lab_lines()[:8]
        rows[5] = {**rows[5], 'text': 'UNREADABLE RESULT SECRET', 'confidence': .3}
        image, key = self.render(rows)
        self.assertFalse(key['values'])
        self.assertEqual(len(key['unresolved_rows']), 1)
        self.assertTrue(key['needs_visual_check'])
        self.assertIn('unrecognized_result', [entry['reason'] for entry in key['painted']])
        self.assertNotIn('SECRET', json.dumps(key))
        self.assertGreater(np.asarray(image.crop(rows[5]['box'])).mean(), 200)

    def test_invalid_mask_is_counted_in_self_check(self):
        _, key = self.render([], dict(masks=[dict(box=[1000, 1000, 1100, 1100], reasons=['unknown'])]))
        self.assertEqual(key['self_check']['mask_regions_uncovered'], 1)
        self.assertTrue(key['needs_visual_check'])

    def test_signatures_and_barcodes_are_synthetic(self):
        rows = [line(0, 'SECRET SIGNER', [30, 30, 300, 100], .2)]
        plan = dict(masks=[dict(box=[20, 20, 350, 160], reasons=['staff_signature_footer']),
                          dict(box=[500, 30, 800, 120], reasons=['decoded_barcode_or_qr'])])
        image, key = self.render(rows, plan)
        # Signature blocks are painted out (no drawn scribble); barcodes are redrawn.
        self.assertEqual({r['kind'] for r in key['replaced']}, {'barcode'})
        pixels = np.asarray(image)
        self.assertEqual(np.count_nonzero((pixels[:, :, 2] > pixels[:, :, 0]+20) & (pixels[:, :, 0] < 100)), 0)
        self.assertTrue(any(r['reason'] == 'privacy_background' and r['box'] == [20, 20, 350, 160]
                            for r in key['painted']))
        self.assertNotIn('SECRET', json.dumps(key))

    def test_answer_key_excludes_source_text_and_values(self):
        rows = lab_lines()+[line(100, 'Họ tên: UNIQUE SECRET PERSON', [25, 30, 720, 65])]
        plan = dict(masks=[dict(box=rows[-1]['box'], reasons=['identity_label'],
                                raw='DO NOT SERIALIZE PLAN', arbitrary_secret='ANOTHER SECRET')])
        _, key = self.render(rows, plan)
        serialized = json.dumps(key, ensure_ascii=False)
        for forbidden in ('UNIQUE SECRET PERSON', 'DO NOT SERIALIZE PLAN', 'ANOTHER SECRET',
                          'Unmapped analyte', '1.29', '7,124', '12.73', '< 29.3'):
            self.assertNotIn(forbidden, serialized)
        self.assertEqual(set(key), {'source_sha256', 'seed', 'k', 'patient', 'date_shift_days', 'values',
            'replaced', 'painted', 'unresolved_rows', 'self_check', 'needs_visual_check'})

    def test_same_seed_identical_pixels_key_and_distinct_variants(self):
        rows = lab_lines(); first, key = self.render(rows); second, key2 = self.render(rows)
        self.assertEqual(first.tobytes(), second.tobytes())
        self.assertEqual(key, key2)
        different = synth.make_case(Path.cwd()/'invented-case', 17, 1)
        third, key3 = self.render(rows, case=different, k=1)
        self.assertNotEqual(key['patient'], key3['patient'])
        self.assertNotEqual(first.tobytes(), third.tobytes())
        self.assertNotEqual(key['seed'], key3['seed'])

    def test_readback_matching_requires_same_location_and_reports_counts_only(self):
        rows = lab_lines()[:-4]
        _, expected = self.render(rows)
        def readback(image, models):
            return {}, [line(i, v['value_text'], v['value_box']) for i, v in enumerate(expected['values'])]
        _, key = self.render(rows, analyze=readback)
        self.assertEqual(key['self_check']['values_read_back'], 3)
        self.assertFalse(key['needs_visual_check'])
        def wrong_place(image, models):
            return {}, [line(i, v['value_text'], [5, 500+i*30, 150, 525+i*30]) for i, v in enumerate(expected['values'])]
        _, key = self.render(rows, analyze=wrong_place)
        self.assertEqual(key['self_check']['values_read_back'], 0)
        self.assertTrue(key['needs_visual_check'])

    def test_readback_exception_and_output_are_never_logged(self):
        def broken(image, models):
            print('OCR SECRET NAME')
            raise RuntimeError('OCR SECRET NAME')
        output = io.StringIO()
        with redirect_stdout(output):
            _, key = self.render(lab_lines(), analyze=broken)
        self.assertEqual(output.getvalue(), '')
        self.assertNotIn('OCR SECRET NAME', json.dumps(key))
        self.assertEqual(key['self_check']['ocr_errors'], 1)

    def test_readback_eighty_percent_threshold(self):
        values = [dict(value_text=str(i+10), value_box=[20, 30*i+20, 100, 30*i+40]) for i in range(5)]
        for count, needs_check in ((4, False), (3, True)):
            def readback(image, models):
                return {}, [line(i, value['value_text'], value['value_box']) for i, value in enumerate(values[:count])]
            key = dict(values=values, unresolved_rows=[], _uncovered=0, _unsupported=False)
            synth.check_page(None, key, readback, None)
            self.assertEqual(key['self_check']['values_read_back'], count)
            self.assertEqual(key['needs_visual_check'], needs_check)

    def test_unparseable_context_cannot_copy_identity_into_answer_key(self):
        self.assertEqual(synth.safe_context('SECRET/person', 'unit'), '')
        self.assertEqual(synth.safe_context('PID: 12345678', 'reference'), '')
        self.assertEqual(synth.safe_context('Reference SECRET PERSON', 'reference'), '')

    def test_known_profile_collision_avoidance_is_folder_wide(self):
        rows = list(synth.table_rows(lab_lines()[:8]))
        value = f'{self.case["profile"]["IMM11"]:.2f}'
        rows[0]['value'] = {**rows[0]['value'], 'text': value}
        case = synth.make_case(Path.cwd()/'invented-case', 17, 0, source_rows=rows)
        first = synth.new_value(rows[0], case, synth.random.Random(1))
        other = {**rows[0], 'value': {**rows[0]['value'], 'text': '2.00'}}
        second = synth.new_value(other, case, synth.random.Random(2))
        self.assertEqual(first, second)
        self.assertNotEqual(first, value)

    def test_folder_consistency_original_analyzed_once_and_output_reproducible(self):
        # The temporary directory is explicitly inside the current workspace.
        with tempfile.TemporaryDirectory(dir=Path.cwd(), prefix='synth-test-') as temporary:
            root = Path(temporary); folder = root/'case'; folder.mkdir()
            source = drawn(lab_lines()[:-4]); calls = []
            for stem in ('page-one', 'page-two'):
                source.save(folder/(stem+'.png'))
            def analyze(image, models):
                calls.append(hashlib.sha256(image.tobytes()).hexdigest())
                return dict(masks=[]), lab_lines()[:-4]
            output = io.StringIO()
            with redirect_stdout(output):
                first, errors = synth.run([folder], None, root/'out', analyze=analyze,
                    seed=29, variants=2, font=None, font_bold=None)
            self.assertEqual(errors, 0)
            self.assertEqual(len(calls), 6)  # two sources + four synthetic self-checks
            self.assertEqual(len(output.getvalue().splitlines()), 2)
            for k in range(2):
                keys = [key for key in first if key['k'] == k]
                self.assertEqual(keys[0]['patient'], keys[1]['patient'])
                self.assertEqual(keys[0]['date_shift_days'], keys[1]['date_shift_days'])
                self.assertEqual(keys[0]['values'], keys[1]['values'])
                target = root/'out'/f'case-k{k}'
                self.assertTrue((target/'page-one.png').is_file())
                self.assertEqual(json.loads((target/'page-one.json').read_text(encoding='utf-8')), keys[0])
            self.assertNotEqual(first[0]['patient'], first[1]['patient'])
            before = {p.relative_to(root/'out'): p.read_bytes() for p in (root/'out').rglob('*') if p.is_file()}
            with redirect_stdout(io.StringIO()):
                synth.run([folder], None, root/'out', analyze=analyze, seed=29, variants=2, font=None, font_bold=None)
            after = {p.relative_to(root/'out'): p.read_bytes() for p in (root/'out').rglob('*') if p.is_file()}
            self.assertEqual(before, after)

    def test_failures_generic_and_cli_blocks_sockets(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd(), prefix='synth-test-') as temporary:
            root = Path(temporary); source = root/'source.png'; drawn([]).save(source)
            def broken(image, models):
                raise RuntimeError('PRIVATE OCR CONTENT')
            with patch.object(synth.socket.socket, 'connect'), patch.object(synth.socket.socket, 'connect_ex'), \
                 patch.object(synth.socket, 'create_connection'), patch.object(synth.socket.socket, 'sendto'):
                output = io.StringIO()
                with redirect_stdout(output):
                    status = synth.main(['--models', str(root), '--out', str(root/'out'), str(source)], analyze=broken)
                self.assertEqual(status, 1)
                self.assertNotIn('PRIVATE', output.getvalue())
                self.assertNotIn('PRIVATE', (root/'out'/'summary.md').read_text())
                with self.assertRaises(RuntimeError):
                    synth.socket.create_connection(('example.invalid', 80))


if __name__ == '__main__':
    unittest.main()
