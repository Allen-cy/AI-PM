import type { BusinessRole } from "@/features/operating-model/context";

export type ProjectControlDataClass = "production" | "sample" | "test" | "diagnostic" | "unclassified";

export type ProjectControlWriteContract = {
  projectId: string;
  businessRole: BusinessRole;
  dataClass: ProjectControlDataClass;
  idempotencyKey: string;
  expectedVersion: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "sponsor", "business_owner", "finance", "quality"]);
const DATA_CLASSES = new Set<ProjectControlDataClass>(["production", "sample", "test", "diagnostic", "unclassified"]);

export function parseProjectControlWriteContract(value: Record<string, unknown>): ProjectControlWriteContract {
  const projectId = String(value.project_id ?? "").trim();
  const businessRole = String(value.business_role ?? "").trim() as BusinessRole;
  const dataClass = String(value.data_class ?? "").trim() as ProjectControlDataClass;
  const idempotencyKey = String(value.idempotency_key ?? "").trim();
  const expectedVersion = Number(value.expected_version);

  if (!UUID.test(projectId)) throw new Error("必须选择稳定项目UUID，禁止按项目名称关联。");
  if (!ROLES.has(businessRole)) throw new Error("业务角色无权执行项目控制动作。");
  if (!DATA_CLASSES.has(dataClass)) throw new Error("数据分类无效。");
  if (!idempotencyKey || idempotencyKey.length > 160) throw new Error("幂等键为必填项，且不得超过160字符。");
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("期望版本必须是大于或等于0的整数。");

  return { projectId, businessRole, dataClass, idempotencyKey, expectedVersion };
}
