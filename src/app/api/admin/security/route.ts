import { NextResponse } from "next/server";
import { getAuthSupabase, isAuthStorageConfigured, requireAdmin } from "@/features/auth/server";
import { hasPermission, type AppRole } from "@/features/security/authorization";
import { isMissingSecurityTableError } from "@/features/security/errors";
import { loadAdminSecuritySnapshot, writeOperationAudit } from "@/features/security/repository";
import { parseBusinessRoleAssignmentInput } from "@/features/operating-model/context";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

class AdminSecurityError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function text(value: unknown, field: string, max = 500): string {
  const output = String(value ?? "").trim();
  if (!output || output.length > max) throw new AdminSecurityError(`${field}不能为空且长度不能超过${max}字符`);
  return output;
}

function optionalText(value: unknown, max = 500): string | null {
  if (value === undefined || value === null || value === "") return null;
  const output = String(value).trim();
  if (output.length > max) throw new AdminSecurityError(`字段长度不能超过${max}字符`);
  return output;
}

function jsonValue(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  throw new AdminSecurityError("配置值必须是JSON对象");
}

function missingTableMessage(message: string): string {
  if (isMissingSecurityTableError(message, "project_access_requests")) return "P10 SQL 尚未执行或表不存在，请先执行 supabase-v536-security-ops.sql";
  if (
    isMissingSecurityTableError(message, "user_project_access_grants")
    || isMissingSecurityTableError(message, "operation_audit_logs")
    || isMissingSecurityTableError(message, "system_configurations")
  ) {
    return "P9 SQL 尚未执行或表不存在，请先执行 supabase-v534-enterprise-security.sql";
  }
  return message;
}

function role(value: unknown): AppRole {
  if (value === "admin" || value === "user") return value;
  throw new AdminSecurityError("角色必须是 admin 或 user");
}

function status(value: unknown): "active" | "disabled" {
  if (value === "active" || value === "disabled") return value;
  throw new AdminSecurityError("用户状态必须是 active 或 disabled");
}

function accountKind(value: unknown): "real_user" | "test_account" | "service_account" {
  if (value === "real_user" || value === "test_account" || value === "service_account") return value;
  throw new AdminSecurityError("账号类别必须是真实用户、测试账号或服务账号");
}

function accessLevel(value: unknown): "viewer" | "editor" | "owner" {
  if (value === "viewer" || value === "editor" || value === "owner") return value;
  throw new AdminSecurityError("授权级别必须是 viewer、editor 或 owner");
}

const BUSINESS_ROLES = ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"] as const;
function businessRole(value: unknown): typeof BUSINESS_ROLES[number] {
  const output = String(value || "");
  if (BUSINESS_ROLES.includes(output as typeof BUSINESS_ROLES[number])) return output as typeof BUSINESS_ROLES[number];
  throw new AdminSecurityError("业务角色不合法");
}

function reportingScope(value: unknown): "project" | "portfolio" | "organization" {
  if (value === "project" || value === "portfolio" || value === "organization") return value;
  throw new AdminSecurityError("汇报范围必须是项目、项目组合或组织");
}

export async function GET() {
  if (!isAuthStorageConfigured()) {
    return json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, 503);
  }
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, "system:admin")) return json({ error: "FORBIDDEN" }, 403);
  const snapshot = await loadAdminSecuritySnapshot();
  return json({
    ...snapshot,
    runtime: {
      authRequired: process.env.AUTH_REQUIRED === "true",
      authStorageConfigured: isAuthStorageConfigured(),
    },
  });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthStorageConfigured()) {
    return json({ error: "AUTH_STORAGE_NOT_CONFIGURED", request_id: requestId }, 503);
  }
  const admin = await requireAdmin();
  if (!admin || !hasPermission(admin, "system:admin")) {
    return json({ error: "FORBIDDEN", request_id: requestId }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "请求JSON格式错误", request_id: requestId }, 400);
  }

  const operation = text(body.operation, "operation", 80);
  const supabase = getAuthSupabase();

  try {
    if (operation === "grant_project_access") {
      const userId = text(body.userId, "userId", 80);
      const projectName = optionalText(body.projectName, 200);
      const projectCode = optionalText(body.projectCode, 100);
      if (!projectName && !projectCode) throw new AdminSecurityError("项目名称和项目编号至少填写一项");
      const level = accessLevel(body.accessLevel || "viewer");
      const reason = optionalText(body.grantReason, 500);
      const { data, error } = await supabase
        .from("user_project_access_grants")
        .insert({
          user_id: userId,
          project_name: projectName,
          project_code: projectCode,
          access_level: level,
          status: "active",
          grant_reason: reason,
          granted_by: admin.id,
          granted_by_name: admin.name || admin.email || admin.phone,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "grant_project_access",
        resourceType: "project_access",
        resourceId: data.id,
        status: "succeeded",
        severity: "medium",
        summary: `授予用户项目访问权限：${projectName || projectCode} / ${level}`,
        detail: { userId, projectName, projectCode, accessLevel: level },
        requestId,
      });
      return json({ ok: true, id: data.id, audit, request_id: requestId });
    }

    if (operation === "revoke_project_access") {
      const grantId = text(body.grantId, "grantId", 80);
      const { error } = await supabase
        .from("user_project_access_grants")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", grantId);
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "revoke_project_access",
        resourceType: "project_access",
        resourceId: grantId,
        status: "succeeded",
        severity: "medium",
        summary: "撤销项目访问授权",
        requestId,
      });
      return json({ ok: true, audit, request_id: requestId });
    }

    if (operation === "update_user_role") {
      const userId = text(body.userId, "userId", 80);
      const nextRole = role(body.role);
      const nextStatus = status(body.status || "active");
      const nextAccountKind = body.accountKind === undefined ? null : accountKind(body.accountKind);
      if (userId === admin.id && (nextRole !== "admin" || nextStatus !== "active" || (nextAccountKind !== null && nextAccountKind !== "real_user"))) {
        throw new AdminSecurityError("不能降级、禁用当前管理员或将其标记为测试/服务账号", 409);
      }
      const { error } = await supabase
        .from("app_users")
        .update({ role: nextRole, status: nextStatus, ...(nextAccountKind ? { account_kind: nextAccountKind } : {}), updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "update_user_role",
        resourceType: "app_user",
        resourceId: userId,
        status: "succeeded",
        severity: "high",
        summary: `更新用户角色/状态/账号类别：${nextRole}/${nextStatus}${nextAccountKind ? `/${nextAccountKind}` : ""}`,
        detail: { userId, role: nextRole, status: nextStatus, ...(nextAccountKind ? { accountKind: nextAccountKind } : {}) },
        requestId,
      });
      return json({ ok: true, audit, request_id: requestId });
    }

    if (operation === "save_system_config") {
      const key = text(body.configKey, "configKey", 120);
      const value = jsonValue(body.configValue);
      const category = optionalText(body.category, 80) || "security";
      const description = optionalText(body.description, 500);
      const { data, error } = await supabase
        .from("system_configurations")
        .upsert({
          config_key: key,
          config_value: value,
          category,
          description,
          updated_by: admin.id,
          updated_by_name: admin.name || admin.email || admin.phone,
          updated_at: new Date().toISOString(),
        }, { onConflict: "config_key" })
        .select("id")
        .single();
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "save_system_config",
        resourceType: "system_configuration",
        resourceId: data.id,
        status: "succeeded",
        severity: "medium",
        summary: `保存系统配置：${key}`,
        detail: { configKey: key, category },
        requestId,
      });
      return json({ ok: true, id: data.id, audit, request_id: requestId });
    }

    if (operation === "assign_business_role") {
      const assignment = parseBusinessRoleAssignmentInput({
        userId: body.userId,
        businessRole: body.businessRole,
        orgId: body.orgId,
        subjectScope: body.subjectScope,
        subjectId: body.subjectId,
        validFrom: body.validFrom || new Date().toISOString(),
        validUntil: body.validUntil || null,
        delegatedFromUserId: body.delegatedFromUserId || null,
        assignmentReason: body.assignmentReason || null,
      });
      if (assignment.subjectScope === "project") {
        const { data: project, error: projectError } = await supabase
          .from("projects")
          .select("id,org_id")
          .eq("id", assignment.subjectId)
          .maybeSingle();
        if (projectError) throw new AdminSecurityError(projectError.message, 500);
        if (!project || project.org_id !== assignment.orgId) throw new AdminSecurityError("项目不存在或不属于指定组织", 409);
      }
      const { data: existing, error: existingError } = await supabase
        .from("user_business_roles")
        .select("id")
        .eq("user_id", assignment.userId)
        .eq("business_role", assignment.businessRole)
        .eq("org_id", assignment.orgId)
        .eq("subject_scope", assignment.subjectScope)
        .eq("subject_id", assignment.subjectId)
        .eq("status", "active")
        .maybeSingle();
      if (existingError) throw new AdminSecurityError(existingError.message, 500);
      if (existing) throw new AdminSecurityError("相同范围的有效业务角色已经存在", 409);
      const { data, error } = await supabase.from("user_business_roles").insert({
        user_id: assignment.userId,
        business_role: assignment.businessRole,
        org_id: assignment.orgId,
        subject_scope: assignment.subjectScope,
        subject_id: assignment.subjectId,
        status: "active",
        valid_from: assignment.validFrom,
        valid_until: assignment.validUntil,
        delegated_from_user_id: assignment.delegatedFromUserId,
        assigned_by: admin.id,
        assignment_reason: assignment.assignmentReason,
      }).select("id").single();
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "assign_business_role",
        resourceType: "business_role_assignment",
        resourceId: data.id,
        status: "succeeded",
        severity: assignment.businessRole === "ceo" ? "high" : "medium",
        summary: `分配业务角色：${assignment.businessRole} / ${assignment.subjectScope}`,
        detail: { ...assignment },
        requestId,
      });
      return json({ ok: true, id: data.id, audit, request_id: requestId });
    }

    if (operation === "revoke_business_role") {
      const assignmentId = text(body.assignmentId, "assignmentId", 80);
      const reason = text(body.reason, "撤销原因", 500);
      const { data: existing, error: readError } = await supabase
        .from("user_business_roles")
        .select("id,business_role,subject_scope,subject_id,status")
        .eq("id", assignmentId)
        .maybeSingle();
      if (readError) throw new AdminSecurityError(readError.message, 500);
      if (!existing) throw new AdminSecurityError("业务角色分配不存在", 404);
      if (existing.status !== "active") throw new AdminSecurityError("业务角色已经失效，不能重复撤销", 409);
      const { error } = await supabase.from("user_business_roles")
        .update({ status: "revoked", assignment_reason: reason, updated_at: new Date().toISOString() })
        .eq("id", assignmentId)
        .eq("status", "active");
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "revoke_business_role",
        resourceType: "business_role_assignment",
        resourceId: assignmentId,
        status: "succeeded",
        severity: existing.business_role === "ceo" ? "high" : "medium",
        summary: `撤销业务角色：${existing.business_role} / ${existing.subject_scope}`,
        detail: { reason, subjectId: existing.subject_id },
        requestId,
      });
      return json({ ok: true, audit, request_id: requestId });
    }

    if (operation === "assign_reporting_relationship") {
      const orgId = text(body.orgId, "orgId", 80);
      const subjectScope = reportingScope(body.subjectScope);
      const subjectId = text(body.subjectId, "subjectId", 100);
      const fromUserId = text(body.fromUserId, "fromUserId", 80);
      const fromRole = businessRole(body.fromBusinessRole);
      const toUserId = text(body.toUserId, "toUserId", 80);
      const toRole = businessRole(body.toBusinessRole);
      if (fromUserId === toUserId) throw new AdminSecurityError("上报人和接收人必须是不同用户", 409);
      const validFrom = new Date(text(body.validFrom, "validFrom", 80));
      const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null;
      if (!Number.isFinite(validFrom.getTime()) || (validUntil && (!Number.isFinite(validUntil.getTime()) || validUntil < validFrom))) throw new AdminSecurityError("汇报关系有效期不合法");
      const [fromAssignment, toAssignment] = await Promise.all([
        supabase.from("user_business_roles").select("id").eq("user_id", fromUserId).eq("business_role", fromRole).eq("org_id", orgId).eq("status", "active").limit(1).maybeSingle(),
        supabase.from("user_business_roles").select("id").eq("user_id", toUserId).eq("business_role", toRole).eq("org_id", orgId).eq("status", "active").limit(1).maybeSingle(),
      ]);
      if (fromAssignment.error || toAssignment.error) throw new AdminSecurityError(fromAssignment.error?.message || toAssignment.error?.message || "业务角色校验失败", 500);
      if (!fromAssignment.data || !toAssignment.data) throw new AdminSecurityError("上报方和接收方必须先拥有同组织内的有效业务角色", 409);
      const { data, error } = await supabase.from("business_reporting_relationships").insert({
        org_id: orgId,
        subject_scope: subjectScope,
        subject_id: subjectId,
        from_user_id: fromUserId,
        from_business_role: fromRole,
        to_user_id: toUserId,
        to_business_role: toRole,
        relationship_type: body.relationshipType || "reports_to",
        status: "active",
        valid_from: validFrom.toISOString(),
        valid_until: validUntil?.toISOString() || null,
      }).select("id").single();
      if (error) throw new AdminSecurityError(error.message, error.code === "23505" ? 409 : 500);
      const audit = await writeOperationAudit({ user: admin, action: operation, resourceType: "business_reporting_relationship", resourceId: data.id, status: "succeeded", severity: "high", summary: `建立汇报关系：${fromRole} → ${toRole}`, detail: { orgId, subjectScope, subjectId, fromUserId, toUserId }, requestId });
      return json({ ok: true, id: data.id, audit, request_id: requestId });
    }

    if (operation === "revoke_reporting_relationship") {
      const relationshipId = text(body.relationshipId, "relationshipId", 80);
      const reason = text(body.reason, "撤销原因", 500);
      const { data, error } = await supabase.from("business_reporting_relationships")
        .update({ status: "revoked", revoked_reason: reason, valid_until: new Date().toISOString() })
        .eq("id", relationshipId).eq("status", "active").select("id").maybeSingle();
      if (error) throw new AdminSecurityError(error.message, 500);
      if (!data) throw new AdminSecurityError("汇报关系不存在或已经失效", 409);
      const audit = await writeOperationAudit({ user: admin, action: operation, resourceType: "business_reporting_relationship", resourceId: relationshipId, status: "succeeded", severity: "high", summary: "撤销业务汇报关系", detail: { reason }, requestId });
      return json({ ok: true, audit, request_id: requestId });
    }

    if (operation === "activate_management_rule") {
      const ruleId = text(body.ruleId, "ruleId", 80);
      if (body.confirmation !== "ACTIVATE_S1_MILESTONE_DELAY") {
        throw new AdminSecurityError("启用规则前必须完成明确确认", 409);
      }
      const { data: rule, error: readError } = await supabase.from("management_rule_versions")
        .select("id,rule_key,version,status")
        .eq("id", ruleId)
        .maybeSingle();
      if (readError) throw new AdminSecurityError(readError.message, 500);
      if (!rule) throw new AdminSecurityError("管理规则不存在", 404);
      if (rule.rule_key !== "milestone_delay" || rule.version !== "S1-MILESTONE-DELAY-v1") {
        throw new AdminSecurityError("当前入口只允许批准S1里程碑延期规则", 409);
      }
      if (rule.status === "retired") throw new AdminSecurityError("已退役规则不能重新启用", 409);
      const now = new Date().toISOString();
      const { error } = await supabase.from("management_rule_versions").update({
        status: "active",
        approved_by: admin.id,
        approved_at: now,
        effective_from: now,
      }).eq("id", ruleId).eq("status", rule.status);
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "activate_management_rule",
        resourceType: "management_rule_version",
        resourceId: ruleId,
        status: "succeeded",
        severity: "high",
        summary: `批准启用管理规则：${rule.rule_key}/${rule.version}`,
        detail: { previousStatus: rule.status },
        requestId,
      });
      return json({ ok: true, audit, request_id: requestId });
    }

    if (operation === "approve_project_access_request") {
      const accessRequestId = text(body.requestId, "requestId", 80);
      const reviewComment = optionalText(body.reviewComment, 500);
      const { data: accessRequest, error: requestError } = await supabase
        .from("project_access_requests")
        .select("id,requester_id,project_name,project_code,access_level,reason,status")
        .eq("id", accessRequestId)
        .maybeSingle();
      if (requestError) throw new AdminSecurityError(requestError.message, 500);
      if (!accessRequest) throw new AdminSecurityError("项目访问申请不存在", 404);
      if (accessRequest.status !== "pending") throw new AdminSecurityError("该申请已处理，不能重复审批", 409);

      const { data: grant, error: grantError } = await supabase
        .from("user_project_access_grants")
        .insert({
          user_id: accessRequest.requester_id,
          project_name: accessRequest.project_name,
          project_code: accessRequest.project_code,
          access_level: accessRequest.access_level,
          status: "active",
          grant_reason: accessRequest.reason,
          granted_by: admin.id,
          granted_by_name: admin.name || admin.email || admin.phone,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (grantError) throw new AdminSecurityError(grantError.message, 500);

      const { error: updateError } = await supabase
        .from("project_access_requests")
        .update({
          status: "approved",
          reviewer_id: admin.id,
          reviewer_name: admin.name || admin.email || admin.phone,
          review_comment: reviewComment,
          related_grant_id: grant.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", accessRequest.id);
      if (updateError) throw new AdminSecurityError(updateError.message, 500);

      const audit = await writeOperationAudit({
        user: admin,
        action: "approve_project_access_request",
        resourceType: "project_access_request",
        resourceId: accessRequest.id,
        status: "succeeded",
        severity: "medium",
        summary: `批准项目访问申请：${accessRequest.project_name || accessRequest.project_code} / ${accessRequest.access_level}`,
        detail: { accessRequestId, grantId: grant.id },
        requestId,
      });
      return json({ ok: true, grant_id: grant.id, audit, request_id: requestId });
    }

    if (operation === "reject_project_access_request") {
      const accessRequestId = text(body.requestId, "requestId", 80);
      const reviewComment = text(body.reviewComment, "驳回原因", 500);
      const { data: accessRequest, error: requestError } = await supabase
        .from("project_access_requests")
        .select("id,project_name,project_code,status")
        .eq("id", accessRequestId)
        .maybeSingle();
      if (requestError) throw new AdminSecurityError(requestError.message, 500);
      if (!accessRequest) throw new AdminSecurityError("项目访问申请不存在", 404);
      if (accessRequest.status !== "pending") throw new AdminSecurityError("该申请已处理，不能重复审批", 409);
      const { error: updateError } = await supabase
        .from("project_access_requests")
        .update({
          status: "rejected",
          reviewer_id: admin.id,
          reviewer_name: admin.name || admin.email || admin.phone,
          review_comment: reviewComment,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", accessRequest.id);
      if (updateError) throw new AdminSecurityError(updateError.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "reject_project_access_request",
        resourceType: "project_access_request",
        resourceId: accessRequest.id,
        status: "succeeded",
        severity: "medium",
        summary: `驳回项目访问申请：${accessRequest.project_name || accessRequest.project_code}`,
        detail: { accessRequestId },
        requestId,
      });
      return json({ ok: true, audit, request_id: requestId });
    }

    throw new AdminSecurityError("不支持的管理员安全操作", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败";
    await writeOperationAudit({
      user: admin,
      action: operation,
      resourceType: "admin_security",
      status: error instanceof AdminSecurityError && error.status < 500 ? "rejected" : "failed",
      severity: "medium",
      summary: message,
      requestId,
    });
    return json({
      error: missingTableMessage(message),
      request_id: requestId,
    }, error instanceof AdminSecurityError ? error.status : 500);
  }
}
