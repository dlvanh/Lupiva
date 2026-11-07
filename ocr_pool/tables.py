"""Strict adapters for explicit tables. Never infer columns from plain prose."""
import csv
from dataclasses import dataclass
from html.parser import HTMLParser
import io
import re


class TableError(ValueError):
    pass


class HeaderOnlyTableError(TableError):
    """A structurally explicit grid with headers but no recognized body rows."""


@dataclass
class Table:
    rows: list
    header_rows: int = 1

    def __post_init__(self):
        if not self.rows or not (1 <= self.header_rows < len(self.rows)):
            raise TableError('Table needs explicit headers and at least one data row')
        width = len(self.rows[0])
        if width < 2 or any(len(r) != width for r in self.rows):
            raise TableError('Inconsistent column count; do not shift cells to repair it')
        if not all(isinstance(c, str) for r in self.rows for c in r):
            raise TableError('All cells must be text')

    @property
    def headers(self):
        return [' / '.join(dict.fromkeys(row[c].strip() for row in self.rows[:self.header_rows]
                                         if row[c].strip())) for c in range(len(self.rows[0]))]


class HTMLTables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables, self.rows, self.row = [], None, None
        self.cell = None
        self.closed = True

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table':
            if self.rows is not None:
                raise TableError('Nested tables are unsupported')
            self.rows, self.closed = [], False
        elif tag == 'tr' and self.rows is not None:
            if self.row is not None:
                raise TableError('Unclosed table row')
            self.row = []
        elif tag in ('td', 'th') and self.rows is not None:
            if self.row is None or self.cell is not None:
                raise TableError('Cell outside row or overlapping cell tags')
            try:
                rs, cs = int(attrs.get('rowspan', 1)), int(attrs.get('colspan', 1))
            except ValueError as error:
                raise TableError('Noninteger span') from error
            if not (1 <= rs <= 200 and 1 <= cs <= 100):
                raise TableError('Span exceeds supported limits')
            self.cell = {'text': '', 'rowspan': rs, 'colspan': cs, 'header': tag == 'th'}
        elif tag == 'br' and self.cell is not None:
            self.cell['text'] += ' '

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['text'] += data

    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.rows is not None:
            if self.cell is None:
                raise TableError('Unexpected cell close')
            self.cell['text'] = re.sub(r'\s+', ' ', self.cell['text']).strip()
            self.row.append(self.cell)
            self.cell = None
        elif tag == 'tr' and self.rows is not None:
            if self.cell is not None or self.row is None:
                raise TableError('Malformed row')
            self.rows.append(self.row)
            self.row = None
        elif tag == 'table' and self.rows is not None:
            if self.row is not None or self.cell is not None:
                raise TableError('Truncated table')
            self.tables.append(self.expand())
            self.rows, self.closed = None, True

    def expand(self):
        cells, header_rows = {}, 0
        for r, row in enumerate(self.rows):
            # A body row may use <th> for its name cell; it is not a new header.
            if row and all(c['header'] for c in row) and r == header_rows:
                header_rows += 1
            col = 0
            for cell in row:
                while (r, col) in cells:
                    col += 1
                for rr in range(r, r + cell['rowspan']):
                    for cc in range(col, col + cell['colspan']):
                        if (rr, cc) in cells:
                            raise TableError('Overlapping spans')
                        cells[rr, cc] = cell['text']
                col += cell['colspan']
        if not cells:
            raise TableError('Empty HTML table')
        if max(r for r, c in cells) >= len(self.rows):
            raise TableError('Rowspan extends beyond table')
        width = max(c for r, c in cells) + 1
        grid = []
        for r in range(len(self.rows)):
            if any((r, c) not in cells for c in range(width)):
                raise TableError('Missing HTML cell; reject rather than padding')
            grid.append([cells[r, c] for c in range(width)])
        return Table(grid, header_rows or 1)


def otsl_table(value, header_rows=1):
    """Read explicit OTSL cells/spans; reject invalid grids, without padding.

    Tag meanings follow PaddleX's OTSL format. This implementation retains a
    strict rectangular grid instead of repairing missing/trailing cells.
    https://github.com/PaddlePaddle/PaddleX/blob/develop/paddlex/inference/pipelines/paddleocr_vl/uilts.py
    """
    pattern = re.compile(r'(<(?:fcel|ecel|lcel|ucel|xcel|nl)>)')
    pieces = pattern.split(value)
    if pieces[0].strip() or not value.rstrip().endswith('<nl>'):
        raise TableError('OTSL has extra prefix or an incomplete final row')
    origins, texts, row = [], {}, []
    for i in range(1, len(pieces), 2):
        tag, content = pieces[i], pieces[i + 1]
        if re.search(r'<[A-Za-z_]+>', content):
            raise TableError('Unsupported OTSL tag in cell content')
        if tag == '<nl>':
            if content.strip() or not row:
                raise TableError('Invalid OTSL row terminator')
            origins.append(row)
            row = []
            continue
        r, c = len(origins), len(row)
        if tag == '<fcel>':
            origin = (r, c)
            texts[origin] = re.sub(r'\s+', ' ', content).strip()
            if not texts[origin]:
                raise TableError('Filled OTSL cell has no content')
        else:
            if content.strip():
                raise TableError('Empty/continuation OTSL cell unexpectedly has content')
            if tag == '<ecel>':
                origin = (r, c)
                texts[origin] = ''
            elif tag == '<lcel>':
                if not row:
                    raise TableError('OTSL left continuation has no left cell')
                origin = row[-1]
            elif tag == '<ucel>':
                if not origins or c >= len(origins[-1]):
                    raise TableError('OTSL upper continuation has no upper cell')
                origin = origins[-1][c]
            else:  # xcel: continuation of the same merged cell in both directions
                if not origins or not row or c >= len(origins[-1]) or row[-1] != origins[-1][c]:
                    raise TableError('OTSL cross continuation has inconsistent neighbours')
                origin = row[-1]
        row.append(origin)
    if row or not origins or any(len(r) != len(origins[0]) for r in origins):
        raise TableError('Inconsistent OTSL row widths; no automatic padding')
    positions = {}
    for r, origin_row in enumerate(origins):
        for c, origin in enumerate(origin_row):
            positions.setdefault(origin, []).append((r, c))
    for coordinates in positions.values():
        rr, cc = zip(*coordinates)
        if len(coordinates) != (max(rr) - min(rr) + 1) * (max(cc) - min(cc) + 1):
            raise TableError('Nonrectangular OTSL merged cell')
    if len(origins) == 1:
        raise HeaderOnlyTableError('OCR contains one header row and no body rows; source needs review')
    return Table([[texts[origin] for origin in row] for row in origins], header_rows)


def parse_tables(raw, fmt='auto', header_rows=None):
    if isinstance(raw, list):
        return [Table(raw, header_rows or 1)]
    # Preserve trailing TABs: an empty final column is real table structure.
    value = raw.strip(' \r\n')
    if value.startswith('```'):
        if not value.endswith('```'):
            raise TableError('Truncated code fence')
        value = '\n'.join(value.splitlines()[1:-1]).strip()
    if fmt == 'auto':
        if value.startswith(('<fcel>', '<ecel>')):
            fmt = 'otsl'
        elif re.search(r'<table\b', value, re.I):
            fmt = 'html'
        elif '\t' in value:
            fmt = 'tsv'
        elif value.startswith('|'):
            fmt = 'markdown'
        else:
            raise TableError('No explicit table structure; reread crop with table recognition')
    if fmt == 'otsl':
        return [otsl_table(value, header_rows or 1)]
    if fmt == 'html':
        parser = HTMLTables()
        parser.feed(value)
        parser.close()
        if not parser.closed or not parser.tables:
            raise TableError('Unclosed or missing HTML table')
        return parser.tables
    if fmt == 'tsv':
        rows = list(csv.reader(io.StringIO(value), delimiter='\t'))
    elif fmt == 'markdown':
        rows = []
        for line in value.splitlines():
            if not line.strip():
                continue
            if not line.strip().startswith('|') or not line.strip().endswith('|') or '\\|' in line:
                raise TableError('Ambiguous Markdown row')
            cells = [c.strip() for c in line.strip()[1:-1].split('|')]
            if all(re.fullmatch(r':?-{3,}:?', c) for c in cells):
                continue
            rows.append(cells)
    else:
        raise TableError(f'Unsupported table format: {fmt}')
    return [Table(rows, header_rows or 1)]
