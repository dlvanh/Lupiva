import unittest

from ocr_pool.local_dates import _local_fact_values


def line(text, box):
    return dict(text=text, box=box)


class LocalSourceMetadataTests(unittest.TestCase):
    def test_reads_only_explicit_labeled_background_and_administrative_facts(self):
        scan = dict(plan=dict(size=[1000, 700]), lines=[
            line('PID:', [700, 30, 750, 55]), line('900000001', [790, 30, 900, 55]),
            line('Sex:', [700, 75, 750, 100]), line('M', [746, 75, 770, 100]),
            line('Age :', [700, 115, 760, 140]), line('38', [758, 115, 790, 140]),
            line('Height (cm) :', [700, 155, 850, 180]), line('172', [845, 155, 890, 180]),
            line('Weight (kg) :', [700, 195, 850, 220]), line('68', [845, 195, 885, 220]),
            line('Ngày sinh:', [100, 250, 220, 275]), line('12/03/1988', [240, 250, 360, 275]),
            line('Người chỉ định:', [100, 300, 280, 325]), line('BS A', [310, 300, 380, 325]),
            line('Tên người bệnh:', [100, 350, 300, 375]), line('Không được lấy', [320, 350, 500, 375]),
        ])
        found = {item['key']: item for item in _local_fact_values(scan)}
        self.assertEqual(found['pid']['value'], '900000001')
        self.assertEqual(found['sex']['value'], 'male')
        self.assertEqual(found['age']['value'], '38')
        self.assertEqual(found['height']['value'], '172')
        self.assertEqual(found['weight']['value'], '68')
        self.assertEqual(found['birth_date']['value'], '1988-03-12')
        self.assertEqual(found['ordering_provider']['value'], 'BS A')
        self.assertNotIn('patient_name', found)

