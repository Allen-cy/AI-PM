import type { FeishuRecordItem } from "@/features/feishu/client";
import type { DashboardDataClass } from "@/features/dashboard/feishu";

export const LTC_STAGE_NAMES = [
  "商机立项", "需求调研与评审", "方案建设", "招投标", "合同签约", "合同管理",
  "项目前准备", "项目规划", "项目实施", "项目结项", "回款管理", "运营运维",
] as const;

export type LTCStageStatus = "completed" | "current" | "upcoming" | "blocked" | "unknown";

export type LTCRealProject = {
  recordId: string;
  code: string;
  name: string;
  currentStage: number | null;
  currentStageLabel: string;
  stageStatus: LTCStageStatus[];
  dataClass: DashboardDataClass;
  warning?: string;
};

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const first = value[0];
  if (first && typeof first === "object") {
    if ("text" in first) return (first as { text: unknown }).text;
    if ("name" in first) return (first as { name: unknown }).name;
  }
  return first;
}

export function normalizeLtcFields(record: FeishuRecordItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record.fields).map(([key, value]) => [key, scalar(value)]));
}

function text(fields: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(fields[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

export function ltcRecordDataClass(fields: Record<string, unknown>): DashboardDataClass {
  const explicit = text(fields, ["数据分类", "data_class"]).toLowerCase();
  if (["production", "正式", "生产"].includes(explicit)) return "production";
  if (["sample", "样例", "示例"].includes(explicit) || text(fields, ["样例来源", "sample_source"])) return "sample";
  if (["test", "测试"].includes(explicit) || text(fields, ["测试批次", "test_batch"])) return "test";
  if (["diagnostic", "诊断"].includes(explicit)) return "diagnostic";
  return "unclassified";
}

function stageIndex(fields: Record<string, unknown>): number | null {
  const explicitNumber = Number(fields["LTC阶段序号"] ?? fields["当前阶段序号"] ?? fields.stage_number);
  if (Number.isInteger(explicitNumber) && explicitNumber >= 1 && explicitNumber <= 12) return explicitNumber - 1;
  const label = text(fields, ["LTC当前阶段", "当前阶段", "项目阶段", "stage"]);
  if (!label) return null;
  const exact = LTC_STAGE_NAMES.findIndex(name => name === label || label.includes(name) || name.includes(label));
  if (exact >= 0) return exact;
  const aliases: Array<[RegExp, number]> = [
    [/商机|立项/, 0], [/需求/, 1], [/方案/, 2], [/招标|投标/, 3], [/签约/, 4], [/合同/, 5],
    [/启动|准备/, 6], [/规划|计划/, 7], [/实施|执行|交付/, 8], [/结项|收尾|验收/, 9], [/回款/, 10], [/运营|运维/, 11],
  ];
  return aliases.find(([pattern]) => pattern.test(label))?.[1] ?? null;
}

export function normalizeLtcProject(record: FeishuRecordItem): LTCRealProject | null {
  const fields = normalizeLtcFields(record);
  const name = text(fields, ["项目名称", "project_name"]);
  if (!name) return null;
  const index = stageIndex(fields);
  const rawStatus = text(fields, ["当前状态", "项目状态", "status"]);
  const blocked = /阻塞|暂停|挂起|冻结/.test(rawStatus);
  const stageStatus: LTCStageStatus[] = LTC_STAGE_NAMES.map((_, stage) => {
    if (index === null) return "unknown";
    if (stage < index) return "completed";
    if (stage === index) return blocked ? "blocked" : "current";
    return "upcoming";
  });
  return {
    recordId: record.recordId,
    code: text(fields, ["项目编号", "project_id"]) || record.recordId,
    name,
    currentStage: index,
    currentStageLabel: index === null ? "未录入" : LTC_STAGE_NAMES[index],
    stageStatus,
    dataClass: ltcRecordDataClass(fields),
    warning: index === null ? "飞书项目台账未录入LTC当前阶段，流程节点不做推断。" : undefined,
  };
}

