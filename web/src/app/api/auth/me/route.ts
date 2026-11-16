import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionFromToken } from "@/lib/auth";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return NextResponse.json(
      { user: null },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const session = await getSessionFromToken(rawToken);
    return NextResponse.json(
      { user: session?.user ?? null },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[Lupiva Auth] Failed to resolve current session:", error);
    return NextResponse.json(
      { user: null },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  }
}
