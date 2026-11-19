"""Versioned clinical evidence rules used by the CRF review."""
import json

from registry_pool.dictionary import digest


VERSION = 'crf-clinical-evidence-2'
FINDINGS_VERSION = 'crf-form-findings-1'
LAB_FINDINGS_VERSION = 'crf-lab-findings-1'
EULAR = 'https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930'
SLEDAI = 'https://pubmed.ncbi.nlm.nih.gov/11838846/'
SLEDAI_DEFINITIONS = 'https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf'
KDIGO = 'https://kdigo.org/wp-content/uploads/2024/01/KDIGO-2024-Lupus-Nephritis-Guideline.pdf'
KDIGO_CKD = 'https://doi.org/10.1016/j.kint.2023.10.016'
WHO_ANEMIA = 'https://www.who.int/publications/i/item/WHO-NMH-NHD-MNM-11.1'
SLICC_2012 = 'https://pubmed.ncbi.nlm.nih.gov/22553077/'
ATS_ERS_2022 = 'https://doi.org/10.1183/13993003.01499-2021'
KL6_SOURCE = 'https://pubmed.ncbi.nlm.nih.gov/16371657/'
ATTRIBUTION = 'Xác nhận không có nguyên nhân hợp lý hơn SLE.'
DRUGS = 'Loại trừ nguyên nhân do thuốc.'
PROTEIN = 'Protein niệu trên 0,5 g/24 giờ hoặc UPCR mẫu nước tiểu tương đương trên 500 mg/g.'
PROTEIN_LIMITS = {'REN08': {'g/24h': '0.5', 'mg/24h': '500'},
                  'REN01': {'g/g': '0.5', 'mg/mg': '0.5', 'mg/g': '500'}}
CELSIUS_UNITS = ['°c', '℃', 'c']
EGFR_UNITS = ['ml/min/1.73m2', 'ml/min/1,73m2', 'ml/phút/1.73m2', 'ml/phút/1,73m2', 'ml/ph/1.73m2']
PERCENT_UNITS = ['%']

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

# Lab-derived findings: any criterion met proposes 'yes' for the target, always
# with the doctor's confirmation. Score-engine definitions (RULES) stay separate.
LAB_FINDINGS = {
    'HEM12': dict(
        criteria=[
            dict(field='HEM02', kind='hemoglobin', below='120',
                 detail='Thiếu máu (Hb {v} {unit})', standard='WHO 2011', source=WHO_ANEMIA),
            dict(field='HEM05', kind='blood_count', below='4',
                 detail='Giảm bạch cầu (WBC {v} {unit})', standard='EULAR/ACR 2019', source=EULAR),
            dict(field='HEM07', component='absolute_count', kind='blood_count', below='1',
                 detail='Giảm lympho (LY {v} {unit})', standard='SLICC 2012', source=SLICC_2012),
            dict(field='HEM11', kind='blood_count', below='100',
                 detail='Giảm tiểu cầu (PLT {v} {unit})', standard='EULAR/ACR 2019', source=EULAR),
            dict(field='HEM13', kind='positive',
                 detail='Coombs trực tiếp dương tính', standard='EULAR/ACR 2019', source=EULAR),
        ],
        definition='Rối loạn huyết học khi có một trong các dấu hiệu: Hb <120 g/L, bạch cầu <4 ×10⁹/L, '
                   'lympho <1 ×10⁹/L, tiểu cầu <100 ×10⁹/L hoặc Coombs trực tiếp dương tính. '
                   'Một chỉ số đơn lẻ chỉ hỗ trợ đánh giá lâm sàng.',
        confirmation='Xác nhận rối loạn huyết học không do thuốc hoặc nguyên nhân khác.',
        standard='WHO 2011; EULAR/ACR 2019; SLICC 2012', source=WHO_ANEMIA,
        location='Ngưỡng huyết học của từng tiêu chí'),
    'REN07': dict(
        criteria=[
            dict(field='REN08', kind='proteinuria', above_by_unit=PROTEIN_LIMITS),
            dict(field='REN01', kind='proteinuria', above_by_unit=PROTEIN_LIMITS),
            dict(field='REN02', kind='urine_microscopy', above='5', cell_unit='rbc/hpf'),
            dict(field='REN06', kind='below', below='60', units=EGFR_UNITS),
            dict(field='REN05', kind='above_reference'),
        ],
        definition='Tổn thương thận khi có một trong các dấu hiệu: protein niệu >0,5 g/24 giờ (hoặc UPCR '
                   'tương đương >500 mg/g), hồng cầu niệu >5 RBC/HPF, eGFR <60 mL/min/1.73m² hoặc '
                   'creatinine trên giới hạn trên của khoảng tham chiếu áp dụng.',
        confirmation='Xác nhận tổn thương thận theo bối cảnh lâm sàng và diễn biến.',
        standard='KDIGO 2024', source=KDIGO, supporting_source=KDIGO_CKD,
        location='KDIGO 2024 viêm thận lupus và bệnh thận mạn'),
    'MUS02': dict(
        criteria=[dict(field='MUS01', kind='above_reference')],
        definition='Tổn thương cơ khi CK trên giới hạn trên của khoảng tham chiếu áp dụng. '
                   'CK tăng đơn lẻ chỉ hỗ trợ; cần đối chiếu biểu hiện cơ trên lâm sàng.',
        confirmation='Xác nhận có biểu hiện cơ trên lâm sàng; CK tăng đơn lẻ chỉ hỗ trợ.',
        standard='SLEDAI-2K', source=SLEDAI_DEFINITIONS, location='Phụ lục 10'),
    'LUNG01': dict(
        criteria=[
            dict(field='PFT11', component='pre_percent_predicted', kind='below', below='80',
                 units=PERCENT_UNITS, standard='ATS/ERS 2022', source=ATS_ERS_2022),
            dict(field='PFT02', component='pre_percent_predicted', kind='below', below='80',
                 units=PERCENT_UNITS, standard='ATS/ERS 2022', source=ATS_ERS_2022),
            dict(field='IMM18', kind='above', above='500', units=['u/ml'],
                 standard='KL-6', source=KL6_SOURCE),
        ],
        definition='Tổn thương phổi khi DLCO hoặc FVC trước giãn phế quản <80% dự đoán, hoặc KL-6 >500 U/mL. '
                   'Cần đối chiếu hình ảnh/HRCT và loại trừ nguyên nhân khác.',
        confirmation='Xác nhận bằng hình ảnh/HRCT và loại trừ nguyên nhân khác.',
        standard='ATS/ERS 2022; KL-6', source=ATS_ERS_2022, supporting_source=KL6_SOURCE,
        location='DLCO/FVC <80% dự đoán; KL-6 >500 U/mL'),
    'EAC21': dict(
        criteria=[
            dict(field='IMM04', kind='above_reference'),
            dict(field='IMM04', kind='positive'),
            dict(field='ANA01', kind='positive'),
        ],
        definition='Anti-dsDNA trên giới hạn trên của khoảng tham chiếu hoặc ghi rõ dương tính '
                   '(ImmunoCAP hoặc line blot), bằng xét nghiệm có độ đặc hiệu SLE ≥90% với nhóm chứng bệnh phù hợp.',
        confirmation='Xác nhận xét nghiệm anti-dsDNA có độ đặc hiệu ≥90% với nhóm chứng bệnh phù hợp.',
        standard='EULAR/ACR 2019', source=EULAR, location='Bảng 1'),
    'SDA21': dict(
        criteria=[dict(field='IMM04', kind='above_reference')],
        definition='Anti-dsDNA (IMM04) trên giới hạn trên của khoảng tham chiếu áp dụng, '
                   'trong cửa sổ 10 ngày trước ngày đánh giá.',
        confirmation='Xác nhận phương pháp và kết quả trong cửa sổ 10 ngày trước ngày đánh giá.',
        standard='SLEDAI-2K', source=SLEDAI_DEFINITIONS, location='Phụ lục 10', days=10),
    'EAC04': dict(
        criteria=[dict(field='HEM13', kind='positive')],
        definition='Coombs trực tiếp dương tính; kết luận tan máu tự miễn cần kèm bằng chứng tan máu.',
        confirmation='Cần bằng chứng tan máu (hồng cầu lưới tăng, haptoglobin giảm, bilirubin gián tiếp hoặc LDH tăng) kèm Coombs dương tính.',
        standard='EULAR/ACR 2019', source=EULAR, location='Bảng 1'),
    'EAC01': dict(
        criteria=[dict(field='HIS12', kind='above', above='38.3', units=CELSIUS_UNITS)],
        definition='Sốt trên 38,3 °C.',
        confirmation=ATTRIBUTION,
        standard='EULAR/ACR 2019', source=EULAR, location='Bảng 1'),
    'SDA22': dict(
        criteria=[dict(field='HIS12', kind='above', above='38', units=CELSIUS_UNITS)],
        definition='Sốt trên 38 °C trong cửa sổ 10 ngày trước ngày đánh giá.',
        confirmation='Loại trừ nguyên nhân nhiễm trùng.',
        standard='SLEDAI-2K', source=SLEDAI_DEFINITIONS, location='Phụ lục 10', days=10),
    'HIS11': dict(
        criteria=[dict(field='HIS12', kind='at_least', at_least='38', units=CELSIUS_UNITS)],
        definition='Ghi nhận thân nhiệt cao nhất từ 38 °C trở lên trong hồ sơ.',
        confirmation='Xác nhận thân nhiệt đo trong hồ sơ.',
        standard='Lupiva CRF', source=None, location='Mục sốt và nhiễm trùng'),
}

LIBRARIES = {VERSION: RULES, FINDINGS_VERSION: FORM_FINDINGS, LAB_FINDINGS_VERSION: LAB_FINDINGS}


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
                lab_findings=read_knowledge(db, LAB_FINDINGS_VERSION),
                available_versions=[row[0] for row in db.execute(
        'SELECT version FROM crf_knowledge ORDER BY rowid DESC')])
