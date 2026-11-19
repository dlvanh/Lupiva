"""Retry source crops using ruled geometry, without reference coordinates/values."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.grid_geometry import clusters
from ocr_pool.regions import prepare_region
from ocr_pool.metadata import fold
from ocr_pool.tables import parse_tables, TableError


def crop_rules(crop):
    import cv2
    import numpy as np
    gray = np.asarray(crop.convert('L'))
    h, w = gray.shape
    binary = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                  cv2.THRESH_BINARY_INV, 31, 15)
    lines = cv2.HoughLinesP(binary, 1, np.pi / 1800, 100,
                            minLineLength=w * .55, maxLineGap=35)
    horizontal = []
    if lines is not None:
        for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
            if abs(y2-y1) < abs(x2-x1) * .05:
                horizontal.append(round(y1 + (w/2-x1)*(y2-y1)/(x2-x1)))
    lines = cv2.HoughLinesP(binary[:h//5], 1, np.pi / 1800, 60,
                            minLineLength=h*.05, maxLineGap=15)
    vertical = []
    if lines is not None:
        for x1, y1, x2, y2 in np.asarray(lines).reshape(-1, 4):
            if abs(x2-x1) < abs(y2-y1) * .1:
                vertical.append(round(x1 + (h/10-y1)*(x2-x1)/(y2-y1)))
    return clusters(sorted(horizontal), 6), clusters(sorted(vertical), 8)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest', required=True, type=Path)
    p.add_argument('--ocr-run', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    a = p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh manifest')
    from PIL import Image, ImageOps
    manifest = json.loads(a.manifest.read_text(encoding='utf-8'))
    saved = {d['document_id']: d for d in json.loads((a.ocr_run/'ocr-tables.json').read_text(encoding='utf-8'))['documents']}
    output, failures = [], []
    for doc in manifest['documents']:
        if doc['document_id'] not in saved:
            continue
        source = ROOT/doc['input_path']
        if hashlib.sha256(source.read_bytes()).hexdigest() != doc['expected_input_sha256']:
            raise ValueError('Source hash mismatch')
        image = ImageOps.exif_transpose(Image.open(source)).convert('RGB')
        raws = {r['table_id']: r for r in saved[doc['document_id']]['tables']}
        regions = []
        for original in doc['regions']:
            raw = raws.get(original['region_id'])
            if raw is None:
                continue
            panel = original.get('context', {}).get('panel')
            # Assay crops are regenerated separately with the tightened grid.
            lab = all(term in fold(raw['raw']) for term in ('chi dinh', 'ket qua', 'don vi', 'tham chieu'))
            if panel != 'pft' and not lab:
                continue
            if lab:
                try:
                    parse_tables(raw['raw'])
                    continue  # Do not retry grids that already parse strictly.
                except TableError:
                    pass
            crop, _ = prepare_region(image, original)
            rows, cols = crop_rules(crop)
            if panel == 'pft':
                # A title band followed by two column-header bands. Require
                # all three ruled bands near the top; preserve every body row.
                early = [y for y in rows if 0 <= y < crop.height*.16]
                if len(early) < 4 or not early[0] < crop.height*.02:
                    failures.append(dict(region_id=original['region_id'], reason='uncertain_title_band'))
                    continue
                box = [0, max(0, round(early[1])-4), crop.width, crop.height]
            else:
                # Six explicit lab columns, drop only process/device columns.
                if len(cols) != 7 or not all(cols[i+1]-cols[i] > crop.width*.06 for i in range(6)):
                    failures.append(dict(region_id=original['region_id'], reason='uncertain_lab_columns', columns=cols))
                    continue
                box = [max(0, round(cols[0])-4), 0, min(crop.width, round(cols[4])+4), crop.height]
            parent = copy.deepcopy(original)
            regions.append(dict(region_id=original['region_id']+'-columns', parent_region=parent,
                crop_parts=[dict(bbox_xyxy=box, role='source_column_headers_and_all_body_rows')],
                task='table', max_pixels=1003520, context=original.get('context', {}),
                layout_provenance=dict(method='source_ruled_header_columns',
                    original_region_id=original['region_id'],
                    horizontal_lines=rows, vertical_lines=cols, parent_manifest=str(a.manifest))))
        if regions:
            output.append({**{k:v for k,v in doc.items() if k!='regions'}, 'regions':regions})
    manifest['documents'] = output
    manifest['refinement_failures'] = failures
    a.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(dict(regions=sum(len(d['regions']) for d in output), failures=failures)))


if __name__ == '__main__':
    main()
