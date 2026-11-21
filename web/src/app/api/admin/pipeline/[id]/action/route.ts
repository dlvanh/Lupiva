import { after, NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import {
  adminPipelineActionSchema,
  performAdminPipelineAction,
} from "@/lib/adminService";
import {
  extractClientIp,
  extractUserAgent,
  requireAuth,
  verifySameOrigin,
} from "@/lib/auth";
import { startSubmissionPipeline } from "@/lib/intakeOrchestrator";

export async function POST(
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
    const actor = await requireAuth(["admin"]);
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

    const parsed = adminPipelineActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid pipeline action." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const result = await performAdminPipelineAction(
      id,
      parsed.data,
      { id: actor.id, role: actor.role, name: actor.name },
      {
        ipAddress: extractClientIp(request.headers),
        userAgent: extractUserAgent(request.headers),
      },
      {
        schedulePipeline: (submissionId) => {
          after(async () => {
            try {
              await startSubmissionPipeline(submissionId);
            } catch (err) {
              console.error("[Lupiva Admin] Pipeline retry hand-off failed:", err);
            }
          });
        },
      }
    );

    const status = parsed.data.action === "retry" ? 202 : 200;
    return NextResponse.json(result, {
      status,
      headers: ADMIN_NO_STORE_HEADERS,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to execute pipeline queue action.");
  }
}
