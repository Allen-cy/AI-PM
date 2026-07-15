"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { businessContextSearchParams, readStoredBusinessContext, readStoredDataClass, writeStoredBusinessContext, type StoredBusinessContext } from "@/features/operating-model/client-context";

type Item = { id: string; type: string; title: string; status: string; projectId: string | null; projectName: string | null; dueAt: string | null; priority: "critical" | "high" | "medium" | "low"; actionUrl: string; sourceId: string; sourceType: string; sourceUpdatedAt: string | null; dataClass: string; receiptStatus?: "unread" | "read" | "snoozed" | "acknowledged"; receiptVersion?: number };
type Payload = { items?: Item[]; summary?: { total: number; critical: number; high: number; medium: number; low: number; overdue: number; unread: number }; unavailable_sources?: Array<{ source: string; reason: string }>; error?: string; detail?: string };

const ROLE_LABEL: Record<string, string> = { pm: "项目经理", operations: "运营", pmo: "PMO", ceo: "CEO", sponsor: "项目发起人", business_owner: "业务负责人", finance: "财务", quality: "质量" };
const TYPE_LABEL: Record<string, string> = { risk: "风险", joint_check: "联合检查", operating_calendar: "运行日历", governance_approval: "治理审批", management_signal: "管理信号", ai_recommendation: "AI建议", decision_receipt: "决策回执", feishu_confirmation: "飞书确认", formal_output: "正式成果", cross_role_flow: "跨角色闭环", action: "行动项", closure_review: "收尾审批", benefit_review: "收益复核", correction: "人工纠偏", report_receipt: "汇报接收", evidence_review: "证据核验", data_quality: "数据纠偏", governance_action: "会后行动", capacity_conflict: "资源冲突", project_dependency: "项目依赖" };
const PRIORITY_LABEL = { critical: "立即处理", high: "高", medium: "中", low: "低" };

export default function CollaborationInboxPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [payload, setPayload] = useState<Payload>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

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

  async function updateReceipt(item: Item, status: "read" | "snoozed" | "acknowledged") {
    if (!context) return;
    setBusy(`${item.id}:${status}`); setNotice("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/collaboration-inbox?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_type: item.type, source_type: item.sourceType, source_id: item.sourceId, project_id: item.projectId,
          status, snooze_hours: status === "snoozed" ? 24 : undefined,
          expected_version: item.receiptVersion ?? 0,
          idempotency_key: `v640:inbox:${item.id}:${status}:${crypto.randomUUID()}`,
        }),
      });
      const body = await response.json() as { error?: string; detail?: string };
      if (!response.ok) throw new Error(body.detail || body.error || "收件箱状态保存失败");
      setNotice(status === "read" ? "已标记为已读。" : status === "snoozed" ? "已暂缓24小时。" : "已确认接收，业务处理仍需在对应模块完成。" );
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "收件箱状态保存失败"); }
    finally { setBusy(""); }
  }

  const items = payload.items ?? [];
  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><Link href="/" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回首页</Link><strong style={{ color: "var(--cyan)" }}>协作待办与审批收件箱</strong>{context && <span className="tag tag-purple">{ROLE_LABEL[context.businessRole] || context.businessRole} · {context.subjectScope}/{context.subjectId}</span>}<button className="btn-secondary" style={{ marginLeft: "auto" }} onClick={() => void load()}>刷新</button></header>
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ background: "linear-gradient(135deg,rgba(6,182,212,.15),rgba(59,130,246,.08))" }}><h1 style={{ fontSize: "1.45rem" }}>一个入口接收自己必须处理的事</h1><p style={{ color: "var(--text2)", lineHeight: 1.8, marginTop: 8 }}>按当前角色、业务范围和数据空间，聚合风险、联合检查、运行日历、治理审批、管理信号、AI建议、决策回执、飞书确认、正式成果和跨角色闭环；每项都可回到真实来源处理。除 PM、运营、PMO 和 CEO 外，既有发起人、业务负责人、财务和质量角色仍按授权范围使用同一收件箱。</p></section>
      {notice && <aside className="card" style={{ marginTop: 16, color: "var(--accent2)" }}>{notice}</aside>}
      {loading && <section className="card" style={{ marginTop: 16 }}>正在核对角色权限和真实待办……</section>}
      {!loading && payload.error && <section className="card" style={{ marginTop: 16, color: "var(--red)" }}>{payload.error}</section>}
      {!loading && !payload.error && <>
        {(payload.unavailable_sources?.length ?? 0) > 0 && <aside className="card" style={{ marginTop: 16, color: "var(--amber)" }}>部分待办源尚不可用：{payload.unavailable_sources?.map(item => item.source).join("、")}。系统未用样例数据补位。</aside>}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 16 }}>{[
          ["未读", payload.summary?.unread ?? 0], ["已逾期", payload.summary?.overdue ?? 0], ["立即处理", payload.summary?.critical ?? 0], ["高优先级", payload.summary?.high ?? 0], ["全部", payload.summary?.total ?? items.length],
        ].map(([label, value]) => <div className="stat-card" key={label}><div className="stat-num">{value}</div><div className="stat-label">{label}</div></div>)}</section>
        <section className="card" style={{ marginTop: 16 }}><div className="section-title">我的待办</div>{items.length === 0 ? <p style={{ color: "var(--text2)" }}>当前业务范围没有待处理事项。</p> : <div style={{ display: "grid", gap: 10 }}>{items.map(item => <article key={item.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface2)", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}><div style={{ minWidth: 240, flex: 1 }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span className={item.priority === "critical" || item.priority === "high" ? "tag tag-amber" : "tag tag-blue"}>{PRIORITY_LABEL[item.priority]}</span><span className="tag tag-purple">{TYPE_LABEL[item.type] || item.type}</span>{item.receiptStatus === "acknowledged" && <span className="tag tag-green">已接收</span>}<strong>{item.title}</strong></div><p style={{ color: "var(--text2)", margin: "7px 0 0", fontSize: ".8rem" }}>{item.status}{item.projectName ? ` · ${item.projectName}` : ""}{item.dueAt ? ` · 截止 ${item.dueAt}` : ""}{item.sourceUpdatedAt ? ` · 来源更新 ${new Date(item.sourceUpdatedAt).toLocaleString("zh-CN")}` : ""}</p></div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{(!item.receiptStatus || item.receiptStatus === "unread") && <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void updateReceipt(item, "read")}>{busy === `${item.id}:read` ? "保存中…" : "标记已读"}</button>}<button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void updateReceipt(item, "snoozed")}>暂缓24小时</button>{item.receiptStatus !== "acknowledged" && <button className="btn-secondary" disabled={Boolean(busy)} onClick={() => void updateReceipt(item, "acknowledged")}>确认接收</button>}<Link href={item.actionUrl} className="btn-primary" style={{ textDecoration: "none", whiteSpace: "nowrap" }}>进入处理</Link></div></article>)}</div>}</section>
      </>}
    </div>
  </main>;
}
