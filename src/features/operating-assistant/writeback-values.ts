const DATE_FIELDS = new Set([
  "客户承诺日期", "预测完成日期", "预测日期", "截止日期", "签订日期",
  "计划回款日期", "实际回款日期", "开票日期", "预计验收日期", "实际验收日期",
]);
const NUMBER_FIELDS = new Set(["当前进度", "完成进度", "合同金额", "应收金额", "已回款金额", "开票金额"]);
const BOOLEAN_FIELDS = new Set(["重点项目标记", "影响关键路径", "影响验收", "影响回款"]);

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length === 0) return null;
  const first = value[0];
  if (first && typeof first === "object") {
    const item = first as Record<string, unknown>;
    return item.text ?? item.name ?? item.value ?? item.record_id ?? item.id ?? null;
  }
  return first;
}

function dateValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? Date.parse(`${trimmed}T00:00:00+08:00`)
    : Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "是", "已标记"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "否", "未标记"].includes(normalized)) return false;
  return null;
}

function normalizeValue(field: string, value: unknown, reference?: unknown): unknown {
  const source = scalar(value);
  const current = scalar(reference);
  if (DATE_FIELDS.has(field)) {
    const parsed = dateValue(source);
    if (parsed === null) throw new Error(`${field}必须是有效日期。`);
    return parsed;
  }
  if (NUMBER_FIELDS.has(field) || typeof current === "number") {
    const parsed = typeof source === "number" ? source : Number(String(source).trim());
    if (!Number.isFinite(parsed)) throw new Error(`${field}必须是有效数字。`);
    return parsed;
  }
  if (BOOLEAN_FIELDS.has(field) || typeof current === "boolean") {
    const parsed = booleanValue(source);
    if (parsed === null) throw new Error(`${field}必须是是/否值。`);
    return parsed;
  }
  if (source === undefined) return null;
  if (typeof source === "string") return source.trim();
  return source;
}

export function normalizeBusinessWritebackFields(input: {
  proposed: Record<string, unknown>;
  current: Record<string, unknown>;
}): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input.proposed).map(([field, value]) => [
    field,
    normalizeValue(field, value, input.current[field]),
  ]));
}

export function businessWritebackFactsMatch(
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): boolean {
  return Object.entries(expected).every(([field, value]) => {
    try {
      return JSON.stringify(normalizeValue(field, value, actual[field])) === JSON.stringify(normalizeValue(field, actual[field], value));
    } catch {
      return false;
    }
  });
}

function canonicalJson(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(normalize);
    if (!item || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return JSON.stringify(normalize(value));
}

export function businessWritebackPayloadMatchesDraft(
  payload: Record<string, unknown>,
  draft: {
    id: string;
    orgId: string;
    projectId: string;
    dataClass: string;
    sourceType: string;
    sourceRecordId: string;
    version: number;
    changes: Array<{ field: string; currentValue: unknown; proposedValue: unknown }> | readonly { field: string; currentValue: unknown; proposedValue: unknown }[];
  },
): boolean {
  const proposed = Object.fromEntries(draft.changes.map(change => [change.field, change.proposedValue]));
  const expected = Object.fromEntries(draft.changes.map(change => [change.field, change.currentValue]));
  return payload.type === "base_record_update"
    && payload.idempotency_key === `business-update-draft:${draft.id}:v${draft.version}`
    && payload.business_update_draft_id === draft.id
    && payload.org_id === draft.orgId
    && payload.project_id === draft.projectId
    && payload.data_class === draft.dataClass
    && payload.table_key === draft.sourceType
    && payload.record_id === draft.sourceRecordId
    && canonicalJson(payload.fields) === canonicalJson(proposed)
    && canonicalJson(payload.expected_fields) === canonicalJson(expected);
}

export type BusinessWritebackLedgerStatus = "pending" | "succeeded" | "failed" | "unknown";
export type BusinessWritebackLedgerAction = "write" | "reconcile" | "conflict" | "retry_exhausted";

export function decideBusinessWritebackLedgerAction(input: {
  claimed: boolean;
  status: BusinessWritebackLedgerStatus;
  alreadyApplied: boolean;
}): BusinessWritebackLedgerAction {
  if (input.alreadyApplied) return "reconcile";
  if (input.claimed || input.status === "pending") return "write";
  if (input.status === "failed") return "retry_exhausted";
  return "conflict";
}

export function isBusinessWritebackLeaseLive(
  leaseExpiresAt: string,
  nowMs = Date.now(),
  safetyWindowMs = 5_000,
): boolean {
  const expiresAt = Date.parse(leaseExpiresAt);
  return Number.isFinite(expiresAt) && nowMs + Math.max(0, safetyWindowMs) < expiresAt;
}
