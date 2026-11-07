"""Reparse selected saved OCR tables without running or changing model output.

The region manifest selects exactly one observation of each region. Headers can
be declared with header_rows; values are never repaired from reference answers.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool import convert_documents


def merge_saved_runs(spec, runs, selection=None):
    """Select saved table/text regions; reject ambiguous runs and source mismatch."""
    requested = {(d['document_id'], r['region_id']): r for d in spec['documents'] for r in d['regions']}
    if len(requested) != sum(len(d['regions']) for d in spec['documents']):
        raise ValueError('Duplicate requested document/region')
    if len({rid for did, rid in requested}) != len(requested):
        raise ValueError('Region IDs must be unique across documents for raw/crop provenance')
    selected, sources, measurements, origins = {}, {}, [], {}
    for run in runs:
        envelope = json.loads((run / 'ocr-tables.json').read_text(encoding='utf-8'))
        runtime = {m['region_id']: m for m in json.loads((run / 'measurements.json').read_text(encoding='utf-8'))}
        for doc in envelope['documents']:
            did = doc['document_id']
            for task, collection in [('table', 'tables'), ('text', 'text_regions')]:
                for region in doc.get(collection, []):
                    rid = region['table_id']
                    pair = (did, rid)
                    if pair not in requested:
                        continue
                    if selection is not None and str(run).replace('\\', '/') != selection.get(rid, '').replace('\\', '/'):
                        continue
                    if pair in selected:
                        raise ValueError(f'Ambiguous repeated region: {pair}')
                    if requested[pair].get('task', 'table') != task:
                        raise ValueError('Requested task disagrees with saved region')
                    if not doc.get('input_sha256'):
                        raise ValueError('Saved source image hash is required')
                    if did in sources and sources[did]['input_sha256'] != doc['input_sha256']:
                        raise ValueError('Document ID refers to different source images')
                    sources[did] = {k: v for k, v in doc.items() if k not in ('tables', 'text_regions')}
                    result = copy.deepcopy(region)
                    if requested[pair].get('header_rows'):
                        result['header_rows'] = requested[pair]['header_rows']
                    result['context'] = {**result.get('context', {}), **requested[pair].get('context', {})}
                    result['ocr_run_origin'] = str(run)
                    selected[pair] = (collection, result)
                    origins[rid] = run
                    measurements.append({**runtime[rid], 'run_origin': str(run)})
    missing = set(requested) - set(selected)
    if missing:
        raise ValueError(f'Missing raw OCR for selected regions: {sorted(missing)}')
    documents = []
    for doc in spec['documents']:
        did = doc['document_id']
        if doc.get('input_path') and doc['input_path'] != sources[did].get('input_path'):
            raise ValueError('Requested source path differs from saved source')
        result = {**sources[did], **{k: v for k, v in doc.items() if k != 'regions'}, 'tables': [], 'text_regions': []}
        for region in doc['regions']:
            collection, saved = selected[did, region['region_id']]
            result[collection].append(saved)
        documents.append(result)
    return documents, measurements, origins


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--run', required=True, action='append', type=Path)
    parser.add_argument('--selection', type=Path, help='Optional region_id to exact source-run path mapping')
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Use a fresh output directory')
    spec = json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    selection = json.loads(args.selection.read_text(encoding='utf-8-sig')) if args.selection else None
    documents, measurements, origins = merge_saved_runs(spec, args.run, selection)
    catalog = json.loads((ROOT / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
    pool = convert_documents(documents, catalog)
    args.output.mkdir(parents=True)
    for subdir in ('crops', 'raw'):
        (args.output / subdir).mkdir()
    for rid, origin in origins.items():
        for subdir, suffix in [('crops', '.png'), ('raw', '.txt')]:
            source = origin / subdir / (rid + suffix)
            if source.exists():
                shutil.copy2(source, args.output / subdir / source.name)
    outputs = {'ocr-tables.json': {'documents': documents}, 'candidate-pool.json': pool,
               'measurements.json': measurements,
               'provenance.json': {'source_runs': [str(r) for r in args.run],
                                   'selection': selection,
                                   'manifest_sha256': hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
                                   'method': 'saved_raw_ocr_reparsed', 'values_modified': False,
                                   'region_origins': {rid: str(run) for rid, run in origins.items()}}}
    for name, data in outputs.items():
        (args.output / name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(pool['summary']))


if __name__ == '__main__':
    main()
