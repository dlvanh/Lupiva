export type UserRole = "specialist" | "patient";

export interface AuthUser {
  id: string;
  name: string;
  role: UserRole;
  title: string;
  email: string;
  departmentOrRegistryId: string;
  badgeText: string;
  consentSigned: boolean;
  consentSignedAt?: string | null;
}

export interface DemoUser extends AuthUser {
  passwordHint: string;
}

export type ClinicalFlag = "Normal" | "High" | "Low" | "Positive";

export const DEMO_USERS: Record<UserRole, DemoUser> = {
  specialist: {
    id: "usr-spec-01",
    name: "Dr. Nguyen Minh, MD, PhD",
    role: "specialist",
    title: "Senior Consultant — Clinical Immunology & Allergy",
    email: "dr.minh.immunology@vinmec.com",
    passwordHint: "VinmecSLE#2026",
    departmentOrRegistryId: "Vinmec Times City • Dept. of Clinical Immunology",
    badgeText: "",
    consentSigned: true,
  },
  patient: {
    id: "usr-pat-84",
    name: "Tran Thi Mai",
    role: "patient",
    title: "SLE Cohort Participant • Registry #VN-SLE-084",
    email: "mai.tran.patient@lupiva.vn",
    passwordHint: "PatientCare#2026",
    departmentOrRegistryId: "SLE Registry Cohort • Enrolled Oct 2026",
    badgeText: "",
    consentSigned: true,
  },
};
