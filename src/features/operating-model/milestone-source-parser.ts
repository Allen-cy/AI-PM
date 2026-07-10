import type { FeishuRecordItem } from "../feishu/client.ts";
import type { ParsedMilestoneSignalRequest } from "./signals.ts";

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const first = value[0];
  if (first && typeof first === "object") {
    const record = first as Record<string, unknown>;
    return record.text ?? record.name ?? record.value ?? record.id ?? first;
  }
  return first;
}

function field(fields: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = scalar(fields[name]);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function requiredField(fields: Record<string, unknown>, names: string[], label: string): unknown {
  const value = field(fields, names);
  if (value === undefined) throw new Error(`飞书里程碑缺少中文字段：${label}`);
  return value;
}

function shanghaiDate(value: unknown, label: string): string {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  const numeric = Number(text);
  const date = Number.isFinite(numeric) && numeric > 1000000000 ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric) : new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error(`${label}不是有效日期`);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function truthy(value: unknown): boolean {
  return value === true || /^(1|true|yes|是|已批准|有影响|影响)$/i.test(String(value ?? "").trim());
}

function milestoneStatus(value: unknown): ParsedMilestoneSignalRequest["status"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (/完成|completed|done/.test(text)) return "completed";
  if (/取消|cancel/.test(text)) return "cancelled";
  if (/进行|执行|in[_ -]?progress/.test(text)) return "in_progress";
  return "pending";
}

export function parseVerifiedFeishuMilestone(input: {
  record: FeishuRecordItem;
  project: { id: string; orgId: string; code: string | null; dataClass: ParsedMilestoneSignalRequest["dataClass"] };
}): ParsedMilestoneSignalRequest {
  const fields = input.record.fields;
  const projectReference = String(requiredField(fields, ["项目UUID", "项目ID", "项目编号", "项目代码", "project_id"], "项目UUID/项目编号"));
  if (projectReference !== input.project.id && projectReference !== input.project.code) throw new Error("飞书里程碑不属于当前项目，已阻止跨项目信号写入");
  const baselineDueDate = shanghaiDate(requiredField(fields, ["基线完成日期", "基线日期", "计划完成日期"], "基线完成日期"), "基线完成日期");
  const forecastDueDate = shanghaiDate(requiredField(fields, ["预测完成日期", "预计完成日期", "最新预计完成日期"], "预测完成日期"), "预测完成日期");
  const baselineVersion = String(requiredField(fields, ["基线版本", "计划基线版本"], "基线版本"));
  const milestoneId = String(field(fields, ["里程碑ID", "里程碑编号"]) ?? input.record.recordId);
  const impact = (names: string[]) => truthy(field(fields, names));
  return {
    orgId: input.project.orgId,
    projectId: input.project.id,
    milestoneId,
    baselineVersion,
    baselineDueDate,
    forecastDueDate,
    status: milestoneStatus(field(fields, ["里程碑状态", "状态"])),
    approvedBaselineChange: truthy(field(fields, ["基线变更已批准", "基线变更审批状态"])),
    dataClass: input.project.dataClass,
    sourceId: input.record.recordId,
    ownerUserId: null,
    sourceUpdatedAt: input.record.updatedAt ?? null,
    impacts: {
      criticalPath: impact(["影响关键路径", "关键路径影响"]),
      stageGate: impact(["影响阶段门", "阶段门影响"]),
      customerCommitment: impact(["影响客户承诺", "客户承诺影响"]),
      acceptance: impact(["影响验收", "验收影响"]),
      cash: impact(["影响回款", "现金影响"]),
      majorRisk: impact(["形成重大风险", "重大风险影响"]),
      crossProjectResource: impact(["跨项目资源冲突", "资源冲突影响"]),
    },
  };
}
