"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readStoredBusinessContext, readStoredDataClass, writeStoredBusinessContext, type StoredBusinessContext } from "@/features/operating-model/client-context";
import { BusinessEntitySelect } from "@/components/BusinessEntitySelect";
import { StructuredFieldsEditor } from "@/components/StructuredFieldsEditor";

type Brief = {
  id: string;
  status: string;
  title: string;
  decisionQuestion: string;
  options: Array<{ key: string; label: string; consequences: string }>;
  recommendation: string;
  impactSummary: string;
  requestedDecisionAt: string;
  executionDueAt: string;
  acceptanceCriteria: string;
  workflowStatus: string;
  decisionType: string;
  decisionMode: string;
  decisionLevel: string;
  authorityMode: string;
  committeeId: string | null;
  reviewMetrics: string[];
  revocationConditions: string[];
};

type Participant = {
  userId: string;
  name: string;
  businessRole: string;
  canReceiveDecisionPackage: boolean;
  canReceiveReport: boolean;
};

type Workspace = {
  briefs: Brief[];
  decisions: Array<Record<string, unknown>>;
  receipts: Array<Record<string, unknown>>;
  effectReviews: Array<Record<string, unknown>>;
  executionActions: Array<Record<string, unknown>>;
  executionActionLinks: Array<Record<string, unknown>>;
  evidenceRequests: Array<Record<string, unknown>>;
  votes: Array<Record<string, unknown>>;
  committees: Array<Record<string, unknown>>;
  authorityResponses: Array<Record<string, unknown>>;
  slaEscalations: Array<Record<string, unknown>>;
  decisionDefinitions: Array<Record<string, unknown>>;
  slaPolicies: Array<Record<string, unknown>>;
  participants: Participant[];
  managementEscalations: Array<Record<string, unknown>>;
};

const ROLE_LABELS: Record<string, string> = {
  pm: "项目经理", operations: "运营", pmo: "PMO", ceo: "CEO", sponsor: "项目发起人",
  business_owner: "业务负责人", finance: "财务", quality: "质量",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿", submitted: "待CEO决策", decided: "已决策待下发", distributed: "已下发待回执/复核",
  effect_review_pending: "效果复核待审", effect_reviewed: "已复核待关闭", closed: "已闭环", withdrawn: "已撤回",
};

const WORKFLOW_LABELS: Record<string, string> = {
  draft: "草稿", evidence_required: "待补证", pending_decision: "待决策", decided: "已决策",
  translated: "已转译", executing: "执行中", effect_review: "效果复核", closed: "已关闭", reopened: "重新打开",
};

const EMPTY_WORKSPACE: Workspace = { briefs: [], decisions: [], receipts: [], effectReviews: [], executionActions: [], executionActionLinks: [], evidenceRequests: [], votes: [], committees: [], authorityResponses: [], slaEscalations: [], decisionDefinitions: [], slaPolicies: [], participants: [], managementEscalations: [] };

function asText(value: unknown): string {
  return String(value ?? "");
}

export default function DecisionCenterPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [actorUserId, setActorUserId] = useState("");
  const [snapshots, setSnapshots] = useState<Array<Record<string, unknown>>>([]);
  const [meetings, setMeetings] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [targetByBrief, setTargetByBrief] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ title: "", question: "", decisionType: "continue", decisionMode: "routine", decisionLevel: "executive", authorityMode: "individual", committeeId: "", structuredInput: { business_reason: "", forecast: "", risks: "", conditions: "" } as Record<string, unknown>, emergencyTrigger: "", responseSlaMinutes: "", reviewAt: "", reviewOwnerRole: "pmo", optionA: "", optionAImpact: "", optionB: "", optionBImpact: "", recommendation: "A", impact: "", deadline: "", executionDueAt: "", acceptanceCriteria: "", evidenceType: "", evidenceId: "", evidenceTitle: "", meetingId: "", snapshotId: "", sourceSignalIds: [] as string[] });
  const [report, setReport] = useState({ type: "weekly", periodStart: "", periodEnd: "", narrative: "", sourceSystem: "", sourceId: "", metrics: { progress: "", forecast: "", exception_count: "" } as Record<string, unknown>, target: "" });
  const [actionEvidenceId, setActionEvidenceId] = useState("");
  const [meetingForm, setMeetingForm] = useState({ type: "monthly_operating", title: "", scheduledAt: "", agenda: "" });

  const query = useMemo(() => {
    if (!context) return "";
    return new URLSearchParams({ org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, business_role: context.businessRole, data_class: readStoredDataClass() }).toString();
  }, [context]);

  const load = useCallback(async () => {
    if (!query) return;
    setLoading(true);
    setError("");
    try {
      const [decisionResponse, reportResponse, meetingResponse] = await Promise.all([
        fetch(`/api/decisions?${query}`, { cache: "no-store" }),
        fetch(`/api/reporting/snapshots?${query}`, { cache: "no-store" }),
        fetch(`/api/governance/meetings?${query}`, { cache: "no-store" }),
      ]);
      const [decisionBody, reportBody, meetingBody] = await Promise.all([decisionResponse.json(), reportResponse.json(), meetingResponse.json()]);
      if (!decisionResponse.ok) throw new Error(decisionBody.detail || decisionBody.warning || "无法读取决策工作区。");
      if (!reportResponse.ok) throw new Error(reportBody.detail || reportBody.warning || "无法读取汇报快照。");
      if (!meetingResponse.ok) throw new Error(meetingBody.detail || meetingBody.warning || "无法读取治理会议。");
      setWorkspace(decisionBody.workspace ?? EMPTY_WORKSPACE);
      setActorUserId(asText(decisionBody.actor_user_id));
      setSnapshots(reportBody.snapshots ?? []);
      setMeetings(meetingBody.meetings ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "业务数据读取失败。");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch("/api/context/current", { cache: "no-store" });
        const body = await response.json() as { available_contexts?: Array<{ id: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string; status: string }>; active_context?: StoredBusinessContext | null; detail?: string };
        if (!response.ok) throw new Error(body.detail || "无法读取业务身份。");
        const stored = readStoredBusinessContext();
        const assignment = body.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active") ?? body.available_contexts?.find(item => item.status === "active");
        if (!assignment) throw new Error("尚未分配有效业务角色，请先在安全中心完成配置。");
        const next = { assignmentId: assignment.id, businessRole: assignment.businessRole, orgId: assignment.orgId, subjectScope: assignment.subjectScope, subjectId: assignment.subjectId };
        writeStoredBusinessContext(next);
        if (!cancelled) setContext(next);
      } catch (cause) {
        if (!cancelled) { setError(cause instanceof Error ? cause.message : "业务身份读取失败。"); setLoading(false); }
      }
    }
    initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!query) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function patchBrief(id: string, payload: Record<string, unknown>) {
    setMessage(""); setError("");
    const response = await fetch(`/api/decisions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, business_role: context?.businessRole }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.warning || body.detail || "操作失败。");
    setMessage("操作已记录，状态与审计轨迹已更新。");
    await load();
  }

  async function createDraft() {
    if (!context) return;
    try {
      const response = await fetch("/api/decisions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, business_role: context.businessRole, data_class: readStoredDataClass(),
        brief: { title: draft.title, decisionQuestion: draft.question, decisionType: draft.decisionType, decisionMode: draft.decisionMode, decisionLevel: draft.decisionLevel, authorityMode: draft.authorityMode, committeeId: draft.authorityMode === "committee" ? draft.committeeId : null, structuredInput: draft.structuredInput, emergencyTrigger: draft.decisionMode === "emergency" ? draft.emergencyTrigger : null, responseSlaMinutes: draft.decisionMode === "emergency" ? Number(draft.responseSlaMinutes) : null, reviewPlan: { review_at: draft.reviewAt, owner_role: draft.reviewOwnerRole }, options: [{ key: "A", label: draft.optionA, consequences: draft.optionAImpact }, { key: "B", label: draft.optionB, consequences: draft.optionBImpact }], recommendation: draft.recommendation, impactSummary: draft.impact, requestedDecisionAt: draft.deadline, executionDueAt: draft.executionDueAt, acceptanceCriteria: draft.acceptanceCriteria, evidence: draft.evidenceId ? [{ source_type: draft.evidenceType || "business_record", source_id: draft.evidenceId, title: draft.evidenceTitle || "决策依据" }] : [], meetingId: draft.meetingId || null, reportingSnapshotId: draft.snapshotId || null, sourceSignalIds: draft.sourceSignalIds },
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.warning || "决策包创建失败。");
      setDraft(value => ({ ...value, title: "", question: "", optionA: "", optionAImpact: "", optionB: "", optionBImpact: "", impact: "", deadline: "", executionDueAt: "", acceptanceCriteria: "", evidenceType: "", evidenceId: "", evidenceTitle: "", sourceSignalIds: [] }));
      setMessage("决策包草稿已创建，请在下方指定CEO后提交。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "决策包创建失败。"); }
  }

  async function createReport() {
    if (!context) return;
    try {
      const response = await fetch("/api/reporting/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, business_role: context.businessRole, data_class: readStoredDataClass(),
        snapshot_type: report.type, period_start: report.periodStart, period_end: report.periodEnd, narrative: report.narrative,
        source_snapshot_at: new Date().toISOString(), source_definition: { source_system: report.sourceSystem, source_id: report.sourceId }, metrics: report.metrics, exceptions: [], submitted_to_user_id: report.target || null,
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.warning || "汇报快照创建失败。");
      setMessage(report.target ? "真实汇报快照已按汇报关系提交给PMO。" : "汇报快照草稿已保存。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "汇报快照创建失败。"); }
  }

  async function acceptReport(snapshotId: string) {
    if (!context) return;
    try {
      const response = await fetch("/api/reporting/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept", snapshot_id: snapshotId, business_role: context.businessRole }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.warning || "汇报快照接收失败。");
      setMessage("汇报快照已由PMO接收，可纳入会议和决策包。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "汇报快照接收失败。"); }
  }

  async function createMeeting() {
    if (!context) return;
    try {
      const response = await fetch("/api/governance/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "schedule", org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, business_role: context.businessRole, data_class: readStoredDataClass(),
        meeting_type: meetingForm.type, title: meetingForm.title, scheduled_at: meetingForm.scheduledAt,
        attendee_user_ids: workspace.participants.map(item => item.userId), agenda: [{ title: meetingForm.agenda }], reporting_snapshot_ids: snapshots.filter(item => item.status === "frozen").map(item => asText(item.id)),
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.warning || "会议创建失败。");
      setMessage("治理会议已建立，汇报快照已纳入输入。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "会议创建失败。"); }
  }

  async function recordMeeting(meetingId: string) {
    if (!context) return;
    const minutes = window.prompt("请填写会议纪要");
    const title = window.prompt("请填写会议结论");
    const disposition = window.prompt("结论输出类型：action / decision / no_action", "action");
    const reviewAt = window.prompt("请填写复审时间（ISO或 2026-07-31 18:00）");
    if (!minutes || !title || !disposition || !reviewAt) return;
    let conclusion: Record<string, unknown>;
    if (disposition === "no_action") conclusion = { type: "no_action", title, rationale: window.prompt("请说明无需处理的依据") || "", review_at: reviewAt };
    else if (disposition === "decision") {
      conclusion = { type: "decision", title, review_at: reviewAt, decision_brief: { title: draft.title || title, decisionQuestion: draft.question, decisionType: draft.decisionType, decisionMode: "routine", decisionLevel: draft.decisionLevel, authorityMode: draft.authorityMode, committeeId: draft.committeeId || null, structuredInput: draft.structuredInput, reviewPlan: { review_at: reviewAt, owner_role: "pmo" }, options: [{ key: "A", label: draft.optionA, consequences: draft.optionAImpact }, { key: "B", label: draft.optionB, consequences: draft.optionBImpact }], recommendation: draft.recommendation, impactSummary: draft.impact, requestedDecisionAt: draft.deadline, executionDueAt: draft.executionDueAt, acceptanceCriteria: draft.acceptanceCriteria, evidence: draft.evidenceId ? [{ source_type: draft.evidenceType || "business_record", source_id: draft.evidenceId, title: draft.evidenceTitle || "决策依据" }] : [], meetingId, reportingSnapshotId: draft.snapshotId || null, sourceSignalIds: draft.sourceSignalIds } };
    } else {
      const owner = downstream[0]; const dueAt = window.prompt("请填写行动截止时间"); const acceptance = window.prompt("请填写验收标准");
      if (!owner || !dueAt || !acceptance) { setError("行动结论需要当前主体的责任人、deadline和验收标准。"); return; }
      conclusion = { type: "action", title, owner_user_id: owner.userId, owner_business_role: owner.businessRole, due_at: dueAt, acceptance_criteria: acceptance, review_at: reviewAt };
    }
    try {
      const response = await fetch("/api/governance/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        action: "record", meeting_id: meetingId, business_role: context.businessRole,
        minutes, conclusions: [conclusion],
      }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.warning || "会议结果记录失败。");
      setMessage("会议纪要与结论已记录，可作为决策包的正式输入。");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "会议结果记录失败。"); }
  }

  async function operateMeeting(meetingId: string, action: string, extra: Record<string, unknown> = {}) {
    if (!context) return;
    const response = await fetch("/api/governance/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, meeting_id: meetingId, business_role: context.businessRole, ...extra }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.warning || body.detail || "会议状态操作失败。");
    setMessage("会议状态与审计记录已更新。"); await load();
  }

  async function assignMyMeetingDelegate(meetingId: string) {
    if (!context || !actorUserId) return;
    const candidates = workspace.participants.filter(item => item.userId !== actorUserId);
    const proxyName = window.prompt(`请输入代理人姓名：\n${candidates.map(item => `${item.name}（${ROLE_LABELS[item.businessRole] || item.businessRole}）`).join("\n")}`);
    const proxy = candidates.find(item => item.name === proxyName);
    if (!proxy) { setError("请选择当前业务主体下具有有效角色的代理人。"); return; }
    const reason = window.prompt("请填写缺席和委托原因");
    const validFrom = window.prompt("授权开始时间（ISO 或 2026-07-31 09:00）");
    const validUntil = window.prompt("授权截止时间（必须覆盖会议但不得长期有效）");
    if (!reason || !validFrom || !validUntil) return;
    await operateMeeting(meetingId, "delegate", {
      absent_user_id: actorUserId,
      absent_business_role: context.businessRole,
      proxy_user_id: proxy.userId,
      proxy_business_role: proxy.businessRole,
      reason,
      valid_from: validFrom,
      valid_until: validUntil,
    });
  }

  async function createCommittee() {
    if (!context) return;
    const name = window.prompt("决策委员会名称"); if (!name || ceoTargets.length === 0) { setError("请先配置PMO→CEO/Sponsor汇报关系。"); return; }
    const quorum = Math.max(1, Math.ceil(ceoTargets.length / 2));
    const response = await fetch("/api/decisions/committees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org_id: context.orgId, subject_scope: context.subjectScope, subject_id: context.subjectId, data_class: readStoredDataClass(), business_role: context.businessRole, name, decision_levels: ["portfolio", "executive"], chair_user_id: ceoTargets[0].userId, quorum, min_approvals: quorum, members: ceoTargets.map((item, index) => ({ user_id: item.userId, business_role: item.businessRole, member_role: index === 0 ? "chair" : "voter" })) }) });
    const body = await response.json(); if (!response.ok) throw new Error(body.warning || body.detail || "委员会创建失败。"); setMessage("决策委员会已创建。"); await load();
  }

  const ceoTargets = workspace.participants.filter(item => item.canReceiveDecisionPackage);
  const reportTargets = workspace.participants.filter(item => item.canReceiveReport);
  const downstream = workspace.participants.filter(item => ["pm", "operations", "business_owner", "finance", "quality"].includes(item.businessRole));

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link>
        <strong style={{ color: "var(--purple)" }}>汇报、会议与CEO决策中心</strong>
        {context && <span className="tag tag-purple">{ROLE_LABELS[context.businessRole] || context.businessRole} · {context.subjectScope}/{context.subjectId}</span>}
      </header>

      <div style={{ maxWidth: 1240, margin: "0 auto", padding: 28, display: "grid", gap: 18 }}>
        <section className="card" style={{ background: "linear-gradient(135deg,rgba(139,92,246,.16),rgba(59,130,246,.08))" }}>
          <h1 style={{ fontSize: "1.55rem", marginBottom: 10 }}>从一线事实到CEO决策，再回到执行效果</h1>
          <p style={{ color: "var(--text2)", lineHeight: 1.8 }}>PM/运营提交有数据来源的汇报快照，PMO组织治理会议并编制决策包，CEO只在明确业务角色和汇报关系下决策，结果下发后必须有回执、证据和效果复核才能关闭。</p>
          <p style={{ color: "var(--text2)", lineHeight: 1.8 }}><strong>例会决策</strong>冻结会议/汇报依据；<strong>紧急决策</strong>按版本化 SLA 升级。支持待补证、决策委员会、代理、拒绝承接、弃权和重新打开，每个动作都留审计记录。</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,minmax(120px,1fr))", gap: 8, marginTop: 16 }}>
            {["业务快照", "PMO会议", "决策包", "CEO决策", "下行回执", "效果复核"].map((item, index) => <div key={item} className="stat-card" style={{ padding: 12 }}><div style={{ color: "var(--accent2)", fontWeight: 800 }}>{index + 1}</div><div className="stat-label">{item}</div></div>)}
          </div>
        </section>

        {message && <div className="card" style={{ borderColor: "var(--green)", color: "var(--green)" }}>{message}</div>}
        {error && <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</div>}
        {loading && <div className="card" style={{ color: "var(--text2)" }}>正在读取当前业务主体的真实记录……</div>}

        {context && ["pm", "operations", "pmo"].includes(context.businessRole) && (
          <section className="card">
            <h2 className="section-title">汇报快照</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              <select className="input" value={report.type} onChange={event => setReport(value => ({ ...value, type: event.target.value }))}><option value="daily">日报</option><option value="weekly">周报</option><option value="monthly">月报</option><option value="quarterly">季度报告</option><option value="ad_hoc">专项报告</option></select>
              <input className="input" type="date" value={report.periodStart} onChange={event => setReport(value => ({ ...value, periodStart: event.target.value }))} aria-label="周期开始" />
              <input className="input" type="date" value={report.periodEnd} onChange={event => setReport(value => ({ ...value, periodEnd: event.target.value }))} aria-label="周期结束" />
              <select className="input" value={report.target} onChange={event => setReport(value => ({ ...value, target: event.target.value }))}><option value="">仅保存草稿</option>{reportTargets.map(item => <option key={item.userId} value={item.userId}>提交给 {item.name} (PMO)</option>)}</select>
              <input className="input" placeholder="数据系统（例如飞书项目台账）" value={report.sourceSystem} onChange={event => setReport(value => ({ ...value, sourceSystem: event.target.value }))} />
              <BusinessEntitySelect kind="businessObject" value={report.sourceId} onChange={sourceId => setReport(value => ({ ...value, sourceId }))} placeholder="选择本次汇报依据"/>
              <input className="input" placeholder="业务摘要与例外说明" value={report.narrative} onChange={event => setReport(value => ({ ...value, narrative: event.target.value }))} />
            </div>
            <div style={{ marginTop: 12 }}><h3 style={{ fontSize: ".9rem", marginBottom: 8 }}>本周/本期核心指标</h3><StructuredFieldsEditor value={report.metrics} onChange={metrics => setReport(value => ({ ...value, metrics }))} labels={{ progress: "项目进度", forecast: "最新预测", exception_count: "例外数量" }}/></div>
            <button className="btn-primary" style={{ marginTop: 12 }} onClick={createReport}>保存/提交快照</button>
            <div style={{ marginTop: 14, color: "var(--text2)" }}>已有 {snapshots.length} 份快照。{snapshots.length === 0 && "当前主体尚无汇报记录。"}</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {snapshots.map(snapshot => <div key={asText(snapshot.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}><div><strong>{asText(snapshot.snapshot_type)} · {asText(snapshot.period_start)} 至 {asText(snapshot.period_end)} · V{asText(snapshot.version)}</strong><div style={{ color: "var(--text2)", marginTop: 3 }}>{asText(snapshot.narrative)} · {asText(snapshot.status)}</div></div>{context.businessRole === "pmo" && snapshot.status === "submitted" && <span style={{ display: "flex", gap: 6 }}><button className="btn-secondary" onClick={() => { const reason = window.prompt("退回补正原因"); const due = window.prompt("补正截止时间"); if (reason && due) fetch("/api/reporting/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "return", snapshot_id: snapshot.id, business_role: context.businessRole, reason, due_at: due }) }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.warning); await load(); }).catch(cause => setError(cause.message)); }}>退回补正</button><button className="btn-primary" onClick={() => acceptReport(asText(snapshot.id))}>接收并冻结</button></span>}{["pm", "operations", "pmo"].includes(context.businessRole) && snapshot.status === "returned" && <button className="btn-primary" onClick={() => fetch("/api/reporting/snapshots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resubmit", snapshot_id: snapshot.id, business_role: context.businessRole, reason: "已按退回意见完成补正" }) }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.warning); await load(); }).catch(cause => setError(cause.message))}>重新提交</button>}</div>)}
            </div>
          </section>
        )}

        {context?.businessRole === "pmo" && (
          <>
            <section className="card">
              <h2 className="section-title">PMO治理会议</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
                <select className="input" value={meetingForm.type} onChange={event => setMeetingForm(value => ({ ...value, type: event.target.value }))}><option value="weekly_portfolio">周组合会</option><option value="monthly_operating">月度经营会</option><option value="quarterly_portfolio">季度组合会</option><option value="decision">决策会</option><option value="ad_hoc">专项会</option></select>
                <input className="input" placeholder="会议标题" value={meetingForm.title} onChange={event => setMeetingForm(value => ({ ...value, title: event.target.value }))} />
                <input className="input" type="datetime-local" value={meetingForm.scheduledAt} onChange={event => setMeetingForm(value => ({ ...value, scheduledAt: event.target.value }))} aria-label="会议时间" />
                <input className="input" placeholder="核心议题" value={meetingForm.agenda} onChange={event => setMeetingForm(value => ({ ...value, agenda: event.target.value }))} />
              </div>
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={createMeeting}>创建治理会议</button>
              <div style={{ marginTop: 14, color: "var(--text2)" }}>已建立 {meetings.length} 场会议。</div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {meetings.map(meeting => { const plans = Array.isArray(meeting.meeting_review_plans) ? meeting.meeting_review_plans as Array<Record<string, unknown>> : []; const delegates = Array.isArray(meeting.governance_meeting_delegates) ? meeting.governance_meeting_delegates as Array<Record<string, unknown>> : []; return <div key={asText(meeting.id)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}><div><strong>{asText(meeting.title)}</strong><div style={{ color: "var(--text2)", marginTop: 3 }}>{asText(meeting.scheduled_at)} · {asText(meeting.status)} · 有效缺席代理 {delegates.filter(item => item.status === "active").length} · 复审 {plans.filter(plan => plan.status === "accepted").length}/{plans.length}</div></div><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["scheduled", "agenda_frozen"].includes(asText(meeting.status)) && <button className="btn-secondary" onClick={() => assignMyMeetingDelegate(asText(meeting.id)).catch(cause => setError(cause.message))}>设置我的缺席代理</button>}{meeting.status === "scheduled" && <button className="btn-primary" onClick={() => operateMeeting(asText(meeting.id), "freeze_agenda").catch(cause => setError(cause.message))}>冻结议程与依据</button>}{meeting.status === "agenda_frozen" && <button className="btn-primary" onClick={() => operateMeeting(asText(meeting.id), "start").catch(cause => setError(cause.message))}>开始会议</button>}{meeting.status === "in_progress" && <button className="btn-secondary" onClick={() => recordMeeting(asText(meeting.id))}>记录纪要与结论</button>}{meeting.status === "actions_pending" && <button className="btn-primary" onClick={() => operateMeeting(asText(meeting.id), "start_effect_review").catch(cause => setError(cause.message))}>进入效果复审</button>}{meeting.status === "effect_review" && plans.filter(plan => !["accepted", "closed"].includes(asText(plan.status))).map(plan => <button key={asText(plan.id)} className="btn-secondary" onClick={() => { const result = window.prompt("复审结论与证据说明"); if (result) operateMeeting(asText(meeting.id), "review_output", { review_plan_id: plan.id, result, approved: true }).catch(cause => setError(cause.message)); }}>复核结论</button>)}{meeting.status === "effect_review" && plans.length > 0 && plans.every(plan => ["accepted", "closed"].includes(asText(plan.status))) && <button className="btn-primary" onClick={() => operateMeeting(asText(meeting.id), "close").catch(cause => setError(cause.message))}>关闭会议</button>}</span></div>; })}
              </div>
            </section>

            <section className="card">
              <h2 className="section-title">编制决策包</h2>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}><span style={{ color: "var(--text2)" }}>已配置决策委员会 {workspace.committees.length} 个</span><button className="btn-secondary" onClick={() => createCommittee().catch(cause => setError(cause.message))}>创建决策委员会</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                <input className="input" placeholder="决策包标题" value={draft.title} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} />
                <input className="input" placeholder="需要CEO回答的决策问题" value={draft.question} onChange={event => setDraft(value => ({ ...value, question: event.target.value }))} />
                <select className="input" value={draft.decisionType} onChange={event => setDraft(value => ({ ...value, decisionType: event.target.value }))}><option value="continue">继续/有条件继续</option><option value="accelerate">加速</option><option value="downgrade">降级/范围调整</option><option value="pause">暂停</option><option value="terminate">终止</option><option value="resource_adjustment">资源调整</option><option value="risk_acceptance">风险接受</option><option value="evidence_request">补充证据</option></select>
                <select className="input" value={draft.decisionMode} onChange={event => setDraft(value => ({ ...value, decisionMode: event.target.value }))}><option value="routine">例会决策</option><option value="emergency">紧急决策</option></select>
                <select className="input" value={draft.decisionLevel} onChange={event => setDraft(value => ({ ...value, decisionLevel: event.target.value }))}><option value="project">项目级</option><option value="portfolio">组合级</option><option value="executive">高管级</option></select>
                <select className="input" value={draft.authorityMode} onChange={event => setDraft(value => ({ ...value, authorityMode: event.target.value }))}><option value="individual">个人授权决策</option><option value="committee">决策委员会</option></select>
                {draft.authorityMode === "committee" && <select className="input" value={draft.committeeId} onChange={event => setDraft(value => ({ ...value, committeeId: event.target.value }))}><option value="">选择决策委员会</option>{workspace.committees.map(item => <option key={asText(item.id)} value={asText(item.id)}>{asText(item.name)}</option>)}</select>}
                <div style={{ gridColumn: "1 / -1" }}><h3 style={{ fontSize: ".9rem", marginBottom: 8 }}>标准决策输入</h3><StructuredFieldsEditor value={draft.structuredInput} onChange={structuredInput => setDraft(value => ({ ...value, structuredInput }))} labels={{ business_reason: "业务原因", forecast: "预测及趋势", risks: "主要风险", conditions: "决策条件" }} fixedKeys/></div>
                {draft.decisionMode === "emergency" && <><input className="input" placeholder="紧急决策触发事件" value={draft.emergencyTrigger} onChange={event => setDraft(value => ({ ...value, emergencyTrigger: event.target.value }))} /><input className="input" type="number" placeholder="响应 SLA（分钟）" value={draft.responseSlaMinutes} onChange={event => setDraft(value => ({ ...value, responseSlaMinutes: event.target.value }))} /></>}
                <input className="input" type="datetime-local" value={draft.reviewAt} onChange={event => setDraft(value => ({ ...value, reviewAt: event.target.value }))} aria-label="效果复审时间" />
                <input className="input" type="datetime-local" value={draft.deadline} onChange={event => setDraft(value => ({ ...value, deadline: event.target.value }))} aria-label="要求决策时间" />
                <input className="input" type="datetime-local" value={draft.executionDueAt} onChange={event => setDraft(value => ({ ...value, executionDueAt: event.target.value }))} aria-label="决策执行截止时间" />
                <input className="input" placeholder="决策执行验收标准" value={draft.acceptanceCriteria} onChange={event => setDraft(value => ({ ...value, acceptanceCriteria: event.target.value }))} />
                <input className="input" placeholder="方案A" value={draft.optionA} onChange={event => setDraft(value => ({ ...value, optionA: event.target.value }))} />
                <input className="input" placeholder="方案A影响" value={draft.optionAImpact} onChange={event => setDraft(value => ({ ...value, optionAImpact: event.target.value }))} />
                <input className="input" placeholder="方案B" value={draft.optionB} onChange={event => setDraft(value => ({ ...value, optionB: event.target.value }))} />
                <input className="input" placeholder="方案B影响" value={draft.optionBImpact} onChange={event => setDraft(value => ({ ...value, optionBImpact: event.target.value }))} />
                <select className="input" value={draft.recommendation} onChange={event => setDraft(value => ({ ...value, recommendation: event.target.value }))}><option value="A">建议方案A</option><option value="B">建议方案B</option></select>
                <input className="input" placeholder="业务/财务/客户/交付影响" value={draft.impact} onChange={event => setDraft(value => ({ ...value, impact: event.target.value }))} />
                <BusinessEntitySelect kind="evidence" value={draft.evidenceId} onChange={evidenceId => setDraft(value => ({ ...value, evidenceId }))} onSelectedOption={option => option && setDraft(value => ({ ...value, evidenceType: "business_record", evidenceTitle: option.label }))} placeholder="选择决策依据"/>
                <select className="input" value={draft.meetingId} onChange={event => setDraft(value => ({ ...value, meetingId: event.target.value }))}><option value="">不关联会议</option>{meetings.map(item => <option key={asText(item.id)} value={asText(item.id)}>{asText(item.title)}</option>)}</select>
                <select className="input" value={draft.snapshotId} onChange={event => setDraft(value => ({ ...value, snapshotId: event.target.value }))}><option value="">不关联汇报快照</option>{snapshots.filter(item => item.status === "frozen").map(item => <option key={asText(item.id)} value={asText(item.id)}>{asText(item.snapshot_type)} · {asText(item.period_start)} · V{asText(item.version)}</option>)}</select>
              </div>
              {workspace.managementEscalations.length > 0 && <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}><strong>纳入待编制决策包的管理升级</strong><div style={{ display: "grid", gap: 6, marginTop: 8 }}>{workspace.managementEscalations.map(item => { const signalId = asText(item.signal_id); return <label key={asText(item.id)} style={{ display: "flex", gap: 8, color: "var(--text2)" }}><input type="checkbox" checked={draft.sourceSignalIds.includes(signalId)} onChange={event => setDraft(value => ({ ...value, sourceSignalIds: event.target.checked ? [...value.sourceSignalIds, signalId] : value.sourceSignalIds.filter(id => id !== signalId) }))} />{asText(item.reason)} · 截止 {asText(item.due_at)}</label>; })}</div></div>}
              <button className="btn-primary" style={{ marginTop: 12 }} onClick={createDraft}>保存决策包草稿</button>
            </section>
          </>
        )}

        <section className="card">
          <h2 className="section-title">{context?.businessRole === "ceo" ? "CEO决策收件箱" : "决策闭环台账"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,420px) 1fr", gap: 10, alignItems: "center", padding: 10, borderRadius: 8, background: "var(--surface2)", marginBottom: 12 }}><BusinessEntitySelect kind="evidence" value={actionEvidenceId} onChange={setActionEvidenceId} placeholder="选择本次补证/执行/复核证据"/><span style={{ color: "var(--text2)", fontSize: ".75rem" }}>涉及补证、执行结果、效果复核或重开时，请先选择经治理的证据。</span></div>
          {workspace.briefs.length === 0 && <p style={{ color: "var(--text2)" }}>当前主体尚无决策包；系统不会生成预置或演示记录。</p>}
          <div style={{ display: "grid", gap: 12 }}>
            {workspace.briefs.map(brief => {
              const decision = workspace.decisions.find(item => asText(item.brief_id) === brief.id);
              const receipts = workspace.receipts.filter(item => asText(item.brief_id) === brief.id);
              const reviews = workspace.effectReviews.filter(item => asText(item.brief_id) === brief.id);
              const executionActions = workspace.executionActions.filter(item => asText(item.source_id) === brief.id);
              const evidenceRequests = workspace.evidenceRequests.filter(item => asText(item.brief_id) === brief.id);
              const votes = workspace.votes.filter(item => asText(item.brief_id) === brief.id);
              const slaEscalations = workspace.slaEscalations.filter(item => asText(item.brief_id) === brief.id && item.status === "open");
              return (
                <article key={brief.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--surface2)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div><strong>{brief.title}</strong><div style={{ color: "var(--text2)", marginTop: 5 }}>{brief.decisionQuestion}</div></div>
                    <span className="tag tag-purple">{WORKFLOW_LABELS[brief.workflowStatus] || STATUS_LABELS[brief.status] || brief.workflowStatus}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
                    {brief.options.map(option => <div key={option.key} style={{ border: "1px solid var(--border)", padding: 10, borderRadius: 8 }}><strong>{option.key}. {option.label}</strong><div style={{ color: "var(--text2)", marginTop: 4 }}>{option.consequences}</div></div>)}
                  </div>
                  <p style={{ color: "var(--text2)", marginTop: 10 }}>建议：{brief.recommendation}；影响：{brief.impactSummary}</p>
                  {decision && <p style={{ marginTop: 8, color: "var(--green)" }}>决策结果：{asText(decision.outcome)} · {asText(decision.rationale)}</p>}
                  <p style={{ marginTop: 8, color: "var(--text2)" }}>回执：{receipts.filter(item => item.status === "acknowledged").length}/{receipts.length} · 效果复核：{reviews.filter(item => item.status === "approved").length}/{reviews.length}</p>
                  <p style={{ marginTop: 8, color: "var(--text2)" }}>执行截止：{brief.executionDueAt} · 验收标准：{brief.acceptanceCriteria}</p>
                  <p style={{ marginTop: 8, color: "var(--text2)" }}>类型：{brief.decisionType} · 模式：{brief.decisionMode} · 授权：{brief.authorityMode} · 投票 {votes.length} · SLA 升级 {slaEscalations.length}</p>
                  {evidenceRequests.map(item => <p key={asText(item.id)} style={{ marginTop: 6, color: "var(--orange)" }}>待补证：{asText(item.reason)} · {asText(item.status)} · 截止 {asText(item.due_at)}</p>)}
                  {executionActions.map(action => <p key={asText(action.id)} style={{ marginTop: 6, color: "var(--cyan)" }}>决策行动：{asText(action.title)} · {asText(action.status)} · 截止 {asText(action.due_date)}</p>)}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {context?.businessRole === "pmo" && brief.status === "draft" && <>{brief.authorityMode === "individual" && <select className="input" style={{ width: 250 }} value={targetByBrief[brief.id] || ""} onChange={event => setTargetByBrief(value => ({ ...value, [brief.id]: event.target.value }))}><option value="">选择汇报关系中的CEO/Sponsor</option>{ceoTargets.map(item => <option key={item.userId} value={item.userId}>{item.name} · {ROLE_LABELS[item.businessRole]}</option>)}</select>}<button className="btn-primary" onClick={() => patchBrief(brief.id, { action: "submit", target_user_id: brief.authorityMode === "individual" ? targetByBrief[brief.id] : null }).catch(cause => setError(cause.message))}>{brief.authorityMode === "committee" ? "提交决策委员会" : "提交授权决策人"}</button></>}
                    {context && ["ceo", "sponsor"].includes(context.businessRole) && brief.workflowStatus === "pending_decision" && brief.authorityMode === "individual" && <><button className="btn-primary" onClick={() => { const rationale = window.prompt("请填写决策理由"); if (rationale) patchBrief(brief.id, { action: "decide", outcome: "approved", selected_option_key: brief.recommendation, rationale }).catch(cause => setError(cause.message)); }}>批准建议方案</button><button className="btn-secondary" onClick={() => { const required = window.prompt("请填写需补充的证据，多项用逗号分隔"); const reason = window.prompt("请填写退回补证原因"); const due = window.prompt("补证截止时间"); if (required && reason && due) patchBrief(brief.id, { action: "request_evidence", required_items: required.split(","), reason, due_at: due }).catch(cause => setError(cause.message)); }}>要求补证</button><button className="btn-secondary" onClick={() => { const reason = window.prompt("拒绝承接决策的原因"); if (reason) patchBrief(brief.id, { action: "decline", reason }).catch(cause => setError(cause.message)); }}>拒绝承接</button></>}
                    {context && ["ceo", "sponsor"].includes(context.businessRole) && brief.workflowStatus === "pending_decision" && brief.authorityMode === "committee" && <><button className="btn-primary" onClick={() => { const rationale = window.prompt("同意理由"); if (rationale) patchBrief(brief.id, { action: "vote", vote: "approve", selected_option_key: brief.recommendation, rationale }).catch(cause => setError(cause.message)); }}>委员会同意票</button><button className="btn-secondary" onClick={() => { const rationale = window.prompt("弃权理由"); if (rationale) patchBrief(brief.id, { action: "vote", vote: "abstain", rationale }).catch(cause => setError(cause.message)); }}>弃权</button></>}
                    {context?.businessRole === "pmo" && evidenceRequests.filter(item => ["open", "rejected"].includes(asText(item.status))).map(item => <button key={`evidence-submit-${asText(item.id)}`} className="btn-primary" disabled={!actionEvidenceId} onClick={() => { const response = window.prompt("请填写补证说明"); if (response && actionEvidenceId) patchBrief(brief.id, { action: "resubmit_evidence", evidence_request_id: item.id, response, evidence: [{ source_type: "business_record", source_id: actionEvidenceId, title: "决策补充证据" }] }).catch(cause => setError(cause.message)); }}>提交补证</button>)}
                    {context && ["ceo", "sponsor"].includes(context.businessRole) && evidenceRequests.filter(item => item.status === "submitted").map(item => <button key={`evidence-review-${asText(item.id)}`} className="btn-primary" onClick={() => { const response = window.prompt("请填写补证复核意见"); if (response) patchBrief(brief.id, { action: "review_evidence", evidence_request_id: item.id, response, approved: true }).catch(cause => setError(cause.message)); }}>通过补证</button>)}
                    {context?.businessRole === "pmo" && brief.authorityMode === "individual" && brief.workflowStatus === "pending_decision" && workspace.authorityResponses.some(item => asText(item.brief_id) === brief.id && item.response_type === "declined") && <button className="btn-secondary" onClick={() => { const target = ceoTargets[0]; const reason = window.prompt("重新指派授权决策人的原因"); if (target && reason) patchBrief(brief.id, { action: "reassign", target_user_id: target.userId, target_business_role: target.businessRole, reason }).catch(cause => setError(cause.message)); }}>重新指派决策人</button>}
                    {context?.businessRole === "pmo" && brief.status === "decided" && <button className="btn-primary" disabled={downstream.length === 0} onClick={() => patchBrief(brief.id, { action: "distribute", recipients: downstream.map(item => ({ user_id: item.userId, business_role: item.businessRole })) }).catch(cause => setError(cause.message))}>下发给当前主体责任人</button>}
                    {receipts.filter(item => ["pending", "disputed"].includes(asText(item.status))).map(receipt => <span key={asText(receipt.id)} style={{ display: "flex", gap: 6 }}>{receipt.status === "pending" && <button className="btn-secondary" onClick={() => { const response = window.prompt("请填写异议与需要补充的条件"); if (response) patchBrief(brief.id, { action: "acknowledge", receipt_id: receipt.id, response, disputed: true }).catch(cause => setError(cause.message)); }}>提出异议</button>}<button className="btn-primary" onClick={() => { const response = window.prompt(receipt.status === "disputed" ? "异议处理后，请填写最终接收说明" : "请填写接收与执行说明"); if (response) patchBrief(brief.id, { action: "acknowledge", receipt_id: receipt.id, response }).catch(cause => setError(cause.message)); }}>确认决策回执</button></span>)}
                    {receipts.filter(item => item.status === "acknowledged").flatMap(receipt => workspace.executionActionLinks.filter(link => asText(link.receipt_id) === asText(receipt.id)).map(link => { const action = executionActions.find(item => asText(item.id) === asText(link.action_item_id)); if (!action) return null; if (action.status === "accepted") return <button key={`start-${asText(action.id)}`} className="btn-primary" onClick={() => { const comment = window.prompt("请填写执行计划与启动说明"); if (comment) patchBrief(brief.id, { action: "start_execution", receipt_id: receipt.id, action_item_id: action.id, comment }).catch(cause => setError(cause.message)); }}>开始：{asText(action.title)}</button>; if (action.status === "in_progress") return <button key={`evidence-${asText(action.id)}`} className="btn-primary" disabled={!actionEvidenceId} onClick={() => { const comment = window.prompt("请填写执行结果"); if (comment && actionEvidenceId) patchBrief(brief.id, { action: "submit_execution_evidence", receipt_id: receipt.id, action_item_id: action.id, comment, evidence: [{ source_type: "business_record", source_id: actionEvidenceId, title: "决策执行证据" }] }).catch(cause => setError(cause.message)); }}>提交证据：{asText(action.title)}</button>; return null; }))}
                    {context && ["pm", "operations", "business_owner", "finance", "quality"].includes(context.businessRole) && ["executing", "effect_review"].includes(brief.workflowStatus) && executionActions.length > 0 && executionActions.every(item => item.status === "evidence_submitted") && <button className="btn-secondary" disabled={!actionEvidenceId} onClick={() => { const actual = window.prompt("请填写实际效果"); if (actual && actionEvidenceId) patchBrief(brief.id, { action: "submit_effect_review", expected_effect: brief.impactSummary, actual_effect: actual, effect_outcome: "partially_achieved", evidence: [{ source_type: "business_record", source_id: actionEvidenceId, title: "决策效果证据" }], metrics: Object.fromEntries(brief.reviewMetrics.map(metric => [metric, null])) }).catch(cause => setError(cause.message)); }}>提交效果复核</button>}
                    {context?.businessRole === "pmo" && brief.status === "effect_review_pending" && reviews.filter(item => item.status === "submitted").map(review => <button key={asText(review.id)} className="btn-primary" onClick={() => { const comment = window.prompt("请填写PMO复核意见"); if (comment) patchBrief(brief.id, { action: "approve_effect_review", review_id: review.id, approved: true, comment }).catch(cause => setError(cause.message)); }}>通过效果复核</button>)}
                    {context?.businessRole === "pmo" && brief.status === "effect_reviewed" && <button className="btn-primary" onClick={() => patchBrief(brief.id, { action: "close" }).catch(cause => setError(cause.message))}>验证回执并关闭</button>}
                    {context && ["pmo", "ceo", "sponsor"].includes(context.businessRole) && brief.workflowStatus === "closed" && <button className="btn-secondary" disabled={!actionEvidenceId} onClick={() => { const condition = window.prompt(`请选择触发的重开条件：\n${brief.revocationConditions.join("\n")}`); const reason = window.prompt("重新打开原因"); if (condition && reason && actionEvidenceId) patchBrief(brief.id, { action: "reopen", triggered_condition: condition, reason, evidence: [{ source_type: "business_record", source_id: actionEvidenceId, title: "决策重开证据" }] }).catch(cause => setError(cause.message)); }}>重新打开</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
