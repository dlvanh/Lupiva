"""Automatic-review eligibility: synthetic tables only."""
import copy
import unittest

from ocr_pool.ocr_crosscheck import number_agreement
from registry_review.auto_review import assess_auto, mark_auto_review


def line(text, x0, y, x1, confidence=.99):
    return dict(text=text, box=[x0, y, x1, y + 20], confidence=confidence, words=[])


ROWS = [('Alpha test', '5.8', '2.8 - 7.2'), ('Bravo test', '84.3', '49 - 90'), ('Charlie test', '128.7', '11 - 306'),
        ('Delta test', '28.1', '< 35'), ('Echo test', '34.2', '< 35'), ('Foxtrot test', '1,184.5', '700 - 1,600')]


def page(header=True, rows=ROWS):
    lines = [line('KẾT QUẢ', 290, 50, 370), line('KHOẢNG THAM CHIẾU', 560, 50, 720)] if header else []
    for n, (label, value, limit) in enumerate(rows):
        y = 100 + 40 * n
        lines += [line(label, 20, y, 160), line(value, 300, y, 360), line(limit, 590, y, 690)]
    for n, item in enumerate(lines):
        item['line_id'] = n
    size = [800, 500]
    plan = dict(size=size, crop=[0, 0, *size], masks=[], crop_reason='detected_lab_table_header', review_items=[])
    return dict(lines=lines, plan=plan)


def api(rows=ROWS):
    return [dict(source_label=a, raw_result=b, numeric_value=b.replace(',', ''), comparator='=', component='result')
            for a, b, _ in rows]


PRIVACY = dict(crop=[0, 0, 800, 500], masks=[])


class AgreementTests(unittest.TestCase):
    def test_printed_result_column_agrees(self):
        self.assertEqual(number_agreement(api(), page(), PRIVACY), ['match'] * 6)

    def test_wrong_digit_decimal_and_neighbour_never_match(self):
        for value in ('34.3', '342', '28.1', '3.42'):
            rows = api()
            rows[4]['numeric_value'] = rows[4]['raw_result'] = value
            self.assertEqual(number_agreement(rows, page(), PRIVACY)[4], 'mismatch', value)

    def test_reference_limit_taken_as_result_is_not_a_match(self):
        rows = api()
        rows[4]['numeric_value'] = rows[4]['raw_result'] = '35'
        self.assertEqual(number_agreement(rows, page(), PRIVACY)[4], 'mismatch')

    def test_whole_wrong_column_is_not_a_match(self):
        rows = api()
        for row, (_, _, limit) in zip(rows, ROWS):
            row['numeric_value'] = row['raw_result'] = limit.replace(',', '').split()[-1]
        self.assertNotIn('match', number_agreement(rows, page(), PRIVACY))

    def test_no_header_no_scan_or_missing_label_is_unchecked(self):
        self.assertEqual(set(number_agreement(api(), page(header=False), PRIVACY)), {'unchecked'})
        self.assertEqual(number_agreement(api(), None, PRIVACY), ['unchecked'] * 6)
        rows = api()
        rows[0]['source_label'] = 'Zulu test'
        self.assertEqual(number_agreement(rows, page(), PRIVACY)[0], 'unchecked')

    def test_legend_header_below_the_table_is_ignored_but_two_above_are_not(self):
        scan = page()
        scan['lines'].append(dict(line('KẾT QUẢ', 290, 400, 370), line_id=99))
        self.assertEqual(number_agreement(api(), scan, PRIVACY), ['match'] * 6)
        scan['lines'][-1] = dict(line('KẾT QUẢ', 590, 50, 690), line_id=99)
        self.assertEqual(set(number_agreement(api(), scan, PRIVACY)), {'unchecked'})

    def test_repeated_row_label_is_unchecked(self):
        rows = ROWS[:5] + [('Alpha test', '61.1', '42 - 75')]
        result = number_agreement(api(rows), page(rows=rows), PRIVACY)
        self.assertEqual((result[0], result[5]), ('unchecked', 'unchecked'))

    def test_comparator_must_agree(self):
        rows = [('Alpha test', '<1.20', '< 7')] + ROWS[1:]
        calls = api(rows)
        calls[0].update(numeric_value='1.20', comparator='<')
        self.assertEqual(number_agreement(calls, page(rows=rows), PRIVACY)[0], 'match')
        calls[0]['comparator'] = '='
        self.assertEqual(number_agreement(calls, page(rows=rows), PRIVACY)[0], 'mismatch')

    def test_mixed_result_needs_its_words_too(self):
        rows = [('Alpha test', '8 Borderline', 'Negative')] + ROWS[1:]
        calls = api(rows)
        calls[0].update(numeric_value='8', qualitative_value='Borderline')
        self.assertEqual(number_agreement(calls, page(rows=rows), PRIVACY)[0], 'match')
        calls[0].update(raw_result='8 Negative', qualitative_value='Negative')
        self.assertEqual(number_agreement(calls, page(rows=rows), PRIVACY)[0], 'mismatch')

    def test_weak_ocr_value_is_unchecked(self):
        scan = page()
        next(item for item in scan['lines'] if item['text'] == '34.2')['confidence'] = .6
        self.assertEqual(number_agreement(api(), scan, PRIVACY)[4], 'unchecked')


def candidate(**changes):
    value = dict(result_type='numeric', numeric_value='5.8', comparator='=', unit_raw='mmol/L',
                 extraction_method='gemini_api', flags=['gemini_api_extraction', 'ocr_number_matches'])
    return dict(dict(kind='observation', selection_id='s1', field_id='REN04', component='result', value=value,
                     current_revision=True, review_status='pending', pending_correction=None,
                     confidence=dict(tier='unverified', blockers=[], reasons=[])), **changes)


class EligibilityTests(unittest.TestCase):
    def test_matching_plain_number_is_eligible(self):
        self.assertEqual(assess_auto(candidate()), dict(eligible=True, reasons=[]))

    def test_each_missing_condition_needs_a_person(self):
        cases = dict(
            no_match=candidate(), flag=candidate(), unit=candidate(), local=candidate(), qualitative=candidate(),
            pft=candidate(field_id='PFT01'), component=candidate(component='method'),
            tier=candidate(confidence=dict(tier='medium', blockers=[], reasons=[])),
            block=candidate(confidence=dict(tier='unverified', blockers=['x'], reasons=[])),
            status=candidate(review_status='conflict'), correction=candidate(pending_correction={'a': 1}),
            metadata=candidate(kind='metadata'))
        cases['no_match']['value']['flags'] = ['gemini_api_extraction']
        cases['flag']['value']['flags'].append('catalog_alias_mapped')
        cases['unit']['value']['unit_raw'] = None
        cases['local']['value']['extraction_method'] = 'local_ocr'
        cases['qualitative']['value']['result_type'] = 'qualitative'
        for name, item in cases.items():
            result = assess_auto(item)
            self.assertFalse(result['eligible'], name)
            self.assertTrue(result['reasons'], name)

    def test_repeated_slot_is_never_eligible(self):
        first, second = candidate(), candidate(selection_id='s2')
        second['value']['numeric_value'] = '9.1'
        mark_auto_review([first, second])
        self.assertFalse(first['auto_review']['eligible'] or second['auto_review']['eligible'])
        lone = candidate()
        mark_auto_review([lone])
        self.assertTrue(lone['auto_review']['eligible'])

    def test_marking_never_changes_review_state(self):
        item = candidate()
        before = copy.deepcopy(item)
        mark_auto_review([item])
        item.pop('auto_review')
        self.assertEqual(item, before)


if __name__ == '__main__':
    unittest.main()
