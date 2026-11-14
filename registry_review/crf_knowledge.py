"""Versioned clinical evidence rules used by the CRF review."""
import json

from registry_pool.dictionary import digest


VERSION = 'crf-clinical-evidence-2'
FINDINGS_VERSION = 'crf-form-findings-1'
EULAR = 'https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930'
SLEDAI = 'https://pubmed.ncbi.nlm.nih.gov/11838846/'
SLEDAI_DEFINITIONS = 'https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf'
KDIGO = 'https://kdigo.org/wp-content/uploads/2024/01/KDIGO-2024-Lupus-Nephritis-Guideline.pdf'
ATTRIBUTION = 'Xác nhận không có nguyên nhân hợp lý hơn SLE.'
DRUGS = 'Loại trừ nguyên nhân do thuốc.'
PROTEIN = 'Protein niệu trên 0,5 g/24 giờ hoặc UPCR mẫu nước tiểu tương đương trên 500 mg/g.'
PROTEIN_LIMITS = {'REN08': {'g/24h': '0.5', 'mg/24h': '500'},
                  'REN01': {'g/g': '0.5', 'mg/mg': '0.5', 'mg/g': '500'}}

EULAR_RULES = {
    'EAC02': dict(field='HEM05', below='4', label='Bạch cầu thấp',
                  definition='Bạch cầu dưới 4 × 10⁹/L.'),
    'EAC03': dict(field='HEM11', below='100', label='Tiểu cầu thấp',
                  definition='Tiểu cầu dưới 100 × 10⁹/L.'),
    'EAC12': dict(fields=['CV06'], rule='imaging_effusion',
                  definition='Hình ảnh ghi nhận tràn dịch màng phổi hoặc màng ngoài tim. Lupiva tra trường dịch màng ngoài tim từ phiếu siêu âm.'),
    'EAC15': dict(fields=['REN08', 'REN01'], rule='proteinuria', above_by_unit=PROTEIN_LIMITS,
                  definition=PROTEIN, supporting_source=KDIGO),
    'EAC18': dict(fields=['IMM05', 'IMM06', 'IMM07', 'IMM08'], rule='antiphospholipid',
                  above='40', units_by_field={'IMM05': ['gpl', 'gpl-u/ml'], 'IMM06': ['mpl', 'mpl-u/ml']},
                  positive_fields=['IMM07', 'IMM08'],
                  definition='aCL trên 40 APL/GPL/MPL hoặc trên bách phân vị 99, anti-β₂GPI dương tính hoặc lupus anticoagulant dương tính. Lupiva dùng aCL IgG/IgM với đơn vị đúng hoặc kết quả anti-β₂GPI IgG/IgM ghi rõ dương tính.'),
    'EAC19': dict(fields=['IMM11', 'IMM12'], rule='low_complement',
                  definition='C3 hoặc C4 dưới giới hạn dưới của khoảng tham chiếu áp dụng.'),
    'EAC20': dict(fields=['IMM11', 'IMM12'], rule='low_complement', all_fields=True,
                  definition='C3 và C4 cùng dưới giới hạn dưới. Lupiva yêu cầu cả hai kết quả trên cùng một phiếu.'),
    'EAC21': dict(fields=['ANA08'], rule='anti_smith',
                  definition='Anti-Sm dương tính, hoặc anti-dsDNA bằng xét nghiệm có độ đặc hiệu SLE ≥90% với nhóm chứng bệnh phù hợp. Lupiva chỉ đề xuất từ kết quả Anti-Sm riêng ghi rõ dương tính.'),
}
SLEDAI_RULES = {
    'SDA12': dict(fields=['REN02'], rule='urine_microscopy', above='5', cell_unit='rbc/hpf',
                  definition='Hồng cầu niệu trên 5 tế bào/vi trường lớn (HPF).',
                  exclude='Xác nhận mẫu lấy sạch và loại trừ sỏi, nhiễm trùng, kinh nguyệt hoặc nguyên nhân khác.'),
    'SDA13': dict(fields=['REN08', 'REN01'], rule='proteinuria', above_by_unit=PROTEIN_LIMITS,
                  definition=PROTEIN, supporting_source=KDIGO,
                  exclude='Xác nhận mẫu phù hợp và protein niệu do viêm thận lupus đang hoạt động.'),
    'SDA14': dict(fields=['REN03'], rule='urine_microscopy', above='5', cell_unit='wbc/hpf',
                  definition='Bạch cầu niệu trên 5 tế bào/vi trường lớn (HPF).',
                  exclude='Xác nhận mẫu lấy sạch, loại trừ nhiễm trùng và nhiễm bẩn mẫu.'),
    'SDA20': dict(fields=['IMM11', 'IMM12'], rule='low_complement',
                  definition='CH50, C3 hoặc C4 dưới giới hạn dưới. Lupiva tra C3/C4 theo khoảng tham chiếu trên phiếu hoặc đã xác nhận.'),
    'SDA23': dict(field='HEM11', below='100', label='Tiểu cầu thấp',
                  definition='Tiểu cầu dưới 100 × 10⁹/L.', exclude=DRUGS),
    'SDA24': dict(field='HEM05', below='3', label='Bạch cầu thấp',
                  definition='Bạch cầu dưới 3 × 10⁹/L.', exclude=DRUGS),
}

RULES = {
    **{fid: dict(standard='EULAR/ACR 2019', source=EULAR, location='Bảng 1', exclude=ATTRIBUTION,
                 **rule) for fid, rule in EULAR_RULES.items()},
    **{fid: dict(standard='SLEDAI-2K', days=10, source=SLEDAI_DEFINITIONS, location='Phụ lục 10',
                 validation_source=SLEDAI, **rule) for fid, rule in SLEDAI_RULES.items()},
}
for rule in RULES.values():
    if 'field' in rule:
        rule.update(rule='blood_count', fields=[rule['field']])


FORM_FINDINGS = {
    'SKN01': dict(fields=['SKN02', 'SKN03', 'SKN04', 'SKN05', 'SKN06', 'SKN07', 'SKN08',
                          'SKN09', 'SKN10', 'SKN11', 'SKN12', 'SKN13', 'SKN14', 'SKN15', 'SKN16',
                          'SKN17', 'SKN18', 'SKN19'], definition='Có biểu hiện da hoặc niêm mạc được ghi nhận.'),
    'CV01': dict(fields=['CV06'], extraction_method='local_ocr', required_flag='explicit_report_finding',
                 definition='Phiếu siêu âm tim ghi nhận có dịch màng ngoài tim.'),
    'LUNG01': dict(fields=['LUNG02'], definition='Có kết luận bệnh phổi kẽ được ghi nhận. Bác sĩ xác nhận kết luận này phù hợp với phạm vi mục tổn thương phổi của phiếu.'),
    'NEU01': dict(fields=['NEU02', 'NEU04', 'NEU05', 'NEU06'],
                  definition='Có rối loạn thần kinh hoặc tâm thần được ghi nhận trong hồ sơ.'),
    'GI04': dict(fields=['GI05', 'GI06', 'GI07', 'GI08', 'GI09', 'GI10', 'GI11', 'GI12', 'GI13', 'GI14'],
                 definition='Có biểu hiện tiêu hóa được ghi nhận trong hồ sơ.'),
    'REN10': dict(fields=['REN11'], biopsy_class=True,
                  definition='Hồ sơ mô bệnh học ghi phân lớp viêm thận lupus từ I đến VI.',
                  supporting_source=KDIGO),
    'REN07': dict(fields=[], definition='Đánh giá tổn thương thận dựa trên bối cảnh lâm sàng, diễn biến xét nghiệm và kết luận chuyên môn. Một trị số eGFR, creatinine hoặc UPCR riêng lẻ chỉ hỗ trợ đối chiếu.',
                  supporting_source=KDIGO),
    'MUS02': dict(fields=[], definition='Đối chiếu biểu hiện cơ, thăm khám và kết luận cận lâm sàng. CK hoặc kháng thể riêng lẻ chỉ hỗ trợ đối chiếu.',
                  supporting_source=SLEDAI_DEFINITIONS),
    'HEM12': dict(fields=[], definition='Đối chiếu loại rối loạn huyết học, diễn biến và nguyên nhân. Chỉ số công thức máu đơn lẻ hỗ trợ đánh giá lâm sàng.'),
}
for rule in FORM_FINDINGS.values():
    rule.update(standard='Mẫu CRF Lupiva', location='Mục tương ứng của phiếu', requires_confirmation=True)

LIBRARIES = {VERSION: RULES, FINDINGS_VERSION: FORM_FINDINGS}


def install_knowledge(db):
    db.execute('''CREATE TABLE IF NOT EXISTS crf_knowledge (
        version TEXT PRIMARY KEY, sha256 TEXT NOT NULL, rules TEXT NOT NULL
    )''')
    for version, rules in LIBRARIES.items():
        db.execute('INSERT OR IGNORE INTO crf_knowledge VALUES (?,?,?)',
                   (version, digest(rules), json.dumps(rules, ensure_ascii=False, sort_keys=True)))
        read_knowledge(db, version)


def read_knowledge(db, version=VERSION):
    row = db.execute('SELECT sha256,rules FROM crf_knowledge WHERE version=?', (version,)).fetchone()
    if row is None:
        raise ValueError('Chưa có phiên bản quy tắc CRF trong SQLite.')
    rules = json.loads(row[1])
    if digest(rules) != row[0] or (version in LIBRARIES and row[0] != digest(LIBRARIES[version])):
        raise ValueError('Nội dung quy tắc CRF khác phiên bản đã xác minh.')
    return dict(version=version, sha256=row[0], rules=rules)


def load_knowledge(db):
    return read_knowledge(db)['rules']


def knowledge_library(db):
    return dict(**read_knowledge(db), form_findings=read_knowledge(db, FINDINGS_VERSION),
                available_versions=[row[0] for row in db.execute(
        'SELECT version FROM crf_knowledge ORDER BY rowid DESC')])
