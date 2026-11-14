"""Exports on synthetic fixtures only. No live sources or network required."""
import copy
import csv
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

from registry_pool.dictionary import digest
from registry_review import ReviewStore
from registry_review.source import candidates
from registry_export.view import snapshot
from registry_export.redcap import data_dictionary,export_data,write_csv,FORMS
from registry_export.ledger import InstanceLedger
from registry_export.mapping import build_mapping,validate_mapping
from registry_export.word import export_word
from test_registry_review import fixture,DICTIONARY
from test_source_review import fixture as source_fixture


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.path=self.root/'synthetic.sqlite';self.store=ReviewStore(self.path)
        self.p=fixture();self.store.registry.import_package(self.p,DICTIONARY)
        self.person=dict(actor='Synthetic export test operator',role='source_reviewer')
        self.case=self.store.create_case('SYNTHETIC-001',**self.person)
        self.visit=self.store.create_encounter(self.case['case_id'],label='Synthetic visit',event_date='2026-11-07',**self.person)
        self.oid=self.p['observations'][0]['observation_id'];self.did=self.p['documents'][0]['document_id']

    def tearDown(self):self.store.close();self.tmp.cleanup()

    def assign(self):
        return self.store.assign_document(self.did,case_id=self.case['case_id'],encounter_id=self.visit['encounter_id'],reason='Synthetic',**self.person)

    def accept(self,revision=1,**kwargs):
        previous=self.store.latest_review('SYNTHETIC',revision,self.oid)
        return self.store.review('SYNTHETIC',revision,self.oid,action='correct' if 'changes' in kwargs else 'accept',
            expected_review_id=previous['review_id'] if previous else None,
            expected_assignment_id=self.store.assignment(self.did)['assignment_id'],reason='Synthetic',**self.person,**kwargs)

    def snap(self):return snapshot(self.path,DICTIONARY,synthetic=True)

    def test_read_only_never_mutates_schema_bytes_or_audit_and_missing_file_not_created(self):
        before=self.path.read_bytes();audit=self.store.db.execute('SELECT count(*) FROM audit_events').fetchone()[0]
        self.snap()
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.store.db.execute('SELECT count(*) FROM audit_events').fetchone()[0],audit)
        ro=ReviewStore(self.path,read_only=True)
        try:
            with self.assertRaises(sqlite3.OperationalError):ro.db.execute('CREATE TABLE should_not_exist(x)')
        finally:ro.close()
        missing=self.root/'missing.sqlite'
        with self.assertRaises(sqlite3.OperationalError):snapshot(missing,DICTIONARY)
        self.assertFalse(missing.exists())

    def test_pending_excluded_then_accepted_dates_and_precision_preserved(self):
        self.assign();self.assertEqual(self.snap()['observations'],[])
        self.accept(changes={'numeric_value':'0.6500','comparator':'<'})
        s=self.snap();self.assertEqual(len(s['field_states'][self.case['case_id']]),261)
        self.assertEqual(sum(len(f['components']) for f in s['field_states'][self.case['case_id']].values()),377)
        self.assertEqual(s['observations'][0]['value']['numeric_value'],'0.6500')
        self.assertIsNone(s['observations'][0]['value']['source_date'])
        path=self.root/'import.csv'
        export_data(s,path,self.root/'ledger.sqlite','synthetic')
        with path.open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
        value=next(r for r in rows if r['redcap_repeat_instrument']=='pool_results')
        self.assertEqual((value['numeric_value'],value['comparator'],value['unit_raw'],value['source_date']),('0.6500','<','g/L',''))
        self.assertEqual(rows[0]['study_id'],'')
        self.assertEqual(json.loads(value['result_provenance_json'])['review_ids'],s['observations'][0]['review_ids'])

    def test_revoked_identity_removes_values_and_ledger_reports_reconciliation(self):
        identity=self.assign();self.accept();ledger=self.root/'ledger.sqlite'
        export_data(self.snap(),self.root/'before.csv',ledger,'synthetic')
        self.store.assign_document(self.did,case_id=None,expected_assignment_id=identity['assignment_id'],reason='Synthetic revoke',**self.person)
        report=export_data(self.snap(),self.root/'after.csv',ledger,'synthetic')
        self.assertEqual(report['observations'],0)
        self.assertEqual(report['reconciliation_required'][0]['entity_key'],self.oid)

    def test_conflicting_revisions_not_exported_and_dictionary_mismatch_rejected(self):
        self.assign();self.accept()
        p=fixture(revision=2);self.store.registry.import_package(p,DICTIONARY)
        self.accept(revision=2,changes={'numeric_value':'0.66'})
        self.assertEqual(self.snap()['observations'],[])
        other=copy.deepcopy(DICTIONARY);other['note']='different'
        with self.assertRaisesRegex(ValueError,'dictionary'):snapshot(self.path,other)

    def test_source_approvals_without_case_cannot_create_patient_export(self):
        path=self.root/'source-only.sqlite';store=ReviewStore(path)
        try:
            p=source_fixture();store.registry.import_package(p,DICTIONARY)
        finally:store.close()
        s=snapshot(path,DICTIONARY)
        with self.assertRaisesRegex(ValueError,'No confirmed'):export_data(s,self.root/'blocked.csv',self.root/'unused.sqlite','synthetic')
        self.assertFalse((self.root/'blocked.csv').exists())

    def test_metadata_and_specimens_require_source_approval_and_confirmed_identity(self):
        p=source_fixture();self.store.registry.import_package(p,DICTIONARY)
        decisions=[dict(candidate_type=kind,candidate_id=cid,action='approve',expected_review_id=None,
            expected_candidate_sha256=digest(item)) for (kind,cid),item in candidates(p).items()]
        self.store.record_source_batch(p['package_id'],1,decisions=decisions,request_id='SYNTHETIC',
            expected_package_sha256=digest(p),reason='Synthetic',**self.person)
        self.assertEqual(self.snap()['metadata'],[])
        did=p['documents'][0]['document_id']
        self.store.assign_document(did,case_id=self.case['case_id'],encounter_id=self.visit['encounter_id'],reason='Synthetic',**self.person)
        s=self.snap();self.assertEqual((len(s['metadata']),len(s['specimens']),len(s['observations'])),(1,3,0))
        self.assertEqual(s['metadata'][0]['value']['value'],'000123')
        self.assertTrue(all(v['case_acceptance_required'] for v in s['specimens']))
        export_data(s,self.root/'specimens.csv',self.root/'sample-ledger.sqlite','synthetic')
        with (self.root/'specimens.csv').open(encoding='utf-8-sig',newline='') as f:rows=list(csv.DictReader(f))
        samples=[r for r in rows if r['redcap_repeat_instrument']=='sample_collection']
        self.assertEqual(len(samples),3)
        self.assertEqual({r['checkbox_state'] for r in samples},{'checked','unchecked'})
        self.assertTrue(all(r['collection_date']=='' for r in samples))

    def test_placeholder_never_converted_to_zero_or_negative(self):
        p=fixture('---');path=self.root/'missing-result.sqlite';store=ReviewStore(path)
        try:
            store.registry.import_package(p,DICTIONARY)
            case=store.create_case('MISSING',**self.person)
            identity=store.assign_document(p['documents'][0]['document_id'],case_id=case['case_id'],reason='Synthetic',**self.person)
            store.review(p['package_id'],1,p['observations'][0]['observation_id'],action='accept',reason='Synthetic',
                expected_assignment_id=identity['assignment_id'],**self.person)
        finally:store.close()
        v=snapshot(path,DICTIONARY)['observations'][0]['value']
        self.assertEqual((v['numeric_value'],v.get('qualitative_value'),v['missing_reason']),(None,None,'source_placeholder'))

    def test_instance_ledger_stable_on_append_retry_and_ownership_change(self):
        path=self.root/'stable.sqlite';ledger=InstanceLedger(path,'project-A')
        try:
            ledger.owner('R','C');a=ledger.allocate('R','pool_results','z');b=ledger.allocate('R','pool_results','a')
            ledger.db.commit()
        finally:ledger.close()
        ledger=InstanceLedger(path,'project-A')
        try:
            self.assertEqual(ledger.allocate('R','pool_results','z'),a)
            self.assertEqual(ledger.allocate('R','pool_results','a'),b)
            self.assertNotEqual(a,b)
            with self.assertRaises(ValueError):ledger.owner('R','another-case')
        finally:ledger.close()

    def test_two_visits_keep_both_measurements_and_repeat_exports_are_identical(self):
        self.assign();self.accept()
        p=fixture('0.80');p['package_id']='SECOND'
        # New immutable source identity, not an OCR revision of the same file.
        from ocr_pool import convert_documents
        from registry_pool.exchange import convert_candidate
        from test_registry_review import CATALOG
        source=convert_documents([dict(document_id='SECOND',input_path='second.png',input_sha256='b'*64,
            tables=[dict(table_id='T',raw='Test\tResult\tUnit\nC3\t0.80\tg/L',format='auto')])],CATALOG)
        p=convert_candidate(source,DICTIONARY,package_id='SECOND')
        self.store.registry.import_package(p,DICTIONARY)
        visit=self.store.create_encounter(self.case['case_id'],label='Second',event_date='2026-11-08',**self.person)
        identity=self.store.assign_document(p['documents'][0]['document_id'],case_id=self.case['case_id'],encounter_id=visit['encounter_id'],reason='Synthetic',**self.person)
        self.store.review(p['package_id'],1,p['observations'][0]['observation_id'],action='accept',reason='Synthetic',expected_assignment_id=identity['assignment_id'],**self.person)
        s=self.snap();self.assertEqual(len(s['observations']),2)
        self.assertEqual(len({o['encounter_id'] for o in s['observations']}),2)
        export_data(s,self.root/'one.csv',self.root/'retry.sqlite','synthetic')
        export_data(s,self.root/'two.csv',self.root/'retry.sqlite','synthetic')
        self.assertEqual((self.root/'one.csv').read_bytes(),(self.root/'two.csv').read_bytes())

    def test_case_scoped_reconciliation_does_not_report_other_records_removed(self):
        ledger=InstanceLedger(self.root/'scoped.sqlite','project')
        try:
            ledger.allocate('A','pool_results','a')
            ledger.allocate('B','pool_results','b')
            self.assertEqual(ledger.absent(set(),{'A'})[0]['record_id'],'A')
            self.assertEqual(len(ledger.absent(set(),{'A'})),1)
            self.assertEqual(ledger.absent({('A','pool_results','a')},{'A'}),[])
            self.assertEqual(len(ledger.absent(set())),2)
        finally:ledger.close()

    def test_dictionary_and_csv_cover_catalog_preserve_quoted_literals(self):
        dd=data_dictionary(DICTIONARY);names=[r['Variable / Field Name'] for r in dd]
        self.assertEqual(len(names),len(set(names)))
        selector=next(r for r in dd if r['Variable / Field Name']=='field_id')
        self.assertEqual(len(selector['Choices, Calculations, OR Slider Labels'].split(' | ')),261)
        self.assertEqual(set(names),{n for v in FORMS.values() for n in v})
        values=['=literal','+','++','+++','0.6500','000123','a,"b"\nTiếng Việt']
        path=self.root/'literal.csv';write_csv(path,['value'],[dict(value=v) for v in values])
        with path.open(encoding='utf-8-sig',newline='') as f:self.assertEqual([r['value'] for r in csv.DictReader(f)],values)


class WordMappingTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.template=self.root/'synthetic.docx'
        xml='''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:unused="urn:preserve"><w:body><w:p><w:r><w:t>CASE REPORT FORM</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>C3</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>(kết quả trích xuất từ hệ thống)</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>'''
        with zipfile.ZipFile(self.template,'w') as z:
            z.writestr('word/document.xml',xml);z.writestr('customXml/item1.xml','opaque preserved');z.writestr('word/styles.xml','opaque styles')
        self.dictionary=copy.deepcopy(DICTIONARY)
        self.dictionary['template_sha256']=hashlib.sha256(self.template.read_bytes()).hexdigest()
        for f in self.dictionary['fields']:f['source_context']='B2.' if f['field_id']=='IMM11' else 'B99.'
        self.mapping=build_mapping(self.dictionary,self.template)

    def tearDown(self):self.tmp.cleanup()

    def test_complete_mapping_integrity_and_wrong_template(self):
        fields=validate_mapping(self.mapping,self.dictionary)
        self.assertEqual((len(fields),sum(len(f['components']) for f in fields.values())),(261,377))
        changed=copy.deepcopy(self.mapping);changed['fields'].pop()
        with self.assertRaises(ValueError):validate_mapping(changed,self.dictionary)
        changed['mapping_sha256']=digest({k:v for k,v in changed.items() if k!='mapping_sha256'})
        with self.assertRaises(ValueError):validate_mapping(changed,self.dictionary)
        with self.assertRaises(ValueError):build_mapping(DICTIONARY,self.template)

    def test_word_preserves_parts_multiple_values_and_unbound_appendix(self):
        s=dict(synthetic=True,snapshot_sha256='s',cases=[dict(case_id='C',registry_code='SYNTHETIC',study_id=None)],
            encounters=[dict(encounter_id='V',case_id='C',label='Synthetic',event_date='2026-11-07')],observations=[])
        for i,fid in enumerate(['IMM11','IMM11','IMM12']):
            s['observations'].append(dict(case_id='C',encounter_id='V',field_id=fid,component='result',observation_id='O'+str(i),
                value=dict(numeric_value=str(i),comparator='=',unit_raw='g/L',result_type='numeric'),document_id='D',package_id='P',revision=1,review_ids=['R'],evidence_ids=['E']))
        path=self.root/'filled.docx';report=export_word(s,self.template,self.mapping,self.dictionary,path,registry_code='SYNTHETIC',encounter_id='V')
        self.assertEqual(report['selected_observations'],3)
        self.assertEqual(report['unbound_observations'],['O2'])
        self.assertEqual(len(report['filled_slots'][0]['observations']),2)
        with zipfile.ZipFile(path) as out,zipfile.ZipFile(self.template) as before:
            self.assertEqual(out.namelist(),before.namelist())
            for name in before.namelist():
                if name!='word/document.xml':self.assertEqual(out.read(name),before.read(name))
            xml=out.read('word/document.xml').decode()
            self.assertIn('xmlns:unused="urn:preserve"',xml)
            self.assertIn('result: 0 g/L; result: 1 g/L',xml)
            self.assertIn('IMM12',xml);self.assertIn('SYNTHETIC DEMO',xml)
        wrong=copy.deepcopy(self.mapping);wrong['fields'][next(i for i,f in enumerate(wrong['fields']) if f['field_id']=='IMM11')]['word']['binding']['expected_label_text']='different'
        wrong['mapping_sha256']=digest({k:v for k,v in wrong.items() if k!='mapping_sha256'})
        with self.assertRaisesRegex(ValueError,'slot label'):export_word(s,self.template,wrong,self.dictionary,self.root/'bad.docx',registry_code='SYNTHETIC',encounter_id='V')
        with self.assertRaises(ValueError):export_word(s,self.template,self.mapping,self.dictionary,self.root/'bad-visit.docx',registry_code='SYNTHETIC',encounter_id='OTHER')

    def test_patient_summary_keeps_all_source_dates_without_creating_a_visit(self):
        s=dict(synthetic=True,snapshot_sha256='s',cases=[dict(case_id='C',registry_code='PATIENT',study_id=None)],
            encounters=[],observations=[])
        for i in range(2):
            s['observations'].append(dict(case_id='C',encounter_id=None,field_id='IMM11',component='result',
                observation_id='O'+str(i),value=dict(numeric_value=str(i),comparator='=',unit_raw='g/L',
                source_date='2026-11-0'+str(i+1),date_type='sample_date',result_type='numeric'),
                document_id='D'+str(i),package_id='P',revision=1,review_ids=['R'],evidence_ids=['E']))
        output=self.root/'patient.docx'
        result=export_word(s,self.template,self.mapping,self.dictionary,output,registry_code='PATIENT',patient_summary=True)
        self.assertEqual(result['scope'],'whole_patient')
        self.assertIsNone(result['encounter_id'])
        self.assertEqual(result['selected_observations'],2)
        self.assertEqual(s['encounters'],[])
        with zipfile.ZipFile(output) as archive:
            xml=archive.read('word/document.xml').decode()
            self.assertIn('2026-11-01',xml);self.assertIn('2026-11-02',xml)
            self.assertIn('D0',xml);self.assertIn('D1',xml)


if __name__=='__main__':unittest.main()
