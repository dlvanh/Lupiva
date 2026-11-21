import { NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import { adminUpdateAccountSchema, updateAdminAccount } from "@/lib/adminService";
import {
  AuthError,
  extractClientIp,
  extractUserAgent,
  getSessionUser,
  verifySameOrigin,
} from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(
      { error: origin.reason || "Cross-origin request refused." },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  try {
    const session = await getSessionUser();
    if (!session) {
      throw new AuthError(401, "Authentication required.");
    }
    if (session.user.role !== "admin") {
      throw new AuthError(403, "Insufficient role privileges.");
    }
    const actor = session.user;
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = adminUpdateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid account update." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const updated = await updateAdminAccount(
      id,
      parsed.data,
      {
        id: actor.id,
        role: actor.role,
        name: actor.name,
        sessionId: session.sessionId,
      },
      {
        ipAddress: extractClientIp(request.headers),
        userAgent: extractUserAgent(request.headers),
      }
    );

    return NextResponse.json(updated, {
      status: 200,
      headers: ADMIN_NO_STORE_HEADERS,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to update user account.");
  }
}
