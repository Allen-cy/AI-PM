import { getAuthSupabase, isAuthStorageConfigured, type AppUser } from "../auth/server.ts";
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  type AppRole,
  type ProjectAccessGrant,
} from "./authorization.ts";
import { isMissingSecurityTableError } from "./errors.ts";

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
    accountKind: "real_user" | "test_account" | "service_account";
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
  businessRoles: Array<{
    id: string;
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    businessRole: string;
    orgId: string;
    subjectScope: string;
    subjectId: string;
    status: string;
    validFrom: string;
    validUntil?: string | null;
    delegatedFromUserId?: string | null;
    assignmentReason?: string | null;
    updatedAt?: string;
  }>;
  organizations: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }>;
  portfolios: Array<{
    id: string;
    orgId: string;
    code: string;
    name: string;
    status: string;
  }>;
  projects: Array<{
    id: string;
    orgId: string;
    code?: string | null;
    name: string;
    dataClass: string;
  }>;
  managementRules: Array<{
    id: string;
    ruleKey: string;
    version: string;
    status: string;
    scopeKey: string;
    configuration: Record<string, unknown>;
    approvedAt?: string | null;
  }>;
  reportingRelationships: Array<{
    id: string;
    orgId: string;
    subjectScope: string;
    subjectId: string;
    fromUserId: string;
    fromUserName?: string | null;
    fromBusinessRole: string;
    toUserId: string;
    toUserName?: string | null;
    toBusinessRole: string;
    relationshipType: string;
    status: string;
    validFrom: string;
    validUntil?: string | null;
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
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userName: typeof row.user_name === "string" ? row.user_name : null,
    userEmail: typeof row.user_email === "string" ? row.user_email : null,
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
      status: isMissingSecurityTableError(error.message, "operation_audit_logs") ? "skipped" : "failed",
      warning: isMissingSecurityTableError(error.message, "operation_audit_logs")
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
    businessRoles: [],
    organizations: [],
    portfolios: [],
    projects: [],
    managementRules: [],
    reportingRelationships: [],
    auditLogs: [],
    systemConfigurations: [],
    warnings: [],
  };
  if (!isAuthStorageConfigured()) {
    snapshot.warnings.push("AUTH_STORAGE_NOT_CONFIGURED");
    return snapshot;
  }

  const supabase = getAuthSupabase();
  const [users, grants, requests, audits, configs, businessRoles, organizations, portfolios, projects, managementRules, reportingRelationships] = await Promise.all([
    supabase.from("app_users").select("id,email,phone,name,role,status,account_kind,created_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("user_project_access_grants").select("id,user_id,project_name,project_code,access_level,status,grant_reason,granted_by_name,created_at,updated_at").order("updated_at", { ascending: false }).limit(200),
    supabase.from("project_access_requests").select("id,requester_id,requester_name,requester_email,project_name,project_code,access_level,reason,status,reviewer_name,review_comment,related_grant_id,created_at,reviewed_at").order("created_at", { ascending: false }).limit(200),
    supabase.from("operation_audit_logs").select("id,actor_name,actor_role,action,resource_type,resource_id,status,severity,summary,created_at,request_id").order("created_at", { ascending: false }).limit(100),
    supabase.from("system_configurations").select("id,config_key,config_value,category,description,updated_at,updated_by_name").order("updated_at", { ascending: false }).limit(100),
    supabase.from("user_business_roles").select("id,user_id,business_role,org_id,subject_scope,subject_id,status,valid_from,valid_until,delegated_from_user_id,assignment_reason,updated_at").order("updated_at", { ascending: false }).limit(300),
    supabase.from("organizations").select("id,org_code,name,status").order("name", { ascending: true }).limit(100),
    supabase.from("portfolios").select("id,org_id,portfolio_code,name,status").order("name", { ascending: true }).limit(200),
    supabase.from("projects").select("id,org_id,oa_no,name,data_class").order("name", { ascending: true }).limit(500),
    supabase.from("management_rule_versions").select("id,rule_key,version,status,scope_key,configuration,approved_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("business_reporting_relationships").select("id,org_id,subject_scope,subject_id,from_user_id,from_business_role,to_user_id,to_business_role,relationship_type,status,valid_from,valid_until").order("created_at", { ascending: false }).limit(300),
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
      accountKind: row.account_kind,
      created_at: row.created_at,
    }));
  }
  const usersById = new Map(snapshot.users.map(user => [user.id, user]));

  if (grants.error) {
    snapshot.warnings.push(isMissingSecurityTableError(grants.error.message, "user_project_access_grants") ? "P9 SQL 未执行：user_project_access_grants 不存在。" : grants.error.message);
  } else {
    snapshot.projectAccess = (grants.data ?? []).map(row => {
      const user = usersById.get(row.user_id);
      return mapGrant({
        ...(row as Record<string, unknown>),
        user_name: user?.name ?? null,
        user_email: user?.email ?? null,
      });
    });
  }

  if (requests.error) snapshot.warnings.push(isMissingSecurityTableError(requests.error.message, "project_access_requests") ? "P10 SQL 未执行：project_access_requests 不存在。" : requests.error.message);
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

  if (audits.error) snapshot.warnings.push(isMissingSecurityTableError(audits.error.message, "operation_audit_logs") ? "P9 SQL 未执行：operation_audit_logs 不存在。" : audits.error.message);
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

  if (configs.error) snapshot.warnings.push(isMissingSecurityTableError(configs.error.message, "system_configurations") ? "P9 SQL 未执行：system_configurations 不存在。" : configs.error.message);
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
  if (businessRoles.error) {
    snapshot.warnings.push(businessRoles.error.message.includes("user_business_roles") ? "P17 SQL 未执行：user_business_roles 不存在。" : businessRoles.error.message);
  } else {
    snapshot.businessRoles = (businessRoles.data ?? []).map(row => {
      const user = usersById.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        userName: user?.name ?? null,
        userEmail: user?.email ?? null,
        businessRole: row.business_role,
        orgId: row.org_id,
        subjectScope: row.subject_scope,
        subjectId: row.subject_id,
        status: row.status,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        delegatedFromUserId: row.delegated_from_user_id,
        assignmentReason: row.assignment_reason,
        updatedAt: row.updated_at,
      };
    });
  }
  if (organizations.error) snapshot.warnings.push(organizations.error.message.includes("organizations") ? "P17 SQL 未执行：organizations 不存在。" : organizations.error.message);
  else snapshot.organizations = (organizations.data ?? []).map(row => ({ id: row.id, code: row.org_code, name: row.name, status: row.status }));

  if (portfolios.error) snapshot.warnings.push(portfolios.error.message.includes("portfolios") ? "P17 SQL 未执行：portfolios 不存在。" : portfolios.error.message);
  else snapshot.portfolios = (portfolios.data ?? []).map(row => ({ id: row.id, orgId: row.org_id, code: row.portfolio_code, name: row.name, status: row.status }));

  if (projects.error) snapshot.warnings.push(projects.error.message.includes("org_id") || projects.error.message.includes("data_class") ? "P17 SQL 未执行：projects 组织与数据分类字段不存在。" : projects.error.message);
  else snapshot.projects = (projects.data ?? []).map(row => ({ id: row.id, orgId: row.org_id, code: row.oa_no, name: row.name, dataClass: row.data_class }));

  if (managementRules.error) snapshot.warnings.push(managementRules.error.message.includes("management_rule_versions") ? "P17 SQL 未执行：management_rule_versions 不存在。" : managementRules.error.message);
  else snapshot.managementRules = (managementRules.data ?? []).map(row => ({
    id: row.id,
    ruleKey: row.rule_key,
    version: row.version,
    status: row.status,
    scopeKey: row.scope_key,
    configuration: row.configuration ?? {},
    approvedAt: row.approved_at,
  }));
  if (reportingRelationships.error) snapshot.warnings.push(reportingRelationships.error.message.includes("business_reporting_relationships") ? "P17 SQL 未执行：business_reporting_relationships 不存在。" : reportingRelationships.error.message);
  else snapshot.reportingRelationships = (reportingRelationships.data ?? []).map(row => ({
    id: row.id,
    orgId: row.org_id,
    subjectScope: row.subject_scope,
    subjectId: row.subject_id,
    fromUserId: row.from_user_id,
    fromUserName: usersById.get(row.from_user_id)?.name || usersById.get(row.from_user_id)?.email || null,
    fromBusinessRole: row.from_business_role,
    toUserId: row.to_user_id,
    toUserName: usersById.get(row.to_user_id)?.name || usersById.get(row.to_user_id)?.email || null,
    toBusinessRole: row.to_business_role,
    relationshipType: row.relationship_type,
    status: row.status,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  }));
  return snapshot;
}
