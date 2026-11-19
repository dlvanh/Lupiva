import argparse
import json
from pathlib import Path
from .sample_collection import extract_sample_collections


def main():
    p=argparse.ArgumentParser(description='Extract local sample-form candidates from saved OCR; no reference input.')
    p.add_argument('ocr',type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--date-order',choices=['DMY'])
    a=p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh output path')
    docs=json.loads(a.ocr.read_text(encoding='utf-8'))['documents']
    result=extract_sample_collections(docs,date_order=a.date_order)
    a.output.parent.mkdir(parents=True,exist_ok=True)
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(candidates=len(result['candidates']),issues=len(result['issues']),human_verified=False)))


if __name__=='__main__':
    main()
