param(
    [switch]$CheckOnly,
    [switch]$SkipModel
)

# Run from a normal Windows PowerShell if the Codex session blocks networking.
# Installs into the existing project venv. Never replaces PyTorch/CUDA.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $projectRoot '.venv-senocr\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    throw 'Project venv not found. Expected .venv-senocr\Scripts\python.exe.'
}

Push-Location -LiteralPath $projectRoot
try {
    @'
import sys, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')
targets = (
    ('PyPI', 'https://pypi.org/pypi/transformers/json'),
    ('Hugging Face', 'https://huggingface.co/VietAlphaLabs/SenOCR-Vi/resolve/main/config.json'),
)
failures = 0
for label, url in targets:
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            print(f'{label}: HTTP {response.status}')
    except (OSError, urllib.error.URLError) as error:
        failures += 1
        print(f'{label}: {type(error).__name__}: {error}')
if failures:
    print('Network check failed. No packages or model files were downloaded.')
    print('If normal Windows PowerShell works but Codex does not, enable network access in the Codex session configuration.')
    sys.exit(2)
'@ | & $pythonExe -
    if ($LASTEXITCODE -ne 0) { throw 'HTTPS access blocked. Setup stopped before installation.' }
    if ($CheckOnly) { return }

    & $pythonExe -c "import torch; print('Existing torch:', torch.__version__); print('CUDA:', torch.cuda.is_available()); assert torch.cuda.is_available(), 'CUDA unavailable'"
    if ($LASTEXITCODE -ne 0) { throw 'Existing PyTorch/CUDA check failed. PyTorch was not modified.' }

    # Match the versions recorded in the user's earlier working Kaggle notebook.
    & $pythonExe -m pip install --disable-pip-version-check --retries 1 --timeout 30 --only-binary=:all: 'transformers==5.20.2' 'accelerate==1.15.0' huggingface-hub pillow
    if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed. Review the network/package error above.' }
    if ($SkipModel) { return }

    @'
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json
from huggingface_hub import HfApi, snapshot_download
repo = 'VietAlphaLabs/SenOCR-Vi'
revision = HfApi().model_info(repo).sha
target = Path('models/SenOCR-Vi')
target.mkdir(parents=True, exist_ok=True)
snapshot_download(
    repo_id=repo, revision=revision, local_dir=str(target),
    allow_patterns=['*.json', '*.safetensors', '*.model', '*.txt', '*.jinja', 'LICENSE*', 'README.md'],
)
files = []
for path in sorted(target.rglob('*')):
    if not path.is_file() or '.cache' in path.relative_to(target).parts or path.name == 'download-manifest.json':
        continue
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    files.append({'path': path.relative_to(target).as_posix(), 'bytes': path.stat().st_size, 'sha256': digest.hexdigest()})
(target / 'download-manifest.json').write_text(json.dumps({
    'repo_id': repo, 'revision': revision, 'files': files,
    'downloaded_at_utc': datetime.now(timezone.utc).isoformat(),
}, indent=2), encoding='utf-8')
print('Downloaded model:', target.resolve())
print('Pinned revision:', revision)
print('No medical inputs were read or uploaded. OCR inference has not run yet.')
'@ | & $pythonExe -
    if ($LASTEXITCODE -ne 0) { throw 'Model download failed. Rerun this script to resume cached downloads.' }
} finally {
    Pop-Location
}
