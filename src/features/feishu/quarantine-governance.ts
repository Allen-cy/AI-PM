import type { FeishuReconcileDataClass, FeishuReconcileDomain } from "./reconcile-contract";

export type GovernedDataClass = Exclude<FeishuReconcileDataClass, "unclassified">;

export type FeishuQuarantineSourceRow = {
  id: string;
  domain: FeishuReconcileDomain;
  source_record_id: string;
  external_project_code?: string | null;
  reason_code: string;
  reason_detail: string;
  status: string;
  occurrence_count: number;
  last_seen_at: string;
  source_payload?: Record<string, unknown> | null;
};

export type FeishuClassificationRecommendation = {
  quarantineId: string;
  domain: FeishuReconcileDomain;
  domainLabel: string;
  sourceRecordId: string;
  displayName: string;
  externalProjectCode: string | null;
  reasonCode: string;
  reasonDetail: string;
  status: string;
  occurrenceCount: number;
  lastSeenAt: string;
  recommendedDataClass: GovernedDataClass | "unclassified";
  recommendedDataClassLabel: string;
  confidence: "high" | "medium" | "manual";
  basis: string[];
  requiredChineseField: "数据分类";
  suggestedChineseValue: string;
  canBecomeFormalProject: boolean;
};

export const FEISHU_DOMAIN_LABELS: Record<FeishuReconcileDomain, string> = {
  project: "项目",
  milestone: "里程碑",
  task: "任务",
  risk: "风险",
  contract: "合同",
  payment: "回款",
  cost: "成本",
  syncLedger: "同步账本",
};

const DATA_CLASS_LABELS: Record<GovernedDataClass | "unclassified", string> = {
  production: "正式",
  sample: "样例",
  test: "测试",
  diagnostic: "诊断",
  unclassified: "待人工判断",
};

const DISPLAY_FIELDS: Record<FeishuReconcileDomain, string[]> = {
  project: ["项目名称", "项目", "name", "project_name"],
  milestone: ["里程碑名称", "里程碑", "名称", "name"],
  task: ["任务名称", "任务", "标题", "name"],
  risk: ["风险标题", "风险描述", "风险", "name"],
  contract: ["合同名称", "合同编号", "合同", "name"],
  payment: ["回款事项", "付款里程碑", "回款", "name"],
  cost: ["成本事项", "成本科目", "成本", "name"],
  syncLedger: ["项目", "动作", "trace_id", "request_id"],
};

const EXPLICIT_DATA_CLASS_FIELDS = ["数据分类", "数据空间", "数据类型", "data_class"];

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function first(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = text(payload[key]);
    if (value) return value;
  }
  return "";
}

function normalizeExplicitDataClass(value: string): GovernedDataClass | "unclassified" {
  const normalized = value.trim().toLowerCase();
  if (["正式", "生产", "真实", "production", "prod"].includes(normalized)) return "production";
  if (["样例", "示例", "sample", "demo", "演示"].includes(normalized)) return "sample";
  if (["测试", "test", "testing"].includes(normalized)) return "test";
  if (["诊断", "diagnostic", "diagnosis"].includes(normalized)) return "diagnostic";
  return "unclassified";
}

function markerPresent(payload: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (Object.hasOwn(payload, key) && payload[key] !== null && payload[key] !== "") return key;
  }
  return null;
}

export function recommendFeishuDataClass(row: FeishuQuarantineSourceRow): FeishuClassificationRecommendation {
  const payload = row.source_payload && typeof row.source_payload === "object" && !Array.isArray(row.source_payload)
    ? row.source_payload
    : {};
  const explicitField = EXPLICIT_DATA_CLASS_FIELDS.find(key => text(payload[key]));
  const explicitValue = explicitField ? text(payload[explicitField]) : "";
  const explicit = normalizeExplicitDataClass(explicitValue);
  const sampleMarker = markerPresent(payload, ["样例来源", "样例编号", "示例来源", "demo_source"]);
  const testMarker = markerPresent(payload, ["测试批次", "测试标记", "test_batch", "test_marker"]);
  const diagnosticMarker = markerPresent(payload, ["诊断批次", "诊断标记", "diagnostic_batch"]);

  let recommendedDataClass: GovernedDataClass | "unclassified" = "unclassified";
  let confidence: FeishuClassificationRecommendation["confidence"] = "manual";
  const basis: string[] = [];

  if (explicit !== "unclassified") {
    recommendedDataClass = explicit;
    confidence = "high";
    basis.push(`飞书已填写中文字段“${explicitField}”=${explicitValue}`);
  } else if (sampleMarker) {
    recommendedDataClass = "sample";
    confidence = "high";
    basis.push(`记录包含“${sampleMarker}”，不得自动进入正式数据空间`);
    if (testMarker) basis.push(`同时包含“${testMarker}”，按样例资料优先隔离`);
  } else if (testMarker) {
    recommendedDataClass = "test";
    confidence = "high";
    basis.push(`记录包含“${testMarker}”，建议进入测试数据空间`);
  } else if (diagnosticMarker) {
    recommendedDataClass = "diagnostic";
    confidence = "high";
    basis.push(`记录包含“${diagnosticMarker}”，建议进入诊断数据空间`);
  } else {
    basis.push("没有足够证据判断是否为正式业务数据，禁止自动推断为正式");
  }

  const displayName = first(payload, DISPLAY_FIELDS[row.domain]) || row.external_project_code || `${FEISHU_DOMAIN_LABELS[row.domain]}记录`;
  return {
    quarantineId: row.id,
    domain: row.domain,
    domainLabel: FEISHU_DOMAIN_LABELS[row.domain],
    sourceRecordId: row.source_record_id,
    displayName: displayName.slice(0, 160),
    externalProjectCode: text(row.external_project_code) || null,
    reasonCode: row.reason_code,
    reasonDetail: row.reason_detail,
    status: row.status,
    occurrenceCount: Number(row.occurrence_count || 0),
    lastSeenAt: row.last_seen_at,
    recommendedDataClass,
    recommendedDataClassLabel: DATA_CLASS_LABELS[recommendedDataClass],
    confidence,
    basis,
    requiredChineseField: "数据分类",
    suggestedChineseValue: recommendedDataClass === "unclassified" ? "请人工选择：正式/样例/测试/诊断" : DATA_CLASS_LABELS[recommendedDataClass],
    canBecomeFormalProject: row.domain === "project" && recommendedDataClass === "production",
  };
}

export function buildFeishuClassificationSummary(items: FeishuClassificationRecommendation[]) {
  const byDomain = Object.entries(FEISHU_DOMAIN_LABELS).map(([domain, label]) => ({
    domain,
    label,
    count: items.filter(item => item.domain === domain).length,
  })).filter(item => item.count > 0);
  const byRecommendation = (["production", "sample", "test", "diagnostic", "unclassified"] as const).map(dataClass => ({
    dataClass,
    label: DATA_CLASS_LABELS[dataClass],
    count: items.filter(item => item.recommendedDataClass === dataClass).length,
  }));
  return {
    total: items.length,
    formalProjectCandidates: items.filter(item => item.canBecomeFormalProject).length,
    requiresManualDecision: items.filter(item => item.recommendedDataClass === "unclassified").length,
    byDomain,
    byRecommendation,
  };
}

function csvCell(value: unknown): string {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function buildFeishuClassificationCsv(items: FeishuClassificationRecommendation[]): string {
  const header = ["隔离记录ID", "飞书记录ID", "数据表", "记录名称", "项目编号", "隔离原因", "建议数据分类", "建议依据", "置信度", "飞书必填中文字段", "建议填写值", "最近发现时间"];
  const rows = items.map(item => [
    item.quarantineId, item.sourceRecordId, item.domainLabel, item.displayName, item.externalProjectCode ?? "",
    `${item.reasonCode}：${item.reasonDetail}`, item.recommendedDataClassLabel, item.basis.join("；"), item.confidence,
    item.requiredChineseField, item.suggestedChineseValue, item.lastSeenAt,
  ]);
  return `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}`;
}
