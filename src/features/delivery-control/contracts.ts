import type { BusinessRole } from "@/features/operating-model/context";

export type DeliveryDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export interface DeliveryWriteContract {
  projectId: string;
  businessRole: BusinessRole;
  dataClass: DeliveryDataClass;
  idempotencyKey: string;
  expectedVersion: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<DeliveryDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("写入请求必须为结构化对象。");
  return value as Record<string, unknown>;
}

export function parseDeliveryWriteContract(value: unknown): DeliveryWriteContract {
  const input = record(value);
  const projectId = String(input.project_id ?? "").trim();
  const businessRole = String(input.business_role ?? "").trim() as BusinessRole;
  const dataClass = String(input.data_class ?? "").trim() as DeliveryDataClass;
  const idempotencyKey = String(input.idempotency_key ?? "").trim();
  const expectedVersion = Number(input.expected_version);

  if (!UUID.test(projectId)) throw new Error("必须提供稳定项目UUID，不能使用项目名称代替。");
  if (!ROLES.has(businessRole)) throw new Error("业务角色不在交付控制授权范围内。");
  if (!DATA_CLASSES.has(dataClass)) throw new Error("数据分类不合法。");
  if (!idempotencyKey || idempotencyKey.length > 240) throw new Error("幂等键为必填项，且不得超过240字符。");
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error("期望版本必须为不小于0的整数。");

  return { projectId, businessRole, dataClass, idempotencyKey, expectedVersion };
}

export function requireDeliveryItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) {
    throw new Error("WBS工作包必须为1到1000条结构化记录。");
  }
  return value.map((item, index) => {
    const output = record(item);
    const code = String(output.item_code ?? "").trim();
    const name = String(output.name ?? "").trim();
    const duration = Number(output.duration_days);
    if (!code || code.length > 80) throw new Error(`第${index + 1}条工作包编码不合法。`);
    if (!name || name.length > 240) throw new Error(`第${index + 1}条工作包名称不合法。`);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error(`第${index + 1}条工作包工期必须大于0。`);
    return output;
  });
}
