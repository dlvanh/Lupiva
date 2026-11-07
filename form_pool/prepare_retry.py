"""Prepare bounded source-cell re-reads for failed sample collection values."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image,ImageOps
from ocr_pool.regions import prepare_region
from ocr_pool.tables import parse_tables
from ocr_pool.metadata import fold
from .sample_collection import extract_sample_collections,HEADERS
from .geometry import table_quad,rectified_rules


def prepare(documents,workspace,source_run):
    output,failures=[],[]
    for doc in documents:
        source=Path(workspace)/doc['input_path']
        if hashlib.sha256(source.read_bytes()).hexdigest()!=doc['input_sha256']:
            raise ValueError('Form source image hash mismatch')
        with Image.open(source) as opened:
            image=ImageOps.exif_transpose(opened).convert('RGB')
        regions=[]
        for table in doc.get('tables',[]):
            if table.get('purpose') in {'superseded_context','source_legend'}:
                continue
            if 'sample type' not in fold(table['raw']):
                continue
            tid=table['table_id']
            try:
                candidates=extract_sample_collections([dict(doc,tables=[table])],date_order='DMY')['candidates']
                targets=[c for c in candidates if c['sample_type']!='other' and
                         (c['collection_datetime']['date'] is None or c['amount']['numeric_value'] is None)]
                if not targets:
                    continue
                box=table.get('region',{}).get('bbox_xyxy')
                if box is None:
                    raise ValueError('Form retry currently requires a detector source bbox')
                base,_=prepare_region(image,dict(bbox_xyxy=box))
                quad,info=table_quad(base)
                source_quad=[[x+box[0],y+box[1]] for x,y in quad]
                parent=dict(source_quad_xy=source_quad)
                rectified,_=prepare_region(image,parent)
                rows,cols=rectified_rules(rectified)
                parsed=parse_tables(table['raw'],table.get('format','auto'))
                if len(parsed)!=1:
                    raise ValueError('Ambiguous form table')
                grid=parsed[0].rows
                starts=[i for i,row in enumerate(grid) if [fold(c.strip()) for c in row]==HEADERS]
                if len(starts)!=1:
                    raise ValueError('Ambiguous source form header')
                raw_rows=table['raw'].split('<nl>') if '<fcel>' in table['raw'] else None
                import re
                physical=[]
                for index in range(starts[0]+1,len(grid)):
                    if raw_rows and re.match(r'\s*<ucel>',raw_rows[index]):
                        continue
                    physical.append(index)
                if len(physical)!=len(rows)-2:
                    raise ValueError('OCR logical rows and full-width source bands disagree')
                parent_hash=hashlib.sha256(table['raw'].encode('utf-8')).hexdigest()
                for candidate in targets:
                    ev=next(e for e in extract_sample_collections([dict(doc,tables=[table])],date_order='DMY')['evidence']
                            if e['evidence_id']==candidate['evidence_ids'][0])
                    band=physical.index(ev['row_index_0based'])+1
                    top,bottom=rows[band:band+2]
                    for attribute,column in [('collection_datetime',1),('amount',2)]:
                        missing=(candidate['collection_datetime']['date'] is None if attribute=='collection_datetime'
                                 else candidate['amount']['numeric_value'] is None)
                        if not missing:
                            continue
                        region_id=tid+'-sample-'+str(ev['row_index_0based'])+'-'+attribute
                        l,r=cols[column:column+2]
                        # Include source borders. Do not remove printed leaders
                        # or synthesize labels to influence OCR.
                        cell=[max(0,l-3),max(0,top-3),min(rectified.width,r+3),min(rectified.height,bottom+3)]
                        regions.append(dict(region_id=region_id,parent_region=parent,
                            crop_parts=[dict(bbox_xyxy=cell,role='source_form_cell')],task='text',max_pixels=501760,
                            purpose='sample_form_retry',layout_provenance=dict(method='source_sample_form_ruled_cell',
                                parent_table_id=tid,parent_raw_sha256=parent_hash,
                                parent_sample_candidate_id=candidate['sample_candidate_id'],
                                parent_row_index_0based=ev['row_index_0based'],attribute=attribute,
                                source_ocr_run=str(source_run),source_row_rules=rows,source_column_rules=cols,
                                source_grid_geometry=info)))
            except ValueError as error:
                failures.append(dict(document_id=doc['document_id'],table_id=tid,reason=str(error)))
        if regions:
            output.append(dict(document_id=doc['document_id'],input_path=doc['input_path'],
                expected_input_sha256=doc['input_sha256'],regions=regions))
    return dict(layout_method='source_sample_form_ruled_cells',reference_annotations_used=False,
                documents=output,refinement_failures=failures)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ocr-run',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Choose a fresh form retry manifest')
    workspace=Path(__file__).resolve().parents[1]
    documents=json.loads((args.ocr_run/'ocr-tables.json').read_text(encoding='utf-8'))['documents']
    result=prepare(documents,workspace,args.ocr_run)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(regions=sum(len(d['regions']) for d in result['documents']),failures=result['refinement_failures'])))


if __name__=='__main__':
    main()
