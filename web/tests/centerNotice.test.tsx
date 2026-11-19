import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CenterNotice, type CenterNoticeProps } from "@/components/CenterNotice";
import { LupivaProvider, useLupiva } from "@/context/LupivaContext";

const { effects, dialogRef } = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | undefined>,
  dialogRef: { current: null as HTMLElement | null },
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof React>(),
  useId: () => "notice-test",
  useRef: () => dialogRef,
  useEffect: (effect: (typeof effects)[number]) => effects.push(effect),
}));

function notice(overrides: Partial<CenterNoticeProps> = {}) {
  return {
    open: true,
    tone: "success",
    title: "Nộp hồ sơ thành công!",
    children: "Cảm ơn bạn đã nộp hồ sơ.",
    actions: [
      { label: "Về trang chủ", onClick: vi.fn(), variant: "secondary" },
      { label: "Xem trạng thái", onClick: vi.fn(), variant: "primary" },
    ],
    onClose: vi.fn(),
    ...overrides,
  } satisfies CenterNoticeProps;
}

afterEach(() => {
  effects.length = 0;
  dialogRef.current = null;
  vi.unstubAllGlobals();
});

describe("CenterNotice", () => {
  it("renders nothing when closed", () => {
    expect(renderToStaticMarkup(<CenterNotice {...notice({ open: false })} />)).toBe("");
  });

  it("shows the title, body and two actions", () => {
    const markup = renderToStaticMarkup(<CenterNotice {...notice()} />);
    expect(markup).toContain('role="alertdialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("Nộp hồ sơ thành công!");
    expect(markup).toContain("Cảm ơn bạn đã nộp hồ sơ.");
    expect(markup.match(/<button\b/g)).toHaveLength(2);
  });

  it("closes on Escape and backdrop clicks and restores focus", () => {
    class FocusTarget {
      isConnected = true;
      focus = vi.fn();
    }

    const previous = new FocusTarget();
    const secondary = new FocusTarget();
    const primary = new FocusTarget();
    const dialog = {
      querySelector: vi.fn(() => primary),
      querySelectorAll: vi.fn(() => [secondary, primary]),
      contains: (target: unknown) => target === primary || target === secondary,
      focus: vi.fn(),
    };
    dialogRef.current = dialog as unknown as HTMLElement;
    const document = Object.assign(new EventTarget(), { activeElement: previous });
    vi.stubGlobal("document", document);
    vi.stubGlobal("HTMLElement", FocusTarget);

    const props = notice();
    const backdrop = CenterNotice(props) as ReactElement<{
      onClick: (event: Pick<React.MouseEvent, "target" | "currentTarget">) => void;
    }>;
    const cleanups = effects.map((effect) => effect());
    expect(primary.focus).toHaveBeenCalledOnce();
    document.activeElement = primary;

    document.dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const backdropElement = {} as EventTarget & HTMLDivElement;
    backdrop.props.onClick({ target: backdropElement, currentTarget: backdropElement });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    backdrop.props.onClick({ target: {} as EventTarget, currentTarget: backdropElement });
    expect(props.onClose).toHaveBeenCalledTimes(2);

    cleanups.forEach((cleanup) => cleanup?.());
    expect(previous.focus).toHaveBeenCalledOnce();
  });

  it("defaults to Vietnamese with empty local storage", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", { getItem: () => null });

    function CurrentLanguage() {
      return <output>{useLupiva().language}</output>;
    }

    expect(renderToStaticMarkup(<LupivaProvider><CurrentLanguage /></LupivaProvider>))
      .toBe("<output>vi</output>");
  });
});
