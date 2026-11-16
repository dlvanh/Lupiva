import type {
  CrfOcrField,
  SleCrfPatientRecord,
  UploadedDocFile,
} from "@/data/crfData";
import type {
  CrfMedicalHistoryPayload,
  CrfOrgansDamagePayload,
} from "@/db/schema";
import { decryptField, encryptField } from "@/lib/crypto";
import {
  attachDecryptedHivField,
  scrubCheckItems,
  scrubFreeText,
  scrubInfectionEpisodes,
  scrubTreatments,
  stripSensitiveOcrFields,
} from "@/lib/piiScrubber";
import { formatTimestampInOffset } from "@/lib/submissionFilters";

export function buildScrubbedMedicalHistory(
  pat: SleCrfPatientRecord,
  redactTokens: string[]
): CrfMedicalHistoryPayload {
  const opts = { redactTokens };
  return {
    physician: scrubFreeText(pat.physician, opts),
    nurse: scrubFreeText(pat.nurse, opts),
    malignantDisease: pat.malignantDisease,
    malignantSpecify: scrubFreeText(pat.malignantSpecify, opts),
    otherComorbidities: pat.otherComorbidities,
    otherComorbiditiesSpecify: scrubFreeText(pat.otherComorbiditiesSpecify, opts),
    familyAutoimmuneHistory: pat.familyAutoimmuneHistory,
    familyRelatives: pat.familyRelatives,
    familyDiseaseSpecify: scrubFreeText(pat.familyDiseaseSpecify, opts),
    fever: pat.fever,
    feverTempC: pat.feverTempC,
    feverOnsetDate: pat.feverOnsetDate,
    feverType: pat.feverType,
    feverTypeSpecify: scrubFreeText(pat.feverTypeSpecify, opts),
    historyOfInfection: pat.historyOfInfection,
    infectionEpisodes: scrubInfectionEpisodes(pat.infectionEpisodes, opts),
    treatmentStatus: pat.treatmentStatus,
    treatments: scrubTreatments(pat.treatments, opts),
  };
}

export function buildScrubbedOrgansDamage(
  pat: SleCrfPatientRecord,
  redactTokens: string[]
): CrfOrgansDamagePayload {
  const opts = { redactTokens };
  return {
    skinMucosaAbnormality: pat.skinMucosaAbnormality,
    skinMucosaItems: scrubCheckItems(pat.skinMucosaItems, opts),
    muscleDamage: pat.muscleDamage,
    muscleBiopsyOther: pat.muscleBiopsyOther,
    muscleBiopsySpecify: scrubFreeText(pat.muscleBiopsySpecify, opts),
    jointsDamage: pat.jointsDamage,
    swollenJointsCount: pat.swollenJointsCount,
    tenderJointsCount: pat.tenderJointsCount,
    vasScore: pat.vasScore,
    abnormalXray: pat.abnormalXray,
    abnormalXraySpecify: scrubFreeText(pat.abnormalXraySpecify, opts),
    abnormalUltrasound: pat.abnormalUltrasound,
    abnormalUltrasoundSpecify: scrubFreeText(pat.abnormalUltrasoundSpecify, opts),
    jointDeformity: pat.jointDeformity,
    jointDeformitySpecify: scrubFreeText(pat.jointDeformitySpecify, opts),
    jointsOther: pat.jointsOther,
    jointsOtherSpecify: scrubFreeText(pat.jointsOtherSpecify, opts),
    kidneysDamage: pat.kidneysDamage,
    renalBiopsyPerformed: pat.renalBiopsyPerformed,
    renalBiopsyNote: scrubFreeText(pat.renalBiopsyNote, opts),
    renalBiopsyClasses: pat.renalBiopsyClasses,
    kidneysOther: pat.kidneysOther,
    kidneysOtherSpecify: scrubFreeText(pat.kidneysOtherSpecify, opts),
    haematologicalDisorders: pat.haematologicalDisorders,
    haematologicalSpecify: scrubFreeText(pat.haematologicalSpecify, opts),
    cardiovascularAbnormality: pat.cardiovascularAbnormality,
    cardiovascularItems: scrubCheckItems(pat.cardiovascularItems, opts),
    lungDamage: pat.lungDamage,
    lungIld: pat.lungIld,
    lungIldPatterns: pat.lungIldPatterns,
    lungPleuritis: pat.lungPleuritis,
    lungPleuritisSpecify: scrubFreeText(pat.lungPleuritisSpecify, opts),
    lungOther: pat.lungOther,
    lungOtherSpecify: scrubFreeText(pat.lungOtherSpecify, opts),
    neuropsychiatricDisorders: pat.neuropsychiatricDisorders,
    neuropsychiatricItems: scrubCheckItems(pat.neuropsychiatricItems, opts),
    giDisorders: pat.giDisorders,
    giItems: scrubCheckItems(pat.giItems, opts),
  };
}

export function encryptSensitiveOcrFields(
  fields: CrfOcrField[],
  submissionId: string,
  redactTokens: string[]
): { safeOcrFields: CrfOcrField[]; hivStatusEncrypted: string | null } {
  const { safeOcrFields, hivField } = stripSensitiveOcrFields(fields, {
    redactTokens,
  });
  const hivStatusEncrypted = hivField
    ? encryptField(
        JSON.stringify(hivField),
        `crf_submissions:${submissionId}:hiv_status`
      )
    : null;
  return { safeOcrFields, hivStatusEncrypted };
}

export function decryptSubmissionHivFields(
  safeOcrFields: CrfOcrField[],
  hivStatusEncrypted: string | null,
  submissionId: string
): CrfOcrField[] {
  if (!hivStatusEncrypted) return safeOcrFields;
  const decrypted = JSON.parse(
    decryptField(hivStatusEncrypted, `crf_submissions:${submissionId}:hiv_status`)
  ) as CrfOcrField;
  return attachDecryptedHivField(safeOcrFields, decrypted);
}

export interface JoinedSubmissionRow {
  submissionId: string;
  legacyRecordKey: string | null;
  status: "pending_doctor_review" | "approved";
  submittedAt: Date;
  signedOffByName: string | null;
  signedOffRole: string | null;
  hivStatusEncrypted: string | null;
  medicalHistoryJson: CrfMedicalHistoryPayload;
  organsDamageJson: CrfOrgansDamagePayload;
  ocrFieldsJson: CrfOcrField[];
  antibodyBlotsJson: SleCrfPatientRecord["antibodyBlots"];
  eularAcrJson: {
    anaEntryCriterionMet: boolean;
    criteria: SleCrfPatientRecord["eularAcrCriteria"];
  };
  sledai2kJson: SleCrfPatientRecord["sledai2kCriteria"];
  lastUpdatedAt: Date;
  profileId: string;
  studyIdEncrypted: string;
  patientNameEncrypted: string;
  icfSignedDateEncrypted: string;
  age: number | null;
  gender: "Female" | "Male" | "" | null;
  heightCm: number | null;
  weightKg: number | null;
}

export function rehydrateSleCrfRecord(
  row: JoinedSubmissionRow,
  docs: UploadedDocFile[],
  utcOffsetMinutes: number
): SleCrfPatientRecord {
  const studyId = decryptField(
    row.studyIdEncrypted,
    `patient_profiles:${row.profileId}:study_id`
  );
  const patientName = decryptField(
    row.patientNameEncrypted,
    `patient_profiles:${row.profileId}:patient_name`
  );
  const icfSignedDate = decryptField(
    row.icfSignedDateEncrypted,
    `patient_profiles:${row.profileId}:icf_signed_date`
  );
  const ocrFields = decryptSubmissionHivFields(
    row.ocrFieldsJson,
    row.hivStatusEncrypted,
    row.submissionId
  );

  const med = row.medicalHistoryJson;
  const org = row.organsDamageJson;

  return {
    id: row.legacyRecordKey ?? row.submissionId,
    uploadedFiles: docs,
    submittedAt: formatTimestampInOffset(row.submittedAt, utcOffsetMinutes),
    submissionStatus: row.status,
    studyId,
    patientName,
    age: row.age != null ? String(row.age) : "",
    gender: row.gender ?? "",
    icfSignedDate,
    heightCm: row.heightCm != null ? String(row.heightCm) : "",
    weightKg: row.weightKg != null ? String(row.weightKg) : "",
    physician: med.physician,
    nurse: med.nurse,
    lastUpdated: `${formatTimestampInOffset(row.lastUpdatedAt, utcOffsetMinutes)} ICT`,
    signedOffBy: row.signedOffByName,
    signedOffRole: row.signedOffRole,

    malignantDisease: med.malignantDisease,
    malignantSpecify: med.malignantSpecify,
    otherComorbidities: med.otherComorbidities,
    otherComorbiditiesSpecify: med.otherComorbiditiesSpecify,
    familyAutoimmuneHistory: med.familyAutoimmuneHistory,
    familyRelatives: med.familyRelatives,
    familyDiseaseSpecify: med.familyDiseaseSpecify,
    fever: med.fever,
    feverTempC: med.feverTempC,
    feverOnsetDate: med.feverOnsetDate,
    feverType: med.feverType,
    feverTypeSpecify: med.feverTypeSpecify,
    historyOfInfection: med.historyOfInfection,
    infectionEpisodes: med.infectionEpisodes,
    treatmentStatus: med.treatmentStatus,
    treatments: med.treatments,

    skinMucosaAbnormality: org.skinMucosaAbnormality,
    skinMucosaItems: org.skinMucosaItems,
    muscleDamage: org.muscleDamage,
    muscleBiopsyOther: org.muscleBiopsyOther,
    muscleBiopsySpecify: org.muscleBiopsySpecify,
    jointsDamage: org.jointsDamage,
    swollenJointsCount: org.swollenJointsCount,
    tenderJointsCount: org.tenderJointsCount,
    vasScore: org.vasScore,
    abnormalXray: org.abnormalXray,
    abnormalXraySpecify: org.abnormalXraySpecify,
    abnormalUltrasound: org.abnormalUltrasound,
    abnormalUltrasoundSpecify: org.abnormalUltrasoundSpecify,
    jointDeformity: org.jointDeformity,
    jointDeformitySpecify: org.jointDeformitySpecify,
    jointsOther: org.jointsOther,
    jointsOtherSpecify: org.jointsOtherSpecify,
    kidneysDamage: org.kidneysDamage,
    renalBiopsyPerformed: org.renalBiopsyPerformed,
    renalBiopsyNote: org.renalBiopsyNote,
    renalBiopsyClasses: org.renalBiopsyClasses,
    kidneysOther: org.kidneysOther,
    kidneysOtherSpecify: org.kidneysOtherSpecify,
    haematologicalDisorders: org.haematologicalDisorders,
    haematologicalSpecify: org.haematologicalSpecify,
    cardiovascularAbnormality: org.cardiovascularAbnormality,
    cardiovascularItems: org.cardiovascularItems,
    lungDamage: org.lungDamage,
    lungIld: org.lungIld,
    lungIldPatterns: org.lungIldPatterns,
    lungPleuritis: org.lungPleuritis,
    lungPleuritisSpecify: org.lungPleuritisSpecify,
    lungOther: org.lungOther,
    lungOtherSpecify: org.lungOtherSpecify,
    neuropsychiatricDisorders: org.neuropsychiatricDisorders,
    neuropsychiatricItems: org.neuropsychiatricItems,
    giDisorders: org.giDisorders,
    giItems: org.giItems,

    ocrFields,
    antibodyBlots: row.antibodyBlotsJson,
    anaEntryCriterionMet: row.eularAcrJson.anaEntryCriterionMet,
    eularAcrCriteria: row.eularAcrJson.criteria,
    sledai2kCriteria: row.sledai2kJson,
  };
}
