import { validateFeishuActionBody } from "../feishu/action-payload.ts";
import type { BusinessRole } from "./context.ts";

export interface RoleAssistantOutput {
  facts: Array<{ statement: string; evidence_ids: string[] }>;
  inferences: Array<{ statement: string; confidence: number; evidence_ids: string[] }>;
  recommendations: Array<{ title: string; type: "action" | "risk" | "issue" | "change" | "governance" | "decision_brief" | "report" | "feishu_draft"; reason: string; proposed_payload: Record<string, unknown>; confirmation_required: true }>;
  pending_confirmation: string[];
}

export type RecommendationType = RoleAssistantOutput["recommendations"][number]["type"];

export type RecommendationExecutionPolicy =
  | { supported: true; resourceType: "unified_action_item"; initialStatus: "assigned"; confirmationRequired: true }
  | { supported: true; resourceType: "risk"; initialStatus: "identified"; confirmationRequired: true }
  | { supported: true; resourceType: "project_issue"; initialStatus: "open"; confirmationRequired: true }
  | { supported: true; resourceType: "project_change"; initialStatus: "proposed"; confirmationRequired: true }
  | { supported: true; resourceType: "governance_process_instance"; initialStatus: "domain_initial"; confirmationRequired: true }
  | { supported: true; resourceType: "decision_brief"; initialStatus: "draft"; confirmationRequired: true }
  | { supported: true; resourceType: "reporting_snapshot"; initialStatus: "draft"; confirmationRequired: true }
  | { supported: true; resourceType: "feishu_action_confirmation"; initialStatus: "pending_confirmation"; confirmationRequired: true }
  | { supported: false; errorCode: "RECOMMENDATION_TYPE_EXECUTION_UNSUPPORTED"; confirmationRequired: true };

export function recommendationExecutionPolicy(type: string): RecommendationExecutionPolicy {
  const policies: Record<RecommendationType, RecommendationExecutionPolicy> = {
    action: { supported: true, resourceType: "unified_action_item", initialStatus: "assigned", confirmationRequired: true },
    risk: { supported: true, resourceType: "risk", initialStatus: "identified", confirmationRequired: true },
    issue: { supported: true, resourceType: "project_issue", initialStatus: "open", confirmationRequired: true },
    change: { supported: true, resourceType: "project_change", initialStatus: "proposed", confirmationRequired: true },
    governance: { supported: true, resourceType: "governance_process_instance", initialStatus: "domain_initial", confirmationRequired: true },
    decision_brief: { supported: true, resourceType: "decision_brief", initialStatus: "draft", confirmationRequired: true },
    report: { supported: true, resourceType: "reporting_snapshot", initialStatus: "draft", confirmationRequired: true },
    feishu_draft: { supported: true, resourceType: "feishu_action_confirmation", initialStatus: "pending_confirmation", confirmationRequired: true },
  };
  if (type in policies) return policies[type as RecommendationType];
  return { supported: false, errorCode: "RECOMMENDATION_TYPE_EXECUTION_UNSUPPORTED", confirmationRequired: true };
}

const MATERIALIZATION_ROLES: Record<RecommendationType, ReadonlySet<BusinessRole>> = {
  action: new Set(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]),
  risk: new Set(["pm", "operations", "pmo", "quality"]),
  issue: new Set(["pm", "operations", "pmo", "quality"]),
  change: new Set(["pm", "operations", "pmo", "finance", "quality"]),
  governance: new Set(["pmo"]),
  decision_brief: new Set(["pmo"]),
  report: new Set(["pm", "operations", "pmo"]),
  feishu_draft: new Set(["pm", "operations", "pmo", "ceo", "sponsor", "business_owner", "finance", "quality"]),
};

export function canMaterializeRecommendation(role: BusinessRole, type: RecommendationType): boolean {
  return MATERIALIZATION_ROLES[type].has(role);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}格式错误`);
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  const output = String(value ?? "").trim(); if (!output) throw new Error(`${label}不能为空`); return output;
}

function optionalText(value: unknown): string | null {
  const output = String(value ?? "").trim();
  return output || null;
}

function oneOf(value: unknown, label: string, values: readonly string[], fallback?: string): string {
  const output = String(value ?? fallback ?? "").trim();
  if (!values.includes(output)) throw new Error(`${label}不合法`);
  return output;
}

function boundedInteger(value: unknown, label: string, minimum: number, maximum: number, fallback?: number): number {
  const output = value == null || value === "" ? fallback : Number(value);
  if (!Number.isInteger(output) || Number(output) < minimum || Number(output) > maximum) throw new Error(`${label}必须在${minimum}到${maximum}之间`);
  return Number(output);
}

function isoDate(value: unknown, label: string): string {
  const output = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(output) || Number.isNaN(Date.parse(`${output}T00:00:00Z`))) throw new Error(`${label}必须是YYYY-MM-DD`);
  return output;
}

function isoDateTime(value: unknown, label: string): string {
  const output = text(value, label);
  if (Number.isNaN(Date.parse(output))) throw new Error(`${label}必须是ISO时间`);
  return new Date(output).toISOString();
}

function evidenceIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("业务草稿必须引用至少一条证据");
  return [...new Set(value.map(item => text(item, "证据ID")))];
}

function commonPayload(payload: Record<string, unknown>) {
  return { project_id: text(payload.project_id, "项目ID"), evidence_ids: evidenceIds(payload.evidence_ids) };
}

/**
 * Normalize the preview payload before it enters the first confirmation inbox.
 * This is deliberately strict: an incomplete AI suggestion is rejected instead
 * of being silently completed with invented business facts.
 */
export function validateRecommendationPayload(type: RecommendationType, value: unknown): Record<string, unknown> {
  const payload = record(value, "建议载荷");
  const common = commonPayload(payload);
  if (type === "action") return {
    ...common,
    priority: oneOf(payload.priority, "优先级", ["P0", "P1", "P2"], "P1"),
    due_date: isoDate(payload.due_date, "行动截止日期"),
    acceptance_criteria: text(payload.acceptance_criteria, "验收标准"),
    owner_user_id: optionalText(payload.owner_user_id),
  };
  if (type === "risk") return {
    ...common,
    description: text(payload.description, "风险描述"),
    category: optionalText(payload.category) || "管理",
    stage: optionalText(payload.stage) || "全生命周期",
    source: optionalText(payload.source) || "角色AI助理",
    impact_area: optionalText(payload.impact_area) || "工期",
    probability: boundedInteger(payload.probability, "发生概率", 1, 5),
    impact: boundedInteger(payload.impact, "影响", 1, 5),
    urgency: boundedInteger(payload.urgency, "紧迫度", 1, 5, 3),
    owner: text(payload.owner, "风险责任人"),
    due_date: isoDate(payload.due_date, "风险处理期限"),
    trigger_condition: optionalText(payload.trigger_condition),
  };
  if (type === "issue") return {
    ...common,
    description: text(payload.description, "问题描述"),
    severity: oneOf(payload.severity, "问题严重度", ["high", "medium", "low"], "medium"),
    owner: text(payload.owner, "问题责任人"),
    due_date: isoDate(payload.due_date, "问题处理期限"),
    impact_scope: text(payload.impact_scope, "问题影响范围"),
  };
  if (type === "change") return {
    ...common,
    reason: text(payload.reason, "变更原因"),
    change_type: oneOf(payload.change_type, "变更类型", ["scope", "schedule", "cost", "quality", "contract", "collection", "resource", "other"], "other"),
    impact_scope: text(payload.impact_scope, "变更影响范围"),
    owner: text(payload.owner, "变更责任人"),
    approver: text(payload.approver, "变更审批人"),
    due_date: isoDate(payload.due_date, "变更审批期限"),
    impact_cost: payload.impact_cost == null ? null : Number(payload.impact_cost),
    impact_schedule_days: payload.impact_schedule_days == null ? null : Number(payload.impact_schedule_days),
  };
  if (type === "governance") return {
    ...common,
    workflow_id: oneOf(payload.workflow_id, "治理流程", ["project-initiation-review", "stage-gate-review", "change-control", "risk-escalation", "project-closure"]),
    input_summary: text(payload.input_summary, "治理输入摘要"),
    owner: text(payload.owner, "治理责任人"),
    approver: text(payload.approver, "治理审批人"),
    priority: oneOf(payload.priority, "治理优先级", ["high", "medium", "low"], "medium"),
    deadline: isoDate(payload.deadline, "治理期限"),
  };
  if (type === "decision_brief") {
    const options = Array.isArray(payload.options) ? payload.options.map((item, index) => {
      const option = record(item, `第${index + 1}个备选方案`);
      return { key: text(option.key, "方案标识"), label: text(option.label, "方案名称"), consequences: text(option.consequences, "方案影响") };
    }) : [];
    if (options.length < 2) throw new Error("决策包至少需要两个备选方案");
    if (new Set(options.map(item => item.key)).size !== options.length) throw new Error("备选方案标识不能重复");
    const recommendation = text(payload.recommendation, "推荐方案");
    if (!options.some(item => item.key === recommendation)) throw new Error("推荐方案必须来自备选方案");
    return {
      ...common,
      decision_question: text(payload.decision_question, "决策问题"), options, recommendation,
      impact_summary: text(payload.impact_summary, "决策影响摘要"),
      requested_decision_at: isoDateTime(payload.requested_decision_at, "要求决策时间"),
      execution_due_at: isoDateTime(payload.execution_due_at, "决策执行期限"),
      acceptance_criteria: text(payload.acceptance_criteria, "决策执行验收标准"),
      decision_type: oneOf(payload.decision_type, "决策类型", ["continue", "accelerate", "downgrade", "pause", "terminate", "resource_adjustment", "risk_acceptance", "evidence_request"], "continue"),
      decision_level: oneOf(payload.decision_level, "决策层级", ["project", "portfolio", "executive"], "project"),
    };
  }
  if (type === "report") return {
    ...common,
    snapshot_type: oneOf(payload.snapshot_type, "汇报类型", ["daily", "weekly", "monthly", "quarterly", "ad_hoc"]),
    period_start: isoDate(payload.period_start, "汇报开始日期"),
    period_end: isoDate(payload.period_end, "汇报结束日期"),
    narrative: text(payload.narrative, "汇报摘要"),
    metrics: payload.metrics && typeof payload.metrics === "object" && !Array.isArray(payload.metrics) ? payload.metrics : {},
    exceptions: Array.isArray(payload.exceptions) ? payload.exceptions : [],
  };
  if (payload.type === "base_record_update") throw new Error("多维表格更新必须来自业务变化草稿，不允许AI通用建议直接生成");
  validateFeishuActionBody(payload);
  return { ...payload, ...common };
}

function citations(value: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("事实和推断必须引用证据");
  const ids = value.map(item => text(item, "证据ID"));
  const unknown = ids.find(id => !allowed.has(id)); if (unknown) throw new Error(`引用了未知证据：${unknown}`);
  return [...new Set(ids)];
}

export function parseRoleAssistantOutput(raw: string, allowedEvidenceIds: Set<string>): RoleAssistantOutput {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const root = record(JSON.parse(cleaned), "AI输出");
  const facts = (Array.isArray(root.facts) ? root.facts : []).map((item, index) => { const row = record(item, `第${index + 1}条事实`); return { statement: text(row.statement, "事实"), evidence_ids: citations(row.evidence_ids, allowedEvidenceIds) }; });
  const inferences = (Array.isArray(root.inferences) ? root.inferences : []).map((item, index) => { const row = record(item, `第${index + 1}条推断`); const confidence = Number(row.confidence); if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error("推断置信度必须在0到1之间"); return { statement: text(row.statement, "推断"), confidence, evidence_ids: citations(row.evidence_ids, allowedEvidenceIds) }; });
  const allowedTypes = new Set(["action", "risk", "issue", "change", "governance", "decision_brief", "report", "feishu_draft"]);
  const recommendations = (Array.isArray(root.recommendations) ? root.recommendations : []).map((item, index) => {
    const row = record(item, `第${index + 1}条建议`); const type = text(row.type, "建议类型"); if (!allowedTypes.has(type)) throw new Error(`不支持的建议类型：${type}`); if (row.confirmation_required !== true) throw new Error("所有AI建议都必须等待人工确认");
    const recommendationType = type as RoleAssistantOutput["recommendations"][number]["type"];
    const proposedPayload = validateRecommendationPayload(recommendationType, row.proposed_payload ?? {});
    citations(proposedPayload.evidence_ids, allowedEvidenceIds);
    return { title: text(row.title, "建议标题"), type: recommendationType, reason: text(row.reason, "建议依据"), proposed_payload: proposedPayload, confirmation_required: true as const };
  });
  const pending = Array.isArray(root.pending_confirmation) ? root.pending_confirmation.map(item => text(item, "待确认项")) : [];
  return { facts, inferences, recommendations, pending_confirmation: pending };
}
