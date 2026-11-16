import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import {
  AuthError,
  extractClientIp,
  extractUserAgent,
  requireAuth,
  verifySameOrigin,
} from "@/lib/auth";
import { CryptoConfigurationError } from "@/lib/crypto";
import { submissionQuerySchema } from "@/lib/submissionFilters";
import {
  createPatientSubmission,
  createSubmissionSchema,
  toPatientStatus,
  querySubmissions,
} from "@/lib/submissionsService";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  try {
    const user = await requireAuth(["specialist", "patient"]);
    const url = new URL(request.url);
    const rawParams = Object.fromEntries(url.searchParams.entries());
    const parsed = submissionQuerySchema.safeParse(rawParams);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid filter query parameters." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await querySubmissions({
      user,
      filters: parsed.data,
    });

    // Patients see only the status of their own submissions, never CRF data.
    const body =
      user.role === "patient"
        ? {
            items: result.items.map(toPatientStatus),
            pagination: result.pagination,
            roleScope: result.roleScope,
          }
        : result;

    return NextResponse.json(body, {
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
    console.error("[Lupiva Submissions] Failed to query submissions:", error);
    return NextResponse.json(
      { error: "Unable to load patient submissions from the clinical database." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  const originCheck = verifySameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json(
      { error: originCheck.reason || "Forbidden cross-origin request." },
      { status: 403, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const user = await requireAuth(["specialist", "patient"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsed = createSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid submission payload." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const created = await createPatientSubmission({
      user,
      input: parsed.data,
    });

    await writeAuditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: "submission.created",
      targetType: "crf_submission",
      targetId: created.dbSubmissionId,
      ipAddress: extractClientIp(request.headers),
      userAgent: extractUserAgent(request.headers),
      metadata: {
        fileCount: parsed.data.files.length,
        status: "pending_doctor_review",
      },
    });

    return NextResponse.json(user.role === "patient" ? toPatientStatus(created) : created, {
      status: 201,
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
    console.error("[Lupiva Submissions] Failed to create submission:", error);
    return NextResponse.json(
      { error: "Unable to submit dossier to the clinical database." },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
