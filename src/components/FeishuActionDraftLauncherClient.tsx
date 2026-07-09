"use client";

import { useState } from "react";

type LauncherResponse = {
  status: string;
  warning?: string;
  migration?: string;
  confirmation?: {
    id: string;
    targetSummary: string;
    status: string;
  };
};

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_\-:/]/g, "-").slice(0, 96);
}

function splitBullets(value: string): string[] | undefined {
  const bullets = value
    .split(/\n+/)
    .map(item => item.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  return bullets.length > 0 ? bullets : undefined;
}

export function FeishuActionDraftLauncherClient({
  moduleName,
  sourcePage,
  defaultTitle,
  defaultSummary,
  defaultBullets,
}: {
  moduleName: string;
  sourcePage: string;
  defaultTitle: string;
  defaultSummary: string;
  defaultBullets?: string[];
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [summary, setSummary] = useState(defaultSummary);
  const [bullets, setBullets] = useState((defaultBullets ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function createDraft() {
    if (!title.trim() || !summary.trim()) {
      setMessage("请先填写飞书文档标题和摘要。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/feishu/actions/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "integration_center",
          sourcePage,
          payload: {
            type: "document",
            idempotency_key: `${safeId(sourcePage)}:${safeId(moduleName)}:${Date.now()}`,
            title: title.trim(),
            summary: summary.trim(),
            bullets: splitBullets(bullets),
          },
        }),
      });
      const data = await response.json() as LauncherResponse;
      setMessage(response.ok
        ? `已创建飞书写入确认记录：${data.confirmation?.targetSummary || title}。请到集成中心复核后执行。`
        : data.warning || data.migration || "飞书写入确认记录创建失败。");
    } catch {
      setMessage("飞书写入确认记录创建请求失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: "rgba(14,165,233,0.24)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="section-title">📝 发起飞书确认记录</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
            {moduleName} 中需要沉淀到飞书的结论，可先创建“待确认文档”记录；系统不会直接写入飞书，需到集成中心复核后执行。
          </p>
        </div>
        <a href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>去集成中心</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.9fr) minmax(280px, 1.2fr)", gap: 10, alignItems: "start" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>飞书文档标题</span>
          <input className="input" value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>摘要</span>
          <textarea className="input" rows={3} value={summary} onChange={event => setSummary(event.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
          <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>要点，每行一条</span>
          <textarea className="input" rows={3} value={bullets} onChange={event => setBullets(event.target.value)} />
        </label>
      </div>

      <button className="btn-primary" type="button" disabled={busy} onClick={() => void createDraft()} style={{ marginTop: 12 }}>
        {busy ? "创建中..." : "创建飞书待确认文档"}
      </button>
      {message && (
        <p style={{ color: message.includes("失败") || message.includes("未创建") ? "var(--amber)" : "var(--accent2)", lineHeight: 1.6, marginTop: 10 }}>
          {message}
        </p>
      )}
    </section>
  );
}
