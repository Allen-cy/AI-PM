import { buildDashboardData } from "../dashboard/normalizer.ts";
import type { DashboardData, DashboardProjectRecord } from "../dashboard/types.ts";
import type { AppUser } from "../auth/server.ts";

export type AppRole = "admin" | "user";

export type PermissionKey =
  | "system:admin"
  | "users:review"
  | "users:manage"
  | "config:manage"
  | "audit:view"
  | "project:view"
  | "project:manage"
  | "governance:manage"
  | "risk:manage"
  | "reports:generate";

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
  category: "用户与权限" | "项目数据" | "治理流程" | "AI与报告" | "系统审计";
}

export interface ProjectAccessGrant {
  id?: string;
  userId?: string;
  projectName?: string | null;
  projectCode?: string | null;
  accessLevel: "viewer" | "editor" | "owner";
  status?: "active" | "revoked";
  grantReason?: string | null;
}

type ProjectRecordLike = DashboardProjectRecord & Record<string, unknown>;

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "system:admin", label: "系统管理员", description: "访问管理员配置中心和企业化安全设置。", category: "用户与权限" },
  { key: "users:review", label: "注册审批", description: "审核注册申请并发送一次性注册码。", category: "用户与权限" },
  { key: "users:manage", label: "用户管理", description: "调整用户角色、状态和项目授权。", category: "用户与权限" },
  { key: "config:manage", label: "系统配置", description: "维护企业级运行策略和配置说明。", category: "用户与权限" },
  { key: "audit:view", label: "审计查看", description: "查看操作审计日志和关键配置变更。", category: "系统审计" },
  { key: "project:view", label: "项目查看", description: "查看被授权或本人负责的项目数据。", category: "项目数据" },
  { key: "project:manage", label: "项目管理", description: "创建、更新项目台账和项目级授权。", category: "项目数据" },
  { key: "governance:manage", label: "治理流程", description: "创建治理流程、审批流转和输出报告。", category: "治理流程" },
  { key: "risk:manage", label: "风险管理", description: "登记风险、跟踪风险和升级问题/变更。", category: "治理流程" },
  { key: "reports:generate", label: "报告生成", description: "生成报告并转行动项。", category: "AI与报告" },
];

export const ROLE_PERMISSION_MATRIX: Record<AppRole, PermissionKey[]> = {
  admin: PERMISSION_DEFINITIONS.map(item => item.key),
  user: ["project:view", "governance:manage", "risk:manage", "reports:generate"],
};

function normalize(value: unknown): string {
  return String(value ?? "").replace(/\s/g, "").toLowerCase();
}

function text(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function permissionsForRole(role: AppRole | undefined): PermissionKey[] {
  return ROLE_PERMISSION_MATRIX[role ?? "user"] ?? ROLE_PERMISSION_MATRIX.user;
}

export function hasPermission(user: Pick<AppUser, "role"> | null | undefined, permission: PermissionKey): boolean {
  if (!user) return false;
  return permissionsForRole(user.role).includes(permission);
}

export function userMatchTokens(user?: Pick<AppUser, "name" | "email" | "phone"> | null): string[] {
  return [user?.name, user?.email, user?.phone]
    .map(item => item?.trim())
    .filter((item): item is string => Boolean(item));
}

export function recordOwnerText(record: Record<string, unknown>): string {
  return text(record, ["项目负责人", "项目经理", "责任人", "Owner", "owner", "任务负责人", "风险责任人", "负责人"]);
}

export function recordMatchesUserOwner(record: Record<string, unknown>, user?: Pick<AppUser, "name" | "email" | "phone"> | null): boolean {
  const tokens = userMatchTokens(user);
  if (tokens.length === 0) return false;
  const owner = normalize(recordOwnerText(record));
  return tokens.some(token => owner.includes(normalize(token)));
}

export function recordMatchesProjectGrant(record: Record<string, unknown>, grants: ProjectAccessGrant[] = []): boolean {
  const projectName = normalize(text(record, ["项目名称", "项目", "商机项目名称", "合同名称"]));
  const projectCode = normalize(text(record, ["项目编号", "project_id", "OA单据编号", "contract_id"]));
  return grants
    .filter(item => (item.status ?? "active") === "active")
    .some(item => {
      const grantName = normalize(item.projectName);
      const grantCode = normalize(item.projectCode);
      return Boolean((grantName && projectName && grantName === projectName) || (grantCode && projectCode && grantCode === projectCode));
    });
}

export function canAccessProjectRecord(
  user: Pick<AppUser, "role" | "name" | "email" | "phone"> | null | undefined,
  record: Record<string, unknown>,
  grants: ProjectAccessGrant[] = [],
): boolean {
  if (!user) return true;
  if (user.role === "admin") return true;
  return recordMatchesUserOwner(record, user) || recordMatchesProjectGrant(record, grants);
}

export function filterProjectRecordsByAccess<T extends Record<string, unknown>>(
  records: T[],
  user: Pick<AppUser, "role" | "name" | "email" | "phone"> | null | undefined,
  grants: ProjectAccessGrant[] = [],
): T[] {
  if (!user || user.role === "admin") return records;
  return records.filter(record => canAccessProjectRecord(user, record, grants));
}

export function filterDashboardByProjectAccess(
  dashboard: DashboardData,
  user: AppUser | null | undefined,
  grants: ProjectAccessGrant[] = [],
): DashboardData {
  if (!user || user.role === "admin") return dashboard;
  const records = filterProjectRecordsByAccess<ProjectRecordLike>(dashboard.records as ProjectRecordLike[], user, grants);
  const note = [
    dashboard.source.note,
    `已按当前用户进行项目级数据授权过滤：可见项目 ${records.length}/${dashboard.records.length} 个。`,
  ].filter(Boolean).join(" ");
  return buildDashboardData(records, {
    type: dashboard.source.type,
    name: dashboard.source.name,
    note,
  }, { useTemplateFallback: false });
}

export function projectAccessMode(user: Pick<AppUser, "role"> | null | undefined, visible: number, total: number): "admin-all" | "scoped" | "empty" | "public" {
  if (!user) return "public";
  if (user.role === "admin") return "admin-all";
  if (visible > 0) return "scoped";
  return total > 0 ? "empty" : "scoped";
}
