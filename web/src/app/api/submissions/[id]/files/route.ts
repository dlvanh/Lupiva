import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { AuthError, extractClientIp, extractUserAgent, requireAuth, verifySameOrigin } from "@/lib/auth";
import { MAX_IMAGE_BYTES } from "@/lib/documentVault";
import { UploadError, storeSubmissionImage } from "@/lib/submissionUploads";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

/** POST raw image bytes for one listed document: /api/submissions/<id>/files?documentId=<uuid> */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = verifySameOrigin(request);
  if (!origin.ok) {
    return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403, headers: NO_STORE_HEADERS });
  }
  try {
    const user = await requireAuth(["specialist", "patient"]);
    const { id } = await params;
    const documentId = new URL(request.url).searchParams.get("documentId") ?? "";
    if (Number(request.headers.get("content-length") ?? "0") > MAX_IMAGE_BYTES) {
      throw new UploadError("Mỗi ảnh tối đa 20 MB.", 413);
    }
    const bytes = Buffer.from(await request.arrayBuffer());
    const stored = await storeSubmissionImage({ user, submissionId: id, documentId, bytes });
    await writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: "submission.image_stored",
      targetType: "uploaded_document",
      targetId: stored.documentId,
      ipAddress: extractClientIp(request.headers),
      userAgent: extractUserAgent(request.headers),
      metadata: { submissionId: id, sizeBytes: bytes.length },
    });
    return NextResponse.json({ documentId: stored.documentId, stored: true }, { status: 201, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof AuthError || error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    console.error("[Lupiva Uploads] Failed to store image:", error);
    return NextResponse.json({ error: "Không lưu được ảnh." }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
