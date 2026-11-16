import { NextResponse } from "next/server";
import { AuthError, requireAuth, verifySameOrigin } from "@/lib/auth";
import { allowedPipelineCall, callPipeline, pipelinePath } from "@/lib/pipeline";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_BODY = 25 * 1024 * 1024;

type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context, method: "GET" | "POST") {
  try {
    if (method === "POST") {
      const origin = verifySameOrigin(request);
      if (!origin.ok) {
        return NextResponse.json({ error: "Cross-origin request refused." }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }
    const user = await requireAuth(["specialist", "patient"]);
    const path = pipelinePath((await context.params).path);
    if (!path || !allowedPipelineCall(method, path, user.role)) {
      return NextResponse.json({ error: "This backend call is not allowed." }, { status: 403, headers: NO_STORE_HEADERS });
    }
    let body: { json?: Record<string, unknown>; raw?: ArrayBuffer } | null = null;
    if (method === "POST") {
      const raw = await request.arrayBuffer();
      if (raw.byteLength > MAX_BODY) {
        return NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE_HEADERS });
      }
      if ((request.headers.get("content-type") ?? "").includes("application/json")) {
        const parsed = raw.byteLength ? JSON.parse(new TextDecoder().decode(raw)) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json({ error: "Expected a JSON object." }, { status: 400, headers: NO_STORE_HEADERS });
        }
        body = { json: parsed as Record<string, unknown> };
      } else {
        body = { raw };
      }
    }
    const result = await callPipeline(method, path, new URL(request.url).searchParams, body, user);
    return new NextResponse(result.body, {
      status: result.status,
      headers: { ...NO_STORE_HEADERS, "Content-Type": result.contentType },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE_HEADERS });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400, headers: NO_STORE_HEADERS });
    }
    return NextResponse.json({ error: "The CRF backend is unavailable." }, { status: 502, headers: NO_STORE_HEADERS });
  }
}

export async function GET(request: Request, context: Context) {
  return forward(request, context, "GET");
}

export async function POST(request: Request, context: Context) {
  return forward(request, context, "POST");
}
