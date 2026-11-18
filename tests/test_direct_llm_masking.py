"""Direct-LLM review images with synthetic pixels and no API calls."""
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

from PIL import Image, ImageDraw

from ocr_pool.llm import prepare_image
from ocr_pool.llm_workflow import run
from registry_pool.exchange import read
from registry_review.server import ReviewApplication
from test_llm_intake import DICTIONARY, result


class DirectLlmMaskingTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        (self.root / 'schemas').mkdir()
        (self.root / 'schemas/pool-dictionary.json').write_text(json.dumps(DICTIONARY), encoding='utf-8')

    def document(self, name='DIRECT', *, direct=True):
        image = Image.new('RGB', (200, 100), 'white' if direct else 'ivory')
        draw = ImageDraw.Draw(image)
        draw.rectangle((40, 30, 79, 49), fill='red')  # synthetic patient identifier
        draw.rectangle((90, 32, 105, 42), fill='blue')  # requested header value
        draw.rectangle((5, 75, 195, 80), fill='green')
        path = self.root / (name + '.png')
        image.save(path)
        body = path.read_bytes()
        checksum = hashlib.sha256(body).hexdigest()
        privacy = dict(sha256=checksum, reviewed=True, crop=[0, 0, 200, 100], masks=[])
        if direct:
            privacy['direct_llm'] = True
        return dict(document_id=name, input_path=path.name, input_sha256=checksum, privacy=privacy), body

    def run_pages(self, docs, extractor, *, folder='run'):
        with patch('ocr_pool.llm_workflow.scan_source_dates', return_value=('not_needed', None)):
            return run(dict(documents=docs), self.root / folder, self.root, extractor=extractor)

    def output_image(self, name, *, folder='run'):
        with Image.open(self.root / folder / 'crops' / (name + '.png')) as image:
            return image.copy()

    def test_masked_page_header_crop_specimens_and_audit(self):
        doc, body = self.document()
        record = result()
        record['extraction'].update(pii_boxes=[
            dict(kind='patient_name', box=[200, 300, 400, 500]),
            dict(kind='barcode', box=[980, 950, 1000, 1000]),
            dict(kind='birth_date', box=[-1, 600, 60, 700]),
            dict(kind='phone', box=[800, 600, 800, 700]),
            dict(kind='address', box=[800, 700, 900, 650]),
        ], header_facts=[
            dict(key='ordering_provider', label_raw='Physician', value_raw='Synthetic Physician',
                 box=[150, 250, 550, 650]),
            dict(key='specimen_collector', label_raw='Nurse', value_raw='Synthetic Nurse', box=None),
            dict(key='result_date', label_raw='Result date', value_raw='2025-03-20', box=[500, 800, 600, 1010]),
        ])
        extractor = Mock(return_value=record)
        bundle = self.run_pages([doc], extractor)
        outgoing = prepare_image(body, doc['privacy'])
        extractor.assert_called_once()
        self.assertEqual(extractor.call_args.args[0], outgoing)
        with Image.open(io.BytesIO(outgoing)) as original:
            value_pixel = original.getpixel((96, 38))
            expected = original.copy()
        expected.paste('black', (37, 28, 83, 52))
        expected.paste('black', (193, 93, 200, 100))
        page = self.output_image('G0000')
        self.assertEqual(page.tobytes(), expected.tobytes())
        self.assertEqual(self.output_image('G0000S').tobytes(), page.tobytes())
        for name in ('G0000HEADER001', 'G0000HEADER002'):
            self.assertEqual(self.output_image(name).tobytes(), page.tobytes())
        crop = self.output_image('G0000HEADER000')
        self.assertEqual(crop.size, (88, 44))
        self.assertEqual(crop.tobytes(), expected.crop((26, 23, 114, 67)).tobytes())
        self.assertEqual(crop.getpixel((20, 15)), (0, 0, 0))
        self.assertEqual(crop.getpixel((70, 15)), value_pixel)

        candidate = read(self.root / 'run/candidate-pool.json')
        evidence = {item['table_id']: item for item in candidate['evidence']}
        row = next(item for item in candidate['evidence']
                   if item['table_id'] == 'G0000.result' and item['row_raw'][0] == 'C3')
        self.assertEqual(row['region_granularity'], 'masked_full_page')
        self.assertEqual(row['pii_boxes_applied'], 2)
        self.assertEqual(row['region']['llm_row_location']['image_size'], [200, 100])
        self.assertEqual(row['region']['llm_row_location']['box'], [30, 100, 890, 185])
        for index, granularity, count in ((0, 'llm_header_box', 1), (1, 'masked_full_page', 2),
                                          (2, 'masked_full_page', 2)):
            entry = evidence[f'G0000HEADER{index:03}']
            self.assertEqual(entry['region_granularity'], granularity)
            self.assertEqual(entry['pii_boxes_applied'], count)
            self.assertNotIn('llm_row_location', entry['region'])
        audit = read(bundle / 'package.json')['source_run']['provenance']['documents'][0]['display_masking']
        self.assertEqual(audit['pii_boxes_applied'], 2)
        self.assertEqual(audit['invalid_pii_boxes'], 3)
        self.assertEqual(audit['invalid_header_boxes'], 1)
        self.assertFalse(audit['header_band_masked'])

    def test_missing_or_invalid_pii_boxes_mask_top_quarter(self):
        doc, body = self.document()
        record = result()
        record['extraction']['header_facts'] = [dict(key='age', label_raw='Age', value_raw='42 years')]
        with Image.open(io.BytesIO(prepare_image(body, doc['privacy']))) as original:
            expected = original.copy()
        expected.paste('black', (0, 0, 200, 25))
        for scenario, boxes in (('missing', None), ('empty', []), ('invalid', [
                dict(kind='patient_name', box=[-1, 0, 50, 50])])):
            with self.subTest(scenario=scenario):
                if boxes is not None:
                    record['extraction']['pii_boxes'] = boxes
                self.run_pages([doc], lambda *_: deepcopy(record), folder=scenario)
                for name in ('G0000', 'G0000HEADER000'):
                    self.assertEqual(self.output_image(name, folder=scenario).tobytes(), expected.tobytes())
                audit = read(self.root / scenario / 'provenance.json')['documents'][0]['display_masking']
                self.assertEqual(audit['pii_boxes_applied'], 0)
                self.assertEqual(audit['invalid_pii_boxes'], len(boxes or []))
                self.assertTrue(audit['header_band_masked'])

    def test_review_asset_redirects_direct_sources_and_withholds_legacy_assets(self):
        direct, original = self.document()
        normal, normal_original = self.document('NORMAL', direct=False)
        bundle = self.run_pages([direct, normal], lambda *_: result())
        package = read(bundle / 'package.json')
        app = ReviewApplication.__new__(ReviewApplication)
        key = (package['package_id'], package['revision'])
        app.bundles = {key: (bundle, package)}
        direct_key, normal_key = (document['source_key'] for document in package['documents'])
        masked_key = 'artifacts/crops/G0000.png'
        self.assertEqual((bundle / direct_key).read_bytes(), original)
        masked_url = app.asset_url(key, direct_key)
        self.assertEqual(parse_qs(urlsplit(masked_url).query)['key'], [masked_key])
        self.assertEqual(app.asset(*key, direct_key), app.asset(*key, masked_key))
        self.assertEqual(app.asset(*key, normal_key)[0], normal_original)
        with Image.open(io.BytesIO(prepare_image(normal_original, normal['privacy']))) as outgoing:
            self.assertEqual(self.output_image('G0001').tobytes(), outgoing.tobytes())

        legacy = deepcopy(package)
        del legacy['source_run']['provenance']['documents'][0]['display_masking']
        app.bundles[key] = (bundle, legacy)
        for asset in (direct_key, masked_key, 'artifacts/crops/G0000S.png'):
            with self.subTest(asset=asset):
                self.assertIsNone(app.asset_url(key, asset))
                with self.assertRaises(KeyError):
                    app.asset(*key, asset)
        self.assertEqual(app.asset(*key, normal_key)[0], normal_original)
        self.assertEqual(app.asset(*key, 'artifacts/crops/G0001.png')[1], 'image/png')
