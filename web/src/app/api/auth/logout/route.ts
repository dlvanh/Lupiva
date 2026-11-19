import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { writeAuditLog } from "@/lib/audit";
import {
  clearSessionCookie,
  extractClientIp,
  extractUserAgent,
  getSessionFromToken,
  revokeSessionByToken,
  verifySameOrigin,
} from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function POST(request: Request) {
  const originCheck = verifySameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { error: originCheck.reason || "Forbidden cross-origin request." },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  const db = getDb();
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  const ipAddress = extractClientIp(request.headers);
  const userAgent = extractUserAgent(request.headers);

  let actorUserId: string | null = null;
  let actorRole: string | null = null;
  let sessionId: string | null = null;

  if (rawToken) {
    const existing = await getSessionFromToken(rawToken, db).catch(() => null);
    if (existing) {
      actorUserId = existing.user.id;
      actorRole = existing.user.role;
      sessionId = existing.sessionId;
    }
    await revokeSessionByToken(rawToken, db);
  }

  await clearSessionCookie();

  await writeAuditLog(
    {
      actorUserId,
      actorRole,
      action: "auth.logout",
      targetType: "session",
      targetId: sessionId,
      ipAddress,
      userAgent,
      metadata: { hadSession: Boolean(rawToken) },
    },
    db
  );

  return NextResponse.json({ ok: true }, { status: 200, headers: NO_STORE_HEADERS });
}
