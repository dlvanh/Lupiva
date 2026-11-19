"""Read the text band above a detected header barcode, without reference IDs."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.layout import bounded_box


def identifier_regions(document):
    w, h = document['image_size']
    detections = document['detections']
    tables = [d for d in detections if d['label'] == 'table']
    if not tables:
        return []
    top = min(d['bbox_xyxy'][1] for d in tables)
    images = [d for d in detections if d['label'] == 'image'
              and d['bbox_xyxy'][0] > w * .5 and d['bbox_xyxy'][3] < min(top, h * .2)
              and 2.5 < (d['bbox_xyxy'][2] - d['bbox_xyxy'][0]) /
                  (d['bbox_xyxy'][3] - d['bbox_xyxy'][1]) < 10
              and d['bbox_xyxy'][3] - d['bbox_xyxy'][1] < h * .06]
    if len(images) != 1:
        return []
    image = images[0]
    l, t, r, b = image['bbox_xyxy']
    lines = [d for d in detections if d['label'] == 'text'
             and d['bbox_xyxy'][0] > w * .5 and d['bbox_xyxy'][3] <= t
             and d['bbox_xyxy'][1] > t - h * .08]
    if not lines:
        return []
    # Include the undetected gap down to the barcode and the full right width;
    # a text detector may have found the label but missed the last ID glyph.
    box = [min(l, min(d['bbox_xyxy'][0] for d in lines)) - w * .015,
           min(d['bbox_xyxy'][1] for d in lines) - h * .004,
           max(r, max(d['bbox_xyxy'][2] for d in lines)) + w * .03, t + h * .002]
    return [dict(region_id=image['detection_id'] + '-identifier-band',
        bbox_xyxy=bounded_box(box, document['image_size'], 0), task='text',
        purpose='metadata', max_pixels=501760,
        layout_provenance=dict(method='text_band_above_header_barcode_candidate',
            detection_ids=[image['detection_id']] + [d['detection_id'] for d in lines]))]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--layout', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    a = p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh manifest')
    layout = json.loads(a.layout.read_text(encoding='utf-8'))
    docs = []
    for doc in layout['documents']:
        regions = identifier_regions(doc)
        if regions:
            docs.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions,
                focused_metadata_keys=['pid','sid']))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_identifier_band',
        layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(),
        reference_annotations_used=False,documents=docs),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(documents=len(docs),regions=sum(len(d['regions']) for d in docs))))


if __name__ == '__main__':
    main()
