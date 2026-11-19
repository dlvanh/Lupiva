[CmdletBinding()]
param(
    [switch]$SkipSetup,
    [switch]$PreflightOnly,
    [ValidateSet('auto', 'bfloat16', 'float16', 'float32')]
    [string]$Precision = 'auto',
    [ValidateRange(1, 100)] [int]$Repeats = 1,
    [ValidateRange(147456, 9437184)] [int]$MaxPixels = 1048576,
    [ValidateRange(1, 16384)] [int]$MaxNewTokens = 2048,
    [ValidateSet('OCR:', 'Table Recognition:')] [string]$Prompt = 'OCR:'
)
$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$venvDirectory = Join-Path $workspaceRoot '.venv-senocr'
$pythonExecutable = Join-Path $venvDirectory 'Scripts/python.exe'
$benchmarkScript = Join-Path $PSScriptRoot 'benchmark_senocr.py'
$env:HF_HOME = Join-Path $workspaceRoot '.cache/huggingface'
$env:PIP_CACHE_DIR = Join-Path $workspaceRoot '.cache/pip'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$env:HF_HUB_DISABLE_XET = '1'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:PYTHONUTF8 = '1'

function Invoke-CheckedPython {
    param([string[]]$PythonArgs)
    # Windows PowerShell 5 may promote native stderr warnings to errors when
    # the caller redirects logs. Judge pip/python by their exit code instead.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $script:pythonExecutable @PythonArgs
        $commandExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($commandExitCode -ne 0) { throw "Python command failed with exit code $commandExitCode" }
}

if ($PreflightOnly) {
    if (Test-Path -LiteralPath $pythonExecutable) {
        & $pythonExecutable $benchmarkScript --preflight
    } else {
        & py -3.11 $benchmarkScript --preflight
    }
    exit $LASTEXITCODE
}

if (-not $SkipSetup) {
    if (-not (Test-Path -LiteralPath $pythonExecutable)) {
        & py -3.11 -m venv $venvDirectory
        if ($LASTEXITCODE -ne 0) { throw 'Could not create project-local Python environment' }
    }
    # Download only libraries and public model files; no image input is sent.
    Remove-Item Env:HF_HUB_OFFLINE -ErrorAction SilentlyContinue
    Remove-Item Env:TRANSFORMERS_OFFLINE -ErrorAction SilentlyContinue
    Invoke-CheckedPython -PythonArgs @('-m','pip','install','torch','torchvision','--index-url','https://download.pytorch.org/whl/cu128','--timeout','20','--retries','1')
    Invoke-CheckedPython -PythonArgs @('-m','pip','install','transformers>=5.0.0,<6','pillow','huggingface_hub','safetensors','sentencepiece','nvidia-ml-py','--timeout','20','--retries','1')
    Invoke-CheckedPython -PythonArgs @($benchmarkScript,'--prepare')
}
if (-not (Test-Path -LiteralPath $pythonExecutable)) { throw 'Local environment missing. Run without -SkipSetup first.' }

# Offline Hugging Face operation + local_files_only; no remote inference calls.
# Network firewall policy remains an infrastructure control, independent of these flags.
$env:HF_HUB_OFFLINE = '1'
$env:TRANSFORMERS_OFFLINE = '1'
Invoke-CheckedPython -PythonArgs @($benchmarkScript,'--precision',$Precision,
    '--repeats',"$Repeats",'--max-pixels',"$MaxPixels",'--max-new-tokens',"$MaxNewTokens",'--prompt',$Prompt)
