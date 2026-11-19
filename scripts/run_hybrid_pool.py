"""Experimental flow C (hybrid): local OCR for every page, then flow B (mask + LLM API) only for
pages the local reading cannot settle. Calls the two existing runners unchanged.

Input manifest: {"documents": [{document_id, input_path}]}. For every page routed to the API the
crop/mask plan is proposed locally by the same proposer the web intake uses
(scripts/propose_privacy.py + registry_review.privacy.automatic_plan). A page without an
automatic plan is held back and never sent (fail-closed); chart-only pages are skipped.
`--privacy manifest` uses each document's own `privacy` plan instead (synthetic tests).

Output folder:
  local/         run_automatic_pool.py output for every page (nothing leaves the machine)
  privacy/       per-page local proposal (proposal.json) for routed pages
  api/           run_llm_pool.py output for the sendable routed pages only (absent when none)
  routing.json   per-page route, reasons, value counts and timings
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ocr_pool.hybrid_router import MIN_VALUES, route  # noqa: E402
from ocr_pool.llm import API_ENGINES  # noqa: E402
from ocr_pool.workflow import venv_python  # noqa: E402
from registry_review.privacy import automatic_plan, proposal_summary  # noqa: E402


def candidate_pool(folder):
    pools = sorted(Path(folder).rglob('candidate-pool.json'), key=lambda p: p.stat().st_mtime)
    if not pools:
        raise SystemExit(f'No candidate-pool.json under {folder}')
    return json.loads(pools[-1].read_text(encoding='utf-8'))


def run(cmd):
    start = time.monotonic()
    subprocess.run(cmd, cwd=ROOT, check=True)
    return round(time.monotonic() - start, 2)


def propose(doc, folder):
    """Local crop/mask proposal for one page; returns (plan or None, summary)."""
    source = ROOT / doc['input_path'] if not Path(doc['input_path']).is_absolute() else Path(doc['input_path'])
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    folder.mkdir(parents=True, exist_ok=True)
    out = folder / 'proposal.json'
    run([str(venv_python(ROOT / '.venv-privacy-trial')), '-X', 'utf8', str(ROOT / 'scripts/propose_privacy.py'),
         '--source', str(source), '--output', str(out), '--models', str(ROOT / 'models/privacy')])
    proposal = json.loads(out.read_text(encoding='utf-8'))
    if proposal.get('sha256') != sha:
        raise SystemExit(f"Proposal for {doc['document_id']} does not match its image")
    summary = proposal_summary(proposal, sha, proposal['size'])
    plan = automatic_plan(summary, 'hybrid-' + doc['document_id'])
    info = dict(crop_reason=summary['crop_reason'], crop=summary['crop'], masks=len(summary['masks']),
                mask_polygons=len(summary['mask_polygons']), review_count=summary['review_count'])
    return sha, plan, info


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--manifest', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--engine', choices=API_ENGINES, default='gemini')
    p.add_argument('--min-values', type=int, default=MIN_VALUES,
                   help='Fewest local values a page needs before it can skip the API')
    p.add_argument('--privacy', choices=('auto', 'manifest'), default='auto',
                   help='auto: propose crop/mask locally (default); manifest: use the plan given per document')
    p.add_argument('--dry-run', action='store_true', help='Route and propose masks only; do not call the LLM API')
    args = p.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
    docs = manifest['documents']
    args.output.mkdir(parents=True, exist_ok=True)

    # 1. Local OCR for every page, using the existing local runner unchanged.
    local_manifest = args.output / 'manifest-local.json'
    local_manifest.write_text(json.dumps(dict(documents=[
        dict(document_id=d['document_id'], input_path=d['input_path']) for d in docs]), ensure_ascii=False),
        encoding='utf-8')
    local_seconds = run([str(venv_python(ROOT / '.venv-senocr')), '-X', 'utf8', str(ROOT / 'scripts/run_automatic_pool.py'),
                         '--manifest', str(local_manifest), '--output', str(args.output / 'local')])

    # 2. Decide per page.
    routes = route(candidate_pool(args.output / 'local'), [d['document_id'] for d in docs], min_values=args.min_values)
    to_api = []
    privacy_seconds = 0.0
    for d in docs:
        r = routes[d['document_id']]
        if r['route'] != 'api':
            continue
        if args.privacy == 'manifest':
            to_api.append(d)
            continue
        start = time.monotonic()
        sha, plan, info = propose(d, args.output / 'privacy' / d['document_id'])
        privacy_seconds += time.monotonic() - start
        r['privacy'] = info
        if plan is None:
            r['route'] = 'held'          # needs a person to review the masking: never sent
        elif plan.get('skip'):
            r['route'] = 'skipped'       # chart-only page: nothing to extract
        else:
            to_api.append(dict(document_id=d['document_id'], input_path=d['input_path'],
                               input_sha256=sha, privacy=plan))

    # 3. Flow B (mask + gate + LLM) for the sendable routed pages only, using the existing API runner unchanged.
    api_seconds = 0.0
    if to_api and not args.dry_run:
        api_manifest = args.output / 'manifest-api.json'
        api_manifest.write_text(json.dumps(dict(documents=to_api), ensure_ascii=False), encoding='utf-8')
        api_seconds = run([sys.executable, '-X', 'utf8', str(ROOT / 'scripts/run_llm_pool.py'),
                           '--manifest', str(api_manifest), '--output', str(args.output / 'api'),
                           '--engine', args.engine])

    summary = dict(
        flow='C-hybrid', pages=len(docs),
        pages_local=sum(r['route'] == 'local' for r in routes.values()),
        pages_api=len(to_api),
        pages_held=sum(r['route'] == 'held' for r in routes.values()),
        pages_skipped=sum(r['route'] == 'skipped' for r in routes.values()),
        api_called=bool(to_api and not args.dry_run),
        seconds=dict(local_ocr=local_seconds, privacy=round(privacy_seconds, 2), api=api_seconds),
        routes=routes)
    (args.output / 'routing.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in summary.items() if k != 'routes'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
