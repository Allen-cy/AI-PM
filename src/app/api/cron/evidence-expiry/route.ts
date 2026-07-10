import { timingSafeEqual } from "node:crypto";
import { getAuthSupabase } from "@/features/auth/server";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !token) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  if (!authorized(request)) return Response.json({ error: "CRON_UNAUTHORIZED", request_id: requestId }, { status: 401, headers });
  const { data, error } = await getAuthSupabase().rpc("process_expired_lifecycle_evidence_tx", { p_now: new Date().toISOString() });
  if (error) return Response.json({ error: "EVIDENCE_EXPIRY_JOB_FAILED", detail: error.message, request_id: requestId }, { status: 503, headers });
  return Response.json({ status: "succeeded", result: data, request_id: requestId }, { status: 200, headers });
}

