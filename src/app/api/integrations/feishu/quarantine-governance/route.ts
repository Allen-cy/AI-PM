import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import {
  buildFeishuClassificationCsv,
  buildFeishuClassificationSummary,
  recommendFeishuDataClass,
  type FeishuQuarantineSourceRow,
} from "@/features/feishu/quarantine-governance";
import { validateDataClassificationDecision, type GovernedClassification } from "@/features/feishu/classification-writeback";
import { createDataClassificationDraft, listActiveDataClassificationDrafts } from "@/features/feishu/classification-writeback-repository";
import type { FeishuTableKey } from "@/features/feishu/config";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const DATA_CLASSES = new Set(["production", "sample", "test", "diagnostic", "unclassified"]);
const SUBJECT_SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

async function authorize(request: Request, requestId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, response: json({ status: "failed", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId) };
  const url = new URL(request.url);
  const role = text(url.searchParams.get("role") ?? url.searchParams.get("business_role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const dataClass = text(url.searchParams.get("data_class") || "production");
  if (role !== "pmo" || !orgId || !SUBJECT_SCOPES.has(subjectScope) || !subjectId || !DATA_CLASSES.has(dataClass)) {
    return { ok: false as const, response: json({ status: "failed", error: "PMO_ORGANIZATION_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId) };
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") {
    return { ok: false as const, response: json({ status: "failed", error: "ROLE_STORAGE_UNAVAILABLE", detail: assignments.warning, request_id: requestId }, 503, requestId) };
  }
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: role,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context || context.subjectScope !== "organization" || context.subjectId !== orgId) {
    return { ok: false as const, response: json({ status: "failed", error: "ORGANIZATION_PMO_CONTEXT_FORBIDDEN", request_id: requestId }, 403, requestId) };
  }
  return { ok: true as const, user, context, orgId, dataClass };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await authorize(request, requestId);
  if (!access.ok) return access.response;
  const url = new URL(request.url);
  const format = text(url.searchParams.get("format"));
  try {
    const result = await getAuthSupabase()
      .from("feishu_reconcile_quarantine")
      .select("id,domain,source_record_id,external_project_code,reason_code,reason_detail,status,occurrence_count,last_seen_at,source_payload", { count: "exact" })
      .eq("org_id", access.orgId)
      .eq("data_class", access.dataClass)
      .in("status", ["pending", "under_review"])
      .order("last_seen_at", { ascending: false })
      .range(0, 999);
    if (result.error) throw result.error;
    const items = (result.data ?? []).map(row => recommendFeishuDataClass(row as FeishuQuarantineSourceRow));
    const summary = buildFeishuClassificationSummary(items);
    if (format === "csv") {
      const filename = `feishu-data-classification-${access.dataClass}-${new Date().toISOString().slice(0, 10)}.csv`;
      return new Response(buildFeishuClassificationCsv(items), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        },
      });
    }
    const warnings: string[] = [];
    if (Number(result.count ?? 0) > items.length) warnings.push("隔离记录超过1000条，本页只返回最近1000条，请分批治理。");
    if (summary.byRecommendation.find(item => item.dataClass === "sample")?.count) {
      warnings.push("检测到带“样例来源”的记录；系统只建议归入样例空间，绝不会自动转为正式项目。");
    }
    const drafts = await listActiveDataClassificationDrafts(items.map(item => item.quarantineId));
    if (drafts.status === "not_configured") warnings.push("V6.6.6分类写回迁移尚未执行；当前仍可下载CSV治理。");
    else if (drafts.status !== "succeeded") warnings.push(`分类写回草稿暂时不可用：${drafts.warning}`);
    const draftsByQuarantine = new Map((drafts.status === "succeeded" ? drafts.data : []).map(draft => [draft.quarantineId, draft]));
    return json({
      status: "succeeded",
      request_id: requestId,
      context: {
        org_id: access.context.orgId,
        subject_scope: access.context.subjectScope,
        subject_id: access.context.subjectId,
        business_role: access.context.businessRole,
      },
      source: { type: "supabase", upstream: "feishu", table: "feishu_reconcile_quarantine" },
      data_class: access.dataClass,
      generated_at: new Date().toISOString(),
      warnings,
      data: { total: Number(result.count ?? items.length), summary, items: items.map(item => ({ ...item, classificationDraft: draftsByQuarantine.get(item.quarantineId) ?? null })) },
    }, 200, requestId);
  } catch (error) {
    return json({
      status: "failed",
      error: "FEISHU_QUARANTINE_GOVERNANCE_UNAVAILABLE",
      detail: error instanceof Error ? error.message : "unknown",
      request_id: requestId,
    }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-idempotency-key")?.trim().slice(0, 160) || crypto.randomUUID();
  const access = await authorize(request, requestId);
  if (!access.ok) return access.response;
  let body: Record<string, unknown>;
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体必须为对象。");
    body = value as Record<string, unknown>;
  } catch (error) {
    return json({ status: "failed", error: "INVALID_JSON", detail: error instanceof Error ? error.message : "请求体格式错误。", request_id: requestId }, 400, requestId);
  }
  const quarantineId = text(body.quarantine_id);
  if (!quarantineId) return json({ status: "failed", error: "QUARANTINE_ID_REQUIRED", detail: "必须选择一条待治理记录。", request_id: requestId }, 422, requestId);
  try {
    const found = await getAuthSupabase().from("feishu_reconcile_quarantine")
      .select("id,org_id,data_class,domain,source_record_id,occurrence_count,status,source_payload")
      .eq("id", quarantineId).eq("org_id", access.orgId).eq("data_class", access.dataClass)
      .in("status", ["pending", "under_review"]).maybeSingle();
    if (found.error) throw found.error;
    if (!found.data) return json({ status: "failed", error: "QUARANTINE_NOT_FOUND", detail: "记录不存在、已处理或不属于当前组织和数据空间。", request_id: requestId }, 404, requestId);
    const sourcePayload = found.data.source_payload && typeof found.data.source_payload === "object" && !Array.isArray(found.data.source_payload)
      ? found.data.source_payload as Record<string, unknown> : {};
    let decision;
    try {
      decision = validateDataClassificationDecision({
        targetDataClass: body.target_data_class,
        reason: body.reason,
        productionAcknowledged: body.production_acknowledged,
        sourcePayload,
      });
    } catch (error) {
      return json({ status: "failed", error: "CLASSIFICATION_DECISION_INVALID", detail: error instanceof Error ? error.message : "分类决定不合法。", request_id: requestId }, 422, requestId);
    }
    const idempotencyKey = request.headers.get("x-idempotency-key")?.trim().slice(0, 160)
      || `classification:${quarantineId}:${decision.targetDataClass}:${requestId}`;
    const created = await createDataClassificationDraft({
      quarantine: {
        id: String(found.data.id),
        orgId: String(found.data.org_id),
        domain: String(found.data.domain) as FeishuTableKey,
        sourceRecordId: String(found.data.source_record_id),
        occurrenceCount: Number(found.data.occurrence_count),
        sourcePayload,
      },
      targetDataClass: decision.targetDataClass as GovernedClassification,
      targetChineseValue: decision.targetChineseValue,
      reason: decision.reason,
      user: access.user,
      idempotencyKey,
      requestId,
    });
    if (created.status !== "succeeded") {
      const status = created.status === "not_configured" ? 503 : created.status === "forbidden" ? 403 : created.status === "conflict" ? 409 : 500;
      return json({ status: "failed", error: `CLASSIFICATION_DRAFT_${created.status.toUpperCase()}`, detail: created.warning, request_id: requestId }, status, requestId);
    }
    await writeOperationAudit({
      user: access.user,
      action: "feishu_data_classification_draft_create",
      resourceType: "feishu_data_classification_draft",
      resourceId: created.data.draft.id,
      status: "succeeded",
      severity: decision.targetDataClass === "production" ? "high" : "medium",
      summary: `创建飞书数据分类写回确认：${decision.targetChineseValue}`,
      detail: { quarantine_id: quarantineId, domain: found.data.domain, source_record_id: found.data.source_record_id, target_data_class: decision.targetDataClass, confirmation_id: created.data.confirmationId, duplicate: created.data.duplicate },
      requestId,
    });
    return json({
      status: "confirmation_required",
      confirmation_required: true,
      request_id: requestId,
      data: {
        draft: created.data.draft,
        confirmation_id: created.data.confirmationId,
        confirmation_url: `/integration-center?confirmation_id=${encodeURIComponent(created.data.confirmationId)}`,
        duplicate: created.data.duplicate,
      },
      boundary: "当前仅保存PMO分类决定并进入高风险飞书确认队列；未执行Base写入，也未创建正式项目。",
    }, 202, requestId);
  } catch (error) {
    return json({ status: "failed", error: "CLASSIFICATION_DRAFT_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, 503, requestId);
  }
}
