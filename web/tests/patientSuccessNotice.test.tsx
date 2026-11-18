import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CenterNotice, type CenterNoticeProps } from "@/components/CenterNotice";
import { PatientUploadView } from "@/components/upload/PatientUploadView";
import { TRANSLATIONS, type Language } from "@/data/translations";

const { context, hooks, push } = vi.hoisted(() => ({
  context: {
    language: "vi" as Language,
    currentUser: { role: "patient" as "patient" | "specialist", name: "Patient" },
    authLoading: false,
    submitPatientUpload: vi.fn(),
  },
  hooks: { values: [] as unknown[], index: 0 },
  push: vi.fn(),
}));

vi.mock("@/context/LupivaContext", () => ({
  useLupiva: () => ({ ...context, t: TRANSLATIONS[context.language] }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Retain upload form state across renders so its handlers can run in Vitest's Node environment.
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === "function" ? value(hooks.values[index]) : value;
    }];
  },
}));

type Element = ReactElement<{ children?: ReactNode; id?: string; open?: boolean; tabIndex?: number }>;

function findElement(tree: ReactNode, matches: (element: Element) => boolean): Element | undefined {
  for (const child of React.Children.toArray(tree)) {
    if (!React.isValidElement<Element["props"]>(child)) continue;
    if (matches(child)) return child;
    const match = findElement(child.props.children, matches);
    if (match) return match;
  }
}

function renderUpload() {
  hooks.index = 0;
  return PatientUploadView();
}

async function submitFiles(result: { id: string; filesUploaded?: boolean } | null) {
  context.submitPatientUpload.mockResolvedValueOnce(result);
  const input = findElement(renderUpload(), (element) => element.props.id === "upload-file-input") as
    ReactElement<{ onChange: React.ChangeEventHandler<HTMLInputElement> }>;
  const files = ["result1.pdf", "result2.pdf"].map((name) =>
    new File(["sample"], name, { type: "application/pdf" })
  );
  input.props.onChange({ target: { files, value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>);

  const form = findElement(renderUpload(), (element) => element.type === "form") as
    ReactElement<{ onSubmit: (event: React.FormEvent) => Promise<void> }>;
  await form.props.onSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent);
  expect(context.submitPatientUpload).toHaveBeenCalledWith(
    context.currentUser.role === "patient" ? "Patient" : "",
    files.map((file) => expect.objectContaining({ name: file.name })),
  );

  const notice = findElement(renderUpload(), (element) => element.type === CenterNotice && element.props.open === true);
  return notice as ReactElement<CenterNoticeProps> | undefined;
}

async function noticeMarkup(result: { id: string; filesUploaded?: boolean } | null) {
  const notice = await submitFiles(result);
  return notice ? renderToStaticMarkup(notice) : "";
}

beforeEach(() => {
  context.language = "vi";
  context.currentUser.role = "patient";
  context.submitPatientUpload.mockReset();
  hooks.values.length = 0;
  push.mockClear();
});

describe("patient upload confirmation", () => {
  it("shows a Vietnamese success notice with the submission code and two files", async () => {
    const markup = await noticeMarkup({ id: "abc" });
    const copy = TRANSLATIONS.vi.patientPortal;
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain(copy.successTitle);
    expect(markup).toContain(copy.successBody(copy.contactLead, copy.contactEmail));
    expect(markup).toContain("abc");
    expect(markup).toContain(">2</dd>");
  });

  it("shows no success notice when submission fails", async () => {
    expect(await noticeMarkup(null)).toBe("");
  });

  it("shows no success notice when the record was saved but file upload failed", async () => {
    expect(await noticeMarkup({ id: "abc", filesUploaded: false })).toBe("");
  });

  it("shows an English success notice when English is selected", async () => {
    context.language = "en";
    const markup = await noticeMarkup({ id: "abc" });
    expect(markup).toContain(TRANSLATIONS.en.patientPortal.successTitle);
  });

  it("shows no patient notice for a specialist upload", async () => {
    context.currentUser.role = "specialist";
    expect(await noticeMarkup({ id: "abc" })).toBe("");
  });

  it("closes the notice and switches to the status tab", async () => {
    const notice = await submitFiles({ id: "abc" });
    notice!.props.actions.find((action) => action.label === TRANSLATIONS.vi.patientPortal.successStatusBtn)!.onClick();
    const after = renderUpload();
    expect(findElement(after, (element) => element.type === CenterNotice)).toBeUndefined();
    expect(findElement(after, (element) => element.props?.id === "patient-panel-status")).toBeDefined();
    expect(findElement(after, (element) => element.props?.id === "patient-panel-submit")).toBeUndefined();
  });

  it("navigates home from the success notice", async () => {
    const notice = await submitFiles({ id: "abc" });
    notice!.props.actions.find((action) => action.label === TRANSLATIONS.vi.patientPortal.successHomeBtn)!.onClick();
    expect(push).toHaveBeenCalledWith("/");
  });
});
