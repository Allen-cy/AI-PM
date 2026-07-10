import { requireAuthenticatedApiUser, type AppUser } from "@/features/auth/server";
import { buildGovernanceImpactDashboard, buildGovernanceImpactPackage } from "@/features/governance/impact";
import { listGovernanceInstancesForProjectIds } from "@/features/governance/repository";
import { buildGovernanceSlaDashboard, deriveGovernanceSla } from "@/features/governance/sla";
import { canPerformBusinessAction } from "@/features/operating-model/authorization";
import {
  resolveBusinessContext,
  type BusinessContext,
  type BusinessRole,
  type SubjectScope,
} from "@/features/operating-model/context";
import {
  listBusinessRoleAssignments,
  loadContextProjectIdentityMappings,
  type ManagementSignalRecord,
} from "@/features/operating-model/persistence";

export const runtime = "nodejs";

type DataClass = ManagementSignalRecord["dataClass"];

interface RequestedGovernanceContext {
  role: BusinessRole;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  dataClass: DataClass;
}

const BUSINESS_ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const SUBJECT_SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);
const DATA_CLASSES = new Set<DataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);
const GOVERNANCE_SOURCE = {
  type: "supabase",
  tables: ["governance_process_instances", "project_identity_mappings", "projects"],
  fallback_used: false,
} as const;

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function requestedContext(record: Record<string, unknown>): RequestedGovernanceContext | null {
  const nested = record.context && typeof record.context === "object" && !Array.isArray(record.context)
    ? record.context as Record<string, unknown>
    : {};
  const value = { ...nested, ...record };
  const role = String(value.role ?? value.business_role ?? value.businessRole ?? "") as BusinessRole;
  const orgId = String(value.org_id ?? value.orgId ?? "").trim();
  const subjectScope = String(value.subject_scope ?? value.subjectScope ?? "") as SubjectScope;
  const subjectId = String(value.subject_id ?? value.subjectId ?? "").trim();
  const dataClass = String(value.data_class ?? value.dataClass ?? "production") as DataClass;
  if (!BUSINESS_ROLES.has(role) || !orgId || !SUBJECT_SCOPES.has(subjectScope) || !subjectId || !DATA_CLASSES.has(dataClass)) return null;
  return { role, orgId, subjectScope, subjectId, dataClass };
}

async function resolveGovernanceContext(user: AppUser, requested: RequestedGovernanceContext): Promise<{
  context?: BusinessContext;
  projectIds?: string[];
  error?: string;
  detail?: string;
  status?: number;
}> {
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") {
    return { error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, status: 503 };
  }
  const context = resolveBusinessContext({
    user: { id: user.id, systemRole: user.role },
    assignments: assignments.data ?? [],
    requestedRole: requested.role,
    requestedOrgId: requested.orgId,
    requestedSubjectScope: requested.subjectScope,
    requestedSubjectId: requested.subjectId,
  });
  if (!context || !canPerformBusinessAction(context, "project.read", {
    orgId: requested.orgId,
    subjectScope: requested.subjectScope,
    subjectId: requested.subjectId,
  })) return { error: "GOVERNANCE_SCOPE_FORBIDDEN", status: 403 };

  const mappings = await loadContextProjectIdentityMappings({ context, dataClass: requested.dataClass });
  if (mappings.status !== "succeeded") {
    return {
      error: mappings.status === "not_configured" ? "P17_STORAGE_NOT_CONFIGURED" : "GOVERNANCE_SCOPE_MAPPING_FAILED",
      detail: mappings.warning,
      status: mappings.status === "not_configured" ? 503 : 500,
    };
  }
  return {
    context,
    projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))],
  };
}

async function loadGovernanceWorkspace(user: AppUser, requested: RequestedGovernanceContext) {
  const access = await resolveGovernanceContext(user, requested);
  if (access.error || !access.context || !access.projectIds) return { access };
  const result = await listGovernanceInstancesForProjectIds(access.projectIds, 120);
  if (result.status !== "succeeded") return { access, result };
  const governanceWorkbench = buildGovernanceSlaDashboard(result.instances, user);
  const governanceImpact = buildGovernanceImpactDashboard(result.instances);
  return {
    access,
    result,
    workspace: {
      summary: {
        total: result.instances.length,
        ...governanceWorkbench.summary,
        pendingWritebackConfirmation: governanceImpact.summary.pendingConfirmation,
        highSeverityImpacts: governanceImpact.summary.highSeverity,
      },
      workflows: result.workflows,
      instances: result.instances.map(instance => ({
        ...instance,
        sla: deriveGovernanceSla(instance),
        businessImpact: buildGovernanceImpactPackage({ instance }),
      })),
      governance_workbench: governanceWorkbench,
      governance_impact: governanceImpact,
    },
  };
}

function storageFailure(result: {
  status: "succeeded" | "not_configured" | "failed";
  warning?: string;
}, requestId: string) {
  const notConfigured = result.status === "not_configured";
  return json({
    status: result.status,
    error: notConfigured ? "GOVERNANCE_STORAGE_NOT_CONFIGURED" : "GOVERNANCE_DATA_UNAVAILABLE",
    detail: result.warning,
    source: GOVERNANCE_SOURCE,
    request_id: requestId,
  }, 503, requestId);
}

async function respondWithWorkspace(user: AppUser, requested: RequestedGovernanceContext, requestId: string) {
  const loaded = await loadGovernanceWorkspace(user, requested);
  if (loaded.access.error) {
    return json({
      error: loaded.access.error,
      detail: loaded.access.detail,
      source: GOVERNANCE_SOURCE,
      request_id: requestId,
    }, loaded.access.status ?? 500, requestId);
  }
  if (!loaded.result || loaded.result.status !== "succeeded" || !loaded.workspace) {
    return storageFailure(loaded.result ?? { status: "failed", warning: "治理数据读取失败。" }, requestId);
  }
  return json({
    status: "succeeded",
    context: loaded.access.context,
    data_class: requested.dataClass,
    source: GOVERNANCE_SOURCE,
    governance: loaded.workspace,
    successor: { page: "/governance-workflows", api: "/api/governance/workflows" },
    request_id: requestId,
  }, 200, requestId);
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const requested = requestedContext(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!requested) {
    return json({ error: "GOVERNANCE_BUSINESS_CONTEXT_REQUIRED", source: GOVERNANCE_SOURCE, request_id: requestId }, 400, requestId);
  }
  return respondWithWorkspace(user, requested, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  }
  const requested = requestedContext(body);
  if (!requested) {
    return json({ error: "GOVERNANCE_BUSINESS_CONTEXT_REQUIRED", source: GOVERNANCE_SOURCE, request_id: requestId }, 400, requestId);
  }
  const action = String(body.action ?? "");
  if (action === "analyzeGovernance") return respondWithWorkspace(user, requested, requestId);
  return json({
    status: "retired",
    error: "LEGACY_GOVERNANCE_ACTION_RETIRED",
    detail: "该旧动作不会再生成模板或随机结果，请进入正式治理工作流或对应业务中心完成真实录入、审批和闭环。",
    action,
    source: GOVERNANCE_SOURCE,
    successor: {
      governance: { page: "/governance-workflows", api: "/api/governance/workflows" },
      okr: { page: "/planning" },
      exception: { page: "/pmo/control-center", api: "/api/pmo/control-center" },
    },
    request_id: requestId,
  }, 410, requestId);
}
