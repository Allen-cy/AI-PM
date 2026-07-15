"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BusinessEntityMultiSelect, BusinessEntitySelect } from "@/components/BusinessEntitySelect";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type CheckItem = {
  id: string; severity: string; title: string; finding: string; suggested_action: string;
  status: string; owner_user_id?: string; reviewer_user_id?: string; due_at?: string;
};
type Cadence = { id: string; name: string; cadence_type: string; status: string; owner_user_id: string };
type Occurrence = { id: string; status: string; scheduled_at: string; due_at: string; owner_user_id: string };
type Workspace = { error?: string; detail?: string; joint_check_items?: CheckItem[]; cadences?: Cadence[]; occurrences?: Occurrence[] };

function lines(value: string): string[] {
  return value.split("\n").map(item => item.trim()).filter(Boolean);
}

export default function BusinessOperationsLoopPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [assignment, setAssignment] = useState({ owner: "", reviewer: "", dueAt: "", comment: "", evidence: "", output: "" });
  const [cadence, setCadence] = useState({ name: "", type: "weekly", owner: "", dayOfWeek: "5", dayOfMonth: "10", eventKey: "", inputs: "项目变化\n例外事实", outputs: "状态摘要\n行动项" });

  const load = useCallback(async (active: StoredBusinessContext) => {
    setNotice("");
    try {
      const query = businessContextSearchParams(active, readStoredDataClass());
      const response = await fetch(`/api/business-assistant/operations-loop?${query}`, { cache: "no-store" });
      const body = await response.json() as Workspace;
      if (!response.ok) throw new Error(body.detail || body.error || "运行闭环加载失败");
      setWorkspace(body);
    } catch (error) { setNotice(error instanceof Error ? error.message : "运行闭环加载失败"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredBusinessContext();
      if (stored && ["pm", "operations"].includes(stored.businessRole)) { setContext(stored); void load(stored); }
      else setNotice("请先在顶部切换到项目经理或运营业务身份。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function mutate(body: Record<string, unknown>, success: string) {
    if (!context) return;
    setBusy(true); setNotice("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/business-assistant/operations-loop?${query}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || result.error || "操作失败");
      setNotice(success); await load(context);
    } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(false); }
  }

  async function transitionCheck(item: CheckItem, action: string) {
    await mutate({
      operation: "transition_joint_check", item_id: item.id, action,
      owner_user_id: assignment.owner || null, reviewer_user_id: assignment.reviewer || null,
      due_at: assignment.dueAt ? new Date(assignment.dueAt).toISOString() : null,
      comment: assignment.comment, evidence: lines(assignment.evidence),
    }, `联合检查项已执行：${action}`);
  }

  async function createCadence() {
    await mutate({
      operation: "create_cadence", name: cadence.name, cadence_type: cadence.type, owner_user_id: cadence.owner,
      day_of_week: cadence.type === "weekly" ? Number(cadence.dayOfWeek) : null,
      day_of_month: cadence.type === "monthly" ? Number(cadence.dayOfMonth) : null,
      event_key: cadence.type === "event" ? cadence.eventKey : null,
      required_inputs: lines(cadence.inputs), required_outputs: lines(cadence.outputs),
    }, "运行节奏已创建。");
  }

  async function transitionOccurrence(item: Occurrence, action: string) {
    await mutate({
      operation: "transition_occurrence", occurrence_id: item.id, action,
      output_summary: assignment.output, evidence: lines(assignment.evidence), action_item_ids: [],
    }, `周期工作已执行：${action}`);
  }

  const checks = workspace.joint_check_items ?? [];
  const cadences = workspace.cadences ?? [];
  const occurrences = workspace.occurrences ?? [];
  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/business-assistant" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回业务助理</Link>
      <strong>PM / 运营业务运行闭环</strong>{context && <span className="tag tag-purple">{context.businessRole}</span>}
    </header>
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.4rem" }}>PM 与运营联合检查</h1>
        <p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 8 }}>从真实项目、里程碑、验收、开票、应收和实收中发现交付—经营断点。结果先由使用者确认，再分派责任人、deadline 和行动项。</p>
        <button className="btn-primary" disabled={busy || !context} style={{ marginTop: 12 }} onClick={() => void mutate({ operation: "run_joint_check" }, "已使用最新真实事实完成联合检查。")}>立即运行联合检查</button>
      </section>
      {notice && <section className="card" style={{ marginBottom: 18, borderColor: "rgba(245,158,11,.45)" }}>{notice}</section>}
      <section className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "1rem" }}>分派、输出与关闭输入</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 10 }}>
          <BusinessEntitySelect kind="person" placeholder="选择执行责任人" value={assignment.owner} onChange={owner => setAssignment({ ...assignment, owner })}/>
          <BusinessEntitySelect kind="person" placeholder="选择复核人" value={assignment.reviewer} onChange={reviewer => setAssignment({ ...assignment, reviewer })}/>
          <input className="input" type="datetime-local" value={assignment.dueAt} onChange={event => setAssignment({ ...assignment, dueAt: event.target.value })}/>
          <input className="input" placeholder="确认、驳回或关闭说明" value={assignment.comment} onChange={event => setAssignment({ ...assignment, comment: event.target.value })}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
          <BusinessEntityMultiSelect kind="evidence" placeholder="从已授权项目选择证据" value={lines(assignment.evidence)} onChange={evidence => setAssignment({ ...assignment, evidence: evidence.join("\n") })}/>
          <textarea className="input" placeholder="周期工作输出总结" value={assignment.output} onChange={event => setAssignment({ ...assignment, output: event.target.value })}/>
        </div>
      </section>
      <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
        {checks.length === 0 && <section className="card" style={{ color: "var(--text2)" }}>尚无联合检查项。缺少数据时系统会记录数据缺口，不显示虚假绿色。</section>}
        {checks.map(item => <section className="card" key={item.id}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{item.title}</strong><p style={{ color: "var(--text2)", marginTop: 6 }}>{item.finding}</p><small>建议动作：{item.suggested_action}</small></div><div><span className="tag tag-red">{item.severity}</span> <span className="tag tag-blue">{item.status}</span></div></div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {["detected", "reopened"].includes(item.status) && <><button className="btn-primary" disabled={busy} onClick={() => void transitionCheck(item, "confirm")}>确认断点</button><button className="btn-secondary" disabled={busy} onClick={() => void transitionCheck(item, "dismiss")}>说明后驳回</button></>}
            {item.status === "confirmed" && <button className="btn-primary" disabled={busy} onClick={() => void transitionCheck(item, "create_action")}>分派行动项</button>}
            {item.status === "action_created" && <button className="btn-primary" disabled={busy} onClick={() => void transitionCheck(item, "close")}>证据关闭</button>}
            {["dismissed", "closed"].includes(item.status) && <button className="btn-secondary" disabled={busy} onClick={() => void transitionCheck(item, "reopen")}>重新打开</button>}
          </div>
        </section>)}
      </div>
      <section className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "1.15rem" }}>日/周/月/事件运行日历</h2>
        <p style={{ color: "var(--text2)", marginTop: 6 }}>由使用者配置真实节奏和输入输出，系统只生成已配置的周期工作。</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
          <input className="input" placeholder="节奏名称" value={cadence.name} onChange={event => setCadence({ ...cadence, name: event.target.value })}/>
          <select className="input" value={cadence.type} onChange={event => setCadence({ ...cadence, type: event.target.value })}>{["daily", "weekly", "monthly", "event"].map(item => <option key={item}>{item}</option>)}</select>
          {cadence.type === "weekly" && <input className="input" type="number" min="0" max="6" value={cadence.dayOfWeek} onChange={event => setCadence({ ...cadence, dayOfWeek: event.target.value })}/>} 
          {cadence.type === "monthly" && <input className="input" type="number" min="1" max="31" value={cadence.dayOfMonth} onChange={event => setCadence({ ...cadence, dayOfMonth: event.target.value })}/>} 
          {cadence.type === "event" && <input className="input" placeholder="事件键" value={cadence.eventKey} onChange={event => setCadence({ ...cadence, eventKey: event.target.value })}/>} 
          <BusinessEntitySelect kind="person" placeholder="选择运行节奏负责人" value={cadence.owner} onChange={owner => setCadence({ ...cadence, owner })}/>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}><textarea className="input" value={cadence.inputs} onChange={event => setCadence({ ...cadence, inputs: event.target.value })}/><textarea className="input" value={cadence.outputs} onChange={event => setCadence({ ...cadence, outputs: event.target.value })}/></div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="btn-primary" disabled={busy} onClick={() => void createCadence()}>保存运行节奏</button><button className="btn-secondary" disabled={busy} onClick={() => void mutate({ operation: "materialize_calendar", business_date: new Date().toISOString().slice(0, 10) }, "今日周期工作已生成，重复执行不会重复创建。")}>生成今日工作</button></div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>{cadences.map(item => <section className="card" key={item.id}><strong>{item.name}</strong><p style={{ color: "var(--text2)", marginTop: 5 }}>{item.cadence_type} · {item.status} · Owner {item.owner_user_id}</p></section>)}</div>
      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>{occurrences.map(item => <section className="card" key={item.id}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><strong>周期工作 · {new Date(item.scheduled_at).toLocaleString("zh-CN")}</strong><span className="tag tag-blue">{item.status}</span></div>
        <p style={{ color: "var(--text2)", marginTop: 6 }}>截止 {new Date(item.due_at).toLocaleString("zh-CN")} · Owner {item.owner_user_id}</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>{["scheduled", "overdue"].includes(item.status) && <button className="btn-primary" onClick={() => void transitionOccurrence(item, "start")}>开始</button>}{item.status === "in_progress" && <button className="btn-primary" onClick={() => void transitionOccurrence(item, "submit_evidence")}>提交输出与证据</button>}{item.status === "evidence_submitted" && <button className="btn-primary" onClick={() => void transitionOccurrence(item, "close")}>关闭</button>}</div>
      </section>)}</div>
    </div>
  </main>;
}
