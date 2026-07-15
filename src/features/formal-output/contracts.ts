import type { BusinessRole, SubjectScope } from "../operating-model/context.ts";

export type FormalOutputDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";
export type FormalOutputType =
  | "generated_report"
  | "meeting_minutes"
  | "migration_review"
  | "migration_comparison"
  | "migration_cutover"
  | "knowledge_asset";
export type FormalOutputStatus = "draft" | "submitted" | "approved" | "published" | "superseded" | "archived";

export type FormalOutputWriteContract = {
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  projectId: string | null;
  businessRole: BusinessRole;
  dataClass: FormalOutputDataClass;
  idempotencyKey: string;
  expectedVersion: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization", "customer", "contract"]);
const WRITE_ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<FormalOutputDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export function parseFormalOutputWriteContract(value: Record<string, unknown>): FormalOutputWriteContract {
  const orgId = String(value.org_id ?? "").trim();
  const subjectScope = String(value.subject_scope ?? "").trim() as SubjectScope;
  const subjectId = String(value.subject_id ?? "").trim();
  const projectId = value.project_id ? String(value.project_id).trim() : subjectScope === "project" ? subjectId : null;
  const businessRole = String(value.business_role ?? value.role ?? "").trim() as BusinessRole;
  const dataClass = String(value.data_class ?? "").trim() as FormalOutputDataClass;
  const idempotencyKey = String(value.idempotency_key ?? "").trim();
  const expectedVersion = Number(value.expected_version);

  if (!UUID.test(orgId) || !SCOPES.has(subjectScope) || !subjectId) throw new Error("组织与业务对象为必填项。");
  if (subjectScope === "project" && !UUID.test(subjectId)) throw new Error("项目成果必须关联稳定项目UUID。");
  if (projectId && !UUID.test(projectId)) throw new Error("项目ID必须为稳定UUID。");
  if (!WRITE_ROLES.has(businessRole)) throw new Error("业务角色无权创建正式成果。");
  if (!DATA_CLASSES.has(dataClass)) throw new Error("数据分类无效。");
  if (!idempotencyKey || idempotencyKey.length > 180) throw new Error("幂等键为必填项，且不得超过180字符。");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("期望版本必须是大于或等于0的整数。");
  return { orgId, subjectScope, subjectId, projectId, businessRole, dataClass, idempotencyKey, expectedVersion };
}

export function canViewFormalOutputs(role: BusinessRole): boolean {
  return ["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"].includes(role);
}

export function canTransitionFormalOutput(role: BusinessRole, operation: string): boolean {
  if (operation === "submit") return ["pm", "operations", "pmo", "business_owner", "finance", "quality"].includes(role);
  return ["pmo", "quality"].includes(role);
}
