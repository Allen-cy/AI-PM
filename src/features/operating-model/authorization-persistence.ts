import type { AppUser } from "../auth/server.ts";
import { getAuthSupabase, isAuthStorageConfigured } from "../auth/server.ts";
import { writeOperationAudit } from "../security/repository.ts";
import type { BusinessContext } from "./context.ts";
import {
  evaluateBusinessAuthorization,
  type BusinessAuthorizationPolicy,
  type BusinessAuthorizationRequest,
  type BusinessAuthorizationResult,
} from "./operating-contracts.ts";

export type PolicyAuthorizationResult =
  | { status: "succeeded"; decision: BusinessAuthorizationResult }
  | { status: "not_configured" | "failed"; warning: string };

function policy(row: Record<string, unknown>): BusinessAuthorizationPolicy {
  return {
    id: String(row.id), effect: String(row.effect) as "allow" | "deny",
    businessRole: String(row.business_role) as BusinessAuthorizationPolicy["businessRole"],
    objectType: String(row.object_type), action: String(row.action),
    allowedStates: Array.isArray(row.allowed_states) ? row.allowed_states.map(String) : [],
    projectLevels: Array.isArray(row.project_levels) ? row.project_levels.map(String) : [],
    decisionLevels: Array.isArray(row.decision_levels) ? row.decision_levels.map(String) : [],
    maxAmount: row.max_amount === null || row.max_amount === undefined ? null : Number(row.max_amount),
    priority: Number(row.priority || 0),
  };
}

export async function authorizeBusinessOperation(input: {
  user: AppUser;
  context: BusinessContext;
  request: Omit<BusinessAuthorizationRequest, "businessRole" | "recused">;
  resourceId: string;
  requestId: string;
}): Promise<PolicyAuthorizationResult> {
  if (!isAuthStorageConfigured()) return { status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  const supabase = getAuthSupabase(); const now = new Date().toISOString();
  const [policies, recusals] = await Promise.all([
    supabase.from("business_authorization_policies").select("*")
      .or(`org_id.eq.${input.context.orgId},org_id.is.null`)
      .eq("status", "active").eq("business_role", input.context.businessRole)
      .eq("object_type", input.request.objectType).eq("action", input.request.action)
      .or(`effective_from.is.null,effective_from.lte.${now}`)
      .or(`effective_until.is.null,effective_until.gte.${now}`),
    supabase.from("business_role_recusals").select("id").eq("org_id", input.context.orgId)
      .eq("user_id", input.user.id).eq("business_role", input.context.businessRole)
      .eq("subject_scope", input.context.subjectScope).eq("subject_id", input.context.subjectId)
      .eq("status", "active").lte("valid_from", now).or(`valid_until.is.null,valid_until.gte.${now}`).limit(1),
  ]);
  const error = policies.error || recusals.error;
  if (error) return { status: /does not exist|schema cache/i.test(error.message) ? "not_configured" : "failed", warning: error.message };
  const decision = evaluateBusinessAuthorization({ ...input.request, businessRole: input.context.businessRole, recused: (recusals.data ?? []).length > 0 }, (policies.data ?? []).map(row => policy(row as Record<string, unknown>)));
  if (!decision.allowed) await writeOperationAudit({
    user: input.user, action: `authorization_denied_${input.request.objectType}_${input.request.action}`,
    resourceType: input.request.objectType, resourceId: input.resourceId, status: "failed", severity: "high",
    summary: `业务授权拒绝：${decision.code}`, detail: { businessRole: input.context.businessRole, policyId: decision.policyId, ...input.request }, requestId: input.requestId,
  });
  return { status: "succeeded", decision };
}

