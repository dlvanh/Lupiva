import type { UploadedDocFile } from "@/data/crfData";

/**
 * Images picked on a phone may still be downloading from the cloud or being
 * written by the camera app; reading them only at submit time can fail without
 * a trace. Each image is read into memory as soon as it is chosen, and the
 * form refuses to send while any image is loading or unreadable.
 */
export function stagedBlockReason(files: readonly Pick<UploadedDocFile, "status">[]): "loading" | "error" | null {
  if (files.some((file) => file.status === "loading")) return "loading";
  if (files.some((file) => file.status === "error")) return "error";
  return null;
}

/** Reads the whole file now; the returned object URL points at that in-memory copy. */
export async function loadIntoMemory(file: File, mimeType: string): Promise<string> {
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error("empty file");
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}
