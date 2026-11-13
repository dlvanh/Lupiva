"use client";

import React from "react";
import {
  BlotResultStatus,
  CrfAntibodyBlotRow,
  CrfCheckItem,
  CrfOcrField,
  SleCrfPatientRecord,
  calculateEularAcrSummary,
  calculateSledai2kSummary,
} from "@/data/crfData";

interface Props {
  patient: SleCrfPatientRecord;
  isVi: boolean;
  bmi: string;
  selectedId: string;
  onSelect: (id: string) => void;
  onUpdateField: (id: string, updates: Partial<CrfOcrField>) => void;
  onVerifyField: (field: CrfOcrField) => void;
  onUpdateBlot: (id: string, updates: Partial<CrfAntibodyBlotRow>) => void;
}

const box = (on: boolean) => (
  <span
    aria-hidden="true"
    className={`mr-1 inline-flex h-3 w-3 items-center justify-center border border-black align-middle font-sans text-[8px] leading-none font-bold ${
      on ? "bg-slate-900 text-white" : "bg-white text-transparent"
    }`}
  >
    {on ? "X" : ""}
  </span>
);
const TD = "border border-black px-2 py-1 align-top";
const TH = "border border-black bg-slate-100 px-2 py-1 text-left font-bold";

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 border-b-2 border-black pb-0.5 text-[13px] font-bold uppercase">
      {children}
    </h2>
  );
}
function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-3 text-[12px] font-bold">{children}</h3>;
}

function YesNo({
  value,
  options = ["YES", "NO", "Unknown"],
}: {
  value: string;
  options?: string[];
}) {
  return (
    <span className="mr-3">
      {options.map((o) => (
        <span key={o} className="mr-2">
          {box(value === o)} {o}
        </span>
      ))}
    </span>
  );
}

function Checklist({ items }: { items: CrfCheckItem[] }) {
  return (
    <table className="w-full border-collapse border border-black">
      <tbody>
        {Array.from({ length: Math.ceil(items.length / 2) }, (_, r) => (
          <tr key={r}>
            {[items[r * 2], items[r * 2 + 1]].map((it, i) => (
              <td key={i} className={`${TD} w-1/2`}>
                {it && (
                  <>
                    {box(it.checked)} {it.labelEn}
                    {it.checked && it.specify ? `: ${it.specify}` : ""}
                  </>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DocxCrfView({
  patient: p,
  isVi,
  bmi,
  selectedId,
  onSelect,
  onUpdateField,
  onVerifyField,
  onUpdateBlot,
}: Props) {
  const eular = calculateEularAcrSummary(
    p.eularAcrCriteria,
    p.anaEntryCriterionMet
  );
  const sledai = calculateSledai2kSummary(p.sledai2kCriteria);

  const confCell = (
    conf: number,
    isManual: boolean,
    isVerify: boolean,
    onVerify: () => void,
    onFill?: () => void
  ) => (
    <td className={`${TD} whitespace-nowrap font-sans`}>
      {isManual ? (
        <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-900">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          <span>&lt;80% ({conf}%)</span>
        </span>
      ) : isVerify ? (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span>{conf}%</span>
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-900">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal-600" />
          <span>{conf}%</span>
        </span>
      )}
      {isManual && onFill && (
        <button
          type="button"
          onClick={onFill}
          className="ml-1.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer"
        >
          {isVi ? "Nhập từ bản gốc" : "Fill from scan"}
        </button>
      )}
      {isVerify && (
        <button
          type="button"
          onClick={onVerify}
          className="ml-1.5 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold text-white cursor-pointer"
        >
          {isVi ? "Xác nhận" : "Verify"}
        </button>
      )}
    </td>
  );

  const ocrTable = (fields: CrfOcrField[], withPct = false) => (
    <table className="w-full border-collapse border border-black">
      <thead>
        <tr>
          <th scope="col" className={TH}>Test</th>
          <th scope="col" className={TH}>Result</th>
          <th scope="col" className={TH}>Unit</th>
          <th scope="col" className={TH}>Reference</th>
          <th scope="col" className={TH}>AI confidence</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const isManual = f.status === "manual_required" || !f.value.trim();
          const isVerify = f.status === "needs_verify" && !!f.value.trim();
          return (
            <tr
              key={f.id}
              onClick={() => onSelect(f.id)}
              className={
                selectedId === f.id
                  ? "bg-teal-50"
                  : isManual
                  ? "bg-rose-50/60"
                  : isVerify
                  ? "bg-amber-50/60"
                  : ""
              }
            >
              <td className={TD}>{f.labelEn}</td>
              <td className={TD}>
                <input
                  id={`crf-input-${f.id}`}
                  aria-label={`Result for ${f.labelEn}`}
                  value={f.value}
                  placeholder={isManual ? "Check scan…" : ""}
                  onFocus={() => onSelect(f.id)}
                  onChange={(e) =>
                    onUpdateField(f.id, { value: e.target.value })
                  }
                  className="w-36 border-b border-slate-400 bg-transparent font-bold focus:outline-none focus:border-teal-700"
                />
                {withPct && (
                  <input
                    aria-label={`% predicted for ${f.labelEn}`}
                    value={f.secondaryValue || ""}
                    placeholder="% pred"
                    onChange={(e) =>
                      onUpdateField(f.id, { secondaryValue: e.target.value })
                    }
                    className="ml-2 w-16 border-b border-slate-400 bg-transparent focus:outline-none"
                  />
                )}
              </td>
              <td className={TD}>{f.unit}</td>
              <td className={TD}>{f.referenceRange}</td>
              {confCell(
                f.confidence,
                isManual,
                isVerify,
                () => onVerifyField(f),
                () =>
                  onUpdateField(f.id, {
                    value: f.printedValue,
                    secondaryValue: f.printedSecondaryValue,
                    status: "user_verified",
                  })
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const sub = (name: string) =>
    p.ocrFields.filter((f) => f.subSectionEn === name);

  const blotTable = (panel: "ana23" | "myositis16") => (
    <table className="w-full border-collapse border border-black">
      <thead>
        <tr>
          <th scope="col" className={TH}>Antibody</th>
          <th scope="col" className={TH}>Negative</th>
          <th scope="col" className={TH}>Positive</th>
          <th scope="col" className={TH}>Borderline</th>
          <th scope="col" className={TH}>Intensity</th>
          <th scope="col" className={TH}>AI confidence</th>
        </tr>
      </thead>
      <tbody>
        {p.antibodyBlots
          .filter((b) => b.panel === panel)
          .map((b) => {
            const isManual = b.status === "manual_required" || !b.result;
            const isVerify = b.status === "needs_verify" && !!b.result;
            return (
              <tr
                key={b.id}
                className={
                  isManual ? "bg-rose-50/60" : isVerify ? "bg-amber-50/60" : ""
                }
              >
                <td className={TD}>{b.name}</td>
                {(["Negative", "Positive", "Borderline"] as const).map((o) => (
                  <td key={o} className={`${TD} text-center`}>
                    <button
                      type="button"
                      aria-label={`${b.name} ${o}`}
                      onClick={() =>
                        onUpdateBlot(b.id, {
                          result: o as BlotResultStatus,
                          intensity: b.intensity || b.printedIntensity,
                        })
                      }
                      className="cursor-pointer text-[14px]"
                    >
                      {box(b.result === o)}
                    </button>
                  </td>
                ))}
                <td className={TD}>
                  <input
                    aria-label={`Intensity for ${b.name}`}
                    value={b.intensity}
                    onChange={(e) =>
                      onUpdateBlot(b.id, { intensity: e.target.value })
                    }
                    className="w-20 border-b border-slate-400 bg-transparent focus:outline-none"
                  />
                </td>
                {confCell(
                  b.confidence,
                  isManual,
                  isVerify,
                  () => onUpdateBlot(b.id, { status: "user_verified" }),
                  () =>
                    onUpdateBlot(b.id, {
                      result: b.printedResult,
                      intensity: b.printedIntensity,
                      status: "user_verified",
                    })
                )}
              </tr>
            );
          })}
      </tbody>
    </table>
  );

  const [clinical, immuno] = [
    p.eularAcrCriteria.filter((c) => c.domainCategory === "clinical"),
    p.eularAcrCriteria.filter((c) => c.domainCategory === "immunological"),
  ];

  return (
    <article className="border border-slate-400 bg-white p-8 font-serif text-[12px] leading-snug text-black shadow-md">
      <h1 className="text-center text-[16px] font-bold">CASE REPORT FORM</h1>
      <table className="mt-2 w-full border-collapse border border-black">
        <tbody>
          <tr>
            <td className={TD}>
              Study ID: <b>{p.studyId}</b> &nbsp; Age: <b>{p.age}</b> &nbsp;
              Gender: {box(p.gender === "Female")} Female{" "}
              {box(p.gender === "Male")} Male
            </td>
            <td className={TD}>
              ICF signed date: <b>{p.icfSignedDate}</b>
            </td>
          </tr>
          <tr>
            <td className={TD}>
              Height: <b>{p.heightCm}</b> cm &nbsp; Weight: <b>{p.weightKg}</b>{" "}
              kg &nbsp; BMI: <b>{bmi}</b>
            </td>
            <td className={TD}>
              Physician: <b>{p.physician}</b> &nbsp; Nurse: <b>{p.nurse}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <H>Medical history</H>
      {p.gender === "Female" && (
        <>
          <Sub>Pregnancy — if female</Sub>
          {ocrTable(p.ocrFields.filter((f) => f.code === "BETA-HCG"))}
        </>
      )}
      <Sub>Malignant disease</Sub>
      <YesNo value={p.malignantDisease} options={["NO", "YES"]} />
      {p.malignantDisease === "YES" && <>Specify: {p.malignantSpecify}</>}
      <Sub>Other comorbidities</Sub>
      <YesNo value={p.otherComorbidities} options={["NO", "YES"]} />
      {p.otherComorbidities === "YES" && <>Specify: {p.otherComorbiditiesSpecify}</>}
      <Sub>Family autoimmune disease history</Sub>
      <YesNo value={p.familyAutoimmuneHistory} options={["NO", "YES"]} />
      {p.familyAutoimmuneHistory === "YES" && (
        <table className="mt-1 w-full border-collapse border border-black">
          <tbody>
            {(Object.keys(p.familyRelatives) as (keyof typeof p.familyRelatives)[]).map(
              (k) => (
                <tr key={k}>
                  <td className={`${TD} w-1/4`}>
                    {box(p.familyRelatives[k])} {k}
                  </td>
                  <td className={TD}>
                    {k === "Others" ? p.familyDiseaseSpecify : ""}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
      <Sub>Fever</Sub>
      <YesNo value={p.fever} options={["YES", "NO"]} />
      {p.fever === "YES" && (
        <>
          Temperature {p.feverTempC} °C (highest) • Onset {p.feverOnsetDate} • Type:{" "}
          {p.feverType}
        </>
      )}
      <Sub>History of infection</Sub>
      <YesNo value={p.historyOfInfection} />
      {p.historyOfInfection === "YES" && (
        <table className="mt-1 w-full border-collapse border border-black">
          <thead>
            <tr>
              <th scope="col" className={TH}>Factor</th>
              <th scope="col" className={TH}>Date of onset</th>
              <th scope="col" className={TH}>Date of normalization</th>
            </tr>
          </thead>
          <tbody>
            {p.infectionEpisodes.map((e) => (
              <tr key={e.id}>
                <td className={TD}>{e.factor}</td>
                <td className={TD}>{e.dateOfOnset}</td>
                <td className={TD}>{e.dateOfNormalization}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Sub>Infectious diseases screening</Sub>
      {ocrTable(
        p.ocrFields.filter(
          (f) => f.sectionId === "medical_history" && f.code !== "BETA-HCG"
        )
      )}
      <p className="mt-1 text-[11px]">*Performed if IgM positive.</p>
      <Sub>Current / previous treatment / vaccination</Sub>
      <YesNo value={p.treatmentStatus} options={["NO", "YES"]} />
      {p.treatmentStatus === "YES" && (
        <table className="mt-1 w-full border-collapse border border-black">
          <thead>
            <tr>
              {["Group", "Name", "Administration route", "Dose", "Frequency", "Duration"].map(
                (h) => (
                  <th key={h} scope="col" className={TH}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {p.treatments.map((t) => (
              <tr key={t.id}>
                <td className={TD}>{t.group}</td>
                <td className={TD}>{t.name}</td>
                <td className={TD}>{t.route}</td>
                <td className={TD}>{t.dose}</td>
                <td className={TD}>{t.frequency}</td>
                <td className={TD}>{t.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <H>Organs damage</H>
      <Sub>Skin and mucosa — abnormality?</Sub>
      <YesNo value={p.skinMucosaAbnormality} />
      {p.skinMucosaAbnormality === "YES" && <Checklist items={p.skinMucosaItems} />}

      <Sub>Muscle — damage?</Sub>
      <YesNo value={p.muscleDamage} />
      {ocrTable(sub("Muscle"))}
      <p className="mt-1">
        Others (e.g., muscle biopsy): <YesNo value={p.muscleBiopsyOther} options={["NO", "YES"]} />
        {p.muscleBiopsyOther === "YES" && <>Specify: {p.muscleBiopsySpecify}</>}
      </p>

      <Sub>Joints — damage?</Sub>
      <YesNo value={p.jointsDamage} />
      {p.jointsDamage === "YES" && (
        <table className="w-full border-collapse border border-black">
          <tbody>
            <tr><td className={TD}>Number of swollen joints</td><td className={TD}>{p.swollenJointsCount}</td></tr>
            <tr><td className={TD}>Number of tender joints</td><td className={TD}>{p.tenderJointsCount}</td></tr>
            <tr><td className={TD}>Visual analogue scale (VAS)</td><td className={TD}>{p.vasScore}/100</td></tr>
            <tr><td className={TD}>Abnormal X-ray?</td><td className={TD}><YesNo value={p.abnormalXray} /> {p.abnormalXraySpecify}</td></tr>
            <tr><td className={TD}>Abnormal ultrasound?</td><td className={TD}><YesNo value={p.abnormalUltrasound} /> {p.abnormalUltrasoundSpecify}</td></tr>
            <tr><td className={TD}>Joint deformity?</td><td className={TD}><YesNo value={p.jointDeformity} /> {p.jointDeformitySpecify}</td></tr>
            <tr><td className={TD}>Others</td><td className={TD}><YesNo value={p.jointsOther} options={["NO", "YES"]} /> {p.jointsOtherSpecify}</td></tr>
          </tbody>
        </table>
      )}

      <Sub>Kidneys — damage?</Sub>
      <YesNo value={p.kidneysDamage} />
      {ocrTable(sub("Kidneys"))}
      <p className="mt-1">
        Renal biopsy: <YesNo value={p.renalBiopsyPerformed} options={["NO", "YES"]} />
        {p.renalBiopsyPerformed === "YES" && (
          <>
            {p.renalBiopsyNote} — Class:{" "}
            {["Class I", "Class II", "Class III", "Class IV", "IIIA", "IVA", "IIIC", "IVC", "IIIA/C", "IVA/C", "Class V", "Class VI"].map(
              (c) => (
                <span key={c} className="mr-2">
                  {box(p.renalBiopsyClasses.includes(c))} {c}
                </span>
              )
            )}
          </>
        )}
      </p>

      <Sub>Haematology</Sub>
      {ocrTable(sub("Haematology"))}
      <p className="mt-1">
        Haematological disorders? <YesNo value={p.haematologicalDisorders} />
        {p.haematologicalSpecify}
      </p>

      <Sub>Cardiovascular (Echocardiography / ECG) — abnormality?</Sub>
      <YesNo value={p.cardiovascularAbnormality} />
      {p.cardiovascularAbnormality === "YES" && <Checklist items={p.cardiovascularItems} />}

      <Sub>Lungs</Sub>
      {ocrTable(sub("Lungs"), true)}
      <p className="mt-1">
        Lung damage? <YesNo value={p.lungDamage} />
      </p>
      {p.lungDamage === "YES" && (
        <p>
          {box(p.lungIld)} Interstitial lung disease (ILD) — HRCT pattern:{" "}
          {["UIP", "NSIP", "OP", "NSIP-OP overlap", "DAD", "LIP", "Unclassifiable pattern"].map(
            (c) => (
              <span key={c} className="mr-2">
                {box(p.lungIldPatterns.includes(c))} {c}
              </span>
            )
          )}
          <br />
          {box(p.lungPleuritis)} Pleuritis / pleural effusion {p.lungPleuritisSpecify}
        </p>
      )}

      <Sub>Neuropsychiatric — disorders?</Sub>
      <YesNo value={p.neuropsychiatricDisorders} />
      {p.neuropsychiatricDisorders === "YES" && <Checklist items={p.neuropsychiatricItems} />}

      <Sub>Gastrointestinal system</Sub>
      {ocrTable(sub("Gastrointestinal system"))}
      <p className="mt-1">
        Gastrointestinal disorders? <YesNo value={p.giDisorders} />
      </p>
      {p.giDisorders === "YES" && <Checklist items={p.giItems} />}

      <H>Immunology tests</H>
      {ocrTable(p.ocrFields.filter((f) => f.sectionId === "immunology"))}
      <Sub>ANA (Profile 23)</Sub>
      {blotTable("ana23")}
      <Sub>Autoimmune myositis antibody panel</Sub>
      {blotTable("myositis16")}

      <H>Diagnosis</H>
      <p className="mt-1">
        SLE: 2019 EULAR/ACR score: Total = <b>{eular.totalScore}</b>
        {eular.isClassifiedSle ? " — classified as SLE (≥10)" : " — below threshold (<10)"}
      </p>
      <table className="mt-1 w-full border-collapse border border-black">
        <thead>
          <tr>
            <th scope="col" className={TH}>Clinical domains</th>
            <th scope="col" className={TH}>Score</th>
            <th scope="col" className={TH}>Check</th>
            <th scope="col" className={TH}>Immunological domains</th>
            <th scope="col" className={TH}>Score</th>
            <th scope="col" className={TH}>Check</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(clinical.length, immuno.length) }, (_, i) => (
            <tr key={i}>
              <td className={TD}>
                {clinical[i] && (
                  <>
                    <span className="text-[10px] text-slate-500">{clinical[i].domainLabelEn}: </span>
                    {clinical[i].labelEn}
                  </>
                )}
              </td>
              <td className={TD}>{clinical[i]?.weight}</td>
              <td className={TD}>{clinical[i] && box(clinical[i].checked)}</td>
              <td className={TD}>
                {immuno[i] && (
                  <>
                    <span className="text-[10px] text-slate-500">{immuno[i].domainLabelEn}: </span>
                    {immuno[i].labelEn}
                  </>
                )}
              </td>
              <td className={TD}>{immuno[i]?.weight}</td>
              <td className={TD}>{immuno[i] && box(immuno[i].checked)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[11px]">
        Classify as SLE if the entry criterion is met and the total score is ≥10.
        Within each domain only the highest-weighted criterion counts.
      </p>

      <H>Disease activity assessment</H>
      <p className="mt-1">
        SLEDAI-2K score: Total = <b>{sledai.totalScore}</b>
      </p>
      <table className="mt-1 w-full border-collapse border border-black">
        <thead>
          <tr>
            <th scope="col" className={TH}>Score</th>
            <th scope="col" className={TH}>Criterion</th>
            <th scope="col" className={TH}>Definition</th>
            <th scope="col" className={TH}>Check</th>
          </tr>
        </thead>
        <tbody>
          {p.sledai2kCriteria.map((c) => (
            <tr key={c.id}>
              <td className={TD}>{c.weight}</td>
              <td className={TD}>{c.criterionEn}</td>
              <td className={TD}>{c.definitionEn}</td>
              <td className={TD}>{box(c.checked)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
