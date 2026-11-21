import { NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import {
  adminAccountsQuerySchema,
  adminCreateAccountSchema,
  createAdminAccount,
  listAdminAccounts,
} from "@/lib/adminService";
import {
  extractClientIp,
  extractUserAgent,
  requireAuth,
  verifySameOrigin,
} from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAuth(["admin"]);
    const url = new URL(request.url);
    const parsed = adminAccountsQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid account query." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }
    const result = await listAdminAccounts(parsed.data);
    return NextResponse.json(result, { status: 200, headers: ADMIN_NO_STORE_HEADERS });
  } catch (error) {
    return adminErrorResponse(error, "Unable to load user accounts.");
  }
}

export async function POST(request: Request) {
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json(
      { error: origin.reason || "Cross-origin request refused." },
      { status: 403, headers: ADMIN_NO_STORE_HEADERS }
    );
  }

  try {
    const actor = await requireAuth(["admin"]);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const parsed = adminCreateAccountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid account details." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const account = await createAdminAccount(
      parsed.data,
      { id: actor.id, role: actor.role, name: actor.name },
      {
        ipAddress: extractClientIp(request.headers),
        userAgent: extractUserAgent(request.headers),
      }
    );

    return NextResponse.json(
      { account },
      { status: 201, headers: ADMIN_NO_STORE_HEADERS }
    );
  } catch (error) {
    return adminErrorResponse(error, "Unable to create user account.");
  }
}
