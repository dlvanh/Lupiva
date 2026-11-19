/**
 * Vietnamese mobile phone validation and E.164 normalization (`+84xxxxxxxxx`).
 * Accepts `0xxxxxxxxx`, `84xxxxxxxxx`, `+84xxxxxxxxx`, and `+84 (0) xxxxxxxxx`
 * with common separators (spaces, dots, hyphens) so registration and login
 * always compute identical blind indexes.
 */
const VN_MOBILE_DIGITS_REGEX = /^(?:0|\+?84(?:0)?)((?:3|5|7|8|9)\d{8})$/;

export function normalizeVietnamPhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s().-]/g, "");
  if (!cleaned) return null;
  const match = VN_MOBILE_DIGITS_REGEX.exec(cleaned);
  return match ? `+84${match[1]}` : null;
}

export function isValidVietnamPhone(raw: string): boolean {
  return normalizeVietnamPhone(raw) !== null;
}
