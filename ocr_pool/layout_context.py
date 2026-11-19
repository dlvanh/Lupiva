"""Read context from explicit OCR headings/legends, never assay result values."""
import hashlib
import re
from decimal import Decimal, InvalidOperation

from .metadata import fold, metadata_response_flags
from .tables import parse_tables, TableError


def blood_table_context(table, columns):
    """Recognize a coherent CBC table by labels and units, never result values.

    This context belongs to this table only. Urine and mixed section tables
    cannot acquire a blood specimen from a neighbouring CBC or isolated WBC.
    """
    from .rules import unit_key, strip_label_checkmarks
    if 'name' not in columns or 'unit' not in columns:
        return {}
    expected = {'RBC': {'10^12/l'}, 'HGB': {'g/l'}, 'MCV': {'fl'},
                'WBC': {'10^9/l'}, 'PLT': {'10^9/l'}}
    hits = set()
    marked_labels = False
    for row in table.rows[table.header_rows:]:
        raw_name = row[columns['name']].strip()
        name = strip_label_checkmarks(raw_name)
        if re.search(r'\b(?:urine|nuoc tieu|biochemistry|hoa sinh)\b', fold(name)):
            return {}
        for label, units in expected.items():
            if (re.search(r'(?:^|[-\s])' + label + r'$', name, re.I)
                    and unit_key(row[columns['unit']]) in units):
                hits.add(label)
                marked_labels |= name != raw_name
    if len(hits) >= 4 and {'RBC', 'WBC'} <= hits:
        context = {'specimen': 'blood', 'specimen_context_method': 'cbc_label_unit_cooccurrence',
                   'specimen_context_labels': sorted(hits)}
        if marked_labels:
            context['specimen_context_label_normalization'] = 'edge_checkmarks_for_matching_only'
        return context
    return {}


def round_class_reading(class_raw, parsed, context):
    """Read a round Class symbol, independently corroborated by this legend.

    Never rewrite raw text or derive a class from intensity alone. An explicit
    same-document legend, supported panel and unique agreeing interval are
    required; all other unresolved symbols keep the conservative behavior.
    """
    if (class_raw not in {'o', 'O', '0'}
            or context.get('panel') not in {'myositis', 'ana_profile_23'}
            or context.get('context_conflicts')
            or parsed.get('comparator') != '=' or parsed.get('numeric_value') is None):
        return None
    evidence = [e for e in context.get('ocr_context_evidence', [])
                if e.get('purpose') == 'printed_class_legend' and e.get('region_id') and e.get('raw_sha256')]
    if not evidence:
        return None
    legend, ranges = context.get('class_legend', {}), context.get('intensity_ranges', {})
    try:
        value = Decimal(parsed['numeric_value'])
        hits = []
        for symbol, limits in ranges.items():
            if symbol not in legend or len(limits) != 2:
                return None
            lower, upper = (Decimal(str(v)) for v in limits)
            if not all(v.is_finite() for v in (lower, upper, value)) or lower > upper:
                return None
            if lower <= value <= upper:
                hits.append(symbol)
    except (InvalidOperation, TypeError, ValueError):
        return None
    if len(hits) != 1:
        return None
    symbol = hits[0]
    if symbol not in {'o', 'O', '0'} or legend[symbol] != 'negative':
        return None
    return dict(class_symbol='o', qualitative_value='negative', class_legend_symbol=symbol,
                class_interpretation_origin='source_legend',
                class_interpretation_method='source_legend_round_symbol_range_agreement',
                class_interpretation_range=list(ranges[symbol]),
                class_interpretation_evidence=evidence)


def round_symbol_agreement(class_raw, parsed, context):
    """Compatibility: report only digit/letter differences for review flags."""
    reading = round_class_reading(class_raw, parsed, context)
    if not reading:
        return None
    symbol = reading['class_legend_symbol']
    if '0' not in {symbol, class_raw} or symbol == class_raw:
        return None
    return reading


def explicit_panel(raw):
    text = fold(re.sub(r'<[^>]*>', ' ', raw))
    panels = set()
    if re.search(r'\bana\s*(?:profile\s*)?23\b|panel\s+ana', text):
        panels.add('ana_profile_23')
    if re.search(r'\bmyositis\b|viem\s+da\s+co', text):
        panels.add('myositis')
    if re.search(r'\bspirometry\b|\bplethysmography\b', text):
        panels.add('pft')
    return next(iter(panels)) if len(panels) == 1 else None


def document_context(document):
    all_sources = [p for p in document.get('text_regions', []) + document.get('tables', [])
                   if not p.get('truncated') and p.get('generation_status', 'ok') == 'ok'
                   and not metadata_response_flags(p['raw'])]
    # Parent headings remain useful, but parent legends must not override a
    # selected refinement. Keep conflicting selected legends unresolved.
    panels = {p for source in all_sources if (p := explicit_panel(source['raw']))}
    context = {}
    if len(panels) == 1:
        context['panel'] = next(iter(panels))
    provenance = []
    legend_candidates = []
    for source in all_sources:
        raw = source['raw']
        if explicit_panel(raw):
            provenance.append(dict(region_id=source['table_id'], raw_sha256=hashlib.sha256(raw.encode()).hexdigest(),
                                   purpose='explicit_panel_heading'))
        if source.get('format') == 'text' or source.get('superseded_by'):
            continue
        try:
            tables = parse_tables(raw)
        except TableError:
            continue
        for table in tables:
            for row in table.rows:
                if len(row) != 3:
                    continue
                if [fold(c.strip()) for c in row] == ['class', 'intensity', 'explanation']:
                    symbols, ranges = {}, {}
                    for symbol, intensity, meaning in table.rows[table.rows.index(row) + 1:]:
                        interpretation = {'negative': 'negative', 'borderline': 'borderline',
                                          'positive': 'positive', 'strong positive': 'strong_positive'}.get(fold(meaning.strip()))
                        if interpretation and symbol.strip() in {'o', 'O', '0', '(+)', '+', '++', '+++'}:
                            symbols[symbol.strip()] = interpretation
                            match = re.fullmatch(r'(\d+)\s*[-–]\s*(\d+)', intensity.strip())
                            if match:
                                ranges[symbol.strip()] = [int(match[1]), int(match[2])]
                    if symbols:
                        legend_candidates.append((symbols, ranges))
                        provenance.append(dict(region_id=source['table_id'],
                                               raw_sha256=hashlib.sha256(raw.encode()).hexdigest(), purpose='printed_class_legend'))
    if legend_candidates:
        if all(candidate == legend_candidates[0] for candidate in legend_candidates):
            context['class_legend'], context['intensity_ranges'] = legend_candidates[0]
        else:
            context.setdefault('context_conflicts', []).append('printed_class_legends_disagree')
    if len(panels) > 1:
        context.setdefault('context_conflicts', []).append('explicit_panel_headings_disagree')
    if provenance:
        context['ocr_context_evidence'] = provenance
    return context
