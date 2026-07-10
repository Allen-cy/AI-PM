import type { SubjectScope } from "../operating-model/context.ts";
import type { AssistantDataClass, AssistantRole } from "./snapshot.ts";

export type AssistantChangeSourceType = "project" | "milestone" | "risk" | "action" | "contract" | "payment";

export interface AssistantFieldChange {
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
}

export interface AssistantChangeDraftInput {
  role: AssistantRole;
  projectId: string;
  sourceType: AssistantChangeSourceType;
  sourceRecordId: string;
  changes: AssistantFieldChange[];
}

export interface BusinessUpdateFeishuPayload extends Record<string, unknown> {
  type: "base_record_update";
  idempotency_key: string;
  business_update_draft_id: string;
  org_id: string;
  project_id: string;
  data_class: AssistantDataClass;
  table_key: Exclude<AssistantChangeSourceType, "action">;
  record_id: string;
  fields: Record<string, unknown>;
  expected_fields: Record<string, unknown>;
}

const ALLOWED_FIELDS: Record<AssistantRole, Record<AssistantChangeSourceType, readonly string[]>> = {
  pm: {
    project: ["客户承诺日期", "预测完成日期", "当前进度", "项目状态", "重点项目标记"],
    milestone: ["预测日期", "状态", "责任人", "完成进度", "影响关键路径", "影响验收", "影响回款"],
    risk: ["风险描述", "风险等级", "状态", "风险责任人", "截止日期", "应对措施"],
    action: ["状态", "截止日期", "责任人", "完成证据"],
    contract: [],
    payment: [],
  },
  operations: {
    project: ["验收状态", "预计验收日期", "实际验收日期"],
    milestone: [],
    risk: [],
    action: [],
    contract: ["合同状态", "付款条件", "合同金额", "签订日期"],
    payment: ["应收金额", "已回款金额", "计划回款日期", "实际回款日期", "开票金额", "开票日期", "发票状态"],
  },
};

function requiredText(record: Record<string, unknown>, key: string, maximum = 200): string {
  const value = typeof record[key] === "string" ? record[key].trim() : "";
  if (!value || value.length > maximum) throw new Error(`${key}为必填字段`);
  return value;
}

function comparable(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).trim();
}

export function parseAssistantChangeDraftInput(value: unknown): AssistantChangeDraftInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("请求体为必填对象");
  const record = value as Record<string, unknown>;
  const role = requiredText(record, "role", 32) as AssistantRole;
  if (role !== "pm" && role !== "operations") throw new Error("role不合法");
  const sourceType = requiredText(record, "sourceType", 32) as AssistantChangeSourceType;
  if (!(sourceType in ALLOWED_FIELDS[role])) throw new Error("sourceType不合法");
  if (!Array.isArray(record.changes) || record.changes.length === 0 || record.changes.length > 20) throw new Error("changes必须包含1至20项变化");
  const changes = record.changes.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`changes[${index}]不合法`);
    const change = item as Record<string, unknown>;
    const field = requiredText(change, "field", 80);
    if (!ALLOWED_FIELDS[role][sourceType].includes(field)) throw new Error(`${role}不允许修改${sourceType}.${field}`);
    const reason = requiredText(change, "reason", 500);
    if (comparable(change.currentValue) === comparable(change.proposedValue)) throw new Error(`${field}没有发生变化`);
    return { field, currentValue: change.currentValue ?? null, proposedValue: change.proposedValue ?? null, reason };
  });
  if (new Set(changes.map(change => change.field)).size !== changes.length) throw new Error("同一字段不能重复提交");
  return {
    role,
    projectId: requiredText(record, "projectId", 80),
    sourceType,
    sourceRecordId: requiredText(record, "sourceRecordId", 160),
    changes,
  };
}

export function validateDraftChangesAgainstSnapshot(
  input: AssistantChangeDraftInput,
  currentFacts: Record<string, unknown>,
): void {
  for (const change of input.changes) {
    if (comparable(currentFacts[change.field]) !== comparable(change.currentValue)) {
      throw new Error(`${change.field}的当前事实已发生变化，请刷新后重新填写`);
    }
  }
}

export function buildAssistantChangeDraftInsert(input: {
  input: AssistantChangeDraftInput;
  actorUserId: string;
  orgId: string;
  subjectScope: SubjectScope;
  subjectId: string;
  dataClass: AssistantDataClass;
  requestId: string;
}) {
  return {
    org_id: input.orgId,
    subject_scope: input.subjectScope,
    subject_id: input.subjectId,
    project_id: input.input.projectId,
    business_role: input.input.role,
    source_type: input.input.sourceType,
    source_record_id: input.input.sourceRecordId,
    data_class: input.dataClass,
    changes: input.input.changes,
    status: "pending_confirmation",
    writeback_status: "not_requested",
    requested_by: input.actorUserId,
    request_id: input.requestId,
  } as const;
}

export function buildBusinessUpdateFeishuPayload(input: {
  draftId: string;
  orgId: string;
  projectId: string;
  dataClass: AssistantDataClass;
  sourceType: AssistantChangeSourceType;
  sourceRecordId: string;
  version: number;
  changes: AssistantFieldChange[];
}): BusinessUpdateFeishuPayload {
  if (input.sourceType === "action") {
    throw new Error("行动项必须通过Supabase受控状态机流转，不能进入飞书Base写回队列。");
  }
  const fields = Object.fromEntries(input.changes.map(change => [change.field, change.proposedValue]));
  const expectedFields = Object.fromEntries(input.changes.map(change => [change.field, change.currentValue]));
  return {
    type: "base_record_update",
    idempotency_key: `business-update-draft:${input.draftId}:v${input.version}`,
    business_update_draft_id: input.draftId,
    org_id: input.orgId,
    project_id: input.projectId,
    data_class: input.dataClass,
    table_key: input.sourceType,
    record_id: input.sourceRecordId,
    fields,
    expected_fields: expectedFields,
  };
}
