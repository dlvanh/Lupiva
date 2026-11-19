"""Explicit opt-in test-data flags, shared by the review server and workers."""
import os
from pathlib import Path


def workspace_flag(workspace, name):
    """Environment wins over .env; only the literal value 1 enables a flag."""
    if os.environ.get(name) is not None:
        return os.environ[name].strip() == '1'
    try:
        lines = (Path(workspace) / '.env').read_text(encoding='utf-8-sig').splitlines()
    except OSError:
        return False
    for line in lines:
        key, _, value = line.strip().partition('=')
        if key.strip() == name:
            return value.strip().strip('"').strip("'") == '1'
    return False


def prototype_direct_llm(workspace):
    """Synthetic images only: send the full image without any local OCR."""
    return workspace_flag(workspace, 'LUPIVA_PROTOTYPE_DIRECT_LLM')
