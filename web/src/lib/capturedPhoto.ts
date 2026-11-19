/**
 * Phones name every camera capture alike (iOS: "image.jpg"), and the upload
 * list rejects repeated names, so each capture gets its own name. Bytes and
 * type are unchanged.
 */
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function renameCapturedPhoto(file: File, stamp: number = Date.now()): File {
  const extension = EXTENSIONS[file.type] ?? file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "jpg";
  return new File([file], `chup-anh-${stamp}.${extension}`, { type: file.type, lastModified: file.lastModified });
}
