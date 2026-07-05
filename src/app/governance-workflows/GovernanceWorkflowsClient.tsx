"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Workflow = {
  id: string;
  name: string;
  stage: string;
  owner: string;
  approver: string;
  trigger: string;
  inputs: string[];
  outputs: string[];
  states: string[];
  deadlineRule: string;
  auditTrail: string;
};

type Instance = {
  id: string;
  workflowId: string;
  workflowName: string;
  stage: string;
  projectName: string;
  title: string;
  triggerSummary?: string | null;
  inputSummary?: string | null;
  outputSummary?: string | null;
  owner: string;
  approver: string;
  state: string;
  priority: "high" | "medium" | "low";
  deadline?: string | null;
  createdByName?: string | null;
  updatedAt: string;
  sla?: {
    status: string;
    severity: "ok" | "warning" | "critical" | "done";
    daysLeft: number | null;
    label: string;
    nextAction: string;
  };
  businessImpact?: {
    severity: "high" | "medium" | "low";
    writebackMode: "manual_confirmation_required" | "audit_only";
    summary: string;
    updates: Array<{
      targetType: "project" | "risk" | "report";
      targetName: string;
      field: string;
      suggestedValue: string;
      reason: string;
      requiresConfirmation: boolean;
    }>;
    reportFacts: string[];
    nextAction: string;
  };
};

type GovernanceWorkItem = {
  id: string;
  workflowName: string;
  projectName: string;
  title: string;
  state: string;
  owner: string;
  approver: string;
  priority: "high" | "medium" | "low";
  deadline: string | null;
  role: string;
  sla: NonNullable<Instance["sla"]>;
  action: string;
};

type GovernanceResponse = {
  status: string;
  workflows: Workflow[];
  instances: Instance[];
  governance_strategy?: {
    version: string;
    name: string;
    effectiveDate: string;
    historyBoundary: string;
  };
  governance_workbench?: {
    summary: {
      totalOpen: number;
      overdue: number;
      dueToday: number;
      dueSoon: number;
      missingDeadline: number;
      myPending: number;
    };
    workItems: GovernanceWorkItem[];
  };
  governance_impact?: {
    summary: {
      totalImpacts: number;
      projectWritebacks: number;
      riskWritebacks: number;
      reportFacts: number;
      pendingConfirmation: number;
      highSeverity: number;
    };
  };
  governance_knowledge_operation?: {
    summary: {
      snapshotCount: number;
      latestSnapshotDate: string | null;
      latestOpen: number;
      latestOverdueOpen: number;
      latestReminderCount: number;
      sentReminderLogs: number;
      closedReminderLogs: number;
      processedReminderLogs: number;
      ignoredReminderLogs: number;
      escalatedReminderLogs: number;
      handlingRate: number;
    };
    snapshotTrend: Array<{
      snapshotDate: string;
      open: number;
      overdueOpen: number;
      reminderCount: number;
      evidenceCompletenessRate: number;
    }>;
    reminderStatusStats: Array<{ status: string; label: string; count: number }>;
    reminderOwnerStats: Array<{ ownerName: string; sent: number; closed: number; escalated: number }>;
    warning?: string;
    boundary: string;
  };
  warning?: string;
};

type StrategyForm = {
  projectName: string;
  projectLevel: string;
  projectType: string;
  riskLevel: string;
  isKeyProject: boolean;
  currentStage: string;
};

type StrategyPreview = {
  status: "ready" | "needs_input";
  strategy: {
    version: string;
    name: string;
    effectiveDate: string;
    historyBoundary: string;
  };
  input: StrategyForm;
  blockers: string[];
  warnings: string[];
  recommendation: null | {
    strategyVersion: string;
    ruleId: string;
    ruleName: string;
    governanceLevel: string;
    primaryWorkflowId: string;
    recommendedWorkflowIds: string[];
    owner: string;
    approver: string;
    priority: "high" | "medium" | "low";
    deadlineDays: number;
    deadlineDate: string;
    requiredInputs: string[];
    expectedOutputs: string[];
    sla: string;
    reasons: string[];
    creationDefaults: CreateForm;
  };
};

type CreateForm = {
  workflowId: string;
  projectName: string;
  title: string;
  owner: string;
  approver: string;
  priority: "high" | "medium" | "low";
  deadline: string;
  triggerSummary: string;
  inputSummary: string;
  actionItems: string;
  strategyVersion: string;
  strategyRuleId: string;
  strategySummary: string;
};

const priorityLabel: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const actionLabels: Array<{ action: string; label: string; description: string }> = [
  { action: "submit", label: "提交", description: "进入下一待评审状态" },
  { action: "approve", label: "通过", description: "审批通过或进入批准状态" },
  { action: "conditional_approve", label: "有条件通过", description: "保留整改行动项" },
  { action: "return", label: "退回补充", description: "退回责任人补充材料" },
  { action: "reject", label: "驳回/暂停", description: "拒绝或暂停该治理流程" },
  { action: "close", label: "关闭/归档", description: "完成实施、关闭或归档" },
];

function emptyForm(workflow?: Workflow): CreateForm {
  return {
    workflowId: workflow?.id || "project-initiation-review",
    projectName: "",
    title: "",
    owner: workflow?.owner || "项目经理",
    approver: workflow?.approver || "PMO",
    priority: "medium",
    deadline: "",
    triggerSummary: workflow?.trigger || "",
    inputSummary: "",
    actionItems: "",
    strategyVersion: "",
    strategyRuleId: "",
    strategySummary: "",
  };
}

function statusColor(state: string): string {
  if (["已通过", "已批准", "已实施", "已关闭", "已验收", "已归档"].includes(state)) return "var(--green)";
  if (["已驳回", "已拒绝", "暂停"].includes(state)) return "var(--red)";
  if (["需补充", "需整改", "有条件通过"].includes(state)) return "var(--amber)";
  return "var(--accent2)";
}

function slaColor(severity?: string): string {
  if (severity === "critical") return "var(--red)";
  if (severity === "warning") return "var(--amber)";
  if (severity === "done") return "var(--green)";
  return "var(--accent2)";
}

function impactColor(severity?: string): string {
  if (severity === "high") return "var(--red)";
  if (severity === "medium") return "var(--amber)";
  return "var(--accent2)";
}

function trendHeight(value: number, maxValue: number): string {
  if (maxValue <= 0) return "6%";
  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`;
}

export default function GovernanceWorkflowsClient() {
  const [data, setData] = useState<GovernanceResponse | null>(null);
  const [form, setForm] = useState<CreateForm>(emptyForm());
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [transitionNote, setTransitionNote] = useState<Record<string, string>>({});
  const [transitionOutput, setTransitionOutput] = useState<Record<string, string>>({});
  const [transitionActions, setTransitionActions] = useState<Record<string, string>>({});
  const [auditFilter, setAuditFilter] = useState({ projectName: "", dateFrom: "", dateTo: "" });
  const [strategyForm, setStrategyForm] = useState<StrategyForm>({
    projectName: "",
    projectLevel: "",
    projectType: "",
    riskLevel: "",
    isKeyProject: false,
    currentStage: "",
  });
  const [strategyPreview, setStrategyPreview] = useState<StrategyPreview | null>(null);
  const [strategyBusy, setStrategyBusy] = useState(false);

  const selectedWorkflow = useMemo(
    () => data?.workflows.find(workflow => workflow.id === form.workflowId),
    [data?.workflows, form.workflowId],
  );

  const knowledgeOperationTrendMax = useMemo(() => {
    const values = data?.governance_knowledge_operation?.snapshotTrend.flatMap(item => [item.open, item.overdueOpen, item.reminderCount]) ?? [];
    return Math.max(1, ...values);
  }, [data?.governance_knowledge_operation?.snapshotTrend]);

  const auditDownloadHref = useMemo(() => {
    const params = new URLSearchParams();
    if (auditFilter.projectName.trim()) params.set("projectName", auditFilter.projectName.trim());
    if (auditFilter.dateFrom) params.set("dateFrom", auditFilter.dateFrom);
    if (auditFilter.dateTo) params.set("dateTo", auditFilter.dateTo);
    const query = params.toString();
    return `/api/governance/audit-package${query ? `?${query}` : ""}`;
  }, [auditFilter]);

  async function load() {
    const response = await fetch("/api/governance/workflows", { cache: "no-store" });
    const body = await response.json();
    setData(body);
    if (body.workflows?.length && !form.workflowId) {
      setForm(emptyForm(body.workflows[0]));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadInitialData() {
      try {
        const response = await fetch("/api/governance/workflows", { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        setData(body);
        if (body.workflows?.length && !form.workflowId) {
          setForm(emptyForm(body.workflows[0]));
        }
      } catch {
        if (!cancelled) setMessage("无法读取治理流程，请稍后重试。");
      }
    }
    void loadInitialData();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateWorkflow(workflowId: string) {
    const workflow = data?.workflows.find(item => item.id === workflowId);
    setForm(current => ({
      ...current,
      workflowId,
      owner: current.owner || workflow?.owner || "",
      approver: current.approver || workflow?.approver || "",
      triggerSummary: current.triggerSummary || workflow?.trigger || "",
    }));
  }

  async function previewStrategy() {
    setStrategyBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/governance/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(strategyForm),
      });
      const body = await response.json() as StrategyPreview & { warning?: string };
      if (!response.ok) {
        setMessage(body.warning || "治理策略预览失败。");
        setStrategyPreview(null);
      } else {
        setStrategyPreview(body);
        setMessage(body.status === "needs_input" ? "治理策略需要补齐关键字段后才能推荐流程。" : "治理策略预览已生成，可带入创建流程。");
      }
    } catch {
      setMessage("治理策略预览失败。");
      setStrategyPreview(null);
    } finally {
      setStrategyBusy(false);
    }
  }

  function applyStrategyToCreateForm() {
    if (!strategyPreview?.recommendation) return;
    const defaults = strategyPreview.recommendation.creationDefaults;
    setForm(current => ({
      ...current,
      ...defaults,
      projectName: defaults.projectName || strategyForm.projectName || current.projectName,
      title: defaults.title.includes("待补充项目名称") && strategyForm.projectName
        ? `${strategyForm.projectName}-${data?.workflows.find(workflow => workflow.id === defaults.workflowId)?.name || "治理流程"}`
        : defaults.title,
    }));
    setMessage("已将治理策略带入创建流程表单，请复核输入材料后提交。");
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("create");
    setMessage("");
    try {
      const response = await fetch("/api/governance/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "succeeded") {
        setMessage(body.warning || "治理流程创建失败。");
      } else {
        setMessage(`已创建：${body.instance.workflowName} / ${body.instance.projectName}；飞书回写：${body.feishu_sync?.status || "skipped"}`);
        setForm(emptyForm(selectedWorkflow));
        await load();
      }
    } catch {
      setMessage("治理流程创建失败。");
    } finally {
      setBusy("");
    }
  }

  async function transition(instance: Instance, action: string) {
    setBusy(`${instance.id}:${action}`);
    setMessage("");
    try {
      const response = await fetch("/api/governance/workflows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: instance.id,
          action,
          comment: transitionNote[instance.id] || "",
          outputSummary: transitionOutput[instance.id] || "",
          actionItems: transitionActions[instance.id] || "",
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "succeeded") {
        setMessage(body.warning || "状态流转失败。");
      } else {
        setMessage(`已流转到：${body.instance.state}；业务联动：${body.businessImpact?.summary || "已生成审计记录"}；飞书回写：${body.feishu_sync?.status || "skipped"}`);
        setTransitionNote(current => ({ ...current, [instance.id]: "" }));
        setTransitionOutput(current => ({ ...current, [instance.id]: "" }));
        setTransitionActions(current => ({ ...current, [instance.id]: "" }));
        await load();
      }
    } catch {
      setMessage("状态流转失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginTop: 12 }}>PMO 治理工作流中心</h1>
            <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.7 }}>
              创建正式治理流程，记录输入材料、审批意见、输出成果、行动项、状态流转和审计记录。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/workbench" className="btn-secondary" style={{ textDecoration: "none" }}>每日工作台</Link>
            <Link href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>数据与集成</Link>
          </div>
        </div>

        {message && <div className="card" style={{ borderColor: "var(--accent2)", color: "var(--accent2)", marginBottom: 18 }}>{message}</div>}
        {data?.warning && <div className="card" style={{ borderColor: "var(--amber)", color: "var(--amber)", marginBottom: 18 }}>{data.warning}</div>}

        {!data ? (
          <div className="card" aria-busy="true">正在读取治理流程...</div>
        ) : (
          <>
            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="section-title">⏱️ 治理 SLA 与待我处理</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    基于流程实例的责任人、审批人、状态和截止日期自动识别逾期、今日到期、即将到期和未设 SLA 的治理事项。
                  </p>
                </div>
                <span className="tag tag-blue">待我处理 {data.governance_workbench?.summary.myPending ?? 0}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["未关闭流程", data.governance_workbench?.summary.totalOpen ?? 0, "当前仍需处理"],
                  ["已逾期", data.governance_workbench?.summary.overdue ?? 0, "需要立即升级"],
                  ["今日到期", data.governance_workbench?.summary.dueToday ?? 0, "今天必须处理"],
                  ["即将到期", data.governance_workbench?.summary.dueSoon ?? 0, "2天内到期"],
                  ["未设SLA", data.governance_workbench?.summary.missingDeadline ?? 0, "需补截止日期"],
                ].map(([label, value, hint]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong style={{ fontSize: "1.1rem" }}>{value}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{hint}</p>
                  </div>
                ))}
              </div>

              {(data.governance_workbench?.workItems.length ?? 0) === 0 ? (
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                  <strong>暂无待我处理治理事项</strong>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.82rem", marginTop: 6 }}>
                    如果你是责任人或审批人，请确认流程实例中的姓名、邮箱或手机号与当前账号一致。
                  </p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {data.governance_workbench?.workItems.slice(0, 8).map(item => (
                    <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <strong>{item.title}</strong>
                          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 6 }}>
                            {item.workflowName} · {item.projectName} · 我的角色：{item.role} · 状态：{item.state}
                          </p>
                        </div>
                        <span className="tag" style={{ background: `${slaColor(item.sla.severity)}22`, color: slaColor(item.sla.severity) }}>{item.sla.label}</span>
                      </div>
                      <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 6 }}>动作：{item.action}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🔗 治理结果业务联动</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    审批结果会生成项目台账、风险登记册和报告工厂可引用的联动建议；所有写回建议默认需要人工确认，避免静默改写业务主数据。
                  </p>
                </div>
                <span className="tag tag-amber">待确认 {data.governance_impact?.summary.pendingConfirmation ?? 0}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                {[
                  ["联动包", data.governance_impact?.summary.totalImpacts ?? 0, "治理实例口径"],
                  ["项目写回建议", data.governance_impact?.summary.projectWritebacks ?? 0, "项目/阶段状态"],
                  ["风险写回建议", data.governance_impact?.summary.riskWritebacks ?? 0, "风险状态/升级"],
                  ["报告事实", data.governance_impact?.summary.reportFacts ?? 0, "月报/例外报告"],
                  ["高优先级", data.governance_impact?.summary.highSeverity ?? 0, "需PMO关注"],
                ].map(([label, value, hint]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong style={{ fontSize: "1.1rem" }}>{value}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{hint}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div className="section-title">📈 知识治理运营趋势</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    汇总风险复盘资产二次治理的历史快照、提醒发送和处理结果；用于 PMO 周运营，不自动改写业务主数据。
                  </p>
                </div>
                <span className="tag tag-purple">处理率 {(data.governance_knowledge_operation?.summary.handlingRate ?? 0).toFixed(1)}%</span>
              </div>
              {data.governance_knowledge_operation?.warning && (
                <div style={{ border: "1px solid rgba(245,158,11,0.42)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 10, padding: 10, marginBottom: 10, fontSize: "0.78rem", lineHeight: 1.6 }}>
                  {data.governance_knowledge_operation.warning}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
                {[
                  ["最新快照", data.governance_knowledge_operation?.summary.latestSnapshotDate || "暂无", "历史运营口径"],
                  ["未关闭待办", data.governance_knowledge_operation?.summary.latestOpen ?? 0, "最新快照"],
                  ["逾期未关", data.governance_knowledge_operation?.summary.latestOverdueOpen ?? 0, "需要治理升级"],
                  ["提醒待处理", data.governance_knowledge_operation?.summary.sentReminderLogs ?? 0, "已发未闭环"],
                  ["已闭环提醒", data.governance_knowledge_operation?.summary.closedReminderLogs ?? 0, "处理/忽略/升级"],
                  ["已升级提醒", data.governance_knowledge_operation?.summary.escalatedReminderLogs ?? 0, "需统一行动项跟踪"],
                ].map(([label, value, hint]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong style={{ fontSize: "1.05rem" }}>{value}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 4 }}>{hint}</p>
                  </div>
                ))}
              </div>
              {(data.governance_knowledge_operation?.snapshotTrend.length ?? 0) === 0 ? (
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14, color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7 }}>
                  暂无知识治理运营快照。请先在风险管理页保存快照或发送知识治理周提醒。
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 10, alignItems: "end", marginBottom: 12 }}>
                  {data.governance_knowledge_operation?.snapshotTrend.map(item => (
                    <div key={item.snapshotDate} style={{ display: "grid", gap: 8 }}>
                      <div style={{ height: 110, display: "flex", alignItems: "end", gap: 4, padding: "0 6px", borderBottom: "1px solid var(--border)" }}>
                        <div title={`未关闭 ${item.open}`} style={{ flex: 1, height: trendHeight(item.open, knowledgeOperationTrendMax), background: "rgba(59,130,246,0.72)", borderRadius: "8px 8px 0 0" }} />
                        <div title={`逾期 ${item.overdueOpen}`} style={{ flex: 1, height: trendHeight(item.overdueOpen, knowledgeOperationTrendMax), background: "rgba(239,68,68,0.72)", borderRadius: "8px 8px 0 0" }} />
                        <div title={`提醒 ${item.reminderCount}`} style={{ flex: 1, height: trendHeight(item.reminderCount, knowledgeOperationTrendMax), background: "rgba(245,158,11,0.72)", borderRadius: "8px 8px 0 0" }} />
                      </div>
                      <div style={{ color: "var(--text2)", fontSize: "0.68rem", lineHeight: 1.5 }}>
                        <strong style={{ color: "var(--text)" }}>{item.snapshotDate.slice(5)}</strong><br />
                        未关{item.open} · 逾期{item.overdueOpen} · 提醒{item.reminderCount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <span className="tag tag-blue">蓝：未关闭</span>
                <span className="tag tag-red">红：逾期</span>
                <span className="tag tag-amber">黄：提醒</span>
              </div>
              {(data.governance_knowledge_operation?.reminderOwnerStats.length ?? 0) > 0 && (
                <div style={{ display: "grid", gap: 8 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>责任人提醒闭环 Top 追踪</div>
                  {data.governance_knowledge_operation?.reminderOwnerStats.map(item => (
                    <div key={item.ownerName} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.8rem" }}>{item.ownerName}</strong>
                      <span style={{ color: "var(--text2)", fontSize: "0.76rem" }}>已发未处理 {item.sent} · 已闭环 {item.closed} · 已升级 {item.escalated}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 10 }}>{data.governance_knowledge_operation?.boundary}</p>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div className="section-title">📦 治理审计包导出</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    导出内容包含输入材料、审批意见、附件索引、输出成果、行动项、SLA 和业务联动建议；适合 PMO 月度治理复盘和外部审计留档。
                  </p>
                </div>
                <a href={auditDownloadHref} className="btn-primary" style={{ textDecoration: "none" }}>下载汇总审计包</a>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>项目名称筛选</span>
                  <input value={auditFilter.projectName} onChange={event => setAuditFilter(current => ({ ...current, projectName: event.target.value }))} placeholder="不填则导出全部" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>开始日期</span>
                  <input type="date" value={auditFilter.dateFrom} onChange={event => setAuditFilter(current => ({ ...current, dateFrom: event.target.value }))} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>结束日期</span>
                  <input type="date" value={auditFilter.dateTo} onChange={event => setAuditFilter(current => ({ ...current, dateTo: event.target.value }))} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
              </div>
              <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 10 }}>
                单流程审计包可在每条流程实例右侧下载；汇总审计包会按上方筛选条件导出当前治理实例。
              </p>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🧭 治理策略配置与预览</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    按项目等级、类型、风险等级、重点项目标记和当前阶段推荐治理流程、审批人、必填输入和 SLA；策略只影响新建流程，不改写历史审计包。
                  </p>
                </div>
                <span className="tag tag-purple">{data.governance_strategy?.version || strategyPreview?.strategy.version || "策略待加载"}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>项目名称</span>
                  <input value={strategyForm.projectName} onChange={event => setStrategyForm(current => ({ ...current, projectName: event.target.value }))} placeholder="用于带入创建流程" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>项目等级</span>
                  <select value={strategyForm.projectLevel} onChange={event => setStrategyForm(current => ({ ...current, projectLevel: event.target.value }))} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                    <option value="">请选择</option>
                    <option value="S">S级</option>
                    <option value="A">A级</option>
                    <option value="B">B级</option>
                    <option value="C">C级</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>项目类型</span>
                  <input value={strategyForm.projectType} onChange={event => setStrategyForm(current => ({ ...current, projectType: event.target.value }))} placeholder="如：信息化、交付、研发" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>风险等级</span>
                  <select value={strategyForm.riskLevel} onChange={event => setStrategyForm(current => ({ ...current, riskLevel: event.target.value }))} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                    <option value="">请选择</option>
                    <option value="高">高</option>
                    <option value="中">中</option>
                    <option value="低">低</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>当前阶段</span>
                  <select value={strategyForm.currentStage} onChange={event => setStrategyForm(current => ({ ...current, currentStage: event.target.value }))} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                    <option value="">可选</option>
                    <option value="启动">启动</option>
                    <option value="规划">规划</option>
                    <option value="执行">执行</option>
                    <option value="监控">监控</option>
                    <option value="收尾">收尾</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 22, color: "var(--text2)", fontSize: "0.82rem" }}>
                  <input type="checkbox" checked={strategyForm.isKeyProject} onChange={event => setStrategyForm(current => ({ ...current, isKeyProject: event.target.checked }))} />
                  重点项目
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: strategyPreview ? 12 : 0 }}>
                <button type="button" className="btn-primary" onClick={previewStrategy} disabled={strategyBusy}>
                  {strategyBusy ? "预览中..." : "预览治理策略"}
                </button>
                <button type="button" className="btn-secondary" onClick={applyStrategyToCreateForm} disabled={!strategyPreview?.recommendation}>
                  应用到创建流程
                </button>
              </div>

              {strategyPreview && (
                <div style={{ display: "grid", gap: 12 }}>
                  {(strategyPreview.blockers.length > 0 || strategyPreview.warnings.length > 0) && (
                    <div style={{ background: "var(--surface2)", border: `1px solid ${strategyPreview.blockers.length > 0 ? "var(--amber)" : "var(--border)"}`, borderRadius: 10, padding: 14 }}>
                      {strategyPreview.blockers.length > 0 && (
                        <>
                          <strong style={{ color: "var(--amber)" }}>需要补齐后才能推荐策略</strong>
                          <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
                            {strategyPreview.blockers.map(item => <li key={item}>{item}</li>)}
                          </ul>
                        </>
                      )}
                      {strategyPreview.warnings.length > 0 && (
                        <>
                          <strong style={{ color: "var(--accent2)" }}>提示</strong>
                          <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
                            {strategyPreview.warnings.map(item => <li key={item}>{item}</li>)}
                          </ul>
                        </>
                      )}
                    </div>
                  )}

                  {strategyPreview.recommendation && (
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div>
                          <strong>{strategyPreview.recommendation.ruleName}</strong>
                          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 6 }}>
                            治理强度：{strategyPreview.recommendation.governanceLevel} · 审批：{strategyPreview.recommendation.approver} · SLA：{strategyPreview.recommendation.deadlineDays}天
                          </p>
                        </div>
                        <span className="tag" style={{ background: `${impactColor(strategyPreview.recommendation.priority === "high" ? "high" : strategyPreview.recommendation.priority === "medium" ? "medium" : "low")}22`, color: impactColor(strategyPreview.recommendation.priority === "high" ? "high" : strategyPreview.recommendation.priority === "medium" ? "medium" : "low") }}>
                          优先级：{priorityLabel[strategyPreview.recommendation.priority]}
                        </span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
                        <div>
                          <strong style={{ fontSize: "0.84rem" }}>推荐流程</strong>
                          <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
                            {strategyPreview.recommendation.recommendedWorkflowIds.map(id => {
                              const workflow = data.workflows.find(item => item.id === id);
                              return <li key={id}>{workflow?.name || id}{id === strategyPreview.recommendation?.primaryWorkflowId ? "（首选创建）" : ""}</li>;
                            })}
                          </ul>
                        </div>
                        <div>
                          <strong style={{ fontSize: "0.84rem" }}>必填输入</strong>
                          <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
                            {strategyPreview.recommendation.requiredInputs.slice(0, 8).map(item => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                        <div>
                          <strong style={{ fontSize: "0.84rem" }}>输出成果</strong>
                          <ul style={{ color: "var(--text2)", lineHeight: 1.7, paddingLeft: 18, marginTop: 8 }}>
                            {strategyPreview.recommendation.expectedOutputs.slice(0, 8).map(item => <li key={item}>{item}</li>)}
                          </ul>
                        </div>
                      </div>

                      <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.8rem", marginTop: 10 }}>
                        SLA：{strategyPreview.recommendation.sla}；建议截止：{strategyPreview.recommendation.deadlineDate}
                      </p>
                      <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.78rem", marginTop: 6 }}>
                        策略边界：{strategyPreview.strategy.historyBoundary}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🧾 创建治理流程实例</div>
              <form onSubmit={submitCreate} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>流程类型</span>
                    <select value={form.workflowId} onChange={event => updateWorkflow(event.target.value)} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                      {data.workflows.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>项目名称</span>
                    <input required value={form.projectName} onChange={event => setForm(current => ({ ...current, projectName: event.target.value }))} placeholder="填写项目名称" style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>流程标题</span>
                    <input value={form.title} onChange={event => setForm(current => ({ ...current, title: event.target.value }))} placeholder="不填则自动生成" style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>优先级</span>
                    <select value={form.priority} onChange={event => setForm(current => ({ ...current, priority: event.target.value as CreateForm["priority"] }))} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }}>
                      <option value="high">高</option>
                      <option value="medium">中</option>
                      <option value="low">低</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>责任人</span>
                    <input value={form.owner} onChange={event => setForm(current => ({ ...current, owner: event.target.value }))} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>审批/确认人</span>
                    <input value={form.approver} onChange={event => setForm(current => ({ ...current, approver: event.target.value }))} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>截止日期</span>
                    <input type="date" value={form.deadline} onChange={event => setForm(current => ({ ...current, deadline: event.target.value }))} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                  </label>
                </div>

                {selectedWorkflow && (
                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                    <strong>{selectedWorkflow.stage} · {selectedWorkflow.name}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>触发：{selectedWorkflow.trigger}</p>
                    <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>时限：{selectedWorkflow.deadlineRule}</p>
                  </div>
                )}

                {form.strategyVersion && (
                  <div style={{ background: "var(--surface2)", border: "1px solid var(--accent2)", borderRadius: 10, padding: 14 }}>
                    <strong>已应用治理策略：{form.strategyVersion}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>
                      规则：{form.strategyRuleId}。提交后策略版本会写入流程元数据和创建事件，用于后续审计追溯；历史审计包不受新策略影响。
                    </p>
                  </div>
                )}

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>触发说明</span>
                  <textarea value={form.triggerSummary} onChange={event => setForm(current => ({ ...current, triggerSummary: event.target.value }))} rows={2} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>输入材料摘要</span>
                  <textarea value={form.inputSummary} onChange={event => setForm(current => ({ ...current, inputSummary: event.target.value }))} rows={3} placeholder="填写本次流程的输入材料、附件说明、关键事实。" style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>初始行动项（每行：事项 | 责任人 | YYYY-MM-DD）</span>
                  <textarea value={form.actionItems} onChange={event => setForm(current => ({ ...current, actionItems: event.target.value }))} rows={2} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)" }} />
                </label>
                <button className="btn-primary" disabled={busy === "create"} style={{ justifySelf: "start" }}>{busy === "create" ? "创建中..." : "创建治理流程"}</button>
              </form>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🔁 治理流程实例</div>
              {data.instances.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无治理流程实例。先创建一条流程，系统会保存状态、审计记录和输出报告。</p>
              ) : (
                <div style={{ display: "grid", gap: 14 }}>
                  {data.instances.map(instance => (
                    <article key={instance.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <strong>{instance.title}</strong>
                            <span className="tag tag-blue">{instance.workflowName}</span>
                            <span className="tag" style={{ background: `${statusColor(instance.state)}22`, color: statusColor(instance.state) }}>{instance.state}</span>
                            <span className="tag tag-amber">优先级：{priorityLabel[instance.priority]}</span>
                            {instance.sla && (
                              <span className="tag" style={{ background: `${slaColor(instance.sla.severity)}22`, color: slaColor(instance.sla.severity) }}>
                                {instance.sla.label}
                              </span>
                            )}
                          </div>
                          <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                            {instance.projectName} · 责任人：{instance.owner} · 审批：{instance.approver} · deadline：{instance.deadline || "未设定"}
                          </p>
                          {instance.sla && (
                            <p style={{ color: slaColor(instance.sla.severity), fontSize: "0.8rem", lineHeight: 1.6, marginTop: 4 }}>
                              SLA：{instance.sla.status}；建议动作：{instance.sla.nextAction}
                            </p>
                          )}
                          {instance.businessImpact && (
                            <div style={{ background: "var(--surface)", border: `1px solid ${impactColor(instance.businessImpact.severity)}55`, borderRadius: 10, padding: 12, marginTop: 10 }}>
                              <strong style={{ color: impactColor(instance.businessImpact.severity), fontSize: "0.84rem" }}>业务联动：{instance.businessImpact.summary}</strong>
                              <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 6 }}>
                                下一步：{instance.businessImpact.nextAction} · 写回模式：{instance.businessImpact.writebackMode === "manual_confirmation_required" ? "需人工确认" : "仅审计记录"}
                              </p>
                              {instance.businessImpact.updates.length > 0 && (
                                <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                                  {instance.businessImpact.updates.slice(0, 3).map(update => (
                                    <div key={`${update.targetType}-${update.field}-${update.suggestedValue}`} style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.5 }}>
                                      {update.targetType === "risk" ? "风险" : "项目"}：{update.targetName} · {update.field} → <strong style={{ color: "var(--text)" }}>{update.suggestedValue}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <a href={`/api/governance/workflows/${instance.id}/report`} className="btn-secondary" style={{ textDecoration: "none", alignSelf: "start" }}>下载审计包</a>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>处理意见</span>
                          <textarea value={transitionNote[instance.id] || ""} onChange={event => setTransitionNote(current => ({ ...current, [instance.id]: event.target.value }))} rows={2} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>输出成果摘要</span>
                          <textarea value={transitionOutput[instance.id] || ""} onChange={event => setTransitionOutput(current => ({ ...current, [instance.id]: event.target.value }))} rows={2} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>新增行动项</span>
                          <textarea value={transitionActions[instance.id] || ""} onChange={event => setTransitionActions(current => ({ ...current, [instance.id]: event.target.value }))} rows={2} placeholder="事项 | 责任人 | YYYY-MM-DD" style={{ padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
                        </label>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        {actionLabels.map(item => (
                          <button key={item.action} className="btn-secondary" disabled={Boolean(busy)} onClick={() => transition(instance, item.action)} title={item.description}>
                            {busy === `${instance.id}:${item.action}` ? "处理中..." : item.label}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section style={{ display: "grid", gap: 16 }}>
              {data.workflows.map(workflow => (
                <article key={workflow.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <h2 style={{ fontSize: "1.15rem", fontWeight: 800 }}>{workflow.name}</h2>
                        <span className="tag tag-blue">{workflow.stage}</span>
                      </div>
                      <p style={{ color: "var(--text2)", lineHeight: 1.6 }}>触发条件：{workflow.trigger}</p>
                    </div>
                    <div style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.6 }}>
                      <div>责任人：<strong style={{ color: "var(--text)" }}>{workflow.owner}</strong></div>
                      <div>审批/确认：<strong style={{ color: "var(--text)" }}>{workflow.approver}</strong></div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <strong>输入材料</strong>
                      <ul style={{ color: "var(--text2)", lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
                        {workflow.inputs.map(input => <li key={input}>{input}</li>)}
                      </ul>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <strong>输出成果</strong>
                      <ul style={{ color: "var(--text2)", lineHeight: 1.8, paddingLeft: 18, marginTop: 8 }}>
                        {workflow.outputs.map(output => <li key={output}>{output}</li>)}
                      </ul>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <strong>状态流转</strong>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        {workflow.states.map(state => <span key={state} className="tag tag-purple">{state}</span>)}
                      </div>
                    </div>
                    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <strong>时限与审计</strong>
                      <p style={{ color: "var(--text2)", lineHeight: 1.6, marginTop: 8 }}>{workflow.deadlineRule}</p>
                      <p style={{ color: "var(--accent2)", lineHeight: 1.6, marginTop: 8 }}>{workflow.auditTrail}</p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
