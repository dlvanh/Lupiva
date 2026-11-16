import { NextResponse } from "next/server";
import { z } from "zod";
import type { SleCrfPatientRecord } from "@/data/crfData";
import { writeAuditLog } from "@/lib/audit";
import {
  AuthError,
  extractClientIp,
  extractUserAgent,
  requireAuth,
  verifySameOrigin,
} from "@/lib/auth";
import { CryptoConfigurationError } from "@/lib/crypto";
import { updateSubmissionRecord } from "@/lib/submissionsService";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const patchSubmissionSchema = z.object({
  record: z.custom<SleCrfPatientRecord>(
    (val) =>
      typeof val === "object" &&
      val !== null &&
      Array.isArray((val as SleCrfPatientRecord).ocrFields) &&
      Array.isArray((val as SleCrfPatientRecord).antibodyBlots) &&
      Array.isArray((val as SleCrfPatientRecord).eularAcrCriteria) &&
      Array.isArray((val as SleCrfPatientRecord).sledai2kCriteria),
    "Invalid e-CRF record payload."
  ),
  utcOffsetMinutes: z.coerce
    .number()
    .int()
    .min(-840)
    .max(840)
    .optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const originCheck = verifySameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { error: originCheck.reason || "Forbidden cross-origin request." },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const user = await requireAuth(["specialist"]);
    const { id } = await params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = patchSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid e-CRF update payload." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const updated = await updateSubmissionRecord({
      user,
      idOrKey: id,
      updatedRecord: parsed.data.record,
      utcOffsetMinutes: parsed.data.utcOffsetMinutes,
    });

    if (!updated) {
      return NextResponse.json(
        { error: "CRF submission not found." },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    await writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: "submission.updated",
      targetType: "crf_submission",
      targetId: updated.dbSubmissionId,
      ipAddress: extractClientIp(request.headers),
      userAgent: extractUserAgent(request.headers),
      metadata: {
        status: updated.record.submissionStatus ?? "pending_doctor_review",
      },
    });

    return NextResponse.json(updated, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof CryptoConfigurationError) {
      return NextResponse.json(
        { error: "Server encryption keys are not configured." },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
    console.error("[Lupiva Submissions] Failed to update submission:", error);
    return NextResponse.json(
      { error: "Unable to update CRF submission in the clinical database." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
