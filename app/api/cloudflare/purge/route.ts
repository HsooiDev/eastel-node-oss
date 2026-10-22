import type { NextRequest } from "next/server";
import { purgeCache } from "@/lib/cloudflare";
import { getSessionCookie } from "@/lib/cookies";
import { validateAdminSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const sessionId = await getSessionCookie();
  if (!sessionId) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });

  const session = await validateAdminSession(sessionId);
  if (!session) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const urls = body.urls as string[] | undefined;
    const result = await purgeCache(urls);
    return NextResponse.json({ status: "success", result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Cache purge failed";
    return NextResponse.json({ status: "error", message: msg }, { status: 500 });
  }
}
