export type RoleAssistantScanRule =
  | "project_status_progress_conflict"
  | "project_facts_stale"
  | "action_overdue"
  | "action_owner_missing"
  | "action_deadline_missing"
  | "risk_overdue"
  | "risk_owner_missing"
  | "risk_deadline_missing"
  | "issue_overdue"
  | "issue_owner_missing"
  | "issue_deadline_missing"
  | "change_overdue"
  | "change_owner_missing"
  | "change_deadline_missing"
  | "monthly_report_missing";

export interface RoleAssistantScanFinding {
  projectId: string;
  ruleKey: RoleAssistantScanRule;
  signalType: "progress" | "risk" | "data_quality";
  severity: "medium" | "high" | "critical";
  route: "action" | "escalation";
  title: string;
  summary: string;
  sourceType: string;
  sourceId: string;
  dedupKey: string;
  windowKey: string;
  impact: Record<string, unknown>;
  ownerUserId?: string | null;
}

type ProjectFact = { id: string; name?: unknown; status?: unknown; progress?: unknown; updated_at?: unknown };
type WorkFact = { id: string; project_id?: unknown; title?: unknown; description?: unknown; status?: unknown; due_date?: unknown; due_at?: unknown; owner_user_id?: unknown; owner?: unknown };
type ReportFact = { subject_id?: unknown; project_id?: unknown; snapshot_type?: unknown; period_start?: unknown; period_end?: unknown; status?: unknown };

export interface RoleAssistantScanInput {
  now?: Date;
  projects: ProjectFact[];
  actions: WorkFact[];
  risks: WorkFact[];
  issues: WorkFact[];
  changes: WorkFact[];
  reportingSnapshots: ReportFact[];
  staleAfterDays?: number;
}

const TERMINAL_ACTIONS = new Set(["done", "closed", "cancelled"]);
const TERMINAL_RISKS = new Set(["resolved", "closed"]);
const TERMINAL_ISSUES = new Set(["resolved", "closed"]);
const TERMINAL_CHANGES = new Set(["rejected", "implemented", "closed"]);

function value(value: unknown): string { return String(value ?? "").trim(); }
function dateOnly(date: Date): string { return date.toISOString().slice(0, 10); }
function monthStart(date: Date): string { return `${date.toISOString().slice(0, 7)}-01`; }
function nextMonthStart(date: Date): string {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return dateOnly(next);
}
function validDate(value: unknown): number | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function finding(input: Omit<RoleAssistantScanFinding, "dedupKey">): RoleAssistantScanFinding {
  return { ...input, dedupKey: `p23:${input.ruleKey}:${input.projectId}:${input.sourceType}:${input.sourceId}:${input.windowKey}` };
}

function scanWork(input: {
  rows: WorkFact[];
  projectIds: Set<string>;
  now: Date;
  kind: "action" | "risk" | "issue" | "change";
  terminal: Set<string>;
}): RoleAssistantScanFinding[] {
  const outputs: RoleAssistantScanFinding[] = [];
  const today = dateOnly(input.now);
  for (const row of input.rows) {
    const projectId = value(row.project_id);
    if (!projectId || !input.projectIds.has(projectId)) continue;
    const status = value(row.status);
    if (input.terminal.has(status)) continue;
    const sourceId = value(row.id);
    const label = value(row.title) || value(row.description) || sourceId;
    const due = value(row.due_at || row.due_date);
    const owner = value(row.owner_user_id || row.owner);
    const signalType = input.kind === "action" ? "progress" as const : "risk" as const;
    if (due && due.slice(0, 10) < today) outputs.push(finding({
      projectId, ruleKey: `${input.kind}_overdue` as RoleAssistantScanRule, signalType, severity: "high", route: "action",
      title: `${label}已逾期`, summary: `${input.kind}事项截止日期${due.slice(0, 10)}早于当前业务日，需要责任人确认新计划或提交完成证据。`,
      sourceType: input.kind, sourceId, windowKey: today, impact: { status, due_date: due, title: label }, ownerUserId: value(row.owner_user_id) || null,
    }));
    if (!owner) outputs.push(finding({
      projectId, ruleKey: `${input.kind}_owner_missing` as RoleAssistantScanRule, signalType: "data_quality", severity: "high", route: "action",
      title: `${label}缺少责任人`, summary: `${input.kind}事项尚未闭环，但没有可追责的责任人，不得直接视为已处理。`,
      sourceType: input.kind, sourceId, windowKey: "open", impact: { status, missing_field: "owner", title: label },
    }));
    if (!due) outputs.push(finding({
      projectId, ruleKey: `${input.kind}_deadline_missing` as RoleAssistantScanRule, signalType: "data_quality", severity: "medium", route: "action",
      title: `${label}缺少期限`, summary: `${input.kind}事项尚未闭环，但没有deadline，无法进入超期预警和责任追踪。`,
      sourceType: input.kind, sourceId, windowKey: "open", impact: { status, missing_field: "deadline", title: label },
    }));
  }
  return outputs;
}

/** Deterministic, source-only scan. It never asks an LLM to decide whether a fact exists. */
export function scanRoleAssistantFacts(input: RoleAssistantScanInput): RoleAssistantScanFinding[] {
  const now = input.now ?? new Date();
  const staleAfterDays = Number.isFinite(input.staleAfterDays) ? Math.max(1, Number(input.staleAfterDays)) : 7;
  const projectIds = new Set(input.projects.map(item => value(item.id)).filter(Boolean));
  const outputs: RoleAssistantScanFinding[] = [];
  const today = dateOnly(now);
  const currentMonth = monthStart(now);
  const followingMonth = nextMonthStart(now);
  for (const project of input.projects) {
    const projectId = value(project.id);
    const projectName = value(project.name) || projectId;
    const status = value(project.status);
    const progress = Number(project.progress);
    if ((status === "completed" && Number.isFinite(progress) && progress < 100) || (status === "active" && progress === 100)) {
      outputs.push(finding({
        projectId, ruleKey: "project_status_progress_conflict", signalType: "data_quality", severity: "high", route: "action",
        title: `${projectName}状态与进度冲突`, summary: `项目状态为${status}，进度为${Number.isFinite(progress) ? progress : "未知"}%，两者不能同时作为正式决策事实。`,
        sourceType: "project", sourceId: projectId, windowKey: today, impact: { status, progress },
      }));
    }
    const updatedAt = validDate(project.updated_at);
    if (["active", "suspended"].includes(status) && (updatedAt === null || now.getTime() - updatedAt > staleAfterDays * 86_400_000)) {
      outputs.push(finding({
        projectId, ruleKey: "project_facts_stale", signalType: "data_quality", severity: "medium", route: "action",
        title: `${projectName}业务事实过期`, summary: updatedAt === null ? "项目缺少可验证的更新时间。" : `项目主事实已超过${staleAfterDays}天未更新，AI建议前应由业务责任人复核。`,
        sourceType: "project", sourceId: projectId, windowKey: today, impact: { updated_at: project.updated_at ?? null, stale_after_days: staleAfterDays },
      }));
    }
    if (status === "active") {
      const hasMonthly = input.reportingSnapshots.some(snapshot => {
        const snapshotProjectId = value(snapshot.project_id || snapshot.subject_id);
        const periodStart = value(snapshot.period_start);
        return snapshotProjectId === projectId && value(snapshot.snapshot_type) === "monthly" && value(snapshot.status) !== "superseded"
          && periodStart >= currentMonth && periodStart < followingMonth;
      });
      if (!hasMonthly) outputs.push(finding({
        projectId, ruleKey: "monthly_report_missing", signalType: "data_quality", severity: "medium", route: "action",
        title: `${projectName}本月汇报快照缺失`, summary: `当前月份${currentMonth.slice(0, 7)}没有可追溯的月度汇报快照，组合复盘和CEO决策将缺少统一口径。`,
        sourceType: "reporting_snapshot", sourceId: projectId, windowKey: currentMonth.slice(0, 7), impact: { period: currentMonth.slice(0, 7), missing_object: "monthly_reporting_snapshot" },
      }));
    }
  }
  outputs.push(...scanWork({ rows: input.actions, projectIds, now, kind: "action", terminal: TERMINAL_ACTIONS }));
  outputs.push(...scanWork({ rows: input.risks, projectIds, now, kind: "risk", terminal: TERMINAL_RISKS }));
  outputs.push(...scanWork({ rows: input.issues, projectIds, now, kind: "issue", terminal: TERMINAL_ISSUES }));
  outputs.push(...scanWork({ rows: input.changes, projectIds, now, kind: "change", terminal: TERMINAL_CHANGES }));
  return [...new Map(outputs.map(item => [item.dedupKey, item])).values()];
}
