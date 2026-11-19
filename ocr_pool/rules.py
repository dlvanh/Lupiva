"""Draft aliases for fields in the lupus Word catalog. No clinical inference."""
import re
import unicodedata

VERSION = 'lupus-table-rules-0.7'


def strip_label_checkmarks(value):
    """Ignore explicit edge checkmarks for label matching, never OCR values.

    Do not strip words, ASCII v/x, crosses, clinical +/- signs or marks inside
    an abbreviation. Raw labels and result cells stay untouched at call sites.
    """
    mark = r'[✓✔☑✅][\ufe0e\ufe0f]?'
    return re.sub(r'^(?:' + mark + r'\s*)+|(?:\s*' + mark + r')+$', '', value.strip()).strip()


def key(value):
    for latex, unicode in [('alpha', 'α'), ('beta', 'β'), ('gamma', 'γ')]:
        value = value.replace('\\' + latex, unicode)
    value = value.replace('α', 'alpha').replace('β', 'beta').replace('γ', 'gamma')
    value = value.replace('đ', 'd').replace('Đ', 'D')
    value = ''.join(c for c in unicodedata.normalize('NFD', value) if not unicodedata.combining(c))
    return re.sub(r'[^a-z0-9]', '', value.lower())


def unit_key(value):
    # G/L is a cell-count scale, g/L is mass concentration. Never collapse them.
    # The OCR table task may render the micro symbol as LaTeX, e.g. \mu mol/L.
    value = value.replace('\\(', '').replace('\\)', '')
    value = re.sub(r'\\(?:mathrm|text)\{([^{}]*)\}', r'\1', value)
    value = value.strip().replace('\\mu', 'u').replace('µ', 'u').replace('μ', 'u').replace(' ', '')
    if re.fullmatch(r'G/[Ll]', value):
        return '10^9/l'
    if re.fullmatch(r'T/[Ll]', value):
        return '10^12/l'
    return value.lower()


RULES = []


def add(field, aliases, units=(), *, panel=None, specimen=None, kind='numeric'):
    RULES.append(dict(field_id=field, aliases={key(a) for a in aliases},
                      units={unit_key(u) for u in units}, panel=panel,
                      specimen=specimen, kind=kind))


add('HIS01', ['β-hCG', 'Beta hCG'], ['mIU/mL', 'IU/L'])
add('MUS01', ['CK', 'Creatine kinase'], ['U/L'])
add('MUS03', ['LDH', 'Lactate dehydrogenase'], ['U/L'])
add('REN01', ['UPCR', 'Tỉ lệ Protein niệu / Creatinin niệu', 'Urine Protein Creatinine Ratio',
              'Tỉ lệ Protein niệu / Creatinin niệu UPCR', 'Urine Protein Creatinine Ratio UPCR'],
    ['mg/mg', 'g/g', 'mg/g', 'mg/mmol'], specimen='urine')
add('REN02', ['RBC', 'Hồng cầu', 'Haematuria'], ['cells/uL', '/HPF'], specimen='urine', kind='mixed')
add('REN03', ['WBC', 'Bạch cầu', 'Pyuria'], ['cells/uL', '/HPF'], specimen='urine', kind='mixed')
add('REN04', ['Ure', 'Urea'], ['mmol/L', 'mg/dL'])
add('REN05', ['Creatinin', 'Creatinine'], ['umol/L', 'mg/dL'])
add('REN09', ['Albumin'], ['g/L', 'g/dL'])
add('GI03', ['GGT'], ['U/L'])
add('GI01', ['ASAT (GOT)', 'ASAT', 'AST', 'GOT'], ['U/L'])
add('GI02', ['ALAT (GPT)', 'ALAT', 'ALT', 'GPT'], ['U/L'])

for field, aliases, units in [
    ('HEM01', ['RBC', 'Số lượng hồng cầu-RBC'], ['T/L', '10^12/L']),
    ('HEM02', ['Hb', 'HGB', 'Lượng huyết sắc tố-HGB'], ['g/L', 'g/dL']),
    ('HEM03', ['MCV', 'Thể tích trung bình hồng cầu-MCV'], ['fL']),
    ('HEM04', ['MCHC', 'Nồng độ HGB trung bình hồng cầu-MCHC'], ['g/L', 'g/dL']),
    ('HEM05', ['WBC', 'Số lượng bạch cầu-WBC'], ['G/L', '10^9/L']),
    ('HEM06', ['NE', 'NE#', 'NE%', 'Số lượng bạch cầu trung tính-NE#', '%Bạch cầu trung tính-NE%'], ['G/L', '%']),
    ('HEM07', ['LY', 'LY#', 'LY%', 'Số lượng bạch cầu lympho-LY#', '%Bạch cầu lympho-LY%'], ['G/L', '%']),
    ('HEM08', ['MO', 'MO#', 'MO%', 'Số lượng bạch cầu mono-MO#', '%Bạch cầu mono-MO%'], ['G/L', '%']),
    ('HEM09', ['EO', 'EO#', 'EO%', 'Số lượng bạch cầu ưa axit-EO#', '%Bạch cầu ưa axit-EO%'], ['G/L', '%']),
    ('HEM10', ['BA', 'BA#', 'BA%', 'Số lượng bạch cầu ưa bazo-BA#', '%Bạch cầu bazo-BA%'], ['G/L', '%']),
    ('HEM11', ['PLT', 'Số lượng tiểu cầu-PLT'], ['G/L', '10^9/L']),
]:
    add(field, aliases, units, specimen='blood')
add('HEM13', ['Direct Coombs', 'Direct Coombs test'], kind='mixed')

for field, aliases, units, kind in [
    ('IMM01', ['ANA', 'Kháng thể kháng nhân (anti -ANA)',
               'Kháng thể kháng nhân (anti -ANA) bằng kỹ thuật huỳnh quang',
               'Kháng thể kháng nhân (anti -ANA) bằng kỹ thuật huyền quang'], [], 'pattern'),
    ('IMM02', ['Anti-CCP', 'Anti CCP'], ['U/mL'], 'mixed'),
    ('IMM03', ['RF', 'Rheumatoid Factor'], ['IU/mL'], 'mixed'),
    ('IMM11', ['C3'], ['g/L', 'mg/dL'], 'numeric'),
    ('IMM12', ['C4'], ['g/L', 'mg/dL'], 'numeric'),
    ('IMM13', ['IgE', 'Định lượng IgE (Immunoglobuline E)'], ['U/mL', 'IU/mL'], 'numeric'),
    ('IMM14', ['IgA', 'Định lượng IgA (Immunoglobuline A)'], ['g/L', 'mg/dL'], 'numeric'),
    ('IMM15', ['IgG', 'Định lượng IgG (Immunoglobuline G)'], ['g/L', 'mg/dL'], 'numeric'),
    ('IMM16', ['IgM', 'Định lượng IgM (Immunoglobuline M)'], ['g/L', 'mg/dL'], 'numeric'),
    ('IMM17', ['IL-6', 'Định lượng Interleukin - 6 human [INTERLEUKIN-6 (IL6)]'], ['pg/mL'], 'numeric'),
    ('IMM18', ['KL-6', 'Định lượng KL-6 (#)'], ['U/mL'], 'numeric'),
    ('IMM19', ['CRP', 'Định lượng CRP'], ['mg/L'], 'numeric'),
    ('IMM20', ['ESR', 'Máu lắng (bằng máy tự động) [1 chỉ số]'], ['mm/ 1h', 'mm/h'], 'numeric'),
    ('IMM21', ['Ferritin'], ['ug/L', 'ng/mL'], 'numeric'),
]:
    add(field, aliases, units, kind=kind)
add('IMM04', ['dsDNA', 'Anti-dsDNA'], ['IU/mL', 'U/mL'], panel='immunocap', kind='mixed')
for field, aliases, units in [
    ('INF01', ['CMV IgM', 'CMV IgM miễn dịch tự động'], ['COI']),
    ('INF02', ['CMV IgG'], ['COI', 'U/mL']),
    ('INF08', ['HBsAg', 'HBsAg miễn dịch tự động'], ['COI']),
    ('INF09', ['Anti-HBc total', 'HBc Total miễn dịch tự động'], ['COI']),
    ('INF10', ['Anti-HBs', 'HBsAb định lượng'], ['IU/L', 'mIU/mL']),
]:
    add(field, aliases, units, kind='mixed')

ANA = [
    ('dsDNA', ['dsDNA']), ('Nucleosome', ['Nucleosomes', 'NUC']), ('Histone', ['Histones', 'HI']),
    ('SS-A', ['SSA']), ('Ro-52', ['Ro52']), ('SS-B', ['SSB']), ('nRNP/Sm', ['RNP/Sm']),
    ('Sm', []), ('Mi-2alpha', ['Mi-2a', 'Mi-2α protein']), ('Mi-2beta', ['Mi-2b', 'Mi-2β protein']),
    ('Ku', ['Ku protein']), ('Centromere A', ['CA', 'Centromere protein A']),
    ('Centromere B', ['CB', 'Centromere protein B']), ('Sp100', ['Sp 100 protein']),
    ('PML', ['PML protein']), ('Scl-70', []), ('PM-Scl100', ['PM100', 'PM-Scl 100 protein']),
    ('PM-Scl75', ['PM75', 'PM-Scl75 protein']), ('RP11', ['RP11 (subunit POLR3K)']),
    ('RP155', ['RP155 (subunit POLR3A)']), ('gp210', ['gp210 protein']), ('PCNA', []), ('DFS70', []),
]
for i, (name, aliases) in enumerate(ANA, 1):
    add(f'ANA{i:02d}', [name, *aliases], panel='ana_profile_23', kind='panel')
MYO = [
    ('Mi-2alpha', ['Mi-2α', 'Mi-2a']), ('Mi-2beta', ['Mi-2β', 'Mi-2b']),
    ('TIF1gamma', ['TIF1γ', 'TIF1g']), ('MDA5', []), ('SAE1', []), ('Ku', []),
    ('PM-Scl100', ['PM100']), ('PM-Scl75', ['PM75']), ('Jo-1', []), ('SRP', []),
    ('PL-7', []), ('PL-12', []), ('EJ', []), ('Ro-52', ['Ro52']), ('cN-1A', []), ('HMGCR', []),
]
for i, (name, aliases) in enumerate(MYO, 1):
    add(f'MYO{i:02d}', [name, *aliases], panel='myositis', kind='panel')
# OJ and NXP2 exist in source reports but not this Word catalog: keep unmapped.

PFT = [
    ('VC', ['VC(L)']), ('FVC', ['FVC(L)']), ('FEV1', ['FEV1(L)']),
    ('FEV1/VC', ['FEV1/VC(%)']), ('FEV1/FVC', ['FEV1/FVC(%)']), ('TLC', ['TLC(L)']),
    ('RV', ['RV(L)']), ('RV/TLC', ['RV/TLC(%)']), ('VA', ['Va(L)']),
    ('Kco (Hb)', ['Kco (Hb)(mL/mmHg/Mi)']), ('Tlco (Hb)', ['Tlco (Hb)(mL/mmHg/Mi)', 'DLCO Hb']),
]
for i, (name, aliases) in enumerate(PFT, 1):
    units = ['%'] if i in (4, 5, 8) else ['mL/mmHg/Mi'] if i in (10, 11) else ['L']
    add(f'PFT{i:02d}', [name, *aliases], units, panel='pft', kind='numeric')


def resolve(name, context):
    cleaned = strip_label_checkmarks(re.sub(r'\[AC-[^\]]+\]', '', name, flags=re.I)).strip(' .')
    # Strip display-only assay abbreviations, not PFT units or (Hb).
    abbreviated = re.sub(r'\s+\([^()]+\)$', '', cleaned)
    variants = {key(cleaned), key(abbreviated)}
    # A printed CBC abbreviation at the end of a Vietnamese label survives
    # diacritic OCR mistakes. Require the explicit dash and known blood panel;
    # never use substring matching (e.g. MCH must not become MCHC).
    if context.get('specimen') == 'blood':
        suffix = re.search(r'-\s*(RBC|HGB|MCV|MCHC|WBC|NE[#%]|LY[#%]|MO[#%]|EO[#%]|BA[#%]|PLT)\s*$', cleaned, re.I)
        if suffix:
            variants.add(key(suffix[1]))
    candidates = [r for r in RULES if variants & r['aliases']]
    compatible = [r for r in candidates
                  if (r['panel'] is None or r['panel'] == context.get('panel'))
                  and (r['specimen'] is None or r['specimen'] == context.get('specimen'))]
    unique = {r['field_id']: r for r in compatible}
    if len(unique) == 1:
        return next(iter(unique.values())), []
    return None, sorted({r['field_id'] for r in candidates})
