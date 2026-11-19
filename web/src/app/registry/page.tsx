"use client";

/**
 * CRF view backed by the Python pipeline (via /api/pipeline). The backend is the
 * source of truth: values read from source documents, LLM or rule proposals,
 * calculated values and blanks come from /api/crf. Nothing is approved
 * automatically; a specialist picks each value (one by one, or by an explicit
 * "tick this section" action) and approves through /api/crf/approve, which
 * re-checks the draft it holds.
 *
 * Layout: fields on the left grouped by the decision they need (values to
 * weigh first, then single source values by section, then the "Chưa rõ"
 * clinical questions collapsed); on the right the source crop of the active
 * field with its date and, when the image size matches, the row box.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DossierApprovalNotice, ViewCrfLink } from "@/components/CrfDossierStatus";
import { CrfScoreSummary } from "@/components/CrfScoreSummary";
import { UiIcon } from "@/components/UiIcon";
import { useLupiva } from "@/context/LupivaContext";
import { getSubmissionStatus } from "@/data/crfData";
import { TRANSLATIONS } from "@/data/translations";
import {
  approvedChoiceId,
  enterTick,
  fieldChoices,
  fieldOriginBadge,
  moveActiveSlot,
  reviewFieldPayload,
  type CrfField,
  type CrfReviewValue,
  type FieldChoice,
} from "@/lib/crfApproval";
import {
  canFinalizeReview,
  caseForIntake,
  evidenceFor,
  firstReviewField,
  linkedCases,
  optionDate,
  reviewGroup,
  reviewProgress,
  sectionReviewTarget,
  singleSourceSelections,
  viAdminValue,
  viFieldLabel,
  viSection,
  type CrfViewWithSources,
  type Evidence,
  type SourceDetail,
  withoutHidden,
} from "@/lib/crfEvidence";
import { parseSlot } from "@/lib/crfSlot";
import { computeProvisionalScores, type ScoreForm, type ScoreReview } from "@/lib/provisionalScores";
import type { SubmissionItemDTO } from "@/lib/submissionsService";
import { useWebCaseIdentities, type IntakeJob } from "@/lib/webCaseIdentities";
import { clearCrfViewCache } from "@/components/upload/CrfAdminFacts";

type CaseItem = { case_id: string; registry_code: string };
type ReviewView = CrfViewWithSources & {
  score_form?: ScoreForm;
  review: (NonNullable<CrfViewWithSources["review"]> & { scores?: ScoreReview }) | null;
};
type Answer = "yes" | "no";
const TOTALS = new Set(["EAC22", "SDA25"]);
const NO_LINKED_CRF = "This dossier does not yet have a CRF.";
type Sources = Record<string, SourceDetail> | undefined;

const COMPONENT: Record<string, string> = {
  result: "",
  intensity: "Cường độ",
  absolute_count: "Số lượng tuyệt đối",
  percentage: "Tỷ lệ %",
  pre_measured: "Trước · giá trị đo",
  pre_percent_predicted: "Trước · % dự đoán",
  titre: "Hiệu giá",
  method: "Phương pháp",
};

const KIND: Record<FieldChoice["kind"], string> = {
  source: "Từ nguồn",
  proposal: "Đề xuất",
  manual: "Bác sĩ chọn",
};

async function backend<T>(path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
  const url = "/api/pipeline" + path + (query ? "?" + new URLSearchParams(query).toString() : "");
  const response = await fetch(
    url,
    body === undefined
      ? { cache: "no-store" }
      : { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error ?? `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function valueLabel(field: CrfField, value: string, isVi: boolean): string {
  const text = field.choices.find((choice) => choice.code === value)?.label ?? value;
  return isVi ? viAdminValue(parseSlot(field.slot).fieldId, text) : text;
}

function proposalNote(origin: string | undefined, isVi: boolean): string {
  if (origin === "calculated") return isVi ? "Tính từ số đo" : "Calculated from measurements";
  if (origin === "knowledge_rule") return isVi ? "Quy tắc đề xuất" : "Rule-based proposal";
  if (origin === "no_evidence") return isVi ? "Chưa rõ · không có dữ kiện" : "Unknown · no evidence";
  return TRANSLATIONS[isVi ? "vi" : "en"].doctor.originLlm;
}

function choiceText(field: CrfField, choice: FieldChoice, sources: Sources, isVi: boolean): string {
  const option = choice.kind === "source" ? field.options.find((item) => item.id === choice.id) : undefined;
  const date = option ? optionDate(option, sources) : undefined;
  const kind = isVi ? KIND[choice.kind] : { source: "Source", proposal: "Proposal", manual: "Manual" }[choice.kind];
  return `${kind}: ${valueLabel(field, choice.value, isVi)}${date ? ` · ${date}` : ""}`;
}

function SourceImage({ item, isVi }: { item: Evidence; isVi: boolean }) {
  const [matches, setMatches] = useState(false);
  if (!item.imageUrl) return null;
  return (
    <figure className="mt-2">
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated backend crop via the proxy */}
        <img
          src={item.imageUrl}
          alt={`${isVi ? "Ảnh nguồn" : "Source image"} ${item.label}`}
          className="block max-h-[60vh] max-w-full rounded border border-slate-200"
          onLoad={(event) => {
            const image = event.currentTarget;
            setMatches(
              !!item.imageSize &&
                image.naturalWidth === item.imageSize[0] &&
                image.naturalHeight === item.imageSize[1],
            );
          }}
        />
        {item.box && matches && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-sm border-2 border-amber-500 bg-amber-300/20"
            style={{
              left: `${item.box.left}%`,
              top: `${item.box.top}%`,
              width: `${item.box.width}%`,
              height: `${item.box.height}%`,
            }}
          />
        )}
      </div>
      {item.box && matches && (
        <figcaption className="mt-1 text-xs text-slate-500">
          {isVi ? "Khung vàng là vị trí hàng do AI đề xuất." : "The yellow outline marks the row located by AI."}
        </figcaption>
      )}
    </figure>
  );
}

export function EvidencePanel({ field, sources, isVi }: { field: CrfField | null; sources: Sources; isVi: boolean }) {
  if (!field) {
    return <p className="text-sm text-slate-500">{isVi ? "Chọn một ô để xem ảnh nguồn." : "Select a cell to see its source image."}</p>;
  }
  const component = COMPONENT[field.component] ?? field.component;
  const fieldId = parseSlot(field.slot).fieldId;
  return (
    <div>
      <h3 className="font-medium text-slate-800">
        {field.label}
        {component && <span className="text-slate-400"> · {component}</span>}
      </h3>
      <p className="font-mono text-xs text-slate-400">{field.slot}</p>
      {field.options.map((option, index) => {
        const evidence = evidenceFor(option, sources);
        return (
          <div key={option.id} className="mt-3 border-t border-slate-100 pt-3">
            <p className="text-sm">
              <span className="text-slate-500">{isVi ? "Giá trị" : "Value"} {field.options.length > 1 ? index + 1 : ""} </span>
              <span className="font-mono font-semibold">{valueLabel(field, option.value, isVi)}</span>
            </p>
            {evidence.length === 0 && (
              <p className="text-xs text-slate-500">{isVi ? "Không có ảnh nguồn cho giá trị này." : "No source image for this value."}</p>
            )}
            {evidence.map((item, n) => (
              <div key={n} className="mt-1">
                <p className="text-xs text-slate-600">
                  {isVi ? "Trên phiếu" : "On report"} · <span className="font-medium">{item.label || "—"}</span> ={" "}
                  <span className="font-mono">{isVi ? viAdminValue(fieldId, item.value) : item.value}</span>
                  {item.date && (
                    <>
                      {" "}
                      · {isVi ? (item.dateKind ?? "ngày") : "Date"} <span className="font-mono">{item.date}</span>
                    </>
                  )}
                </p>
                <SourceImage key={item.imageUrl} item={item} isVi={isVi} />
              </div>
            ))}
          </div>
        );
      })}
      {field.proposal && (
        <div className="mt-3 border-t border-slate-100 pt-3 text-sm">
          <p>
            <span className="rounded border border-dashed border-amber-500 bg-amber-50 px-1.5 py-0.5 font-mono italic">
              {valueLabel(field, field.proposal.value, isVi)}
            </span>
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-800">
              <UiIcon name="proposal" className="size-3 shrink-0" />{proposalNote(field.proposal.origin, isVi)}
            </span>
          </p>
          {field.proposal.reason && <p className="mt-1 text-xs text-slate-600">{field.proposal.reason}</p>}
        </div>
      )}
      {!field.options.length && !field.proposal && (
        <p className="mt-3 text-sm text-slate-500">{isVi ? "Chưa có giá trị nguồn." : "No source value."}</p>
      )}
    </div>
  );
}

export function FieldRow({
  field,
  sources,
  canApprove,
  active,
  selected,
  approved,
  onActivate,
  onSelect,
  typed,
  onType,
  isVi = true,
  editing = false,
  onEdit,
}: {
  field: CrfField;
  sources: Sources;
  canApprove: boolean;
  active: boolean;
  selected: string;
  approved?: CrfReviewValue;
  onActivate: () => void;
  onSelect: (id: string) => void;
  typed: string;
  onType: (text: string) => void;
  isVi?: boolean;
  editing?: boolean;
  onEdit?: () => void;
}) {
  const dc = TRANSLATIONS[isVi ? "vi" : "en"].doctor;
  const component = COMPONENT[field.component] ?? field.component;
  const choices = fieldChoices(field);
  const single = choices.length === 1 && field.options.length === 1;
  const source = field.options[0];
  const savedChoice = approvedChoiceId(choices, approved);
  const date = source ? optionDate(source, sources) : undefined;
  const viLabel = isVi ? viFieldLabel(field) : undefined;
  const badge = fieldOriginBadge(field, selected, typed, selected || typed.trim() ? undefined : approved?.value);
  const badgeText =
    badge === "approved"
      ? dc.originApproved
      : badge === "manual"
        ? dc.originManual
        : badge === "source"
          ? dc.originSource
          : badge === "proposal"
            ? proposalNote(field.proposal?.origin, isVi)
            : null;
  const badgeTone =
    badge === "approved"
      ? "bg-emerald-50 text-emerald-800"
      : badge === "manual"
        ? "bg-sky-50 text-sky-800"
        : badge === "proposal"
          ? "bg-amber-50 text-amber-800"
          : "bg-slate-100 text-slate-600";
  return (
    <div
      id={`slot-${field.slot}`}
      tabIndex={-1}
      onFocus={onActivate}
      className={`grid cursor-pointer scroll-mt-[calc(35vh+4rem)] grid-cols-1 gap-1 border-b border-slate-100 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:scroll-mt-20 ${
        active ? "bg-sky-50" : "hover:bg-slate-50"
      }`}
      onClick={onActivate}
    >
      <div className="text-sm text-slate-700">
        {field.label}
        {viLabel && <span className="text-slate-500"> · {viLabel}</span>}
        {component && <span className="text-slate-400"> · {component}</span>}
        {badge && badgeText && (
          <span className={`ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${badgeTone}`}>
            <UiIcon name={badge} className="size-3 shrink-0" />{badgeText}
          </span>
        )}
        {approved?.origin.startsWith("manual") && badge !== "manual" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-sky-800">
            <UiIcon name="manual" className="size-3 shrink-0" />{dc.originManual}
          </span>
        )}
      </div>
      <div className="text-sm">
        {single && canApprove ? (
          <label className="flex items-center gap-2">
            {!savedChoice && (
              <input
                type="checkbox"
                aria-label={`${dc.reviewBtn} ${field.label}`}
                checked={selected === source.id}
                onChange={(event) => onSelect(event.target.checked ? source.id : "")}
              />
            )}
            <span className="font-mono">{valueLabel(field, source.value, isVi)}</span>
            {date && <span className="text-xs text-slate-500">{date}</span>}
          </label>
        ) : (
          <div>
            {field.options.length > 1 && (
              <p className="text-xs text-amber-800">
                {field.options.length} {isVi ? "giá trị nguồn" : "source values"} ·{" "}
                {field.options
                  .map((option) => {
                    const when = optionDate(option, sources);
                    return `${valueLabel(field, option.value, isVi)}${when ? ` (${when})` : ""}`;
                  })
                  .join(" · ")}
              </p>
            )}
            {field.proposal && (
              <p className="text-xs text-amber-800">
                {badge !== "proposal" && <>{proposalNote(field.proposal.origin, isVi)} · </>}
                <strong>{valueLabel(field, field.proposal.value, isVi)}</strong>
              </p>
            )}
            {field.choices.length > 0 && field.proposal?.reason && field.proposal.origin !== "no_evidence" && (
              <p className="mt-1 text-xs text-slate-500">{field.proposal.reason}</p>
            )}
            {canApprove && choices.length > 0 && (
              <select
                aria-label={`${dc.reviewBtn} ${field.label}`}
                className={`mt-1 w-full rounded border px-2 py-1 text-sm ${
                  selected ? "border-emerald-500 bg-emerald-50" : "border-slate-300"
                }`}
                value={selected || savedChoice || ""}
                onChange={(event) => onSelect(event.target.value === savedChoice ? "" : event.target.value)}
              >
                {!savedChoice && (
                  <option value="">
                    {approved
                      ? `${dc.originApproved} · ${valueLabel(field, approved.value, isVi)}`
                      : isVi ? "— Chọn giá trị —" : "— Select a value —"}
                  </option>
                )}
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choiceText(field, choice, sources, isVi)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {canApprove && field.choices.length === 0 && (
          // Free-text fields (name, number, BMI, Physician, Nurse…): the box only appears
          // after the doctor clicks Edit; a typed value is approved as "Nhập tay".
          editing || typed.trim() ? (
            <input
              aria-label={`${isVi ? "Nhập tay" : "Enter manually"} ${field.label}`}
              placeholder={isVi ? "Sửa" : "Edit"}
              autoFocus={editing}
              className={`mt-1 w-full rounded border px-2 py-1 font-mono text-sm ${
                typed.trim() ? "border-emerald-500 bg-emerald-50" : "border-slate-300"
              }`}
              value={typed}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onType(event.target.value)}
            />
          ) : (
            <button
              type="button"
              aria-label={`${dc.editBtn}: ${field.label}`}
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.();
              }}
              className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <UiIcon name="manual" className="size-3 shrink-0" />{dc.editBtn}
            </button>
          )
        )}
        {approved && (
          <p className="mt-1 text-xs text-emerald-700">
            {badge !== "approved" && <>{dc.originApproved} · </>}
            <span className="font-mono">{valueLabel(field, approved.value, isVi)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function bySection(fields: CrfField[]): [string, CrfField[]][] {
  const groups = new Map<string, CrfField[]>();
  for (const field of fields) groups.set(field.section, [...(groups.get(field.section) ?? []), field]);
  return [...groups.entries()];
}

function scrollToField(slot: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(`slot-${slot}`);
    const details = field?.closest("details");
    if (details) details.open = true;
    field?.scrollIntoView({ block: "nearest" });
  });
}

function preventEnter(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter") event.preventDefault();
}

export default function RegistryCrfPage() {
  const { currentUser, language } = useLupiva();
  const canApprove = currentUser?.role === "specialist";
  const isVi = language === "vi";
  const dc = TRANSLATIONS[language].doctor;
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [caseId, setCaseId] = useState("");
  const [view, setView] = useState<ReviewView | null>(null);
  // Score criteria (EULAR/SLEDAI): the doctor's Có/Không per criterion, approved with the rest.
  const [criteria, setCriteria] = useState<Record<string, Answer>>({});
  const [ana, setAna] = useState<"" | Answer>("");
  const [scoreDate, setScoreDate] = useState("");
  const [scoreSettingsChanged, setScoreSettingsChanged] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  // Values the doctor typed for free-text fields; they replace any ticked source/proposal.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | { approvedCaseId: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  // Free-text boxes stay hidden until the doctor clicks Edit.
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [intakeJobs, setIntakeJobs] = useState<IntakeJob[]>([]);
  const [finalizing, setFinalizing] = useState(false);
  const loadVersion = useRef(0);
  const [openingIntake, setOpeningIntake] = useState<string | null>(null);
  const { identityByCase, setIdentityByCase } = useWebCaseIdentities(intakeJobs, setError, openingIntake);
  const [requestedAnchor, setRequestedAnchor] = useState<string | null>(null);

  const load = useCallback(async (id: string, requestedSlot?: string, requestedSection?: string) => {
    const version = ++loadVersion.current;
    setCaseId(id);
    setView(null);
    setSelections({});
    setTyped({});
    setCriteria({});
    setScoreSettingsChanged(false);
    setActiveSlot(null);
    setRequestedAnchor(null);
    setEditing(new Set());
    setError(null);
    setNotice(null);
    setShowEmpty(false);
    setLoading(!!id);
    if (!id) return;
    try {
      const next = withoutHidden(await backend<ReviewView>("/api/crf", { case_id: id }));
      if (version !== loadVersion.current) return;
      setView(next);
      const previous = next.review?.scores?.assessment;
      setAna(previous?.ana === "yes" || previous?.ana === "no" ? previous.ana : "");
      setScoreDate(previous?.date || next.score_default_date || "");
      const scoreSlots = new Set(Object.values(next.score_form ?? {}).flat().map((row) => row.field_id + "/result"));
      const candidates = next.fields.filter(
        (field) => !scoreSlots.has(field.slot) && reviewGroup(field) !== "empty",
      );
      const ordered = [
        ...candidates.filter((field) => reviewGroup(field) === "decide"),
        ...bySection(candidates.filter((field) => reviewGroup(field) === "source")).flatMap(([, fields]) => fields),
        ...candidates.filter((field) => reviewGroup(field) === "unknown"),
      ];
      const anchor = requestedSlot ? `slot-${requestedSlot}` : requestedSection
        ? sectionReviewTarget(next.fields, requestedSection, !!next.score_form) : undefined;
      const targetField = next.fields.find((field) => `slot-${field.slot}` === anchor);
      const first = targetField ?? firstReviewField(ordered, next.sources);
      setActiveSlot(first?.slot ?? null);
      setShowEmpty(!!requestedSlot || (!!targetField && reviewGroup(targetField) === "empty"));
      if (anchor) setRequestedAnchor(anchor);
    } catch (reason) {
      if (version === loadVersion.current) setError((reason as Error).message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!view || !requestedAnchor) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(requestedAnchor);
      const disclosure = target?.closest("details");
      if (disclosure) disclosure.open = true;
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, requestedAnchor]);

  useEffect(() => {
    if (!canApprove) return;
    let cancelled = false;
    (async () => {
      try {
        const [summary, listing] = await Promise.all([
          backend<{ cases: CaseItem[] }>("/api/summary"),
          backend<{ jobs?: IntakeJob[] }>("/api/intakes").catch(() => ({ jobs: [] as IntakeJob[] })),
        ]);
        if (cancelled) return;
        setCases(summary.cases);
        setIntakeJobs(listing.jobs ?? []);
        // Opened from a submission card: /registry?intake=<job id> or ?case=<case id>.
        const params = new URLSearchParams(window.location.search);
        let initial = params.get("case") ?? "";
        const intake = params.get("intake");
        setOpeningIntake(intake);
        if (!initial && intake) {
          initial = caseForIntake(listing.jobs, intake) ?? "";
          if (!initial && !cancelled) {
            setError(NO_LINKED_CRF);
          }
        }
        if (initial && !cancelled && summary.cases.some((item) => item.case_id === initial)) {
          await load(initial, params.get("slot") ?? undefined, params.get("section") ?? undefined);
        }
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canApprove, load]);

  const selectedCount = Object.entries(selections).filter(([slot, id]) => id && !typed[slot]?.trim()).length +
    Object.entries(typed).filter(([slot, text]) => text.trim() && text.trim() !== view?.review?.values[slot]?.value).length +
    Object.keys(criteria).length;

  const approve = useCallback(async () => {
    if (!view) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      const scored = Object.keys(criteria).length > 0 || scoreSettingsChanged || !!view.review?.scores?.assessment;
      const payload = reviewFieldPayload(caseId, view, selections, typed);
      await backend("/api/crf/approve", undefined, {
        ...payload,
        ...(scored ? { score_assessment: { ana, date: scoreDate, criteria } } : {}),
      });
      clearCrfViewCache();
      await load(caseId);
      setNotice(selectedCount ? dc.reviewSaved(selectedCount) : dc.scoreSaved);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }, [caseId, view, selections, typed, criteria, scoreSettingsChanged, ana, scoreDate, load, selectedCount, dc]);

  // Ask the backend LLM to answer the clinical questions from labs, report notes and
  // printed diagnoses; proposals arrive as "LLM đề xuất · chưa duyệt".
  const draftClinical = useCallback(async () => {
    if (!caseId) return;
    setError(null);
    setNotice(null);
    setDrafting(true);
    try {
      await backend("/api/crf/generate", undefined, { case_id: caseId });
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const next = await backend<CrfViewWithSources & { job?: { status?: string; error?: string } }>("/api/crf", {
          case_id: caseId,
        });
        if (next.job?.status !== "running") {
          if (next.job?.status === "failed") {
            throw new Error(next.job.error ?? (isVi ? "Không tạo được đề xuất." : "Unable to generate proposals."));
          }
          clearCrfViewCache();
          await load(caseId);
          setNotice(isVi ? "Đã tạo đề xuất LLM cho các câu lâm sàng." : "LLM proposals are ready for review.");
          return;
        }
      }
      throw new Error(isVi ? "Đang tạo đề xuất. Hãy tải lại phiếu sau." : "Proposal generation is still running. Reload the CRF later.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDrafting(false);
    }
  }, [caseId, isVi, load]);

  useEffect(() => {
    if (!caseId || drafting || view?.job?.status !== "running") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const next = await backend<ReviewView>("/api/crf", { case_id: caseId });
        if (!cancelled && next.job?.status !== "running") {
          clearCrfViewCache();
          setView(withoutHidden(next));
        }
      } catch {
        // Keep the last view and try again on the next poll.
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [caseId, drafting, view?.job?.status]);

  const fieldBySlot = useMemo(() => new Map((view?.fields ?? []).map((field) => [field.slot, field])), [view]);
  const acceptScoreProposals = () =>
    setCriteria((previous) => {
      const next = { ...previous };
      for (const row of Object.values(view?.score_form ?? {}).flat()) {
        const value = fieldBySlot.get(row.field_id + "/result")?.proposal?.value;
        const saved = view?.review?.values[row.field_id + "/result"];
        if (!TOTALS.has(row.field_id) && !saved && !next[row.field_id] && (value === "yes" || value === "no")) {
          next[row.field_id] = value;
        }
      }
      return next;
    });

  const groups = useMemo(() => {
    // Score criteria are answered in their own section, not in the field lists.
    const scoreSlots = new Set(Object.values(view?.score_form ?? {}).flat().map((row) => row.field_id + "/result"));
    const fields = (view?.fields ?? []).filter((field) => !scoreSlots.has(field.slot));
    const approved = view?.review?.values ?? {};
    const pick = (group: string) => fields.filter((field) => reviewGroup(field) === group);
    return {
      decide: pick("decide"),
      source: bySection(pick("source")),
      unknown: pick("unknown"),
      empty: bySection(pick("empty").filter((field) => showEmpty || approved[field.slot])),
    };
  }, [view, showEmpty]);

  const activeField = useMemo(
    () => view?.fields.find((field) => field.slot === activeSlot) ?? null,
    [view, activeSlot],
  );

  const currentSubmission = caseId ? identityByCase.get(caseId) : undefined;
  const currentCase = cases.find((item) => item.case_id === caseId);
  const webApproved = currentSubmission
    ? getSubmissionStatus(currentSubmission.record) === "approved"
    : false;

  const progress = useMemo(() => (view ? reviewProgress(view) : null), [view]);
  const hasEdits = selectedCount > 0 || scoreSettingsChanged;
  const finalizeReady = !!view && canFinalizeReview(view) && !hasEdits && !saving && !drafting;

  const openedIds = useRef(new Set<string>());
  const dbSubmissionId = currentSubmission?.dbSubmissionId;
  useEffect(() => {
    if (!view || !dbSubmissionId || webApproved || currentSubmission?.firstOpenedAt || openedIds.current.has(dbSubmissionId)) return;
    openedIds.current.add(dbSubmissionId);
    void fetch(`/api/submissions/${encodeURIComponent(dbSubmissionId)}/opened`, { method: "POST" })
      .then((response) => {
        if (!response.ok) openedIds.current.delete(dbSubmissionId);
      })
      .catch(() => openedIds.current.delete(dbSubmissionId));
  }, [view, dbSubmissionId, webApproved, currentSubmission?.firstOpenedAt]);

  const sectionIndex = useMemo(() => {
    if (!view || !progress) return [] as { id: string; label: string }[];
    const entries = [{ id: "crf-section-decide", label: `${dc.decideShort} (${progress.pending})` }];
    const sections = bySection([...groups.decide, ...groups.source.flatMap(([, fields]) => fields), ...groups.unknown,
      ...groups.empty.flatMap(([, fields]) => fields)]);
    for (const [section, fields] of sections) {
      entries.push({ id: `slot-${fields[0].slot}`, label: isVi ? viSection(section) : section });
    }
    if (view.score_form) entries.push({ id: "crf-section-score", label: dc.scoreShort });
    if (groups.unknown.length > 0) {
      entries.push({ id: "crf-section-unknown", label: `${dc.unknownShort} (${groups.unknown.length})` });
    }
    return entries;
  }, [view, progress, groups, isVi, dc.decideShort, dc.scoreShort, dc.unknownShort]);

  const scoreSlots = useMemo(() => new Map(
    Object.values(view?.score_form ?? {}).flat()
      .filter((row) => !TOTALS.has(row.field_id))
      .map(({ field_id }) => [field_id + "/result", field_id]),
  ), [view]);

  const navSlots = useMemo(
    () =>
      [
        ...groups.decide.map((field) => field.slot),
        ...groups.source.flatMap(([, fields]) => fields.map((field) => field.slot)),
        ...scoreSlots.keys(),
        ...groups.unknown.map((field) => field.slot),
        ...groups.empty.flatMap(([, fields]) => fields.map((field) => field.slot)),
      ],
    [groups, scoreSlots],
  );

  // ↑/↓ move between fields, Enter ticks the active field — never submits the review.
  useEffect(() => {
    if (!canApprove || saving || drafting || finalizing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Enter")) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, select, textarea, button, a, summary")) return;
      if (!navSlots.length) return;
      if (event.key === "Enter") {
        if (!activeSlot) return;
        event.preventDefault();
        if (event.repeat) return;
        const field = fieldBySlot.get(activeSlot);
        if (!field) return;
        const scoreId = scoreSlots.get(activeSlot);
        if (scoreId) {
          const value = field.proposal?.value;
          if (value === "yes" || value === "no") {
            setCriteria((previous) => {
              if (!previous[scoreId] && value !== view?.review?.values[activeSlot]?.value) {
                return { ...previous, [scoreId]: value };
              }
              const next = { ...previous };
              delete next[scoreId];
              return next;
            });
          }
          return;
        }
        const next = enterTick(field, selections[activeSlot] ?? "");
        const savedChoice = approvedChoiceId(fieldChoices(field), view?.review?.values[activeSlot]);
        if (next !== null && next !== savedChoice && !typed[activeSlot]?.trim()) {
          setSelections((previous) => ({ ...previous, [activeSlot]: next }));
        }
        return;
      }
      event.preventDefault();
      const next = moveActiveSlot(navSlots, activeSlot, event.key);
      setActiveSlot(next);
      if (next) scrollToField(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canApprove, saving, drafting, finalizing, navSlots, activeSlot, fieldBySlot, selections, typed, scoreSlots, view]);

  // Explicit "Phê duyệt hồ sơ": only when every remaining CRF cell is decided and
  // saved on the backend; reuses the audited PATCH /api/submissions/[id] path.
  const finalizeDossier = useCallback(async () => {
    if (!currentSubmission || !finalizeReady || finalizing || webApproved) return;
    setError(null);
    setNotice(null);
    setFinalizing(true);
    try {
      const response = await fetch(
        `/api/submissions/${encodeURIComponent(currentSubmission.dbSubmissionId)}`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            record: {
              ...currentSubmission.record,
              submissionStatus: "approved",
            },
            utcOffsetMinutes: -new Date().getTimezoneOffset(),
          }),
        },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error ?? `HTTP ${response.status}`);
      }
      const approved = (await response.json()) as SubmissionItemDTO;
      clearCrfViewCache();
      setIdentityByCase((previous) => new Map(previous).set(caseId, approved));
      setNotice({ approvedCaseId: caseId });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setFinalizing(false);
    }
  }, [caseId, currentSubmission, finalizeReady, finalizing, webApproved, setIdentityByCase]);

  const select = (slot: string, id: string) => setSelections((previous) => ({ ...previous, [slot]: id }));
  const tickAll = (fields: CrfField[]) => setSelections((previous) => ({
    ...previous,
    ...singleSourceSelections(fields.filter((field) => !view?.review?.values[field.slot] && !previous[field.slot])),
  }));
  const untickAll = (fields: CrfField[]) =>
    setSelections((previous) => {
      const next = { ...previous };
      for (const field of fields) delete next[field.slot];
      return next;
    });

  const rows = (fields: CrfField[]) =>
    fields.map((field) => (
      <FieldRow
        key={field.slot}
        field={field}
        sources={view?.sources}
        canApprove={canApprove}
        active={field.slot === activeSlot}
        selected={selections[field.slot] ?? ""}
        approved={view?.review?.values[field.slot]}
        onActivate={() => setActiveSlot(field.slot)}
        onSelect={(id) => select(field.slot, id)}
        typed={typed[field.slot] ?? ""}
        onType={(text) => setTyped((previous) => ({ ...previous, [field.slot]: text }))}
        isVi={isVi}
        editing={editing.has(field.slot)}
        onEdit={() => {
          setActiveSlot(field.slot);
          setEditing((previous) => new Set(previous).add(field.slot));
        }}
      />
    ));

  if (currentUser && !canApprove) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="rounded bg-slate-50 p-3 text-sm text-slate-600">
          {isVi ? "Trang phiếu CRF chỉ dành cho bác sĩ." : "CRF review is available to clinical specialists."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-800">{isVi ? "Duyệt hồ sơ" : "Review dossier"}</h1>
      {currentCase && (
        <div className="mt-2">
          {currentSubmission && (
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-sm font-bold text-white">
                {currentSubmission.record.studyId}
              </span>
              <span className="text-lg font-semibold text-slate-900">
                {currentSubmission.record.patientName}
              </span>
            </p>
          )}
          <p className="mt-0.5 text-xs text-slate-500">
            {dc.backendIdLabel}: <span className="font-mono">{currentCase.registry_code}</span>
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label={isVi ? "Bệnh nhân" : "Patient"}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          value={caseId}
          disabled={saving || finalizing || drafting}
          onChange={(event) => load(event.target.value)}
        >
          <option value="">{isVi ? "Chọn bệnh nhân…" : "Select a patient…"}</option>
          {linkedCases(cases, new Set(identityByCase.keys()), caseId).map((item) => {
            const mapped = identityByCase.get(item.case_id);
            return (
              <option key={item.case_id} value={item.case_id}>
                {mapped
                  ? `${mapped.record.studyId} · ${mapped.record.patientName}`
                  : item.registry_code}
              </option>
            );
          })}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} />
          {isVi ? "Hiện cả các ô trống" : "Show empty cells"}
        </label>
        {view && canApprove && (
          <button
            type="button"
            disabled={drafting || saving || finalizing || hasEdits}
            onClick={() => void draftClinical()}
            className="rounded border border-amber-600 px-2 py-1 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
          >
            {drafting ? (isVi ? "Đang tạo đề xuất…" : "Generating proposals…") : (isVi ? "Tạo đề xuất LLM" : "Generate LLM proposals")}
          </button>
        )}
      </div>
      {view && progress && (
        <div className="mt-4 rounded border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">
              {dc.reviewBar(progress.approved, progress.total, progress.pending)}
            </p>
            <p className="text-xs text-slate-500">{dc.keyboardHint}</p>
          </div>
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={dc.reviewBar(progress.approved, progress.total, progress.pending)}
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
          >
            <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
          {sectionIndex.length > 0 && (
            <nav aria-label={dc.sectionsLabel} className="mt-2 flex flex-wrap gap-1.5">
              {sectionIndex.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    const element = document.getElementById(entry.id);
                    const details = element?.closest("details");
                    if (details) details.open = true;
                    element?.scrollIntoView({ block: "start" });
                    element?.focus({ preventScroll: true });
                  }}
                  className="cursor-pointer rounded-full border border-slate-300 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  {entry.label}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}
      {view?.review && (
        <p className="mt-3 text-xs text-slate-500">
          {isVi ? "Lượt duyệt gần nhất" : "Last review"} · {view.review.reviewer?.name ?? "—"} ·{" "}
          {new Date(view.review.reviewed_at).toLocaleString(isVi ? "vi-VN" : "en-GB")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error === NO_LINKED_CRF && isVi ? "Hồ sơ này chưa có phiếu CRF." : error}
        </p>
      )}
      {typeof notice === "string" && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}
      {notice && typeof notice !== "string" && <DossierApprovalNotice caseId={notice.approvedCaseId} language={language} />}
      {loading && <p className="mt-4 text-sm text-slate-500">{isVi ? "Đang tải phiếu…" : "Loading CRF…"}</p>}

      {view && progress && (
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <fieldset disabled={saving || drafting || finalizing} className="min-w-0">
            <legend id="crf-section-decide" tabIndex={-1} className="mb-2 scroll-mt-20 font-medium text-slate-800">
              {dc.decideShort} ({progress.pending})
            </legend>
            {groups.decide.length > 0 && (
              <div className="rounded border border-amber-300 bg-white p-4">{rows(groups.decide)}</div>
            )}
            {groups.source.map(([section, fields], index) => (
              <section key={section} id={`crf-section-source-${index}`} className="mt-5 rounded border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-slate-800">
                    {section}
                    {isVi && viSection(section) !== section && <span className="font-normal text-slate-500"> · {viSection(section)}</span>}{" "}
                    <span className="text-sm font-normal text-slate-500">({fields.length})</span>
                  </h2>
                  {canApprove && (
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        className="rounded border border-emerald-600 px-2 py-1 text-emerald-800 hover:bg-emerald-50"
                        onClick={() => tickAll(fields)}
                      >
                        {isVi ? "Tích cả mục" : "Tick this section"}
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-50"
                        onClick={() => untickAll(fields)}
                      >
                        {isVi ? "Bỏ tích" : "Clear ticks"}
                      </button>
                    </div>
                  )}
                </div>
                {rows(fields)}
              </section>
            ))}
            {view.score_form && (
              <section id="crf-section-score" className="mt-5 scroll-mt-[calc(35vh+4rem)] rounded border border-indigo-200 bg-white p-4 lg:scroll-mt-20">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium text-slate-800">{dc.scoreShort} · EULAR/ACR 2019 &amp; SLEDAI-2K</h2>
                  {canApprove && (
                    <button
                      type="button"
                      className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-900 hover:bg-amber-50"
                      onClick={acceptScoreProposals}
                    >
                      {isVi ? "Chọn các đề xuất" : "Select proposals"}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    {isVi ? "ANA ≥ 1:80 (tiêu chí vào EULAR)" : "ANA ≥ 1:80 (EULAR entry criterion)"}
                    <select
                      className="rounded border border-slate-300 px-2 py-1"
                      value={ana}
                      disabled={!canApprove}
                      onChange={(event) => {
                        setAna(event.target.value as "" | Answer);
                        setScoreSettingsChanged(true);
                      }}
                    >
                      <option value="">{isVi ? "Chưa xác nhận" : "Unconfirmed"}</option>
                      <option value="yes">{isVi ? "Có" : "Yes"}</option>
                      <option value="no">{isVi ? "Không" : "No"}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    {isVi ? "Ngày đánh giá SLEDAI" : "SLEDAI assessment date"}
                    <input
                      type="date"
                      className="rounded border border-slate-300 px-2 py-1"
                      value={scoreDate.slice(0, 10)}
                      disabled={!canApprove}
                      onChange={(event) => {
                        setScoreDate(event.target.value);
                        setScoreSettingsChanged(true);
                      }}
                    />
                  </label>
                </div>
                <CrfScoreSummary
                  provisional={computeProvisionalScores(view)}
                  official={view.review?.scores?.summaries}
                  officialAna={view.review?.scores?.assessment?.ana}
                  language={language}
                />
                {Object.entries(view.score_form).map(([group, scoreRows]) => (
                  <details key={group} className="mt-3" open>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      {group === "eular" ? "EULAR/ACR 2019" : "SLEDAI-2K"} ·{" "}
                      {scoreRows.filter((row) => criteria[row.field_id]).length}/
                      {scoreRows.filter((row) => !TOTALS.has(row.field_id)).length} {isVi ? "tiêu chí đã chọn" : "criteria selected"}
                    </summary>
                    {scoreRows
                      .filter((row) => !TOTALS.has(row.field_id))
                      .map((row) => {
                        const slot = row.field_id + "/result";
                        const field = fieldBySlot.get(slot);
                        const proposal = field?.proposal;
                        const approvedValue = view.review?.values[slot]?.value;
                        const approvedAnswer = approvedValue === "yes" || approvedValue === "no" ? approvedValue : "";
                        const answer = (value: string) => value === "yes" ? (isVi ? "Có" : "Yes") :
                          value === "no" ? (isVi ? "Không" : "No") : value;
                        const viLabel = isVi && field ? viFieldLabel(field) : undefined;
                        return (
                          <div
                            key={row.field_id}
                            id={`slot-${slot}`}
                            tabIndex={-1}
                            onFocus={() => setActiveSlot(slot)}
                            className={`grid cursor-pointer grid-cols-1 gap-1 border-b border-slate-100 px-2 py-1.5 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] ${
                              slot === activeSlot ? "bg-sky-50" : "hover:bg-slate-50"
                            }`}
                            onClick={() => setActiveSlot(slot)}
                          >
                            <div className="text-slate-700" title={row.definition}>
                              {row.label}{viLabel && <span className="text-slate-500"> · {viLabel}</span>}{" "}
                              <span className="font-mono text-xs text-slate-400">({row.weight})</span>
                            </div>
                            <div>
                              <select
                                aria-label={`${dc.scoreShort} ${row.label}`}
                                disabled={!canApprove}
                                className={`rounded border px-2 py-1 text-sm ${
                                  criteria[row.field_id] ? "border-emerald-500 bg-emerald-50" : "border-slate-300"
                                }`}
                                value={criteria[row.field_id] ?? approvedAnswer}
                                onChange={(event) =>
                                  setCriteria((previous) => {
                                    const next = { ...previous };
                                    if (event.target.value && event.target.value !== approvedAnswer) next[row.field_id] = event.target.value as Answer;
                                    else delete next[row.field_id];
                                    return next;
                                  })
                                }
                              >
                                {!approvedAnswer && <option value="">{isVi ? "— Chưa chọn —" : "— Select —"}</option>}
                                <option value="yes">{answer("yes")}</option>
                                <option value="no">{answer("no")}</option>
                              </select>
                              {proposal && (proposal.value === "yes" || proposal.value === "no") && (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-800">
                                  <UiIcon name="proposal" className="size-3 shrink-0" />{proposalNote(proposal.origin, isVi)} · {answer(proposal.value)}
                                </span>
                              )}
                              {approvedValue && (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-700">
                                  <UiIcon name="approved" className="size-3 shrink-0" />{dc.originApproved} · {answer(approvedValue)}
                                </span>
                              )}
                              {proposal?.reason && <p className="text-xs text-slate-500">{proposal.reason}</p>}
                            </div>
                          </div>
                        );
                      })}
                  </details>
                ))}
              </section>
            )}
            {groups.unknown.length > 0 && (
              <details
                id="crf-section-unknown"
                className="mt-5 rounded border border-slate-200 bg-white p-4"
                open={groups.unknown.some((field) => field.slot === activeSlot) || undefined}
              >
                <summary className="cursor-pointer font-medium text-slate-800">
                  {isVi ? "Câu hỏi lâm sàng chưa có dữ kiện" : "Clinical questions without evidence"} ({groups.unknown.length})
                </summary>
                <div className="mt-2">{rows(groups.unknown)}</div>
              </details>
            )}
            {groups.empty.map(([section, fields]) => (
              <section key={`empty-${section}`} className="mt-5 rounded border border-slate-200 bg-white p-4">
                <h2 className="mb-2 font-medium text-slate-500">
                  {isVi ? viSection(section) : section} · {isVi ? "Ô trống" : "Empty cells"}
                </h2>
                {rows(fields)}
              </section>
            ))}
          </fieldset>
          <aside className="sticky top-16 z-10 order-first min-w-0 self-start lg:order-last">
            <div className="max-h-[35vh] overflow-auto rounded border border-slate-200 bg-white p-4 lg:max-h-[calc(100vh-5rem)]">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{isVi ? "Nguồn" : "Source"}</h2>
              <EvidencePanel field={activeField} sources={view.sources} isVi={isVi} />
            </div>
          </aside>
        </div>
      )}

      {view && canApprove && (
        <div className="sticky bottom-0 z-20 mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 py-3">
          <span className="text-sm text-slate-600" aria-live="polite">
            {isVi ? `${selectedCount} ô đã chọn` : `${selectedCount} selected cells`}
          </span>
          <button
            type="button"
            disabled={saving || drafting || finalizing || !hasEdits}
            onKeyDown={preventEnter}
            onClick={approve}
            className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? (isVi ? "Đang duyệt…" : "Approving…") : (isVi ? "Duyệt các ô đã chọn" : "Approve selected cells")}
          </button>
          {currentSubmission && (
            <button
              type="button"
              id="registry-finalize-dossier"
              disabled={finalizing || webApproved || !finalizeReady}
              title={!webApproved && !finalizeReady ? dc.approveDossierHint : undefined}
              onKeyDown={preventEnter}
              onClick={() => void finalizeDossier()}
              className="rounded bg-teal-700 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {webApproved
                ? dc.dossierApprovedBtn
                : finalizing
                  ? dc.approveDossierBusy
                  : dc.approveDossierBtn}
            </button>
          )}
          {webApproved && (
            <ViewCrfLink
              caseId={caseId}
              language={language}
              className="rounded border border-teal-700 px-4 py-1.5 text-sm font-semibold text-teal-800 hover:bg-teal-50"
            />
          )}
        </div>
      )}
    </main>
  );
}
