import { timingSafeEqual } from "node:crypto";
import { getAuthSupabase } from "@/features/auth/server";

export const runtime = "nodejs";
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET || ""; const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(secret); const right = Buffer.from(token); return Boolean(secret && token && left.length === right.length && timingSafeEqual(left, right));
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  if (!authorized(request)) return Response.json({ error: "CRON_UNAUTHORIZED", request_id: requestId }, { status: 401, headers });
  const supabase = getAuthSupabase(); const organizations = await supabase.from("organizations").select("id").eq("status", "active");
  if (organizations.error) return Response.json({ error: "OPERATING_CALENDAR_ORG_LOAD_FAILED", detail: organizations.error.message, request_id: requestId }, { status: 503, headers });
  const businessDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const results = [];
  for (const organization of organizations.data ?? []) {
    const result = await supabase.rpc("materialize_business_operating_calendar_tx", { p_org_id: organization.id, p_business_date: businessDate, p_data_class: "production", p_event_key: null, p_event_source_id: "" });
    results.push({ org_id: organization.id, result: result.data, error: result.error?.message || null });
  }
  const failed = results.filter(item => item.error);
  return Response.json({ status: failed.length ? "partial" : "succeeded", business_date: businessDate, results, request_id: requestId }, { status: failed.length ? 207 : 200, headers });
}

