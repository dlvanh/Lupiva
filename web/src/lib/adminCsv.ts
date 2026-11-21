export interface CsvAuditLogRow {
  createdAt: string;
  action: string;
  isSecurityAlert: boolean;
  actorRole: string | null;
  actorName: string | null;
  actorUserId: string | null;
  targetType: string;
  targetId: string | null;
  ipAddress: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR, LF)
 * including payloads with leading whitespace/control characters, and quotes
 * RFC 4180 CSV cells safely.
 */
export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const neutralized = /^[\s\u0000-\u001F]*[=+\-@]|^[\t\r\n]/.test(raw)
    ? `'${raw}`
    : raw;
  const escaped = neutralized.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function auditLogsToCsv(logs: CsvAuditLogRow[]): string {
  const header = [
    "Timestamp",
    "Action",
    "SecurityAlert",
    "ActorRole",
    "ActorName",
    "ActorUserId",
    "TargetType",
    "TargetId",
    "IpAddress",
    "Metadata",
  ]
    .map(sanitizeCsvCell)
    .join(",");

  const rows = logs.map((log) =>
    [
      log.createdAt,
      log.action,
      log.isSecurityAlert ? "YES" : "NO",
      log.actorRole ?? "system",
      log.actorName ?? "",
      log.actorUserId ?? "",
      log.targetType,
      log.targetId ?? "",
      log.ipAddress ?? "",
      JSON.stringify(log.metadata),
    ]
      .map(sanitizeCsvCell)
      .join(",")
  );

  return [header, ...rows].join("\r\n");
}
