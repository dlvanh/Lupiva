"""Rebuild an intake candidate pool from its saved API responses with current code.

No API call is made: the extractor returns the stored response whose outgoing
image hash matches the freshly prepared crop. Local OCR, crop/mask preparation,
post-processing and bundle building all run with the current code, so this
measures post-API changes without model variance. Output goes to a new folder;
the registry database is not touched.
"""
import argparse
import hashlib
import json
from pathlib import Path

from ocr_pool.llm_workflow import run


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--intake', required=True, help='Intake folder containing manifest.json')
    parser.add_argument('--responses', required=True, help='Folder of saved image-NNN.json API responses')
    parser.add_argument('--output', required=True, help='New output folder (must not exist)')
    parser.add_argument('--workspace', default='.')
    args = parser.parse_args(argv)
    saved = {}
    for path in sorted(Path(args.responses).glob('image-[0-9][0-9][0-9].json')):
        result = json.loads(path.read_text(encoding='utf-8'))
        saved[result['outgoing_sha256']] = result
    missing = []

    def extractor(body, dictionary, workspace):
        digest = hashlib.sha256(body).hexdigest()
        if digest not in saved:
            missing.append(digest)
            raise ValueError('No saved API response for prepared crop ' + digest[:12])
        result = dict(saved[digest])
        for key in ('local_report_findings', 'local_report_finding', 'elapsed_seconds', 'outgoing_sha256'):
            result.pop(key, None)
        return result

    manifest = json.loads((Path(args.intake) / 'manifest.json').read_text(encoding='utf-8'))
    bundle = run(manifest, Path(args.output), Path(args.workspace), extractor=extractor,
                 engine='tokenharbor')
    print(json.dumps(dict(bundle=str(bundle), saved=len(saved), missing=missing)))


if __name__ == '__main__':
    main()
