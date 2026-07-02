import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  type AppRole,
  type ProjectAccessGrant,
} from "./authorization.ts";

export type AuditStatus = "succeeded" | "failed" | "rejected" | "skipped";
export type AuditSeverity = "low" | "medium" | "high";

export interface OperationAuditInput {
  user: AppUser | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status: AuditStatus;
  severity?: AuditSeverity;
  summary: string;
  detail?: Record<string, unknown>;
  requestId?: string;
}

export interface OperationAuditResult {
  status: AuditStatus;
  id?: string;
  warning?: string;
}

export interface AdminSecuritySnapshot {
  permissions: {
    definitions: typeof PERMISSION_DEFINITIONS;
    matrix: typeof ROLE_PERMISSION_MATRIX;
  };
  users: Array<{
    id: string;
    email: string;
    phone: string;
    name: string | null;
    role: AppRole;
    status: "active" | "disabled";
    created_at?: string;
  }>;
  projectAccess: Array<ProjectAccessGrant & {
    userName?: string | null;
    userEmail?: string | null;
    grantedByName?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>;
  projectAccessRequests: Array<{
    id: string;
    requesterId: string;
    requesterName?: string | null;
    requesterEmail?: string | null;
    projectName?: string | null;
    projectCode?: string | null;
    accessLevel: "viewer" | "editor" | "owner";
    reason: string;
    status: "pending" | "approved" | "rejected" | "cancelled";
    reviewerName?: string | null;
    reviewComment?: string | null;
    relatedGrantId?: string | null;
    createdAt?: string;
    reviewedAt?: string | null;
  }>;
  auditLogs: Array<{
    id: string;
    actorName: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    status: AuditStatus;
    severity: AuditSeverity;
    summary: string;
    createdAt: string;
    requestId?: string | null;
  }>;
  systemConfigurations: Array<{
    id: string;
    key: string;
    category: string;
    description?: string | null;
    value: Record<string, unknown>;
    updatedAt?: string;
    updatedByName?: string | null;
  }>;
  warnings: string[];
}

function isMissingTableError(message?: string): boolean {
  return Boolean(message?.includes("does not exist") || message?.includes("relation") || message?.includes("operation_audit_logs") || message?.includes("user_project_access_grants") || message?.includes("system_configurations") || message?.includes("project_access_requests"));
}

function actorName(user: AppUser | null): string {
  return user?.name || user?.email || user?.phone || "匿名/系统";
}

function sanitizeDetail(detail: Record<string, unknown> = {}): Record<string, unknown> {
  const blocked = /password|secret|token|api[_-]?key|authorization|cookie/i;
  return Object.fromEntries(Object.entries(detail).map(([key, value]) => [
    key,
    blocked.test(key) ? "[redacted]" : value,
  ]));
}

function mapGrant(row: Record<string, unknown>): ProjectAccessGrant & {
  userName?: string | null;
  userEmail?: string | null;
  grantedByName?: string | null;
  createdAt?: string;
  updatedAt?: string;
} {
  const user = Array.isArray(row.app_users) ? row.app_users[0] : row.app_users as { name?: string | null; email?: string | null } | undefined;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: user?.name ?? null,
    userEmail: user?.email ?? null,
    projectName: typeof row.project_name === "string" ? row.project_name : null,
    projectCode: typeof row.project_code === "string" ? row.project_code : null,
    accessLevel: String(row.access_level || "viewer") as ProjectAccessGrant["accessLevel"],
    status: String(row.status || "active") as ProjectAccessGrant["status"],
    grantReason: typeof row.grant_reason === "string" ? row.grant_reason : null,
    grantedByName: typeof row.granted_by_name === "string" ? row.granted_by_name : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
  };
}

export async function writeOperationAudit(input: OperationAuditInput): Promise<OperationAuditResult> {
  if (!isAuthStorageConfigured()) {
    return { status: "skipped", warning: "AUTH_STORAGE_NOT_CONFIGURED" };
  }
  const supabase = getAuthSupabase();
  const payload = {
    actor_id: input.user?.id ?? null,
    actor_name: actorName(input.user),
    actor_role: input.user?.role ?? "anonymous",
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId ?? null,
    status: input.status,
    severity: input.severity ?? "low",
    summary: input.summary,
    detail: sanitizeDetail(input.detail),
    request_id: input.requestId ?? null,
  };
  const { data, error } = await supabase
    .from("operation_audit_logs")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return {
      status: isMissingTableError(error.message) ? "skipped" : "failed",
      warning: isMissingTableError(error.message)
        ? "P9 SQL 未执行：operation_audit_logs 不存在。"
        : error.message,
    };
  }
  return { status: "succeeded", id: data.id };
}

export async function loadProjectAccessGrantsForUser(user: AppUser | null | undefined): Promise<ProjectAccessGrant[]> {
  if (!user || user.role === "admin" || !isAuthStorageConfigured()) return [];
  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("user_project_access_grants")
    .select("id,user_id,project_name,project_code,access_level,status,grant_reason")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) return [];
  return (data ?? []).map(row => ({
    id: row.id,
    userId: row.user_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    accessLevel: row.access_level,
    status: row.status,
    grantReason: row.grant_reason,
  }));
}

export async function loadAdminSecuritySnapshot(): Promise<AdminSecuritySnapshot> {
  const snapshot: AdminSecuritySnapshot = {
    permissions: { definitions: PERMISSION_DEFINITIONS, matrix: ROLE_PERMISSION_MATRIX },
    users: [],
    projectAccess: [],
    projectAccessRequests: [],
    auditLogs: [],
    systemConfigurations: [],
    warnings: [],
  };
  if (!isAuthStorageConfigured()) {
    snapshot.warnings.push("AUTH_STORAGE_NOT_CONFIGURED");
    return snapshot;
  }

  const supabase = getAuthSupabase();
  const [users, grants, requests, audits, configs] = await Promise.all([
    supabase.from("app_users").select("id,email,phone,name,role,status,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("user_project_access_grants").select("id,user_id,project_name,project_code,access_level,status,grant_reason,created_at,updated_at,app_users(name,email)").order("updated_at", { ascending: false }).limit(200),
    supabase.from("project_access_requests").select("id,requester_id,requester_name,requester_email,project_name,project_code,access_level,reason,status,reviewer_name,review_comment,related_grant_id,created_at,reviewed_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("operation_audit_logs").select("id,actor_name,actor_role,action,resource_type,resource_id,status,severity,summary,created_at,request_id").order("created_at", { ascending: false }).limit(100),
    supabase.from("system_configurations").select("id,config_key,config_value,category,description,updated_at,updated_by_name").order("updated_at", { ascending: false }).limit(100),
  ]);

  if (users.error) snapshot.warnings.push(users.error.message);
  else {
    snapshot.users = (users.data ?? []).map(row => ({
      id: row.id,
      email: row.email,
      phone: row.phone,
      name: row.name,
      role: row.role,
      status: row.status,
      created_at: row.created_at,
    }));
  }

  if (grants.error) snapshot.warnings.push(isMissingTableError(grants.error.message) ? "P9 SQL 未执行：user_project_access_grants 不存在。" : grants.error.message);
  else snapshot.projectAccess = (grants.data ?? []).map(row => mapGrant(row as Record<string, unknown>));

  if (requests.error) snapshot.warnings.push(requests.error.message.includes("project_access_requests") || requests.error.message.includes("does not exist") || requests.error.message.includes("relation") ? "P10 SQL 未执行：project_access_requests 不存在。" : requests.error.message);
  else {
    snapshot.projectAccessRequests = (requests.data ?? []).map(row => ({
      id: row.id,
      requesterId: row.requester_id,
      requesterName: row.requester_name,
      requesterEmail: row.requester_email,
      projectName: row.project_name,
      projectCode: row.project_code,
      accessLevel: row.access_level,
      reason: row.reason,
      status: row.status,
      reviewerName: row.reviewer_name,
      reviewComment: row.review_comment,
      relatedGrantId: row.related_grant_id,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    }));
  }

  if (audits.error) snapshot.warnings.push(isMissingTableError(audits.error.message) ? "P9 SQL 未执行：operation_audit_logs 不存在。" : audits.error.message);
  else {
    snapshot.auditLogs = (audits.data ?? []).map(row => ({
      id: row.id,
      actorName: row.actor_name,
      actorRole: row.actor_role,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      status: row.status,
      severity: row.severity,
      summary: row.summary,
      createdAt: row.created_at,
      requestId: row.request_id,
    }));
  }

  if (configs.error) snapshot.warnings.push(isMissingTableError(configs.error.message) ? "P9 SQL 未执行：system_configurations 不存在。" : configs.error.message);
  else {
    snapshot.systemConfigurations = (configs.data ?? []).map(row => ({
      id: row.id,
      key: row.config_key,
      category: row.category,
      description: row.description,
      value: row.config_value ?? {},
      updatedAt: row.updated_at,
      updatedByName: row.updated_by_name,
    }));
  }
  return snapshot;
}
