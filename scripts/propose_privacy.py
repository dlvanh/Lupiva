"""Prepare a local-only proposal for the upload preview worker."""
import argparse
import hashlib
import json
from pathlib import Path
import socket
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--models', required=True, type=Path)
    args = parser.parse_args()
    # This process only reads installed local models. No fallback download/API.
    def offline(*args, **kwargs):
        raise RuntimeError('Network is disabled for local image proposals')
    socket.socket.connect = offline
    socket.socket.connect_ex = offline
    socket.create_connection = offline
    from PIL import Image, ImageOps
    from ocr_pool.privacy_ocr import analyze
    with Image.open(args.source) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
    plan, lines = analyze(image, args.models)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    plan.update(sha256=hashlib.sha256(args.source.read_bytes()).hexdigest(), size=list(image.size))
    ocr = json.dumps(dict(lines=lines), ensure_ascii=False).encode('utf-8')
    (args.output.parent / 'ocr-local.json').write_bytes(ocr)
    plan['ocr_sha256'] = hashlib.sha256(ocr).hexdigest()
    args.output.write_text(json.dumps(plan, ensure_ascii=False), encoding='utf-8')


if __name__ == '__main__':
    main()
