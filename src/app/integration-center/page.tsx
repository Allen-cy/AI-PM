"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Snapshot = {
  checked_at: string;
  ai_model: { providerLabel: string; model: string; source: string; configured: boolean };
  feishu: {
    status: "ok" | "degraded" | "not_configured" | "error";
    source: string;
    table_count?: number;
    configured_table_count?: number;
    missing_required_tables?: string[];
    detail?: string;
    code?: string;
  };
  rag: {
    status: string;
    provider: string;
    indexVersion?: string;
    index_version?: string;
    pageCount?: number;
    page_count?: number;
    retrievalMode?: string;
    retrieval_mode?: string;
  };
  dependencies: Array<{ key: string; name: string; category: string; description: string; owner: string; action: string }>;
  data_quality_rules: Array<{ id: string; name: string; scope: string; severity: string; description: string; nextAction: string }>;
};

const statusColor: Record<string, string> = {
  ok: "var(--green)",
  succeeded: "var(--green)",
  degraded: "var(--amber)",
  warning: "var(--amber)",
  not_configured: "var(--amber)",
  error: "var(--red)",
};

const statusText: Record<string, string> = {
  ok: "正常",
  succeeded: "正常",
  degraded: "需关注",
  not_configured: "未配置",
  error: "异常",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className="tag" style={{ background: `${statusColor[status] || "var(--text2)"}22`, color: statusColor[status] || "var(--text2)" }}>
      {statusText[status] || status}
    </span>
  );
}

export default function IntegrationCenterPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/operating-system/integrations", { cache: "no-store" });
        const data = await response.json();
        if (!cancelled) setSnapshot(data);
      } catch {
        if (!cancelled) setError("无法读取集成状态，请稍后重试。");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const ragIndexVersion = snapshot?.rag.indexVersion ?? snapshot?.rag.index_version ?? "未知";
  const ragPageCount = snapshot?.rag.pageCount ?? snapshot?.rag.page_count ?? 0;
  const ragRetrievalMode = snapshot?.rag.retrievalMode ?? snapshot?.rag.retrieval_mode ?? "未知";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "28px 32px" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--accent2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ fontSize: "1.9rem", fontWeight: 800, marginTop: 12 }}>数据与集成中心</h1>
            <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.7 }}>
              统一检查飞书、Supabase、AI 模型和 RAG 知识库状态。这里不展示任何密钥，只展示脱敏运行状态。
            </p>
          </div>
          <Link href="/account" className="btn-secondary" style={{ textDecoration: "none" }}>用户配置</Link>
        </div>

        {error && <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", marginBottom: 18 }}>{error}</div>}

        {!snapshot ? (
          <div className="card" aria-busy="true">正在检查系统依赖...</div>
        ) : (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 18 }}>
              <div className="card">
                <div className="section-title">🤖 AI 模型</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{snapshot.ai_model.providerLabel} · {snapshot.ai_model.model}</div>
                <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.6 }}>
                  来源：{snapshot.ai_model.source === "user" ? "用户配置" : snapshot.ai_model.source === "global" ? "系统配置" : "默认模型"}
                  {!snapshot.ai_model.configured ? "；待补充 API Key" : "；已配置"}
                </p>
              </div>

              <div className="card">
                <div className="section-title">📊 飞书业务底座 <StatusPill status={snapshot.feishu.status} /></div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>
                  {snapshot.feishu.configured_table_count ?? 0} / {snapshot.feishu.table_count ?? 0} 张表
                </div>
                <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.6 }}>
                  来源：{snapshot.feishu.source === "user" ? "个人配置" : snapshot.feishu.source === "global" ? "全局配置" : "未配置"}
                </p>
                {snapshot.feishu.detail && <p style={{ color: "var(--amber)", marginTop: 8, lineHeight: 1.6 }}>{snapshot.feishu.detail}</p>}
              </div>

              <div className="card">
                <div className="section-title">📚 RAG 知识库 <StatusPill status={snapshot.rag.status} /></div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800 }}>{ragPageCount} 篇语料</div>
                <p style={{ color: "var(--text2)", marginTop: 8, lineHeight: 1.6 }}>
                  索引：{ragIndexVersion}；模式：{ragRetrievalMode}
                </p>
              </div>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🧭 系统依赖清单</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
                {snapshot.dependencies.map(item => (
                  <div key={item.key} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                      <strong>{item.name}</strong>
                      <span className="tag tag-blue">{item.owner}</span>
                    </div>
                    <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6 }}>{item.description}</p>
                    <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 10 }}>{item.action}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="section-title">🧪 数据质量规则</div>
              <div style={{ display: "grid", gap: 10 }}>
                {snapshot.data_quality_rules.map(rule => (
                  <div key={rule.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 2fr 1.6fr", gap: 12, alignItems: "center", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                    <strong>{rule.name}</strong>
                    <span className={rule.severity === "high" ? "tag tag-amber" : "tag tag-blue"} style={{ justifySelf: "start" }}>{rule.scope}</span>
                    <span style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.5 }}>{rule.description}</span>
                    <span style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.5 }}>{rule.nextAction}</span>
                  </div>
                ))}
              </div>
            </section>

            <p style={{ color: "var(--text2)", fontSize: "0.76rem", marginTop: 14 }}>
              最近检查时间：{new Date(snapshot.checked_at).toLocaleString("zh-CN")}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
