import type { FeishuRecordItem } from "./client.ts";
import type { FeishuTableKey } from "./config.ts";

export const FEISHU_RECONCILE_DOMAINS = [
  "project",
  "milestone",
  "task",
  "risk",
  "contract",
  "payment",
  "cost",
  "syncLedger",
] as const satisfies readonly FeishuTableKey[];

export type FeishuReconcileDomain = typeof FEISHU_RECONCILE_DOMAINS[number];
export type FeishuReconcileDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export interface FeishuProjectReference {
  sourceRecordId: string | null;
  projectCode: string | null;
}

export interface FeishuReconcileQualityIssue {
  code: string;
  field: string | null;
  message: string;
  severity: "error" | "warning";
}

export interface NormalizedFeishuRecord {
  domain: FeishuReconcileDomain;
  data_class: FeishuReconcileDataClass;
  source: {
    system: "feishu";
    container_id: string;
    record_id: string;
    updated_at: string | null;
  };
  project_reference: FeishuProjectReference;
  payload: Record<string, unknown>;
  labels: Record<string, string>;
  quality: {
    status: "ready" | "quarantine";
    issues: FeishuReconcileQualityIssue[];
  };
  row_hash: string;
  raw_fields: Record<string, unknown>;
}

const DATA_CLASS_VALUES = new Set<FeishuReconcileDataClass>([
  "production", "sample", "test", "diagnostic", "unclassified",
]);

const DOMAIN_LABELS: Record<FeishuReconcileDomain, Record<string, string>> = {
  project: {
    project_code: "项目编号", project_name: "项目名称", province: "省份", product_category: "产品类别",
    project_type: "项目类型", channel: "渠道名称", sales_owner: "销售负责人", contract_date: "签约日期",
    deadline: "截止日期", plan_delivery_date: "计划完成", status: "项目状态", progress: "当前进度",
    project_level: "项目等级", is_key_project: "重点项目标记", contract_amount: "合同金额",
    collection_amount: "已回款金额", receivable: "应收金额", payment_terms: "付款条件",
  },
  milestone: {
    milestone_name: "里程碑名称", baseline_date: "基线日期", forecast_date: "预测完成日期",
    actual_date: "实际完成", status: "里程碑状态", owner: "责任人", progress: "完成进度",
  },
  task: {
    task_name: "任务名称", plan_start: "计划开始", plan_end: "计划完成", actual_start: "实际开始",
    actual_end: "实际完成", status: "任务状态", progress: "完成进度", assignee: "责任人", predecessors: "前置任务",
  },
  risk: {
    risk_code: "风险编号", description: "风险描述", category: "风险类别", probability: "发生概率",
    impact: "影响程度", risk_score: "风险值", status: "风险状态", response_strategy: "应对策略",
    response_action: "应对措施", owner: "风险责任人", trigger_condition: "触发条件",
    due_date: "截止日期", next_review_date: "复核日期",
  },
  contract: {
    contract_code: "合同编号", contract_name: "合同名称", party_a: "客户名称", party_b: "乙方",
    total_amount: "合同金额", signed_date: "签约日期", status: "合同状态", payment_terms: "付款条件",
  },
  payment: {
    payment_code: "回款编号", payment_name: "回款事项", contract_code: "合同编号",
    contract_source_record_id: "合同记录ID", receivable_amount: "应收金额", collected_amount: "已回款金额",
    write_off_amount: "核销金额", due_date: "到期日期", actual_paid_date: "实收日期", status: "回款状态",
  },
  cost: {
    cost_code: "成本编号", period: "期间", planned_value: "计划成本", actual_cost: "实际成本",
    earned_value: "挣值", status: "成本状态",
  },
  syncLedger: {
    event_id: "事件ID", event_type: "事件类型", processing_status: "处理状态", severity: "严重程度",
    summary: "摘要", error_message: "错误信息", attempts: "尝试次数", request_id: "请求ID",
  },
};

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  const first = value[0];
  if (!first || typeof first !== "object") return first;
  const item = first as Record<string, unknown>;
  return item.record_id ?? item.id ?? item.text ?? item.name ?? item.value ?? null;
}

function first(fields: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = scalar(fields[name]);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function text(fields: Record<string, unknown>, names: string[]): string | null {
  const value = first(fields, names);
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numeric(fields: Record<string, unknown>, names: string[]): number | null {
  const value = first(fields, names);
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/[,，￥¥元万元%\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function progress(fields: Record<string, unknown>, names: string[]): number | null {
  const value = numeric(fields, names);
  if (value === null) return null;
  const normalized = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, Math.round(normalized * 100) / 100));
}

function date(fields: Record<string, unknown>, names: string[]): string | null {
  const value = first(fields, names);
  if (value === null) return null;
  const raw = typeof value === "number" ? value : /^\d{10,13}$/.test(String(value)) ? Number(value) : null;
  if (raw !== null) {
    const parsed = new Date(raw < 100000000000 ? raw * 1000 : raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  const normalized = String(value).trim();
  const matched = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  return matched?.[0] ?? (normalized || null);
}

function boolean(fields: Record<string, unknown>, names: string[]): boolean | null {
  const value = first(fields, names);
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "是", "重点", "已标记"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "否", "非重点", "未标记"].includes(normalized)) return false;
  return null;
}

function normalizedDataClass(value: unknown): FeishuReconcileDataClass | null {
  const normalized = String(scalar(value) ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (["production", "正式", "生产", "业务"].includes(normalized)) return "production";
  if (["sample", "样例", "示例", "演示"].includes(normalized)) return "sample";
  if (["test", "测试"].includes(normalized)) return "test";
  if (["diagnostic", "诊断"].includes(normalized)) return "diagnostic";
  if (["unclassified", "未分类"].includes(normalized)) return "unclassified";
  return DATA_CLASS_VALUES.has(normalized as FeishuReconcileDataClass) ? normalized as FeishuReconcileDataClass : null;
}

export function classifyFeishuDataClass(fields: Record<string, unknown>): FeishuReconcileDataClass {
  const explicit = normalizedDataClass(first(fields, ["数据分类", "data_class", "数据空间", "数据类型"]));
  if (explicit) return explicit;
  if (text(fields, ["样例来源", "sample_source"])) return "sample";
  if (text(fields, ["测试批次", "test_batch"])) return "test";
  if (text(fields, ["诊断批次", "diagnostic_batch"])) return "diagnostic";
  return "unclassified";
}

export function projectReferenceFromFields(fields: Record<string, unknown>): FeishuProjectReference {
  return {
    sourceRecordId: text(fields, ["关联项目记录ID", "项目记录ID", "关联项目ID", "项目", "关联项目"]),
    projectCode: text(fields, ["项目编号", "关联项目编号", "外部项目编号", "样例项目编号", "project_id", "project_code"]),
  };
}

function normalizePayload(domain: FeishuReconcileDomain, fields: Record<string, unknown>): Record<string, unknown> {
  switch (domain) {
    case "project":
      return {
        project_code: text(fields, ["项目编号", "项目ID", "project_id", "source_record_id"]),
        project_name: text(fields, ["项目名称", "项目", "商机项目名称", "合同名称"]),
        province: text(fields, ["省份", "区域"]),
        product_category: text(fields, ["产品类别", "产品分类"]),
        project_type: text(fields, ["项目类型", "样例项目类型"]),
        channel: text(fields, ["渠道名称", "渠道"]),
        sales_owner: text(fields, ["销售负责人", "销售"]),
        contract_date: date(fields, ["签约日期", "签订日期", "签约时间", "合同日期"]),
        deadline: date(fields, ["截止日期", "到期日期", "回款到期日"]),
        plan_delivery_date: date(fields, ["计划完成", "计划交付时间", "计划交付日期", "截止时间"]),
        status: text(fields, ["项目状态", "当前状态", "状态"]),
        progress: progress(fields, ["当前进度", "项目进度", "完成度"]),
        project_level: text(fields, ["项目等级", "项目分级"]),
        is_key_project: boolean(fields, ["重点项目标记", "重点项目", "是否重点项目"]),
        contract_amount: numeric(fields, ["合同金额", "合同额", "合同总额"]),
        collection_amount: numeric(fields, ["已回款金额", "回款额", "实收金额"]),
        receivable: numeric(fields, ["应收金额", "应催账款"]),
        payment_terms: text(fields, ["付款条件", "付款条款", "结算条件"]),
      };
    case "milestone":
      return {
        milestone_name: text(fields, ["里程碑名称", "名称", "里程碑"]),
        baseline_date: date(fields, ["基线日期", "基线完成日期", "计划完成", "计划日期"]),
        forecast_date: date(fields, ["预测完成日期", "预测日期", "预计完成日期"]),
        actual_date: date(fields, ["实际完成", "实际完成日期"]),
        status: text(fields, ["里程碑状态", "状态"]),
        owner: text(fields, ["责任人", "里程碑责任人", "负责人"]),
        progress: progress(fields, ["完成进度", "当前进度"]),
      };
    case "task":
      return {
        task_name: text(fields, ["任务名称", "名称", "任务"]),
        plan_start: date(fields, ["计划开始", "开始日期"]),
        plan_end: date(fields, ["计划完成", "截止日期", "结束日期"]),
        actual_start: date(fields, ["实际开始"]),
        actual_end: date(fields, ["实际完成"]),
        status: text(fields, ["任务状态", "状态"]),
        progress: progress(fields, ["完成进度", "当前进度"]),
        assignee: text(fields, ["责任人", "任务负责人", "负责人"]),
        predecessors: first(fields, ["前置任务", "依赖任务", "predecessors"]),
      };
    case "risk":
      return {
        risk_code: text(fields, ["风险编号", "风险ID", "risk_id"]),
        description: text(fields, ["风险描述", "风险事项", "风险标题", "描述"]),
        category: text(fields, ["风险类别", "风险类型"]),
        probability: numeric(fields, ["发生概率", "概率"]),
        impact: numeric(fields, ["影响程度", "影响"]),
        risk_score: numeric(fields, ["风险值", "风险评分"]),
        status: text(fields, ["风险状态", "状态"]),
        response_strategy: text(fields, ["应对策略"]),
        response_action: text(fields, ["应对措施", "响应措施", "行动计划"]),
        owner: text(fields, ["风险责任人", "责任人", "负责人", "Owner"]),
        trigger_condition: text(fields, ["触发条件"]),
        due_date: date(fields, ["截止日期", "应对期限", "计划完成日期"]),
        next_review_date: date(fields, ["复核日期", "下次复核日期"]),
      };
    case "contract":
      return {
        contract_code: text(fields, ["合同编号", "合同号", "contract_id"]),
        contract_name: text(fields, ["合同名称", "名称"]),
        party_a: text(fields, ["客户名称", "甲方", "合同方"]),
        party_b: text(fields, ["乙方", "我方"]),
        total_amount: numeric(fields, ["合同金额", "合同额", "合同总额"]),
        signed_date: date(fields, ["签约日期", "签订日期", "签约时间"]),
        status: text(fields, ["合同状态", "状态"]),
        payment_terms: text(fields, ["付款条件", "付款条款", "结算条件"]),
      };
    case "payment":
      return {
        payment_code: text(fields, ["回款编号", "回款ID", "payment_id"]),
        payment_name: text(fields, ["回款事项", "付款里程碑", "名称"]),
        contract_code: text(fields, ["合同编号", "合同号"]),
        contract_source_record_id: text(fields, ["合同记录ID", "合同"]),
        receivable_amount: numeric(fields, ["应收金额", "计划回款金额", "回款金额"]),
        collected_amount: numeric(fields, ["已回款金额", "实收金额", "实际回款金额"]),
        write_off_amount: numeric(fields, ["核销金额"]),
        due_date: date(fields, ["到期日期", "计划回款日期", "应收日期"]),
        actual_paid_date: date(fields, ["实收日期", "实际回款日期"]),
        status: text(fields, ["回款状态", "状态"]),
      };
    case "cost":
      return {
        cost_code: text(fields, ["成本编号", "成本ID", "cost_id"]),
        period: text(fields, ["期间", "成本期间", "月份"]),
        planned_value: numeric(fields, ["计划成本", "预算成本", "计划价值"]),
        actual_cost: numeric(fields, ["实际成本", "实际费用"]),
        earned_value: numeric(fields, ["挣值", "已完工作预算成本"]),
        status: text(fields, ["成本状态", "状态"]),
      };
    case "syncLedger":
      return {
        event_id: text(fields, ["事件ID", "事件编号", "event_id", "idempotency_key"]),
        event_type: text(fields, ["事件类型", "event_type"]),
        processing_status: text(fields, ["处理状态", "状态"]),
        severity: text(fields, ["严重程度", "级别"]),
        summary: text(fields, ["摘要", "事件摘要"]),
        error_message: text(fields, ["错误信息", "失败原因"]),
        attempts: numeric(fields, ["尝试次数", "重试次数"]),
        request_id: text(fields, ["请求ID", "request_id"]),
      };
  }
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function qualityIssues(
  domain: FeishuReconcileDomain,
  dataClass: FeishuReconcileDataClass,
  requestedDataClass: FeishuReconcileDataClass,
  payload: Record<string, unknown>,
  projectReference: FeishuProjectReference,
): FeishuReconcileQualityIssue[] {
  const issues: FeishuReconcileQualityIssue[] = [];
  const error = (code: string, field: string | null, message: string) => issues.push({ code, field, message, severity: "error" });
  if (dataClass === "unclassified") error("DATA_CLASS_REQUIRED", "数据分类", "飞书记录必须明确标记正式、样例、测试或诊断数据空间。");
  else if (dataClass !== requestedDataClass) error("DATA_CLASS_MISMATCH", "数据分类", `记录属于${dataClass}，不能进入${requestedDataClass}空间。`);
  if (domain === "project") {
    if (!payload.project_code) error("PROJECT_CODE_REQUIRED", "项目编号", "项目记录缺少稳定项目编号。");
    if (!payload.project_name) error("PROJECT_NAME_REQUIRED", "项目名称", "项目记录缺少项目名称。");
  } else if (!projectReference.sourceRecordId && !projectReference.projectCode) {
    error("PROJECT_REFERENCE_REQUIRED", "关联项目记录ID", "子记录必须通过飞书项目记录ID或项目编号关联，禁止按项目名称关联。");
  }
  const requiredByDomain: Partial<Record<FeishuReconcileDomain, Array<[string, string]>>> = {
    milestone: [["milestone_name", "里程碑名称"]],
    task: [["task_name", "任务名称"]],
    risk: [["risk_code", "风险编号"], ["description", "风险描述"]],
    contract: [["contract_code", "合同编号"], ["contract_name", "合同名称"]],
    payment: [["payment_code", "回款编号"]],
    cost: [["cost_code", "成本编号"], ["period", "期间"]],
    syncLedger: [["event_id", "事件ID"], ["processing_status", "处理状态"]],
  };
  for (const [key, label] of requiredByDomain[domain] ?? []) {
    if (payload[key] === null || payload[key] === "") error("REQUIRED_FIELD_MISSING", label, `${label}为镜像必填字段。`);
  }
  return issues;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

export async function canonicalRowHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function normalizeFeishuRecord(
  domain: FeishuReconcileDomain,
  record: FeishuRecordItem,
  context: { sourceContainerId: string; requestedDataClass: FeishuReconcileDataClass },
): Promise<NormalizedFeishuRecord> {
  const dataClass = classifyFeishuDataClass(record.fields);
  const projectReference = domain === "project"
    ? { sourceRecordId: record.recordId, projectCode: text(record.fields, ["项目编号", "项目ID", "project_id", "source_record_id"]) }
    : projectReferenceFromFields(record.fields);
  const payload = compactPayload(normalizePayload(domain, record.fields));
  const issues = qualityIssues(domain, dataClass, context.requestedDataClass, payload, projectReference);
  const hashInput = { domain, data_class: dataClass, project_reference: projectReference, payload };
  return {
    domain,
    data_class: dataClass,
    source: {
      system: "feishu",
      container_id: context.sourceContainerId,
      record_id: record.recordId,
      updated_at: record.updatedAt ?? null,
    },
    project_reference: projectReference,
    payload,
    labels: DOMAIN_LABELS[domain],
    quality: { status: issues.some(issue => issue.severity === "error") ? "quarantine" : "ready", issues },
    row_hash: await canonicalRowHash(hashInput),
    raw_fields: record.fields,
  };
}

export async function buildReconcileIdempotencyKey(input: {
  orgId: string;
  dataClass: FeishuReconcileDataClass;
  sourceContainerId: string;
  domains: FeishuReconcileDomain[];
  sourceCheckpoint: string;
}): Promise<string> {
  const digest = await canonicalRowHash({
    org_id: input.orgId,
    data_class: input.dataClass,
    source_container_id: input.sourceContainerId,
    domains: [...new Set(input.domains)].sort(),
    source_checkpoint: input.sourceCheckpoint,
  });
  return `feishu-reconcile:${digest}`;
}
