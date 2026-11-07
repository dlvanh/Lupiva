"""Tighten handwritten cell crops using source blue-ink extents only."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image,ImageOps
from ocr_pool.regions import prepare_region,spec_from_provenance


def ink_boxes(crop):
    import numpy as np
    pixels=np.asarray(crop.convert('RGB')).astype('int16')
    red,green,blue=pixels[:,:,0],pixels[:,:,1],pixels[:,:,2]
    ink=(blue-red>20)&(blue-green>10)&(blue>40)
    ys=list(np.flatnonzero(ink.sum(axis=1)>=3))
    if not ys:
        return []
    groups=[]
    for y in ys:
        if not groups or y-groups[-1][-1]>8:
            groups.append([])
        groups[-1].append(y)
    boxes=[]
    for group in groups:
        top,bottom=int(group[0]),int(group[-1])+1
        xs=np.flatnonzero(ink[top:bottom].sum(axis=0)>0)
        if len(xs)<8 or bottom-top<8:
            continue
        boxes.append([max(0,int(xs[0])-5),max(0,top-5),min(crop.width,int(xs[-1])+6),min(crop.height,bottom+5)])
    return boxes


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ocr-run',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Use a fresh manifest')
    root=Path(__file__).resolve().parents[1]
    saved=json.loads((args.ocr_run/'ocr-tables.json').read_text(encoding='utf-8'))
    documents,failures=[],[]
    for doc in saved['documents']:
        source=root/doc['input_path']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['input_sha256']:
            raise ValueError('Source image changed')
        with Image.open(source) as opened:
            image=ImageOps.exif_transpose(opened).convert('RGB')
        regions=[]
        for cell in doc['text_regions']:
            layout=cell.get('region',{}).get('layout',{})
            if layout.get('method')!='source_sample_form_ruled_cell':
                continue
            parent=spec_from_provenance(cell['region'])
            crop,_=prepare_region(image,parent)
            boxes=ink_boxes(crop)
            if not boxes:
                failures.append(dict(region_id=cell['table_id'],reason='no_separable_blue_ink_lines'))
                continue
            for index,box in enumerate(boxes):
                regions.append(dict(region_id=cell['table_id']+'-ink-'+str(index),parent_region=parent,
                    crop_parts=[dict(bbox_xyxy=box,role='source_blue_ink_extent_without_pixel_modification')],
                    task='text',purpose='sample_form_retry',max_pixels=501760,
                    layout_provenance=dict(**{k:v for k,v in layout.items() if k!='method'},
                        method='source_sample_form_blue_ink_extent',parent_cell_region_id=cell['table_id'],
                        ink_detection_rule='B-R>20 and B-G>10; extent only; source RGB pixels unchanged',
                        source_cell_ocr_run=args.ocr_run.as_posix())))
        if regions:
            documents.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(dict(layout_method='source_sample_form_blue_ink_extents',
        reference_annotations_used=False,documents=documents,refinement_failures=failures),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(regions=sum(len(d['regions']) for d in documents),failures=failures)))


if __name__=='__main__':
    main()
