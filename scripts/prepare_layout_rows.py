"""Re-read suspicious lab grids as source header + separate ruled bands."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.regions import prepare_region, spec_from_provenance
from ocr_pool.metadata import fold
from prepare_layout_retry import crop_rules


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ocr-run',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--table-id',action='append')
    a=p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh manifest')
    from PIL import Image,ImageOps
    data=json.loads((a.ocr_run/'ocr-tables.json').read_text(encoding='utf-8'))
    pool=json.loads((a.ocr_run/'candidate-pool.json').read_text(encoding='utf-8'))
    issues=pool['issues']
    documents=[]
    failures=[]
    for doc in data['documents']:
        source=ROOT/doc['input_path']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['input_sha256']:
            raise ValueError('Source hash mismatch')
        image=ImageOps.exif_transpose(Image.open(source)).convert('RGB')
        regions=[]
        for table in doc['tables']:
            tid=table['table_id']
            if table.get('purpose') in {'source_legend','superseded_context'}:
                continue
            if a.table_id and tid not in a.table_id:
                continue
            raw=fold(table['raw'])
            if not all(term in raw for term in ('chi dinh','ket qua','don vi')):
                continue
            suspicious=any(i.get('table_id','').rsplit('.',1)[0]==tid and i['reason']=='unmapped_test'
                and any(s in fold(' '.join(i.get('row_raw',[]))) for s in ('homogeneous','speckled','nucleolar','centromere'))
                for i in issues)
            if not a.table_id and not suspicious:
                continue
            parent=spec_from_provenance(table['region'])
            crop,_=prepare_region(image,parent)
            rows,_=crop_rules(crop)
            rows=[round(y) for y in rows if 0<=y<=crop.height]
            if len(rows)<5 or rows[0]>crop.height*.04 or rows[1]>crop.height*.16:
                failures.append(dict(table_id=tid,reason='uncertain_source_header_and_row_grid'))
                continue
            # Every band and the entire bottom are preserved, including faint
            # or missed rules that leave several logical rows in one band.
            boundaries=rows[1:]+[crop.height]
            for index,(top,bottom) in enumerate(zip(boundaries,boundaries[1:])):
                if bottom-top<10:
                    continue
                regions.append(dict(region_id=tid+f'-row-{index:03d}',parent_region=parent,
                    crop_parts=[dict(bbox_xyxy=[0,max(0,rows[0]-3),crop.width,min(crop.height,rows[1]+2)],role='source_header'),
                                dict(bbox_xyxy=[0,max(0,top-2),crop.width,min(crop.height,bottom+2)],role='source_body_band')],
                    task='table',max_pixels=1003520,context=table.get('context',{}),
                    layout_provenance=dict(method='source_ruled_row_bands',row_parent_region_id=tid,
                        row_band_index=index,source_crop_rows=[top,bottom],source_header_rows=rows[:2],
                        source_ocr_run=a.ocr_run.as_posix())))
        if regions:
            documents.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions))
    provenance=json.loads((a.ocr_run/'provenance.json').read_text(encoding='utf-8'))
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_source_row_refinement',
        layout_sha256=provenance['layout_sha256'],reference_annotations_used=False,documents=documents,
        refinement_failures=failures),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(regions=sum(len(d['regions']) for d in documents),failures=failures)))


if __name__=='__main__':
    main()
