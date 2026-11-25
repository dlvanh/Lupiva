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
  { href: "/login?role=specialist", vi: "Cho bác sĩ", en: "For physicians", id: "nav-link-doctor" },
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
  photoSrc?: string | null;
  photoClassName?: string;
  row: "top" | "bottom";
}

export interface PartnerUnit {
  name: string;
  parent: string;
}

export interface SiteContent {
  home: {
    intro: string;
    patientsBtn: string;
    doctorBtn: string;
    navAims: string;
    navWorkflow: string;
    navFuture: string;
    navMembers: string;
  };
  about: {
    title: string;
    intro: string;
    aimKicker: string;
    aimTitle: string;
    aimBody: string;
    aims: string[];
    approachKicker: string;
    approachTitle: string;
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
    contributeTitle: string;
    contributeBody: string;
    contribute: string[];
  };
  contact: {
    title: string;
    intro: string;
    unitsTitle: string;
    units: string[];
    collaborateTitle: string;
    collaborateBody: string;
  };
}

export const SITE_CONTENT: Record<Language, SiteContent> = {
  vi: {
    home: {
      intro:
        "Hệ thống thu thập dữ liệu lâm sàng bệnh lupus ban đỏ hệ thống (SLE) Việt Nam với sự tham gia của người bệnh — chuẩn hóa hồ sơ khám và xét nghiệm thực tế để phục vụ nghiên cứu, hỗ trợ bác sĩ theo dõi và nâng cao chất lượng điều trị.",
      patientsBtn: "Dành cho bệnh nhân",
      doctorBtn: "Dành cho bác sĩ",
      navAims: "Mục tiêu & Hướng nghiên cứu",
      navWorkflow: "Cách Registry vận hành",
      navFuture: "Hướng phát triển",
      navMembers: "Thành viên & Đơn vị thực hiện",
    },
    about: {
      title: "Về Vietnam Lupus Registry",
      intro:
        "Vietnam Lupus Registry là hệ thống thu thập dữ liệu lâm sàng dành cho người bệnh lupus ban đỏ hệ thống (SLE) Việt Nam.",
      aimKicker: "Định hướng khoa học",
      aimTitle: "Mục tiêu và hướng nghiên cứu",
      aimBody: "Chuẩn hóa dữ liệu lâm sàng thực tế của người bệnh SLE Việt Nam để phục vụ nghiên cứu dịch tễ, miễn dịch và y học chính xác:",
      aims: [
        "Chuẩn hóa hồ sơ khám và xét nghiệm thực tế thành cơ sở dữ liệu lâm sàng đồng bộ của người bệnh SLE Việt Nam.",
        "Theo dõi mức độ hoạt động bệnh, diễn biến lâm sàng cùng hiệu quả và độ an toàn điều trị theo thời gian.",
        "Ứng dụng AI hiểu ngữ cảnh y khoa để tự động trích xuất, tách định danh và chuẩn hóa dữ liệu tiếng Việt.",
      ],
      approachKicker: "Quy trình vận hành",
      approachTitle: "Cách registry vận hành",
      approachSubtitle:
        "Kết hợp hồ sơ do người bệnh chia sẻ, công nghệ AI nhận dạng chữ và xử lý tài liệu y khoa tiếng Việt cùng thẩm định trực tiếp của bác sĩ chuyên khoa.",
      workflowSteps: [
        {
          stepLabel: "Bước 1",
          title: "Thu thập hồ sơ từ người bệnh",
          bullets: [
            "Cổng trực tuyến bảo mật trên web & điện thoại, ký bản chấp thuận điện tử",
            "Chụp hoặc tải ảnh phiếu xét nghiệm, đơn thuốc, giấy ra viện lên hệ thống",
          ],
        },
        {
          stepLabel: "Bước 2",
          title: "Xử lý tài liệu bằng AI & nhận dạng chữ",
          bullets: [
            "Nhận dạng văn bản tiếng Việt và hiểu ngữ cảnh lâm sàng",
            "Trích xuất thông tin lâm sàng và xử lý trích xuất dữ liệu định danh",
          ],
        },
        {
          stepLabel: "Bước 3",
          title: "Bác sĩ kiểm tra & chuẩn hóa",
          bullets: [
            "Áp dụng quy tắc lâm sàng và ánh xạ theo phiếu nghiên cứu chuẩn (CRF)",
            "Bác sĩ chuyên khoa đối chiếu tài liệu gốc và phê duyệt từng giá trị",
          ],
        },
        {
          stepLabel: "Bước 4",
          title: "Phân tích & Nghiên cứu",
          bullets: [
            "Tổng hợp đặc điểm lâm sàng, tiêu chuẩn EULAR/ACR 2019 và diễn biến theo thời gian",
            "Phân tích nhóm bệnh nhân và chuẩn hóa dữ liệu phục vụ nghiên cứu",
          ],
        },
      ],
      futureKicker: "Tầm nhìn dài hạn",
      futureTitle: "Hướng phát triển",
      futureBody: "Trong các giai đoạn tiếp theo, hệ thống hướng tới:",
      future: [
        {
          title: "Mạng lưới đa trung tâm",
          body: "Mở rộng thành mạng lưới dữ liệu đa trung tâm trên toàn quốc, theo dõi người bệnh dọc theo nhiều lần khám.",
        },
        {
          title: "Mô hình dự báo lâm sàng",
          body: "Xây dựng mô hình dự báo đợt bùng phát, tổn thương cơ quan và đáp ứng điều trị.",
        },
        {
          title: "Hướng điều trị riêng cho người Việt",
          body: "Cá thể hóa phác đồ theo dõi và điều trị phù hợp với đặc điểm người bệnh Việt Nam.",
        },
      ],
      membersKicker: "Đội ngũ & Tổ chức",
      membersSectionTitle: "Thành viên & Đơn vị thực hiện",
      committeeTitle: "Thành viên nhóm thực hiện",
      committee: [
        {
          name: "PGS.TS.BS Nguyễn Văn Đĩnh",
          initials: "NĐ",
          role: "Vinmec Times City, Trường Đại học VinUni",
          photoSrc: "/images/team/image13.png",
          row: "top",
        },
        {
          name: "ThS. Hoàng Thị Oánh",
          initials: "HO",
          role: "Vinmec, Viện Nghiên cứu Miễn dịch VinUni",
          photoSrc: "/images/team/image14.png",
          row: "top",
        },
        {
          name: "Đỗ Lê Việt Anh",
          initials: "VA",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image17.jpg",
          photoClassName: "object-[50%_25%]",
          row: "bottom",
        },
        {
          name: "Phạm Văn Kiên",
          initials: "VK",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image15.png",
          row: "bottom",
        },
        {
          name: "Vương Việt Hoàng",
          initials: "VH",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image16.png",
          row: "bottom",
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
          name: "VinUni VRIC - VinMec",
          parent: "Thuộc chương trình AI Thực Chiến",
        },
      ],
    },
    patients: {
      title: "Thông tin cho bệnh nhân",
      intro:
        "Trang này giải thích bệnh lupus, quyền lợi khi tham gia registry và các bước để bắt đầu.",
      lupusTitle: "Lupus ban đỏ hệ thống là gì?",
      lupus: [
        "Lupus ban đỏ hệ thống (systemic lupus erythematosus, SLE) là bệnh tự miễn mạn tính có thể ảnh hưởng đến nhiều cơ quan, từ da và khớp đến thận và hệ thần kinh (The Lancet). Bệnh phát sinh do tương tác giữa yếu tố di truyền, nội tiết và môi trường, dẫn đến mất dung nạp miễn dịch, sản xuất tự kháng thể, hình thành phức hợp miễn dịch và hoạt hóa con đường interferon típ I, góp phần duy trì tình trạng viêm và gây tổn thương mô.",
        "Bệnh gặp nhiều nhất ở phụ nữ trong độ tuổi sinh sản, nhưng cũng có thể gặp ở nam giới, trẻ em và người lớn tuổi. Mỗi người bệnh có biểu hiện và mức độ nặng khác nhau, bệnh thường diễn tiến thành từng đợt.",
        "Mục tiêu điều trị bệnh hiện nay là kiểm soát bệnh và theo dõi đều đặn nhằm giảm tổn thương cơ quan.",
      ],
      contributeTitle: "Bạn có thể đóng góp như thế nào?",
      contributeBody: "Bạn chỉ cần chia sẻ những giấy tờ đã có từ các lần khám:",
      contribute: [
        "Phiếu xét nghiệm máu, nước tiểu, kháng thể (ANA, anti-dsDNA), bổ thể.",
        "Kết quả đo chức năng hô hấp, siêu âm, chẩn đoán hình ảnh.",
        "Giấy ra viện, đơn thuốc, tóm tắt bệnh án nếu có.",
      ],
    },
    contact: {
      title: "Liên hệ",
      intro: "Nếu bạn có câu hỏi về registry, hoặc việc tham gia, vui lòng liên hệ nhóm nghiên cứu.",
      unitsTitle: "Đơn vị thực hiện",
      units: [
        "Viện Nghiên cứu Miễn dịch Vinmec – VinUni, Trường Khoa học Sức khỏe, Trường Đại học VinUni",
        "Trung tâm Dị ứng – Miễn dịch lâm sàng, Bệnh viện Đa khoa Quốc tế Vinmec Times City, 458 Minh Khai, Hai Bà Trưng, Hà Nội",
        "VinUni VRIC - VinMec thuộc chương trình AI Thực Chiến",
      ],
      collaborateTitle: "Hợp tác nghiên cứu",
      collaborateBody:
        "Bác sĩ, bệnh viện và nhà nghiên cứu muốn tham gia hoặc hợp tác với registry vui lòng liên hệ nhóm nghiên cứu qua email bên dưới.",
    },
  },
  en: {
    home: {
      intro:
        "A patient-powered digital registry for systemic lupus erythematosus (SLE) in Vietnam — collecting real-world visit and laboratory records to standardize research data, support longitudinal follow-up, and improve patient care.",
      patientsBtn: "For patients",
      doctorBtn: "For physicians",
      navAims: "Aim & Research Directions",
      navWorkflow: "How the Registry Operates",
      navFuture: "Future Directions",
      navMembers: "Members & Partners",
    },
    about: {
      title: "About Vietnam Lupus Registry",
      intro:
        "Vietnam Lupus Registry is a patient-powered digital registry for systemic lupus erythematosus (SLE) in Vietnam.",
      aimKicker: "Scientific Focus",
      aimTitle: "Aim and research directions",
      aimBody: "Standardizing real-world SLE clinical records in Vietnam to advance epidemiological, immunological, and precision medicine research:",
      aims: [
        "Standardize real-world patient visit and laboratory records into unified SLE clinical schemas in Vietnam.",
        "Track disease activity, clinical trajectories, and long-term treatment efficacy and safety over time.",
        "Apply context-aware clinical AI for automated Vietnamese medical extraction, de-identification, and validation.",
      ],
      approachKicker: "Operational Workflow",
      approachTitle: "How the registry operates",
      approachSubtitle:
        "Combining patient-submitted records, AI/OCR extraction for Vietnamese medical documents, and specialist verification.",
      workflowSteps: [
        {
          stepLabel: "Step 1",
          title: "Patient-driven collection",
          bullets: [
            "Secure web & mobile portal with electronic consent",
            "Upload photos of lab sheets, prescriptions, and discharge summaries",
          ],
        },
        {
          stepLabel: "Step 2",
          title: "AI & OCR document processing",
          bullets: [
            "Text recognition (OCR) and clinical language models",
            "Extract clinical information and process data de-identification",
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
            "Clinical summaries for EULAR/ACR 2019 classification and longitudinal trends",
            "Cohort analytics and standardized data export for research",
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
          title: "Predictive clinical models",
          body: "Develop models that predict flares, organ damage and treatment response.",
        },
        {
          title: "Personalized treatment for Vietnamese patients",
          body: "Support personalized follow-up and treatment tailored to Vietnamese patients with SLE.",
        },
      ],
      membersKicker: "Team & Institutions",
      membersSectionTitle: "Our Members & Implementing Partners",
      committeeTitle: "Our Members",
      committee: [
        {
          name: "Assoc. Prof. Nguyen Van Dinh",
          initials: "ND",
          role: "Vinmec Times City, VinUniversity",
          photoSrc: "/images/team/image13.png",
          row: "top",
        },
        {
          name: "Hoang Thi Oanh, MSc",
          initials: "HO",
          role: "Vinmec, VinUni Institute of Immunology",
          photoSrc: "/images/team/image14.png",
          row: "top",
        },
        {
          name: "Do Le Viet Anh",
          initials: "VA",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image17.jpg",
          photoClassName: "object-[50%_25%]",
          row: "bottom",
        },
        {
          name: "Pham Van Kien",
          initials: "VK",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image15.png",
          row: "bottom",
        },
        {
          name: "Vuong Viet Hoang",
          initials: "VH",
          role: "VinUniversity VRIC – Vinmec",
          photoSrc: "/images/team/image16.png",
          row: "bottom",
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
          name: "VinUni VRIC - VinMec",
          parent: "Practical AI Program",
        },
      ],
    },
    patients: {
      title: "Information for patients",
      intro: "This page explains lupus, the benefits of taking part in the registry and how to start.",
      lupusTitle: "What is systemic lupus erythematosus?",
      lupus: [
        "Systemic lupus erythematosus (SLE) is a chronic autoimmune disease that can affect multiple organs, from the skin and joints to the kidneys and nervous system (The Lancet). It develops through interactions among genetic, hormonal, and environmental factors, leading to loss of immune tolerance, autoantibody production, immune complex formation, and activation of the type I interferon pathway, sustaining inflammation and causing tissue damage.",
        "It is most common in women of reproductive age, but men, children and older people can also have lupus. Symptoms and severity differ between people and the disease often comes in flares.",
        "Current treatment aims to control the disease and maintain regular follow-up to reduce organ damage.",
      ],
      contributeTitle: "How can you contribute?",
      contributeBody: "You only need to share documents you already have from your visits:",
      contribute: [
        "Blood, urine, antibody (ANA, anti-dsDNA) and complement test reports.",
        "Lung function, ultrasound and imaging results.",
        "Discharge summaries, prescriptions or clinical summaries if available.",
      ],
    },
    contact: {
      title: "Contact",
      intro: "If you have questions about the registry, or taking part, please contact the research team.",
      unitsTitle: "Implementing Partners",
      units: [
        "Vinmec-VinUni Institute of Immunology, College of Health Sciences, VinUniversity",
        "Centre of Allergy and Clinical Immunology, Vinmec Times City International Hospital, 458 Minh Khai, Hai Ba Trung, Hanoi",
        "VinUni VRIC - VinMec, Practical AI Program",
      ],
      collaborateTitle: "Research collaboration",
      collaborateBody: "Doctors, hospitals and researchers who wish to join or collaborate with the registry may contact the research team by email below.",
    },
  },
};
