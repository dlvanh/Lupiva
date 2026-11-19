import { after, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { AuthError, extractClientIp, extractUserAgent, requireAuth, verifySameOrigin } from "@/lib/auth";
import { startSubmissionPipeline } from "@/lib/intakeOrchestrator";
import { UploadError, assertSendable } from "@/lib/submissionUploads";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/**
 * Hand the stored images to the OCR/CRF backend. The work runs after the
 * response; the caller only learns that processing started.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  try {
    const user = await requireAuth(["specialist", "patient"]);
    const { id } = await params;
    await assertSendable({ user, submissionId: id });
    after(async () => {
      try {
        await startSubmissionPipeline(id);
      } catch (error) {
        console.error("[Lupiva Pipeline] Hand-off failed:", error);
      }
    });
    await writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: "submission.sent_to_pipeline",
      targetType: "crf_submission",
      targetId: id,
      ipAddress: extractClientIp(request.headers),
      userAgent: extractUserAgent(request.headers),
      metadata: {},
    });
    return NextResponse.json({ status: "processing" }, { status: 202, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AuthError || error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("[Lupiva Pipeline] Failed to start:", error);
    return NextResponse.json({ error: "Không gửi được hồ sơ." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
