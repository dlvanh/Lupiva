"""Local, explicitly provisional evaluation and lineage audit of an auto run."""
import argparse
from collections import Counter
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scripts.compare_pool_fields import compare
from scripts.compare_pool_metadata import compare_metadata
from registry_pool.specimens import evidence_region_id


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    if path.exists():
        raise FileExistsError('Evaluation reports are immutable; choose a new run')
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def unresolved_findings(actual,exact):
    """Report observed failures, never a fixed narrative from an older run."""
    findings=[]
    for category,flag,note in [
        ('legend_symbol_ocr','unresolved_class_symbol','Source class symbol could not be reconciled with its legend.'),
        ('unparsed_result','unparsed_result','A candidate result has no parsed typed value.'),
        ('unreadable_result','unreadable_result','A source result remains unreadable.'),
    ]:
        ids=[o['observation_id'] for o in actual if flag in o.get('flags',[]) or
             (category=='unparsed_result' and o.get('result_type')=='unparsed')]
        if ids:
            findings.append(dict(category=category,note=note,count=len(ids),observation_ids=ids))
    missing=exact['expected_count']-exact['matched_count']
    extra=exact['predicted_count']-exact['matched_count']
    if missing or extra:
        findings.append(dict(category='scoped_tuple_mismatch',unmatched_expected_count=missing,
            unmatched_predicted_count=extra,note='See field-comparison.json for missing, extra or differing tuples.'))
    return findings


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('run', type=Path)
    p.add_argument('--reference-dir', type=Path, default=ROOT/'examples/ocr-reference-draft')
    p.add_argument('--attempt-run', action='append', required=True, type=Path)
    a = p.parse_args()
    pool = read(a.run/'candidate-pool.json')
    envelope = read(a.run/'ocr-tables.json')
    provenance = read(a.run/'provenance.json')
    ref = read(a.reference_dir/'development-field-reference.json')
    metadata_ref = read(a.reference_dir/'development-metadata-reference.json')
    adm_ref = read(a.reference_dir/'development-adm-reference.json')
    exact = compare(pool, ref)
    metadata = compare_metadata(pool, metadata_ref)
    adm = compare(pool, adm_ref)
    save(a.run/'field-comparison.json', exact)
    save(a.run/'metadata-comparison.json', metadata)
    save(a.run/'adm-comparison.json', adm)
    # A diagnostic projection, clearly separate from the complete tuple score.
    # Only the intensity's interpreted class is omitted. Pattern/grade and all
    # source numbers, comparators, units, panel/component keys stay in scope.
    projected_pool, projected_ref = copy.deepcopy(pool), copy.deepcopy(ref)
    for item in projected_pool['observations'] + projected_ref['observations']:
        if item.get('component') == 'intensity':
            item.pop('qualitative_value', None)
    projected = compare(projected_pool, projected_ref)
    scope = {tuple(s) for s in ref['scope']}
    actual = [o for o in pool['observations'] if (o['document_id'],o['field_id'],o['component']) in scope]
    expected_keys = Counter((o['document_id'],o['field_id'],o['component']) for o in ref['observations'])
    actual_keys = Counter((o['document_id'],o['field_id'],o['component']) for o in actual)
    groups = {}
    for did in sorted({o['document_id'] for o in ref['observations']}):
        er = copy.deepcopy(ref)
        er['scope'] = [s for s in ref['scope'] if s[0]==did]
        er['observations'] = [o for o in ref['observations'] if o['document_id']==did]
        r = compare(pool,er)
        groups[did] = {k:r[k] for k in ('expected_count','predicted_count','matched_count')}
    attempts = []
    for run in a.attempt_run:
        info, measurements = read(run/'run.json'), read(run/'measurements.json')
        attempts.append(dict(run=run.as_posix(), regions=len(measurements),
            load_seconds=info['load_seconds'], latency_seconds=sum(m['latency_seconds'] for m in measurements),
            truncated_regions=[m['region_id'] for m in measurements if m.get('truncated')],
            failed_regions=[m['region_id'] for m in measurements if m['status']!='ok'],
            peak_allocated_mib=max(m['peak_allocated_mib'] for m in measurements),
            peak_reserved_mib=max(m['peak_reserved_mib'] for m in measurements)))
    layout = read(provenance['layout_source'])
    layout_metrics = read(Path(provenance['layout_source']).parent/'measurements.json')
    report = dict(evaluation_report_version='local-scoped-evaluation-2',assessment_type='assistant_self_assessment',
        assessment_label='trợ lý tự đánh giá, chưa được người phụ trách xác nhận',
        human_verified=False, holdout=False, calibration_set_reused_for_development=True,
        source='pre-OCR assistant visual transcripts plus local review of disputed source images/crops',
        exact_scoped_tuples={k:exact[k] for k in ('expected_count','predicted_count','matched_count','precision','recall')},
        projected_tuples_without_intensity_class={k:projected[k] for k in ('expected_count','predicted_count','matched_count','precision','recall')},
        projection_note='Diagnostic only: excludes interpreted intensity class, retains every other tuple component. Not whole-page OCR accuracy.',
        candidate_key_coverage=dict(expected=sum(expected_keys.values()),mapped=sum((expected_keys & actual_keys).values())),
        by_document=groups,
        flags=Counter(f for o in actual for f in o['flags']),
        source_corroborated_class_variants=sum(o.get('class_interpretation_method')=='source_legend_round_symbol_range_agreement' for o in actual),
        class_variant_note='Derived from same-document legend plus agreeing intensity range; raw symbols retained, flagged for review. This is postprocessing, not a new OCR reading.',
        metadata={k:metadata[k] for k in ('expected_count','predicted_count','matched_count','observations_with_source_date')},
        metadata_date_error_events=len(metadata['date_propagation_errors']),
        adm={k:adm[k] for k in ('expected_count','predicted_count','matched_count')},
        layout=dict(images=len(layout['documents']),table_detections=sum(d['label']=='table' for doc in layout['documents'] for d in doc['detections']),
            detector_latency_seconds=sum(m['total_seconds'] for m in layout_metrics),
            note='Coverage of reference groups is measured downstream; no independent detector IoU labels or full-page CER/WER.'),
        performance=dict(attempts=attempts,attempted_regions=sum(r['regions'] for r in attempts),
            total_ocr_latency_seconds=sum(r['latency_seconds'] for r in attempts),
            total_ocr_load_seconds=sum(r['load_seconds'] for r in attempts),
            note='All attempts, superseded crops and retries included; excludes download, crop preparation and report generation. Single local development sample.'),
        unresolved=unresolved_findings(actual,exact),
        coverage_limits=[dict(category='routing_scope',
            note='Charts, checkbox forms, medication/clinical prose and unscoped values remain unvalidated.')])
    save(a.run/'self-assessment.json',report)
    # Validate every copied raw/crop, original input and evidence link locally.
    failures, sources, raw_count, crop_count = [], [], 0, 0
    region_map = {}
    source_hashes={d['document_id']:d['input_sha256'] for d in envelope['documents']}
    for doc in envelope['documents']:
        if sha(ROOT/doc['input_path']) != doc['input_sha256']:
            failures.append('source_hash:'+doc['document_id'])
        sources.append(doc['document_id'])
        for region in doc['tables']+doc['text_regions']:
            rid = region['table_id']
            region_map[(doc['document_id'],rid)] = region
            raw_count += 1
            if (a.run/'raw'/(rid+'.txt')).read_text(encoding='utf-8') != region['raw']:
                failures.append('raw:'+rid)
            crop_count += 1
            from PIL import Image
            with Image.open(a.run/'crops'/(rid+'.png')) as image:
                image.verify()
            derivation = region.get('derivation')
            if derivation:
                parent = next(r for r in doc['tables'] if r['table_id']==derivation['parent_table_id'])
                if hashlib.sha256(parent['raw'].encode()).hexdigest() != derivation['parent_raw_sha256']:
                    failures.append('derivation:'+rid)
    for item in pool['evidence']:
        if item.get('input_sha256')!=source_hashes[item['document_id']]:
            failures.append('evidence_source:'+item['evidence_id'])
        rid = evidence_region_id(item)
        region = region_map[(item['document_id'],rid)]
        if hashlib.sha256(region['raw'].encode()).hexdigest() != item['table_sha256']:
            failures.append('evidence_raw:'+item['evidence_id'])
        if item.get('evidence_kind')=='metadata':
            l,r = item['raw_span_0based']
            if region['raw'][l:r] != item['value_raw']:
                failures.append('metadata_span:'+item['evidence_id'])
    evidence = {e['evidence_id']:e for e in pool['evidence']}
    for obs in pool['observations']:
        for legend in obs.get('class_interpretation_evidence',[]):
            source=region_map.get((obs['document_id'],legend['region_id']))
            if (not source or source.get('purpose')!='source_legend'
                    or hashlib.sha256(source['raw'].encode()).hexdigest()!=legend['raw_sha256']):
                failures.append('class_legend_lineage:'+obs['observation_id'])
    for item in pool['observations']+pool.get('metadata_candidates',[]):
        if item['review_status']!='pending' or item['eligible_for_verified_pool']:
            failures.append('review_status')
        for eid in item['evidence_ids']+item.get('date_evidence_ids',[]):
            if eid not in evidence or evidence[eid]['document_id']!=item['document_id']:
                failures.append('evidence_link')
    for run in a.attempt_run:
        info=read(run/'run.json')
        if sha(info['manifest_path'])!=info['manifest_sha256']:
            failures.append('manifest_changed:'+str(run))
    reference_sources={entry['path']:entry['sha256'] for reference in (metadata_ref,adm_ref)
                       for entry in reference.get('sources',[])}
    for entry in read(a.reference_dir/'manifest.json')['artifacts']:
        reference_sources[entry['path']]=entry['sha256']
    for path,expected in reference_sources.items():
        if sha(ROOT/path)!=expected:
            failures.append('reference_changed:'+path)
    previous = read(ROOT/'research/session-checkpoints/session-20261106.json')
    preserved=[f for f in previous['files'] if f['path'].startswith('research/ocr-pool/run-20261106-integrated-02/')]
    for entry in preserved:
        if sha(ROOT/entry['path'])!=entry['sha256']:
            failures.append('prior_artifact_changed:'+entry['path'])
    sqlite_path=a.run/'candidate-pool.sqlite'
    if not sqlite_path.is_file():
        raise FileNotFoundError('Export the candidate SQLite database before evaluation')
    db=sqlite3.connect(sqlite_path)
    integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
    foreign_keys=db.execute('PRAGMA foreign_key_check').fetchall()
    db.close()
    if integrity!='ok' or foreign_keys:
        failures.append('sqlite')
    save(a.run/'artifact-validation.json',dict(status='pass' if not failures else 'fail',failures=failures,
        input_images=len(sources),raw_regions=raw_count,crop_regions=crop_count,
        evidence_records=len(evidence),observations=len(pool['observations']),
        preserved_prior_artifacts=len(preserved),sqlite_integrity=integrity,foreign_key_errors=foreign_keys,
        checked_reference_artifacts=len(reference_sources),
        identity_status='unconfirmed',clinical_verification=False))
    print(json.dumps(dict(exact=report['exact_scoped_tuples'],projection=report['projected_tuples_without_intensity_class'],
        metadata=report['metadata'],audit_failures=failures),ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__=='__main__':
    main()
