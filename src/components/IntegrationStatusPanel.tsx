"use client";

export type IntegrationStatus = "ok" | "succeeded" | "warning" | "degraded" | "not_configured" | "unknown" | "skipped" | "failed" | "error";

export interface IntegrationStatusItem {
  id: string;
  label: string;
  status: IntegrationStatus | string;
  source: string;
  detail: string;
  nextAction: string;
  href?: string;
}

const statusColor: Record<string, string> = {
  ok: "var(--green)",
  succeeded: "var(--green)",
  degraded: "var(--amber)",
  warning: "var(--amber)",
  not_configured: "var(--amber)",
  unknown: "var(--text2)",
  skipped: "var(--text2)",
  failed: "var(--red)",
  error: "var(--red)",
};

const statusText: Record<string, string> = {
  ok: "正常",
  succeeded: "正常",
  degraded: "需关注",
  warning: "需关注",
  not_configured: "未配置",
  unknown: "待检查",
  skipped: "已跳过",
  failed: "失败",
  error: "异常",
};

function StatusPill({ status }: { status: string }) {
  const color = statusColor[status] || "var(--text2)";
  return (
    <span className="tag" style={{ background: `${color}22`, color }}>
      {statusText[status] || status}
    </span>
  );
}

export function IntegrationStatusPanel({ items, checkedAt }: { items: IntegrationStatusItem[]; checkedAt?: string }) {
  const problemCount = items.filter(item => ["degraded", "warning", "not_configured", "failed", "error"].includes(item.status)).length;
  return (
    <section className="card" style={{ marginBottom: 18, borderColor: problemCount > 0 ? "rgba(245,158,11,0.38)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="section-title">🧭 统一集成状态</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
            统一展示当前账号实际使用的 AI、飞书、RAG 和同步审计状态，避免只在接口失败后才知道缺配置。
          </p>
        </div>
        <span className="tag" style={{ background: problemCount > 0 ? "rgba(245,158,11,0.16)" : "rgba(16,185,129,0.16)", color: problemCount > 0 ? "var(--amber)" : "var(--green)" }}>
          {problemCount > 0 ? `待处理 ${problemCount} 项` : "全部正常"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <strong>{item.label}</strong>
              <StatusPill status={item.status} />
            </div>
            <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>来源：{item.source}</p>
            <p style={{ color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 6 }}>{item.detail}</p>
            <p style={{ color: "var(--accent2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>{item.nextAction}</p>
            {item.href && (
              <a href={item.href} className="btn-secondary" style={{ display: "inline-flex", marginTop: 10, textDecoration: "none", padding: "7px 10px", fontSize: "0.76rem" }}>
                去处理
              </a>
            )}
          </div>
        ))}
      </div>

      {checkedAt && <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6, marginTop: 10 }}>最近检查：{checkedAt}</p>}
    </section>
  );
}
