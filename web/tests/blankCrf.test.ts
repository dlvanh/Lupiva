import { describe, expect, it } from "vitest";
import { buildBlankCrfRecord, INITIAL_CRF_PATIENTS } from "@/data/crfData";

describe("blank CRF records", () => {
  it("keeps the form schema while leaving every clinical value unknown or empty", () => {
    const record = buildBlankCrfRecord({ id: "new", studyId: "NEW-1", patientName: "New Patient" });
    const template = INITIAL_CRF_PATIENTS[0];
    expect(record.ocrFields).toHaveLength(template.ocrFields.length);
    expect(record.antibodyBlots).toHaveLength(template.antibodyBlots.length);
    for (const [index, field] of record.ocrFields.entries()) {
      expect(field).toMatchObject({
        id: template.ocrFields[index].id,
        code: template.ocrFields[index].code,
        unit: template.ocrFields[index].unit,
        referenceRange: template.ocrFields[index].referenceRange,
        value: "", secondaryValue: "", printedValue: "", printedSecondaryValue: "",
        flag: "", confidence: 0, status: "manual_required",
      });
      expect(field.clinicalNoteEn).toBeUndefined();
      expect(field.clinicalNoteVi).toBeUndefined();
    }
    for (const blot of record.antibodyBlots) {
      expect(blot).toMatchObject({
        result: "", intensity: "", printedResult: "", printedIntensity: "",
        confidence: 0, status: "manual_required",
      });
    }
    // Every YES/NO property in the sample schema must be unknown in a new record.
    for (const [key, value] of Object.entries(template)) {
      if (value === "YES" || value === "NO" || value === "Unknown") {
        expect(record[key as keyof typeof record], key).toBe("Unknown");
      }
    }
    expect(record).toMatchObject({
      patientName: "New Patient", age: "", gender: "", heightCm: "", weightKg: "",
      physician: "", nurse: "", icfSignedDate: "", feverType: "",
      swollenJointsCount: "", tenderJointsCount: "", vasScore: "",
      infectionEpisodes: [], treatments: [], renalBiopsyClasses: [], lungIldPatterns: [],
      anaEntryCriterionMet: false,
    });
    expect(record.eularAcrCriteria.every((item) => !item.checked)).toBe(true);
    expect(record.sledai2kCriteria.every((item) => !item.checked)).toBe(true);
    for (const items of [record.skinMucosaItems, record.cardiovascularItems, record.neuropsychiatricItems, record.giItems]) {
      expect(items.every((item) => !item.checked && item.specify === "")).toBe(true);
    }
  });

  it("requires a patient name and creates independent records", () => {
    expect(() => buildBlankCrfRecord({ id: "new", studyId: "", patientName: " " })).toThrow("Patient name is required");
    const first = buildBlankCrfRecord({ id: "1", studyId: "", patientName: " Patient ", physician: "Doctor" });
    const second = buildBlankCrfRecord({ id: "2", studyId: "", patientName: "Other Patient" });
    first.ocrFields[0].value = "edited";
    first.skinMucosaItems[0].checked = true;
    expect(first.patientName).toBe("Patient");
    expect(first.physician).toBe("Doctor");
    expect(second.ocrFields[0].value).toBe("");
    expect(second.skinMucosaItems[0].checked).toBe(false);
  });
});
