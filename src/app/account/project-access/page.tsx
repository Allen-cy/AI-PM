"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccessRequest = {
  id: string;
  project_name?: string | null;
  project_code?: string | null;
  access_level: "viewer" | "editor" | "owner";
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewer_name?: string | null;
  review_comment?: string | null;
  related_grant_id?: string | null;
  created_at?: string;
  reviewed_at?: string | null;
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 18,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--text2)",
  fontSize: "0.76rem",
  marginBottom: 6,
};

function StatusTag({ value }: { value: string }) {
  const color = value === "approved" ? "var(--green)" : value === "rejected" ? "var(--red)" : value === "pending" ? "var(--amber)" : "var(--text2)";
  return <span className="tag" style={{ color, background: `${color}22` }}>{value}</span>;
}

export default function ProjectAccessRequestPage() {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    projectName: "",
    projectCode: "",
    accessLevel: "viewer" as AccessRequest["access_level"],
    reason: "",
  });

  async function loadRequests() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/user/project-access-requests", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "加载申请记录失败");
      setRequests(data.requests || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载申请记录失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submitRequest() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/user/project-access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "提交申请失败");
      setMessage("项目访问申请已提交，请等待管理员审批。");
      setDraft({ projectName: "", projectCode: "", accessLevel: "viewer", reason: "" });
      await loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "提交申请失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: "var(--surface)",
      }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <Link href="/account" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>用户中心</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <strong style={{ color: "var(--accent2)" }}>🔐 项目访问申请</strong>
        <span className="tag tag-blue">P10</span>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 32px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.45rem", fontWeight: 900 }}>申请访问非本人负责的项目</h1>
        <p style={{ margin: "0 0 20px", color: "var(--text2)", lineHeight: 1.7 }}>
          普通用户默认只能查看本人负责或管理员授权的项目。如需临时参与验收、风险处理或经营复核，可提交项目访问申请，由管理员审批后生效。
        </p>

        {(message || error) && (
          <div style={{
            ...cardStyle,
            marginBottom: 18,
            color: error ? "var(--red)" : "var(--green)",
            borderColor: error ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.35)",
            fontWeight: 800,
          }}>
            {error || message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 18, alignItems: "start" }}>
          <section style={cardStyle}>
            <h2 style={{ margin: "0 0 14px", fontSize: "1rem" }}>提交申请</h2>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelStyle}>项目名称</span>
              <input className="input" value={draft.projectName} onChange={event => setDraft(prev => ({ ...prev, projectName: event.target.value }))} placeholder="如：智慧校园一期" />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelStyle}>项目编号</span>
              <input className="input" value={draft.projectCode} onChange={event => setDraft(prev => ({ ...prev, projectCode: event.target.value }))} placeholder="可选，如：PMO-2026-001" />
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelStyle}>申请级别</span>
              <select className="input" value={draft.accessLevel} onChange={event => setDraft(prev => ({ ...prev, accessLevel: event.target.value as AccessRequest["access_level"] }))}>
                <option value="viewer">viewer - 只读查看</option>
                <option value="editor">editor - 协同编辑</option>
                <option value="owner">owner - 临时负责</option>
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={labelStyle}>申请原因</span>
              <textarea className="input" rows={5} value={draft.reason} onChange={event => setDraft(prev => ({ ...prev, reason: event.target.value }))} placeholder="说明为什么需要访问，例如：参与验收复核、协助处理风险、财务回款分析。" />
            </label>
            <button className="btn-primary" onClick={() => void submitRequest()} disabled={saving}>
              {saving ? "提交中..." : "提交访问申请"}
            </button>
          </section>

          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>我的申请记录</h2>
              <button className="btn-secondary" onClick={() => void loadRequests()} disabled={loading}>{loading ? "刷新中..." : "刷新"}</button>
            </div>
            {loading && <div style={{ color: "var(--text2)" }}>正在加载...</div>}
            {!loading && requests.length === 0 && <div style={{ color: "var(--text2)" }}>暂无申请记录。</div>}
            <div style={{ display: "grid", gap: 10 }}>
              {requests.map(item => (
                <div key={item.id} style={{ padding: 12, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{item.project_name || item.project_code}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 4 }}>{item.access_level} · {item.created_at ? new Date(item.created_at).toLocaleString("zh-CN") : ""}</div>
                    </div>
                    <StatusTag value={item.status} />
                  </div>
                  <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 8 }}>{item.reason}</div>
                  {(item.reviewer_name || item.review_comment) && (
                    <div style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 8 }}>
                      审批人：{item.reviewer_name || "-"}；意见：{item.review_comment || "-"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
