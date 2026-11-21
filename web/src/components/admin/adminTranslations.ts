import type { PipelineStatus } from "@/db/schema";
import type { UserRole } from "@/data/mockData";
import type { Language } from "@/data/translations";

export interface AdminCopy {
  pageTitle: string;
  pageSubtitle: string;
  adminBadge: string;
  refreshAll: string;
  refreshing: string;
  lastUpdated: string;
  tabs: {
    all: string;
    accounts: string;
    telemetry: string;
    pipeline: string;
    audit: string;
  };
  kpis: {
    activeAccounts: string;
    systemHealth: string;
    queueAttention: string;
    securityAlerts24h: string;
    healthy: string;
    degraded: string;
  };
  accounts: {
    title: string;
    subtitle: string;
    total: string;
    active: string;
    inactive: string;
    searchPlaceholder: string;
    roleAll: string;
    statusAll: string;
    statusActive: string;
    statusInactive: string;
    provisionBtn: string;
    createTitle: string;
    fullName: string;
    email: string;
    phone: string;
    password: string;
    passwordHint: string;
    generatePassword: string;
    passwordGenerated: string;
    showPassword: string;
    hidePassword: string;
    copyPassword: string;
    passwordCopied: string;
    roleLabel: string;
    titleLabel: string;
    departmentLabel: string;
    createSubmit: string;
    cancel: string;
    thAccount: string;
    thContact: string;
    thRole: string;
    thStatus: string;
    thSessions: string;
    thActions: string;
    consentSigned: string;
    consentPending: string;
    activate: string;
    suspend: string;
    revokeSessions: string;
    selfBadge: string;
    empty: string;
  };
  telemetry: {
    title: string;
    subtitle: string;
    dbService: string;
    pipelineService: string;
    vaultService: string;
    connected: string;
    unavailable: string;
    online: string;
    degraded: string;
    offline: string;
    configured: string;
    incomplete: string;
    latency: string;
    casesIndexed: string;
    clinicalMetrics: string;
    patientProfiles: string;
    submissionsTotal: string;
    approved: string;
    pendingReview: string;
    unopened: string;
    documentsTotal: string;
    vaultSize: string;
    pipelineBreakdown: string;
    securityPosture: string;
    activeSessions: string;
    rateLimitLockouts: string;
    alerts24h: string;
    failures24h: string;
    demoMode: string;
    inviteGate: string;
    pipelineEngine: string;
    cookieSecure: string;
    enabled: string;
    disabled: string;
    runtimeHeading: string;
    uptime: string;
    memoryRss: string;
    memoryHeap: string;
    auditTotal: string;
  };
  pipeline: {
    title: string;
    subtitle: string;
    syncBtn: string;
    backendOnline: string;
    backendOffline: string;
    totalJobs: string;
    activeJobs: string;
    pendingJobs: string;
    completedJobs: string;
    failedJobs: string;
    searchPlaceholder: string;
    statusAll: string;
    thStudy: string;
    thPipelineStatus: string;
    thDocuments: string;
    thUpdated: string;
    thControls: string;
    inspect: string;
    hideDetails: string;
    retry: string;
    resetPending: string;
    markFailed: string;
    reasonPrompt: string;
    confirmMarkFailed: string;
    cancel: string;
    intakeIdLabel: string;
    backendStatusLabel: string;
    errorLabel: string;
    noError: string;
    docsHeading: string;
    localImagesLabel: (count: number) => string;
    empty: string;
  };
  audit: {
    title: string;
    subtitle: string;
    exportCsv: string;
    totalEvents: string;
    securityAlerts: string;
    authEvents: string;
    submissionEvents: string;
    adminEvents: string;
    searchPlaceholder: string;
    categoryAll: string;
    categoryAlerts: string;
    categoryAuth: string;
    categorySubmission: string;
    categoryAdmin: string;
    roleAll: string;
    roleSystem: string;
    dateFrom: string;
    dateTo: string;
    thTime: string;
    thAction: string;
    thActor: string;
    thTarget: string;
    thIp: string;
    thDetails: string;
    alertBadge: string;
    inspect: string;
    hide: string;
    userAgentLabel: string;
    metadataLabel: string;
    empty: string;
  };
  roles: Record<UserRole, string>;
  pipelineStatuses: Record<PipelineStatus, string>;
  pagination: {
    prev: string;
    next: string;
    pageOf: (page: number, totalPages: number, totalItems: number) => string;
  };
}

const EN_COPY: AdminCopy = {
  pageTitle: "System Administration & Security Console",
  pageSubtitle:
    "Manage registry user accounts, monitor service telemetry, inspect OCR pipeline jobs, and audit security events.",
  adminBadge: "System Admin",
  refreshAll: "Refresh All",
  refreshing: "Refreshing...",
  lastUpdated: "Last synced",
  tabs: {
    all: "All Sections",
    accounts: "Accounts",
    telemetry: "System Health & Telemetry",
    pipeline: "OCR Pipeline Queue",
    audit: "Security Audit Logs",
  },
  kpis: {
    activeAccounts: "Active Accounts",
    systemHealth: "System Status",
    queueAttention: "Queue Attention (Failed / Held)",
    securityAlerts24h: "Security Alerts (24h)",
    healthy: "Healthy",
    degraded: "Degraded",
  },
  accounts: {
    title: "Account Management",
    subtitle: "Search users, manage roles and active status, revoke sessions, or provision staff accounts.",
    total: "Total",
    active: "Active",
    inactive: "Suspended",
    searchPlaceholder: "Search by name, email, phone, or department...",
    roleAll: "All roles",
    statusAll: "All statuses",
    statusActive: "Active",
    statusInactive: "Suspended",
    provisionBtn: "Provision Account",
    createTitle: "Provision New User Account",
    fullName: "Full Name",
    email: "Email",
    phone: "Phone (+84 / 09...)",
    password: "Initial Password",
    passwordHint: "Min 8 chars with letter, number, and special character.",
    generatePassword: "Generate password",
    passwordGenerated: "Strong password generated.",
    showPassword: "Show password",
    hidePassword: "Hide password",
    copyPassword: "Copy",
    passwordCopied: "Copied",
    roleLabel: "Role",
    titleLabel: "Clinical / Ops Title",
    departmentLabel: "Department / Registry ID",
    createSubmit: "Create Account",
    cancel: "Cancel",
    thAccount: "Account",
    thContact: "Encrypted Contact",
    thRole: "Role",
    thStatus: "Status",
    thSessions: "Sessions",
    thActions: "Actions",
    consentSigned: "Consent signed",
    consentPending: "No consent",
    activate: "Activate",
    suspend: "Suspend",
    revokeSessions: "Revoke sessions",
    selfBadge: "You",
    empty: "No accounts match the selected filters.",
  },
  telemetry: {
    title: "System Health & Telemetry Overview",
    subtitle: "Live PostgreSQL connectivity, Python OCR backend health, vault readiness, and runtime telemetry.",
    dbService: "PostgreSQL Clinical DB",
    pipelineService: "OCR / CRF Python Backend",
    vaultService: "Zone B Encryption Vault",
    connected: "Connected",
    unavailable: "Unavailable",
    online: "Online",
    degraded: "Degraded",
    offline: "Offline",
    configured: "Configured",
    incomplete: "Incomplete",
    latency: "Latency",
    casesIndexed: "Cases indexed",
    clinicalMetrics: "Clinical & Document Vault Metrics",
    patientProfiles: "Patient Profiles",
    submissionsTotal: "CRF Submissions",
    approved: "Approved",
    pendingReview: "Pending Review",
    unopened: "Unopened New",
    documentsTotal: "Vault Documents",
    vaultSize: "Stored Payload",
    pipelineBreakdown: "OCR Pipeline State Distribution",
    securityPosture: "Security Posture & Guardrails",
    activeSessions: "Active Sessions",
    rateLimitLockouts: "Active Rate-Limit Lockouts",
    alerts24h: "Security Alerts (24h)",
    failures24h: "Failed Logins (24h)",
    demoMode: "Demo Autofill Mode",
    inviteGate: "Specialist Invite Code",
    pipelineEngine: "OCR Extraction Engine",
    cookieSecure: "Cookie Secure Policy",
    enabled: "Enabled",
    disabled: "Disabled",
    runtimeHeading: "Node.js Runtime & Audit Volume",
    uptime: "Process Uptime",
    memoryRss: "RSS Memory",
    memoryHeap: "Heap Used / Total",
    auditTotal: "Audit Log Records",
  },
  pipeline: {
    title: "OCR Pipeline Queue",
    subtitle: "Inspect submission OCR intake status, view diagnostics, and retry or reset blocked jobs.",
    syncBtn: "Sync Active Jobs",
    backendOnline: "Backend Online",
    backendOffline: "Backend Offline",
    totalJobs: "Total Jobs",
    activeJobs: "Active",
    pendingJobs: "Pending / Held",
    completedJobs: "Completed",
    failedJobs: "Failed",
    searchPlaceholder: "Search by Study ID, submission ID, intake ID, file, or error...",
    statusAll: "All pipeline states",
    thStudy: "Submission / Study ID",
    thPipelineStatus: "Pipeline State",
    thDocuments: "Documents",
    thUpdated: "Last Updated",
    thControls: "Controls",
    inspect: "Inspect",
    hideDetails: "Hide",
    retry: "Retry",
    resetPending: "Reset",
    markFailed: "Mark Failed",
    reasonPrompt: "Diagnostic reason for marking job failed",
    confirmMarkFailed: "Confirm Mark Failed",
    cancel: "Cancel",
    intakeIdLabel: "Backend Intake ID",
    backendStatusLabel: "Live Backend Status",
    errorLabel: "Diagnostic Error",
    noError: "No diagnostic error recorded.",
    docsHeading: "Attached Documents",
    localImagesLabel: (count: number) => `${count} local image(s)`,
    empty: "No OCR pipeline jobs match the selected filters.",
  },
  audit: {
    title: "Security Audit Log Explorer",
    subtitle: "Immutable trail of authentication attempts, role checks, clinical updates, and administrative actions.",
    exportCsv: "Export CSV",
    totalEvents: "Total Events",
    securityAlerts: "Security Alerts",
    authEvents: "Auth Events",
    submissionEvents: "Submissions",
    adminEvents: "Admin Actions",
    searchPlaceholder: "Search action, actor, target ID, IP, or metadata...",
    categoryAll: "All Categories",
    categoryAlerts: "Security Alerts",
    categoryAuth: "Authentication",
    categorySubmission: "Submissions",
    categoryAdmin: "Admin Actions",
    roleAll: "All actor roles",
    roleSystem: "System / Anonymous",
    dateFrom: "From date",
    dateTo: "To date",
    thTime: "Timestamp",
    thAction: "Action",
    thActor: "Actor",
    thTarget: "Target",
    thIp: "Source IP",
    thDetails: "Metadata",
    alertBadge: "ALERT",
    inspect: "Inspect",
    hide: "Hide",
    userAgentLabel: "User-Agent",
    metadataLabel: "Sanitized Metadata JSON",
    empty: "No audit log entries match the current filters.",
  },
  roles: {
    patient: "Patient",
    specialist: "Specialist",
    admin: "Admin",
  },
  pipelineStatuses: {
    none: "Pending Dispatch",
    privacy_check: "Privacy Check",
    privacy_review: "Privacy Hold",
    processing: "Processing OCR",
    completed: "Completed",
    failed: "Failed",
  },
  pagination: {
    prev: "Previous",
    next: "Next",
    pageOf: (page, totalPages, totalItems) =>
      `Page ${page} of ${totalPages} (${totalItems} items)`,
  },
};

const VI_COPY: AdminCopy = {
  pageTitle: "Bảng điều khiển Quản trị & An toàn Hệ thống",
  pageSubtitle:
    "Quản lý tài khoản người dùng, theo dõi sức khỏe hệ thống, kiểm tra hàng đợi OCR và tra cứu nhật ký bảo mật.",
  adminBadge: "Quản trị viên",
  refreshAll: "Làm mới tất cả",
  refreshing: "Đang làm mới...",
  lastUpdated: "Cập nhật lúc",
  tabs: {
    all: "Tất cả phân hệ",
    accounts: "Tài khoản",
    telemetry: "Sức khỏe & Telemetry",
    pipeline: "Hàng đợi OCR",
    audit: "Nhật ký Bảo mật",
  },
  kpis: {
    activeAccounts: "Tài khoản hoạt động",
    systemHealth: "Trạng thái hệ thống",
    queueAttention: "Hàng đợi cần xử lý",
    securityAlerts24h: "Cảnh báo bảo mật (24h)",
    healthy: "Ổn định",
    degraded: "Suy giảm",
  },
  accounts: {
    title: "Quản lý Tài khoản",
    subtitle: "Tìm kiếm người dùng, phân quyền vai trò, khóa/mở tài khoản, thu hồi phiên hoặc cấp tài khoản mới.",
    total: "Tổng",
    active: "Hoạt động",
    inactive: "Đã khóa",
    searchPlaceholder: "Tìm theo tên, email, SĐT hoặc khoa/phòng...",
    roleAll: "Tất cả vai trò",
    statusAll: "Tất cả trạng thái",
    statusActive: "Đang hoạt động",
    statusInactive: "Đã tạm khóa",
    provisionBtn: "Cấp tài khoản mới",
    createTitle: "Tạo tài khoản mới",
    fullName: "Họ và tên",
    email: "Email",
    phone: "Số điện thoại (+84 / 09...)",
    password: "Mật khẩu khởi tạo",
    passwordHint: "Tối thiểu 8 ký tự gồm chữ, số và ký tự đặc biệt.",
    generatePassword: "Tạo mật khẩu",
    passwordGenerated: "Đã tạo mật khẩu mạnh.",
    showPassword: "Hiện mật khẩu",
    hidePassword: "Ẩn mật khẩu",
    copyPassword: "Sao chép",
    passwordCopied: "Đã chép",
    roleLabel: "Vai trò",
    titleLabel: "Chức danh",
    departmentLabel: "Đơn vị / Mã đăng ký",
    createSubmit: "Tạo tài khoản",
    cancel: "Hủy",
    thAccount: "Tài khoản",
    thContact: "Liên hệ (Đã giải mã)",
    thRole: "Vai trò",
    thStatus: "Trạng thái",
    thSessions: "Phiên",
    thActions: "Thao tác",
    consentSigned: "Đã đồng thuận",
    consentPending: "Chưa đồng thuận",
    activate: "Kích hoạt",
    suspend: "Tạm khóa",
    revokeSessions: "Thu hồi phiên",
    selfBadge: "Bạn",
    empty: "Không có tài khoản nào khớp bộ lọc.",
  },
  telemetry: {
    title: "Tổng quan Sức khỏe Hệ thống & Telemetry",
    subtitle: "Giám sát kết nối PostgreSQL, dịch vụ OCR/CRF Python, trạng thái mã hóa và tài nguyên tiến trình.",
    dbService: "Cơ sở dữ liệu PostgreSQL",
    pipelineService: "Dịch vụ OCR / CRF Python",
    vaultService: "Kho mã hóa PII Zone B",
    connected: "Đã kết nối",
    unavailable: "Mất kết nối",
    online: "Hoạt động",
    degraded: "Suy giảm",
    offline: "Ngoại tuyến",
    configured: "Đã cấu hình",
    incomplete: "Chưa đầy đủ",
    latency: "Độ trễ",
    casesIndexed: "Hồ sơ chỉ mục",
    clinicalMetrics: "Chỉ số Lâm sàng & Kho Tài liệu",
    patientProfiles: "Hồ sơ Bệnh nhân",
    submissionsTotal: "Tổng phiếu e-CRF",
    approved: "Đã duyệt",
    pendingReview: "Chờ bác sĩ duyệt",
    unopened: "Chưa mở (Mới)",
    documentsTotal: "Tài liệu lưu trữ",
    vaultSize: "Dung lượng lưu trữ",
    pipelineBreakdown: "Phân bổ Trạng thái Hàng đợi OCR",
    securityPosture: "Trạng thái Bảo mật & Kiểm soát",
    activeSessions: "Phiên đang hoạt động",
    rateLimitLockouts: "Khóa Rate-Limit hiện tại",
    alerts24h: "Cảnh báo bảo mật (24h)",
    failures24h: "Đăng nhập thất bại (24h)",
    demoMode: "Chế độ Demo Autofill",
    inviteGate: "Mã mời Bác sĩ",
    pipelineEngine: "Engine trích xuất OCR",
    cookieSecure: "Chính sách Cookie Secure",
    enabled: "Đang bật",
    disabled: "Đã tắt",
    runtimeHeading: "Tài nguyên Node.js & Nhật ký",
    uptime: "Thời gian chạy",
    memoryRss: "Bộ nhớ RSS",
    memoryHeap: "Heap Đã dùng / Tổng",
    auditTotal: "Bản ghi Nhật ký",
  },
  pipeline: {
    title: "Hàng đợi Xử lý OCR Pipeline",
    subtitle: "Theo dõi tiến độ xử lý tài liệu OCR, kiểm tra lỗi và chạy lại hoặc đặt lại các tác vụ bị kẹt.",
    syncBtn: "Đồng bộ trạng thái",
    backendOnline: "Backend Trực tuyến",
    backendOffline: "Backend Ngoại tuyến",
    totalJobs: "Tổng tác vụ",
    activeJobs: "Đang chạy",
    pendingJobs: "Chờ / Giữ",
    completedJobs: "Hoàn tất",
    failedJobs: "Lỗi",
    searchPlaceholder: "Tìm theo mã bệnh nhân, mã hồ sơ, intake ID, tệp hoặc lỗi...",
    statusAll: "Tất cả trạng thái OCR",
    thStudy: "Hồ sơ / Mã nghiên cứu",
    thPipelineStatus: "Trạng thái Pipeline",
    thDocuments: "Tệp đính kèm",
    thUpdated: "Cập nhật",
    thControls: "Điều khiển",
    inspect: "Chi tiết",
    hideDetails: "Thu gọn",
    retry: "Chạy lại",
    resetPending: "Đặt lại",
    markFailed: "Đánh dấu lỗi",
    reasonPrompt: "Lý do đánh dấu lỗi tác vụ",
    confirmMarkFailed: "Xác nhận đánh dấu lỗi",
    cancel: "Hủy",
    intakeIdLabel: "Mã Intake Backend",
    backendStatusLabel: "Trạng thái Backend thực tế",
    errorLabel: "Thông báo lỗi chẩn đoán",
    noError: "Không có lỗi nào được ghi nhận.",
    docsHeading: "Danh sách tài liệu đính kèm",
    localImagesLabel: (count: number) => `${count} ảnh lưu nội bộ`,
    empty: "Không có tác vụ OCR nào khớp bộ lọc.",
  },
  audit: {
    title: "Tra cứu Nhật ký Bảo mật (Audit Logs)",
    subtitle: "Nhật ký bất biến ghi lại xác thực, phân quyền, chỉnh sửa hồ sơ lâm sàng và thao tác quản trị.",
    exportCsv: "Xuất CSV",
    totalEvents: "Tổng sự kiện",
    securityAlerts: "Cảnh báo bảo mật",
    authEvents: "Xác thực",
    submissionEvents: "Hồ sơ bệnh án",
    adminEvents: "Quản trị",
    searchPlaceholder: "Tìm theo hành động, tác nhân, ID mục tiêu, IP hoặc metadata...",
    categoryAll: "Tất cả nhóm",
    categoryAlerts: "Cảnh báo bảo mật",
    categoryAuth: "Xác thực",
    categorySubmission: "Hồ sơ",
    categoryAdmin: "Quản trị",
    roleAll: "Mọi vai trò",
    roleSystem: "Hệ thống / Ẩn danh",
    dateFrom: "Từ ngày",
    dateTo: "Đến ngày",
    thTime: "Thời gian",
    thAction: "Hành động",
    thActor: "Tác nhân",
    thTarget: "Đối tượng",
    thIp: "Địa chỉ IP",
    thDetails: "Chi tiết",
    alertBadge: "CẢNH BÁO",
    inspect: "Xem JSON",
    hide: "Ẩn",
    userAgentLabel: "User-Agent",
    metadataLabel: "Metadata JSON (Không chứa PII)",
    empty: "Không tìm thấy bản ghi nhật ký phù hợp.",
  },
  roles: {
    patient: "Bệnh nhân",
    specialist: "Bác sĩ",
    admin: "Quản trị viên",
  },
  pipelineStatuses: {
    none: "Chờ gửi OCR",
    privacy_check: "Kiểm tra ẩn danh",
    privacy_review: "Giữ duyệt ẩn danh",
    processing: "Đang xử lý OCR",
    completed: "Hoàn tất",
    failed: "Thất bại",
  },
  pagination: {
    prev: "Trước",
    next: "Sau",
    pageOf: (page, totalPages, totalItems) =>
      `Trang ${page} / ${totalPages} (${totalItems} mục)`,
  },
};

export function getAdminCopy(language: Language): AdminCopy {
  return language === "vi" ? VI_COPY : EN_COPY;
}

export function formatAdminBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${idx === 0 ? value : value.toFixed(1)} ${units[idx]}`;
}

export function formatAdminDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
