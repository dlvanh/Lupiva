"""Synthetic checks for the final local staff-text gate on outgoing images."""
import tempfile
import unittest
from pathlib import Path

from ocr_pool.outgoing_gate import check_outgoing, identifying_text, staff_text, visible_source_lines


def line(text, box):
    return dict(text=text, box=box, confidence=.95)


class OutgoingGateTests(unittest.TestCase):
    def test_staff_roles_titles_and_misread_roles_are_found(self):
        lines = [line('Ngròi nhận mẫu: CN. Tên Giả', [0, 0, 10, 10]),
                 line('Ths.BSNT Tên Giả Lập', [0, 0, 10, 10]),
                 line('7:28 Người duyệt: Tên Giả', [0, 0, 10, 10]),
                 line('CRP 4.81 mg/L', [0, 0, 10, 10]),
                 line('Ngày nhận mẫu: 07/09/2026', [0, 0, 10, 10]),
                 line('Basophil 0.6', [0, 0, 10, 10])]
        self.assertEqual(staff_text(lines), ['Ngròi nhận mẫu: CN. Tên Giả', 'Ths.BSNT Tên Giả Lập',
                                             '7:28 Người duyệt: Tên Giả'])

    def test_dates_identity_and_contacts_left_on_the_outgoing_image_are_found(self):
        lines = [line('16:01, Ngày 11 tháng 06 năm 2026', [0, 0, 10, 10]),
                 line('Ngày nhận mẫu: 07/09/2026', [0, 0, 10, 10]),
                 line('Họ tên: Tên Giả Lập', [0, 0, 10, 10]),
                 line('ĐT: 0901234567', [0, 0, 10, 10]),
                 line('Ferritin 11.0 - 306.8', [0, 0, 10, 10]),
                 line('Trang 1/2', [0, 0, 10, 10]),
                 line('Máu lắng 1/2 giờ 26 mm', [0, 0, 10, 10]),
                 line('A01_071_011221_V', [0, 0, 10, 10])]
        self.assertEqual(identifying_text(lines), [l['text'] for l in lines[:4]])

    def test_source_fallback_sees_edge_cut_lines_but_not_fully_masked_ones(self):
        privacy = dict(crop=[0, 100, 400, 400], masks=[[0, 300, 400, 340]])
        scan = dict(lines=[line('Người nhận mẫu: Tên Giả', [10, 90, 200, 110]),   # cut by top edge
                           line('Người lấy mẫu: Tên Giả', [10, 305, 200, 330]),    # fully masked
                           line('Người duyệt: Tên Giả', [10, 20, 200, 40])])       # outside crop
        self.assertEqual([l['text'] for l in visible_source_lines(scan, privacy)], ['Người nhận mẫu: Tên Giả'])
        with tempfile.TemporaryDirectory() as folder:
            method, hits = check_outgoing(b'', privacy, scan, Path(folder) / 'missing-models')
        self.assertEqual((method, hits), ('source_ocr', ['Người nhận mẫu: Tên Giả']))

    def test_unreadable_outgoing_check_blocks_instead_of_passing(self):
        with tempfile.TemporaryDirectory() as folder:
            method, hits = check_outgoing(b'not an image', dict(crop=[0, 0, 1, 1]), None, Path(folder))
        self.assertEqual(method, 'outgoing_ocr_failed')
        self.assertTrue(hits)


class OcrNumberCrossCheckTests(unittest.TestCase):
    def page(self, skew):
        labels = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot']
        values = ['3', '7', '1', '10', '2', '4']
        lines = []
        for k, (label, value) in enumerate(zip(labels, values)):
            y = 100 + 30*k
            lines.append(line(label, [20, y, 120, y+20]))
            lines.append(line(f'{value} Negative', [200, y-skew, 300, y+20-skew]))
        rows = [dict(source_label=label, numeric_value=value) for label, value in zip(labels, values)]
        return rows, dict(plan=dict(size=[400, 400]), lines=lines), dict(crop=[0, 0, 400, 400], masks=[])

    def test_disagreeing_number_is_reported_on_straight_and_slanted_pages(self):
        from ocr_pool.ocr_crosscheck import number_disagreements
        for skew in (0, 12):
            rows, scan, privacy = self.page(skew)
            self.assertEqual(number_disagreements(rows, scan, privacy), [], skew)
            rows[3]['numeric_value'] = '0'          # model dropped a digit
            self.assertEqual(number_disagreements(rows, scan, privacy), [3], skew)

    def test_values_shifted_by_a_slanted_photo_are_paired_by_row_order(self):
        from ocr_pool.ocr_crosscheck import number_disagreements
        # Each value sits half a row above its label; a model that pairs every
        # label with the value printed just below it is off by one row.
        rows, scan, privacy = self.page(15)
        shifted = [dict(row, numeric_value=rows[k+1]['numeric_value']) if k < 5 else row
                   for k, row in enumerate(rows)]
        self.assertEqual(number_disagreements(rows, scan, privacy), [])
        self.assertEqual(number_disagreements(shifted, scan, privacy), [0, 1, 2, 3, 4])
        # An unread value cell makes the column incomplete: no order-based claim.
        scan['lines'] = [l for l in scan['lines'] if l['text'] != '10 Negative']
        self.assertNotIn(0, number_disagreements(shifted, scan, privacy))

    def test_label_read_with_slightly_lower_confidence_is_still_checked(self):
        from ocr_pool.ocr_crosscheck import number_disagreements
        rows, scan, privacy = self.page(9)
        scan['lines'][10]['confidence'] = .85      # short code label, e.g. "cN-1A"
        rows[5]['numeric_value'] = '1'             # model took the next row's number
        self.assertEqual(number_disagreements(rows, scan, privacy), [5])
        scan['lines'][10]['confidence'] = .7
        self.assertEqual(number_disagreements(rows, scan, privacy), [])

    def test_bare_reference_limit_is_not_evidence_against_the_api_number(self):
        from ocr_pool.ocr_crosscheck import number_disagreements
        rows, scan, privacy = self.page(0)
        scan['lines'][7]['text'] = '<35'           # result cell unread, only the limit is left
        self.assertEqual(number_disagreements(rows, scan, privacy), [])
        rows[3]['numeric_value'] = '35'
        self.assertEqual(number_disagreements(rows, scan, privacy), [])

    def test_too_few_rows_are_not_judged(self):
        from ocr_pool.ocr_crosscheck import number_disagreements
        rows, scan, privacy = self.page(0)
        rows, scan['lines'] = rows[:2], scan['lines'][:4]
        rows[0]['numeric_value'] = '9'
        self.assertEqual(number_disagreements(rows, scan, privacy), [])


if __name__ == '__main__':
    unittest.main()
