import { buildGovernanceImpactPackage, type GovernanceImpactPackage } from "./impact.ts";
import { deriveGovernanceSla } from "./sla.ts";
import type { GovernanceActionRecord, GovernanceEventRecord, GovernanceInstanceRecord } from "./model.ts";

export interface GovernanceAuditAttachment {
  name: string;
  source: string;
  status: "indexed" | "pending";
  note: string;
}

export interface GovernanceAuditPackage {
  packageId: string;
  generatedAt: string;
  instance: GovernanceInstanceRecord;
  businessImpact: GovernanceImpactPackage;
  attachments: GovernanceAuditAttachment[];
  unresolvedActions: GovernanceActionRecord[];
  markdown: string;
}

export interface GovernanceAuditCollectionFilter {
  projectName?: string;
  dateFrom?: string;
  dateTo?: string;
}

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/sk-[A-Za-z0-9_-]{16,}/g, "[已脱敏密钥]"],
  [/api[\s_-]*key\s*=\s*[A-Za-z0-9._-]{12,}/gi, "api_key=[已脱敏]"],
  [/apiKey\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}["']?/g, "api_key=[已脱敏]"],
  [/service_role[_\s-]*(secret|key)?\s*[:=]\s*["']?[A-Za-z0-9._-]{12,}["']?/gi, "service_role=[已脱敏]"],
];

export function redactGovernanceAuditText(text: string): string {
  return SECRET_PATTERNS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

function lineItems(text?: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n|；|;|\|/)
    .map(item => item.trim())
    .filter(Boolean);
}

function flattenOutputEntries(value: unknown, prefix = "outputs"): Array<{ key: string; value: string }> {
  if (value === null || value === undefined) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [{ key: prefix, value: String(value) }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => flattenOutputEntries(item, `${prefix}[${index + 1}]`));
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenOutputEntries(item, `${prefix}.${key}`));
  }
  return [];
}

function extractAttachments(input: {
  instance: GovernanceInstanceRecord;
  events: GovernanceEventRecord[];
}): GovernanceAuditAttachment[] {
  const candidates: GovernanceAuditAttachment[] = [];
  for (const [source, text] of [
    ["输入材料摘要", input.instance.inputSummary],
    ["输出成果摘要", input.instance.outputSummary],
  ] as const) {
    for (const item of lineItems(text)) {
      if (/附件|材料|链接|http|文件|证据/.test(item)) {
        candidates.push({ name: item.slice(0, 80), source, status: "indexed", note: item });
      }
    }
  }

  for (const event of input.events) {
    for (const entry of flattenOutputEntries(event.outputs)) {
      if (/附件|attachment|file|url|链接|材料|证据/i.test(`${entry.key}${entry.value}`)) {
        candidates.push({
          name: entry.key.replace(/^outputs\./, ""),
          source: `${event.createdAt} ${event.actorName || "系统"}`,
          status: "indexed",
          note: entry.value.slice(0, 180),
        });
      }
    }
  }

  if (candidates.length === 0) {
    return [{
      name: "未提供附件索引",
      source: "治理流程",
      status: "pending",
      note: "当前流程未识别到附件、链接或证据字段；正式归档前需由责任人补齐附件索引。",
    }];
  }

  const deduped = new Map<string, GovernanceAuditAttachment>();
  for (const item of candidates) {
    deduped.set(`${item.name}-${item.source}`, item);
  }
  return Array.from(deduped.values()).slice(0, 12);
}

function priorityLabel(priority: GovernanceInstanceRecord["priority"]): string {
  if (priority === "high") return "高";
  if (priority === "low") return "低";
  return "中";
}

function actionRows(actions: GovernanceActionRecord[]): string[] {
  if (actions.length === 0) return ["| 暂无 | - | - | - | - |"];
  return actions.map(action => `| ${action.title} | ${action.owner || "未指定"} | ${action.dueDate || "未设定"} | ${action.status} | ${action.closeEvidence || "待补充"} |`);
}

function eventRows(events: GovernanceEventRecord[]): string[] {
  if (events.length === 0) return ["| 暂无 | - | - | - | - |"];
  return events.map(event => `| ${event.createdAt} | ${event.actorName || "系统"} | ${event.eventType} | ${event.fromState || "-"} → ${event.toState} | ${event.comment || event.decision || "无备注"} |`);
}

function attachmentRows(attachments: GovernanceAuditAttachment[]): string[] {
  return attachments.map(item => `| ${item.name} | ${item.source} | ${item.status === "indexed" ? "已索引" : "待补充"} | ${item.note} |`);
}

function impactRows(impact: GovernanceImpactPackage): string[] {
  if (impact.updates.length === 0) return ["| 暂无 | - | - | - | - |"];
  return impact.updates.map(update => `| ${update.targetType === "risk" ? "风险" : "项目"} | ${update.targetName} | ${update.field} | ${update.suggestedValue} | ${update.requiresConfirmation ? "需人工确认" : "可自动"} |`);
}

export function buildGovernanceAuditPackage(input: {
  instance: GovernanceInstanceRecord;
  events: GovernanceEventRecord[];
  actions: GovernanceActionRecord[];
  generatedAt?: string;
  businessImpact?: GovernanceImpactPackage;
}): GovernanceAuditPackage {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const businessImpact = input.businessImpact ?? buildGovernanceImpactPackage({
    instance: input.instance,
    event: input.events[input.events.length - 1],
    actions: input.actions,
  });
  const sla = deriveGovernanceSla(input.instance);
  const attachments = extractAttachments({ instance: input.instance, events: input.events });
  const unresolvedActions = input.actions.filter(action => action.status === "open" || action.status === "overdue");
  const markdown = redactGovernanceAuditText([
    `# ${input.instance.workflowName}治理流程输出与审计包`,
    "",
    `- 审计包编号：GOV-AUDIT-${input.instance.id.slice(0, 8)}`,
    `- 导出时间：${generatedAt}`,
    `- 流程标题：${input.instance.title}`,
    `- 项目名称：${input.instance.projectName}`,
    `- 当前状态：${input.instance.state}`,
    `- 优先级：${priorityLabel(input.instance.priority)}`,
    `- 责任人：${input.instance.owner}`,
    `- 审批/确认人：${input.instance.approver}`,
    `- 截止日期：${input.instance.deadline || "未设定"}`,
    `- SLA：${sla.label}；${sla.nextAction}`,
    "",
    "## 一、审计范围与结论",
    `- 为什么审批：${input.instance.triggerSummary || "未填写触发条件"}`,
    `- 审批结论：${input.instance.outputSummary || input.instance.state}`,
    `- 业务影响：${businessImpact.summary}`,
    `- 下一步：${businessImpact.nextAction}`,
    `- 未关闭行动项：${unresolvedActions.length}项`,
    "",
    "## 二、输入材料与附件索引",
    `- 输入材料摘要：${input.instance.inputSummary || "未填写"}`,
    "| 附件/材料 | 来源 | 状态 | 说明 |",
    "| --- | --- | --- | --- |",
    ...attachmentRows(attachments),
    "",
    "## 三、审批意见与状态流转",
    "| 时间 | 操作人 | 动作 | 状态变化 | 意见/决策 |",
    "| --- | --- | --- | --- | --- |",
    ...eventRows(input.events),
    "",
    "## 四、输出成果与业务联动",
    `- 输出成果摘要：${input.instance.outputSummary || "待审批或待补充"}`,
    `- 写回模式：${businessImpact.writebackMode === "manual_confirmation_required" ? "需人工确认" : "仅审计记录"}`,
    "| 目标类型 | 目标对象 | 建议字段 | 建议值 | 确认要求 |",
    "| --- | --- | --- | --- | --- |",
    ...impactRows(businessImpact),
    "",
    "## 五、行动项闭环",
    "| 行动项 | 责任人 | deadline | 状态 | 关闭证据 |",
    "| --- | --- | --- | --- | --- |",
    ...actionRows(input.actions),
    "",
    "## 六、数据来源与生成边界",
    "- 数据来源：治理流程实例、状态流转事件、行动项、SLA规则、业务联动规则。",
    "- 附件说明：系统仅索引流程摘要和事件输出中出现的附件/链接/证据字段；未上传的附件需人工补充。",
    "- 写回边界：本审计包只提供项目台账或风险登记册写回建议，正式写回前必须经过责任人确认。",
    "- 脱敏边界：导出内容会对密钥类字段做基础脱敏；正式外发前仍需人工复核。",
    "",
  ].join("\n"));

  return {
    packageId: `GOV-AUDIT-${input.instance.id.slice(0, 8)}`,
    generatedAt,
    instance: input.instance,
    businessImpact,
    attachments,
    unresolvedActions,
    markdown,
  };
}

function withinFilter(instance: GovernanceInstanceRecord, filter: GovernanceAuditCollectionFilter): boolean {
  if (filter.projectName && !instance.projectName.includes(filter.projectName)) return false;
  const date = (instance.updatedAt || instance.createdAt).slice(0, 10);
  if (filter.dateFrom && date < filter.dateFrom) return false;
  if (filter.dateTo && date > filter.dateTo) return false;
  return true;
}

export function filterGovernanceAuditInstances(
  instances: GovernanceInstanceRecord[],
  filter: GovernanceAuditCollectionFilter,
): GovernanceInstanceRecord[] {
  return instances.filter(instance => withinFilter(instance, filter));
}

export function buildGovernanceAuditCollectionMarkdown(input: {
  packages: GovernanceAuditPackage[];
  generatedAt?: string;
  filter?: GovernanceAuditCollectionFilter;
}): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const projectCount = new Set(input.packages.map(item => item.instance.projectName)).size;
  const pending = input.packages.reduce((sum, item) => sum + item.unresolvedActions.length, 0);
  const pendingConfirmation = input.packages.filter(item => item.businessImpact.writebackMode === "manual_confirmation_required").length;
  const highSeverity = input.packages.filter(item => item.businessImpact.severity === "high").length;
  const filterText = [
    input.filter?.projectName ? `项目包含：${input.filter.projectName}` : "项目：全部",
    input.filter?.dateFrom ? `开始：${input.filter.dateFrom}` : "开始：不限",
    input.filter?.dateTo ? `结束：${input.filter.dateTo}` : "结束：不限",
  ].join("；");

  const summaryRows = input.packages.length === 0
    ? ["| 暂无 | - | - | - | - | - |"]
    : input.packages.map(item => `| ${item.instance.projectName} | ${item.instance.workflowName} | ${item.instance.state} | ${item.businessImpact.severity} | ${item.unresolvedActions.length} | ${item.packageId} |`);

  return redactGovernanceAuditText([
    "# PMO治理审计包汇总",
    "",
    `- 导出时间：${generatedAt}`,
    `- 筛选条件：${filterText}`,
    `- 流程数：${input.packages.length}`,
    `- 涉及项目：${projectCount}`,
    `- 未关闭行动项：${pending}`,
    `- 待人工确认写回：${pendingConfirmation}`,
    `- 高优先级业务影响：${highSeverity}`,
    "",
    "## 一、汇总清单",
    "| 项目 | 流程 | 当前状态 | 业务影响级别 | 未关闭行动项 | 审计包编号 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...summaryRows,
    "",
    "## 二、单流程审计包明细",
    ...(input.packages.length === 0
      ? ["当前筛选条件下没有治理流程实例。"]
      : input.packages.map(item => item.markdown).join("\n\n---\n\n").split("\n")),
    "",
  ].join("\n"));
}
