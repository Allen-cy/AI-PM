import { timingSafeEqual } from "node:crypto";
import { getAuthSupabase } from "@/features/auth/server";
import { getOrganizationFeishuConfig } from "@/features/feishu/user-config";
import { FEISHU_RECONCILE_DOMAINS, buildReconcileIdempotencyKey } from "@/features/feishu/reconcile-contract";
import { FeishuReconcileError, runFeishuReconcile } from "@/features/feishu/reconcile-service";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const left = Buffer.from(secret);
  const right = Buffer.from(token);
  return Boolean(secret && token && left.length === right.length && timingSafeEqual(left, right));
}

function shanghaiHour(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:00+08:00`;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  if (!authorized(request)) return Response.json({ status: "failed", error: "CRON_UNAUTHORIZED", request_id: requestId }, { status: 401, headers });
  const supabase = getAuthSupabase();
  const organizations = await supabase.from("organizations").select("id").eq("status", "active");
  if (organizations.error) {
    return Response.json({ status: "failed", error: "ORGANIZATION_LOAD_FAILED", detail: organizations.error.message, request_id: requestId }, { status: 503, headers });
  }
  const checkpoint = shanghaiHour();
  const results: Array<Record<string, unknown>> = [];
  for (const organization of organizations.data ?? []) {
    const organizationRequestId = `${requestId}:${organization.id}`;
    try {
      const effective = await getOrganizationFeishuConfig(organization.id);
      const config = effective.config;
      if (!config) throw new FeishuReconcileError(effective.setupHint || "组织共享飞书台账未配置。", "ORGANIZATION_FEISHU_NOT_CONFIGURED", 503);
      const idempotencyKey = await buildReconcileIdempotencyKey({
        orgId: organization.id,
        dataClass: "production",
        sourceContainerId: config.baseToken,
        domains: [...FEISHU_RECONCILE_DOMAINS],
        sourceCheckpoint: checkpoint,
      });
      const result = await runFeishuReconcile({
        config,
        supabase,
        orgId: organization.id,
        dataClass: "production",
        sourceScope: "organization",
        sourceUserId: null,
        triggerType: "cron",
        domains: [...FEISHU_RECONCILE_DOMAINS],
        idempotencyKey,
        expectedVersion: 0,
        actorUserId: null,
        requestId: organizationRequestId,
        sourceCheckpoint: checkpoint,
      });
      results.push({ org_id: organization.id, status: result.status, batch_id: result.batch_id, replayed: result.replayed, counts: result.counts });
    } catch (error) {
      const known = error instanceof FeishuReconcileError ? error : new FeishuReconcileError("飞书定时对账失败。", "RECONCILE_FAILED");
      results.push({ org_id: organization.id, status: "failed", error: known.code, detail: known.message });
    }
  }
  const failed = results.filter(result => result.status === "failed");
  return Response.json({
    status: failed.length === 0 ? "succeeded" : failed.length === results.length ? "failed" : "partial",
    request_id: requestId,
    context: { subject_scope: "organization", data_class: "production" },
    source: { type: "feishu", label: "飞书多维表格", mirror: "Supabase受治理镜像" },
    data_class: "production",
    generated_at: new Date().toISOString(),
    warnings: failed.length ? [`${failed.length} 个组织同步失败。`] : [],
    data: { checkpoint, results },
  }, { status: failed.length ? 207 : 200, headers });
}

export const POST = GET;
