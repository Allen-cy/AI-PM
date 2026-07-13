import type { BusinessRole } from "../operating-model/context.ts";

export const PROJECT_DATA_CLASSES = ["production", "sample", "test", "diagnostic", "unclassified"] as const;
export type ProjectDataClass = typeof PROJECT_DATA_CLASSES[number];

export const GOVERNANCE_ARTIFACT_TYPES = ["business_case", "project_charter", "management_plan"] as const;
export type GovernanceArtifactType = typeof GOVERNANCE_ARTIFACT_TYPES[number];

export const PLAN_BASELINE_TYPES = ["scope", "schedule", "cost"] as const;
export type PlanBaselineType = typeof PLAN_BASELINE_TYPES[number];

export const GOVERNANCE_ARTIFACT_STATUSES = ["draft", "submitted", "approved", "rejected", "changes_requested", "superseded"] as const;
export type GovernanceArtifactStatus = typeof GOVERNANCE_ARTIFACT_STATUSES[number];

export const GOVERNANCE_TRANSITIONS = ["submit", "approve", "reject", "request_changes", "revise", "supersede"] as const;
export type GovernanceTransition = typeof GOVERNANCE_TRANSITIONS[number];

const BUSINESS_ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<string>(PROJECT_DATA_CLASSES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GovernanceWriteContract = {
  projectId: string;
  businessRole: BusinessRole;
  dataClass: ProjectDataClass;
  idempotencyKey: string;
  expectedVersion: number;
};

function requiredText(record: Record<string, unknown>, key: string, maximum = 240): string {
  const value = String(record[key] ?? "").trim();
  if (!value) throw new Error(`${key}为必填项。`);
  if (value.length > maximum) throw new Error(`${key}不得超过${maximum}个字符。`);
  return value;
}

export function parseGovernanceWriteContract(value: unknown): GovernanceWriteContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体必须为对象。");
  const record = value as Record<string, unknown>;
  const projectId = requiredText(record, "project_id", 80);
  const businessRole = requiredText(record, "business_role", 40) as BusinessRole;
  const dataClass = requiredText(record, "data_class", 40) as ProjectDataClass;
  const idempotencyKey = requiredText(record, "idempotency_key", 240);
  const expectedVersion = Number(record.expected_version);
  if (!UUID.test(projectId)) throw new Error("project_id必须为稳定UUID。");
  if (!BUSINESS_ROLES.has(businessRole)) throw new Error("business_role不合法。");
  if (!DATA_CLASSES.has(dataClass)) throw new Error("data_class不合法。");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("expected_version必须为大于等于0的整数。");
  return { projectId, businessRole, dataClass, idempotencyKey, expectedVersion };
}

export function nextGovernanceArtifactStatus(input: {
  status: GovernanceArtifactStatus;
  operation: string;
  businessRole: string;
}): GovernanceArtifactStatus {
  const role = input.businessRole as BusinessRole;
  const operation = input.operation as GovernanceTransition;
  const authorRoles = new Set<BusinessRole>(["pm", "operations", "pmo", "business_owner"]);
  const reviewerRoles = new Set<BusinessRole>(["pmo", "sponsor", "business_owner"]);
  const financeReviewRoles = new Set<BusinessRole>(["pmo", "sponsor", "business_owner", "finance"]);

  if (operation === "submit") {
    if (input.status !== "draft") throw new Error("STATUS_CONFLICT");
    if (!authorRoles.has(role)) throw new Error("ROLE_FORBIDDEN");
    return "submitted";
  }
  if (["approve", "reject", "request_changes"].includes(operation)) {
    if (input.status !== "submitted") throw new Error("STATUS_CONFLICT");
    if (!(operation === "approve" ? financeReviewRoles : reviewerRoles).has(role)) throw new Error("ROLE_FORBIDDEN");
    return operation === "approve" ? "approved" : operation === "reject" ? "rejected" : "changes_requested";
  }
  if (operation === "revise") {
    if (!["changes_requested", "rejected"].includes(input.status)) throw new Error("STATUS_CONFLICT");
    if (!authorRoles.has(role)) throw new Error("ROLE_FORBIDDEN");
    return "draft";
  }
  if (operation === "supersede") {
    if (input.status !== "approved") throw new Error("STATUS_CONFLICT");
    if (!reviewerRoles.has(role)) throw new Error("ROLE_FORBIDDEN");
    return "superseded";
  }
  throw new Error("TRANSITION_INVALID");
}

export function governanceArtifactLabel(type: GovernanceArtifactType): string {
  if (type === "business_case") return "商业论证";
  if (type === "project_charter") return "项目章程";
  return "项目管理计划";
}

export function baselineLabel(type: PlanBaselineType): string {
  return type === "scope" ? "范围基准" : type === "schedule" ? "进度基准" : "成本基准";
}
