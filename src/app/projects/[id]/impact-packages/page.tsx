"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BusinessEntityMultiSelect, BusinessEntitySelect } from "@/components/BusinessEntitySelect";
import { StructuredFieldsEditor } from "@/components/StructuredFieldsEditor";

type ImpactPackage = {
  id: string; source_type: string; source_id: string; source_status: string; targets: Array<Record<string, unknown>>;
  status: string; owner_user_id: string; reviewer_user_id: string; due_at: string; version: number;
  confirmation_note?: string; application_evidence?: unknown[]; effect_review?: Record<string, unknown>;
};

export default function ProjectImpactPackagesPage() {
  const params = useParams<{ id: string }>(); const search = useSearchParams(); const projectId = String(params.id || "");
  const [role, setRole] = useState(search.get("role") || search.get("business_role") || "pm");
  const [dataClass, setDataClass] = useState(search.get("data_class") || "production");
  const [packages, setPackages] = useState<ImpactPackage[]>([]); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ sourceType: "change", sourceId: "", targetType: "milestone", targetId: "", proposedChange: { change_summary: "", forecast_value: "" } as Record<string, unknown>, ownerUserId: "", reviewerUserId: "", dueAt: "" });
  const [transition, setTransition] = useState({ comment: "", evidence: [] as string[], effectReview: { outcome: "", actual_effect: "" } as Record<string, unknown> });

  const load = useCallback(async () => {
    setNotice("");
    try {
      const query = new URLSearchParams({ business_role: role, data_class: dataClass }); const response = await fetch(`/api/projects/${projectId}/impact-packages?${query}`, { cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || "影响包加载失败"); setPackages(body.packages || []);
    } catch (error) { setNotice(error instanceof Error ? error.message : "影响包加载失败"); }
  }, [dataClass, projectId, role]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function mutate(body: Record<string, unknown>, success: string) {
    setBusy(true); setNotice("");
    try { const response = await fetch(`/api/projects/${projectId}/impact-packages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, business_role: role, data_class: dataClass }) }); const result = await response.json(); if (!response.ok) throw new Error(result.detail || result.error || "操作失败"); setNotice(success); await load(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); } finally { setBusy(false); }
  }

  async function createPackage() {
    await mutate({ operation: "create", source_type: form.sourceType, source_id: form.sourceId, targets: [{ target_type: form.targetType, target_id: form.targetId, proposed_change: form.proposedChange }], owner_user_id: form.ownerUserId, reviewer_user_id: form.reviewerUserId, due_at: form.dueAt ? new Date(form.dueAt).toISOString() : "", idempotency_key: `${form.sourceType}:${form.sourceId}:${form.targetType}:${form.targetId}` }, "影响包已创建，等待复核人确认；系统尚未改写目标事实。");
  }

  async function transitionPackage(item: ImpactPackage, operation: string) {
    await mutate({ operation, package_id: item.id, comment: transition.comment, evidence: transition.evidence, effect_review: transition.effectReview }, `影响包已执行：${operation}。`);
  }

  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href={`/projects/${projectId}?role=${role}&data_class=${dataClass}`} style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回项目360</Link><strong>业务影响包</strong><span className="tag tag-purple">风险 / 问题 / 变更 → 计划 / 里程碑 / 预算 / 合同 / 回款</span>
      <select className="input" style={{ marginLeft: "auto", width: 125 }} value={role} onChange={event => setRole(event.target.value)}>{["pm","operations","pmo","sponsor","business_owner","finance"].map(value => <option key={value}>{value}</option>)}</select>
      <select className="input" style={{ width: 125 }} value={dataClass} onChange={event => setDataClass(event.target.value)}>{["production","sample","test","diagnostic"].map(value => <option key={value}>{value}</option>)}</select>
    </header>
    <div style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ marginBottom: 18 }}><h1 style={{ fontSize: "1.35rem" }}>批准结果不会直接覆盖业务事实</h1><p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 8 }}>使用者选择已批准或确认的风险、问题或变更，明确受影响对象、建议变化、责任人与期限；复核人确认后由责任人实施并提交证据，最后复核效果。每一步有状态和审计。</p></section>
      {notice && <section className="card" style={{ marginBottom: 18, borderColor: "rgba(245,158,11,.45)" }}>{notice}</section>}
      <section className="card" style={{ marginBottom: 18 }}><h2 style={{ fontSize: "1rem" }}>创建待确认影响包</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
        <select className="input" value={form.sourceType} onChange={event => setForm({ ...form, sourceType: event.target.value })}><option value="risk">风险</option><option value="issue">问题</option><option value="change">变更</option></select>
        <BusinessEntitySelect kind="businessObject" projectId={projectId} entityType={form.sourceType} value={form.sourceId} onChange={sourceId => setForm({ ...form, sourceId })} placeholder="选择已确认的来源记录"/>
        <select className="input" value={form.targetType} onChange={event => setForm({ ...form, targetType: event.target.value })}>{["plan","milestone","budget","contract","payment"].map(value => <option key={value}>{value}</option>)}</select>
        <BusinessEntitySelect kind="businessObject" projectId={projectId} entityType={form.targetType} value={form.targetId} onChange={targetId => setForm({ ...form, targetId })} placeholder="选择受影响的目标对象"/>
        <BusinessEntitySelect kind="person" value={form.ownerUserId} onChange={ownerUserId => setForm({ ...form, ownerUserId })} placeholder="选择实施责任人"/>
        <BusinessEntitySelect kind="person" value={form.reviewerUserId} onChange={reviewerUserId => setForm({ ...form, reviewerUserId })} placeholder="选择复核人"/>
        <input className="input" type="datetime-local" value={form.dueAt} onChange={event => setForm({ ...form, dueAt: event.target.value })}/>
      </div><div style={{ marginTop: 12 }}><h3 style={{ fontSize: ".9rem", marginBottom: 8 }}>建议变化</h3><StructuredFieldsEditor value={form.proposedChange} onChange={proposedChange => setForm({ ...form, proposedChange })} labels={{ change_summary: "变化说明", forecast_value: "预计调整结果" }}/></div><button className="btn-primary" disabled={busy || !form.sourceId || !form.targetId || !form.ownerUserId || !form.reviewerUserId} style={{ marginTop: 10 }} onClick={() => void createPackage()}>创建影响包</button></section>
      <section className="card" style={{ marginBottom: 18 }}><h2 style={{ fontSize: "1rem" }}>本次处理说明与证据</h2><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}><textarea className="input" placeholder="确认/驳回说明" value={transition.comment} onChange={event => setTransition({ ...transition, comment: event.target.value })}/><BusinessEntityMultiSelect kind="evidence" value={transition.evidence} onChange={evidence => setTransition({ ...transition, evidence })} placeholder="选择实施证据"/></div><div style={{ marginTop: 12 }}><h3 style={{ fontSize: ".9rem", marginBottom: 8 }}>效果复核</h3><StructuredFieldsEditor value={transition.effectReview} onChange={effectReview => setTransition({ ...transition, effectReview })} labels={{ outcome: "效果结论", actual_effect: "实际效果" }} fixedKeys/></div></section>
      <div style={{ display: "grid", gap: 12 }}>{packages.length === 0 && <section className="card" style={{ color: "var(--text2)" }}>当前项目没有影响包。系统不会生成演示记录。</section>}{packages.map(item => <section className="card" key={item.id}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><strong>{item.source_type} · 已关联业务来源</strong><div style={{ color: "var(--text2)", fontSize: ".78rem", marginTop: 5 }}>来源状态 {item.source_status} · 已分配实施与复核责任 · 截止 {new Date(item.due_at).toLocaleString("zh-CN")}</div></div><span className="tag tag-blue">{item.status}</span></div><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{item.targets.map((target, index) => <div key={index} style={{ background: "var(--surface2)", padding: 10, borderRadius: 8 }}><strong>{String(target.target_type || "目标")} · 变更建议 {index + 1}</strong><div style={{ color: "var(--text2)", marginTop: 5 }}>{Object.entries((target.proposed_change as Record<string, unknown>) || {}).map(([key, value]) => `${key}：${String(value)}`).join(" · ") || "暂无详细建议"}</div></div>)}</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>{item.status === "pending_confirmation" && <><button className="btn-primary" disabled={busy} onClick={() => void transitionPackage(item, "confirm")}>复核确认</button><button className="btn-secondary" disabled={busy} onClick={() => void transitionPackage(item, "reject")}>驳回</button></>}{item.status === "confirmed" && <button className="btn-primary" disabled={busy} onClick={() => void transitionPackage(item, "submit_application")}>提交实施证据</button>}{item.status === "applied" && <button className="btn-primary" disabled={busy} onClick={() => void transitionPackage(item, "review_effect")}>复核效果</button>}{item.status === "effect_reviewed" && <button className="btn-primary" disabled={busy} onClick={() => void transitionPackage(item, "close")}>关闭影响包</button>}</div></section>)}</div>
    </div>
  </main>;
}
