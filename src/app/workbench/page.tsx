"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeishuConfirmationInlinePanelClient } from "@/components/FeishuConfirmationInlinePanelClient";
import { IntegrationStatusPanelClient } from "@/components/IntegrationStatusPanelClient";

type Workbench = {
  kpis: Array<{ label: string; value: string; hint: string; status: string }>;
  actions: Array<{ id: string; priority: string; title: string; owner: string; due: string; source: string; action: string }>;
  keyProjects: Array<{ name: string; status: string; progress: string; risk: string; next: string }>;
  aiSuggestions: Array<{ title: string; basis: string; confirmation: string; actionTitle?: string; priority?: "P0" | "P1" | "P2"; owner?: string; dueDate?: string }>;
  myProjects: Array<{ id: string; name: string; owner: string; status: string; stage: string; progress: number; health: string; riskLevel: string; nextMilestone: string; source: string }>;
  myRisks: Array<{ id: string; projectName: string; description: string; severity: string; status: string; owner: string; dueDate: string; nextAction: string; source: string }>;
  todayTodos: Array<{ id: string; type: string; title: string; projectName: string; owner: string; dueDate: string; daysLeft: number | null; status: string; priority: string; source: string; action: string }>;
  businessReminders: Array<{ id: string; projectName: string; customer: string; amount: number; dueDate: string; daysLeft: number | null; status: string; source: string; action: string }>;
  riskIntegration: {
    summary: {
      openRiskLinks: number;
      highSeverity: number;
      projectHealthImpacts: number;
      taskImpacts: number;
      milestoneImpacts: number;
      paymentImpacts: number;
      governanceEscalations: number;
      pendingConfirmation: number;
    };
    links: Array<{
      id: string;
      projectName: string;
      riskDescription: string;
      severity: string;
      status: string;
      owner: string;
      deadline: string;
      impactedTargets: string[];
      actions: Array<{ id: string; title: string; owner: string; dueDate: string; priority: string; targetModule: string; sourceReason: string; confirmationRequired: boolean }>;
      reportFact: string;
      writebackMode: string;
    }>;
    boundary: string;
  };
  riskRetrospectiveGovernanceFollowups: {
    summary: {
      totalOpen: number;
      myPending: number;
      overdue: number;
      dueSoon: number;
      highPriority: number;
      waitingFeishuConfirmation: number;
    };
    workItems: Array<{
      id: string;
      assetTitle: string;
      reason: string;
      actionRequired: string;
      ownerName: string;
      dueDate: string;
      daysLeft: number | null;
      priority: "P0" | "P1" | "P2";
      status: string;
      closingCriteria: string;
      feishuSyncStatus: string;
      feishuTaskUrl: string | null;
      source: string;
      action: string;
      actionDraft: {
        title: string;
        owner: string;
        dueDate: string;
        priority: "P0" | "P1" | "P2";
        projectName: string;
        sourceType: "governance";
        sourceId: string;
        sourceReason: string;
      };
    }>;
    warning?: string;
    boundary: string;
  };
  riskRetrospectiveGovernanceFollowupOperation?: {
    reminderDrafts: Array<{
      id: string;
      type: "overdue" | "waiting_acceptance" | "evidence_gap";
      priority: "P0" | "P1" | "P2";
      title: string;
      ownerName: string;
      dueDate: string;
      assetTitle: string;
      actionRequired: string;
      confirmationRequired: true;
    }>;
    weeklyTrend: Array<{
      weekStart: string;
      weekLabel: string;
      created: number;
      closed: number;
      overdueOpen: number;
      evidenceCompletenessRate: number;
    }>;
    feishuReminderDraft: { title: string; message: string; confirmationRequired: true; target: "feishu_message" } | null;
  };
  evidence: {
    userScope: string;
    matchedBy: string[];
    scanned: { projects: number; risks: number; tasks: number; milestones: number; payments: number };
    included: { projects: number; risks: number; todos: number; businessReminders: number };
  };
};

type WorkbenchResponse = {
  status: string;
  source: string;
  detail?: string;
  generated_at?: string;
  workbench: Workbench;
};

type GovernanceWorkItem = {
  id: string;
  workflowName: string;
  projectName: string;
  title: string;
  state: string;
  role: string;
  deadline: string | null;
  sla: { severity: "ok" | "warning" | "critical" | "done"; label: string; nextAction: string };
  action: string;
};

type GovernanceWorkbenchResponse = {
  status: string;
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
  warning?: string;
};

const priorityColor: Record<string, string> = {
  P0: "var(--red)",
  P1: "var(--amber)",
  P2: "var(--accent2)",
};

const healthLabel: Record<string, string> = {
  ok: "正常",
  warning: "预警",
  error: "异常",
  unknown: "待检查",
};

const userScopeLabel: Record<string, string> = {
  "admin-all": "管理员全量视角",
  "matched-owner": "已按负责人匹配",
  "authorized-project": "显式项目授权",
  "unmatched-owner": "未匹配到负责人",
  anonymous: "未登录",
};

function dueLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "待补日期";
  if (daysLeft < 0) return `逾期 ${Math.abs(daysLeft)} 天`;
  if (daysLeft === 0) return "今天";
  if (daysLeft === 1) return "明天";
  return `${daysLeft} 天内`;
}

function StatusTag({ value }: { value: string }) {
  const color = value === "error" || value === "高" ? "var(--red)" : value === "warning" || value === "中" ? "var(--amber)" : "var(--accent2)";
  return (
    <span className="tag" style={{ background: `${color}22`, color }}>
      {healthLabel[value] || value}
    </span>
  );
}

function slaColor(severity?: string): string {
  if (severity === "critical") return "var(--red)";
  if (severity === "warning") return "var(--amber)";
  if (severity === "done") return "var(--green)";
  return "var(--accent2)";
}

export default function WorkbenchPage() {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [governanceData, setGovernanceData] = useState<GovernanceWorkbenchResponse | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingSuggestion, setSavingSuggestion] = useState<string | null>(null);
  const [savingGovernanceFollowup, setSavingGovernanceFollowup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [response, governanceResponse] = await Promise.all([
          fetch("/api/operating-system/workbench", { cache: "no-store" }),
          fetch("/api/governance/workflows", { cache: "no-store" }),
        ]);
        const body = await response.json();
        const governanceBody = await governanceResponse.json();
        if (!cancelled) setData(body);
        if (!cancelled) setGovernanceData(governanceBody);
      } catch {
        if (!cancelled) setError("无法生成工作台摘要，请稍后重试。");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const workbench = data?.workbench;

  async function convertSuggestionToAction(item: Workbench["aiSuggestions"][number], index: number) {
    setSavingSuggestion(item.title);
    setActionMessage("");
    try {
      const response = await fetch("/api/issue-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create_action",
          title: item.actionTitle || item.title,
          owner: item.owner || "项目经理/PMO",
          dueDate: item.dueDate,
          priority: item.priority || "P1",
          projectName: "PM/PMO每日工作台",
          sourceType: "manual",
          sourceId: `workbench-ai-suggestion-${index + 1}`,
          sourceReason: `AI建议：${item.title}。依据：${item.basis}`,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "succeeded") {
        throw new Error(body.warning || "AI建议转行动项失败。");
      }
      setActionMessage(`已转入统一行动项：${body.action?.title || item.actionTitle || item.title}`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "AI建议转行动项失败。");
    } finally {
      setSavingSuggestion(null);
    }
  }

  async function convertGovernanceFollowupToAction(item: Workbench["riskRetrospectiveGovernanceFollowups"]["workItems"][number]) {
    setSavingGovernanceFollowup(item.id);
    setActionMessage("");
    try {
      const response = await fetch("/api/issue-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "create_action",
          ...item.actionDraft,
        }),
      });
      const body = await response.json();
      if (!response.ok || body.status !== "succeeded") {
        throw new Error(body.warning || "知识治理待办转统一行动项失败。");
      }

      await fetch("/api/risk/retrospective/assets/governance/followups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          status: "处理中",
          reviewResult: `已从工作台转入统一行动项：${body.action?.id || body.action?.title || item.actionDraft.title}`,
        }),
      });

      setActionMessage(`已转入统一行动项：${body.action?.title || item.actionDraft.title}`);
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          workbench: {
            ...prev.workbench,
            riskRetrospectiveGovernanceFollowups: {
              ...prev.workbench.riskRetrospectiveGovernanceFollowups,
              workItems: prev.workbench.riskRetrospectiveGovernanceFollowups.workItems.map(workItem =>
                workItem.id === item.id ? { ...workItem, status: "处理中" } : workItem,
              ),
            },
          },
        };
      });
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "知识治理待办转统一行动项失败。");
    } finally {
      setSavingGovernanceFollowup(null);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginTop: 12 }}>PM/PMO 每日工作台</h1>
            <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.7 }}>
              把项目台账、风险、重点项目和经营提醒汇总成今日行动清单。AI 建议只作为辅助排序，最终由项目经理或 PMO 确认。
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" className="btn-secondary" style={{ textDecoration: "none" }}>项目组合看板</Link>
            <Link href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>数据与集成</Link>
            <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none" }}>风险管理</Link>
          </div>
        </div>

        <IntegrationStatusPanelClient moduleName="PM/PMO每日工作台" />
        <FeishuConfirmationInlinePanelClient moduleName="PM/PMO每日工作台" />

        {error && <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", marginBottom: 18 }}>{error}</div>}

        {!workbench ? (
          <div className="card" aria-busy="true">正在生成今日工作台...</div>
        ) : (
          <>
            {data?.detail && (
              <div className="card" style={{ borderColor: "var(--amber)", color: "var(--amber)", marginBottom: 18 }}>
                {data.detail}
              </div>
            )}

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
              {workbench.kpis.map(kpi => (
                <div key={kpi.label} className="card">
                  <div style={{ color: "var(--text2)", fontSize: "0.82rem", marginBottom: 10 }}>{kpi.label}</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 800 }}>{kpi.value}</div>
                  <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5, marginTop: 8 }}>{kpi.hint}</p>
                </div>
              ))}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🔗 风险联动提醒</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    将风险登记册与项目健康、任务、里程碑、回款、治理流程和报告工厂统一成今日可处理动作；所有写回建议均需人工确认。
                  </p>
                </div>
                <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>进入风险管理</Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["联动风险", workbench.riskIntegration.summary.openRiskLinks],
                  ["高风险", workbench.riskIntegration.summary.highSeverity],
                  ["项目健康", workbench.riskIntegration.summary.projectHealthImpacts],
                  ["任务", workbench.riskIntegration.summary.taskImpacts],
                  ["里程碑", workbench.riskIntegration.summary.milestoneImpacts],
                  ["回款", workbench.riskIntegration.summary.paymentImpacts],
                  ["治理升级", workbench.riskIntegration.summary.governanceEscalations],
                  ["待确认写回", workbench.riskIntegration.summary.pendingConfirmation],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {workbench.riskIntegration.links.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无风险联动提醒。若实际存在风险，请检查风险登记册和飞书项目台账字段是否已配置。</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {workbench.riskIntegration.links.slice(0, 4).map(link => (
                    <div key={link.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div>
                          <strong>{link.projectName}</strong>
                          <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>
                            {link.riskDescription} · {link.status} · 责任人：{link.owner} · deadline：{link.deadline}
                          </p>
                        </div>
                        <StatusTag value={link.severity} />
                      </div>
                      <p style={{ color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>
                        影响：{link.impactedTargets.join(" / ")}；建议动作：{link.actions[0]?.title || "补齐风险应对动作"}
                      </p>
                      <p style={{ color: "var(--amber)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 4 }}>
                        写回模式：{link.writebackMode === "manual_confirmation_required" ? "需人工确认" : "仅审计记录"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 10 }}>{workbench.riskIntegration.boundary}</p>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">📌 今日工作台数据范围</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                  <strong>{userScopeLabel[workbench.evidence.userScope] || workbench.evidence.userScope}</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                    匹配依据：{workbench.evidence.matchedBy.length > 0 ? workbench.evidence.matchedBy.join(" / ") : "暂无用户身份字段"}
                  </p>
                </div>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                  <strong>已扫描飞书记录</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                    项目{workbench.evidence.scanned.projects} · 风险{workbench.evidence.scanned.risks} · 任务{workbench.evidence.scanned.tasks} · 里程碑{workbench.evidence.scanned.milestones} · 回款{workbench.evidence.scanned.payments}
                  </p>
                </div>
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                  <strong>进入工作台</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                    项目{workbench.evidence.included.projects} · 风险{workbench.evidence.included.risks} · 待办{workbench.evidence.included.todos} · 经营提醒{workbench.evidence.included.businessReminders}
                  </p>
                </div>
              </div>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">✅ 今日优先动作</div>
              <div style={{ display: "grid", gap: 12 }}>
                {workbench.actions.map(action => (
                  <div key={action.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="tag" style={{ background: `${priorityColor[action.priority]}22`, color: priorityColor[action.priority] }}>{action.priority}</span>
                        <strong>{action.title}</strong>
                      </div>
                      <span style={{ color: "var(--text2)", fontSize: "0.82rem" }}>{action.owner} · {action.due}</span>
                    </div>
                    <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>依据：{action.source}</p>
                    <p style={{ color: "var(--accent2)", lineHeight: 1.6, fontSize: "0.84rem", marginTop: 6 }}>动作：{action.action}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🧭 待我处理治理事项</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    从治理工作流中心同步待办，优先显示我作为责任人、审批人或管理员需要处理的逾期、今日到期和即将到期事项。
                  </p>
                </div>
                <Link href="/governance-workflows" className="btn-secondary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>进入治理中心</Link>
              </div>
              {governanceData?.warning && (
                <div style={{ border: "1px solid rgba(245,158,11,0.48)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: "0.82rem", lineHeight: 1.6 }}>
                  {governanceData.warning}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["待我处理", governanceData?.governance_workbench?.summary.myPending ?? 0],
                  ["已逾期", governanceData?.governance_workbench?.summary.overdue ?? 0],
                  ["今日到期", governanceData?.governance_workbench?.summary.dueToday ?? 0],
                  ["即将到期", governanceData?.governance_workbench?.summary.dueSoon ?? 0],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {(governanceData?.governance_workbench?.workItems.length ?? 0) === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
                  暂无待我处理治理事项。若实际存在待办，请检查治理流程实例中的责任人/审批人与当前账号名称、邮箱或手机号是否一致。
                </p>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {governanceData?.governance_workbench?.workItems.slice(0, 6).map(item => (
                    <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <strong>{item.title}</strong>
                          <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>
                            {item.workflowName} · {item.projectName} · 我的角色：{item.role} · 状态：{item.state}
                          </p>
                        </div>
                        <span className="tag" style={{ background: `${slaColor(item.sla.severity)}22`, color: slaColor(item.sla.severity) }}>{item.sla.label}</span>
                      </div>
                      <p style={{ color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>动作：{item.action}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🧠 知识治理待办</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    来自风险复盘资产治理效果。这里只展示已经保存的二次治理待办；可转入统一行动项后进入 P5 闭环。
                  </p>
                </div>
                <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>进入复盘资产治理</Link>
              </div>
              {workbench.riskRetrospectiveGovernanceFollowups.warning && (
                <div style={{ border: "1px solid rgba(245,158,11,0.48)", background: "rgba(245,158,11,0.08)", color: "var(--amber)", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: "0.82rem", lineHeight: 1.6 }}>
                  {workbench.riskRetrospectiveGovernanceFollowups.warning}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  ["待我处理", workbench.riskRetrospectiveGovernanceFollowups.summary.myPending],
                  ["全部未关闭", workbench.riskRetrospectiveGovernanceFollowups.summary.totalOpen],
                  ["已逾期", workbench.riskRetrospectiveGovernanceFollowups.summary.overdue],
                  ["7天内", workbench.riskRetrospectiveGovernanceFollowups.summary.dueSoon],
                  ["P0", workbench.riskRetrospectiveGovernanceFollowups.summary.highPriority],
                  ["飞书待确认", workbench.riskRetrospectiveGovernanceFollowups.summary.waitingFeishuConfirmation],
                  ["自动提醒", workbench.riskRetrospectiveGovernanceFollowupOperation?.reminderDrafts.length ?? 0],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              {(workbench.riskRetrospectiveGovernanceFollowupOperation?.reminderDrafts.length ?? 0) > 0 && (
                <div style={{ border: "1px solid rgba(245,158,11,0.32)", background: "rgba(245,158,11,0.08)", borderRadius: 12, padding: 14, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                    <strong>知识治理运营提醒草稿</strong>
                    <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none", padding: "7px 10px", fontSize: "0.76rem" }}>进入风险页确认发送</Link>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {workbench.riskRetrospectiveGovernanceFollowupOperation?.reminderDrafts.slice(0, 3).map(item => (
                      <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                          <strong style={{ fontSize: "0.8rem" }}>{item.title}</strong>
                          <span className="tag" style={{ background: `${priorityColor[item.priority]}22`, color: priorityColor[item.priority] }}>{item.priority}</span>
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 6 }}>
                          {item.ownerName} · {item.dueDate} · {item.actionRequired}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6, marginTop: 8 }}>
                    这些提醒来自逾期、待验收和证据缺口；飞书外发必须在风险页显式确认。
                  </p>
                </div>
              )}
              {workbench.riskRetrospectiveGovernanceFollowups.workItems.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
                  暂无已保存的知识治理待办。若“知识治理效果”中已有运行时待办，请先到风险管理页点击“保存待办”。
                </p>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {workbench.riskRetrospectiveGovernanceFollowups.workItems.slice(0, 6).map(item => (
                    <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                        <div>
                          <strong>{item.assetTitle}</strong>
                          <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>
                            {item.status} · 责任人：{item.ownerName} · deadline：{item.dueDate} · 飞书：{item.feishuSyncStatus}
                          </p>
                        </div>
                        <span className="tag" style={{ background: `${priorityColor[item.priority]}22`, color: priorityColor[item.priority] }}>{item.priority}</span>
                      </div>
                      <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>原因：{item.reason}</p>
                      <p style={{ color: "var(--accent2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>动作：{item.actionRequired}</p>
                      <p style={{ color: "var(--amber)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 6 }}>关闭标准：{item.closingCriteria}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <button className="btn-secondary" disabled={savingGovernanceFollowup === item.id} onClick={() => void convertGovernanceFollowupToAction(item)} style={{ padding: "7px 10px", fontSize: "0.76rem" }}>
                          {savingGovernanceFollowup === item.id ? "写入中..." : "转统一行动项"}
                        </button>
                        {item.feishuTaskUrl && <a className="btn-secondary" href={item.feishuTaskUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", padding: "7px 10px", fontSize: "0.76rem" }}>查看飞书任务</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 10 }}>{workbench.riskRetrospectiveGovernanceFollowups.boundary}</p>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 18 }}>
              <div className="card">
                <div className="section-title">📁 我的项目</div>
                {workbench.myProjects.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>没有匹配到当前用户负责的未关闭项目。请检查飞书项目台账中的“项目经理/项目负责人/责任人”字段。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.myProjects.map(project => (
                      <div key={project.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <strong>{project.name}</strong>
                          <StatusTag value={project.health} />
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                          {project.stage} · {project.status} · 进度 {project.progress}% · 负责人：{project.owner}
                        </p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>下一节点：{project.nextMilestone}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">⚠️ 我的风险</div>
                {workbench.myRisks.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>没有匹配到当前用户待处理风险。高风险需要在风险登记册中明确责任人、复核日期和应对动作。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.myRisks.map(risk => (
                      <div key={risk.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <strong>{risk.description}</strong>
                          <StatusTag value={risk.severity} />
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                          {risk.projectName} · {risk.status} · 责任人：{risk.owner} · 复核：{risk.dueDate}
                        </p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>{risk.nextAction}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">🗓️ 今日待办</div>
                {workbench.todayTodos.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>今天没有临近 deadline 的任务、里程碑或风险复核事项。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.todayTodos.map(todo => (
                      <div key={todo.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <strong>{todo.title}</strong>
                          <span className="tag" style={{ background: `${priorityColor[todo.priority]}22`, color: priorityColor[todo.priority] }}>{todo.priority}</span>
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                          {todo.type} · {todo.projectName} · {todo.status} · {dueLabel(todo.daysLeft)}
                        </p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>{todo.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">💰 经营提醒</div>
                {workbench.businessReminders.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无临近或逾期回款提醒。请确认飞书回款表和项目台账应收字段已配置。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.businessReminders.map(reminder => (
                      <div key={reminder.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <strong>{reminder.projectName}</strong>
                          <span className="tag tag-amber">{dueLabel(reminder.daysLeft)}</span>
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                          {reminder.customer} · {reminder.amount.toFixed(2)} 万 · {reminder.status} · 到期：{reminder.dueDate}
                        </p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>{reminder.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
              <div className="card">
                <div className="section-title">⭐ 重点项目进度链</div>
                {workbench.keyProjects.length === 0 ? (
                  <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无重点项目数据。请在飞书项目台账补充“重点项目标记”或等待看板规则自动识别。</p>
                ) : (
                  <div style={{ display: "grid", gap: 12 }}>
                    {workbench.keyProjects.map(project => (
                      <div key={project.name} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong>{project.name}</strong>
                          <span className="tag tag-blue">{project.status}</span>
                        </div>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", marginTop: 8 }}>{project.progress}</p>
                        <p style={{ color: "var(--amber)", fontSize: "0.82rem", marginTop: 6 }}>{project.risk}</p>
                        <p style={{ color: "var(--accent2)", fontSize: "0.82rem", marginTop: 6 }}>{project.next}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="section-title">🧠 AI 今日建议</div>
                {actionMessage && (
                  <div style={{ marginBottom: 12, color: actionMessage.includes("失败") ? "var(--red)" : "var(--green)", fontSize: "0.82rem" }}>
                    {actionMessage}
                  </div>
                )}
                <div style={{ display: "grid", gap: 12 }}>
                  {workbench.aiSuggestions.map((item, index) => (
                    <div key={item.title} style={{ background: "var(--surface2)", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
                        <strong>{item.title}</strong>
                        <button className="btn-secondary" disabled={savingSuggestion === item.title} onClick={() => void convertSuggestionToAction(item, index)} style={{ padding: "7px 10px", fontSize: "0.76rem", whiteSpace: "nowrap" }}>
                          {savingSuggestion === item.title ? "写入中..." : "转行动项"}
                        </button>
                      </div>
                      <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>依据：{item.basis}</p>
                      <p style={{ color: "var(--amber)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>人工确认：{item.confirmation}</p>
                      <p style={{ color: "var(--accent2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 6 }}>
                        建议行动项：{item.actionTitle || item.title} · {item.priority || "P1"} · {item.owner || "项目经理/PMO"} · {item.dueDate || "待设定"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <p style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 14 }}>
              数据来源：{data?.source || "未知"}{data?.generated_at ? `；生成时间：${new Date(data.generated_at).toLocaleString("zh-CN")}` : ""}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
