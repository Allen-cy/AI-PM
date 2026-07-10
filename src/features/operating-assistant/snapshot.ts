export type AssistantRole = "pm" | "operations";
export type AssistantDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export interface AssistantProjectIdentity {
  projectId: string;
  projectName: string;
  sourceRecordId: string;
  externalProjectCode: string | null;
  dataClass: AssistantDataClass;
}

export interface AssistantFeishuRecord {
  recordId: string;
  fields: Record<string, unknown>;
}

export interface AssistantSourceState {
  type: "feishu+supabase";
  fallbackUsed: false;
  warnings: string[];
}

export interface AssistantDraftTarget {
  projectId: string;
  projectName: string;
  sourceType: "project" | "milestone" | "risk" | "action" | "contract" | "payment";
  sourceRecordId: string;
  label: string;
  editableFacts: Record<string, unknown>;
}

export interface PmAssistantSnapshot {
  role: "pm";
  projects: Array<{
    projectId: string;
    projectName: string;
    externalProjectCode: string | null;
    commitment: {
      customerDueDate: string | null;
      forecastDueDate: string | null;
      status: string | null;
      progress: number | null;
      sourceRecordId: string;
    };
  }>;
  milestones: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    name: string;
    baselineDate: string | null;
    forecastDate: string | null;
    status: string | null;
    owner: string | null;
  }>;
  risks: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    description: string;
    level: string | null;
    status: string | null;
    owner: string | null;
    dueDate: string | null;
  }>;
  actions: Array<{
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    status: string | null;
    priority: string | null;
    dueDate: string | null;
    owner: string | null;
  }>;
  draftTargets: AssistantDraftTarget[];
  source: AssistantSourceState;
}

export interface OperationsAssistantSnapshot {
  role: "operations";
  contracts: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    contractCode: string;
    amount: number | null;
    status: string | null;
    paymentTerms: string | null;
  }>;
  acceptances: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    status: string;
    plannedDate: string | null;
    actualDate: string | null;
  }>;
  invoices: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    contractCode: string | null;
    amount: number | null;
    invoiceDate: string | null;
    status: string | null;
  }>;
  receivables: Array<{
    projectId: string;
    projectName: string;
    sourceRecordId: string;
    contractCode: string | null;
    receivableAmount: number | null;
    collectedAmount: number | null;
    outstandingAmount: number | null;
    plannedCollectionDate: string | null;
  }>;
  cashForecast: Array<{ month: string; amount: number; recordCount: number }>;
  draftTargets: AssistantDraftTarget[];
  source: AssistantSourceState;
}

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  const first = value[0];
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    return record.text ?? record.name ?? record.value ?? record.record_id ?? record.id ?? null;
  }
  return first;
}

function firstValue(fields: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = scalar(fields[name]);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function textValue(fields: Record<string, unknown>, names: string[]): string | null {
  const value = firstValue(fields, names);
  if (value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberValue(fields: Record<string, unknown>, names: string[]): number | null {
  const value = firstValue(fields, names);
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const numeric = Number(String(value).replace(/[,，￥¥万元元%\s]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function dateValue(fields: Record<string, unknown>, names: string[]): string | null {
  const value = firstValue(fields, names);
  if (value === null) return null;
  if (typeof value === "number" || /^\d{13}$/.test(String(value))) {
    const timestamp = Number(value);
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const matched = text.match(/^\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : text || null;
}

function normalizedKey(value: unknown): string {
  return String(scalar(value) ?? "").trim().toLowerCase();
}

function exactUniqueIdentity(
  identities: AssistantProjectIdentity[],
  predicate: (identity: AssistantProjectIdentity) => boolean,
): AssistantProjectIdentity | null {
  const matches = identities.filter(predicate);
  const projectIds = [...new Set(matches.map(identity => identity.projectId))];
  return projectIds.length === 1 ? matches[0] : null;
}

/**
 * Project names are intentionally ignored. Names are mutable and non-unique;
 * only canonical IDs, external project codes and source record IDs may link facts.
 */
export function matchFeishuRecordToProject(
  record: AssistantFeishuRecord,
  identities: AssistantProjectIdentity[],
): AssistantProjectIdentity | null {
  const sourceRecordId = normalizedKey(record.recordId);
  const sourceMatch = exactUniqueIdentity(identities, identity => normalizedKey(identity.sourceRecordId) === sourceRecordId);
  if (sourceMatch) return sourceMatch;

  const relatedSourceId = normalizedKey(firstValue(record.fields, ["关联项目记录ID", "项目记录ID", "关联项目ID"]));
  if (relatedSourceId) {
    const relatedSourceMatch = exactUniqueIdentity(identities, identity => normalizedKey(identity.sourceRecordId) === relatedSourceId);
    if (relatedSourceMatch) return relatedSourceMatch;
  }

  const canonicalId = normalizedKey(firstValue(record.fields, ["项目UUID", "canonical_project_id", "项目ID"]));
  if (canonicalId) {
    const canonicalMatch = exactUniqueIdentity(identities, identity => normalizedKey(identity.projectId) === canonicalId);
    if (canonicalMatch) return canonicalMatch;
  }

  const projectCode = normalizedKey(firstValue(record.fields, ["项目编号", "关联项目编号", "外部项目编号", "project_id"]));
  if (!projectCode) return null;
  return exactUniqueIdentity(identities, identity => normalizedKey(identity.externalProjectCode) === projectCode);
}

function identityMap(identities: AssistantProjectIdentity[]): Map<string, AssistantProjectIdentity> {
  return new Map(identities.map(identity => [identity.projectId, identity]));
}

function source(warnings: string[]): AssistantSourceState {
  return { type: "feishu+supabase", fallbackUsed: false, warnings: [...new Set(warnings)] };
}

export function buildPmAssistantSnapshot(input: {
  identities: AssistantProjectIdentity[];
  projects: AssistantFeishuRecord[];
  milestones: AssistantFeishuRecord[];
  risks: AssistantFeishuRecord[];
  actions: Array<Record<string, unknown>>;
  sourceWarnings: string[];
}): PmAssistantSnapshot {
  const identitiesById = identityMap(input.identities);
  const draftTargets: AssistantDraftTarget[] = [];
  const projects = input.projects.flatMap(record => {
    const identity = matchFeishuRecordToProject(record, input.identities);
    if (!identity) return [];
    const projectName = textValue(record.fields, ["项目名称"]) ?? identity.projectName;
    draftTargets.push({
      projectId: identity.projectId, projectName, sourceType: "project", sourceRecordId: record.recordId,
      label: `${projectName} · 项目承诺`, editableFacts: readAssistantEditableFacts("pm", "project", record.fields),
    });
    return [{
      projectId: identity.projectId,
      projectName,
      externalProjectCode: identity.externalProjectCode,
      commitment: {
        customerDueDate: dateValue(record.fields, ["客户承诺日期", "承诺交付日期", "承诺完成日期", "合同交付日期"]),
        forecastDueDate: dateValue(record.fields, ["预测完成日期", "预计完成日期", "计划交付日期", "计划完成日期"]),
        status: textValue(record.fields, ["项目状态", "当前状态", "状态"]),
        progress: numberValue(record.fields, ["当前进度", "项目进度", "完成进度"]),
        sourceRecordId: record.recordId,
      },
    }];
  });

  const milestones = input.milestones.flatMap(record => {
    const identity = matchFeishuRecordToProject(record, input.identities);
    if (!identity) return [];
    const name = textValue(record.fields, ["里程碑名称", "名称", "里程碑"]) ?? "未命名里程碑";
    draftTargets.push({
      projectId: identity.projectId, projectName: identity.projectName, sourceType: "milestone", sourceRecordId: record.recordId,
      label: `${identity.projectName} · 里程碑 · ${name}`, editableFacts: readAssistantEditableFacts("pm", "milestone", record.fields),
    });
    return [{
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      name,
      baselineDate: dateValue(record.fields, ["基线日期", "基线完成日期", "计划日期"]),
      forecastDate: dateValue(record.fields, ["预测日期", "预测完成日期", "预计完成日期"]),
      status: textValue(record.fields, ["状态", "里程碑状态"]),
      owner: textValue(record.fields, ["责任人", "里程碑责任人", "负责人"]),
    }];
  });

  const risks = input.risks.flatMap(record => {
    const identity = matchFeishuRecordToProject(record, input.identities);
    if (!identity) return [];
    const description = textValue(record.fields, ["风险描述", "风险名称", "风险事项"]) ?? "未命名风险";
    draftTargets.push({
      projectId: identity.projectId, projectName: identity.projectName, sourceType: "risk", sourceRecordId: record.recordId,
      label: `${identity.projectName} · 风险 · ${description}`, editableFacts: readAssistantEditableFacts("pm", "risk", record.fields),
    });
    return [{
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      description,
      level: textValue(record.fields, ["风险等级", "严重度", "等级"]),
      status: textValue(record.fields, ["状态", "风险状态"]),
      owner: textValue(record.fields, ["风险责任人", "责任人", "负责人"]),
      dueDate: dateValue(record.fields, ["截止日期", "应对期限", "计划完成日期"]),
    }];
  });

  const actions = input.actions.flatMap(row => {
    const projectId = String(row.project_id ?? row.projectId ?? "");
    const identity = identitiesById.get(projectId);
    if (!identity) return [];
    const title = String(row.title ?? "未命名行动");
    const actionFacts = {
      状态: row.status ?? null,
      截止日期: row.due_date ? String(row.due_date).slice(0, 10) : null,
      责任人: row.owner ?? row.owner_user_id ?? null,
      完成证据: row.close_evidence ?? null,
    };
    draftTargets.push({
      projectId, projectName: identity.projectName, sourceType: "action", sourceRecordId: String(row.id),
      label: `${identity.projectName} · 行动 · ${title}`, editableFacts: readAssistantEditableFacts("pm", "action", actionFacts),
    });
    return [{
      id: String(row.id),
      projectId,
      projectName: identity.projectName,
      title,
      status: row.status ? String(row.status) : null,
      priority: row.priority ? String(row.priority) : null,
      dueDate: row.due_date ? String(row.due_date).slice(0, 10) : null,
      owner: row.owner_name ? String(row.owner_name) : row.owner ? String(row.owner) : row.owner_user_id ? String(row.owner_user_id) : null,
    }];
  });

  return { role: "pm", projects, milestones, risks, actions, draftTargets, source: source(input.sourceWarnings) };
}

export function buildOperationsAssistantSnapshot(input: {
  identities: AssistantProjectIdentity[];
  projects: AssistantFeishuRecord[];
  contracts: AssistantFeishuRecord[];
  payments: AssistantFeishuRecord[];
  sourceWarnings: string[];
}): OperationsAssistantSnapshot {
  const draftTargets: AssistantDraftTarget[] = [];
  const contracts = input.contracts.flatMap(record => {
    const identity = matchFeishuRecordToProject(record, input.identities);
    if (!identity) return [];
    const contractCode = textValue(record.fields, ["合同编号", "合同号"]) ?? "未登记合同编号";
    draftTargets.push({
      projectId: identity.projectId, projectName: identity.projectName, sourceType: "contract", sourceRecordId: record.recordId,
      label: `${identity.projectName} · 合同 · ${contractCode}`, editableFacts: readAssistantEditableFacts("operations", "contract", record.fields),
    });
    return [{
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      contractCode,
      amount: numberValue(record.fields, ["合同金额", "含税合同金额"]),
      status: textValue(record.fields, ["合同状态", "状态"]),
      paymentTerms: textValue(record.fields, ["付款条件", "付款条款", "结算条件"]),
    }];
  });

  const acceptances = input.projects.flatMap(record => {
    const identity = matchFeishuRecordToProject(record, input.identities);
    const status = textValue(record.fields, ["验收状态", "客户验收状态"]);
    if (!identity || !status) return [];
    draftTargets.push({
      projectId: identity.projectId, projectName: identity.projectName, sourceType: "project", sourceRecordId: record.recordId,
      label: `${identity.projectName} · 验收`, editableFacts: readAssistantEditableFacts("operations", "project", record.fields),
    });
    return [{
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      status,
      plannedDate: dateValue(record.fields, ["预计验收日期", "计划验收日期"]),
      actualDate: dateValue(record.fields, ["实际验收日期", "验收日期"]),
    }];
  });

  const invoices: OperationsAssistantSnapshot["invoices"] = [];
  const receivables: OperationsAssistantSnapshot["receivables"] = [];
  const forecast = new Map<string, { amount: number; recordCount: number }>();
  for (const record of input.payments) {
    const identity = matchFeishuRecordToProject(record, input.identities);
    if (!identity) continue;
    const contractCode = textValue(record.fields, ["合同编号", "合同号"]);
    draftTargets.push({
      projectId: identity.projectId, projectName: identity.projectName, sourceType: "payment", sourceRecordId: record.recordId,
      label: `${identity.projectName} · 回款/开票 · ${contractCode ?? record.recordId}`, editableFacts: readAssistantEditableFacts("operations", "payment", record.fields),
    });
    const invoiceAmount = numberValue(record.fields, ["开票金额", "发票金额"]);
    const invoiceDate = dateValue(record.fields, ["开票日期", "发票日期"]);
    const invoiceStatus = textValue(record.fields, ["发票状态", "开票状态"]);
    if (invoiceAmount !== null || invoiceDate || invoiceStatus) invoices.push({
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      contractCode,
      amount: invoiceAmount,
      invoiceDate,
      status: invoiceStatus,
    });
    const receivableAmount = numberValue(record.fields, ["应收金额", "计划回款金额", "回款金额"]);
    const collectedAmount = numberValue(record.fields, ["已回款金额", "实收金额", "实际回款金额"]);
    const outstandingAmount = receivableAmount === null
      ? null
      : Math.max(0, receivableAmount - (collectedAmount ?? 0));
    const plannedCollectionDate = dateValue(record.fields, ["计划回款日期", "应收日期", "预计回款日期", "到期日"]);
    if (receivableAmount !== null || collectedAmount !== null || plannedCollectionDate) receivables.push({
      projectId: identity.projectId,
      projectName: identity.projectName,
      sourceRecordId: record.recordId,
      contractCode,
      receivableAmount,
      collectedAmount,
      outstandingAmount,
      plannedCollectionDate,
    });
    if (plannedCollectionDate && outstandingAmount !== null && outstandingAmount > 0) {
      const month = plannedCollectionDate.slice(0, 7);
      const current = forecast.get(month) ?? { amount: 0, recordCount: 0 };
      current.amount += outstandingAmount;
      current.recordCount += 1;
      forecast.set(month, current);
    }
  }

  return {
    role: "operations",
    contracts,
    acceptances,
    invoices,
    receivables,
    cashForecast: [...forecast.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, item]) => ({ month, amount: Number(item.amount.toFixed(2)), recordCount: item.recordCount })),
    draftTargets,
    source: source(input.sourceWarnings),
  };
}

export function readAssistantEditableFacts(
  role: AssistantRole,
  sourceType: "project" | "milestone" | "risk" | "action" | "contract" | "payment",
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const allowed = role === "pm"
    ? {
      project: ["客户承诺日期", "预测完成日期", "当前进度", "项目状态", "重点项目标记"],
      milestone: ["预测日期", "状态", "责任人", "完成进度", "影响关键路径", "影响验收", "影响回款"],
      risk: ["风险描述", "风险等级", "状态", "风险责任人", "截止日期", "应对措施"],
      action: ["状态", "截止日期", "责任人", "完成证据"],
      contract: [], payment: [],
    }
    : {
      project: ["验收状态", "预计验收日期", "实际验收日期"],
      milestone: [], risk: [], action: [],
      contract: ["合同状态", "付款条件", "合同金额", "签订日期"],
      payment: ["应收金额", "已回款金额", "计划回款日期", "实际回款日期", "开票金额", "开票日期", "发票状态"],
    };
  return Object.fromEntries(allowed[sourceType].map(field => [field, scalar(fields[field]) ?? null]));
}
