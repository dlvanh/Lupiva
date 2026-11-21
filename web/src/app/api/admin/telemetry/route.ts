import { NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import { getAdminTelemetry } from "@/lib/adminService";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth(["admin"]);
    const telemetry = await getAdminTelemetry();
    return NextResponse.json(telemetry, {
      status: 200,
      headers: ADMIN_NO_STORE_HEADERS,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to collect system telemetry.");
  }
}
