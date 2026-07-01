"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Workbench = {
  kpis: Array<{ label: string; value: string; hint: string; status: string }>;
  actions: Array<{ id: string; priority: string; title: string; owner: string; due: string; source: string; action: string }>;
  keyProjects: Array<{ name: string; status: string; progress: string; risk: string; next: string }>;
  aiSuggestions: Array<{ title: string; basis: string; confirmation: string; actionTitle?: string; priority?: "P0" | "P1" | "P2"; owner?: string; dueDate?: string }>;
  myProjects: Array<{ id: string; name: string; owner: string; status: string; stage: string; progress: number; health: string; riskLevel: string; nextMilestone: string; source: string }>;
  myRisks: Array<{ id: string; projectName: string; description: string; severity: string; status: string; owner: string; dueDate: string; nextAction: string; source: string }>;
  todayTodos: Array<{ id: string; type: string; title: string; projectName: string; owner: string; dueDate: string; daysLeft: number | null; status: string; priority: string; source: string; action: string }>;
  businessReminders: Array<{ id: string; projectName: string; customer: string; amount: number; dueDate: string; daysLeft: number | null; status: string; source: string; action: string }>;
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

export default function WorkbenchPage() {
  const [data, setData] = useState<WorkbenchResponse | null>(null);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingSuggestion, setSavingSuggestion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/operating-system/workbench", { cache: "no-store" });
        const body = await response.json();
        if (!cancelled) setData(body);
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
