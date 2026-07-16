import type { FeishuConfig, FeishuTableKey } from "./config.ts";

export type GovernedClassification = "production" | "sample" | "test" | "diagnostic";

export type DataClassificationDraftIdentity = {
  id: string;
  orgId: string;
  quarantineId: string;
  domain: FeishuTableKey;
  sourceRecordId: string;
  targetDataClass: GovernedClassification;
  targetChineseValue: "正式" | "样例" | "测试" | "诊断";
  expectedChineseValue: unknown;
  version: number;
};

export type DataClassificationWritebackPayload = Record<string, unknown> & {
  type: "base_record_update";
  idempotency_key: string;
  classification_draft_id: string;
  org_id: string;
  data_class: "unclassified";
  table_key: FeishuTableKey;
  record_id: string;
  fields: { 数据分类: string };
  expected_fields: { 数据分类: unknown };
};

const CHINESE_VALUE: Record<GovernedClassification, DataClassificationDraftIdentity["targetChineseValue"]> = {
  production: "正式",
  sample: "样例",
  test: "测试",
  diagnostic: "诊断",
};

const EXPLICIT_FIELDS = ["数据分类", "数据空间", "数据类型", "data_class"] as const;
const SAMPLE_MARKERS = ["样例来源", "样例编号", "示例来源", "demo_source"] as const;
const TEST_MARKERS = ["测试批次", "测试标记", "test_batch", "test_marker"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function hasMarker(payload: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some(key => text(payload[key]).length > 0);
}

export function currentChineseDataClass(payload: Record<string, unknown>): unknown {
  for (const key of EXPLICIT_FIELDS) {
    const value = text(payload[key]);
    if (value) return value;
  }
  return null;
}

export function validateDataClassificationDecision(input: {
  targetDataClass: unknown;
  reason: unknown;
  productionAcknowledged: unknown;
  sourcePayload: Record<string, unknown>;
}): { targetDataClass: GovernedClassification; targetChineseValue: DataClassificationDraftIdentity["targetChineseValue"]; reason: string } {
  const targetDataClass = text(input.targetDataClass) as GovernedClassification;
  if (!(targetDataClass in CHINESE_VALUE)) throw new Error("数据分类必须选择正式、样例、测试或诊断。");
  const reason = text(input.reason);
  if (reason.length < 4 || reason.length > 500) throw new Error("分类依据必须填写4至500个字符。");
  if (targetDataClass === "production") {
    if (input.productionAcknowledged !== true) throw new Error("选择正式数据必须显式确认其来自真实业务并承担分类责任。");
    if (hasMarker(input.sourcePayload, SAMPLE_MARKERS) || hasMarker(input.sourcePayload, TEST_MARKERS)) {
      throw new Error("带样例或测试标记的记录禁止归入正式数据空间。");
    }
  }
  const current = text(currentChineseDataClass(input.sourcePayload));
  if (current === CHINESE_VALUE[targetDataClass]) throw new Error("飞书记录已经是该数据分类，请直接重新对账。");
  return { targetDataClass, targetChineseValue: CHINESE_VALUE[targetDataClass], reason };
}

export function buildDataClassificationWritebackPayload(
  draft: DataClassificationDraftIdentity,
): DataClassificationWritebackPayload {
  return {
    type: "base_record_update",
    idempotency_key: `data-classification-draft:${draft.id}:v${draft.version}`,
    classification_draft_id: draft.id,
    org_id: draft.orgId,
    data_class: "unclassified",
    table_key: draft.domain,
    record_id: draft.sourceRecordId,
    fields: { 数据分类: draft.targetChineseValue },
    expected_fields: { 数据分类: draft.expectedChineseValue ?? null },
  };
}

function canonical(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return JSON.stringify(value.map(item => JSON.parse(canonical(item))));
  return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, item && typeof item === "object" ? JSON.parse(canonical(item)) : item])));
}

export function dataClassificationPayloadMatchesDraft(
  payload: Record<string, unknown>,
  draft: DataClassificationDraftIdentity,
): boolean {
  return payload.type === "base_record_update"
    && payload.idempotency_key === `data-classification-draft:${draft.id}:v${draft.version}`
    && payload.classification_draft_id === draft.id
    && payload.org_id === draft.orgId
    && payload.data_class === "unclassified"
    && payload.table_key === draft.domain
    && payload.record_id === draft.sourceRecordId
    && !Object.hasOwn(payload, "project_id")
    && canonical(payload.fields) === canonical({ 数据分类: draft.targetChineseValue })
    && canonical(payload.expected_fields) === canonical({ 数据分类: draft.expectedChineseValue ?? null });
}

export function dataClassificationFeishuScopeMatches(
  personal: FeishuConfig,
  organization: FeishuConfig,
  domain: FeishuTableKey,
): boolean {
  return personal.baseToken === organization.baseToken
    && Boolean(personal.tables[domain])
    && personal.tables[domain] === organization.tables[domain]
    && Boolean(personal.tables.syncLedger)
    && personal.tables.syncLedger === organization.tables.syncLedger;
}
