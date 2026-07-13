import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import {
  FEISHU_RECONCILE_DOMAINS,
  type FeishuReconcileDataClass,
  type FeishuReconcileDomain,
} from "@/features/feishu/reconcile-contract";
import { FeishuReconcileError, runFeishuReconcile } from "@/features/feishu/reconcile-service";
import {
  resolveBusinessContext,
  type BusinessContext,
  type BusinessRole,
  type SubjectScope,
} from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

const DATA_CLASSES = new Set<FeishuReconcileDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);
const BUSINESS_ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const SUBJECT_SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);

type AuthorizedContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  context: BusinessContext;
  dataClass: FeishuReconcileDataClass;
};

function response(body: unknown, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function authorize(
  request: Request,
  values: Record<string, unknown>,
  requestId: string,
): Promise<AuthorizedContext | Response> {
  const user = await getCurrentUser();
  if (!user) return response({ status: "failed", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const url = new URL(request.url);
  const businessRole = text(values.business_role ?? url.searchParams.get("business_role")) as BusinessRole;
  const orgId = text(values.org_id ?? url.searchParams.get("org_id"));
  const subjectScope = text(values.subject_scope ?? url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(values.subject_id ?? url.searchParams.get("subject_id"));
  const dataClass = text(values.data_class ?? url.searchParams.get("data_class") ?? "production") as FeishuReconcileDataClass;
  if (!BUSINESS_ROLES.has(businessRole) || !SUBJECT_SCOPES.has(subjectScope) || !orgId || !subjectId || !DATA_CLASSES.has(dataClass)) {
    return response({ status: "failed", error: "BUSINESS_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  }
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") {
    return response({ status: "failed", error: "BUSINESS_CONTEXT_STORAGE_UNAVAILABLE", detail: assignments.warning, request_id: requestId }, 503, requestId);
  }
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: businessRole,
    requestedOrgId: orgId,
    requestedSubjectScope: subjectScope,
    requestedSubjectId: subjectId,
  });
  if (!context) return response({ status: "failed", error: "BUSINESS_CONTEXT_FORBIDDEN", request_id: requestId }, 403, requestId);
  return { user, context, dataClass };
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function parseDomains(value: unknown): FeishuReconcileDomain[] {
  if (value === undefined || value === null) return [...FEISHU_RECONCILE_DOMAINS];
  if (!Array.isArray(value)) return [];
  return value.map(String).filter((domain): domain is FeishuReconcileDomain => (
    FEISHU_RECONCILE_DOMAINS.includes(domain as FeishuReconcileDomain)
  ));
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const authorized = await authorize(request, {}, requestId);
  if (authorized instanceof Response) return authorized;
  const supabase = getAuthSupabase();
  const [batch, cursors, quarantine] = await Promise.all([
    supabase.from("feishu_reconcile_batches")
      .select("id,status,trigger_type,requested_domains,completed_domains,source_checkpoint,total_records,inserted_records,updated_records,unchanged_records,tombstoned_records,quarantined_records,failed_records,warnings,error_code,started_at,completed_at,updated_at")
      .eq("org_id", authorized.context.orgId).eq("data_class", authorized.dataClass)
      .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("feishu_reconcile_cursors")
      .select("domain,source_checkpoint,source_page_count,source_record_count,last_source_updated_at,last_succeeded_at,updated_at")
      .eq("org_id", authorized.context.orgId).eq("data_class", authorized.dataClass)
      .order("domain", { ascending: true }),
    supabase.from("feishu_reconcile_quarantine")
      .select("domain,reason_code,status,last_seen_at", { count: "exact" })
      .eq("org_id", authorized.context.orgId).eq("data_class", authorized.dataClass)
      .in("status", ["pending", "under_review"]).order("last_seen_at", { ascending: false }).limit(20),
  ]);
  const failure = [batch, cursors, quarantine].find(item => item.error)?.error;
  if (failure) {
    return response({ status: "failed", error: "V62_STORAGE_NOT_CONFIGURED", detail: failure.message, request_id: requestId }, 503, requestId);
  }
  const latest = batch.data;
  const cursorRows = cursors.data ?? [];
  const warnings = Number(quarantine.count ?? 0) > 0 ? ["存在待治理的飞书隔离记录。"] : [];
  return response({
    status: "succeeded",
    request_id: requestId,
    context: {
      org_id: authorized.context.orgId,
      subject_scope: authorized.context.subjectScope,
      subject_id: authorized.context.subjectId,
      business_role: authorized.context.businessRole,
    },
    source: { type: "feishu", label: "飞书多维表格", mirror: "Supabase受治理镜像" },
    data_class: authorized.dataClass,
    generated_at: new Date().toISOString(),
    warnings,
    data: {
      latest_batch: latest,
      cursors: cursorRows,
      quality: {
        status: Number(quarantine.count ?? 0) > 0 ? "attention" : latest ? "ready" : "not_synced",
        pending_quarantine_count: Number(quarantine.count ?? 0),
        recent_quarantine: quarantine.data ?? [],
      },
      freshness: {
        latest_source_updated_at: cursorRows.map(row => row.last_source_updated_at).filter(Boolean).sort().at(-1) ?? null,
        last_succeeded_at: cursorRows.map(row => row.last_succeeded_at).filter(Boolean).sort().at(-1) ?? null,
      },
    },
  }, 200, requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const body = await readBody(request);
  const authorized = await authorize(request, body, requestId);
  if (authorized instanceof Response) return authorized;
  if (!(["pmo", "operations"] as BusinessRole[]).includes(authorized.context.businessRole)) {
    return response({ status: "failed", error: "RECONCILE_ROLE_FORBIDDEN", request_id: requestId }, 403, requestId);
  }
  const idempotencyKey = text(body.idempotency_key);
  const expectedVersion = Number(body.expected_version);
  if (!idempotencyKey || !Number.isInteger(expectedVersion)) {
    return response({ status: "failed", error: "IDEMPOTENCY_AND_VERSION_REQUIRED", request_id: requestId }, 400, requestId);
  }
  const domains = parseDomains(body.domains);
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config) {
    return response({ status: "failed", error: "FEISHU_NOT_CONFIGURED", detail: effective.setupHint, request_id: requestId }, 503, requestId);
  }
  const sourceScope = effective.source === "user" ? "user" : "organization";
  try {
    const result = await runFeishuReconcile({
      config: effective.config,
      supabase: getAuthSupabase(),
      orgId: authorized.context.orgId,
      dataClass: authorized.dataClass,
      sourceScope,
      sourceUserId: sourceScope === "user" ? authorized.user.id : null,
      triggerType: "manual",
      domains,
      idempotencyKey,
      expectedVersion,
      actorUserId: authorized.user.id,
      requestId,
      sourceCheckpoint: text(body.source_checkpoint) || idempotencyKey,
    });
    return response({
      status: result.status,
      request_id: requestId,
      context: {
        org_id: authorized.context.orgId,
        subject_scope: authorized.context.subjectScope,
        subject_id: authorized.context.subjectId,
        business_role: authorized.context.businessRole,
      },
      source: result.source,
      data_class: authorized.dataClass,
      generated_at: new Date().toISOString(),
      warnings: result.data_quality.warnings,
      data: result,
    }, result.status === "completed_with_warnings" ? 200 : 201, requestId);
  } catch (error) {
    const known = error instanceof FeishuReconcileError ? error : new FeishuReconcileError("飞书真实数据对账失败。", "RECONCILE_FAILED");
    return response({ status: "failed", error: known.code, detail: known.message, request_id: requestId }, known.status, requestId);
  }
}
