import { NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import { syncAdminPipelineQueue } from "@/lib/adminService";
import {
  extractClientIp,
  extractUserAgent,
  requireAuth,
  verifySameOrigin,
} from "@/lib/auth";

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
    const result = await syncAdminPipelineQueue(
      { id: actor.id, role: actor.role, name: actor.name },
      {
        ipAddress: extractClientIp(request.headers),
        userAgent: extractUserAgent(request.headers),
      }
    );

    return NextResponse.json(result, {
      status: 200,
      headers: ADMIN_NO_STORE_HEADERS,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to synchronize OCR pipeline queue.");
  }
}
