import { requireAuthenticatedApiUser } from "@/features/auth/server";

export const runtime = "nodejs";

async function legacyResponse() {
  const user = await requireAuthenticatedApiUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({
    error: "PMO_LEGACY_ENDPOINT_RETIRED",
    detail: "原PMO展示接口已停用，请使用带业务上下文的 /api/pmo/control-center。",
    replacement: "/api/pmo/control-center",
  }, { status: 410, headers: { "Cache-Control": "no-store", Link: "</api/pmo/control-center>; rel=successor-version" } });
}

export async function GET() { return legacyResponse(); }
export async function POST() { return legacyResponse(); }
