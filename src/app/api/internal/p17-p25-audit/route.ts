import { timingSafeEqual } from "node:crypto";
import { getAuthSupabase, isAuthStorageConfigured } from "@/features/auth/server";
import { verifyPassword } from "@/features/auth/password";
import { isReasonablePhone, isValidEmail, normalizeEmail, normalizePhone } from "@/features/auth/validation";
import { readFeishuConfig } from "@/features/feishu/config";
import { FeishuBaseClient } from "@/features/feishu/client";

export const runtime = "nodejs";

const requiredTables = [
  "app_users",
  "app_sessions",
  "user_project_access_grants",
  "feishu_action_confirmations",
  "organizations",
  "portfolios",
  "portfolio_project_links",
  "user_business_roles",
  "business_authorization_policies",
  "business_reporting_relationships",
  "project_identity_mappings",
  "management_signals",
  "management_signal_events",
  "evidence_requirements",
  "evidence_links",
  "project_lifecycle_states",
  "feedback_correction_events",
  "business_update_drafts",
  "business_joint_check_runs",
  "business_operating_occurrences",
  "pmo_control_events",
  "project_level_rule_matrices",
  "resource_capacity_snapshots",
  "data_quality_issues",
  "reporting_snapshots",
  "governance_meetings",
  "decision_briefs",
  "decision_receipts",
  "decision_effect_reviews",
  "project_benefit_baselines",
  "benefit_realization_reviews",
  "portfolio_scenarios",
  "ai_assistant_runs",
  "ai_recommendations",
  "ai_assistant_evaluations",
  "project_closure_assessments",
  "retrospective_knowledge_candidates",
  "knowledge_reuse_events",
  "enterprise_capability_gates",
  "golden_chain_runs",
  "golden_chain_steps",
] as const;

function tokenFrom(request: Request): string {
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return request.headers.get("x-audit-token")?.trim() || bearer;
}

function authorized(request: Request): boolean {
  const expected = process.env.P17P25_AUDIT_TOKEN || "";
  const actual = tokenFrom(request);
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function checkTables() {
  if (!isAuthStorageConfigured()) {
    return {
      ok: false,
      checked: 0,
      available: 0,
      failed: requiredTables.map(table => ({ table, ok: false, status: 0, code: "AUTH_STORAGE_NOT_CONFIGURED" })),
    };
  }
  const supabase = getAuthSupabase();
  const results = [];
  for (const table of requiredTables) {
    const { error, status } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .limit(1);
    results.push({
      table,
      ok: !error,
      status: status ?? (error ? 500 : 200),
      code: error?.code || null,
    });
  }
  const failed = results.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    checked: results.length,
    available: results.length - failed.length,
    failed,
  };
}

async function checkAdmin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || "");
  const phone = normalizePhone(process.env.ADMIN_PHONE || "");
  const password = process.env.ADMIN_PASSWORD || "";
  const envValid = isValidEmail(email) && isReasonablePhone(phone) && password.length >= 6 && /[A-Za-z]/.test(password) && /\d/.test(password);
  if (!envValid || !isAuthStorageConfigured()) {
    return {
      ok: false,
      envValid,
      adminExists: false,
      active: false,
      passwordMatches: false,
    };
  }
  const { data, error } = await getAuthSupabase()
    .from("app_users")
    .select("id,role,status,password_hash")
    .or(`email.eq.${email},phone.eq.${phone}`)
    .eq("role", "admin")
    .maybeSingle();
  const passwordMatches = Boolean(data?.password_hash && verifyPassword(password, data.password_hash));
  return {
    ok: !error && Boolean(data) && data?.status === "active" && passwordMatches,
    envValid,
    adminExists: Boolean(data),
    active: data?.status === "active",
    passwordMatches,
    errorCode: error?.code || null,
  };
}

async function checkFeishu() {
  const config = readFeishuConfig();
  if (!config) {
    return { configured: false, tableCount: 0, health: "not_configured" };
  }
  let health = "not_checked";
  try {
    const result = await new FeishuBaseClient(config).health();
    health = result.status;
  } catch {
    health = "error";
  }
  return {
    configured: true,
    tableCount: config.publicSummary.configuredTables.length,
    health,
  };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  if (!authorized(request)) {
    return Response.json({ error: "AUDIT_UNAUTHORIZED", request_id: requestId }, { status: 401, headers });
  }

  const [tables, admin, feishu] = await Promise.all([
    checkTables(),
    checkAdmin(),
    checkFeishu(),
  ]);
  const environment = {
    authStorageConfigured: isAuthStorageConfigured(),
    authRequired: process.env.AUTH_REQUIRED === "true",
    credentialEncryptionConfigured: Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY),
    credentialEncryptionVersionConfigured: Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION),
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
    minimaxModel: process.env.MINIMAX_MODEL || null,
  };
  const ok = tables.ok && admin.ok && environment.authStorageConfigured && environment.authRequired;
  return Response.json({
    ok,
    status: ok ? "passed" : "needs_attention",
    scope: "p17-p25-production-audit",
    environment,
    tables,
    admin,
    feishu,
    functions: {
      checked: false,
      reason: "PostgREST does not expose pg_proc; run the SQL Editor check in docs/p17-p25-completion-audit-2026-07-11.md for function existence.",
    },
    request_id: requestId,
  }, { status: ok ? 200 : 207, headers });
}
