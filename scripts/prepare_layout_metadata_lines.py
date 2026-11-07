"""Use individual detector text lines to avoid cross-column header OCR loops."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.layout import bounded_box
from ocr_pool.metadata import fold


def main():
    p=argparse.ArgumentParser(description=__doc__)
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
        raw=' '.join(t['raw'] for t in ocr['tables'])
        if not all(term in fold(raw) for term in ('chi dinh','ket qua','don vi')):
            continue
        if ocr['input_sha256']!=doc['input_sha256']:
            raise ValueError('Source hash mismatch')
        tables=[d for d in doc['detections'] if d['label']=='table']
        top=min(d['bbox_xyxy'][1] for d in tables)
        w,h=doc['image_size']
        lines=[d for d in doc['detections'] if d['label']=='text' and d['bbox_xyxy'][0]>w*.5
               and d['bbox_xyxy'][1]<top+h*.015]
        regions=[]
        for line in lines:
            l,t,r,b=line['bbox_xyxy']
            box=[max(0,l-w*.025),max(0,t-h*.003),min(w,r+w*.025),min(h,b+h*.003)]
            regions.append(dict(region_id=line['detection_id']+'-metadata-line',bbox_xyxy=bounded_box(box,doc['image_size'],0),
                task='text',purpose='metadata',max_pixels=501760,
                layout_provenance=dict(method='individual_detector_metadata_line',detection_ids=[line['detection_id']])))
        if regions:
            documents.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions,
                metadata_supersedes=[r['table_id'] for r in ocr['text_regions']]))
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_individual_metadata_lines',
        layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(),reference_annotations_used=False,
        documents=documents),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(documents=len(documents),regions=sum(len(d['regions']) for d in documents))))


if __name__=='__main__':
    main()
