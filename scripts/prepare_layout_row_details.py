"""Narrow incomplete pattern rows to the source name/result columns."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ocr_pool.automatic import adapt_document
from ocr_pool import convert_documents
from ocr_pool.pipeline import roles
from ocr_pool.tables import parse_tables,TableError
from ocr_pool.regions import prepare_region,spec_from_provenance
from prepare_layout_retry import crop_rules


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--ocr-run',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    a=p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh manifest')
    from PIL import Image,ImageOps
    saved=json.loads((a.ocr_run/'ocr-tables.json').read_text(encoding='utf-8'))
    info=json.loads((a.ocr_run/'run.json').read_text(encoding='utf-8'))
    catalog=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
    docs,failures=[],[]
    for original in saved['documents']:
        doc=adapt_document(original)
        path=ROOT/doc['input_path']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=doc['input_sha256']:
            raise ValueError('Source hash mismatch')
        with Image.open(path) as opened:
            image=ImageOps.exif_transpose(opened).convert('RGB')
        regions=[]
        for table in doc['tables']:
            if not table.get('region',{}).get('layout',{}).get('row_parent_region_id'):
                continue
            trial=dict(doc,tables=[table])
            items=convert_documents([trial],catalog)['observations']
            incomplete=[o for o in items if o['result_type']=='pattern' and not o.get('grade_raw')]
            if len(incomplete)!=1 or table.get('truncated') or table.get('generation_status','ok')!='ok':
                continue
            try:
                grids=parse_tables(table['raw'],table.get('format','auto'))
                if len(grids)!=1:
                    continue
                columns=roles(grids[0].headers)
                if columns.get('name')!=0 or columns.get('result')!=1:
                    continue
                parent=spec_from_provenance(table['region'])
                crop,_=prepare_region(image,parent)
                source_grid,_=prepare_region(image,spec_from_provenance(table['region']['parent']))
                if source_grid.width!=crop.width:
                    raise ValueError('Row crop and source grid widths differ')
                _,rules=crop_rules(source_grid)
                if len(rules)!=len(grids[0].headers)+1:
                    raise ValueError('Grid column count differs from OCR headers')
                right=min(crop.width,round(rules[2])+3)
                regions.append(dict(region_id=table['table_id']+'-name-result',parent_region=parent,
                    crop_parts=[dict(bbox_xyxy=[0,0,right,crop.height],role='source_name_and_result')],
                    task='table',max_pixels=501760,context=table.get('context',{}),
                    layout_provenance=dict(method='source_grid_name_result_columns',
                        row_parent_region_id=table['table_id'],source_column_rules=rules,
                        source_ocr_run=a.ocr_run.as_posix())))
            except (TableError,ValueError) as error:
                failures.append(dict(region_id=table['table_id'],reason=str(error)))
        if regions:
            docs.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions))
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(dict(layout_method='PP-DocLayoutV3_source_row_detail',
        layout_sha256=info['layout_manifest_sha256'],reference_annotations_used=False,
        documents=docs,refinement_failures=failures),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(documents=len(docs),regions=sum(len(d['regions']) for d in docs),failures=failures)))


if __name__=='__main__':
    main()
