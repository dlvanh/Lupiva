"""Refine detected grids using source pixels and explicit OCR panel headings."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.grid_geometry import refine_table
from ocr_pool.layout_context import document_context
from ocr_pool.metadata import fold


def refinable_panel(ocr):
    # A clinical lab can mention Myositis/ANA as a test name. Its explicit
    # result/unit columns take priority over that assay word in source context.
    raw=fold(' '.join(t['raw'] for t in ocr.get('tables',[])))
    if all(label in raw for label in ('chi dinh','ket qua','don vi')):
        return None
    panel=document_context(ocr).get('panel')
    return panel if panel in {'ana_profile_23','myositis','pft'} else None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('layout', type=Path)
    p.add_argument('--ocr-run', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    a = p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a new manifest')
    from PIL import Image, ImageOps
    layout = json.loads(a.layout.read_text(encoding='utf-8'))
    saved = {d['document_id']: d for d in json.loads((a.ocr_run / 'ocr-tables.json').read_text(encoding='utf-8'))['documents']}
    documents, failures = [], []
    for doc in layout['documents']:
        if doc['document_id'] not in saved:
            continue
        ocr = saved[doc['document_id']]
        if ocr['input_sha256'] != doc['input_sha256']:
            raise ValueError('Different OCR/layout source hash')
        context = document_context(ocr)
        panel = refinable_panel(ocr)
        if panel is None:
            continue
        tables = [r for r in doc['detections'] if r['label'] == 'table']
        largest = max(tables, key=lambda r: (r['bbox_xyxy'][2]-r['bbox_xyxy'][0]) * (r['bbox_xyxy'][3]-r['bbox_xyxy'][1]))
        image = ImageOps.exif_transpose(Image.open(ROOT / doc['input_path'])).convert('RGB')
        regions = []
        for detection in tables:
            try:
                quad, info = refine_table(image, detection, panel, assay_grid=detection is largest)
            except ValueError as error:
                failures.append(dict(document_id=doc['document_id'], detection_id=detection['detection_id'], reason=str(error)))
                continue
            regions.append(dict(region_id=detection['detection_id'] + '-grid', source_quad_xy=quad,
                                task='table', max_pixels=1003520, context=context,
                                layout_provenance=dict(method='detector_polygon_and_source_grid',
                                    detection_ids=[detection['detection_id']], geometry=info,
                                    initial_ocr_run=str(a.ocr_run), original_region_id=detection['detection_id'])))
            print(json.dumps(dict(document_id=doc['document_id'], region_id=regions[-1]['region_id'], geometry=info)), flush=True)
        if regions:
            documents.append(dict(document_id=doc['document_id'], input_path=doc['input_path'],
                                  expected_input_sha256=doc['input_sha256'], regions=regions))
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_with_grid_refinement',
        reference_annotations_used=False, layout_source=str(a.layout),
        layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(), documents=documents,
        refinement_failures=failures), indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(documents=len(documents), failures=failures)))


if __name__ == '__main__':
    main()
