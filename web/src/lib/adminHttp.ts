import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AdminError } from "@/lib/adminService";
import { AuthError } from "@/lib/auth";
import { CryptoConfigurationError } from "@/lib/crypto";

export const ADMIN_NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function adminErrorResponse(error: unknown, fallbackMessage: string): NextResponse {
  if (error instanceof AuthError || error instanceof AdminError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Invalid request parameters." },
      { status: 400, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  if (error instanceof CryptoConfigurationError) {
    return NextResponse.json(
      { error: "Server encryption configuration is incomplete." },
      { status: 500, headers: ADMIN_NO_STORE_HEADERS }
    );
  }
  console.error("[Lupiva Admin]", error);
  return NextResponse.json(
    { error: fallbackMessage },
    { status: 500, headers: ADMIN_NO_STORE_HEADERS }
  );
}
