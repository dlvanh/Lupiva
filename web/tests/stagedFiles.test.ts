import { describe, expect, it } from "vitest";
import { loadIntoMemory, stagedBlockReason } from "@/lib/stagedFiles";

const file = (status?: "loading" | "ready" | "error") => ({ id: "x", name: "a.jpg", url: null, isImage: true, status });

describe("stagedBlockReason", () => {
  it("blocks sending while any image is still loading", () => {
    expect(stagedBlockReason([file("ready"), file("loading")])).toBe("loading");
  });

  it("blocks sending when an image could not be read", () => {
    expect(stagedBlockReason([file("ready"), file("error")])).toBe("error");
  });

  it("allows sending when every image is ready (or has no status, e.g. PDFs)", () => {
    expect(stagedBlockReason([file("ready"), file(undefined)])).toBeNull();
    expect(stagedBlockReason([])).toBeNull();
  });
});

describe("loadIntoMemory", () => {
  it("reads the bytes now and returns an object URL backed by that copy", async () => {
    const source = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const url = await loadIntoMemory(source, "image/jpeg");
    const copy = await (await fetch(url)).arrayBuffer();
    expect([...new Uint8Array(copy)]).toEqual([1, 2, 3]);
    URL.revokeObjectURL(url);
  });

  it("rejects an empty file (nothing was read)", async () => {
    await expect(loadIntoMemory(new File([], "empty.jpg", { type: "image/jpeg" }), "image/jpeg")).rejects.toThrow();
  });
});
