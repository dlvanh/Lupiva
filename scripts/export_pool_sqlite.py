"""Export a candidate pool into relational local tables, without approving data."""
import argparse
import json
from pathlib import Path
import sqlite3


def export_pool(package, target):
    if target.exists():
        raise FileExistsError('Use a new database path')
    target.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(target)
    try:
        db.execute('PRAGMA foreign_keys = ON')
        db.executescript('''
            CREATE TABLE package_metadata (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
            CREATE TABLE catalog_fields (field_id TEXT PRIMARY KEY, label TEXT NOT NULL,
                extraction_status TEXT NOT NULL, attributes_json TEXT NOT NULL);
            CREATE TABLE documents (document_id TEXT PRIMARY KEY, attributes_json TEXT NOT NULL);
            CREATE TABLE evidence (evidence_id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents,
                table_id TEXT NOT NULL, row_index INTEGER NOT NULL, result_column INTEGER,
                attributes_json TEXT NOT NULL);
            CREATE TABLE observations (observation_id TEXT PRIMARY KEY,
                field_id TEXT NOT NULL REFERENCES catalog_fields,
                document_id TEXT NOT NULL REFERENCES documents,
                component TEXT NOT NULL, numeric_value TEXT, comparator TEXT,
                qualitative_value TEXT, pattern_raw TEXT, grade_raw TEXT, symbolic_value TEXT,
                result_raw TEXT NOT NULL, unit_raw TEXT, panel TEXT, specimen TEXT,
                source_date TEXT, date_type TEXT, extraction_status TEXT NOT NULL,
                validation_status TEXT NOT NULL, review_status TEXT NOT NULL CHECK(review_status = 'pending'),
                eligible_for_verified_pool INTEGER NOT NULL CHECK(eligible_for_verified_pool = 0),
                attributes_json TEXT NOT NULL);
            CREATE TABLE observation_evidence (observation_id TEXT NOT NULL REFERENCES observations,
                evidence_id TEXT NOT NULL REFERENCES evidence, PRIMARY KEY(observation_id, evidence_id));
            CREATE TABLE issues (issue_id INTEGER PRIMARY KEY, document_id TEXT REFERENCES documents,
                reason TEXT NOT NULL, attributes_json TEXT NOT NULL);
            CREATE TABLE metadata_candidates (candidate_id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES documents, metadata_key TEXT NOT NULL,
                value_json TEXT, review_status TEXT NOT NULL CHECK(review_status = 'pending'),
                eligible_for_verified_pool INTEGER NOT NULL CHECK(eligible_for_verified_pool = 0),
                attributes_json TEXT NOT NULL);
            CREATE TABLE metadata_evidence (candidate_id TEXT NOT NULL REFERENCES metadata_candidates,
                evidence_id TEXT NOT NULL REFERENCES evidence, PRIMARY KEY(candidate_id, evidence_id));
            CREATE INDEX observations_field_document ON observations(field_id, document_id);
            CREATE TABLE specimen_candidates(sample_candidate_id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL REFERENCES documents,sample_type TEXT NOT NULL,
                checkbox_state TEXT NOT NULL,collection_date TEXT,collection_time TEXT,
                amount_numeric TEXT,amount_unit_raw TEXT,
                review_status TEXT NOT NULL CHECK(review_status='pending'),
                eligible_for_verified_pool INTEGER NOT NULL CHECK(eligible_for_verified_pool=0),attributes_json TEXT NOT NULL);
            CREATE TABLE specimen_evidence(sample_candidate_id TEXT NOT NULL REFERENCES specimen_candidates,
                evidence_id TEXT NOT NULL REFERENCES evidence,PRIMARY KEY(sample_candidate_id,evidence_id));
        ''')
        encode = lambda value: json.dumps(value, ensure_ascii=False)
        with db:
            for key, value in package.items():
                if key not in ('fields', 'source_documents', 'observations', 'metadata_candidates', 'evidence', 'issues','specimen_candidates'):
                    db.execute('INSERT INTO package_metadata VALUES (?,?)', (key, encode(value)))
            for fid, field in package['fields'].items():
                db.execute('INSERT INTO catalog_fields VALUES (?,?,?,?)',
                           (fid, field['label'], field['extraction_status'], encode(field)))
            for doc in package['source_documents']:
                db.execute('INSERT INTO documents VALUES (?,?)', (doc['document_id'], encode(doc)))
            for ev in package['evidence']:
                db.execute('INSERT INTO evidence VALUES (?,?,?,?,?,?)',
                           (ev['evidence_id'], ev['document_id'], ev['table_id'], ev['row_index_0based'],
                            ev.get('result_column_0based'), encode(ev)))
            columns = ['observation_id', 'field_id', 'document_id', 'component', 'numeric_value', 'comparator',
                       'qualitative_value', 'pattern_raw', 'grade_raw', 'symbolic_value', 'result_raw', 'unit_raw',
                       'panel', 'specimen', 'source_date', 'date_type', 'extraction_status', 'validation_status',
                       'review_status', 'eligible_for_verified_pool']
            sql = 'INSERT INTO observations VALUES (' + ','.join('?' for _ in range(len(columns)+1)) + ')'
            for obs in package['observations']:
                db.execute(sql, [obs.get(k) for k in columns] + [encode(obs)])
                db.executemany('INSERT INTO observation_evidence VALUES (?,?)',
                               [(obs['observation_id'], eid) for eid in obs['evidence_ids']])
            for item in package.get('metadata_candidates', []):
                db.execute('INSERT INTO metadata_candidates VALUES (?,?,?,?,?,?,?)',
                           (item['candidate_id'], item['document_id'], item['key'], encode(item['value']),
                            item['review_status'], item['eligible_for_verified_pool'], encode(item)))
                db.executemany('INSERT INTO metadata_evidence VALUES (?,?)',
                               [(item['candidate_id'], eid) for eid in item['evidence_ids']])
            for issue in package['issues']:
                db.execute('INSERT INTO issues(document_id, reason, attributes_json) VALUES (?,?,?)',
                           (issue.get('document_id'), issue['reason'], encode(issue)))
            for sample in package.get('specimen_candidates',[]):
                db.execute('INSERT INTO specimen_candidates VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                    (sample['sample_candidate_id'],sample['document_id'],sample['sample_type'],sample['checkbox_state'],
                     sample['collection_datetime']['date'],sample['collection_datetime']['time'],
                     sample['amount']['numeric_value'],sample['amount']['unit_raw'],sample['review_status'],
                     sample['eligible_for_verified_pool'],encode(sample)))
                db.executemany('INSERT INTO specimen_evidence VALUES(?,?)',
                    [(sample['sample_candidate_id'],eid) for eid in sample['evidence_ids']])
            if db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Broken database evidence relation')
    finally:
        db.close()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('pool', type=Path)
    p.add_argument('--output', required=True, type=Path)
    args = p.parse_args()
    package = json.loads(args.pool.read_text(encoding='utf-8-sig'))
    export_pool(package, args.output)
    print(f"Saved {len(package['fields'])} catalog rows and {len(package['observations'])} candidate observations. No data approved.")


if __name__ == '__main__':
    main()
