"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { businessContextSearchParams, readStoredBusinessContext, readStoredDataClass, writeStoredBusinessContext, type StoredBusinessContext } from "@/features/operating-model/client-context";

type Item = { id: string; type: string; title: string; status: string; projectId: string | null; dueAt: string | null; priority: "critical" | "high" | "medium" | "low"; actionUrl: string; sourceId: string };
type Payload = { items?: Item[]; unavailable_sources?: Array<{ source: string; reason: string }>; error?: string; detail?: string };

const ROLE_LABEL: Record<string, string> = { pm: "项目经理", operations: "运营", pmo: "PMO", ceo: "CEO", sponsor: "项目发起人", business_owner: "业务负责人", finance: "财务", quality: "质量" };
const TYPE_LABEL: Record<string, string> = { decision_receipt: "决策回执", action: "行动项", closure_review: "收尾审批", benefit_review: "收益复核", correction: "人工纠偏", report_receipt: "汇报接收", evidence_review: "证据核验", data_quality: "数据纠偏", governance_action: "会后行动", capacity_conflict: "资源冲突", project_dependency: "项目依赖" };
const PRIORITY_LABEL = { critical: "立即处理", high: "高", medium: "中", low: "低" };

export default function CollaborationInboxPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/context/current", { cache: "no-store" });
      const body = await response.json() as { available_contexts?: Array<{ id: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string; status: string }> };
      const stored = readStoredBusinessContext();
      const assignment = body.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active") ?? body.available_contexts?.find(item => item.status === "active");
      if (!assignment) throw new Error("尚未分配有效业务角色。");
      const active = { assignmentId: assignment.id, businessRole: assignment.businessRole, orgId: assignment.orgId, subjectScope: assignment.subjectScope, subjectId: assignment.subjectId };
      writeStoredBusinessContext(active); setContext(active);
      const query = businessContextSearchParams(active, readStoredDataClass());
      const result = await fetch(`/api/collaboration-inbox?${query.toString()}`, { cache: "no-store" });
      const resultBody = await result.json() as Payload;
      if (!result.ok) throw new Error(resultBody.detail || resultBody.error || "协作待办加载失败。");
      setPayload(resultBody);
    } catch (error) { setPayload({ error: error instanceof Error ? error.message : "协作待办加载失败。" }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const items = payload.items ?? [];
  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link><strong style={{ color: "var(--cyan)" }}>协作待办与审批收件箱</strong>{context && <span className="tag tag-purple">{ROLE_LABEL[context.businessRole] || context.businessRole} · {context.subjectScope}/{context.subjectId}</span>}<button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>刷新</button></header>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ background: "linear-gradient(135deg,rgba(6,182,212,.15),rgba(59,130,246,.08))" }}><h1 style={{ fontSize: "1.45rem" }}>一个入口接收自己必须处理的事</h1><p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 8 }}>发起人、业务负责人、财务和质量角色不需要复制一套工作台；这里只聚合当前角色、当前范围和当前数据空间的待接收、待复核、待补证和待关闭事项。</p></section>
      {loading && <section className="card" style={{ marginTop: 16 }}>正在核对角色权限和真实待办……</section>}
      {!loading && payload.error && <section className="card" style={{ marginTop: 16, color: "var(--red)" }}>{payload.error}</section>}
      {!loading && !payload.error && <>
        {(payload.unavailable_sources?.length ?? 0) > 0 && <aside className="card" style={{ marginTop: 16, color: "var(--amber)" }}>部分待办源尚不可用：{payload.unavailable_sources?.map(item => item.source).join("、")}。系统未用样例数据补位。</aside>}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 16 }}>{["critical", "high", "medium", "low"].map(priority => <div className="stat-card" key={priority}><div className="stat-num">{items.filter(item => item.priority === priority).length}</div><div className="stat-label">{PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL]}优先级</div></div>)}</section>
        <section className="card" style={{ marginTop: 16 }}><div className="section-title">我的待办</div>{items.length === 0 ? <p style={{ color: "var(--text2)" }}>当前业务范围没有待处理事项。</p> : <div style={{ display: "grid", gap: 10 }}>{items.map(item => <article key={item.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}><div><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className={item.priority === "critical" || item.priority === "high" ? "tag tag-amber" : "tag tag-blue"}>{PRIORITY_LABEL[item.priority]}</span><span className="tag tag-purple">{TYPE_LABEL[item.type] || item.type}</span><strong>{item.title}</strong></div><p style={{ color: "var(--text2)", margin: "7px 0 0", fontSize: ".8rem" }}>{item.status}{item.projectId ? ` · 项目 ${item.projectId}` : ""}{item.dueAt ? ` · 截止 ${item.dueAt}` : ""}</p></div><Link href={item.actionUrl} className="btn-primary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>进入处理</Link></article>)}</div>}</section>
      </>}
    </div>
  </main>;
}
