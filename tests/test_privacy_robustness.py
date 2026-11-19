"""Synthetic-only checks of offline privacy perturbations and resumable reports."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
from PIL import Image, ImageDraw

from scripts import privacy_robustness as robustness


SECRET = 'RECOGNISABLE OCR CONTENT NEVER EXPORT'


def plan(crop=None, masks=None, reason='detected_lab_table_header', reviews=None):
    return dict(crop=crop or [0,0,120,120], masks=masks or [], crop_reason=reason,
                review_items=reviews or [], dates_local=[dict(raw=SECRET)])


def line(text, box=None):
    return dict(line_id=1, box=box or [10,10,50,25], text=text, confidence=.99)


class VariantTests(unittest.TestCase):
    def test_every_variant_tracks_an_off_center_square(self):
        image = Image.new('RGB', (243,317), 'white')
        box = [57,73,113,129]
        ImageDraw.Draw(image).rectangle((57,73,112,128), fill='black')
        original = image.tobytes()
        variants = robustness.DEFAULT_VARIANTS.split(',') + [
            'rot+3', 'rot-3', 'scale0.8', 'jpeg50', 'rot90', 'rot180']
        for name in variants:
            with self.subTest(variant=name):
                changed, mapping = robustness.make_variant(image, name)
                self.assertEqual('RGB', changed.mode)
                self.assertIsNot(image, changed)
                corners = [mapping(p) for p in [(57,73),(113,73),(113,129),(57,129)]]
                center = tuple(sum(p[i] for p in corners)/4 for i in (0,1))
                self.assertLess(max(changed.getpixel(tuple(map(int, center)))), 90)
                for point in [(62,78),(108,78),(108,124),(62,124)]:
                    self.assertLess(max(changed.getpixel(tuple(map(int, mapping(point))))), 90)
                for point in [(49,101),(121,101),(85,65),(85,137)]:
                    self.assertGreater(min(changed.getpixel(tuple(map(int, mapping(point))))), 140)
                self.assertEqual(robustness.mapped_box(box, mapping), [
                    min(p[0] for p in corners), min(p[1] for p in corners),
                    max(p[0] for p in corners), max(p[1] for p in corners)])
        self.assertEqual(original, image.tobytes())

    def test_scale_mapping_uses_rounded_dimensions(self):
        changed, mapping = robustness.make_variant(Image.new('RGB', (101,83)), 'scale0.6')
        self.assertEqual((61,50), changed.size)
        self.assertEqual((61,50), mapping((101,83)))

    def test_photometric_variants_and_generic_validation(self):
        image = Image.new('RGB', (50,50), 'white')
        ImageDraw.Draw(image).rectangle((10,10,39,39), fill='black')
        dark, mapping = robustness.make_variant(image, 'dark')
        self.assertEqual((10,12), mapping((10,12)))
        self.assertLess(dark.getpixel((0,0))[0], 200)
        blurred, _ = robustness.make_variant(image, 'blur')
        self.assertGreater(blurred.getpixel((10,20))[0], 0)
        compressed, _ = robustness.make_variant(image, 'jpeg35')
        self.assertNotEqual(image.tobytes(), compressed.tobytes())
        for name in ('scale0', 'scale-1', 'jpeg0', 'jpeg101', 'jpeg35.5',
                     'rotNaN', 'rotinf', '../dark', 'unknown'):
            with self.subTest(variant=name), self.assertRaises(ValueError):
                robustness.make_variant(image, name)


class ExposureTests(unittest.TestCase):
    def setUp(self):
        self.region = dict(box=[10,10,110,110], reasons=['identity_label'])
        self.identity = lambda point: point

    def exposed(self, proposal, regions=None, mapping=None):
        return robustness.exposures(regions or [self.region], mapping or self.identity,
                                    (120,120), proposal)

    def test_box_coverage_and_core_threshold(self):
        self.assertEqual([], self.exposed(plan(masks=[dict(box=[25,25,95,95])])))
        self.assertEqual([], self.exposed(plan(masks=[dict(box=[25,25,81,95])])))
        exposed = self.exposed(plan(masks=[dict(box=[25,25,80,95])]))
        self.assertEqual(1, len(exposed))
        self.assertLess(exposed[0]['covered_fraction'], .8)
        self.assertEqual([25,25,95,95], exposed[0]['core'])
        self.assertEqual(self.region['reasons'], exposed[0]['reasons'])

    def test_uncovered_inside_and_outside_crop(self):
        self.assertEqual(1, len(self.exposed(plan())))
        self.assertEqual([], self.exposed(plan(crop=[0,0,20,120])))
        # The denominator is only the part of the core that is sent.
        self.assertEqual([], self.exposed(plan(crop=[50,0,120,120],
                                              masks=[dict(box=[50,25,95,95])])))

    def test_polygon_precedence_and_union(self):
        polygon = dict(box=[0,0,120,120], polygon=[[25,25],[95,25],[95,95],[25,95]])
        self.assertEqual([], self.exposed(plan(masks=[polygon])))
        triangle = dict(box=[0,0,120,120], polygon=[[25,25],[95,25],[25,95]])
        self.assertEqual(1, len(self.exposed(plan(masks=[triangle]))))
        self.assertEqual([], self.exposed(plan(masks=[dict(box=[25,25,60,95]),
                                                     dict(box=[60,25,95,95])])))
        pixels = robustness.mask_pixels((120,120), plan(masks=[triangle]))
        self.assertEqual(np.dtype(bool), pixels.dtype)
        self.assertFalse(pixels[94,94])

    def test_fractional_core_coverage(self):
        region = dict(box=[10.5,10.5,110.5,110.5], reasons=['phone'])
        exposed = self.exposed(plan(masks=[dict(box=[25,25,81,96])]), [region])
        self.assertEqual(1, len(exposed))
        self.assertAlmostEqual(55.5/70, exposed[0]['covered_fraction'])

    def test_transformed_region_and_safe_decisions(self):
        mapping = lambda p: (p[0]/2, p[1]/2)
        exposed = self.exposed(plan(), mapping=mapping)
        self.assertEqual([5,5,55,55], exposed[0]['box'])
        self.assertEqual([], self.exposed(plan(reviews=[dict(code='uncertain')])))
        self.assertEqual([], self.exposed(plan(reason='chart_only_page')))
        self.assertEqual([], self.exposed(plan(reason='no_header')))


class GroundTruthTests(unittest.TestCase):
    def test_all_sensitive_patterns_outside_crop_without_retaining_text(self):
        samples = [('Patient name: '+SECRET, 'identity'), ('0901234567', 'phone'),
                   ('synthetic@example.test', 'email'), ('Date: 17/04/2029', 'date'),
                   ('Doctor: Synthetic Name', 'staff'), ('Dr. Synthetic Name', 'staff'),
                   ('CKT. Synthetic Name', 'staff'), ('CN. Synthetic Name', 'staff'),
                   ('Signature: Synthetic Name', 'staff')]
        masks = [dict(box=[60,90,90,110], reasons=['barcode', 'identity_label'], text=SECRET)]
        proposal = plan(crop=[0,80,120,120], masks=masks)
        lines = [line(text) for text,kind in samples]
        lines += [line('CRP 4.81'), line('Patient name: '+SECRET, [10,75,50,85])]
        regions = robustness.ground_truth(proposal, lines)
        self.assertEqual(1+len(samples), len(regions))
        self.assertEqual(['barcode', 'identity_label'], regions[0]['reasons'])
        for region, (_,kind) in zip(regions[1:], samples):
            self.assertIn('outside_crop_'+kind, region['reasons'])
        self.assertNotIn(SECRET, json.dumps(regions))
        self.assertTrue(all(set(region) == {'box','reasons'} for region in regions))

    def test_only_sent_automatic_baselines_contribute(self):
        for proposal in (plan(reason='chart_only_page'), plan(reason='no_header'),
                         plan(reviews=[dict(code='review')])):
            self.assertEqual([], robustness.ground_truth(proposal, [line('Patient name: X')]))


class RunnerTests(unittest.TestCase):
    def workspace(self, root):
        folder = root / 'synthetic'; folder.mkdir()
        source = folder / 'page.png'
        image = Image.new('RGB', (120,120), 'white')
        ImageDraw.Draw(image).rectangle((10,10,49,29), fill='black')
        image.save(source)
        return source, root / 'output'

    def test_resume_skips_finished_pairs_and_adds_a_variant(self):
        with tempfile.TemporaryDirectory(dir=robustness.ROOT) as folder:
            source, out = self.workspace(Path(folder)); calls = []
            def analyze(image, models):
                calls.append(image.size)
                return plan(crop=[0,50,120,120]), [line('Patient name: '+SECRET)]
            with redirect_stdout(io.StringIO()):
                first = robustness.run([source], 'unused', out, analyze, 'dark')
                second = robustness.run([source], 'unused', out, analyze, 'dark')
                third = robustness.run([source], 'unused', out, analyze, 'dark,blur')
            self.assertEqual(3, len(calls))
            self.assertEqual(first, second)
            self.assertEqual(['baseline','dark','blur'], [r['variant'] for r in third])
            self.assertEqual(1, len(third[0]['regions']))
            self.assertEqual(third, json.loads((out / 'results.json').read_text(encoding='utf-8')))

    def test_interrupted_image_retains_completed_pairs(self):
        with tempfile.TemporaryDirectory(dir=robustness.ROOT) as folder:
            source, out = self.workspace(Path(folder)); count = 0
            def interrupted(image, models):
                nonlocal count
                count += 1
                if count == 3:
                    raise RuntimeError(SECRET)
                return plan(crop=[0,50,120,120]), [line('Patient name: '+SECRET)]
            with redirect_stdout(io.StringIO()), self.assertRaises(RuntimeError):
                robustness.run([source], 'unused', out, interrupted, 'dark,blur')
            self.assertEqual(2, len(json.loads((out / 'results.json').read_text(encoding='utf-8'))))
            resumed = []
            def analyze(image, models):
                resumed.append(1)
                return plan(), []
            with redirect_stdout(io.StringIO()):
                rows = robustness.run([source], 'unused', out, analyze, 'dark,blur')
            self.assertEqual([1], resumed)
            self.assertEqual(1, len(rows[-1]['exposed_regions']))
            self.assertEqual(['outside_crop_identity'], rows[-1]['exposed_regions'][0]['reasons'])

    def test_reports_and_progress_never_include_ocr_text_and_preview_is_outgoing(self):
        with tempfile.TemporaryDirectory(dir=robustness.ROOT) as folder:
            source, out = self.workspace(Path(folder)); count = 0
            def analyze(image, models):
                nonlocal count
                count += 1
                print(SECRET)
                print(SECRET, file=robustness.sys.stderr)
                if count == 1:
                    return plan(crop=[0,50,120,120],
                                masks=[dict(box=[70,60,100,90], reasons=['barcode'])]), [
                                    line('Patient name: '+SECRET)]
                return plan(crop=[0,5,120,110], masks=[dict(box=[70,60,100,90])]), [line(SECRET)]
            stdout, stderr = io.StringIO(), io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                rows = robustness.run([source.parent,source], 'unused', out, analyze, 'dark')
            report = (out / 'summary.md').read_text(encoding='utf-8')
            serialized = (out / 'results.json').read_text(encoding='utf-8')
            for output in (report, serialized, stdout.getvalue(), stderr.getvalue()):
                self.assertNotIn(SECRET, output)
                self.assertNotIn('Patient name:', output)
                self.assertNotIn('dates_local', output)
            self.assertEqual(2, len(stdout.getvalue().splitlines()))
            self.assertIn('Baseline automatic count: 1', report)
            self.assertIn('outside_crop_identity', report)
            self.assertEqual(1, len(rows[1]['exposed_regions']))
            previews = list((out / 'exposed').glob('*.png'))
            self.assertEqual(1, len(previews))
            with Image.open(previews[0]) as preview:
                self.assertEqual((120,105), preview.size)
                pixels = np.asarray(preview)
                self.assertTrue(np.any(np.all(pixels == [255,0,0], axis=2)))
                self.assertEqual((255,255,255), preview.getpixel((80,70-5)))
                self.assertFalse(preview.getexif())

    def test_exif_rgb_limit_and_manual_promotion(self):
        with tempfile.TemporaryDirectory(dir=robustness.ROOT) as folder:
            root = Path(folder); images = root / 'synthetic'; images.mkdir()
            exif = Image.Exif(); exif[274] = 6
            Image.new('L', (80,120), 'white').save(images / 'a.jpg', exif=exif)
            Image.new('RGB', (80,120), 'white').save(images / 'b.png')
            seen = []
            def analyze(image, models):
                seen.append((image.mode,image.size))
                if len(seen) == 1:
                    return plan(reviews=[dict(code='z', text=SECRET),dict(code='a'),dict(code='z')]), [line(SECRET)]
                return plan(), [line(SECRET)]
            with redirect_stdout(io.StringIO()):
                rows = robustness.run([images], 'unused', root / 'out', analyze, 'dark', limit=1)
            self.assertEqual([('RGB',(120,80))]*2, seen)
            self.assertEqual(['a','z'], rows[0]['review_codes'])
            self.assertEqual([], rows[0]['regions'])
            self.assertEqual([], rows[1]['exposed_regions'])
            report = robustness.summary(rows)
            self.assertIn('| dark | 1 | 0 | 0 | 1 | 0 | 0 | 0 |', report)
            self.assertIn('| synthetic/a.jpg | dark |', report)
            self.assertNotIn(SECRET, report)

    def test_summary_transitions_and_chart_only_stays_local(self):
        def row(image_id, variant, automatic=False, local=False):
            return dict(image_id=image_id, variant=variant, automatic=automatic,
                        local_only=local, exposed_regions=[])
        rows = [row('auto/a','baseline',True), row('auto/a','dark',True),
                row('auto/b','baseline',True), row('auto/b','dark'),
                row('manual/a','baseline'), row('manual/a','dark',True),
                row('chart/a','baseline',local=True), row('chart/a','dark',True),
                row('auto/c','baseline',True), row('auto/c','dark',local=True)]
        report = robustness.summary(rows)
        self.assertIn('Baseline automatic count: 3', report)
        self.assertIn('| dark | 5 | 1 | 1 | 1 | 0 | 0 | 1 |', report)
        self.assertIn('| manual/a | dark |', report)
        self.assertNotIn('| chart/a | dark |', report)

    def test_safe_filenames_are_distinct_and_windows_safe(self):
        first = robustness.safe_id('a/b:c.png')
        second = robustness.safe_id('a_b:c.png')
        self.assertNotEqual(first, second)
        self.assertRegex(first, r'^page-[A-Za-z0-9_.-]+$')
        self.assertLess(len(robustness.safe_id('x'*500)), 130)


if __name__ == '__main__':
    unittest.main()
