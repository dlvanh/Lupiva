import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { user: { role: string } } }));

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { SpecialistGate } from "@/lib/pageGuards";

describe("doctor-only page guard", () => {
  beforeEach(() => {
    session.current = null;
  });

  it("sends signed-out visitors to login with the page to return to", async () => {
    await expect(SpecialistGate({ nextPath: "/registry", children: "page" })).rejects.toThrow(
      "REDIRECT /login?next=%2Fregistry",
    );
  });

  it("sends patients back to their upload and status page", async () => {
    session.current = { user: { role: "patient" } };
    await expect(SpecialistGate({ nextPath: "/crf", children: "page" })).rejects.toThrow("REDIRECT /upload");
  });

  it("renders the page for specialists", async () => {
    session.current = { user: { role: "specialist" } };
    await expect(SpecialistGate({ nextPath: "/crf", children: "page" })).resolves.toBeTruthy();
  });
});
