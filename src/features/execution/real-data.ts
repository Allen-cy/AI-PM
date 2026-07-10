import type { FeishuRecordItem } from "@/features/feishu/client";
import type { ChangeRecord } from "@/features/issue-change/model";
import type { ChangeRequest, Deliverable, Task } from "@/lib/execution";

export type ExecutionProjectIdentity = {
  id: string;
  name: string;
  code: string | null;
  sourceRecordId: string | null;
  dataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
};

function scalar(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const first = value[0];
  if (first && typeof first === "object") {
    if ("text" in first) return (first as { text: unknown }).text;
    if ("name" in first) return (first as { name: unknown }).name;
    if ("record_id" in first) return (first as { record_id: unknown }).record_id;
  }
  return first;
}

function fieldsOf(record: FeishuRecordItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record.fields).map(([key, value]) => [key, scalar(value)]));
}

function text(fields: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = String(fields[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

function number(fields: Record<string, unknown>, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = Number(fields[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function date(fields: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const raw = fields[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const numeric = Number(raw);
    const parsed = Number.isFinite(numeric) && numeric > 0
      ? new Date(numeric < 100000000000 ? numeric * 1000 : numeric)
      : new Date(String(raw));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return "";
}

function recordDataClass(fields: Record<string, unknown>): ExecutionProjectIdentity["dataClass"] {
  const explicit = text(fields, ["数据分类", "data_class"]).toLowerCase();
  if (["production", "正式", "生产"].includes(explicit)) return "production";
  if (["sample", "样例", "示例"].includes(explicit) || text(fields, ["样例来源", "sample_source"])) return "sample";
  if (["test", "测试"].includes(explicit) || text(fields, ["测试批次", "test_batch"])) return "test";
  if (["diagnostic", "诊断"].includes(explicit)) return "diagnostic";
  return "unclassified";
}

export function recordBelongsToProject(record: FeishuRecordItem, project: ExecutionProjectIdentity): boolean {
  const fields = fieldsOf(record);
  const linked = [
    text(fields, ["关联项目UUID", "项目UUID", "project_uuid"]),
    text(fields, ["关联项目编号", "项目编号", "project_id"]),
    text(fields, ["关联项目记录", "项目记录ID", "project_record_id"]),
    text(fields, ["项目名称", "关联项目", "project_name"]),
  ].filter(Boolean);
  const identities = [project.id, project.code, project.sourceRecordId, project.name]
    .filter((value): value is string => Boolean(value))
    .map(value => value.trim().toLowerCase());
  return linked.some(value => identities.includes(value.trim().toLowerCase()));
}

function recordMayAppear(record: FeishuRecordItem, project: ExecutionProjectIdentity): boolean {
  if (!recordBelongsToProject(record, project)) return false;
  const dataClass = recordDataClass(fieldsOf(record));
  return dataClass === "unclassified" || dataClass === project.dataClass;
}

function taskStatus(value: string): Task["status"] {
  const status = value.toLowerCase();
  if (["completed", "done", "已完成", "完成", "已关闭"].includes(status)) return "completed";
  if (["in-progress", "in_progress", "进行中", "执行中", "处理中"].includes(status)) return "in-progress";
  if (["blocked", "阻塞", "已阻塞", "暂停"].includes(status)) return "blocked";
  return "pending";
}

function taskPriority(value: string): Task["priority"] {
  const priority = value.toLowerCase();
  if (["high", "p0", "p1", "高", "紧急"].includes(priority)) return "high";
  if (["low", "p3", "低"].includes(priority)) return "low";
  return "medium";
}

export function normalizeExecutionTasks(records: FeishuRecordItem[], project: ExecutionProjectIdentity): Task[] {
  return records.filter(record => recordMayAppear(record, project)).flatMap(record => {
    const fields = fieldsOf(record);
    const name = text(fields, ["任务名称", "任务", "事项名称", "name"]);
    if (!name) return [];
    return [{
      id: record.recordId,
      name,
      assignee: text(fields, ["负责人", "任务负责人", "执行人", "assignee"]) || "未分配",
      status: taskStatus(text(fields, ["任务状态", "状态", "status"])),
      priority: taskPriority(text(fields, ["优先级", "priority"])),
      dueDate: date(fields, ["截止日期", "计划完成", "到期日期", "due_date"]),
      progress: Math.max(0, Math.min(100, number(fields, ["完成进度", "当前进度", "进度", "progress"]))),
      blockedReason: text(fields, ["阻塞原因", "blocked_reason"]) || undefined,
    } satisfies Task];
  });
}

function deliverableStatus(value: string): Deliverable["status"] {
  const status = value.toLowerCase();
  if (["accepted", "已验收", "验收通过"].includes(status)) return "accepted";
  if (["rejected", "验收不通过", "已驳回"].includes(status)) return "rejected";
  if (["ready", "待验收", "已提交"].includes(status)) return "ready";
  if (["in-progress", "in_progress", "进行中", "制作中"].includes(status)) return "in-progress";
  return "pending";
}

export function normalizeExecutionDeliverables(records: FeishuRecordItem[], project: ExecutionProjectIdentity): Deliverable[] {
  return records.filter(record => recordMayAppear(record, project)).flatMap(record => {
    const fields = fieldsOf(record);
    const name = text(fields, ["交付物名称", "里程碑名称", "成果名称", "name"]);
    if (!name) return [];
    return [{
      id: record.recordId,
      name,
      relatedTask: text(fields, ["关联任务", "related_task"]) || undefined,
      status: deliverableStatus(text(fields, ["验收状态", "交付状态", "里程碑状态", "状态", "status"])),
      qualityCheck: text(fields, ["质量检查", "质检结论", "quality_check"]) || undefined,
    } satisfies Deliverable];
  });
}

export function normalizeExecutionChanges(changes: ChangeRecord[], projectName: string): ChangeRequest[] {
  return changes.filter(change => change.projectName === projectName).map(change => ({
    id: change.changeCode || change.id,
    description: change.title,
    impact: change.impactScope || [
      change.impactScheduleDays === null ? "" : `工期${change.impactScheduleDays}天`,
      change.impactCost === null ? "" : `成本${change.impactCost}`,
    ].filter(Boolean).join("、") || "影响待评估",
    requestor: change.createdByName || "未记录",
    status: change.status === "approved" || change.status === "implementing" || change.status === "implemented" || change.status === "closed"
      ? "approved"
      : change.status === "rejected"
        ? "rejected"
        : "pending",
    approvedBy: change.approver || undefined,
    createdAt: change.createdAt.slice(0, 10),
  }));
}
