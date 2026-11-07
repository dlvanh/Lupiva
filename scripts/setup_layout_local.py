"""Download only public PP-DocLayoutV3 assets at an immutable revision.

Does not inspect medical files, upload data or alter torch/CUDA dependencies.
"""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = 'PaddlePaddle/PP-DocLayoutV3_safetensors'
REVISION = 'e4f489dc536556fc1be02b973ba06756e0d4a2ac'
WEIGHTS_SHA256 = '5ea422c6cc5fe759a47e1357c35639b58173508e025a3131cbe4b6ac59e2b85e'
WEIGHTS_SIZE = 133270468


def main():
    target = ROOT / 'models/PP-DocLayoutV3'
    target.mkdir(parents=True, exist_ok=True)
    records = []
    for name in ['config.json', 'preprocessor_config.json', 'model.safetensors', 'README.md', 'inference.yml']:
        path = target / name
        url = f'https://huggingface.co/{REPO}/resolve/{REVISION}/{name}'
        if path.exists():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if name == 'model.safetensors' and (digest != WEIGHTS_SHA256 or path.stat().st_size != WEIGHTS_SIZE):
                raise ValueError('Existing layout weights fail verification; refusing to overwrite')
        else:
            partial = path.with_suffix(path.suffix + '.part')
            digest = hashlib.sha256()
            size = 0
            with urllib.request.urlopen(url, timeout=60) as response, partial.open('wb') as out:
                while chunk := response.read(1024 * 1024):
                    out.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
            digest = digest.hexdigest()
            if name == 'model.safetensors' and (digest != WEIGHTS_SHA256 or size != WEIGHTS_SIZE):
                raise ValueError('Downloaded layout weights fail verification')
            partial.replace(path)
        records.append(dict(path=name, bytes=path.stat().st_size, sha256=digest, url=url))
        print(f'Verified {name}: {path.stat().st_size} bytes', flush=True)
    (target / 'download-manifest.json').write_text(json.dumps(dict(
        repo=REPO, revision=REVISION, downloaded_at_utc=datetime.now(timezone.utc).isoformat(),
        public_assets_only=True, files=records), indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
