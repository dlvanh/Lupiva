import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  CrfAntibodyBlotRow,
  CrfCheckItem,
  CrfInfectionEpisode,
  CrfOcrField,
  CrfTreatmentRow,
  EularAcrCriterionItem,
  Sledai2kCriterionItem,
  YesNoUnknown,
} from "@/data/crfData";
import type { UserRole } from "@/data/mockData";

export interface CrfMedicalHistoryPayload {
  physician: string;
  nurse: string;
  malignantDisease: YesNoUnknown;
  malignantSpecify: string;
  otherComorbidities: YesNoUnknown;
  otherComorbiditiesSpecify: string;
  familyAutoimmuneHistory: YesNoUnknown;
  familyRelatives: {
    Father: boolean;
    Mother: boolean;
    Brother: boolean;
    Sister: boolean;
    Child: boolean;
    Others: boolean;
  };
  familyDiseaseSpecify: string;
  fever: YesNoUnknown;
  feverTempC: string;
  feverOnsetDate: string;
  feverType: "periodic" | "prolonged" | "others" | "";
  feverTypeSpecify: string;
  historyOfInfection: YesNoUnknown;
  infectionEpisodes: CrfInfectionEpisode[];
  treatmentStatus: YesNoUnknown;
  treatments: CrfTreatmentRow[];
}

export interface CrfOrgansDamagePayload {
  skinMucosaAbnormality: YesNoUnknown;
  skinMucosaItems: CrfCheckItem[];
  muscleDamage: YesNoUnknown;
  muscleBiopsyOther: YesNoUnknown;
  muscleBiopsySpecify: string;
  jointsDamage: YesNoUnknown;
  swollenJointsCount: string;
  tenderJointsCount: string;
  vasScore: string;
  abnormalXray: YesNoUnknown;
  abnormalXraySpecify: string;
  abnormalUltrasound: YesNoUnknown;
  abnormalUltrasoundSpecify: string;
  jointDeformity: YesNoUnknown;
  jointDeformitySpecify: string;
  jointsOther: YesNoUnknown;
  jointsOtherSpecify: string;
  kidneysDamage: YesNoUnknown;
  renalBiopsyPerformed: YesNoUnknown;
  renalBiopsyNote: string;
  renalBiopsyClasses: string[];
  kidneysOther: YesNoUnknown;
  kidneysOtherSpecify: string;
  haematologicalDisorders: YesNoUnknown;
  haematologicalSpecify: string;
  cardiovascularAbnormality: YesNoUnknown;
  cardiovascularItems: CrfCheckItem[];
  lungDamage: YesNoUnknown;
  lungIld: boolean;
  lungIldPatterns: string[];
  lungPleuritis: boolean;
  lungPleuritisSpecify: string;
  lungOther: boolean;
  lungOtherSpecify: string;
  neuropsychiatricDisorders: YesNoUnknown;
  neuropsychiatricItems: CrfCheckItem[];
  giDisorders: YesNoUnknown;
  giItems: CrfCheckItem[];
}

export interface EularAcrJsonPayload {
  anaEntryCriterionMet: boolean;
  criteria: EularAcrCriterionItem[];
}

// -----------------------------------------------------------------------------
// 1. Users & Authentication (Zone B PII Encrypted Columns + Blind Index)
// -----------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    emailEncrypted: text("email_encrypted").notNull(),
    emailBlindIndex: text("email_blind_index").notNull().unique(),
    fullNameEncrypted: text("full_name_encrypted").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    title: text("title").notNull(),
    departmentOrRegistryId: text("department_or_registry_id").notNull(),
    badgeText: text("badge_text").notNull(),
    consentSigned: boolean("consent_signed").notNull().default(false),
    consentSignedAt: timestamp("consent_signed_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("users_role_idx").on(table.role)]
);

// -----------------------------------------------------------------------------
// 2. Opaque Database-Backed Sessions (Stores SHA-256 Token Hash Only)
// -----------------------------------------------------------------------------
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

// -----------------------------------------------------------------------------
// 3. Persistent Brute-Force Rate Limiting
// -----------------------------------------------------------------------------
export const authRateLimits = pgTable("auth_rate_limits", {
  key: text("key").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

// -----------------------------------------------------------------------------
// 4. Immutable Clinical & Security Audit Trail (No Plaintext PII in Metadata)
// -----------------------------------------------------------------------------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadataJson: jsonb("metadata_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("audit_logs_action_created_idx").on(table.action, table.createdAt),
  ]
);

// -----------------------------------------------------------------------------
// 5. Patient Cohort Profiles (Encrypted Study ID / Name / ICF Date + Non-PII Metrics)
// -----------------------------------------------------------------------------
export const patientProfiles = pgTable(
  "patient_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    studyIdEncrypted: text("study_id_encrypted").notNull(),
    studyIdBlindIndex: text("study_id_blind_index").notNull().unique(),
    patientNameEncrypted: text("patient_name_encrypted").notNull(),
    icfSignedDateEncrypted: text("icf_signed_date_encrypted").notNull(),
    age: integer("age"),
    gender: text("gender").$type<"Female" | "Male" | "">(),
    heightCm: real("height_cm"),
    weightKg: real("weight_kg"),
    bmi: real("bmi"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("patient_profiles_user_idx").on(table.userId)]
);

// -----------------------------------------------------------------------------
// 6. Hybrid SQL + JSONB SLE e-CRF Submissions (Zone B HIV Vault + Zone C JSONB)
// -----------------------------------------------------------------------------
/**
 * none: not sent (no images yet, or documents the backend cannot read)
 * privacy_check: local crop/redaction proposals running
 * privacy_review: an image needs a specialist to review what is sent
 * processing: intake created and OCR/extraction running in the backend
 * completed: extraction finished; values await specialist review
 * failed: backend error; a specialist must look
 */
export type PipelineStatus =
  | "none"
  | "privacy_check"
  | "privacy_review"
  | "processing"
  | "completed"
  | "failed";

export const crfSubmissions = pgTable(
  "crf_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    legacyRecordKey: text("legacy_record_key").unique(),
    patientProfileId: uuid("patient_profile_id")
      .notNull()
      .references(() => patientProfiles.id, { onDelete: "cascade" }),
    assignedSpecialistId: uuid("assigned_specialist_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    status: text("status")
      .$type<"pending_doctor_review" | "approved">()
      .notNull()
      .default("pending_doctor_review"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    signedOffByUserId: uuid("signed_off_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    signedOffByName: text("signed_off_by_name"),
    signedOffRole: text("signed_off_role"),
    signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
    eularTotalScore: integer("eular_total_score").notNull().default(0),
    eularClassifiedSle: boolean("eular_classified_sle").notNull().default(false),
    sledaiTotalScore: integer("sledai_total_score").notNull().default(0),
    sledaiActivityTier: text("sledai_activity_tier")
      .notNull()
      .default("No Activity (0 pts)"),
    /** Zone B encrypted HIV Ag/Ab status — stripped from plain ocrFieldsJson at rest */
    hivStatusEncrypted: text("hiv_status_encrypted"),
    medicalHistoryJson: jsonb("medical_history_json")
      .$type<CrfMedicalHistoryPayload>()
      .notNull(),
    organsDamageJson: jsonb("organs_damage_json")
      .$type<CrfOrgansDamagePayload>()
      .notNull(),
    ocrFieldsJson: jsonb("ocr_fields_json").$type<CrfOcrField[]>().notNull(),
    antibodyBlotsJson: jsonb("antibody_blots_json")
      .$type<CrfAntibodyBlotRow[]>()
      .notNull(),
    eularAcrJson: jsonb("eular_acr_json")
      .$type<EularAcrJsonPayload>()
      .notNull(),
    sledai2kJson: jsonb("sledai_2k_json")
      .$type<Sledai2kCriterionItem[]>()
      .notNull(),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    /** Python OCR/CRF backend intake for this submission (see lib/intakeOrchestrator). */
    pipelineIntakeId: text("pipeline_intake_id"),
    pipelineStatus: text("pipeline_status")
      .$type<PipelineStatus>()
      .notNull()
      .default("none"),
    /** Specialist-only diagnostic; never returned to patient accounts. */
    pipelineError: text("pipeline_error"),
  },
  (table) => [
    index("crf_submissions_pipeline_status_idx").on(table.pipelineStatus),
    index("crf_submissions_ocr_fields_gin_idx").using("gin", table.ocrFieldsJson),
    index("crf_submissions_status_idx").on(table.status),
    index("crf_submissions_patient_idx").on(table.patientProfileId),
  ]
);

// -----------------------------------------------------------------------------
// 7. Envelope-Encrypted Document Vault Metadata (Phase 2 S3/MinIO)
// -----------------------------------------------------------------------------
export const uploadedDocuments = pgTable(
  "uploaded_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => crfSubmissions.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    isImage: boolean("is_image").notNull().default(false),
    storageProvider: text("storage_provider")
      .$type<"minio" | "s3" | "sample" | "local">()
      .notNull()
      .default("sample"),
    storageKey: text("storage_key").notNull(),
    wrappedDek: text("wrapped_dek"),
    fileIv: text("file_iv"),
    fileAuthTag: text("file_auth_tag"),
    sha256: text("sha256"),
    ocrJobStatus: text("ocr_job_status")
      .$type<"pending" | "completed" | "failed">()
      .notNull()
      .default("completed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("uploaded_documents_submission_idx").on(table.submissionId)]
);
