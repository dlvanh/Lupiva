"""Crop replay of the regression gate: synthetic plans and rows, no images, OCR or API."""
import importlib.util
from pathlib import Path
import unittest

from registry_review.privacy import automatic_plan, proposal_summary

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('regression_check', ROOT / 'scripts/regression_check.py')
rc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rc)

SENT = dict(sha256='a' * 64, automatic=True, reviewed=True, crop=[0, 100, 1000, 900],
            masks=[[0, 90, 400, 130]], mask_polygons=[], proposal_id='privacy-x')


def line(text, top, bottom, left=500, right=600):
    # Saved local OCR lines are in original image coordinates.
    return dict(text=text, box=[left, top, right, bottom], confidence=.9)


class PlanKeyTests(unittest.TestCase):
    def test_key_ignores_mask_order_and_bookkeeping(self):
        other = {**SENT, 'masks': list(reversed(SENT['masks'])), 'proposal_id': 'privacy-y'}
        self.assertEqual(rc.plan_key(SENT), rc.plan_key(other))
        self.assertNotEqual(rc.plan_key(SENT), rc.plan_key({**SENT, 'crop': [0, 101, 1000, 900]}))
        self.assertEqual(rc.plan_key(None), 'manual')
        self.assertEqual(rc.plan_key(dict(skip=True)), 'skip')


class VisibilityTests(unittest.TestCase):
    LINES = [line('Ho ten: synthetic', 50, 70), line('Masked staff', 100, 120, 100, 300),
             line('Glucose 5.4', 480, 500), line('Footer 12/34', 880, 895), line('Below', 950, 970)]

    def test_unchanged_plan_changes_nothing(self):
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, SENT), ([], []))

    def test_text_hidden_by_crop_or_mask_and_now_sent_is_reported(self):
        lower = {**SENT, 'crop': [0, 40, 1000, 900]}
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, lower)[0], [[500, 50, 600, 70]])
        unmasked = {**SENT, 'masks': []}
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, unmasked)[0], [[100, 100, 300, 120]])

    def test_polygon_masks_hide_text(self):
        polygon = {**SENT, 'crop': [0, 40, 1000, 900], 'mask_polygons': [[[450, 40], [650, 40], [650, 80], [450, 80]]]}
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, polygon)[0], [])

    def test_numbers_cut_or_masked_by_the_new_plan_are_reported(self):
        shorter = {**SENT, 'crop': [0, 100, 1000, 850]}
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, shorter)[1], ['Footer 12/34'])
        masked = {**SENT, 'masks': SENT['masks'] + [[0, 470, 1000, 510]]}
        self.assertEqual(rc.visibility_changes(self.LINES, SENT, masked)[1], ['Glucose 5.4'])

    def test_hidden_text_without_digits_is_not_a_lost_number(self):
        lines = [line('Comment only', 880, 895)]
        self.assertEqual(rc.visibility_changes(lines, SENT, {**SENT, 'crop': [0, 100, 1000, 850]}), ([], []))


class FindingTests(unittest.TestCase):
    def image(self, sent, new, **extra):
        return dict(image=1, document_id='doc-1', sent=sent, new=new, crop_reason='detected_lab_table_header',
                    review_count=0, **extra)

    def test_unchanged_plan_passes(self):
        key = rc.plan_key(SENT)
        self.assertEqual(rc.crop_findings([self.image(key, key)], {}), [])

    def test_every_kind_of_change_fails(self):
        key = rc.plan_key(SENT)
        cases = [(key, 'manual', 'no longer sent automatically'), ('manual', key, 'now sent without review'),
                 (key, 'skip', 'now kept local as a chart'), (key, 'auto:other', 'crop or masks changed')]
        for sent, new, text in cases:
            with self.subTest(text=text):
                findings = rc.crop_findings([self.image(sent, new)], {})
                self.assertEqual(len(findings), 1)
                self.assertIn(text, findings[0])

    def test_accepted_plan_overrides_the_sent_plan(self):
        key = rc.plan_key(SENT)
        self.assertEqual(rc.crop_findings([self.image(key, 'auto:new')], {'doc-1': 'auto:new'}), [])
        self.assertEqual(len(rc.crop_findings([self.image(key, key)], {'doc-1': 'auto:new'})), 1)

    def test_details_name_shown_text_and_hidden_numbers(self):
        image = self.image(rc.plan_key(SENT), 'auto:new', crop=[[0, 100, 1000, 900], [0, 50, 1000, 850]],
                           newly_shown=[[0, 90, 400, 130]], newly_hidden=['Footer 12/34'])
        finding = rc.crop_findings([image], {})[0]
        self.assertIn('1 OCR line(s) hidden before now sent', finding)
        self.assertIn("1 number line(s) sent before now cut or masked ['Footer 12/34']", finding)

    def test_missing_saved_ocr_fails(self):
        image = dict(image=2, document_id='doc-2', sent='manual', new=None, error='saved local OCR missing')
        self.assertEqual(rc.crop_findings([image], {}), ['image 2: saved local OCR missing'])


class AutomaticPlanTests(unittest.TestCase):
    """The shared helper keeps the server's rule for sending an image unreviewed."""

    def proposal(self, **changes):
        plan = dict(crop=[0, 120, 800, 900], masks=[dict(box=[0, 0, 10, 10])], crop_reason='detected_lab_table_header',
                    review_items=[])
        plan.update(changes)
        return proposal_summary(plan, 'b' * 64, [800, 1000])

    def test_table_header_without_review_items_is_automatic(self):
        plan = automatic_plan(self.proposal(), 'privacy-1')
        self.assertEqual(plan, dict(sha256='b' * 64, crop=[0, 120, 800, 900], masks=[[0, 0, 10, 10]],
                                    mask_polygons=[], proposal_id='privacy-1', automatic=True, reviewed=True))

    def test_review_items_crop_at_top_or_unknown_reason_need_review(self):
        self.assertIsNone(automatic_plan(self.proposal(review_items=[dict(code='staff_name', box=[0, 0, 1, 1])]), 'p'))
        self.assertIsNone(automatic_plan(self.proposal(crop=[0, 0, 800, 900]), 'p'))
        self.assertIsNone(automatic_plan(self.proposal(crop_reason='fallback_full_page'), 'p'))

    def test_chart_page_is_kept_local(self):
        self.assertEqual(automatic_plan(self.proposal(crop_reason='chart_only_page'), 'p'),
                         dict(sha256='b' * 64, skip=True, proposal_id='p', automatic=True))


if __name__ == '__main__':
    unittest.main()
