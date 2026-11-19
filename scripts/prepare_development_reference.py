"""Prepare scoped field references independently of OCR predictions.

Uses only the already saved visual-transcription drafts for declared
development regions. Never passes expected values to the OCR runner.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REF = ROOT / 'examples/ocr-reference-draft'


def main():
    # Explicit Word mappings and source-row labels, not the parser's resolver.
    wanted = {
        'Ure': 'REN04', 'Creatinin': 'REN05', 'Ferritin': 'IMM21', 'GGT': 'GI03',
        'ASAT (GOT)': 'GI01', 'ALAT (GPT)': 'GI02',
        'Định lượng CRP': 'IMM19', 'Định lượng IgE (Immunoglobuline E)': 'IMM13',
        'Định lượng IgA (Immunoglobuline A)': 'IMM14',
        'Định lượng IgG (Immunoglobuline G)': 'IMM15',
        'Định lượng IgM (Immunoglobuline M)': 'IMM16', 'Định lượng KL-6 (#)': 'IMM18',
        'Định lượng Interleukin - 6 human [INTERLEUKIN-6 (IL6)]': 'IMM17',
    }
    observations = []
    for line_no, line in enumerate((REF / 'text/IN01.txt').read_text(encoding='utf-8').splitlines(), 1):
        cells = line.split('\t')
        if cells[0] in wanted:
            observations.append(dict(document_id='IN01', field_id=wanted[cells[0]], component='result',
                                     numeric_value=cells[1], comparator='=', unit_raw=cells[2], panel=None,
                                     reference_source='text/IN01.txt', reference_line_1based=line_no))
    ana_rows = []
    for line_no, line in enumerate((REF / 'text/IN09.txt').read_text(encoding='utf-8').splitlines(), 1):
        cells = line.split('\t')
        if len(cells) == 3 and '[AC-' in cells[0]:
            ana_rows.append((line_no, cells))
        elif len(cells) == 3 and cells[0].startswith('Ro-52 ('):
            ana_rows.append((line_no, cells))
    if len(ana_rows) != 23 or len(observations) != 13:
        raise ValueError('Visual reference content changed; inspect before rebuilding expected tuples')
    legend = {'o': 'negative', '(+)': 'borderline', '+': 'positive', '++': 'positive', '+++': 'strong_positive'}
    for i, (line_no, cells) in enumerate(ana_rows, 1):
        observations.append(dict(document_id='IN09', field_id=f'ANA{i:02d}', component='intensity',
                                 numeric_value=cells[1], comparator='=', unit_raw=None,
                                 qualitative_value=legend[cells[2]], panel='ana_profile_23',
                                 reference_source='text/IN09.txt', reference_line_1based=line_no))

    def rows(did):
        for line_no, line in enumerate((REF / f'text/{did}.txt').read_text(encoding='utf-8').splitlines(), 1):
            yield line_no, line.split('\t')

    def append(did, fid, cells, line, *, component='result', panel=None, **values):
        observations.append(dict(document_id=did, field_id=fid, component=component, panel=panel,
                                 reference_source=f'text/{did}.txt', reference_line_1based=line, **values))

    myo_labels = ['Mi-2alpha (Mi-2a)', 'Mi-2beta (Mi-2b)', 'TIF1gamma (TIF1g)', 'MDA5 (MDA5)',
                  'SAE1 (SAE1)', 'Ku (Ku)', 'PM-Scl100 (PM100)', 'PM-Scl75 (PM75)', 'Jo-1 (Jo-1)',
                  'SRP (SRP)', 'PL-7 (PL-7)', 'PL-12 (PL-12)', 'EJ (EJ)', 'Ro52 (Ro52)',
                  'cN-1A (cN-1A)', 'HMGCR (HMGCR)']
    for line, cells in rows('IN08'):
        if cells[0] in myo_labels and len(cells) == 3:
            append('IN08', f'MYO{myo_labels.index(cells[0])+1:02d}', cells, line, component='intensity',
                   panel='myositis', numeric_value=cells[1], comparator='=', unit_raw=None,
                   qualitative_value=legend[cells[2]])

    cbc = dict(RBC='HEM01', HGB='HEM02', MCV='HEM03', MCHC='HEM04', WBC='HEM05', PLT='HEM11')
    for code, fid in [('NE', 'HEM06'), ('LY', 'HEM07'), ('MO', 'HEM08'), ('EO', 'HEM09'), ('BA', 'HEM10')]:
        cbc[code+'#'] = cbc[code+'%'] = fid
    for line, cells in rows('IN11'):
        suffix = cells[0].rsplit('-', 1)[-1]
        if suffix in cbc:
            component = 'percentage' if suffix.endswith('%') else 'absolute_count' if suffix.endswith('#') else 'result'
            append('IN11', cbc[suffix], cells, line, component=component,
                   numeric_value=cells[1], comparator='=', unit_raw=cells[2])

    pft_labels = ['VC(L)', 'FVC(L)', 'FEV1(L)', 'FEV1/VC(%)', 'FEV1/FVC(%)', 'TLC(L)',
                  'RV(L)', 'RV/TLC(%)', 'Va(L)', 'Kco (Hb)(mL/mmHg/Mi)', 'Tlco (Hb)(mL/mmHg/Mi)']
    for line, cells in rows('IN02'):
        if cells[0] in pft_labels:
            fid = f'PFT{pft_labels.index(cells[0])+1:02d}'
            unit = '%' if '(%)' in cells[0] else 'mL/mmHg/Mi' if 'mmHg' in cells[0] else 'L'
            append('IN02', fid, cells, line, component='pre_measured', panel='pft',
                   numeric_value=cells[4], comparator='=', unit_raw=unit)
            append('IN02', fid, cells, line, component='pre_percent_predicted', panel='pft',
                   numeric_value=cells[5], comparator='=', unit_raw='%')
    # Blank Post columns are explicitly excluded from numeric accuracy counts.

    myo_print_labels = ['Mi-2α', 'Mi-2β', 'TIF1γ', 'MDA5', 'SAE1', 'Ku', 'PM-Scl100', 'PM-Scl75',
                        'Jo-1', 'SRP', 'PL-7', 'PL-12', 'EJ', 'Ro-52', 'cN-1A', 'HMGCR']
    ana_print_labels = ['dsDNA', 'Nucleosomes', 'Histones', 'SS-A', 'Ro-52', 'SS-B', 'nRNP/Sm', 'Sm',
                        'Mi-2α protein', 'Mi-2β protein', 'Ku protein', 'Centromere protein A',
                        'Centromere protein B', 'Sp 100 protein', 'PML protein', 'Scl-70',
                        'PM-Scl 100 protein', 'PM-Scl75 protein', 'RP11 (subunit POLR3K)',
                        'RP155 (subunit POLR3A)', 'gp210 protein', 'PCNA', 'DFS70']
    for did, labels, prefix, panel in [('IN04', myo_print_labels, 'MYO', 'myositis'),
                                       ('IN06', ana_print_labels, 'ANA', 'ana_profile_23')]:
        for line, cells in rows(did):
            if cells[0] in labels:
                match = re.fullmatch(r'(\d+) (Negative|Borderline|Strong positive)', cells[1])
                if not match:
                    raise ValueError('Unexpected source panel reference format')
                append(did, f'{prefix}{labels.index(cells[0])+1:02d}', cells, line, panel=panel,
                       numeric_value=match[1], comparator='=', unit_raw=None,
                       qualitative_value=match[2].lower().replace(' ', '_'))

    other_bio = {'Máu lắng (bằng máy tự động) [1 chỉ số]': 'IMM20',
                 'HBsAg miễn dịch tự động': 'INF08', 'HBsAb định lượng': 'INF10',
                 'HBc Total miễn dịch tự động': 'INF09', 'CMV IgM miễn dịch tự động': 'INF01'}
    for line, cells in rows('IN01'):
        if cells[0] in other_bio:
            fid = other_bio[cells[0]]
            if fid == 'IMM20':
                append('IN01', fid, cells, line, numeric_value=cells[1], comparator='=', unit_raw=cells[2])
            else:
                match = re.search(r'\((<)?([0-9.]+)\)$', cells[1])
                if not match:
                    raise ValueError('Unexpected source mixed-result reference format')
                append('IN01', fid, cells, line, numeric_value=match[2], comparator=match[1] or '=',
                       unit_raw=cells[2], qualitative_value='negative')

    lab10 = {'CK': 'MUS01', 'β-hCG': 'HIS01', 'Anti-CCP': 'IMM02', 'RF': 'IMM03',
             'Tỉ lệ Protein niệu / Creatinin niệu': 'REN01'}
    for line, cells in rows('IN10'):
        if cells[0] in lab10:
            raw = cells[1]
            append('IN10', lab10[cells[0]], cells, line, numeric_value=raw.lstrip('<'),
                   comparator='<' if raw.startswith('<') else '=', unit_raw=cells[2])
        elif cells[0].startswith('Kháng thể kháng nhân (anti -ANA)'):
            append('IN10', 'IMM01', cells, line, numeric_value=None, unit_raw=None,
                   pattern_raw=cells[1], grade_raw='3+',
                   handwritten_reference='handwriting/IN10.txt:7')
        elif cells[0] in ('Bạch cầu:', 'Hồng cầu:'):
            append('IN10', 'REN03' if cells[0] == 'Bạch cầu:' else 'REN02', cells, line,
                   numeric_value=None, unit_raw=None,
                   **({'symbolic_value': cells[1]} if cells[1] == '(+)' else {'qualitative_value': 'negative'}))

    expected_counts = {'IN01': 18, 'IN02': 22, 'IN04': 16, 'IN06': 23, 'IN08': 16, 'IN09': 23, 'IN10': 8, 'IN11': 16}
    actual_counts = {did: sum(o['document_id'] == did for o in observations) for did in expected_counts}
    if actual_counts != expected_counts:
        raise ValueError(f'Reference source inventory changed: {actual_counts}')
    target = REF / 'development-field-reference.json'
    target.write_text(json.dumps({
        'status': 'draft_unreviewed', 'human_reviewed': False,
        'source_method': 'existing_independent_visual_transcription',
        'note': 'Development references only. No model predictions used. Independent human review still required.',
        'excluded_from_numeric_accuracy': ['IN02 blank Post columns', 'IN03 graph curves', 'IN05/IN07 signature pages',
                                           'IN12 collection form has no matching field in this Word catalog'],
        'scope': [[o['document_id'], o['field_id'], o['component']] for o in observations],
        'observations': observations,
    }, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Prepared {len(observations)} scoped draft field references without reading OCR predictions.')


if __name__ == '__main__':
    main()
