"""Transactional local registry. Immutable OCR imports, explicit later reviews."""
import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime,timezone

from .dictionary import digest
from .exchange import entity_id,verify_bundle,clean
from .schema import validate_package


def encode(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)


DDL='''
CREATE TABLE IF NOT EXISTS dictionaries(version TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS packages(package_id TEXT NOT NULL,revision INTEGER NOT NULL,sha256 TEXT NOT NULL,
 dictionary_version TEXT NOT NULL REFERENCES dictionaries(version),payload TEXT NOT NULL,
 supersedes_id TEXT,supersedes_revision INTEGER,PRIMARY KEY(package_id,revision),
 FOREIGN KEY(supersedes_id,supersedes_revision) REFERENCES packages(package_id,revision));
CREATE TABLE IF NOT EXISTS documents(document_id TEXT PRIMARY KEY,input_sha256 TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS package_documents(package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 document_id TEXT NOT NULL REFERENCES documents,source_document_id TEXT NOT NULL,source_key TEXT NOT NULL,
 PRIMARY KEY(package_id,revision,document_id),FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS evidence(evidence_id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observations(observation_id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents,
 field_id TEXT NOT NULL,component TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observation_evidence(observation_id TEXT NOT NULL REFERENCES observations,
 evidence_id TEXT NOT NULL REFERENCES evidence,PRIMARY KEY(observation_id,evidence_id));
CREATE TABLE IF NOT EXISTS package_observations(package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 observation_id TEXT NOT NULL REFERENCES observations,source_observation_id TEXT NOT NULL,
 PRIMARY KEY(package_id,revision,observation_id),FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS metadata_candidates(candidate_id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS package_candidates(package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 candidate_id TEXT NOT NULL REFERENCES metadata_candidates,source_candidate_id TEXT NOT NULL,
 PRIMARY KEY(package_id,revision,candidate_id),FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS field_states(package_id TEXT NOT NULL,revision INTEGER NOT NULL,field_id TEXT NOT NULL,payload TEXT NOT NULL,
 PRIMARY KEY(package_id,revision,field_id),FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS specimen_candidates(sample_id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS specimen_evidence(sample_id TEXT NOT NULL REFERENCES specimen_candidates,
 evidence_id TEXT NOT NULL REFERENCES evidence,PRIMARY KEY(sample_id,evidence_id));
CREATE TABLE IF NOT EXISTS package_specimens(package_id TEXT NOT NULL,revision INTEGER NOT NULL,
 sample_id TEXT NOT NULL REFERENCES specimen_candidates,source_sample_candidate_id TEXT NOT NULL,
 PRIMARY KEY(package_id,revision,sample_id),FOREIGN KEY(package_id,revision) REFERENCES packages);
CREATE TABLE IF NOT EXISTS audit_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,
 created_at_utc TEXT NOT NULL,previous_hash TEXT,event_hash TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS observations_field ON observations(field_id,document_id);
'''


class Registry:
    @contextmanager
    def import_transaction(self):
        """Join a patient intake transaction without committing its outer scope."""
        if self.db.in_transaction:
            name='package_import'
            self.db.execute('SAVEPOINT '+name)
            try:
                yield
                self.db.execute('RELEASE '+name)
            except BaseException:
                self.db.execute('ROLLBACK TO '+name)
                self.db.execute('RELEASE '+name)
                raise
        else:
            with self.db:yield

    def __init__(self,path,*,read_only=False):
        self.db=(sqlite3.connect(Path(path).resolve().as_uri()+'?mode=ro',uri=True,timeout=30)
                 if read_only else sqlite3.connect(path,timeout=30))
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        if read_only:
            self.db.execute('PRAGMA query_only=ON')
            return
        self.db.executescript(DDL)
        # These are immutable source/revision records; later acceptance and
        # corrections belong in separate review records, never UPDATE here.
        for table in ('dictionaries','packages','documents','package_documents','evidence','observations',
                      'observation_evidence','package_observations','metadata_candidates','package_candidates','field_states','audit_events',
                      'specimen_candidates','specimen_evidence','package_specimens'):
            for operation in ('UPDATE','DELETE'):
                self.db.execute(f"CREATE TRIGGER IF NOT EXISTS immutable_{table}_{operation} BEFORE {operation} ON {table} BEGIN SELECT RAISE(ABORT,'immutable source record'); END")
        self.db.commit()

    def close(self):
        self.db.close()

    def _audit(self,kind,payload):
        previous=self.db.execute('SELECT event_hash FROM audit_events ORDER BY sequence DESC LIMIT 1').fetchone()
        event=dict(kind=kind,created_at_utc=datetime.now(timezone.utc).isoformat(),
                   previous_hash=previous[0] if previous else None,payload=payload)
        self.db.execute('INSERT INTO audit_events(kind,created_at_utc,previous_hash,event_hash,payload) VALUES(?,?,?,?,?)',
            (kind,event['created_at_utc'],event['previous_hash'],digest(event),encode(payload)))

    def _entity(self,table,key,item,identity,origin):
        body=clean(item,{origin})
        expected=entity_id({'evidence':'ev','observations':'obs','metadata_candidates':'md','specimen_candidates':'sample'}[table],item,identity,origin)
        if item[identity]!=expected:
            raise ValueError('Content-addressed entity ID differs')
        row=self.db.execute(f'SELECT payload FROM {table} WHERE {key}=?',(item[identity],)).fetchone()
        if row:
            if row[0]!=encode(body):
                raise ValueError('Immutable entity content conflict')
            return
        if table=='observations':
            self.db.execute('INSERT INTO observations VALUES(?,?,?,?,?)',
                (item[identity],item['document_id'],item['field_id'],item['component'],encode(body)))
        else:
            self.db.execute(f'INSERT INTO {table} VALUES(?,?,?)',(item[identity],item['document_id'],encode(body)))

    def import_package(self,package,dictionary):
        validate_package(package,dictionary)
        pid,revision=package['package_id'],package['revision']
        checksum=digest(package)
        with self.import_transaction():
            old=self.db.execute('SELECT sha256 FROM packages WHERE package_id=? AND revision=?',(pid,revision)).fetchone()
            if old:
                if old[0]!=checksum:
                    raise ValueError('Same package/revision has different content')
                return dict(status='already_imported',package_id=pid,revision=revision)
            latest=self.db.execute('SELECT MAX(revision) FROM packages WHERE package_id=?',(pid,)).fetchone()[0]
            if revision!=(latest or 0)+1:
                raise ValueError('Package revisions must be consecutive')
            supersedes=package['supersedes']
            if latest and supersedes!={'package_id':pid,'revision':latest}:
                raise ValueError('New revision must explicitly supersede previous revision')
            if supersedes and not self.db.execute('SELECT 1 FROM packages WHERE package_id=? AND revision=?',
                  (supersedes['package_id'],supersedes['revision'])).fetchone():
                raise ValueError('Superseded package does not exist')
            version=dictionary['dictionary_version']
            existing=self.db.execute('SELECT sha256 FROM dictionaries WHERE version=?',(version,)).fetchone()
            if existing and existing[0]!=digest(dictionary):
                raise ValueError('Dictionary version reused with different content')
            if not existing:
                self.db.execute('INSERT INTO dictionaries VALUES(?,?,?)',(version,digest(dictionary),encode(dictionary)))
            self.db.execute('INSERT INTO packages VALUES(?,?,?,?,?,?,?)',(pid,revision,checksum,version,encode(package),
                supersedes['package_id'] if supersedes else None,supersedes['revision'] if supersedes else None))
            for doc in package['documents']:
                if doc['document_id']!='doc-'+doc['input_sha256']:
                    raise ValueError('Document ID differs from image hash')
                self.db.execute('INSERT OR IGNORE INTO documents VALUES(?,?)',(doc['document_id'],doc['input_sha256']))
                self.db.execute('INSERT INTO package_documents VALUES(?,?,?,?,?)',
                    (pid,revision,doc['document_id'],doc['source_document_id'],doc['source_key']))
            for item in package['evidence']:
                self._entity('evidence','evidence_id',item,'evidence_id','source_evidence_id')
            for item in package['metadata_candidates']:
                self._entity('metadata_candidates','candidate_id',item,'candidate_id','source_candidate_id')
                self.db.execute('INSERT INTO package_candidates VALUES(?,?,?,?)',(pid,revision,item['candidate_id'],item['source_candidate_id']))
            for item in package['observations']:
                self._entity('observations','observation_id',item,'observation_id','source_observation_id')
                for eid in item['evidence_ids']:
                    self.db.execute('INSERT OR IGNORE INTO observation_evidence VALUES(?,?)',(item['observation_id'],eid))
                self.db.execute('INSERT INTO package_observations VALUES(?,?,?,?)',(pid,revision,item['observation_id'],item['source_observation_id']))
            for fid,state in package['fields'].items():
                self.db.execute('INSERT INTO field_states VALUES(?,?,?,?)',(pid,revision,fid,encode(state)))
            for sample in package.get('specimen_candidates',[]):
                self._entity('specimen_candidates','sample_id',sample,'sample_id','source_sample_candidate_id')
                self.db.execute('INSERT INTO package_specimens VALUES(?,?,?,?)',
                    (pid,revision,sample['sample_id'],sample['source_sample_candidate_id']))
                self.db.executemany('INSERT OR IGNORE INTO specimen_evidence VALUES(?,?)',
                    [(sample['sample_id'],eid) for eid in sample['evidence_ids']])
            audit_payload=dict(package_id=pid,revision=revision,sha256=checksum,
                documents=len(package['documents']),observations=len(package['observations']))
            if 'specimen_candidates' in package:
                audit_payload['specimen_candidates']=len(package['specimen_candidates'])
            self._audit('package_imported',audit_payload)
            if self.db.execute('PRAGMA foreign_key_check').fetchall():
                raise ValueError('Foreign key integrity failure')
        return dict(status='imported',package_id=pid,revision=revision,observations=len(package['observations']))

    def import_bundle(self,path,dictionary):
        return self.import_package(verify_bundle(path,dictionary),dictionary)

    def package(self,pid,revision=None):
        if revision is None:
            revision=self.db.execute('SELECT MAX(revision) FROM packages WHERE package_id=?',(pid,)).fetchone()[0]
        row=self.db.execute('SELECT payload FROM packages WHERE package_id=? AND revision=?',(pid,revision)).fetchone()
        if row is None:
            raise KeyError('Unknown package/revision')
        return json.loads(row[0])

    def integrity(self):
        previous=None
        count=0
        for row in self.db.execute('SELECT * FROM audit_events ORDER BY sequence'):
            body=dict(kind=row['kind'],created_at_utc=row['created_at_utc'],previous_hash=row['previous_hash'],payload=json.loads(row['payload']))
            if row['previous_hash']!=previous or digest(body)!=row['event_hash']:
                raise ValueError('Audit chain differs')
            previous=row['event_hash']
            count+=1
        return dict(sqlite=self.db.execute('PRAGMA integrity_check').fetchone()[0],
            foreign_key_errors=[list(r) for r in self.db.execute('PRAGMA foreign_key_check')],audit_events=count,
            packages=self.db.execute('SELECT COUNT(*) FROM packages').fetchone()[0],
            observations=self.db.execute('SELECT COUNT(*) FROM observations').fetchone()[0])
