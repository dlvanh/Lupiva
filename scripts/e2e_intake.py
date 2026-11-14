"""Drive the review UI API through an unapproved patient draft.

GET / for its token; propose/poll privacy for each JPEG/PNG; create an API
intake with unchanged automatic plans and reference-only skip entries; upload
raw images, start, and poll /api/intakes. Read the patient and CRF, request/poll
LLM draft suggestions, preview scores with an empty clinical assessment, and
preview exports. Never approve values or create export artifacts.
"""

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import uuid4


FORBIDDEN_ENDPOINTS = {
    '/api/crf/approve', '/api/review', '/api/patient-review',
    '/api/source-review', '/api/source-correction', '/api/exports/create',
}
ALLOWED_ENDPOINTS = {
    'GET': {'/', '/api/intakes', '/api/privacy-proposals', '/api/patient',
            '/api/crf'},
    'POST': {'/api/privacy-proposals', '/api/intakes', '/api/intakes/image',
             '/api/intakes/start', '/api/crf/generate', '/api/crf/scores',
             '/api/exports/preview'},
}


def guard_endpoint(url, method='POST'):
    """Fail closed before networking, including encoded forbidden paths."""
    path = urlsplit(url).path
    for _ in range(8):
        decoded = unquote(path)
        if decoded == path:
            break
        path = decoded
    canonical = '/' + '/'.join(part for part in path.split('/') if part)
    if canonical.lower() in FORBIDDEN_ENDPOINTS:
        raise ValueError('Forbidden approval/review endpoint: ' + canonical)
    if path not in ALLOWED_ENDPOINTS.get(method, set()):
        raise ValueError('Endpoint is outside the draft-only allowlist: ' + path)


class NoRedirects(HTTPRedirectHandler):
    # A redirect must never bypass the endpoint guard or forward credentials.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class APIError(RuntimeError):
    def __init__(self, status, response):
        self.status = status
        self.response = response
        super().__init__('HTTP %s: %s' % (status, response))


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2,
                               allow_nan=False) + '\n', encoding='utf-8')


class Client:
    def __init__(self, args):
        parsed = urlsplit(args.base)
        if (parsed.scheme not in {'http', 'https'} or not parsed.netloc
                or parsed.path not in {'', '/'} or parsed.query or parsed.fragment
                or parsed.username or parsed.password):
            raise ValueError('--base must be an HTTP origin without credentials or a path')
        self.base = args.base.rstrip('/')
        self.headers = {}
        for key, value in [('Host', args.host_header), ('Origin', args.origin),
                           ('Cookie', args.cookie)]:
            if value:
                self.headers[key] = value
        self.token = None
        self.out_dir = Path(args.out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.opener = build_opener(NoRedirects())
        self.counter = 0
        self.calls = []
        self.request_timeout = min(60, args.timeout)

    def request(self, path, payload=None, raw=None, query=None, html=False):
        method = 'POST' if payload is not None or raw is not None else 'GET'
        guard_endpoint(path, method)
        # Callers supply only relative API paths, never another authority.
        if urlsplit(path).netloc or urlsplit(path).scheme:
            raise ValueError('Use a relative API endpoint')
        url = self.base + path + ('?' + urlencode(query) if query else '')
        guard_endpoint(url, method)
        headers = dict(self.headers)
        body = None
        if method == 'POST':
            if self.token is None:
                raise ValueError('Fetch the UI token before posting')
            headers['X-Review-Token'] = self.token
            headers['Content-Type'] = ('application/octet-stream' if raw is not None
                                       else 'application/json')
            body = raw if raw is not None else json.dumps(payload).encode('utf-8')
        started = time.monotonic()
        status, content = None, b''
        try:
            try:
                response = self.opener.open(Request(url, data=body, headers=headers,
                                                    method=method),
                                            timeout=self.request_timeout)
            except HTTPError as error:
                response = error
            with response:
                status = response.code
                content = response.read()
        finally:
            self.counter += 1
            stem = '%05d_%s_%s' % (self.counter, method,
                                   path.strip('/').replace('/', '_') or 'index')
            filename = stem + ('.html' if html else '.json')
            # Save the exact response bytes, including HTTP error bodies.
            (self.out_dir / filename).write_bytes(content)
            record = dict(method=method, path=path, query=query, status=status,
                          seconds=time.monotonic() - started, response_file=filename)
            self.calls.append(record)
            save_json(self.out_dir / (stem + '.request.json'), record)
        decoded = content.decode('utf-8')
        try:
            result = decoded if html else json.loads(decoded)
        except ValueError:
            raise APIError(status, decoded[:500]) from None
        if not 200 <= status < 300:
            raise APIError(status, result)
        return result

    def bootstrap(self):
        page = self.request('/', html=True)
        match = re.search(r'\bconst\s+TOKEN\s*=\s*("(?:\\.|[^"\\])*")\s*;', page)
        if not match:
            raise ValueError('Cannot find the review UI CSRF token')
        self.token = json.loads(match.group(1))


def pause(deadline, seconds):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Polling deadline exceeded')
    time.sleep(min(seconds, remaining))


def crf_items(view):
    """Retain conflicting alternatives without selecting or approving one."""
    result = []
    for field in view.get('fields', []):
        field_id, component = field['slot'].split('/', 1)
        options = field.get('options', [])
        proposal = field.get('proposal')
        values = options or ([proposal] if proposal else [None])
        status = ('conflict' if len(options) > 1 else 'pending' if options
                  else 'suggested' if proposal else 'missing')
        for value in values:
            result.append(dict(field_id=field_id, component=component,
                               value=value.get('value') if value else None,
                               status=status, sources=value.get('sources', []) if value else []))
    return result


def run(args, summary, client):
    folder = Path(args.folder)
    files = sorted((p for p in folder.iterdir() if p.is_file()
                    and p.suffix.lower() in {'.jpg', '.jpeg', '.png'}),
                   key=lambda p: p.name.casefold())
    if not files:
        raise ValueError('No JPEG/PNG files in --folder (non-recursive)')
    if len(files) > 50 or any(not 0 < p.stat().st_size <= 20 * 1024**2 for p in files):
        raise ValueError('Choose at most 50 nonempty images, at most 20 MiB each')
    if sum(p.stat().st_size for p in files) > 100 * 1024**2:
        raise ValueError('Image batch exceeds 100 MiB')
    client.bootstrap()
    available = client.request('/api/intakes').get('engines', {})
    engine = args.engine
    if engine == 'auto':
        engine = next((name for name in ('tokenharbor', 'gemini')
                       if available.get(name, {}).get('available') is True), None)
        if not engine:
            raise ValueError('No configured API engine; automatic privacy plans require an API intake')
    elif available.get(engine, {}).get('available') is False:
        raise ValueError('Requested API engine is unavailable: ' + engine)
    summary['engine'] = engine
    plans, selected, seen = [], [], set()
    started = time.monotonic()
    for path in files:
        image_start = time.monotonic()
        body = path.read_bytes()
        sha = hashlib.sha256(body).hexdigest()
        item = dict(name=path.name, sha256=sha, status='pending',
                    automatic_plan_present=False, crop_reason=None,
                    review_items=None, blocking_reasons=[], route_preview=None)
        summary['images'].append(item)
        if sha in seen:
            item.update(status='duplicate', seconds=time.monotonic() - image_start,
                        blocking_reasons=['Duplicate image omitted as in the UI'])
            continue
        seen.add(sha)
        selected.append((path, sha))
        try:
            job = client.request('/api/privacy-proposals', raw=body, query={'sha256': sha})
            deadline = time.monotonic() + min(240, args.timeout)
            while job['status'] in {'queued', 'processing'}:
                pause(deadline, .7)
                job = client.request('/api/privacy-proposals', query={'job_id': job['job_id']})
            proposal = job.get('proposal') or {}
            item.update(status=job['status'], proposal_id=job.get('job_id'),
                        crop_reason=proposal.get('crop_reason'),
                        review_items=proposal.get('review_items'),
                        review_count=proposal.get('review_count'),
                        staff_review_count=proposal.get('staff_review_count'),
                        result_review_boxes=proposal.get('result_review_boxes', []),
                        route_preview=proposal.get('tokenharbor_route'))
            if proposal.get('review_count'):
                item['blocking_reasons'].append('%s regions require privacy review' % proposal['review_count'])
            if proposal.get('staff_review_count'):
                item['blocking_reasons'].append('Staff identifiers/signatures require review')
            if proposal.get('result_review_boxes'):
                item['blocking_reasons'].append('Crop/masks may remove result content')
            if proposal.get('crop_reason') == 'no_reliable_result_header_keep_page':
                item['blocking_reasons'].append('No reliable result header; full page retained')
            plan = job.get('automatic_plan')
            if job['status'] == 'completed':
                if (proposal.get('sha256') != sha or proposal.get('reviewed') is not False
                        or proposal.get('outbound_allowed') is not False):
                    raise ValueError('Proposal does not match the UI privacy invariants')
            if job['status'] == 'completed' and plan is not None:
                if (plan.get('sha256') != sha or plan.get('automatic') is not True
                        or plan.get('reviewed') is not True or plan.get('proposal_id') != job['job_id']):
                    raise ValueError('Invalid automatic plan')
                plans.append(plan)  # Exact server object; do not reconstruct it.
                item['automatic_plan_present'] = True
                item['automatic_plan'] = plan
            else:
                item['blocking_reasons'].append(job.get('error') or 'No automatic plan; manual privacy review required')
                plans.append({'sha256': sha, 'skip': True})
        except (APIError, TimeoutError, OSError, ValueError) as error:
            item.update(status='failed', error=str(error))
            item['blocking_reasons'].append(str(error))
            plans.append({'sha256': sha, 'skip': True})
        finally:
            item['seconds'] = time.monotonic() - image_start
            item['reference_only'] = not item['automatic_plan_present']
    summary['timings']['privacy'] = time.monotonic() - started
    if all(plan.get('skip') for plan in plans):
        raise ValueError('No automatic plans; UI forbids an all-reference-only API intake')

    started = time.monotonic()
    job = client.request('/api/intakes', payload=dict(
        request_id=str(uuid4()), registry_code=args.label, file_count=len(selected),
        same_patient=True, engine=engine, privacy=plans, actor=args.actor, role=args.role))['job']
    summary.update(intake_id=job['job_id'], case_id=job['case_id'])
    summary['timings']['intake_create'] = time.monotonic() - started
    started = time.monotonic()
    for index, (path, sha) in enumerate(selected, 1):
        body = path.read_bytes()
        if hashlib.sha256(body).hexdigest() != sha:
            raise ValueError('Selected image changed before upload: ' + path.name)
        client.request('/api/intakes/image', raw=body, query=dict(
            job_id=job['job_id'], file_id='image-%03d' % index, name=path.name))
    summary['timings']['upload'] = time.monotonic() - started
    job = client.request('/api/intakes/start', payload={'job_id': job['job_id']})['job']
    follow_intake(args, summary, client, job)


def follow_intake(args, summary, client, job):
    """Poll an already started intake, then read and preview its CRF draft."""
    started = time.monotonic()
    deadline = time.monotonic() + args.timeout
    stage_start = time.monotonic()
    stage = None
    try:
        while True:
            summary['intake'] = job
            new_stage = (job['status'], job.get('stage'), job.get('completed_stages'))
            if new_stage != stage:
                if stage is not None:
                    summary['stage_timings'][-1]['seconds'] = time.monotonic() - stage_start
                stage, stage_start = new_stage, time.monotonic()
                summary['stage_timings'].append(dict(status=stage[0], stage=stage[1],
                                                    completed_stages=stage[2], seconds=0))
            if job['status'] in {'completed', 'failed', 'needs_attention'}:
                break
            pause(deadline, 4)
            jobs = client.request('/api/intakes')['jobs']
            job = next(j for j in jobs if j['job_id'] == summary['intake_id'])
    finally:
        summary['timings']['intake_processing'] = time.monotonic() - started
        if summary['stage_timings']:
            summary['stage_timings'][-1]['seconds'] = time.monotonic() - stage_start
    summary['counts'] = {key: job.get(key) for key in ('observations', 'metadata', 'issues')}
    if job['status'] != 'completed':
        raise RuntimeError('Intake %s: %s' % (job['status'], job.get('error')))

    case = {'case_id': summary['case_id']}
    started = time.monotonic()
    client.request('/api/patient', query=case)
    view = client.request('/api/crf', query=case)
    summary['crf_items'] = crf_items(view)
    summary['timings']['case_read'] = time.monotonic() - started

    def preview(name, operation):
        tick = time.monotonic()
        try:
            return operation()
        except (APIError, TimeoutError, OSError, ValueError) as error:
            summary['preview_errors'][name] = str(error)
            return None
        finally:
            summary['timings'][name] = time.monotonic() - tick

    def generate():
        client.request('/api/crf/generate', payload=case)
        deadline = time.monotonic() + args.timeout
        while True:
            current = client.request('/api/crf', query=case)
            summary['crf_items'] = crf_items(current)
            state = current.get('job') or {}
            if state.get('status') != 'running':
                if state.get('status') == 'failed':
                    raise ValueError(state.get('error', 'CRF draft failed'))
                return current
            pause(deadline, 1.6)

    generated = preview('crf_generate', generate)
    if generated:
        view = generated
    if view.get('score_form', {}).get('eular'):
        summary['scores_preview'] = preview('scores_preview', lambda: client.request(
            '/api/crf/scores', payload=dict(**case, source_snapshot=view['source_snapshot'],
                                          assessment={'ana': '', 'date': '', 'criteria': {}})))
    else:
        summary['scores_preview'] = {'unavailable': 'CRF has no score form'}
    summary['exports_preview'] = preview('exports_preview', lambda: client.request(
        '/api/exports/preview', payload=dict(**case, encounter_id=None)))
    summary['status'] = 'completed_with_preview_errors' if summary['preview_errors'] else 'completed'


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, help='Review server origin, e.g. http://127.0.0.1:8765')
    parser.add_argument('--folder', required=True)
    parser.add_argument('--label', required=True, help='Patient registry_code; all selected images are confirmed as one patient')
    parser.add_argument('--out', required=True, help='JSON summary path')
    parser.add_argument('--out-dir', required=True, help='Directory for exact raw HTTP responses')
    parser.add_argument('--timeout', type=float, default=900, help='Intake/CRF polling timeout in seconds (privacy capped at UI 240 s)')
    parser.add_argument('--host-header')
    parser.add_argument('--origin')
    parser.add_argument('--cookie')
    parser.add_argument('--engine', choices=['auto', 'tokenharbor', 'gemini'], default='auto',
                        help='Auto prefers available Token Harbor, then Gemini; never bypasses privacy with local OCR')
    parser.add_argument('--actor', default='e2e_intake', help='Declared intake submitter name')
    parser.add_argument('--role', choices=['source_reviewer', 'clinician'], default='source_reviewer',
                        help='Declared intake role required by server; no review calls are made')
    parser.add_argument('--resume-intake', help='Follow an existing intake job id instead of creating one')
    parser.add_argument('--retry', action='store_true', help='With --resume-intake: retry a failed intake like the UI retry button')
    args = parser.parse_args(argv)
    if not 0 < args.timeout < float('inf'):
        parser.error('--timeout must be a positive finite number')
    if not args.label.strip():
        parser.error('--label must not be empty')
    summary = dict(status='failed', images=[], intake_id=None, case_id=None,
                   counts={}, crf_items=[], scores_preview=None, timings={},
                   stage_timings=[], preview_errors={})
    summary['privacy_review_note'] = ('The API exposes review counts and result boxes; '
                                      'full review_items are null unless exposed by the server.')
    started = time.monotonic()
    client = None
    try:
        client = Client(args)
        if args.resume_intake:
            client.bootstrap()
            job = next(j for j in client.request('/api/intakes')['jobs'] if j['job_id'] == args.resume_intake)
            summary.update(intake_id=job['job_id'], case_id=job['case_id'])
            if args.retry and job['status'] == 'failed':
                job = client.request('/api/intakes/start', payload={'job_id': job['job_id'], 'retry': True})['job']
            follow_intake(args, summary, client, job)
        else:
            run(args, summary, client)
    except (Exception, KeyboardInterrupt) as error:
        summary['error'] = str(error) or type(error).__name__
    finally:
        summary['timings']['total'] = time.monotonic() - started
        summary['http_calls'] = client.calls if client else []
        summary['stage_timings_note'] = 'Observed polling intervals; server exposes only the current workflow stage, not exact stage durations.'
        save_json(Path(args.out), summary)
    print(json.dumps({key: summary.get(key) for key in
                      ('status', 'intake_id', 'case_id', 'error')}, ensure_ascii=False))
    return 0 if summary['status'] == 'completed' else 1


if __name__ == '__main__':
    sys.exit(main())
