"""Exact scoped metadata comparison and source-date propagation checks."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path


def compare_metadata(package, reference):
    scope = {tuple(pair) for pair in reference['scope']}
    expected = Counter((c['document_id'], c['key'], c['value']) for c in reference['candidates'])
    if any((did, key) not in scope for did, key, value in expected):
        raise ValueError('Reference candidate outside declared scope')
    actual = Counter((c['document_id'], c['key'], c['value']) for c in package.get('metadata_candidates', [])
                     if (c['document_id'], c['key']) in scope)
    evidence = {e['evidence_id']: e for e in package['evidence']}
    expected_dates = {(c['document_id'], c['key']): c['value'] for c in reference['candidates']
                      if c['key'] in ('sample_date', 'measurement_date')}
    date_errors, dated = [], 0
    for obs in package['observations']:
        did = obs['document_id']
        if did not in {d for d, _ in scope}:
            continue
        role = 'measurement_date' if (did, 'measurement_date') in expected_dates else 'sample_date'
        value = expected_dates.get((did, role))
        dated += bool(obs.get('source_date'))
        expected_pair = (value, role if value else None)
        if (obs.get('source_date'), obs.get('date_type')) != expected_pair:
            date_errors.append(dict(observation_id=obs['observation_id'], reason='source_date_mismatch'))
        if value and (not obs.get('date_evidence_ids') or any(
                eid not in evidence or evidence[eid]['document_id'] != did or evidence[eid].get('evidence_kind') != 'metadata'
                for eid in obs.get('date_evidence_ids', []))):
            date_errors.append(dict(observation_id=obs['observation_id'], reason='missing_or_wrong_date_evidence'))
    return dict(reference_status=reference['status'], provisional=reference['status'] != 'human_verified',
                expected_count=sum(expected.values()), predicted_count=sum(actual.values()),
                matched_count=sum((expected & actual).values()),
                missing_tuples=list((expected - actual).elements()), extra_or_wrong_tuples=list((actual - expected).elements()),
                candidates_with_flags=[c['candidate_id'] for c in package.get('metadata_candidates', []) if c['flags']],
                observations_with_source_date=dated, date_propagation_errors=date_errors,
                note='Development exact comparison against unreviewed transcripts; not independent clinical validation.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pool', type=Path)
    parser.add_argument('reference', type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    reference = json.loads(args.reference.read_text(encoding='utf-8'))
    root = Path(__file__).resolve().parents[1]
    for source in reference.get('sources', []):
        if hashlib.sha256((root / source['path']).read_bytes()).hexdigest() != source['sha256']:
            raise ValueError('Reference transcript changed since metadata reference was built')
    report = compare_metadata(json.loads(args.pool.read_text(encoding='utf-8')), reference)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('provisional', 'expected_count', 'predicted_count', 'matched_count',
                                            'observations_with_source_date', 'date_propagation_errors')}))


if __name__ == '__main__':
    main()
