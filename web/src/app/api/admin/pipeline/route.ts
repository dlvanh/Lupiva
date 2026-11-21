import { NextResponse } from "next/server";
import { ADMIN_NO_STORE_HEADERS, adminErrorResponse } from "@/lib/adminHttp";
import { adminPipelineQuerySchema, listAdminPipelineQueue } from "@/lib/adminService";
import { requireAuth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await requireAuth(["admin"]);
    const url = new URL(request.url);
    const parsed = adminPipelineQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid pipeline queue query." },
        { status: 400, headers: ADMIN_NO_STORE_HEADERS }
      );
    }

    const result = await listAdminPipelineQueue(parsed.data);
    return NextResponse.json(result, {
      status: 200,
      headers: ADMIN_NO_STORE_HEADERS,
    });
  } catch (error) {
    return adminErrorResponse(error, "Unable to load OCR pipeline queue.");
  }
}
