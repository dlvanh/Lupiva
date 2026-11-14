"""Versioned literal lab result rules, with an optional SQLite override."""
from contextlib import closing
from pathlib import Path
import sqlite3

from .metadata import fold

COLOUR_LABELS = {'mau sac', 'color', 'colour', 'urine color', 'urine colour', 'mau sac nuoc tieu'}


def load_result_rules(path=None):
    uri = Path(path).resolve().as_uri() + '?mode=ro' if path else ':memory:'
    with closing(sqlite3.connect(uri, uri=True)) as db:
        if path is None:
            schema = Path(__file__).resolve().parents[1] / 'schemas' / 'result-literals.sql'
            db.executescript(schema.read_text(encoding='utf-8'))
        return {(scope, token): version for version, scope, token in
                db.execute('SELECT version, scope, token FROM result_literals')}


def match_result_literal(row, rules):
    if row.get('qualitative_value') or any(row.get(key) is not None for key in (
            'numeric_value', 'comparator', 'pattern_raw', 'titre_raw', 'grade_raw', 'grade_annotation',
            'class_header', 'class_raw')):
        return None
    raw = row.get('raw_result', '').strip()
    token = ' '.join(fold(raw).split())
    label = ' '.join(fold(row.get('source_label', '')).split())
    for scope in ('result', 'colour') if label in COLOUR_LABELS else ('result',):
        version = rules.get((scope, token))
        if version:
            return raw, dict(version=version, scope=scope, token=token)
    return None
