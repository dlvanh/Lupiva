/**
 * Public pages of VietNam Lupus Registry (home, about, patients, contact).
 * Wording is drawn from the VMEC 2026 abstract and the project plan; it is a
 * draft pending review by the research team. TODO: research team to confirm wording.
 */
import type { Language } from "@/data/translations";

export const SITE_NAME = "VietNam Lupus Registry";

export const SITE_PAGES = [
  { href: "/", vi: "Trang chủ", en: "Home", id: "nav-link-home" },
  { href: "/gioi-thieu", vi: "Về registry", en: "About the registry", id: "nav-link-about" },
  { href: "/benh-nhan", vi: "Thông tin cho bệnh nhân", en: "For patients", id: "nav-link-patients" },
  { href: "/lien-he", vi: "Liên hệ", en: "Contact", id: "nav-link-contact" },
] as const;

type Item = { title: string; body: string };

export interface SiteContent {
  home: {
    tagline: string;
    intro: string;
    patientsBtn: string;
    aboutBtn: string;
    aimTitle: string;
    aimBody: string;
    aimMore: string;
    howTitle: string;
    how: Item[];
    patientsTitle: string;
    patientsBody: string;
    patientsMore: string;
  };
  about: {
    title: string;
    intro: string;
    backgroundTitle: string;
    background: string[];
    aimTitle: string;
    aimBody: string;
    aims: string[];
    approachTitle: string;
    approachBody: string;
    approach: Item[];
    futureTitle: string;
    futureBody: string;
    future: string[];
    teamTitle: string;
    team: string[];
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
      tagline: "Registry bệnh lupus ban đỏ hệ thống tại Việt Nam",
      intro:
        "Chia sẻ kết quả khám và xét nghiệm để cùng bác sĩ hiểu rõ hơn về bệnh lupus ở người Việt Nam và tìm cách điều trị tốt hơn.",
      patientsBtn: "Thông tin cho bệnh nhân",
      aboutBtn: "Về registry",
      aimTitle: "Mục tiêu",
      aimBody:
        "VietNam Lupus Registry thu thập dữ liệu khám và xét nghiệm thực tế của người bệnh lupus ban đỏ hệ thống (SLE) theo thời gian, để hiểu rõ đặc điểm bệnh, diễn tiến, đáp ứng điều trị ở người Việt Nam và hỗ trợ chăm sóc người bệnh tốt hơn.",
      aimMore: "Tìm hiểu thêm về registry",
      howTitle: "Registry hoạt động như thế nào",
      how: [
        { title: "Người bệnh gửi hồ sơ", body: "Sau khi đồng ý tham gia, người bệnh chụp hoặc tải ảnh phiếu khám, phiếu xét nghiệm lên cổng trực tuyến." },
        { title: "Hệ thống đọc tài liệu", body: "Công nghệ nhận dạng chữ và trí tuệ nhân tạo đọc tài liệu, hiểu ngữ cảnh lâm sàng và đề xuất giá trị cho phiếu nghiên cứu." },
        { title: "Bác sĩ kiểm tra", body: "Bác sĩ chuyên khoa đối chiếu từng giá trị với tài liệu gốc trước khi phê duyệt." },
        { title: "Dữ liệu cho nghiên cứu", body: "Dữ liệu đã duyệt được chuẩn hóa, giả danh hóa và dùng cho các nghiên cứu về bệnh lupus." },
      ],
      patientsTitle: "Bạn đang sống chung với bệnh lupus?",
      patientsBody:
        "Mỗi hồ sơ bạn chia sẻ giúp các bác sĩ và nhà nghiên cứu hiểu rõ hơn bệnh lupus ở người Việt Nam. Tham gia miễn phí và bạn có thể rút lại bất cứ lúc nào.",
      patientsMore: "Xem quyền lợi và cách tham gia",
    },
    about: {
      title: "Về VietNam Lupus Registry",
      intro:
        "VietNam Lupus Registry là registry số do người bệnh cùng tham gia, dành cho bệnh lupus ban đỏ hệ thống (SLE) tại Việt Nam. Registry thu thập hồ sơ khám và xét nghiệm trong quá trình điều trị thường quy, chuẩn hóa theo phiếu nghiên cứu (CRF) và được bác sĩ chuyên khoa kiểm tra.",
      backgroundTitle: "Bối cảnh",
      background: [
        "Lupus ban đỏ hệ thống là bệnh tự miễn mạn tính, có thể ảnh hưởng nhiều cơ quan như da, khớp, thận, máu, tim, phổi và thần kinh. Bệnh diễn tiến thành từng đợt và rất khác nhau giữa từng người.",
        "Các registry bệnh lupus rất quan trọng để hiểu dịch tễ, diễn tiến bệnh trong thực tế, hiệu quả và độ an toàn của điều trị, cũng như theo dõi người bệnh lâu dài. Giá trị nghiên cứu của registry vượt xa cơ sở dữ liệu bệnh viện thông thường.",
        "Tại Việt Nam, dữ liệu của người bệnh lupus còn phân tán trên nhiều hồ sơ giấy và phiếu xét nghiệm. Một registry quốc gia giúp tìm ra các dấu ấn sinh học và mô hình dự báo phù hợp với người Việt Nam, đồng thời giúp các nhà nghiên cứu Việt Nam tham gia bình đẳng vào các câu hỏi khoa học lớn.",
      ],
      aimTitle: "Mục tiêu và hướng nghiên cứu",
      aimBody: "Registry tập trung vào các hướng:",
      aims: [
        "Đặc điểm lâm sàng và cận lâm sàng của người bệnh SLE, phân loại theo tiêu chuẩn EULAR/ACR 2019.",
        "Mức độ hoạt động bệnh và diễn tiến theo thời gian, đánh giá bằng thang SLEDAI-2K.",
        "Tổn thương cơ quan (thận, máu, da, khớp, thần kinh…) và các yếu tố liên quan.",
        "Hồ sơ kháng thể (ANA, anti-dsDNA…) và bổ thể C3/C4, mối liên hệ với biểu hiện bệnh.",
        "Điều trị, đáp ứng và độ an toàn của điều trị lâu dài trong thực hành thực tế.",
      ],
      approachTitle: "Cách registry vận hành",
      approachBody:
        "Thay vì bác sĩ nhập tay toàn bộ phiếu điện tử, registry dùng chính hồ sơ do người bệnh gửi, kết hợp công nghệ đọc tài liệu thông minh và kiểm tra của bác sĩ. Bản thử nghiệm đã đọc được nhiều loại tài liệu y khoa tiếng Việt và giảm hơn 75% công nhập liệu thủ công.",
      approach: [
        { title: "1. Thu thập hồ sơ từ người bệnh", body: "Cổng trực tuyến bảo mật trên web và điện thoại, có đồng ý tham gia điện tử. Nhận ảnh chụp phiếu xét nghiệm, giấy ra viện và các tài liệu khám." },
        { title: "2. Xử lý tài liệu bằng AI", body: "Nhận dạng chữ (OCR) và mô hình ngôn ngữ hiểu ngữ cảnh lâm sàng để trích xuất thông tin như nhân khẩu học, ANA, anti-dsDNA, C3/C4, thuốc điều trị; đồng thời tách thông tin định danh." },
        { title: "3. Kiểm tra và chuẩn hóa dữ liệu", body: "Quy tắc kiểm tra lâm sàng, ánh xạ theo phiếu CRF chuẩn và bác sĩ chuyên khoa phê duyệt từng giá trị, có truy ngược về tài liệu gốc." },
        { title: "4. Phân tích và nghiên cứu", body: "Bảng tổng hợp lâm sàng (nhân khẩu học, xét nghiệm, hoạt động bệnh, kết cục), công cụ phân tích nhóm bệnh nhân và xuất dữ liệu sang REDCap cho nghiên cứu." },
      ],
      futureTitle: "Hướng phát triển",
      futureBody: "Trong các giai đoạn tiếp theo, registry hướng tới:",
      future: [
        "Mở rộng thành registry đa trung tâm, theo dõi người bệnh lâu dài qua nhiều lần khám.",
        "Liên kết với ngân hàng mẫu sinh học (biobank) và dữ liệu đa omics để phân loại kiểu hình bệnh và tìm dấu ấn sinh học mới.",
        "Xây dựng mô hình dự báo đợt bùng phát, tổn thương cơ quan và đáp ứng điều trị.",
        "Hỗ trợ y học chính xác phù hợp với đặc điểm của người bệnh Việt Nam.",
      ],
      teamTitle: "Đơn vị thực hiện",
      team: [
        "Viện Miễn dịch học Vinmec-VinUni, Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        "Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City",
        "VRIC, Vinmec Times City",
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
        "Viện Miễn dịch học Vinmec-VinUni, Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        "Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City, 458 Minh Khai, Hai Bà Trưng, Hà Nội",
        "VRIC, Vinmec Times City",
      ],
      leadTitle: "Chủ nhiệm nghiên cứu",
      lead: "Nguyen Van Dinh — Viện Miễn dịch học Vinmec-VinUni và Trung tâm Dị ứng – Miễn dịch lâm sàng, Vinmec Times City",
      collaborateTitle: "Hợp tác nghiên cứu",
      collaborateBody:
        "Bác sĩ, bệnh viện và nhà nghiên cứu muốn tham gia hoặc hợp tác với registry vui lòng liên hệ nhóm nghiên cứu qua email bên dưới.",
    },
  },
  en: {
    home: {
      tagline: "The systemic lupus erythematosus registry of Vietnam",
      intro:
        "Share your visit and test results to help doctors better understand lupus in Vietnamese patients and find better treatments.",
      patientsBtn: "For patients",
      aboutBtn: "About the registry",
      aimTitle: "Aim",
      aimBody:
        "VietNam Lupus Registry collects real-world visit and laboratory data of people with systemic lupus erythematosus (SLE) over time, to understand the disease, its course and treatment response in Vietnamese patients and to support better care.",
      aimMore: "Learn more about the registry",
      howTitle: "How the registry works",
      how: [
        { title: "Patients submit records", body: "After giving consent, patients photograph or upload their visit and lab reports on the online portal." },
        { title: "The system reads the documents", body: "Text recognition and artificial intelligence read the documents, understand the clinical context and propose values for the research form." },
        { title: "Doctors check", body: "A specialist checks every value against the source document before approving it." },
        { title: "Data for research", body: "Approved data is standardized, pseudonymized and used for lupus research." },
      ],
      patientsTitle: "Living with lupus?",
      patientsBody:
        "Every record you share helps doctors and researchers understand lupus in Vietnam. Taking part is free and you can withdraw at any time.",
      patientsMore: "See benefits and how to join",
    },
    about: {
      title: "About VietNam Lupus Registry",
      intro:
        "VietNam Lupus Registry is a patient-powered digital registry for systemic lupus erythematosus (SLE) in Vietnam. It collects records from routine care, standardizes them on a case report form (CRF) and has them checked by specialists.",
      backgroundTitle: "Background",
      background: [
        "Systemic lupus erythematosus is a chronic autoimmune disease that can affect the skin, joints, kidneys, blood, heart, lungs and nervous system. It flares over time and differs greatly between patients.",
        "Lupus registries are vital for defining epidemiology, real-world disease trajectories, treatment safety and efficacy, and long-term patient follow-up, offering research value far beyond conventional hospital databases.",
        "In Vietnam, lupus patient data are scattered across paper records and lab reports. A national registry enables population-specific biomarkers and predictive models and positions Vietnamese researchers as equal partners in high-impact questions.",
      ],
      aimTitle: "Aim and research directions",
      aimBody: "The registry focuses on:",
      aims: [
        "Clinical and laboratory features of SLE patients, classified by the 2019 EULAR/ACR criteria.",
        "Disease activity and its course over time, measured with SLEDAI-2K.",
        "Organ involvement (kidney, blood, skin, joints, nervous system…) and related factors.",
        "Antibody profiles (ANA, anti-dsDNA…) and complement C3/C4, and their link to disease manifestations.",
        "Treatment, long-term response and safety in everyday practice.",
      ],
      approachTitle: "How the registry operates",
      approachBody:
        "Instead of doctors typing every form by hand, the registry uses records submitted by patients, combined with intelligent document reading and specialist review. The prototype read diverse Vietnamese clinical documents and reduced manual transcription by more than 75%.",
      approach: [
        { title: "1. Patient-driven collection", body: "A secure web and mobile portal with electronic consent accepts photos of lab sheets, discharge summaries and other records." },
        { title: "2. AI document processing", body: "Text recognition (OCR) and language models with clinical context extract demographics, ANA, anti-dsDNA, C3/C4 and medications, and separate identifying details." },
        { title: "3. Validation and harmonization", body: "Clinical rules, mapping to a standard CRF and specialist approval of every value, traceable to the source document." },
        { title: "4. Analytics and research", body: "Clinical dashboards (demographics, labs, disease activity, outcomes), cohort analytics and export to REDCap for research." },
      ],
      futureTitle: "Future directions",
      futureBody: "In the next phases the registry aims to:",
      future: [
        "Grow into a multi-centre registry following patients over many visits.",
        "Link biobanking and multi-omics data to classify disease phenotypes and discover new biomarkers.",
        "Develop models that predict flares, organ damage and treatment response.",
        "Support precision medicine suited to Vietnamese patients.",
      ],
      teamTitle: "Partners",
      team: [
        "Vinmec-VinUni Institute of Immunology, College of Health Sciences, VinUniversity",
        "Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital",
        "VRIC, Vinmec Times City",
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
      unitsTitle: "Partners",
      units: [
        "Vinmec-VinUni Institute of Immunology, College of Health Sciences, VinUniversity",
        "Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital, 458 Minh Khai, Hai Ba Trung, Hanoi",
        "VRIC, Vinmec Times City",
      ],
      leadTitle: "Principal investigator",
      lead: "Nguyen Van Dinh — Vinmec-VinUni Institute of Immunology and Centre of Allergy and Clinical Immunology, Vinmec Times City",
      collaborateTitle: "Research collaboration",
      collaborateBody: "Doctors, hospitals and researchers who wish to join or collaborate with the registry may contact the research team by email below.",
    },
  },
};
