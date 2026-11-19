"""Background crop proposals before a patient submission; no registry writes."""
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
from uuid import uuid4
import warnings

from PIL import Image, ImageOps
from ocr_pool.llm import configuration
from ocr_pool.flags import prototype_direct_llm, workspace_flag
from ocr_pool.lab_api import lab_crop_evidence
from ocr_pool.local_dates import _read_scan
from ocr_pool.mixed_lab import fluorescence_split
from ocr_pool.pft_api import pft_crop_evidence
from ocr_pool.workflow import venv_python
from .intake import MAX_IMAGE, MAX_BATCH, FORMATS, ROOT

AUTOMATIC_SECTIONS = {'detected_diagnostic_report_sections', 'detected_ecg_report_sections',
                      'detected_echo_report_sections'}


def proposal_summary(plan, sha256, size):
    """Geometry the browser needs; local OCR/date text stays on disk."""
    return dict(sha256=sha256, size=size, crop=plan['crop'],
        masks=[m['box'] for m in plan['masks'] if not m.get('polygon')],
        mask_polygons=[[[round(x), round(y)] for x, y in m['polygon']] for m in plan['masks'] if m.get('polygon')],
        crop_reason=plan['crop_reason'], review_count=len(plan['review_items']),
        staff_review_count=sum(r.get('code','').startswith('staff_') for r in plan['review_items']),
        result_review_boxes=[r['box'] for r in plan['review_items'] if r.get('code','').startswith('outgoing_')],
        reviewed=False, outbound_allowed=False)


def test_auto_send(workspace):
    """LUPIVA_TEST_AUTO_SEND=1 (environment or the workspace .env): test data only.

    Every image is sent with its proposed crop and masks even when the proposal asks
    for a person to review it, and the final outgoing OCR gate records instead of blocks.
    """
    return workspace_flag(workspace, 'LUPIVA_TEST_AUTO_SEND')


def automatic_plan(result, proposal_id, *, force=False):
    """The plan an image is sent with unreviewed, or None when a person must review it.

    ``force`` (test data only, see ``test_auto_send``) sends the proposed crop and masks
    of a page that would otherwise wait for review; chart-only pages are still skipped.
    """
    if ((re.fullmatch(r'detected_\w+_table_header', result['crop_reason']) or result['crop_reason'] in AUTOMATIC_SECTIONS)
            and result['crop'][1] > 0 and result['review_count'] == 0):
        automatic = {key: result[key] for key in ('sha256', 'crop', 'masks', 'mask_polygons')}
        automatic.update(proposal_id=proposal_id, automatic=True, reviewed=True)
        return automatic
    if result['crop_reason'] == 'chart_only_page':
        # Plotted curves only: nothing to extract, so the image is never sent.
        return dict(sha256=result['sha256'], skip=True, proposal_id=proposal_id, automatic=True)
    if force:
        automatic = {key: result[key] for key in ('sha256', 'crop', 'masks', 'mask_polygons')}
        automatic.update(proposal_id=proposal_id, automatic=True, reviewed=True, forced_test_send=True)
        return automatic
    return None


class PrivacyProposals:
    def __init__(self, workspace=ROOT, *, runner=None):
        self.workspace = Path(workspace).resolve()
        self.root = self.workspace / 'research/privacy-proposals'
        self.runner = runner
        self.jobs = {}
        self.by_hash = {}
        self.lock = threading.Lock()
        self.queue = queue.Queue()
        self.worker = None
        self.total_bytes = 0
        self.stop = threading.Event()
        self.child = None

    def route_preview(self, folder, proposal):
        try:
            config = configuration(self.workspace, engine='tokenharbor')
        except (OSError, ValueError):
            return None
        if config['model'] != 'deepseek-v4.1-flash:free':
            return 'standard'
        try:
            scan = _read_scan(folder, proposal['sha256'])
        except (OSError, ValueError, KeyError, TypeError):
            return None
        if config.get('fast_pft') and pft_crop_evidence(scan, proposal):
            return 'fast_pft'
        if config.get('fast_labs'):
            routing = {}
            if lab_crop_evidence(scan, proposal, routing=routing):
                return 'fast_labs'
            if routing.get('lab') == 'fluorescence_or_unidentified_panel':
                if fluorescence_split(scan, proposal):
                    return 'split_lab'
                return 'standard_fluorescence_or_panel'
        return 'standard'

    def create(self, body, sha256):
        if not body or len(body) > MAX_IMAGE:
            raise ValueError('Each image must be at most 20 MiB')
        if not re.fullmatch(r'[a-f0-9]{64}', str(sha256)) or hashlib.sha256(body).hexdigest() != sha256:
            raise ValueError('Image hash does not match the selected file')
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            try:
                with Image.open(io.BytesIO(body)) as source:
                    if source.format not in FORMATS or source.width * source.height > 50_000_000 or getattr(source, 'n_frames', 1) != 1:
                        raise ValueError('Use a supported single-page image under 50 million pixels')
                    size = list(ImageOps.exif_transpose(source).size)
            except (OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
                raise ValueError('Cannot read this image') from error
        with self.lock:
            if self.stop.is_set():
                raise ValueError('Local preview worker is stopping')
            prior = self.by_hash.get(sha256)
            if prior and self.jobs[prior]['status'] != 'failed':
                return copy.deepcopy(self.jobs[prior])
            if sum(j['status'] in {'queued','processing'} for j in self.jobs.values()) >= 50 or self.total_bytes + len(body) > MAX_BATCH:
                raise ValueError('Local preview queue is full; wait for the current images to finish')
            job_id = 'privacy-' + uuid4().hex
            folder = self.root / job_id
            folder.mkdir(parents=True)
            (folder / 'source').write_bytes(body)
            job = dict(job_id=job_id, sha256=sha256, size=size, status='queued', source_bytes=len(body))
            self.jobs[job_id] = job
            self.by_hash[sha256] = job_id
            self.total_bytes += len(body)
            self.queue.put(job_id)
            if self.worker is None:
                self.worker = threading.Thread(target=self.loop, daemon=True, name='privacy-proposals')
                self.worker.start()
            return copy.deepcopy(job)

    def get(self, job_id):
        with self.lock:
            if job_id not in self.jobs:
                raise KeyError('Unknown privacy proposal')
            return copy.deepcopy(self.jobs[job_id])

    def validate_intake_plans(self, plans):
        if not isinstance(plans, list):
            return
        for entry in plans:
            if not isinstance(entry, dict) or entry.get('automatic') is not True:
                continue
            try:
                proposal = self.get(entry.get('proposal_id'))
            except (KeyError, TypeError):
                proposal = {}
            expected = proposal.get('automatic_plan')
            if expected is None or entry != expected:
                raise ValueError('Vùng cắt tự động không còn khớp ảnh. Hãy chọn lại ảnh hoặc duyệt vùng gửi.')

    def loop(self):
        while True:
            job_id = self.queue.get()
            if job_id is None or self.stop.is_set():
                return
            folder = self.root / job_id
            with self.lock:
                self.jobs[job_id]['status'] = 'processing'
            try:
                direct = prototype_direct_llm(self.workspace)
                if direct:
                    job = self.get(job_id)
                    plan = dict(sha256=job['sha256'], size=job['size'],
                                crop=[0, 0, *job['size']], masks=[], review_items=[],
                                crop_reason='prototype_direct_llm')
                elif self.runner:
                    plan = self.runner(folder / 'source')
                else:
                    python = venv_python(self.workspace / '.venv-privacy-trial')
                    if not python.is_file():
                        raise ValueError('Local privacy OCR environment is missing')
                    with (folder / 'worker.log').open('wb') as log:
                        child = subprocess.Popen([str(python), '-X', 'utf8', str(self.workspace / 'scripts/propose_privacy.py'),
                            '--source', str(folder / 'source'), '--output', str(folder / 'proposal.json'),
                            '--models', str(self.workspace / 'models/privacy')], cwd=self.workspace,
                            stdout=log, stderr=log, shell=False,
                            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                        with self.lock:
                            self.child = child
                        try:
                            if self.stop.is_set():child.terminate()
                            returncode = child.wait(timeout=180)
                        except subprocess.TimeoutExpired:
                            child.kill();child.wait()
                            raise
                        finally:
                            with self.lock:self.child = None
                    if returncode:
                        raise ValueError('Không đề xuất được vùng cắt. Bạn có thể chọn vùng bằng tay.')
                    plan = json.loads((folder / 'proposal.json').read_text(encoding='utf-8'))
                job = self.get(job_id)
                if plan.get('sha256') != job['sha256'] or plan.get('size') != job['size']:
                    raise ValueError('Proposal does not match the source image')
                result = proposal_summary(plan, job['sha256'], job['size'])
                result['tokenharbor_route'] = None if direct else self.route_preview(folder, result)
                if direct:
                    automatic = {key: result[key] for key in ('sha256', 'crop', 'masks', 'mask_polygons')}
                    automatic.update(proposal_id=job_id, automatic=True, reviewed=True, direct_llm=True)
                else:
                    automatic = automatic_plan(result, job_id, force=test_auto_send(self.workspace))
                with self.lock:
                    self.jobs[job_id].update(status='completed', proposal=result, automatic_plan=automatic)
            except Exception:
                with self.lock:
                    self.jobs[job_id].update(status='failed', error='Chưa tự tìm được vùng cắt. Hãy chọn vùng bằng tay hoặc thử lại.')
            finally:
                with self.lock:
                    self.total_bytes -= self.jobs[job_id]['source_bytes']
                self.queue.task_done()

    def close(self):
        self.stop.set()
        with self.lock:
            if self.child and self.child.poll() is None:
                self.child.terminate()
        if self.worker:
            self.queue.put(None)
            self.worker.join(timeout=3)
