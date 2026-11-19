/**
 * Public pages of Vietnam Lupus Registry (home + about merged, patients, contact).
 * Wording is drawn from the VMEC 2026 abstract and the project plan; it is a
 * draft pending review by the research team. TODO: research team to confirm wording.
 */
import type { Language } from "@/data/translations";

export const SITE_NAME = "Vietnam Lupus Registry";

export const SITE_PAGES = [
  { href: "/", vi: "Trang chủ", en: "Home", id: "nav-link-home" },
  { href: "/benh-nhan", vi: "Cho bệnh nhân", en: "For patients", id: "nav-link-patients" },
  { href: "/upload", vi: "Nộp hồ sơ", en: "Submit records", id: "nav-link-upload" },
  { href: "/lien-he", vi: "Liên hệ", en: "Contact", id: "nav-link-contact" },
] as const;

type Item = { title: string; body: string };

export interface WorkflowStep {
  stepLabel: string;
  title: string;
  bullets: string[];
}

export interface CommitteeMember {
  name: string;
  initials: string;
  role: string;
  affiliation: string;
}

export interface PartnerUnit {
  name: string;
  parent: string;
}

export interface SiteContent {
  home: {
    tagline: string;
    intro: string;
    patientsBtn: string;
    doctorBtn: string;
    navBackground: string;
    navAims: string;
    navWorkflow: string;
    navFuture: string;
    navMembers: string;
    aimTitle: string;
    aimBody: string;
    patientsTitle: string;
    patientsBody: string;
    patientsMore: string;
  };
  about: {
    title: string;
    intro: string;
    backgroundKicker: string;
    backgroundTitle: string;
    backgroundCards: Item[];
    aimKicker: string;
    aimTitle: string;
    aimBody: string;
    aims: string[];
    approachKicker: string;
    approachTitle: string;
    approachBadge: string;
    approachSubtitle: string;
    workflowSteps: WorkflowStep[];
    futureKicker: string;
    futureTitle: string;
    futureBody: string;
    future: Item[];
    membersKicker: string;
    membersSectionTitle: string;
    committeeTitle: string;
    committee: CommitteeMember[];
    groupPhotoSrc: string | null;
    groupPhotoAlt: string;
    groupPhotoCaption: string;
    groupPhotoPlaceholderHint: string;
    teamTitle: string;
    units: PartnerUnit[];
  };
  patients: {
    title: string;
    intro: string;
    lupusTitle: string;
    lupus: string[];
    whyTitle: string;
    why: string[];
    contributeTitle: string;
    contributeBody: string;
    contribute: string[];
    doctorBenefitTitle: string;
    doctorBenefitBody: string;
  };
  contact: {
    title: string;
    intro: string;
    unitsTitle: string;
    units: string[];
    leadTitle: string;
    lead: string;
    collaborateTitle: string;
    collaborateBody: string;
  };
}

export const SITE_CONTENT: Record<Language, SiteContent> = {
  vi: {
    home: {
      tagline: "Registry bệnh lupus ban đỏ hệ thống Việt Nam",
      intro:
        "Hệ thống registry số do người bệnh cùng tham gia cho bệnh lupus ban đỏ hệ thống (SLE) tại Việt Nam — thu thập hồ sơ khám và xét nghiệm thực tế để chuẩn hóa dữ liệu nghiên cứu, hỗ trợ bác sĩ theo dõi và nâng cao chất lượng điều trị.",
      patientsBtn: "Dành cho bệnh nhân",
      doctorBtn: "Dành cho bác sĩ",
      navBackground: "Bối cảnh",
      navAims: "Mục tiêu & Hướng nghiên cứu",
      navWorkflow: "Cách Registry vận hành",
      navFuture: "Hướng phát triển",
      navMembers: "Thành viên & Đơn vị thực hiện",
      aimTitle: "Mục tiêu",
      aimBody:
        "Vietnam Lupus Registry thu thập dữ liệu khám và xét nghiệm thực tế của người bệnh lupus ban đỏ hệ thống (SLE) theo thời gian, để hiểu rõ đặc điểm bệnh, diễn tiến, đáp ứng điều trị ở người Việt Nam và hỗ trợ chăm sóc người bệnh tốt hơn.",
      patientsTitle: "Bạn đang sống chung với bệnh lupus?",
      patientsBody:
        "Mỗi hồ sơ bạn chia sẻ giúp các bác sĩ và nhà nghiên cứu hiểu rõ hơn bệnh lupus ở người Việt Nam. Tham gia miễn phí và bạn có thể rút lại bất cứ lúc nào.",
      patientsMore: "Xem quyền lợi và cách tham gia",
    },
    about: {
      title: "Về Vietnam Lupus Registry",
      intro:
        "Vietnam Lupus Registry là registry số do người bệnh cùng tham gia, dành cho bệnh lupus ban đỏ hệ thống (SLE) Việt Nam.",
      backgroundKicker: "Tổng quan",
      backgroundTitle: "Bối cảnh",
      backgroundCards: [
        {
          title: "Đặc điểm bệnh phức tạp",
          body: "Lupus ban đỏ hệ thống là bệnh tự miễn mạn tính, có thể ảnh hưởng nhiều cơ quan như da, khớp, thận, máu, tim, phổi và thần kinh; diễn tiến thành từng đợt và khác nhau giữa từng người.",
        },
        {
          title: "Giá trị của Registry lâm sàng",
          body: "Các registry lupus đóng vai trò thiết yếu để xác định dịch tễ, diễn tiến thực tế, hiệu quả và độ an toàn của điều trị lâu dài, mang lại giá trị nghiên cứu vượt xa cơ sở dữ liệu bệnh viện thông thường.",
        },
        {
          title: "Nhu cầu chuẩn hóa tại Việt Nam",
          body: "Dữ liệu bệnh nhân lupus còn phân tán trên nhiều hồ sơ giấy và phiếu xét nghiệm. Một registry quốc gia giúp tìm ra dấu ấn sinh học, mô hình dự báo phù hợp với người Việt Nam và kết nối nghiên cứu quốc tế.",
        },
      ],
      aimKicker: "Định hướng khoa học",
      aimTitle: "Mục tiêu và hướng nghiên cứu",
      aimBody: "Registry tập trung nghiên cứu và chuẩn hóa dữ liệu theo các hướng trọng tâm:",
      aims: [
        "Đặc điểm lâm sàng và cận lâm sàng của người bệnh SLE, phân loại theo tiêu chuẩn EULAR/ACR 2019.",
        "Mức độ hoạt động bệnh và diễn tiến theo thời gian, đánh giá bằng thang điểm SLEDAI-2K.",
        "Tổn thương cơ quan (thận, máu, da, khớp, thần kinh…) và các yếu tố nguy cơ liên quan.",
        "Hồ sơ tự kháng thể (ANA, anti-dsDNA…) và bổ thể C3/C4, mối liên hệ với biểu hiện bệnh.",
        "Điều trị, đáp ứng và độ an toàn của phác đồ lâu dài trong thực hành lâm sàng thực tế.",
      ],
      approachKicker: "Quy trình vận hành",
      approachTitle: "Cách registry vận hành",
      approachBadge: "Giảm >75% công nhập liệu thủ công",
      approachSubtitle:
        "Kết hợp hồ sơ do người bệnh chia sẻ, công nghệ AI/OCR đọc tài liệu y khoa tiếng Việt và thẩm định trực tiếp của bác sĩ chuyên khoa.",
      workflowSteps: [
        {
          stepLabel: "Bước 1",
          title: "Thu thập hồ sơ từ người bệnh",
          bullets: [
            "Cổng web & điện thoại bảo mật, ký đồng ý điện tử (E-consent)",
            "Chụp hoặc tải ảnh phiếu xét nghiệm, đơn thuốc, giấy ra viện",
          ],
        },
        {
          stepLabel: "Bước 2",
          title: "Xử lý tài liệu bằng AI & OCR",
          bullets: [
            "Nhận dạng chữ (OCR) và mô hình ngôn ngữ hiểu ngữ cảnh lâm sàng",
            "Trích xuất nhân khẩu học, ANA, anti-dsDNA, C3/C4 và tách định danh",
          ],
        },
        {
          stepLabel: "Bước 3",
          title: "Bác sĩ kiểm tra & chuẩn hóa",
          bullets: [
            "Áp dụng quy tắc lâm sàng & ánh xạ theo phiếu CRF chuẩn",
            "Bác sĩ chuyên khoa đối chiếu tài liệu gốc và phê duyệt từng giá trị",
          ],
        },
        {
          stepLabel: "Bước 4",
          title: "Phân tích & Nghiên cứu",
          bullets: [
            "Tổng hợp điểm SLEDAI-2K, tiêu chuẩn EULAR/ACR và diễn tiến bệnh",
            "Phân tích nhóm bệnh nhân & xuất dữ liệu chuẩn REDCap",
          ],
        },
      ],
      futureKicker: "Tầm nhìn dài hạn",
      futureTitle: "Hướng phát triển",
      futureBody: "Trong các giai đoạn tiếp theo, registry hướng tới:",
      future: [
        {
          title: "Mạng lưới đa trung tâm",
          body: "Mở rộng thành registry đa trung tâm trên toàn quốc, theo dõi người bệnh dọc theo nhiều lần khám.",
        },
        {
          title: "Biobank & Dữ liệu đa omics",
          body: "Liên kết với ngân hàng mẫu sinh học (biobank) và dữ liệu đa omics để phân loại kiểu hình và tìm dấu ấn sinh học mới.",
        },
        {
          title: "Mô hình dự báo lâm sàng",
          body: "Xây dựng mô hình dự báo đợt bùng phát, tổn thương cơ quan và đáp ứng điều trị.",
        },
        {
          title: "Y học chính xác cho người Việt",
          body: "Cá thể hóa phác đồ theo dõi và điều trị phù hợp với đặc điểm người bệnh Việt Nam.",
        },
      ],
      membersKicker: "Đội ngũ & Tổ chức",
      membersSectionTitle: "Thành viên & Đơn vị thực hiện",
      committeeTitle: "Thành viên (Steering Committee)",
      committee: [
        {
          name: "TS. BS. Nguyễn Văn Đinh",
          initials: "NĐ",
          role: "Chủ nhiệm nghiên cứu (Principal Investigator)",
          affiliation:
            "Viện Nghiên cứu Miễn dịch Vinmec – VinUni & Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City",
        },
        {
          name: "Nhóm Bác sĩ Chuyên khoa Dị ứng – Miễn dịch lâm sàng",
          initials: "BS",
          role: "Thành viên Ban Điều hành lâm sàng (Clinical Steering Committee)",
          affiliation:
            "Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City",
        },
        {
          name: "Nhóm Nghiên cứu Miễn dịch & Sinh học phân tử",
          initials: "NC",
          role: "Thành viên Ban Nghiên cứu & Biobank",
          affiliation:
            "Viện Nghiên cứu Miễn dịch Vinmec – VinUni & Viện Nghiên cứu Tế bào gốc và Công nghệ gen Vinmec (VRISG)",
        },
        {
          name: "Nhóm Kỹ thuật AI & Hệ thống Dữ liệu Y sinh",
          initials: "KT",
          role: "Phát triển nền tảng OCR, e-CRF & chuẩn hóa dữ liệu",
          affiliation:
            "Viện Nghiên cứu Miễn dịch Vinmec – VinUni, Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        },
      ],
      groupPhotoSrc: null,
      groupPhotoAlt: "Ảnh nhóm thành viên Ban Điều hành và nhóm nghiên cứu Vietnam Lupus Registry",
      groupPhotoCaption: "Ban Điều hành & Nhóm nghiên cứu Vietnam Lupus Registry",
      groupPhotoPlaceholderHint: "Ảnh tập thể nhóm nghiên cứu sẽ được cập nhật tại đây",
      teamTitle: "Đơn vị thực hiện",
      units: [
        {
          name: "Viện Nghiên cứu Miễn dịch Vinmec – VinUni",
          parent: "Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        },
        {
          name: "Trung tâm Dị ứng – Miễn dịch lâm sàng",
          parent: "Bệnh viện Đa khoa Quốc tế Vinmec Times City",
        },
        {
          name: "Viện Nghiên cứu Tế bào gốc và Công nghệ gen Vinmec (VRISG)",
          parent: "Hệ thống Y tế Vinmec",
        },
      ],
    },
    patients: {
      title: "Thông tin cho bệnh nhân",
      intro:
        "Trang này giải thích bệnh lupus, vì sao registry cần sự tham gia của bạn, quyền lợi khi tham gia và các bước để bắt đầu.",
      lupusTitle: "Lupus ban đỏ hệ thống là gì?",
      lupus: [
        "Lupus ban đỏ hệ thống (SLE) là bệnh tự miễn: hệ miễn dịch tấn công nhầm vào chính cơ thể. Bệnh có thể ảnh hưởng da, khớp, thận, máu, tim, phổi, não và nhiều cơ quan khác.",
        "Bệnh gặp nhiều nhất ở phụ nữ trong độ tuổi sinh đẻ, nhưng cũng có thể gặp ở nam giới, trẻ em và người lớn tuổi. Mỗi người bệnh có biểu hiện và mức độ nặng khác nhau, bệnh thường diễn tiến thành từng đợt.",
        "Hiện chưa có thuốc chữa khỏi hẳn, nhưng điều trị đúng và theo dõi đều đặn giúp kiểm soát bệnh và giảm tổn thương cơ quan.",
      ],
      whyTitle: "Vì sao cần registry?",
      why: [
        "Theo dõi bệnh lupus thay đổi thế nào ở từng người bệnh theo thời gian.",
        "Tìm cách chẩn đoán và điều trị sớm hơn, phù hợp hơn với người bệnh Việt Nam.",
        "Góp phần phát triển cách điều trị hiệu quả hơn và ít tác dụng phụ hơn.",
      ],
      contributeTitle: "Bạn có thể đóng góp như thế nào?",
      contributeBody: "Bạn chỉ cần chia sẻ những giấy tờ đã có từ các lần khám:",
      contribute: [
        "Phiếu xét nghiệm máu, nước tiểu, kháng thể (ANA, anti-dsDNA), bổ thể.",
        "Kết quả đo chức năng hô hấp, siêu âm, chẩn đoán hình ảnh.",
        "Giấy ra viện, đơn thuốc, tóm tắt bệnh án nếu có.",
      ],
      doctorBenefitTitle: "Cơ hội trao đổi với bác sĩ chuyên khoa",
      doctorBenefitBody:
        "Hồ sơ của bạn được bác sĩ chuyên khoa Dị ứng – Miễn dịch lâm sàng xem xét. Khi cần, bạn có cơ hội trao đổi trực tiếp với bác sĩ về kết quả và quá trình theo dõi bệnh.",
    },
    contact: {
      title: "Liên hệ",
      intro: "Nếu bạn có câu hỏi về registry, việc tham gia hoặc muốn rút khỏi dự án, vui lòng liên hệ nhóm nghiên cứu.",
      unitsTitle: "Đơn vị thực hiện",
      units: [
        "Viện Nghiên cứu Miễn dịch Vinmec – VinUni, Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        "Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City, 458 Minh Khai, Hai Bà Trưng, Hà Nội",
        "Viện Nghiên cứu Tế bào gốc và Công nghệ gen Vinmec (VRISG), Hệ thống Y tế Vinmec",
      ],
      leadTitle: "Chủ nhiệm nghiên cứu",
      lead: "TS. BS. Nguyễn Văn Đinh (Nguyen Van Dinh) — Viện Nghiên cứu Miễn dịch Vinmec – VinUni và Trung tâm Dị ứng – Miễn dịch lâm sàng, Vinmec Times City",
      collaborateTitle: "Hợp tác nghiên cứu",
      collaborateBody:
        "Bác sĩ, bệnh viện và nhà nghiên cứu muốn tham gia hoặc hợp tác với registry vui lòng liên hệ nhóm nghiên cứu qua email bên dưới.",
    },
  },
  en: {
    home: {
      tagline: "The systemic lupus erythematosus registry of Vietnam",
      intro:
        "A patient-powered digital registry for systemic lupus erythematosus (SLE) in Vietnam — collecting real-world visit and laboratory records to standardize research data, support longitudinal follow-up, and improve patient care.",
      patientsBtn: "For patients",
      doctorBtn: "For physicians",
      navBackground: "Background",
      navAims: "Aim & Research Directions",
      navWorkflow: "How the Registry Operates",
      navFuture: "Future Directions",
      navMembers: "Members & Partners",
      aimTitle: "Aim",
      aimBody:
        "Vietnam Lupus Registry collects real-world visit and laboratory data of people with systemic lupus erythematosus (SLE) over time, to understand the disease, its course and treatment response in Vietnamese patients and to support better care.",
      patientsTitle: "Living with lupus?",
      patientsBody:
        "Every record you share helps doctors and researchers understand lupus in Vietnam. Taking part is free and you can withdraw at any time.",
      patientsMore: "See benefits and how to join",
    },
    about: {
      title: "About Vietnam Lupus Registry",
      intro:
        "Vietnam Lupus Registry is a patient-powered digital registry for systemic lupus erythematosus (SLE) in Vietnam.",
      backgroundKicker: "Overview",
      backgroundTitle: "Background",
      backgroundCards: [
        {
          title: "Complex, heterogeneous disease",
          body: "Systemic lupus erythematosus is a chronic autoimmune disease affecting the skin, joints, kidneys, blood, heart, lungs and nervous system. It flares over time and varies widely between patients.",
        },
        {
          title: "Why clinical registries matter",
          body: "Lupus registries are vital for defining epidemiology, real-world disease trajectories, treatment safety and efficacy, and long-term follow-up beyond conventional hospital databases.",
        },
        {
          title: "National standardization in Vietnam",
          body: "Patient records in Vietnam are scattered across paper reports and clinics. A national registry enables population-specific biomarkers, predictive models, and global research collaboration.",
        },
      ],
      aimKicker: "Scientific Focus",
      aimTitle: "Aim and research directions",
      aimBody: "The registry focuses on:",
      aims: [
        "Clinical and laboratory features of SLE patients, classified by the 2019 EULAR/ACR criteria.",
        "Disease activity and its course over time, measured with SLEDAI-2K.",
        "Organ involvement (kidney, blood, skin, joints, nervous system…) and related factors.",
        "Antibody profiles (ANA, anti-dsDNA…) and complement C3/C4, and their link to disease manifestations.",
        "Treatment, long-term response and safety in everyday clinical practice.",
      ],
      approachKicker: "Operational Workflow",
      approachTitle: "How the registry operates",
      approachBadge: "Reduces manual transcription by >75%",
      approachSubtitle:
        "Combining patient-submitted records, AI/OCR extraction for Vietnamese medical documents, and specialist verification.",
      workflowSteps: [
        {
          stepLabel: "Step 1",
          title: "Patient-driven collection",
          bullets: [
            "Secure web & mobile portal with electronic consent (E-consent)",
            "Upload photos of lab sheets, prescriptions, and discharge summaries",
          ],
        },
        {
          stepLabel: "Step 2",
          title: "AI & OCR document processing",
          bullets: [
            "Text recognition (OCR) and clinical language models",
            "Extract demographics, ANA, anti-dsDNA, C3/C4 and separate identifiers",
          ],
        },
        {
          stepLabel: "Step 3",
          title: "Specialist validation & CRF",
          bullets: [
            "Clinical rules and mapping to a standardized Case Report Form (CRF)",
            "Specialists review and approve every value against source scans",
          ],
        },
        {
          stepLabel: "Step 4",
          title: "Analytics & research",
          bullets: [
            "Clinical summaries for SLEDAI-2K, EULAR/ACR and longitudinal trends",
            "Cohort analytics and standardized REDCap export for research",
          ],
        },
      ],
      futureKicker: "Long-Term Vision",
      futureTitle: "Future directions",
      futureBody: "In the next phases the registry aims to:",
      future: [
        {
          title: "Multi-centre longitudinal network",
          body: "Grow into a national multi-centre registry following patients across visits over time.",
        },
        {
          title: "Biobank & multi-omics linkage",
          body: "Link biobanking and multi-omics data to classify phenotypes and discover new biomarkers.",
        },
        {
          title: "Predictive clinical models",
          body: "Develop models that predict flares, organ damage and treatment response.",
        },
        {
          title: "Precision medicine",
          body: "Support precision medicine tailored to Vietnamese patients with SLE.",
        },
      ],
      membersKicker: "Team & Institutions",
      membersSectionTitle: "Our Members & Implementing Partners",
      committeeTitle: "Our Members (Steering Committee)",
      committee: [
        {
          name: "Dr. Nguyen Van Dinh, MD, PhD",
          initials: "ND",
          role: "Principal Investigator",
          affiliation:
            "Vinmec-VinUni Institute of Immunology & Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital",
        },
        {
          name: "Allergy & Clinical Immunology Specialists",
          initials: "MD",
          role: "Clinical Steering Committee",
          affiliation:
            "Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital",
        },
        {
          name: "Immunology & Molecular Research Team",
          initials: "RS",
          role: "Biobank & Translational Research Committee",
          affiliation:
            "Vinmec-VinUni Institute of Immunology & Vinmec Research Institute of Stem Cell and Gene Technology (VRISG)",
        },
        {
          name: "Biomedical AI & Data Engineering Team",
          initials: "AI",
          role: "OCR, e-CRF & Data Standardization Lead",
          affiliation:
            "Vinmec-VinUni Institute of Immunology, College of Health Sciences, VinUniversity",
        },
      ],
      groupPhotoSrc: null,
      groupPhotoAlt: "Group photo of the Vietnam Lupus Registry Steering Committee and research team",
      groupPhotoCaption: "Vietnam Lupus Registry Steering Committee & Research Team",
      groupPhotoPlaceholderHint: "Team group photo will be updated here",
      teamTitle: "Implementing Partners",
      units: [
        {
          name: "Vinmec-VinUni Institute of Immunology",
          parent: "College of Health Sciences, VinUniversity",
        },
        {
          name: "Centre of Allergy and Clinical Immunology",
          parent: "Vinmec Times City International Hospital",
        },
        {
          name: "Vinmec Research Institute of Stem Cell and Gene Technology (VRISG)",
          parent: "Vinmec Healthcare System",
        },
      ],
    },
    patients: {
      title: "Information for patients",
      intro: "This page explains lupus, why the registry needs you, the benefits of taking part and how to start.",
      lupusTitle: "What is systemic lupus erythematosus?",
      lupus: [
        "Systemic lupus erythematosus (SLE) is an autoimmune disease: the immune system attacks the body by mistake. It can affect the skin, joints, kidneys, blood, heart, lungs, brain and other organs.",
        "It is most common in women of child-bearing age, but men, children and older people can also have lupus. Symptoms and severity differ between people and the disease often comes in flares.",
        "There is no cure yet, but the right treatment and regular follow-up help control the disease and reduce organ damage.",
      ],
      whyTitle: "Why a registry?",
      why: [
        "Track how lupus changes in each patient over time.",
        "Find ways to diagnose and treat earlier, better suited to Vietnamese patients.",
        "Help develop more effective treatments with fewer side effects.",
      ],
      contributeTitle: "How can you contribute?",
      contributeBody: "You only need to share documents you already have from your visits:",
      contribute: [
        "Blood, urine, antibody (ANA, anti-dsDNA) and complement test reports.",
        "Lung function, ultrasound and imaging results.",
        "Discharge summaries, prescriptions or clinical summaries if available.",
      ],
      doctorBenefitTitle: "A chance to talk with a specialist",
      doctorBenefitBody:
        "Your records are reviewed by allergy and clinical immunology specialists. When needed, you have the chance to discuss your results and follow-up directly with a doctor.",
    },
    contact: {
      title: "Contact",
      intro: "If you have questions about the registry, taking part or withdrawing from the project, please contact the research team.",
      unitsTitle: "Implementing Partners",
      units: [
        "Vinmec-VinUni Institute of Immunology, College of Health Sciences, VinUniversity",
        "Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital, 458 Minh Khai, Hai Ba Trung, Hanoi",
        "Vinmec Research Institute of Stem Cell and Gene Technology (VRISG), Vinmec Healthcare System",
      ],
      leadTitle: "Principal investigator",
      lead: "Dr. Nguyen Van Dinh — Vinmec-VinUni Institute of Immunology and Centre of Allergy and Clinical Immunology, Vinmec Times City",
      collaborateTitle: "Research collaboration",
      collaborateBody: "Doctors, hospitals and researchers who wish to join or collaborate with the registry may contact the research team by email below.",
    },
  },
};
