import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from ocr_pool.workflow import Workflow,process_token,workflow_lock
from ocr_pool.automatic import merge_region


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def successful(self,folder):
        return [sys.executable,'-c',"from pathlib import Path; import sys; Path(sys.argv[1]).write_text('done')",folder/'out.txt']

    def outputs(self,folder):
        return [folder/'out.txt']

    def test_completed_resume_verifies_hashes_and_does_not_execute_again(self):
        flow=Workflow(self.root,dict(input_hash='original'))
        result=flow.stage('stage',self.successful,self.outputs)
        resumed=Workflow(self.root,dict(input_hash='original'),resume=True)
        def forbidden(folder):
            raise AssertionError('Completed command must not execute again')
        self.assertEqual(resumed.stage('stage',forbidden,self.outputs),result)
        (result/'out.txt').write_text('tampered')
        with self.assertRaisesRegex(ValueError,'artifact changed'):
            resumed.stage('stage',forbidden,self.outputs)
        with self.assertRaisesRegex(ValueError,'changed'):
            Workflow(self.root,dict(input_hash='different'),resume=True)

    def test_failures_use_fresh_folders_and_stop_at_bound(self):
        flow=Workflow(self.root,{},max_attempts=2)
        with self.assertRaisesRegex(RuntimeError,'exhausted'):
            flow.stage('fail',lambda f:[sys.executable,'-c','raise SystemExit(3)'],self.outputs)
        attempts=flow.state['stages']['fail']['attempts']
        self.assertEqual([a['exit_code'] for a in attempts],[3,3])
        self.assertNotEqual(attempts[0]['output'],attempts[1]['output'])
        with self.assertRaisesRegex(RuntimeError,'exhausted'):
            Workflow(self.root,{},resume=True).stage('fail',self.successful,self.outputs)

    def test_live_child_prevents_restart_then_dead_child_gets_fresh_attempt(self):
        child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(30)'])
        try:
            flow=Workflow(self.root,{})
            (self.root/'stage-attempt-1').mkdir()
            flow.state['stages']['stage']=dict(attempts=[dict(status='running',pid=child.pid,
                process_token=process_token(child.pid),output='stage-attempt-1')])
            flow.save()
            with self.assertRaisesRegex(RuntimeError,'still live'):
                flow.stage('stage',self.successful,self.outputs)
            self.assertFalse((self.root/'stage-attempt-2').exists())
        finally:
            child.terminate()
            child.wait()
        self.assertIsNone(process_token(child.pid))
        result=flow.stage('stage',self.successful,self.outputs)
        self.assertEqual(result.name,'stage-attempt-2')
        self.assertEqual(flow.state['stages']['stage']['attempts'][0]['status'],'interrupted')

    def test_os_lock_prevents_concurrent_runner(self):
        with workflow_lock(self.root):
            with self.assertRaisesRegex(RuntimeError,'Another runner'):
                with workflow_lock(self.root):
                    pass
        with workflow_lock(self.root):
            pass

    def test_missing_output_is_failure_not_completion(self):
        flow=Workflow(self.root,{},max_attempts=1)
        with self.assertRaisesRegex(RuntimeError,'exhausted'):
            flow.stage('empty',lambda f:[sys.executable,'-c','pass'],self.outputs)
        self.assertEqual(flow.state['stages']['empty']['attempts'][0]['status'],'failed')

    def test_incomplete_child_keeps_selected_parent_results(self):
        parent=dict(table_id='parent',raw='Test\tResult\nC3\t0.65')
        target=dict(tables=[parent],text_regions=[])
        child=dict(table_id='child',raw='partial',truncated=True,
                   region=dict(layout=dict(original_region_id='parent')))
        self.assertIsNone(merge_region(target,child,'tables'))
        self.assertNotIn('purpose',parent)
        self.assertEqual(target['tables'][1]['replacement_rejected_reason'],'incomplete_retry')


if __name__=='__main__':
    unittest.main()
