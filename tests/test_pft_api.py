"""Fast PFT routing, row preservation and coverage with synthetic data."""
from copy import deepcopy
import unittest

from ocr_pool.llm import InvalidAPIResponse
from ocr_pool.pft_api import _expand, pft_crop_evidence
from test_source_review import DICTIONARY


def line(text, x, y):
    return dict(text=text, box=[x,y,x+42,y+12], confidence=.99)


def scan(lines):
    return dict(plan=dict(crop_reason='detected_pft_table_header', size=[800,400]), lines=lines)


def measurement(label, pre, percent_pre=None, *, post=None, percent_post=None, unit='L'):
    return dict(label=label, unit=unit, pre=pre, percent_pre=percent_pre,
                post=post, percent_post=percent_post, box=None)


class FastPFTTests(unittest.TestCase):
    def test_crop_requires_pft_evidence_and_declines_other_table_headers(self):
        lines = [line('Upper SD',100,20), line('Pred.val.',160,20), line('%Pre',340,20),
                 line('FEV1(L)',30,60), line('82.7',340,60), line('MEF50(L/S)',30,85),
                 line('0',340,85), line('MEF50(L/S)',30,110)]
        plan = dict(crop=[0,0,800,400])
        evidence = pft_crop_evidence(scan(lines), plan)
        self.assertEqual(evidence, dict(minimum_rows=3, required_fields={'PFT03'},
                                        minimum_percent_counts={'pre':2}))
        self.assertIsNone(pft_crop_evidence(scan(lines), dict(crop=[0,35,800,400])))
        panel = [line('Antigen',10,200), line('Intensity',150,200), line('Class',300,200)]
        self.assertIsNone(pft_crop_evidence(scan([*lines,*panel]), plan))

    def test_pre_post_occurrences_and_hb_are_mapped_without_merging(self):
        extraction = dict(rows=[
            measurement('FEV1(L)', '2.48', '77.5', post='2.70', percent_post='84.3'),
            measurement('MEF50(L/S)', '3.84', '89.2', unit='L/s'),
            measurement('MEF50(L/S)', '3.94', '91.6', unit='L/s'),
            measurement('Kco(mL/mmHg/Mi)', '3.30', '81.5', unit='mL/mmHg/Mi'),
            measurement('Kco (Hb)(mL/mmHg/Mi)', '3.57', '88.1', unit='mL/mmHg/Mi'),
            measurement('RV(L)', None, post='1.30', percent_post='101.6'),
        ], notes=['synthetic note'])
        evidence = dict(minimum_rows=6, required_fields={'PFT03','PFT10','PFT07'},
                        minimum_percent_counts={'pre':5,'post':2})
        original = deepcopy(extraction)
        result, audit = _expand(extraction, DICTIONARY, evidence)
        rows = result['rows']
        self.assertEqual(extraction, original)
        self.assertEqual([r['field_id'] for r in rows], ['PFT03','PFT03',None,None,None,'PFT10','PFT07'])
        self.assertEqual([r['numeric_value'] for r in rows[2:4]], ['3.84','3.94'])
        self.assertEqual(rows[0]['pre_percent_predicted'], '77.5')
        self.assertEqual(rows[1]['post_percent_predicted'], '84.3')
        self.assertEqual(rows[-1]['post_percent_predicted'], '101.6')
        self.assertEqual(result['notes'], ['synthetic note'])
        self.assertEqual(len(audit), 4)
        extraction['rows'][2]['percent_pre'] = None
        with self.assertRaisesRegex(InvalidAPIResponse, 'missed percent'):
            _expand(extraction, DICTIONARY, evidence)
        extraction['rows'].pop()
        with self.assertRaisesRegex(InvalidAPIResponse, 'fewer rows'):
            _expand(extraction, DICTIONARY, evidence)
