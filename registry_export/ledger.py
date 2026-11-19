"""Persistent per-project REDCap instance allocation, separate from medical SQL."""
import sqlite3


class InstanceLedger:
    def __init__(self,path,namespace):
        if not namespace.strip():raise ValueError('Explicit REDCap project namespace required')
        self.namespace=namespace
        self.db=sqlite3.connect(path)
        self.db.executescript('''
CREATE TABLE IF NOT EXISTS instances(project TEXT,record_id TEXT,form TEXT,entity_key TEXT,instance INTEGER,
 PRIMARY KEY(project,record_id,form,entity_key),UNIQUE(project,record_id,form,instance));
CREATE TABLE IF NOT EXISTS record_owners(project TEXT,record_id TEXT,case_id TEXT,
 PRIMARY KEY(project,record_id),UNIQUE(project,case_id));
''')
        self.db.commit()

    def owner(self,record_id,case_id):
        self.db.execute('INSERT OR IGNORE INTO record_owners VALUES(?,?,?)',(self.namespace,record_id,case_id))
        found=self.db.execute('SELECT case_id FROM record_owners WHERE project=? AND record_id=?',
                             (self.namespace,record_id)).fetchone()
        if not found or found[0]!=case_id:raise ValueError('REDCap record ID ownership changed')

    def allocate(self,record_id,form,key):
        args=(self.namespace,record_id,form,key)
        row=self.db.execute('SELECT instance FROM instances WHERE project=? AND record_id=? AND form=? AND entity_key=?',args).fetchone()
        if row:return row[0]
        instance=self.db.execute('SELECT COALESCE(MAX(instance),0)+1 FROM instances WHERE project=? AND record_id=? AND form=?',args[:3]).fetchone()[0]
        self.db.execute('INSERT INTO instances VALUES(?,?,?,?,?)',(*args,instance))
        return instance

    def absent(self,active,record_ids=None):
        return [dict(record_id=r,form=f,entity_key=k,repeat_instance=n,action='reconcile_in_REDCap; no_delete_performed')
            for r,f,k,n in self.db.execute('SELECT record_id,form,entity_key,instance FROM instances WHERE project=?',(self.namespace,))
            if (record_ids is None or r in record_ids) and (r,f,k) not in active]

    def close(self):self.db.close()
