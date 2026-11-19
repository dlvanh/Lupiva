import type { ProvisionalScores, ScoreReview } from "@/lib/provisionalScores";

const CLASSIFICATION = {
  vi: {
    meets: "Đạt tiêu chí phân loại",
    does_not_meet: "Không đạt tiêu chí phân loại",
    ana_not_met: "Không đạt tiêu chí vào ANA",
    undetermined: "Chưa xác định",
  },
  en: {
    meets: "Meets classification criteria",
    does_not_meet: "Does not meet classification criteria",
    ana_not_met: "ANA entry criterion not met",
    undetermined: "Undetermined",
  },
};

export function CrfScoreSummary({
  provisional,
  official,
  officialAna,
  language = "vi",
}: {
  provisional: ProvisionalScores;
  official?: ScoreReview["summaries"] | null;
  officialAna?: string;
  language?: "vi" | "en";
}) {
  const isVi = language === "vi";
  const labels = CLASSIFICATION[language];
  const points = (total: number) => `${total} ${isVi ? "điểm" : total === 1 ? "point" : "points"}`;
  const unanswered = (count: number) => isVi
    ? `còn ${count} tiêu chí chưa trả lời`
    : `${count} unanswered ${count === 1 ? "criterion" : "criteria"}`;
  const sledai = official?.sledai;
  const eular = official?.eular;
  const eularClassification = eular?.classification ?? "undetermined";
  let eularStatus = labels[eularClassification];
  if (eularClassification === "undetermined" && !officialAna) {
    eularStatus = isVi ? "Chưa xác định - chưa xác nhận ANA" : "Undetermined - ANA unconfirmed";
  }
  let sledaiStatus = isVi ? "Chưa đủ để tính" : "Not enough data to score";
  if (sledai?.total != null) sledaiStatus = points(sledai.total);
  if (sledai && sledai.missing > 0) {
    if (sledai.total === 0) sledaiStatus = `0 (${unanswered(sledai.missing)})`;
    if (sledai.total === null) sledaiStatus += ` (${unanswered(sledai.missing)})`;
  }

  const proposalCount = provisional.sledai.proposalCount;
  const unansweredCount = provisional.sledai.unansweredCount;
  const provisionalDetails = isVi
    ? `gồm ${proposalCount} đề xuất chưa duyệt, còn ${unansweredCount} tiêu chí chưa có dữ kiện`
    : `includes ${proposalCount} unapproved ${proposalCount === 1 ? "proposal" : "proposals"}, ${unansweredCount} ${unansweredCount === 1 ? "criterion" : "criteria"} without evidence`;

  return (
    <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
      <div className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-800">
        <h3 className="font-semibold">{isVi ? "Điểm chính thức" : "Official scores"}</h3>
        <p className="mt-1">SLEDAI-2K · {sledaiStatus}</p>
        <p>EULAR/ACR 2019 · {eular?.total != null && `${points(eular.total)} · `}{eularStatus}</p>
      </div>
      <aside className="rounded border border-dashed border-amber-500 bg-amber-50 p-3 text-amber-950 print:hidden">
        <h3 className="font-semibold">{isVi ? "Điểm tạm tính (chưa duyệt)" : "Provisional scores (unapproved)"}</h3>
        <p className="mt-1">SLEDAI-2K ≈ {provisional.sledai.total} ({provisionalDetails})</p>
        <p>EULAR/ACR 2019 ≈ {provisional.eular.total} · {labels[provisional.eular.classification]}</p>
        <p className="mt-1 text-xs">
          {isVi
            ? "Chỉ để tham khảo; điểm chính thức tính từ các tiêu chí bác sĩ đã xác nhận."
            : "For reference only. Official scores use the criteria confirmed by the doctor."}
        </p>
      </aside>
    </div>
  );
}
