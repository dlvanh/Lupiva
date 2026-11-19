import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { AuthError, extractClientIp, extractUserAgent, requireAuth, verifySameOrigin } from "@/lib/auth";
import { markSubmissionOpened } from "@/lib/submissionOpened";
import { UploadError } from "@/lib/submissionUploads";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/** A specialist opened this submission; the first open moves it out of "Hồ sơ mới". */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  try {
    const user = await requireAuth(["specialist"]);
    const { id } = await params;
    const result = await markSubmissionOpened({ user, submissionId: id });
    if (result.changed) {
      await writeAuditLog({
        actorUserId: user.id,
        actorRole: user.role,
        action: "submission.opened",
        targetType: "crf_submission",
        targetId: id,
        ipAddress: extractClientIp(request.headers),
        userAgent: extractUserAgent(request.headers),
        metadata: {},
      });
    }
    return NextResponse.json(result, { status: 200, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AuthError || error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("[Lupiva] Failed to mark submission opened:", error);
    return NextResponse.json({ error: "Không ghi nhận được." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
