"""Convert explicit OCR tables to a local candidate pool; standard-library only."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool import convert_documents


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='JSON with documents/tables/raw')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--catalog', type=Path, default=ROOT / 'schemas/crf-template-fields.json')
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding='utf-8-sig'))
    catalog = json.loads(args.catalog.read_text(encoding='utf-8-sig'))
    package = convert_documents(data['documents'], catalog, case_id=data.get('case_id'))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(package, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(package['summary']))
    print('Candidate pool saved; no automatic clinical verification.')


if __name__ == '__main__':
    main()
