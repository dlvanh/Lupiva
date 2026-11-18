import { describe, expect, it } from "vitest";
import { renameCapturedPhoto } from "@/lib/capturedPhoto";

describe("renameCapturedPhoto", () => {
  it("gives every camera capture a distinct name (iOS names them all image.jpg)", () => {
    const a = renameCapturedPhoto(new File(["a"], "image.jpg", { type: "image/jpeg" }), 1);
    const b = renameCapturedPhoto(new File(["b"], "image.jpg", { type: "image/jpeg" }), 2);
    expect(a.name).not.toBe(b.name);
    expect(a.name).toMatch(/^chup-anh-.*\.jpg$/);
    expect(a.type).toBe("image/jpeg");
  });

  it("keeps the bytes and derives the extension from the type", async () => {
    const png = renameCapturedPhoto(new File(["xyz"], "photo", { type: "image/png" }), 3);
    expect(png.name.endsWith(".png")).toBe(true);
    expect(await png.text()).toBe("xyz");
  });
});
