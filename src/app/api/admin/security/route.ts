import { NextResponse } from "next/server";
import { getAuthSupabase, isAuthStorageConfigured, requireAdmin } from "@/features/auth/server";
import { hasPermission, type AppRole } from "@/features/security/authorization";
import { loadAdminSecuritySnapshot, writeOperationAudit } from "@/features/security/repository";

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

function role(value: unknown): AppRole {
  if (value === "admin" || value === "user") return value;
  throw new AdminSecurityError("角色必须是 admin 或 user");
}

function status(value: unknown): "active" | "disabled" {
  if (value === "active" || value === "disabled") return value;
  throw new AdminSecurityError("用户状态必须是 active 或 disabled");
}

function accessLevel(value: unknown): "viewer" | "editor" | "owner" {
  if (value === "viewer" || value === "editor" || value === "owner") return value;
  throw new AdminSecurityError("授权级别必须是 viewer、editor 或 owner");
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
      if (userId === admin.id && (nextRole !== "admin" || nextStatus !== "active")) {
        throw new AdminSecurityError("不能降级或禁用当前登录管理员账号", 409);
      }
      const { error } = await supabase
        .from("app_users")
        .update({ role: nextRole, status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw new AdminSecurityError(error.message, 500);
      const audit = await writeOperationAudit({
        user: admin,
        action: "update_user_role",
        resourceType: "app_user",
        resourceId: userId,
        status: "succeeded",
        severity: "high",
        summary: `更新用户角色/状态：${nextRole}/${nextStatus}`,
        detail: { userId, role: nextRole, status: nextStatus },
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
      error: message.includes("does not exist") || message.includes("relation") ? "P9 SQL 尚未执行或表不存在，请先执行 supabase-v534-enterprise-security.sql" : message,
      request_id: requestId,
    }, error instanceof AdminSecurityError ? error.status : 500);
  }
}
