"""Synthetic checks for the final local staff-text gate on outgoing images."""
import tempfile
import unittest
from pathlib import Path

from ocr_pool.outgoing_gate import check_outgoing, staff_text, visible_source_lines


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


if __name__ == '__main__':
    unittest.main()
