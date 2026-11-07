"""Orchestration regression checks use synthetic sources, never GPU inference."""
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
from ocr_pool import convert_documents
from ocr_pool.runner import RunnerStages,fingerprints
from ocr_pool.workflow import Workflow,read,sha,write
from form_pool.workflow import extend_specimens
from registry_pool.exchange import verify_bundle
from scripts.run_specimen_pool import configuration

ROOT=Path(__file__).resolve().parents[1]
CATALOG=read(ROOT/'schemas/crf-template-fields.json')


class FormWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=ROOT,prefix='synthetic-form-test-')
        self.root=Path(self.tmp.name)
        self.parent=self.root/'clinical'
        (self.parent/'raw').mkdir(parents=True)
        (self.parent/'crops').mkdir()
        source=self.root/'synthetic.png'
        Image.new('RGB',(800,300),'white').save(source)
        raw='Test\tResult\tUnit\nC3\t0.65\tg/L'
        document=dict(document_id='SYNTHETIC',input_path=source.relative_to(ROOT).as_posix(),
            input_sha256=sha(source),tables=[dict(table_id='T',raw=raw,format='auto')],text_regions=[])
        self.pool=convert_documents([document],CATALOG)
        write(self.parent/'candidate-pool.json',self.pool)
        write(self.parent/'ocr-tables.json',dict(documents=[document]))
        (self.parent/'raw/T.txt').write_text(raw,encoding='utf-8')
        Image.new('RGB',(800,300),'white').save(self.parent/'crops/T.png')
        self.output=self.root/'workflow'
        self.output.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_form_skips_model_and_publishes_resumable_verified_bundle(self):
        flow=Workflow(self.output,{},cwd=ROOT)
        stages=RunnerStages(flow,ROOT)
        final=extend_specimens(stages,self.parent,start=1)
        bundle=stages.publish(final,start=6)
        flow.complete(final)
        actual=read(final/'candidate-pool.json')
        self.assertEqual(actual['observations'],self.pool['observations'])
        self.assertEqual(actual['metadata_candidates'],self.pool['metadata_candidates'])
        self.assertEqual(actual['specimen_candidates'],[])
        for name in ('02-form-cell-ocr','03-form-ink-regions','04-form-ink-ocr'):
            self.assertEqual(flow.state['stages'][name]['status'],'skipped')
            self.assertEqual(flow.state['stages'][name]['attempts'],[])
        package=verify_bundle(bundle,read(bundle/'dictionary.json'))
        self.assertEqual(package['schema_version'],'lupus-pool-exchange-1.1')
        resumed=RunnerStages(Workflow(self.output,{},resume=True,cwd=ROOT),ROOT)
        with patch('ocr_pool.workflow.subprocess.Popen',side_effect=AssertionError('No child on resume')):
            self.assertEqual(extend_specimens(resumed,self.parent,start=1),final)
            self.assertEqual(resumed.publish(final,start=6),bundle)
        (final/'candidate-pool.sqlite').write_bytes(b'tampered')
        with self.assertRaisesRegex(ValueError,'differs'):
            resumed.publish(final,start=6)

    def test_changed_form_manifest_rejects_resume_before_model_execution(self):
        stages=RunnerStages(Workflow(self.output,{},cwd=ROOT),ROOT)
        extend_specimens(stages,self.parent,start=1)
        manifest=self.output/'01-form-cell-regions-attempt-1/manifest.json'
        manifest.write_text('{}',encoding='utf-8')
        resumed=RunnerStages(Workflow(self.output,{},resume=True,cwd=ROOT),ROOT)
        with patch('ocr_pool.workflow.subprocess.Popen',side_effect=AssertionError('No child on tamper')):
            with self.assertRaisesRegex(ValueError,'artifact changed'):
                extend_specimens(resumed,self.parent,start=1)

    def test_failed_form_preparation_retains_attempts_and_never_starts_model(self):
        source=self.root/'synthetic.png'
        source.write_bytes(b'changed source')
        flow=Workflow(self.output,{},cwd=ROOT,max_attempts=2)
        stages=RunnerStages(flow,ROOT)
        with self.assertRaisesRegex(RuntimeError,'exhausted'):
            extend_specimens(stages,self.parent,start=1)
        attempts=flow.state['stages']['01-form-cell-regions']['attempts']
        self.assertEqual([a['status'] for a in attempts],['failed','failed'])
        self.assertNotEqual(attempts[0]['output'],attempts[1]['output'])
        self.assertNotIn('02-form-cell-ocr',flow.state['stages'])
        self.assertTrue((self.output/attempts[0]['output']/'stderr.log').is_file())

    def test_saved_parent_configuration_freezes_artifacts_sources_and_database(self):
        fake=dict(code={'form_pool/retry.py':'old'},models={'model':'fixed'},python='python')
        with patch('scripts.run_specimen_pool.fingerprints',return_value=fake):
            before=configuration(self.parent,None)
            (self.parent/'raw/T.txt').write_text('changed',encoding='utf-8')
            self.assertNotEqual(configuration(self.parent,None),before)
            source=self.root/'synthetic.png'
            source.write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'source image hash'):
                configuration(self.parent,None)

    def test_fingerprint_includes_form_code_and_schema_changes(self):
        for folder in ('scripts','ocr_pool','registry_pool','form_pool','schemas','models/SenOCR-Vi','models/PP-DocLayoutV3'):
            (self.root/folder).mkdir(parents=True,exist_ok=True)
        (self.root/'models/SenOCR-Vi/model.safetensors').write_bytes(b'synthetic weights')
        form=self.root/'form_pool/retry.py'
        form.write_text('# original',encoding='utf-8')
        schema=self.root/'schemas/pool-package-v1.1.schema.json'
        schema.write_text('{}',encoding='utf-8')
        before=fingerprints(self.root)
        self.assertIn('form_pool/retry.py',before['code'])
        self.assertIn('schemas/pool-package-v1.1.schema.json',before['code'])
        form.write_text('# changed',encoding='utf-8')
        self.assertNotEqual(fingerprints(self.root),before)
        self.assertEqual(fingerprints(self.root)['models'],before['models'])


if __name__=='__main__':
    unittest.main()
