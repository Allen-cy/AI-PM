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
};

type GovernanceResponse = {
  status: string;
  workflows: Workflow[];
  instances: Instance[];
  warning?: string;
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
  };
}

function statusColor(state: string): string {
  if (["已通过", "已批准", "已实施", "已关闭", "已验收", "已归档"].includes(state)) return "var(--green)";
  if (["已驳回", "已拒绝", "暂停"].includes(state)) return "var(--red)";
  if (["需补充", "需整改", "有条件通过"].includes(state)) return "var(--amber)";
  return "var(--accent2)";
}

export default function GovernanceWorkflowsClient() {
  const [data, setData] = useState<GovernanceResponse | null>(null);
  const [form, setForm] = useState<CreateForm>(emptyForm());
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [transitionNote, setTransitionNote] = useState<Record<string, string>>({});
  const [transitionOutput, setTransitionOutput] = useState<Record<string, string>>({});
  const [transitionActions, setTransitionActions] = useState<Record<string, string>>({});

  const selectedWorkflow = useMemo(
    () => data?.workflows.find(workflow => workflow.id === form.workflowId),
    [data?.workflows, form.workflowId],
  );

  async function load() {
    const response = await fetch("/api/governance/workflows", { cache: "no-store" });
    const body = await response.json();
    setData(body);
    if (body.workflows?.length && !form.workflowId) {
      setForm(emptyForm(body.workflows[0]));
    }
  }

  useEffect(() => {
    load().catch(() => setMessage("无法读取治理流程，请稍后重试。"));
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
        setMessage(`已流转到：${body.instance.state}；飞书回写：${body.feishu_sync?.status || "skipped"}`);
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
                          </div>
                          <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                            {instance.projectName} · 责任人：{instance.owner} · 审批：{instance.approver} · deadline：{instance.deadline || "未设定"}
                          </p>
                        </div>
                        <a href={`/api/governance/workflows/${instance.id}/report`} className="btn-secondary" style={{ textDecoration: "none", alignSelf: "start" }}>下载输出</a>
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
