import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

from ocr_pool import convert_documents
from registry_pool.dictionary import build_dictionary,digest
from registry_pool.exchange import convert_candidate,build_bundle,verify_bundle
from registry_pool.schema import validate_json,validate_package,package_schema
from registry_pool.store import Registry

ROOT=Path(__file__).resolve().parents[1]
CATALOG=json.loads((ROOT/'schemas/crf-template-fields.json').read_text(encoding='utf-8-sig'))
DICTIONARY=build_dictionary(CATALOG)


def candidate():
    return convert_documents([dict(document_id='S',input_path='source.png',input_sha256='a'*64,
        tables=[dict(table_id='T',raw='Test\tResult\tUnit\nC3\t0.65\tg/L',format='auto')])],CATALOG)


class RegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.registry=Registry(self.root/'registry.sqlite')

    def tearDown(self):
        self.registry.close()
        self.tmp.cleanup()

    def test_all_fields_and_components_accounted_without_filling_values(self):
        package=convert_candidate(candidate(),DICTIONARY)
        validate_package(package,DICTIONARY)
        self.assertEqual(len(package['fields']),261)
        self.assertEqual(len(package['observations']),1)
        self.assertEqual(package['fields']['SDA25']['components']['result']['status'],'not_processed')
        self.assertIn('recorded_only',next(f for f in DICTIONARY['fields'] if f['field_id']=='SDA25')['extraction_policy'])

    def test_panel_result_and_intensity_source_components_are_preserved(self):
        for header,component in [('Result','result'),('Intensity','intensity')]:
            c=convert_documents([dict(document_id='S',input_path='source.png',input_sha256='a'*64,
                context=dict(panel='ana_profile_23'),
                tables=[dict(table_id='T',raw='Test\t'+header+'\nRo-52\t3',format='auto')])],CATALOG)
            self.assertEqual(len(c['observations']),1)
            package=convert_candidate(c,DICTIONARY)
            self.assertEqual(package['observations'][0]['component'],component)
            fid=package['observations'][0]['field_id']
            self.assertEqual(package['fields'][fid]['components'][component]['status'],'found')

    def test_import_repeat_is_idempotent_and_does_not_approve_or_merge_identity(self):
        package=convert_candidate(candidate(),DICTIONARY)
        self.assertEqual(self.registry.import_package(package,DICTIONARY)['status'],'imported')
        self.assertEqual(self.registry.import_package(package,DICTIONARY)['status'],'already_imported')
        self.assertEqual(self.registry.integrity(),dict(sqlite='ok',foreign_key_errors=[],audit_events=1,packages=1,observations=1))
        stored=self.registry.package(package['package_id'])
        self.assertIsNone(stored['case_id'])
        self.assertEqual(stored['observations'][0]['source_data']['review_status'],'pending')

    def test_same_revision_changed_content_rejected(self):
        package=convert_candidate(candidate(),DICTIONARY,package_id='P')
        self.registry.import_package(package,DICTIONARY)
        changed=copy.deepcopy(package)
        changed['source_issues'].append({'reason':'new'})
        with self.assertRaisesRegex(ValueError,'different content'):
            self.registry.import_package(changed,DICTIONARY)
        self.assertEqual(self.registry.integrity()['audit_events'],1)

    def test_new_revision_preserves_previous_and_shares_unchanged_observation(self):
        first=convert_candidate(candidate(),DICTIONARY,package_id='P')
        self.registry.import_package(first,DICTIONARY)
        second=copy.deepcopy(first)
        second.update(revision=2,supersedes={'package_id':'P','revision':1})
        self.registry.import_package(second,DICTIONARY)
        self.assertEqual(self.registry.package('P',1),first)
        self.assertEqual(self.registry.package('P'),second)
        self.assertEqual(self.registry.integrity()['observations'],1)
        self.assertEqual(self.registry.integrity()['audit_events'],2)
        with self.assertRaises(sqlite3.IntegrityError):
            self.registry.db.execute("UPDATE observations SET component='bad'")

    def test_transaction_rolls_back_after_invalid_entity_id(self):
        package=convert_candidate(candidate(),DICTIONARY)
        old_id=package['observations'][0]['observation_id']
        package['observations'][0]['observation_id']='obs-invalid'
        package['fields']['IMM11']['observation_ids']=['obs-invalid']
        package['fields']['IMM11']['components']['result']['observation_ids']=['obs-invalid']
        with self.assertRaisesRegex(ValueError,'entity ID'):
            self.registry.import_package(package,DICTIONARY)
        self.assertEqual(self.registry.integrity()['packages'],0)
        self.assertEqual(self.registry.db.execute('SELECT COUNT(*) FROM documents').fetchone()[0],0)

    def test_schema_types_enums_links_and_unknown_keywords_rejected(self):
        package=convert_candidate(candidate(),DICTIONARY)
        for mutate in (
            lambda p:p['fields'].pop('SDA25'),
            lambda p:p.update(revision=True),
            lambda p:p['fields']['IMM11']['components'].pop('result'),
            lambda p:p['fields']['IMM11'].update(status='imagined'),
            lambda p:p['observations'][0]['source_data'].update(numeric_value=0.65),
            lambda p:p['observations'][0]['source_data'].update(eligible_for_verified_pool=True),
            lambda p:p['observations'][0]['evidence_ids'].append('missing'),
        ):
            bad=copy.deepcopy(package)
            mutate(bad)
            with self.assertRaises(ValueError):
                validate_package(bad,DICTIONARY)
        with self.assertRaisesRegex(ValueError,'Unsupported schema'):
            validate_json('x',{'type':'string','unknownRule':True})

    def test_generated_ids_do_not_depend_on_run_local_observation_ids(self):
        original=candidate()
        renamed=copy.deepcopy(original)
        renamed['observations'][0]['observation_id']='OTHER'
        renamed['fields']['IMM11']['observation_ids']=['OTHER']
        self.assertEqual(convert_candidate(original,DICTIONARY)['observations'][0]['observation_id'],
                         convert_candidate(renamed,DICTIONARY)['observations'][0]['observation_id'])

    def test_portable_bundle_rejects_changed_raw_and_path_escape(self):
        run=self.root/'run'
        (run/'raw').mkdir(parents=True)
        (run/'crops').mkdir()
        from PIL import Image
        source=self.root/'source.png'
        Image.new('RGB',(20,20),'white').save(source)
        (run/'crops'/'T.png').write_bytes(source.read_bytes())
        c=candidate()
        sha=hashlib.sha256(source.read_bytes()).hexdigest()
        c['source_documents'][0]['input_sha256']=sha
        c['evidence'][0]['input_sha256']=sha
        raw='Test\tResult\tUnit\nC3\t0.65\tg/L'
        # Explicit Windows line endings must pass on every host, while evidence
        # retains the parser's normalized text hash.
        (run/'raw'/'T.txt').write_bytes(raw.replace('\n','\r\n').encode('utf-8'))
        (run/'candidate-pool.json').write_text(json.dumps(c),encoding='utf-8')
        bundle=self.root/'bundle'
        package=build_bundle(run,bundle,DICTIONARY,self.root)
        self.assertEqual(verify_bundle(bundle,DICTIONARY),package)
        self.registry.import_bundle(bundle,DICTIONARY)
        (bundle/'artifacts/raw/T.txt').write_text('changed',encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'asset'):
            verify_bundle(bundle,DICTIONARY)
        # Updating the asset manifest cannot conceal disagreement with evidence.
        changed=(bundle/'artifacts/raw/T.txt').read_bytes()
        asset=next(a for a in package['assets'] if a['key']=='artifacts/raw/T.txt')
        asset.update(size=len(changed),sha256=hashlib.sha256(changed).hexdigest())
        (bundle/'package.json').write_text(json.dumps(package),encoding='utf-8')
        with self.assertRaisesRegex(ValueError,'raw text hash'):
            verify_bundle(bundle,DICTIONARY)
        from registry_pool.exchange import safe_key
        with self.assertRaises(ValueError):
            safe_key(bundle,'../outside')
