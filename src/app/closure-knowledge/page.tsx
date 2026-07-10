"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  writeStoredBusinessContext,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type Project = { id: string; name: string; project_level?: string; status?: string };
type Blocker = { code: string; category: string; message: string; requiredAction: string };
type Assessment = { id: string; assessment_version: number; status: string; ready: boolean; created_at: string };
type KnowledgeCandidate = { id: string; title: string; status: string; knowledge_type?: string; updated_at?: string };
type ImpactLink = { id: string; status: string; target_type: string; target_key: string; impact_description: string; priority: string; due_at?: string; closure_evidence?: string[] };
type ReuseEvent = { id: string; status: string; target_project_id: string; recommendation_reason?: string; outcome?: string; created_at: string };
type ClosurePayload = {
  projects: string[];
  project: Project;
  gate: { ready: boolean; blockers: Blocker[]; facts: Record<string, number | boolean>; generatedAt: string };
  assessments: Assessment[];
  knowledgeCandidates: KnowledgeCandidate[];
  impactLinks: ImpactLink[];
  reuseEvents: ReuseEvent[];
};

const ALLOWED_ROLES = new Set(["pm", "operations", "pmo", "sponsor", "business_owner", "finance", "quality"]);

export default function ClosureKnowledgePage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<ClosurePayload | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [candidate, setCandidate] = useState({ title: "", summary: "", knowledge_type: "lessons_learned", applicability_conditions: "" });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reuseForm, setReuseForm] = useState({ knowledge_item_id: "", target_project_id: "", recommendation_reason: "" });

  const query = useMemo(() => {
    if (!context) return null;
    const params = businessContextSearchParams(context, readStoredDataClass());
    if (projectId) params.set("project_id", projectId);
    return params;
  }, [context, projectId]);

  const load = useCallback(async (requestedProjectId = "") => {
    setError("");
    try {
      const contextResponse = await fetch("/api/context/current", { cache: "no-store" });
      const contextBody = await contextResponse.json() as { available_contexts?: Array<StoredBusinessContext & { id: string; status: string }> };
      if (!contextResponse.ok) throw new Error("无法读取当前业务角色，请重新登录。");
      const stored = readStoredBusinessContext();
      const selected = contextBody.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active" && ALLOWED_ROLES.has(item.businessRole))
        ?? contextBody.available_contexts?.find(item => item.status === "active" && ALLOWED_ROLES.has(item.businessRole));
      if (!selected) throw new Error("当前账号没有项目收尾或知识复核权限。");
      const active = { assignmentId: selected.id, businessRole: selected.businessRole, orgId: selected.orgId, subjectScope: selected.subjectScope, subjectId: selected.subjectId };
      writeStoredBusinessContext(active);
      setContext(active);
      const params = businessContextSearchParams(active, readStoredDataClass());
      if (requestedProjectId || projectId) params.set("project_id", requestedProjectId || projectId);
      const response = await fetch(`/api/closure-knowledge?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "收尾数据加载失败");
      setData(payload as ClosurePayload);
      setProjectId((payload as ClosurePayload).project.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "收尾数据加载失败");
    }
  }, [projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // 首次进入时恢复业务上下文，项目切换由选择器显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function operate(operation: string, payload: Record<string, unknown> = {}) {
    if (!query) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/closure-knowledge?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...payload }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "业务动作保存失败");
      setMessage(operation === "assess_closure" ? "收尾门禁已重新评估并留痕。" : "动作已保存并写入审计链。");
      if (operation === "create_knowledge_candidate") setCandidate({ title: "", summary: "", knowledge_type: "lessons_learned", applicability_conditions: "" });
      await load(projectId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "业务动作保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function advanceReuse(item: ReuseEvent, action: "accept" | "reject" | "apply" | "review_effect") {
    const payload: Record<string, unknown> = { reuse_event_id: item.id, action };
    if (action === "reject") { const reason = window.prompt("请填写不采用原因：", ""); if (!reason?.trim()) return; payload.rejection_reason = reason.trim(); }
    if (action === "apply") { const note = window.prompt("请说明如何应用到当前项目：", ""); if (!note?.trim()) return; payload.usage_note = note.trim(); }
    if (action === "review_effect") { const outcome = window.prompt("请填写复用结果：", ""); if (!outcome?.trim()) return; const score = Number(window.prompt("请给出1–5分效果评分：", "3")); if (![1, 2, 3, 4, 5].includes(score)) return; payload.outcome = outcome.trim(); payload.effect_score = score; }
    await operate("update_reuse", payload);
  }

  async function advanceImpact(item: ImpactLink, action: "start" | "no_change" | "mark_updated" | "close") {
    const payload: Record<string, unknown> = { impact_id: item.id, action };
    if (action !== "start") { const evidence = window.prompt("请填写可验证的复核/关闭证据链接或编号：", ""); if (!evidence?.trim()) return; payload.closure_evidence = [evidence.trim()]; }
    await operate("update_impact", payload);
  }

  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
      <Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link>
      <strong style={{ color: "var(--green)" }}>收尾门禁与知识复用中心</strong>
      <span className="tag tag-green">交付→验收→财务→移交→知识复用</span>
      <Link href="/closure-knowledge/retrospective" className="btn-secondary" style={{ textDecoration: "none" }}>项目复盘与知识自动化</Link>
      {data && <select className="input" style={{ marginLeft: "auto", width: 260 }} value={projectId} onChange={event => void load(event.target.value)}>{data.projects.map(id => <option value={id} key={id}>{id === data.project.id ? data.project.name : id}</option>)}</select>}
    </header>

    <div style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      {(error || message) && <section className="card" style={{ marginBottom: 16, color: error ? "var(--red)" : "var(--green)" }}>{error || message}</section>}
      {!data && !error && <section className="card">正在读取当前角色范围内的真实收尾数据……</section>}
      {data && <>
        <section className="card" style={{ borderColor: data.gate.ready ? "var(--green)" : "var(--orange)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div><div className="section-title">{data.gate.ready ? "✅ 收尾门禁已通过" : "🚧 收尾门禁未通过"}</div><p style={{ color: "var(--text2)", margin: 0 }}>{data.project.name} · {data.project.project_level || "未分级"} · {data.project.status || "未知状态"}</p></div>
            <button className="btn-primary" disabled={saving} onClick={() => void operate("assess_closure")}>重新评估并留痕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 16 }}>{Object.entries(data.gate.facts).map(([key, value]) => <div className="stat-card" key={key}><div className="stat-num" style={{ fontSize: "1.1rem" }}>{typeof value === "boolean" ? (value ? "是" : "否") : value.toLocaleString("zh-CN")}</div><div className="stat-label">{key}</div></div>)}</div>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="section-title">必须关闭的业务缺口</div>
          {data.gate.blockers.length === 0 ? <p style={{ color: "var(--green)" }}>交付、验收、风险、财务、归档与移交证据已齐备。</p> : <div style={{ display: "grid", gap: 10 }}>{data.gate.blockers.map(item => <article key={item.code} style={{ padding: 12, borderRadius: 10, background: "var(--surface2)", borderLeft: "3px solid var(--orange)" }}><strong>{item.category}：{item.message}</strong><p style={{ color: "var(--text2)", margin: "6px 0 0" }}>责任动作：{item.requiredAction}</p></article>)}</div>}
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, marginTop: 16 }}>
          <div className="card"><div className="section-title">📚 新增知识候选</div><p style={{ color: "var(--text2)", fontSize: ".82rem" }}>用户先提交真实经验与证据，PMO/质量角色复核后才能发布。</p><input className="input" placeholder="知识标题" value={candidate.title} onChange={event => setCandidate(previous => ({ ...previous, title: event.target.value }))}/><textarea className="input" style={{ marginTop: 8 }} rows={4} placeholder="事实、做法、结果与证据摘要" value={candidate.summary} onChange={event => setCandidate(previous => ({ ...previous, summary: event.target.value }))}/><input className="input" style={{ marginTop: 8 }} placeholder="适用条件/不适用边界" value={candidate.applicability_conditions} onChange={event => setCandidate(previous => ({ ...previous, applicability_conditions: event.target.value }))}/><button className="btn-primary" style={{ marginTop: 10 }} disabled={saving || !candidate.title.trim() || !candidate.summary.trim()} onClick={() => void operate("create_knowledge_candidate", candidate)}>提交知识候选</button></div>
          <div className="card"><div className="section-title">📋 门禁评估记录</div>{data.assessments.length === 0 ? <p style={{ color: "var(--text2)" }}>尚未生成评估记录。</p> : data.assessments.map(item => <article key={item.id} style={{ padding: 10, borderBottom: "1px solid var(--border)" }}><strong>V{item.assessment_version} · {item.ready ? "已通过" : "待补证"}</strong><span className="tag tag-blue" style={{ marginLeft: 8 }}>{item.status}</span><div style={{ color: "var(--text2)", fontSize: ".74rem", marginTop: 5 }}>{new Date(item.created_at).toLocaleString("zh-CN")}</div>{item.status === "submitted" && ["pmo", "sponsor"].includes(context?.businessRole || "") && <div style={{ marginTop: 8 }}><input className="input" placeholder="收尾复核意见" value={reviewNotes[`closure:${item.id}`] || ""} onChange={event => setReviewNotes(previous => ({ ...previous, [`closure:${item.id}`]: event.target.value }))}/><div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="btn-secondary" disabled={saving || !(reviewNotes[`closure:${item.id}`] || "").trim()} onClick={() => void operate("review_closure", { assessment_id: item.id, decision: "reject", review_note: reviewNotes[`closure:${item.id}`] })}>退回补证</button><button className="btn-primary" disabled={saving || !item.ready || !(reviewNotes[`closure:${item.id}`] || "").trim()} onClick={() => void operate("review_closure", { assessment_id: item.id, decision: "approve", review_note: reviewNotes[`closure:${item.id}`] })}>批准正式收尾</button></div></div>}</article>)}</div>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div className="section-title">🧠 知识候选与变更影响</div>
          {data.knowledgeCandidates.length === 0 ? <p style={{ color: "var(--text2)" }}>尚无来自本项目的知识候选。</p> : <div style={{ display: "grid", gap: 10 }}>{data.knowledgeCandidates.map(item => <article key={item.id} style={{ padding: 12, background: "var(--surface2)", borderRadius: 10, display: "grid", gridTemplateColumns: "1fr minmax(260px,420px)", gap: 12 }}><div><strong>{item.title}</strong><p style={{ color: "var(--text2)", margin: "6px 0" }}>{item.knowledge_type || "经验教训"} · {item.status}</p></div>{["pmo", "quality"].includes(context?.businessRole || "") && item.status !== "published" ? <div><input className="input" placeholder="复核意见和证据" value={reviewNotes[item.id] || ""} onChange={event => setReviewNotes(previous => ({ ...previous, [item.id]: event.target.value }))}/><button className="btn-primary" style={{ marginTop: 8 }} disabled={saving || !(reviewNotes[item.id] || "").trim()} onClick={() => void operate("publish_knowledge_candidate", { knowledge_item_id: item.id, review_note: reviewNotes[item.id] })}>复核发布并生成影响待办</button></div> : <span className="tag tag-green" style={{ justifySelf: "end", alignSelf: "start" }}>{item.status}</span>}</article>)}</div>}
        </section>

        <section className="card" style={{ marginTop: 16 }}><div className="section-title">🛠 知识变更影响待办</div>{data.impactLinks.length === 0 ? <p style={{ color: "var(--text2)" }}>知识发布后将自动生成模块、模板、规则和培训复核待办。</p> : data.impactLinks.map(item => <article key={item.id} style={{ padding: 10, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{item.target_type} · {item.target_key}</strong><span className="tag tag-blue" style={{ marginLeft: 8 }}>{item.status}</span><p style={{ color: "var(--text2)", margin: "5px 0" }}>{item.impact_description}</p></div><div style={{ display: "flex", gap: 6, alignItems: "center" }}>{item.status === "pending_review" && <><button className="btn-secondary" disabled={saving} onClick={() => void advanceImpact(item, "no_change")}>复核无影响</button><button className="btn-primary" disabled={saving} onClick={() => void advanceImpact(item, "start")}>开始处理</button></>}{item.status === "in_progress" && <><button className="btn-secondary" disabled={saving} onClick={() => void advanceImpact(item, "no_change")}>确认无影响</button><button className="btn-primary" disabled={saving} onClick={() => void advanceImpact(item, "mark_updated")}>已更新对象</button></>}{["updated", "no_change"].includes(item.status) && <button className="btn-primary" disabled={saving} onClick={() => void advanceImpact(item, "close")}>提交证据关闭</button>}</div></article>)}</section>

        <section className="card" style={{ marginTop: 16 }}><div className="section-title">🔁 知识复用跟踪</div><div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) minmax(220px,1fr) 2fr auto", gap: 8, alignItems: "end", marginBottom: 12 }}><label><span className="label">已发布知识</span><select className="input" value={reuseForm.knowledge_item_id} onChange={event => setReuseForm(previous => ({ ...previous, knowledge_item_id: event.target.value }))}><option value="">请选择</option>{data.knowledgeCandidates.filter(item => item.status === "published").map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label><span className="label">目标项目</span><select className="input" value={reuseForm.target_project_id} onChange={event => setReuseForm(previous => ({ ...previous, target_project_id: event.target.value }))}><option value="">请选择</option>{data.projects.map(id => <option key={id} value={id}>{id}</option>)}</select></label><label><span className="label">推荐原因/适用条件</span><input className="input" value={reuseForm.recommendation_reason} onChange={event => setReuseForm(previous => ({ ...previous, recommendation_reason: event.target.value }))}/></label><button className="btn-primary" disabled={saving || !reuseForm.knowledge_item_id || !reuseForm.target_project_id || !reuseForm.recommendation_reason.trim()} onClick={() => void operate("record_reuse", reuseForm)}>登记复用推荐</button></div>{data.reuseEvents.length === 0 ? <p style={{ color: "var(--text2)" }}>尚无复用记录；实际采用后应回填适用性、使用结果和效果评分。</p> : data.reuseEvents.map(item => <article key={item.id} style={{ padding: 10, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{item.status} → {item.target_project_id}</strong><p style={{ color: "var(--text2)", margin: "5px 0" }}>{item.recommendation_reason || item.outcome || "未填写复用说明"}</p></div><div style={{ display: "flex", gap: 6, alignItems: "center" }}>{item.status === "recommended" && <><button className="btn-secondary" disabled={saving} onClick={() => void advanceReuse(item, "reject")}>不采用</button><button className="btn-primary" disabled={saving} onClick={() => void advanceReuse(item, "accept")}>接受</button></>}{item.status === "accepted" && <button className="btn-primary" disabled={saving} onClick={() => void advanceReuse(item, "apply")}>记录应用</button>}{item.status === "applied" && ["pmo", "quality", "sponsor"].includes(context?.businessRole || "") && <button className="btn-primary" disabled={saving} onClick={() => void advanceReuse(item, "review_effect")}>效果复核</button>}</div></article>)}</section>
      </>}
    </div>
  </main>;
}
