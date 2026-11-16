import { describe, expect, it } from "vitest";
import { INITIAL_CRF_PATIENTS } from "@/data/crfData";
import {
  attachDecryptedHivField,
  scrubCheckItems,
  scrubFreeText,
  scrubInfectionEpisodes,
  scrubTreatments,
  stripSensitiveOcrFields,
} from "@/lib/piiScrubber";

describe("Lupiva CRF 3-Zone PII Scrubber & HIV Segregation", () => {
  it("redacts emails, Vietnam CCCD/CMND/BHYT/Passport numbers, phones, and explicit patient tokens", () => {
    const raw =
      "Contact Tran Thi Mai (VN-0084-26) via mai.tran@gmail.com or +84 912-345-678; CCCD: 001097012345, BHYT: DN4012345678901, old CMND 123456789, landline 02439743556.";

    const scrubbed = scrubFreeText(raw, {
      redactTokens: ["Tran Thi Mai", "VN-0084-26"],
    });

    expect(scrubbed).not.toContain("Tran Thi Mai");
    expect(scrubbed).not.toContain("VN-0084-26");
    expect(scrubbed).not.toContain("mai.tran@gmail.com");
    expect(scrubbed).not.toContain("0912-345-678");
    expect(scrubbed).not.toContain("001097012345");
    expect(scrubbed).not.toContain("DN4012345678901");
    expect(scrubbed).not.toContain("123456789");
    expect(scrubbed).not.toContain("02439743556");

    expect(scrubbed).toContain("[REDACTED_PII]");
    expect(scrubbed).toContain("[REDACTED_EMAIL]");
    expect(scrubbed).toContain("[REDACTED_ID]");
    expect(scrubbed).toContain("[REDACTED_PHONE]");
  });

  it("preserves clinical dates, decimal biomarker readings, and medication dosages", () => {
    const clinicalNarrative =
      "Sampled 15/10/2026: Anti-dsDNA 142.5 IU/mL, C3 0.58 g/L, C4 0.09 g/L, Temp 38.9 °C, SLEDAI-2K = 14 pts; Methylprednisolone 16 mg/day + HCQ 200 mg/day for 24 months.";

    const scrubbed = scrubFreeText(clinicalNarrative, {
      redactTokens: ["Tran Thi Mai"],
    });

    expect(scrubbed).toBe(clinicalNarrative);
  });

  it("strips HIV Ag/Ab from Zone C ocrFieldsJson and restores it cleanly after Zone B decryption", () => {
    const patient = INITIAL_CRF_PATIENTS[0];
    const hasHivInitially = patient.ocrFields.some(
      (f) => f.code === "HIV-AGAB" || f.id === "crf-hiv"
    );
    expect(hasHivInitially).toBe(true);

    const { safeOcrFields, hivField } = stripSensitiveOcrFields(
      patient.ocrFields,
      { redactTokens: [patient.patientName, patient.studyId] }
    );

    expect(hivField).not.toBeNull();
    expect(hivField?.code).toBe("HIV-AGAB");
    expect(
      safeOcrFields.some((f) => f.code === "HIV-AGAB" || f.id === "crf-hiv")
    ).toBe(false);

    const restored = attachDecryptedHivField(safeOcrFields, hivField);
    expect(restored.length).toBe(patient.ocrFields.length);
    const hcvIndex = restored.findIndex((f) => f.code === "HCV-AGAB");
    const hivIndex = restored.findIndex((f) => f.code === "HIV-AGAB");
    expect(hivIndex).toBe(hcvIndex + 1);
  });

  it("scrubs nested free-text fields across check items, infection episodes, and treatments", () => {
    const items = scrubCheckItems(
      [
        {
          id: "m1",
          labelEn: "Malar rash",
          labelVi: "Ban cánh bướm",
          checked: true,
          specify: "Called 0987654321 at clinic",
        },
      ],
      { redactTokens: ["Tran Thi Mai"] }
    );
    expect(items[0].specify).not.toContain("0987654321");
    expect(items[0].specify).toContain("[REDACTED_PHONE]");

    const episodes = scrubInfectionEpisodes([
      {
        id: "ep1",
        factor: "Herpes zoster (patient email leak@example.org)",
        dateOfOnset: "01/09/2026",
        dateOfNormalization: "15/09/2026",
      },
    ]);
    expect(episodes[0].factor).not.toContain("leak@example.org");
    expect(episodes[0].factor).toContain("[REDACTED_EMAIL]");
    expect(episodes[0].dateOfOnset).toBe("01/09/2026");

    const treatments = scrubTreatments([
      {
        id: "tr1",
        group: "Medication",
        name: "Hydroxychloroquine (rx by dr@vinmec.com)",
        route: "Oral",
        dose: "200 mg",
        frequency: "Daily",
        duration: "18 months, phone +84 912345678",
      },
    ]);
    expect(treatments[0].name).toContain("[REDACTED_EMAIL]");
    expect(treatments[0].duration).toContain("[REDACTED_PHONE]");
    expect(treatments[0].dose).toBe("200 mg");
  });
});
