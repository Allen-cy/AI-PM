import type { BusinessRole } from "@/features/operating-model/context";

export type CommercialQualityDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export type CommercialQualityWriteContract = {
  projectId: string;
  businessRole: BusinessRole;
  dataClass: CommercialQualityDataClass;
  idempotencyKey: string;
  expectedVersion: number;
};

export type CommercialQualityDomain = "contract" | "quality_plan" | "defect" | "acceptance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<CommercialQualityDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("写入请求必须为结构化对象。");
  return value as Record<string, unknown>;
}

export function parseCommercialQualityWriteContract(value: unknown): CommercialQualityWriteContract {
  const input = record(value);
  const projectId = String(input.project_id ?? "").trim();
  const businessRole = String(input.business_role ?? "").trim() as BusinessRole;
  const dataClass = String(input.data_class ?? "").trim() as CommercialQualityDataClass;
  const idempotencyKey = String(input.idempotency_key ?? "").trim();
  const expectedVersion = Number(input.expected_version);

  if (!UUID.test(projectId)) throw new Error("必须提供稳定项目UUID，不能使用项目名称代替。");
  if (!ROLES.has(businessRole)) throw new Error("业务角色不在商财质量管理授权范围内。");
  if (!DATA_CLASSES.has(dataClass)) throw new Error("数据分类不合法。");
  if (!idempotencyKey || idempotencyKey.length > 240) throw new Error("idempotency_key为必填项，且不得超过240字符。");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("期望版本必须为不小于0的整数。");

  return { projectId, businessRole, dataClass, idempotencyKey, expectedVersion };
}

type TransitionInput = {
  domain: CommercialQualityDomain;
  status: string;
  operation: string;
  businessRole: string;
};

const AUTHOR_ROLES = new Set(["pm", "operations", "quality"]);
const APPROVER_ROLES = new Set(["pmo", "sponsor", "business_owner", "finance", "quality"]);

export function nextCommercialQualityStatus(input: TransitionInput): string {
  const key = `${input.status}:${input.operation}`;

  if (input.domain === "contract") {
    if (key === "draft:submit") {
      if (!AUTHOR_ROLES.has(input.businessRole)) throw new Error("ROLE_FORBIDDEN");
      return "submitted";
    }
    if (key === "submitted:activate") {
      if (!["finance", "business_owner", "sponsor"].includes(input.businessRole)) throw new Error("ROLE_FORBIDDEN");
      return "active";
    }
    if (key === "submitted:request_changes") {
      if (!APPROVER_ROLES.has(input.businessRole)) throw new Error("ROLE_FORBIDDEN");
      return "changes_requested";
    }
    if (key === "changes_requested:revise") {
      if (!AUTHOR_ROLES.has(input.businessRole)) throw new Error("ROLE_FORBIDDEN");
      return "draft";
    }
    if (key === "active:close") {
      if (!["finance", "business_owner", "pmo"].includes(input.businessRole)) throw new Error("ROLE_FORBIDDEN");
      return "closed";
    }
  }

  if (input.domain === "quality_plan") {
    if (key === "draft:submit" && ["pm", "quality"].includes(input.businessRole)) return "submitted";
    if (key === "submitted:approve" && ["quality", "pmo", "business_owner"].includes(input.businessRole)) return "approved";
    if (key === "submitted:request_changes" && ["quality", "pmo", "business_owner"].includes(input.businessRole)) return "changes_requested";
    if (key === "changes_requested:revise" && ["pm", "quality"].includes(input.businessRole)) return "draft";
    if (key === "approved:supersede" && ["quality", "pmo"].includes(input.businessRole)) return "superseded";
  }

  if (input.domain === "defect") {
    if (key === "open:start" && ["pm", "operations", "quality"].includes(input.businessRole)) return "in_progress";
    if (key === "in_progress:submit_verification" && ["pm", "operations", "quality"].includes(input.businessRole)) return "ready_for_verification";
    if (key === "ready_for_verification:verify" && input.businessRole === "quality") return "closed";
    if (key === "ready_for_verification:reject_verification" && input.businessRole === "quality") return "in_progress";
    if (key === "open:reject" && input.businessRole === "quality") return "rejected";
  }

  if (input.domain === "acceptance") {
    if (key === "draft:submit" && ["pm", "operations"].includes(input.businessRole)) return "submitted";
    if (key === "submitted:start_review" && ["quality", "business_owner", "sponsor"].includes(input.businessRole)) return "in_review";
    if (key === "in_review:approve" && ["business_owner", "sponsor"].includes(input.businessRole)) return "approved";
    if (key === "in_review:request_changes" && ["quality", "business_owner", "sponsor"].includes(input.businessRole)) return "changes_requested";
    if (key === "in_review:reject" && ["business_owner", "sponsor"].includes(input.businessRole)) return "rejected";
    if (key === "changes_requested:revise" && ["pm", "operations"].includes(input.businessRole)) return "draft";
    if (key === "approved:close" && ["pmo", "business_owner", "sponsor"].includes(input.businessRole)) return "closed";
  }

  if (["submitted:approve", "submitted:activate", "in_review:approve"].includes(key)) throw new Error("ROLE_FORBIDDEN");
  throw new Error("STATUS_CONFLICT");
}

export function requireObject(value: unknown, label: string): Record<string, unknown> {
  try {
    return record(value);
  } catch {
    throw new Error(`${label}必须为结构化对象。`);
  }
}

export function requireArray(value: unknown, label: string, maximum = 500): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label}必须为不超过${maximum}条的结构化数组。`);
  return value.map((item) => requireObject(item, label));
}
