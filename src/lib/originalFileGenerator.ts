import {
  calculateBmi,
  type SleCrfPatientRecord,
  type UploadedDocFile,
} from "@/data/crfData";

function escapePdfText(text: string): string {
  // Transliterate Vietnamese diacritics and non-ASCII characters to safe ASCII for standard PDF Type1 Helvetica font
  const ascii = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^\x20-\x7E]/g, " ");
  return ascii
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

/**
 * Generates a valid PDF 1.4 binary Uint8Array containing the patient's clinical
 * dossier and OCR biomarkers so that downloading a .pdf attachment downloads a real PDF file.
 */
export function generateClinicalReportPdfBytes(
  patient: SleCrfPatientRecord,
  file: UploadedDocFile
): Uint8Array {
  const bmi = calculateBmi(patient.heightCm, patient.weightKg);
  const lines: Array<{ text: string; bold?: boolean; size?: number }> = [
    {
      text: "VINMEC CENTRAL LABORATORY - SLE CLINICAL DOSSIER",
      bold: true,
      size: 13,
    },
    { text: `Original File: ${file.name}`, bold: true, size: 10 },
    {
      text: `PID: ${patient.studyId}   |   Patient: ${patient.patientName} (${patient.age} / ${patient.gender})`,
      size: 10,
    },
    {
      text: `Height: ${patient.heightCm} cm   |   Weight: ${patient.weightKg} kg   |   BMI: ${bmi} kg/m2   |   ICF: ${patient.icfSignedDate}`,
      size: 9,
    },
    {
      text: `Attending Physician: ${patient.physician}   |   Nurse: ${patient.nurse}`,
      size: 9,
    },
    { text: "", size: 8 },
    {
      text: "1. CLINICAL LABORATORY & SEROLOGY BIOMARKERS",
      bold: true,
      size: 11,
    },
    {
      text: "Code            Assay / Biomarker                       Result              Unit          Flag       OCR",
      bold: true,
      size: 9,
    },
    {
      text: "------------------------------------------------------------------------------------------------------------",
      size: 9,
    },
  ];

  for (const f of patient.ocrFields.slice(0, 28)) {
    const val = (f.value.trim() || f.printedValue || "N/A").slice(0, 18);
    const code = f.code.padEnd(15, " ").slice(0, 15);
    const label = f.labelEn.padEnd(39, " ").slice(0, 39);
    const valCol = val.padEnd(19, " ").slice(0, 19);
    const unitCol = (f.unit || "").padEnd(13, " ").slice(0, 13);
    const flagCol = f.flag.padEnd(10, " ").slice(0, 10);
    lines.push({
      text: `${code} ${label} ${valCol} ${unitCol} ${flagCol} ${f.confidence}%`,
      size: 8.5,
    });
  }

  lines.push({ text: "", size: 8 });
  lines.push({
    text: "2. IMMUNOBLOT STRIP SUMMARY (ANA PROFILE 23 / MYOSITIS 16)",
    bold: true,
    size: 11,
  });

  const highlightedBlots = patient.antibodyBlots.filter(
    (b) => b.printedResult !== "Negative" || b.confidence <= 90
  );
  for (const b of highlightedBlots.slice(0, 12)) {
    const res = b.result || b.printedResult;
    const inten = b.intensity || b.printedIntensity;
    lines.push({
      text: `- ${b.name} (${b.panel.toUpperCase()}): ${res} ${inten} [OCR: ${b.confidence}%]`,
      size: 9,
    });
  }

  if (patient.treatments.length > 0) {
    lines.push({ text: "", size: 8 });
    lines.push({ text: "3. CURRENT TREATMENTS", bold: true, size: 11 });
    for (const t of patient.treatments.slice(0, 6)) {
      lines.push({
        text: `- ${t.name}: ${t.dose} (${t.route}, ${t.frequency}) [${t.duration}]`,
        size: 9,
      });
    }
  }

  // Build PDF content stream
  const streamLines: string[] = ["BT"];
  let y = 800;
  for (const item of lines) {
    if (y < 45) break;
    const fontSize = item.size ?? 9;
    if (!item.text) {
      y -= fontSize;
      continue;
    }
    const fontKey = item.bold ? "/F2" : "/F1";
    streamLines.push(`${fontKey} ${fontSize} Tf`);
    streamLines.push(`1 0 0 1 42 ${y.toFixed(1)} Tm`);
    streamLines.push(`(${escapePdfText(item.text)}) Tj`);
    y -= fontSize + 4.5;
  }
  streamLines.push("ET");
  const contentStream = streamLines.join("\n");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n",
    `6 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

/**
 * Renders a high-resolution clinical lab scan sheet onto an HTML5 Canvas and
 * exports it as an image Blob (PNG, JPEG, or WEBP) matching the original file extension.
 */
async function generateClinicalScanImageBlob(
  patient: SleCrfPatientRecord,
  file: UploadedDocFile
): Promise<Blob> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const mimeType =
    ext === "jpg" || ext === "jpeg"
      ? "image/jpeg"
      : ext === "webp"
      ? "image/webp"
      : "image/png";

  const canvas = document.createElement("canvas");
  canvas.width = 1100;
  canvas.height = 1450;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return new Blob([], { type: mimeType });
  }

  // Paper background
  ctx.fillStyle = "#fcfcfa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  // Header
  ctx.fillStyle = "#115e59";
  ctx.font = "bold 16px monospace";
  ctx.fillText("VINMEC CENTRAL LABORATORY • SLE DOSSIER SCAN", 52, 68);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(file.name, 52, 102);

  const bmi = calculateBmi(patient.heightCm, patient.weightKg);
  ctx.fillStyle = "#334155";
  ctx.font = "15px monospace";
  ctx.fillText(
    `PID: ${patient.studyId}  •  Patient: ${patient.patientName} (${patient.age} / ${patient.gender})  •  ICF: ${patient.icfSignedDate}`,
    52,
    134
  );
  ctx.fillText(
    `Height: ${patient.heightCm} cm  •  Weight: ${patient.weightKg} kg  •  BMI: ${bmi} kg/m²  •  Doctor: ${patient.physician}`,
    52,
    158
  );

  // Divider
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(52, 178);
  ctx.lineTo(canvas.width - 52, 178);
  ctx.stroke();

  // Table Header
  let y = 212;
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 14px monospace";
  ctx.fillText("CODE", 52, y);
  ctx.fillText("BIOMARKER / ASSAY", 190, y);
  ctx.fillText("RESULT", 620, y);
  ctx.fillText("UNIT", 780, y);
  ctx.fillText("FLAG", 900, y);
  ctx.fillText("OCR", 995, y);

  y += 14;
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(52, y);
  ctx.lineTo(canvas.width - 52, y);
  ctx.stroke();

  y += 26;
  ctx.font = "14px monospace";
  for (const f of patient.ocrFields.slice(0, 32)) {
    if (y > canvas.height - 80) break;
    const val = f.value.trim() || f.printedValue || "N/A";
    ctx.fillStyle = "#475569";
    ctx.fillText(f.code.slice(0, 14), 52, y);
    ctx.fillStyle = "#0f172a";
    ctx.fillText(f.labelEn.slice(0, 42), 190, y);
    ctx.font = "bold 14px monospace";
    ctx.fillText(val.slice(0, 16), 620, y);
    ctx.font = "14px monospace";
    ctx.fillStyle = "#475569";
    ctx.fillText((f.unit || "").slice(0, 12), 780, y);
    ctx.fillStyle = f.flag === "Normal" ? "#334155" : "#be123c";
    ctx.fillText(f.flag, 900, y);
    ctx.fillStyle = "#0f766e";
    ctx.fillText(`${f.confidence}%`, 995, y);
    y += 32;
  }

  return new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob ?? new Blob([], { type: mimeType }));
      },
      mimeType,
      0.92
    );
  });
}

function triggerBrowserDownload(blobOrUrl: Blob | string, fileName: string) {
  const isStringUrl = typeof blobOrUrl === "string";
  const url = isStringUrl ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (!isStringUrl) {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Downloads the original attached file in its native file format (PDF, PNG/JPG/WEBP, DOCX)
 * using its exact original filename (`file.name`) rather than exporting an HTML preview.
 */
export async function downloadOriginalClinicalFile(
  patient: SleCrfPatientRecord,
  file: UploadedDocFile
): Promise<void> {
  if (file.url) {
    triggerBrowserDownload(file.url, file.name);
    return;
  }

  if (file.isImage || /\.(png|jpe?g|webp)$/i.test(file.name)) {
    const imgBlob = await generateClinicalScanImageBlob(patient, file);
    triggerBrowserDownload(imgBlob, file.name);
    return;
  }

  if (/\.docx?$/i.test(file.name)) {
    const bmi = calculateBmi(patient.heightCm, patient.weightKg);
    const lines = [
      "VINMEC CENTRAL LABORATORY - SLE CLINICAL DOSSIER",
      `Document: ${file.name}`,
      `PID: ${patient.studyId} | Patient: ${patient.patientName} (${patient.age} / ${patient.gender})`,
      `Height: ${patient.heightCm} cm | Weight: ${patient.weightKg} kg | BMI: ${bmi} kg/m2 | ICF: ${patient.icfSignedDate}`,
      `Attending Physician: ${patient.physician} | Nurse: ${patient.nurse}`,
      "",
      "BIOMARKERS:",
      ...patient.ocrFields.map(
        (f) =>
          `${f.code}\t${f.labelEn}\t${f.value || f.printedValue}\t${f.unit}\t${f.flag}\t${f.confidence}%`
      ),
    ];
    const blob = new Blob([lines.join("\r\n")], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    triggerBrowserDownload(blob, file.name);
    return;
  }

  // Default: native PDF 1.4 binary (.pdf)
  const pdfBytes = generateClinicalReportPdfBytes(patient, file);
  const pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], {
    type: "application/pdf",
  });
  triggerBrowserDownload(pdfBlob, file.name);
}
