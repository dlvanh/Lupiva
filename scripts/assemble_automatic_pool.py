"""Assemble automatic OCR, explicit source context and a fresh candidate pool.

Only accepts saved automatic runs. Development crop manifests and reference
answers are not read. Explicit geometry refinements supersede parent table ROIs.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.automatic import adapt_document, merge_region, select_metadata_replacement, select_row_retries, select_focused_metadata
from ocr_pool import convert_documents


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--layout', required=True, type=Path)
    p.add_argument('--run', required=True, action='append', type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--date-order', choices=['DMY'])
    a = p.parse_args()
    if a.output.exists():
        raise FileExistsError('Use a fresh output directory')
    layout = json.loads(a.layout.read_text(encoding='utf-8'))
    docs = {d['document_id']: dict(document_id=d['document_id'], input_path=d['input_path'],
                                   input_sha256=d['input_sha256'], source_kind='actual_local_automatic_ocr',
                                   tables=[], text_regions=[], layout_detections=d['detections']) for d in layout['documents']}
    origins, measurements, superseded, metadata_decisions = {}, [], [], []
    focused_jobs = []
    for run in a.run:
        run_info = json.loads((run / 'run.json').read_text(encoding='utf-8'))
        if not run_info.get('layout_method', '').startswith('PP-DocLayoutV3'):
            raise ValueError('Only automatically selected OCR regions are accepted')
        if run_info.get('layout_manifest_sha256') != hashlib.sha256(a.layout.read_bytes()).hexdigest():
            raise ValueError('OCR run belongs to another layout manifest')
        saved = json.loads((run / 'ocr-tables.json').read_text(encoding='utf-8'))
        for doc in saved['documents']:
            target = docs[doc['document_id']]
            if target['input_sha256'] != doc['input_sha256']:
                raise ValueError('Source hash mismatch')
            for collection in ('tables', 'text_regions'):
                for region in doc.get(collection, []):
                    rid = region['table_id']
                    if rid in origins:
                        raise ValueError('Ambiguous repeated OCR region')
                    parent = merge_region(target, region, collection)
                    if parent:
                        superseded.append(dict(document_id=doc['document_id'], region_id=parent,
                                               replacement=rid, source_run=origins[parent].as_posix()))
                    origins[rid] = run
            replacement_text = doc.get('text_regions', [])
            if doc.get('focused_metadata_keys'):
                focused_jobs.append((doc['document_id'],[r['table_id'] for r in replacement_text],doc['focused_metadata_keys']))
            if doc.get('metadata_supersedes'):
                decision = select_metadata_replacement(target,replacement_text,date_order=a.date_order)
                metadata_decisions.append(decision)
                if decision['accepted']:
                    for rid in decision['old_region_ids']:
                        superseded.append(dict(document_id=doc['document_id'],region_id=rid,
                            replacement=decision['new_region_ids'],source_run=origins[rid].as_posix()))
        measurements.extend({**m, 'run_origin': run.as_posix()} for m in json.loads((run / 'measurements.json').read_text(encoding='utf-8')))
    documents = [adapt_document(doc, date_order=a.date_order) for doc in docs.values()]
    focused_decisions = [dict(document_id=did, **select_focused_metadata(
        next(d for d in documents if d['document_id'] == did), ids, keys)) for did, ids, keys in focused_jobs]
    combined_decisions = []
    for decision in metadata_decisions:
        if decision['accepted']:
            continue
        focused = [d for d in focused_decisions if d['document_id'] == decision['document_id'] and d['accepted']]
        if not focused:
            continue
        target = next(d for d in documents if d['document_id'] == decision['document_id'])
        prior_replacements = [r for r in target['text_regions'] if r['table_id'] in decision['new_region_ids']]
        if not prior_replacements or any(r.get('region', {}).get('layout', {}).get('method') !=
                'individual_detector_metadata_line' for r in prior_replacements):
            continue
        ids = set(decision['new_region_ids']) | {rid for d in focused for rid in d['new_region_ids']}
        replacements = [r for r in target['text_regions'] if r['table_id'] in ids]
        combined = select_metadata_replacement(target,replacements,date_order=a.date_order,reconsider=True)
        combined['method'] = 'complete_detector_lines_plus_focused_identifier_band'
        combined_decisions.append(combined)
        if combined['accepted']:
            for focus in focused:
                select_focused_metadata(target,focus['new_region_ids'],focus['keys'])
    catalog = json.loads((ROOT / 'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
    row_decisions = [dict(document_id=doc['document_id'], **decision) for doc in documents
                     for decision in select_row_retries(doc, catalog)]
    pool = convert_documents(documents, catalog)
    a.output.mkdir(parents=True)
    (a.output / 'crops').mkdir()
    (a.output / 'raw').mkdir()
    for doc in documents:
        for region in doc['tables'] + doc['text_regions']:
            rid = region['table_id']
            parent = region.get('crop_source_id', rid)
            for subdir, suffix in [('crops', '.png'), ('raw', '.txt')]:
                source = origins[parent] / subdir / (parent + suffix)
                if subdir == 'raw' and rid != parent:
                    (a.output / subdir / (rid + suffix)).write_text(region['raw'], encoding='utf-8')
                else:
                    shutil.copy2(source, a.output / subdir / (rid + suffix))
    outputs = {'ocr-tables.json': {'documents': documents}, 'candidate-pool.json': pool,
               'measurements.json': measurements,
               'provenance.json': dict(method='whole_image_layout_and_saved_OCR',
                   source_runs=[r.as_posix() for r in a.run], layout_source=a.layout.as_posix(),
                   layout_sha256=hashlib.sha256(a.layout.read_bytes()).hexdigest(), superseded_regions=superseded,
                   metadata_replacement_decisions=metadata_decisions,
                   row_retry_decisions=row_decisions,
                   focused_metadata_decisions=focused_decisions,
                   combined_metadata_decisions=combined_decisions,
                   region_replacement_rejections=[dict(document_id=doc['document_id'],region_id=r['table_id'],
                       parent_region_id=r.get('region',{}).get('layout',{}).get('original_region_id'),
                       reason=r['replacement_rejected_reason']) for doc in documents
                       for r in doc['tables']+doc['text_regions'] if r.get('replacement_rejected_reason')],
                   reference_annotations_used=False, reference_values_used=False, date_order=a.date_order)}
    for name, value in outputs.items():
        (a.output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(pool['summary']))


if __name__ == '__main__':
    main()
