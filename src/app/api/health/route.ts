import { connection, NextResponse } from "next/server";
import { checkDbHealth } from "@/db";

export async function GET() {
  await connection();

  try {
    await checkDbHealth();
    return NextResponse.json(
      {
        ok: true,
        database: "connected",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
