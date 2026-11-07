"""Route saved whole-image detections to OCR regions, without reference answers."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.layout import route_document


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('layout', type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--document-id', action='append')
    a = p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a new output manifest')
    source = json.loads(a.layout.read_text(encoding='utf-8'))
    documents = [route_document(d) for d in source['documents']
                 if not a.document_id or d['document_id'] in a.document_id]
    manifest = dict(status='automatic_layout_regions', layout_method='PP-DocLayoutV3_whole_image',
                    layout_source=str(a.layout), layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(),
                    reference_annotations_used=False, documents=documents)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(dict(documents=len(documents), regions=sum(len(d['regions']) for d in documents))))


if __name__ == '__main__':
    main()
