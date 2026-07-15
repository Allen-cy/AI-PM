"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  changeStatusLabels,
  changeTypeLabels,
  issueSeverityLabels,
  issueStatusLabels,
  unifiedActionStatusLabels,
  type ChangeAction,
  type ChangeRecord,
  type ChangeType,
  type IssueAction,
  type IssueChangeEventRecord,
  type IssueRecord,
  type IssueSeverity,
  type UnifiedActionRecord,
} from "@/features/issue-change/model";
import { buildProjectControlWriteContract, loadCurrentBusinessContextSearchParams } from "@/features/operating-model/client-context";

interface ChainBundle {
  status: "succeeded" | "not_configured" | "failed";
  issues: IssueRecord[];
  changes: ChangeRecord[];
  actions: UnifiedActionRecord[];
  events: IssueChangeEventRecord[];
  warning?: string;
}

type IssueForm = {
  projectName: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  owner: string;
  dueDate: string;
  impactScope: string;
  evidence: string;
  sourceRiskId: string;
  sourceRiskCode: string;
  actionItems: string;
};

type ChangeForm = {
  issueId: string;
  projectName: string;
  title: string;
  reason: string;
  changeType: ChangeType;
  impactScope: string;
  impactCost: string;
  impactScheduleDays: string;
  impactRevenue: string;
  impactCollection: string;
  owner: string;
  approver: string;
  dueDate: string;
  actionItems: string;
};

const initialBundle: ChainBundle = {
  status: "failed",
  issues: [],
  changes: [],
  actions: [],
  events: [],
};

const initialIssueForm: IssueForm = {
  projectName: "",
  title: "",
  description: "",
  severity: "medium",
  owner: "",
  dueDate: "",
  impactScope: "",
  evidence: "",
  sourceRiskId: "",
  sourceRiskCode: "",
  actionItems: "确认问题影响范围、处理责任人和关闭标准|项目经理||P1",
};

const initialChangeForm: ChangeForm = {
  issueId: "",
  projectName: "",
  title: "",
  reason: "",
  changeType: "scope",
  impactScope: "",
  impactCost: "",
  impactScheduleDays: "",
  impactRevenue: "",
  impactCollection: "",
  owner: "",
  approver: "PMO/项目发起人",
  dueDate: "",
  actionItems: "完成变更影响分析：范围、成本、进度、回款和审批建议|项目经理||P1",
};

const issueActions: Array<{ action: IssueAction; label: string; comment: string }> = [
  { action: "analyze", label: "进入分析", comment: "使用者已确认问题进入影响分析。" },
  { action: "require_change", label: "要求变更", comment: "该问题需要发起变更控制。" },
  { action: "resolve", label: "标记解决", comment: "问题处理方案已完成，进入解决/验证。" },
  { action: "close", label: "关闭问题", comment: "问题已验证关闭。" },
];

const changeActions: Array<{ action: ChangeAction; label: string; comment: string }> = [
  { action: "analyze", label: "影响分析", comment: "变更进入范围/成本/进度/回款影响分析。" },
  { action: "approve", label: "批准", comment: "变更已批准。" },
  { action: "reject", label: "拒绝", comment: "变更已拒绝。" },
  { action: "implement", label: "实施", comment: "变更进入实施。" },
  { action: "complete", label: "实施完成", comment: "变更实施完成，等待关闭。" },
  { action: "close", label: "关闭", comment: "变更已关闭。" },
];

function todayOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function StatusTag({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "purple" | "red" }) {
  const className = tone === "green" ? "tag-green" : tone === "amber" || tone === "red" ? "tag-amber" : tone === "purple" ? "tag-purple" : "tag-blue";
  return <span className={`tag ${className}`}>{children}</span>;
}

function issueTone(issue: IssueRecord): "blue" | "green" | "amber" | "purple" | "red" {
  if (issue.status === "closed" || issue.status === "resolved") return "green";
  if (issue.severity === "high" || issue.status === "change-required") return "amber";
  if (issue.status === "analyzing") return "purple";
  return "blue";
}

function changeTone(change: ChangeRecord): "blue" | "green" | "amber" | "purple" | "red" {
  if (change.status === "closed" || change.status === "implemented") return "green";
  if (change.status === "rejected") return "red";
  if (change.status === "approved" || change.status === "implementing") return "amber";
  if (change.status === "analyzing") return "purple";
  return "blue";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function numberOrUndefined(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function IssueChangePage() {
  const [bundle, setBundle] = useState<ChainBundle>(initialBundle);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [riskId, setRiskId] = useState("");
  const [issueForm, setIssueForm] = useState<IssueForm>(() => ({ ...initialIssueForm, dueDate: todayOffset(7) }));
  const [changeForm, setChangeForm] = useState<ChangeForm>(() => ({ ...initialChangeForm, dueDate: todayOffset(10) }));
  const [actionEvidence, setActionEvidence] = useState<Record<string, string>>({});
  const [scopeQuery, setScopeQuery] = useState("");

  const openActions = useMemo(
    () => bundle.actions.filter(action => action.status !== "done" && action.status !== "cancelled"),
    [bundle.actions],
  );
  const unresolvedIssues = useMemo(
    () => bundle.issues.filter(issue => issue.status !== "closed"),
    [bundle.issues],
  );
  const activeChanges = useMemo(
    () => bundle.changes.filter(change => change.status !== "closed" && change.status !== "rejected"),
    [bundle.changes],
  );

  async function load() {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams();
      const query = params.toString();
      setScopeQuery(query);
      const response = await fetch(`/api/issue-change?${query}`, { cache: "no-store" });
      const data = await response.json();
      setBundle({
        status: data.status || "failed",
        issues: Array.isArray(data.issues) ? data.issues : [],
        changes: Array.isArray(data.changes) ? data.changes : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
        events: Array.isArray(data.events) ? data.events : [],
        warning: data.warning,
      });
      setMessage(data.warning || "");
    } catch (error) {
      setBundle(initialBundle);
      setMessage(error instanceof Error ? error.message : "P5链路读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function submitOperation(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setMessage("");
    try {
      const query = scopeQuery || (await loadCurrentBusinessContextSearchParams()).toString();
      if (!scopeQuery) setScopeQuery(query);
      const response = await fetch(`/api/issue-change?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildProjectControlWriteContract(String(payload.operation || "issue_change"), Number(payload.expected_version || 0)), ...payload }),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "succeeded") {
        throw new Error(data.warning || "操作失败。");
      }
      setMessage(successMessage);
      await load();
      return data;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败。");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createManualIssue() {
    const data = await submitOperation({
      operation: "create_issue",
      ...issueForm,
      actionItems: issueForm.actionItems,
      sourceRiskId: issueForm.sourceRiskId || undefined,
      sourceRiskCode: issueForm.sourceRiskCode || undefined,
    }, "问题已创建，并生成统一行动项。");
    if (data) setIssueForm({ ...initialIssueForm, dueDate: todayOffset(7) });
  }

  async function escalateRisk() {
    if (!riskId.trim()) {
      setMessage("请填写风险ID或风险编号。");
      return;
    }
    const data = await submitOperation({
      operation: "escalate_risk",
      riskId: riskId.trim(),
    }, "风险已升级为问题。");
    if (data) setRiskId("");
  }

  function prepareChangeFromIssue(issue: IssueRecord) {
    setChangeForm({
      ...changeForm,
      issueId: issue.id,
      projectName: issue.projectName,
      title: `${issue.title}-变更申请`,
      reason: issue.description || issue.title,
      impactScope: issue.impactScope || "",
      owner: issue.owner || "",
      dueDate: issue.dueDate || todayOffset(10),
    });
    setMessage(`已带入问题「${issue.title}」，请补充变更影响后提交。`);
  }

  async function createLinkedChange() {
    const data = await submitOperation({
      operation: "create_change",
      ...changeForm,
      issueId: changeForm.issueId || undefined,
      impactCost: numberOrUndefined(changeForm.impactCost),
      impactScheduleDays: numberOrUndefined(changeForm.impactScheduleDays),
      impactRevenue: numberOrUndefined(changeForm.impactRevenue),
      actionItems: changeForm.actionItems,
    }, "变更已创建，问题链路已关联。");
    if (data) setChangeForm({ ...initialChangeForm, dueDate: todayOffset(10) });
  }

  async function transitionIssueRecord(issue: IssueRecord, action: IssueAction, comment: string) {
    await submitOperation({
      operation: "transition_issue",
      id: issue.id,
      action,
      comment,
      evidence: issue.evidence || undefined,
      expected_version: issue.version || 1,
    }, "问题状态已更新。");
  }

  async function transitionChangeRecord(change: ChangeRecord, action: ChangeAction, comment: string) {
    await submitOperation({
      operation: "transition_change",
      id: change.id,
      action,
      comment,
      decisionSummary: comment,
      expected_version: change.version || 1,
    }, "变更状态已更新。");
  }

  async function closeAction(action: UnifiedActionRecord) {
    const evidence = actionEvidence[action.id]?.trim();
    if (!evidence) {
      setMessage("关闭行动项必须填写关闭证据。");
      return;
    }
    const data = await submitOperation({
      operation: "close_action",
      id: action.id,
      closeEvidence: evidence,
      status: "done",
      expected_version: action.version || 1,
    }, "行动项已关闭。");
    if (data) {
      setActionEvidence(prev => ({ ...prev, [action.id]: "" }));
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{ borderBottom: "1px solid var(--border)", padding: "18px 32px", background: "var(--surface)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: "1.5rem" }}>🔗</span>
              <h1 style={{ fontSize: "1.25rem", fontWeight: 800 }}>风险-问题-变更-行动项链路</h1>
              <StatusTag tone="purple">P5 / V5.3.0</StatusTag>
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.86rem", lineHeight: 1.6 }}>
              把风险升级、问题处理、变更控制、责任人行动项和关闭证据串成一条可审计的管理闭环。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" className="btn-secondary" style={{ textDecoration: "none" }}>返回主页</Link>
            <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none" }}>风险登记册</Link>
            <a href={scopeQuery ? `/api/issue-change/report?${scopeQuery}` : "#"} aria-disabled={!scopeQuery} className="btn-primary" style={{ textDecoration: "none", opacity: scopeQuery ? 1 : 0.55, pointerEvents: scopeQuery ? "auto" : "none" }}>下载链路报告</a>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
        {(message || bundle.status === "not_configured") && (
          <div className="card" style={{ borderColor: bundle.status === "not_configured" ? "var(--amber)" : "var(--border)" }}>
            <strong>{bundle.status === "not_configured" ? "需要执行数据库脚本：" : "系统提示："}</strong>
            <span style={{ color: "var(--text2)", marginLeft: 8 }}>
              {message || "请在 Supabase SQL Editor 执行 supabase-v530-issue-change-action-chain.sql。"}
            </span>
          </div>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent2)" }}>{loading ? "…" : bundle.issues.length}</div>
            <div className="stat-label">问题总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--amber)" }}>{loading ? "…" : unresolvedIssues.length}</div>
            <div className="stat-label">未关闭问题</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--purple)" }}>{loading ? "…" : activeChanges.length}</div>
            <div className="stat-label">进行中变更</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--green)" }}>{loading ? "…" : openActions.length}</div>
            <div className="stat-label">未关闭行动项</div>
          </div>
        </section>

        <section className="card">
          <div className="section-title">工作流说明</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[
              ["1 识别/升级", "风险登记册发现风险转为现实问题，或人工录入问题。"],
              ["2 问题分析", "使用者补充影响范围、责任人、deadline 和关闭标准。"],
              ["3 触发变更", "问题需要调整范围、成本、进度、质量、合同或回款时创建变更。"],
              ["4 影响评估", "录入范围、成本、进度、收入/回款影响，形成审批依据。"],
              ["5 审批实施", "人工审批后进入实施，AI只做分析辅助，不替代审批。"],
              ["6 行动闭环", "每个动作落到行动项，关闭时必须补证据。"],
            ].map(([title, desc]) => (
              <div key={title} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <strong>{title}</strong>
                <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 20 }}>
          <div className="card">
            <div className="section-title">创建问题 / 风险升级</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 16 }}>
              <input className="input" value={riskId} onChange={event => setRiskId(event.target.value)} placeholder="输入风险ID或风险编号，一键升级为问题" />
              <button className="btn-secondary" disabled={saving} onClick={escalateRisk}>升级风险</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="项目名称">
                <input className="input" value={issueForm.projectName} onChange={event => setIssueForm({ ...issueForm, projectName: event.target.value })} />
              </Field>
              <Field label="责任人">
                <input className="input" value={issueForm.owner} onChange={event => setIssueForm({ ...issueForm, owner: event.target.value })} />
              </Field>
              <Field label="问题标题">
                <input className="input" value={issueForm.title} onChange={event => setIssueForm({ ...issueForm, title: event.target.value })} />
              </Field>
              <Field label="严重度">
                <select className="input" value={issueForm.severity} onChange={event => setIssueForm({ ...issueForm, severity: event.target.value as IssueSeverity })}>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </Field>
              <Field label="Deadline">
                <input className="input" type="date" value={issueForm.dueDate} onChange={event => setIssueForm({ ...issueForm, dueDate: event.target.value })} />
              </Field>
              <Field label="影响范围">
                <input className="input" value={issueForm.impactScope} onChange={event => setIssueForm({ ...issueForm, impactScope: event.target.value })} placeholder="范围/工期/费用/回款/质量..." />
              </Field>
              <Field label="来源风险ID">
                <input className="input" value={issueForm.sourceRiskId} onChange={event => setIssueForm({ ...issueForm, sourceRiskId: event.target.value })} />
              </Field>
              <Field label="来源风险编号">
                <input className="input" value={issueForm.sourceRiskCode} onChange={event => setIssueForm({ ...issueForm, sourceRiskCode: event.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="问题描述">
                <textarea className="input" rows={3} value={issueForm.description} onChange={event => setIssueForm({ ...issueForm, description: event.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="关闭证据/输入依据">
                <textarea className="input" rows={2} value={issueForm.evidence} onChange={event => setIssueForm({ ...issueForm, evidence: event.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="行动项（每行：标题|责任人|日期|优先级）">
                <textarea className="input" rows={2} value={issueForm.actionItems} onChange={event => setIssueForm({ ...issueForm, actionItems: event.target.value })} />
              </Field>
            </div>
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={createManualIssue}>创建问题</button>
          </div>

          <div className="card">
            <div className="section-title">创建变更 / 问题触发变更</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="关联问题">
                <select className="input" value={changeForm.issueId} onChange={event => {
                  const issue = bundle.issues.find(item => item.id === event.target.value);
                  if (issue) prepareChangeFromIssue(issue);
                  else setChangeForm({ ...changeForm, issueId: event.target.value });
                }}>
                  <option value="">不关联问题</option>
                  {bundle.issues.map(issue => <option key={issue.id} value={issue.id}>{issue.issueCode || issue.id.slice(0, 8)}｜{issue.title}</option>)}
                </select>
              </Field>
              <Field label="项目名称">
                <input className="input" value={changeForm.projectName} onChange={event => setChangeForm({ ...changeForm, projectName: event.target.value })} />
              </Field>
              <Field label="变更标题">
                <input className="input" value={changeForm.title} onChange={event => setChangeForm({ ...changeForm, title: event.target.value })} />
              </Field>
              <Field label="变更类型">
                <select className="input" value={changeForm.changeType} onChange={event => setChangeForm({ ...changeForm, changeType: event.target.value as ChangeType })}>
                  {Object.entries(changeTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="成本影响">
                <input className="input" value={changeForm.impactCost} onChange={event => setChangeForm({ ...changeForm, impactCost: event.target.value })} placeholder="万元/元均可按你的口径填写数字" />
              </Field>
              <Field label="进度影响（天）">
                <input className="input" value={changeForm.impactScheduleDays} onChange={event => setChangeForm({ ...changeForm, impactScheduleDays: event.target.value })} />
              </Field>
              <Field label="收入影响">
                <input className="input" value={changeForm.impactRevenue} onChange={event => setChangeForm({ ...changeForm, impactRevenue: event.target.value })} />
              </Field>
              <Field label="回款影响">
                <input className="input" value={changeForm.impactCollection} onChange={event => setChangeForm({ ...changeForm, impactCollection: event.target.value })} />
              </Field>
              <Field label="责任人">
                <input className="input" value={changeForm.owner} onChange={event => setChangeForm({ ...changeForm, owner: event.target.value })} />
              </Field>
              <Field label="审批人">
                <input className="input" value={changeForm.approver} onChange={event => setChangeForm({ ...changeForm, approver: event.target.value })} />
              </Field>
              <Field label="Deadline">
                <input className="input" type="date" value={changeForm.dueDate} onChange={event => setChangeForm({ ...changeForm, dueDate: event.target.value })} />
              </Field>
              <Field label="影响范围">
                <input className="input" value={changeForm.impactScope} onChange={event => setChangeForm({ ...changeForm, impactScope: event.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="变更原因/业务依据">
                <textarea className="input" rows={3} value={changeForm.reason} onChange={event => setChangeForm({ ...changeForm, reason: event.target.value })} />
              </Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Field label="行动项（每行：标题|责任人|日期|优先级）">
                <textarea className="input" rows={2} value={changeForm.actionItems} onChange={event => setChangeForm({ ...changeForm, actionItems: event.target.value })} />
              </Field>
            </div>
            <button className="btn-primary" style={{ marginTop: 14 }} disabled={saving} onClick={createLinkedChange}>创建变更</button>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
          <div className="card">
            <div className="section-title">问题管理</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bundle.issues.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.86rem" }}>暂无问题。可以从风险升级，也可以人工创建。</p>}
              {bundle.issues.map(issue => (
                <div key={issue.id} style={{ border: "1px solid var(--border)", background: "var(--surface2)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <strong>{issue.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: 6, lineHeight: 1.6 }}>
                        {issue.projectName} · 责任人：{issue.owner || "未指定"} · deadline：{issue.dueDate || "未设定"}
                      </p>
                      {issue.description && <p style={{ color: "var(--text2)", fontSize: "0.78rem", marginTop: 6, lineHeight: 1.6 }}>{issue.description}</p>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <StatusTag tone={issueTone(issue)}>{issueStatusLabels[issue.status]}</StatusTag>
                      <StatusTag tone={issue.severity === "high" ? "amber" : issue.severity === "low" ? "green" : "blue"}>{issueSeverityLabels[issue.severity]}严重度</StatusTag>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {issueActions.map(item => (
                      <button key={item.action} className="btn-secondary" disabled={saving || issue.status === "closed"} onClick={() => transitionIssueRecord(issue, item.action, item.comment)}>
                        {item.label}
                      </button>
                    ))}
                    <button className="btn-primary" disabled={saving || issue.status === "closed"} onClick={() => prepareChangeFromIssue(issue)}>触发变更</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">变更管理</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bundle.changes.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.86rem" }}>暂无变更。问题需要调整范围/成本/进度/回款时，从问题触发变更。</p>}
              {bundle.changes.map(change => (
                <div key={change.id} style={{ border: "1px solid var(--border)", background: "var(--surface2)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <strong>{change.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: 6, lineHeight: 1.6 }}>
                        {change.projectName} · 类型：{changeTypeLabels[change.changeType]} · 审批人：{change.approver || "未指定"}
                      </p>
                    </div>
                    <StatusTag tone={changeTone(change)}>{changeStatusLabels[change.status]}</StatusTag>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 12 }}>
                    <div className="stat-card" style={{ padding: 10 }}><div className="stat-label">成本</div><strong>{change.impactCost ?? 0}</strong></div>
                    <div className="stat-card" style={{ padding: 10 }}><div className="stat-label">进度</div><strong>{change.impactScheduleDays ?? 0}天</strong></div>
                    <div className="stat-card" style={{ padding: 10 }}><div className="stat-label">收入</div><strong>{change.impactRevenue ?? 0}</strong></div>
                    <div className="stat-card" style={{ padding: 10 }}><div className="stat-label">回款</div><strong>{change.impactCollection || "未填"}</strong></div>
                  </div>
                  {change.reason && <p style={{ color: "var(--text2)", fontSize: "0.78rem", marginTop: 10, lineHeight: 1.6 }}>{change.reason}</p>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {changeActions.map(item => (
                      <button key={item.action} className="btn-secondary" disabled={saving || change.status === "closed"} onClick={() => transitionChangeRecord(change, item.action, item.comment)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 0.9fr)", gap: 20, alignItems: "start" }}>
          <div className="card">
            <div className="section-title">统一行动项与关闭证据</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {bundle.actions.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.86rem" }}>暂无行动项。创建问题或变更时会自动生成，也可以在流转动作中追加。</p>}
              {bundle.actions.map(action => (
                <div key={action.id} style={{ border: "1px solid var(--border)", background: "var(--surface2)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{action.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.8rem", marginTop: 6 }}>
                        {action.projectName || "未关联项目"} · {action.sourceType}/{action.sourceId?.slice(0, 8) || "-"} · 责任人：{action.owner || "未指定"} · deadline：{action.dueDate || "未设定"}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <StatusTag tone={action.priority === "P0" ? "amber" : action.priority === "P2" ? "green" : "blue"}>{action.priority}</StatusTag>
                      <StatusTag tone={action.status === "done" ? "green" : "blue"}>{unifiedActionStatusLabels[action.status]}</StatusTag>
                    </div>
                  </div>
                  {action.closeEvidence && (
                    <p style={{ color: "var(--green)", fontSize: "0.78rem", marginTop: 8 }}>关闭证据：{action.closeEvidence}</p>
                  )}
                  {action.status !== "done" && action.status !== "cancelled" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginTop: 12 }}>
                      <input className="input" value={actionEvidence[action.id] || ""} onChange={event => setActionEvidence(prev => ({ ...prev, [action.id]: event.target.value }))} placeholder="填写关闭证据，例如会议纪要链接、验收截图、飞书记录链接" />
                      <button className="btn-primary" disabled={saving} onClick={() => closeAction(action)}>关闭</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="section-title">最近审计事件</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 560, overflow: "auto" }}>
              {bundle.events.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.86rem" }}>暂无审计事件。</p>}
              {bundle.events.slice(0, 40).map(event => (
                <div key={event.id} style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10 }}>
                  <div style={{ fontSize: "0.78rem", color: "var(--text2)" }}>{new Date(event.createdAt).toLocaleString("zh-CN")}</div>
                  <strong style={{ fontSize: "0.86rem" }}>{event.actorName || "系统"} · {event.subjectType}/{event.eventType}</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                    {event.fromStatus || "-"} → {event.toStatus || "-"} · {event.comment || event.evidence || "无备注"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
