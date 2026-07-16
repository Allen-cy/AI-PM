import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import {
  buildFeishuClassificationCsv,
  buildFeishuClassificationSummary,
  recommendFeishuDataClass,
  type FeishuQuarantineSourceRow,
} from "@/features/feishu/quarantine-governance";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

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
      data: { total: Number(result.count ?? items.length), summary, items },
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
