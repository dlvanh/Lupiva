"""Build source header bands from detector geometry and explicit OCR headings."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.layout import bounded_box, TEXT_LABELS
from ocr_pool.layout_context import document_context
from ocr_pool.metadata import fold
from ocr_pool.automatic import has_result_headers


def header_regions(doc, ocr):
    tables = [d for d in doc['detections'] if d['label']=='table']
    if not tables:
        return []
    # A legend can be larger than its assay grid. Prefer a detected table whose
    # saved OCR actually contains result headers before choosing a header band.
    result_ids = {p['table_id'] for p in ocr.get('tables', []) if has_result_headers(p)}
    result_tables = [d for d in tables if d['detection_id'] in result_ids]
    largest = max(result_tables or tables, key=lambda d:(d['bbox_xyxy'][2]-d['bbox_xyxy'][0])*(d['bbox_xyxy'][3]-d['bbox_xyxy'][1]))
    l,t,r,b = largest['bbox_xyxy']
    w,h = doc['image_size']
    pad = max(12, round(w*.012))
    context = document_context(ocr)
    boxes = []
    raw = ' '.join(p['raw'] for p in ocr.get('tables', []))
    lab = all(label in fold(raw) for label in ('chi dinh','ket qua','don vi'))
    if context.get('panel') in {'myositis','ana_profile_23'} and not lab:
        # The source immediately above the detected assay table contains its
        # printed identifiers. Avoid the unrelated sheet beyond the table edge.
        band_top = max(0,t-h*.04)
        header_text = [d for d in doc['detections'] if d['label'] in TEXT_LABELS
                       and band_top <= (d['bbox_xyxy'][1]+d['bbox_xyxy'][3])/2 < t
                       and d['bbox_xyxy'][0] < r and d['bbox_xyxy'][2] > l]
        patient_ids = {p['table_id'] for p in ocr.get('tables', [])
                       if re.search(r'\bpid\s*:', fold(p['raw']))
                       and re.search(r'date of birth\s*:', fold(p['raw']))
                       and not p.get('truncated')}
        preceding = [d for d in tables if d['detection_id'] in patient_ids
                     and 0 < t - d['bbox_xyxy'][3] < h*.08
                     and d['bbox_xyxy'][0] < r and d['bbox_xyxy'][2] > l]
        if preceding:
            band_top = max(band_top, max(d['bbox_xyxy'][3] for d in preceding)-4)
        if header_text or preceding:
            boxes.append(('table-header', [l, band_top, r,t+8]))
    else:
        if not lab:
            return []
        titles = [d for d in doc['detections'] if d['label'] in {'doc_title','paragraph_title'}
                  and d['bbox_xyxy'][3] < t and d['bbox_xyxy'][1] > h*.10]
        if not titles:
            return []
        title = max(titles, key=lambda d:d['bbox_xyxy'][3])['bbox_xyxy']
        text = [d for d in doc['detections'] if d['label'] in TEXT_LABELS and d['bbox_xyxy'][1] < t+h*.015]
        body = [d for d in text if d['label']=='text' and (d['bbox_xyxy'][1]+d['bbox_xyxy'][3])/2 > (title[1]+title[3])/2]
        if body:
            boxes.append(('clinical-header', [l,min(d['bbox_xyxy'][1] for d in body),r,max(d['bbox_xyxy'][3] for d in body)]))
        identifiers = [d for d in text if d['label']=='text' and d['bbox_xyxy'][3]<title[1]
                       and d['bbox_xyxy'][0] > w*.6]
        if identifiers:
            boxes.append(('identifier-header', [min(d['bbox_xyxy'][0] for d in identifiers),
                min(d['bbox_xyxy'][1] for d in identifiers),max(d['bbox_xyxy'][2] for d in identifiers),
                max(d['bbox_xyxy'][3] for d in identifiers)]))
    return [dict(region_id=doc['document_id']+'-auto-'+name,bbox_xyxy=bounded_box(box, doc['image_size'],pad),
                 task='text', purpose='metadata',max_pixels=1003520,
                 layout_provenance=dict(method='detected_table_and_heading_header_band',
                    detection_ids=[largest['detection_id']])) for name,box in boxes]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--layout',required=True,type=Path)
    p.add_argument('--ocr-run',required=True,action='append',type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh manifest')
    layout=json.loads(a.layout.read_text(encoding='utf-8'))
    saved={d['document_id']:d for run in a.ocr_run for d in json.loads((run/'ocr-tables.json').read_text(encoding='utf-8'))['documents']}
    documents=[]
    for doc in layout['documents']:
        ocr=saved.get(doc['document_id'])
        if not ocr:
            continue
        if ocr['input_sha256']!=doc['input_sha256']:
            raise ValueError('Source hash mismatch')
        regions=header_regions(doc,ocr)
        if regions:
            documents.append(dict(document_id=doc['document_id'], input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions,
                **(dict(focused_metadata_keys=['sid'])
                   if all(r['region_id'].endswith('-table-header') for r in regions)
                   else dict(metadata_supersedes=[r['table_id'] for r in ocr.get('text_regions',[])]))))
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_header_refinement',
        layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(),reference_annotations_used=False,
        documents=documents),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(documents=len(documents),regions=sum(len(d['regions']) for d in documents))))


if __name__=='__main__':
    main()
