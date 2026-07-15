type Raw = Record<string, unknown>;

export type ProjectControlSnapshotInput = {
  project: Raw & { id: string; name: string; data_class: string };
  tasks?: Raw[];
  milestones?: Raw[];
  deliveryActuals?: Raw[];
  scheduleSnapshots?: Raw[];
  evmSnapshots?: Raw[];
  risks?: Raw[];
  issues?: Raw[];
  changes?: Raw[];
  actions?: Raw[];
  qualityChecks?: Raw[];
  defects?: Raw[];
  acceptances?: Raw[];
  signoffs?: Raw[];
  closureAssessments?: Raw[];
};

export type ProjectControlException = {
  id: string;
  domain: "execution" | "schedule" | "risk" | "issue" | "change" | "action" | "quality" | "acceptance" | "closure";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  status: string;
  source: { table: string; record_id: string; source_system: string | null; source_record_id: string | null };
  owner: string | null;
  deadline: string | null;
  action_id: string | null;
};

export type ProjectControlSnapshot = {
  project: { id: string; name: string; code: string | null; data_class: string; status: string | null };
  health: { overall: "green" | "yellow" | "red" | "unknown"; schedule: "green" | "yellow" | "red" | "unknown"; quality: "green" | "yellow" | "red" | "unknown"; risk: "green" | "yellow" | "red" | "unknown"; governance: "green" | "yellow" | "red" | "unknown" };
  execution: { tasks: Raw[]; milestones: Raw[]; total_tasks: number; completed_tasks: number; blocked_tasks: number; overdue_tasks: number; progress: number };
  schedule: { latest_snapshot: Raw | null; delayed_milestones: number; delivery_actuals: Raw[] };
  performance: { latest_evm: Raw | null };
  governance: { risks: Raw[]; issues: Raw[]; changes: Raw[]; actions: Raw[]; open_high_risks: number; open_issues: number; pending_changes: number; open_actions: number };
  quality: { checks: Raw[]; defects: Raw[]; acceptances: Raw[]; signoffs: Raw[]; open_defects: number; pending_acceptances: number };
  closure: { latest_assessment: Raw | null; ready: boolean; status: string; blockers: unknown[] };
  exceptions: ProjectControlException[];
  source: { type: "supabase_mirror"; authoritative_source: "feishu+human_workflow"; generated_at: string; latest_source_updated_at: string | null; data_quality: "ready" | "attention" | "empty"; warnings: string[] };
};

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const open = (value: unknown) => !["completed", "closed", "done", "cancelled", "approved", "accepted", "resolved", "implemented", "paid", "verified"].includes(text(value).toLowerCase());
const dateOnly = (value: unknown): string | null => text(value) ? text(value).slice(0, 10) : null;
const overdue = (value: unknown, now: string) => Boolean(dateOnly(value) && dateOnly(value)! < now.slice(0, 10));

function source(table: string, row: Raw) {
  return {
    table,
    record_id: text(row.id),
    source_system: text(row.source_system || row.source) || null,
    source_record_id: text(row.source_record_id) || null,
  };
}
function exception(input: Omit<ProjectControlException, "source"> & { table: string; row: Raw }): ProjectControlException {
  return { ...input, source: source(input.table, input.row) };
}

function latest(rows: Raw[], keys = ["calculated_at", "created_at", "updated_at"]): Raw | null {
  return [...rows].sort((a, b) => {
    const aDate = keys.map(key => text(a[key])).find(Boolean) || "";
    const bDate = keys.map(key => text(b[key])).find(Boolean) || "";
    return bDate.localeCompare(aDate);
  })[0] ?? null;
}

function severityRank(value: ProjectControlException["severity"]): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[value];
}

function health(hasFacts: boolean, exceptions: ProjectControlException[]) {
  if (!hasFacts) return "unknown" as const;
  const rank = Math.max(0, ...exceptions.map(item => severityRank(item.severity)));
  if (rank >= 3) return "red" as const;
  if (rank >= 1) return "yellow" as const;
  return "green" as const;
}

export function buildProjectControlSnapshot(input: ProjectControlSnapshotInput): ProjectControlSnapshot {
  const now = new Date().toISOString();
  const tasks = input.tasks ?? [];
  const milestones = input.milestones ?? [];
  const risks = input.risks ?? [];
  const issues = input.issues ?? [];
  const changes = input.changes ?? [];
  const actions = input.actions ?? [];
  const defects = input.defects ?? [];
  const acceptances = input.acceptances ?? [];
  const closures = input.closureAssessments ?? [];
  const exceptions: ProjectControlException[] = [];

  for (const row of tasks) {
    const status = text(row.status).toLowerCase();
    if (status === "blocked" || (open(status) && overdue(row.plan_end || row.end_date, now))) {
      exceptions.push(exception({ id: `task:${text(row.id)}`, domain: "execution", severity: status === "blocked" ? "high" : "medium", title: text(row.name) || "未命名任务", status, table: "tasks", row, owner: text(row.assignee) || null, deadline: dateOnly(row.plan_end || row.end_date), action_id: null }));
    }
  }
  for (const row of milestones) {
    const status = text(row.status).toLowerCase();
    const delayed = ["delayed", "延期", "逾期"].includes(status) || (open(status) && overdue(row.forecast_date || row.baseline_date, now));
    if (delayed) exceptions.push(exception({ id: `milestone:${text(row.id)}`, domain: "schedule", severity: "high", title: text(row.milestone_name) || "未命名里程碑", status, table: "project_milestones", row, owner: text(row.owner) || null, deadline: dateOnly(row.forecast_date || row.baseline_date), action_id: null }));
  }
  for (const row of risks) {
    const score = number(row.pi_score || row.risk_score || row.score);
    if (open(row.status) && (score >= 12 || text(row.risk_level).includes("高"))) exceptions.push(exception({ id: `risk:${text(row.id)}`, domain: "risk", severity: score >= 16 ? "critical" : "high", title: text(row.description) || "未命名风险", status: text(row.status), table: "risks", row, owner: text(row.action_owner || row.owner) || null, deadline: dateOnly(row.action_deadline || row.due_date), action_id: null }));
  }
  for (const row of issues) {
    if (open(row.status)) exceptions.push(exception({ id: `issue:${text(row.id)}`, domain: "issue", severity: text(row.severity) === "high" ? "high" : "medium", title: text(row.title) || "未命名问题", status: text(row.status), table: "project_issues", row, owner: text(row.owner) || null, deadline: dateOnly(row.due_date), action_id: null }));
  }
  for (const row of changes) {
    if (open(row.status)) exceptions.push(exception({ id: `change:${text(row.id)}`, domain: "change", severity: ["approved", "implementing"].includes(text(row.status)) ? "medium" : "low", title: text(row.title) || "未命名变更", status: text(row.status), table: "project_changes", row, owner: text(row.owner) || null, deadline: dateOnly(row.due_date), action_id: null }));
  }
  for (const row of actions) {
    if (open(row.status)) exceptions.push(exception({ id: `action:${text(row.id)}`, domain: "action", severity: text(row.priority) === "P0" ? "high" : text(row.priority) === "P1" ? "medium" : "low", title: text(row.title) || "未命名行动项", status: text(row.status), table: "unified_action_items", row, owner: text(row.owner) || null, deadline: dateOnly(row.due_date), action_id: text(row.id) || null }));
  }
  for (const row of defects) {
    if (open(row.status)) exceptions.push(exception({ id: `defect:${text(row.id)}`, domain: "quality", severity: ["critical", "high"].includes(text(row.severity).toLowerCase()) ? "high" : "medium", title: text(row.title) || "未命名缺陷", status: text(row.status), table: "project_defect_records", row, owner: text(row.owner_name || row.owner) || null, deadline: dateOnly(row.due_at || row.due_date), action_id: null }));
  }
  for (const row of acceptances) {
    if (open(row.status)) exceptions.push(exception({ id: `acceptance:${text(row.id)}`, domain: "acceptance", severity: ["rejected", "changes_requested"].includes(text(row.status)) ? "high" : "low", title: text(row.title) || "未命名验收", status: text(row.status), table: "project_acceptance_records", row, owner: text(row.owner_name || row.owner) || null, deadline: dateOnly(row.planned_at || row.due_at), action_id: null }));
  }

  const latestClosure = latest(closures);
  const closureReady = Boolean(latestClosure?.ready && text(latestClosure.status) === "approved");
  const closureBlockers = Array.isArray(latestClosure?.blockers) ? latestClosure.blockers as unknown[] : [];
  if (latestClosure && !closureReady) exceptions.push(exception({ id: `closure:${text(latestClosure.id)}`, domain: "closure", severity: "medium", title: "项目尚未满足正式收尾门禁", status: text(latestClosure.status), table: "project_closure_assessments", row: latestClosure, owner: null, deadline: null, action_id: null }));

  const completedTasks = tasks.filter(row => !open(row.status)).length;
  const taskProgress = tasks.length ? Math.round(tasks.reduce((sum, row) => sum + number(row.percent_complete || row.progress), 0) / tasks.length) : 0;
  const executionExceptions = exceptions.filter(item => ["execution", "schedule"].includes(item.domain));
  const qualityExceptions = exceptions.filter(item => ["quality", "acceptance"].includes(item.domain));
  const riskExceptions = exceptions.filter(item => item.domain === "risk");
  const governanceExceptions = exceptions.filter(item => ["issue", "change", "action"].includes(item.domain));
  const allDates = [input.project, ...tasks, ...milestones, ...risks]
    .flatMap(row => [text(row.source_updated_at), text(row.updated_at)])
    .filter(Boolean)
    .sort();
  const warnings: string[] = [];
  if (tasks.length === 0) warnings.push("当前项目没有已对账任务事实。");
  if (milestones.length === 0) warnings.push("当前项目没有已对账里程碑事实。");

  return {
    project: { id: text(input.project.id), name: text(input.project.name), code: text(input.project.oa_no || input.project.code) || null, data_class: text(input.project.data_class), status: text(input.project.status) || null },
    health: {
      overall: health(tasks.length + milestones.length + risks.length + issues.length + defects.length > 0, exceptions),
      schedule: health(tasks.length + milestones.length > 0, executionExceptions),
      quality: health(defects.length + acceptances.length > 0, qualityExceptions),
      risk: health(risks.length > 0, riskExceptions),
      governance: health(issues.length + changes.length + actions.length > 0, governanceExceptions),
    },
    execution: { tasks, milestones, total_tasks: tasks.length, completed_tasks: completedTasks, blocked_tasks: tasks.filter(row => text(row.status).toLowerCase() === "blocked").length, overdue_tasks: tasks.filter(row => open(row.status) && overdue(row.plan_end || row.end_date, now)).length, progress: taskProgress },
    schedule: { latest_snapshot: latest(input.scheduleSnapshots ?? []), delayed_milestones: milestones.filter(row => ["delayed", "延期", "逾期"].includes(text(row.status).toLowerCase()) || (open(row.status) && overdue(row.forecast_date || row.baseline_date, now))).length, delivery_actuals: input.deliveryActuals ?? [] },
    performance: { latest_evm: latest(input.evmSnapshots ?? []) },
    governance: { risks, issues, changes, actions, open_high_risks: risks.filter(row => open(row.status) && (number(row.pi_score || row.risk_score || row.score) >= 12 || text(row.risk_level).includes("高"))).length, open_issues: issues.filter(row => open(row.status)).length, pending_changes: changes.filter(row => open(row.status)).length, open_actions: actions.filter(row => open(row.status)).length },
    quality: { checks: input.qualityChecks ?? [], defects, acceptances, signoffs: input.signoffs ?? [], open_defects: defects.filter(row => open(row.status)).length, pending_acceptances: acceptances.filter(row => open(row.status)).length },
    closure: { latest_assessment: latestClosure, ready: closureReady, status: text(latestClosure?.status) || "not_assessed", blockers: closureBlockers },
    exceptions: exceptions.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || (a.deadline || "9999").localeCompare(b.deadline || "9999")),
    source: { type: "supabase_mirror", authoritative_source: "feishu+human_workflow", generated_at: now, latest_source_updated_at: allDates.at(-1) ?? null, data_quality: tasks.length + milestones.length + risks.length + issues.length + changes.length + actions.length + defects.length + acceptances.length === 0 ? "empty" : warnings.length ? "attention" : "ready", warnings },
  };
}
