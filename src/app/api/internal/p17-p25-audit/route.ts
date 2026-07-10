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

function safeErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized ? serialized.slice(0, 800) : String(error);
  } catch {
    return String(error).slice(0, 800);
  }
}

function safeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
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
      code: safeErrorCode(error),
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
  let businessRoleCount: number | null = null;
  let businessRoleError: { code: string | null; message: string } | null = null;
  if (data?.id) {
    const roleCheck = await getAuthSupabase()
      .from("user_business_roles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", data.id);
    businessRoleCount = roleCheck.count ?? null;
    if (roleCheck.error) {
      businessRoleError = {
        code: safeErrorCode(roleCheck.error),
        message: safeErrorMessage(roleCheck.error) || "unknown role storage error",
      };
    }
  }
  return {
    ok: !error && Boolean(data) && data?.status === "active" && passwordMatches,
    envValid,
    adminExists: Boolean(data),
    active: data?.status === "active",
    passwordMatches,
    businessRoleCount,
    businessRoleError,
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

async function checkStorageCompatibility() {
  if (!isAuthStorageConfigured()) {
    return {
      ok: false,
      checks: [{ key: "auth_storage", ok: false, code: "AUTH_STORAGE_NOT_CONFIGURED", message: "Supabase service role storage is not configured." }],
    };
  }
  const supabase = getAuthSupabase();
  const checks = [
    {
      key: "user_business_roles_required_columns",
      table: "user_business_roles",
      select: "id,user_id,business_role,org_id,subject_scope,subject_id,status,valid_from,valid_until,delegated_from_user_id",
      required: true,
    },
    {
      key: "user_feishu_connections_base_columns",
      table: "user_feishu_connections",
      select: "app_id,app_secret,app_secret_encrypted,app_secret_last4,base_token,base_token_encrypted,base_token_last4,table_mapping,status",
      required: true,
    },
    {
      key: "user_feishu_connections_notification_columns",
      table: "user_feishu_connections",
      select: "notification_receive_id_type,notification_receive_id",
      required: false,
    },
  ] as const;
  const results = [];
  for (const item of checks) {
    const { error, status } = await supabase
      .from(item.table)
      .select(item.select, { head: true })
      .limit(1);
    results.push({
      key: item.key,
      table: item.table,
      required: item.required,
      ok: !error,
      status: status ?? (error ? 500 : 200),
      code: safeErrorCode(error),
      message: safeErrorMessage(error),
    });
  }
  return {
    ok: results.filter(item => item.required).every(item => item.ok),
    checks: results,
  };
}

async function checkLoginRoundtrip(request: Request) {
  const account = process.env.ADMIN_PHONE || process.env.ADMIN_EMAIL || "";
  const password = process.env.ADMIN_PASSWORD || "";
  if (!account || !password) {
    return {
      ok: false,
      loginStatus: 0,
      hasCookie: false,
      meStatus: 0,
      meCode: "ADMIN_ENV_MISSING",
      endpointStatuses: [] as Array<{ endpoint: string; status: number; code: string | null; detail: string | null; setupRequired: boolean | null }>,
    };
  }

  const origin = new URL(request.url).origin;
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account, password }),
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  let meStatus = 0;
  let meCode: string | null = null;
  const endpointStatuses: Array<{ endpoint: string; status: number; code: string | null; detail: string | null; setupRequired: boolean | null }> = [];
  if (cookie) {
    const me = await fetch(`${origin}/api/auth/me`, { headers: { cookie } });
    meStatus = me.status;
    try {
      const body = await me.json();
      meCode = body?.user ? "USER_OK" : body?.error || null;
    } catch {
      meCode = "NON_JSON";
    }
    for (const endpoint of [
      "/api/context/current",
      "/api/business-assistant",
      "/api/pmo/control-center",
      "/api/decisions",
      "/api/business-finance",
      "/api/role-assistant",
      "/api/operations-center",
      "/api/operations-center/golden-chains",
      "/api/user/ai-settings",
      "/api/user/feishu-connection",
    ]) {
      const response = await fetch(`${origin}${endpoint}`, { headers: { cookie } });
      let code: string | null = null;
      let detail: string | null = null;
      let setupRequired: boolean | null = null;
      try {
        const body = await response.json();
        code = body?.error || body?.status || (body ? "JSON" : null);
        setupRequired = typeof body?.setup_required === "boolean" ? body.setup_required : null;
        const rawDetail = body?.detail || body?.warning || body?.message;
        detail = typeof rawDetail === "string" ? rawDetail.slice(0, 500) : null;
      } catch {
        code = "NON_JSON";
      }
      endpointStatuses.push({ endpoint, status: response.status, code, detail, setupRequired });
    }
    await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { cookie } }).catch(() => null);
  }

  const requiredEndpointStatuses = new Map(endpointStatuses.map(item => [item.endpoint, item.status]));
  const criticalEndpointsOk = (
    requiredEndpointStatuses.get("/api/context/current") === 200
    && requiredEndpointStatuses.get("/api/user/ai-settings") === 200
    && requiredEndpointStatuses.get("/api/user/feishu-connection") === 200
  );

  return {
    ok: login.status === 200 && Boolean(cookie) && meStatus === 200 && meCode === "USER_OK" && criticalEndpointsOk,
    loginStatus: login.status,
    hasCookie: Boolean(cookie),
    meStatus,
    meCode,
    criticalEndpointsOk,
    endpointStatuses,
  };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const headers = { "Cache-Control": "no-store", "X-Request-Id": requestId };
  if (!authorized(request)) {
    return Response.json({ error: "AUDIT_UNAUTHORIZED", request_id: requestId }, { status: 401, headers });
  }

  const [tables, admin, feishu, storageCompatibility, loginRoundtrip] = await Promise.all([
    checkTables(),
    checkAdmin(),
    checkFeishu(),
    checkStorageCompatibility(),
    checkLoginRoundtrip(request),
  ]);
  const environment = {
    authStorageConfigured: isAuthStorageConfigured(),
    authRequired: process.env.AUTH_REQUIRED === "true",
    credentialEncryptionConfigured: Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY),
    credentialEncryptionVersionConfigured: Boolean(process.env.CREDENTIAL_ENCRYPTION_KEY_VERSION),
    minimaxConfigured: Boolean(process.env.MINIMAX_API_KEY),
    minimaxModel: process.env.MINIMAX_MODEL || null,
  };
  const ok = tables.ok && admin.ok && storageCompatibility.ok && loginRoundtrip.ok && environment.authStorageConfigured && environment.authRequired;
  return Response.json({
    ok,
    status: ok ? "passed" : "needs_attention",
    scope: "p17-p25-production-audit",
    environment,
    tables,
    storageCompatibility,
    admin,
    loginRoundtrip,
    feishu,
    functions: {
      checked: false,
      reason: "PostgREST does not expose pg_proc; run the SQL Editor check in docs/p17-p25-completion-audit-2026-07-11.md for function existence.",
    },
    request_id: requestId,
  }, { status: ok ? 200 : 207, headers });
}
