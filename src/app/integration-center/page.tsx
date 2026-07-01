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
  field_mapping_checks: Array<{
    tableKey: string;
    tableName: string;
    status: string;
    configured: boolean;
    requiredFields: string[];
    presentFields: string[];
    missingFields: string[];
    remediation: string;
    detail?: string;
  }>;
  data_quality_checks: Array<{
    id: string;
    name: string;
    scope: string;
    severity: string;
    status: string;
    affectedCount: number;
    sampleRefs: string[];
    remediation: string;
    evidence: string;
  }>;
  diagnostics: Array<{
    id: string;
    source: string;
    severity: string;
    title: string;
    detail: string;
    actions: string[];
  }>;
  sync_log_write: { status: string; reason?: string; id?: string };
};

type SyncLogSnapshot = {
  status: string;
  migration?: string;
  detail?: string;
  logs: Array<{
    id: string;
    source: string;
    eventType: string;
    status: string;
    severity: string;
    summary: string;
    remediation?: string;
    createdAt: string;
  }>;
};

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
  return (
    <span className="tag" style={{ background: `${statusColor[status] || "var(--text2)"}22`, color: statusColor[status] || "var(--text2)" }}>
      {statusText[status] || status}
    </span>
  );
}

export default function IntegrationCenterPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<SyncLogSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [integrationResponse, logsResponse] = await Promise.all([
          fetch("/api/operating-system/integrations", { cache: "no-store" }),
          fetch("/api/operating-system/sync-logs", { cache: "no-store" }),
        ]);
        const [integrationData, logsData] = await Promise.all([
          integrationResponse.json(),
          logsResponse.json(),
        ]);
        if (!cancelled) {
          setSnapshot(integrationData);
          setLogs(logsData);
        }
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

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🛠️ 故障诊断建议</div>
              {snapshot.diagnostics.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>当前没有阻断性诊断建议。仍建议定期检查字段映射和数据质量。</p>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {snapshot.diagnostics.map(item => (
                    <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <strong>{item.title}</strong>
                        <span className={item.severity === "high" ? "tag tag-amber" : "tag tag-blue"}>{item.severity === "high" ? "高优先级" : item.severity === "medium" ? "中优先级" : "低优先级"}</span>
                        <span className="tag">{item.source}</span>
                      </div>
                      <p style={{ color: "var(--text2)", lineHeight: 1.6, marginTop: 8 }}>{item.detail}</p>
                      <ul style={{ color: "var(--accent2)", margin: "10px 0 0 18px", lineHeight: 1.7 }}>
                        {item.actions.map(action => <li key={action}>{action}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🧩 字段映射检查</div>
              <div style={{ display: "grid", gap: 12 }}>
                {snapshot.field_mapping_checks.map(check => (
                  <div key={check.tableKey} style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center" }}>
                      <div>
                        <strong>{check.tableName}</strong>
                        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 4 }}>
                          已识别字段 {check.presentFields.length} 个；要求字段 {check.requiredFields.length} 个。
                        </p>
                      </div>
                      <StatusPill status={check.status} />
                      <span className="tag">{check.configured ? "已配置表ID" : "未配置表ID"}</span>
                    </div>
                    {check.missingFields.length > 0 && (
                      <p style={{ color: "var(--amber)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                        缺少字段：{check.missingFields.join("、")}
                      </p>
                    )}
                    {check.detail && (
                      <p style={{ color: "var(--red)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>错误：{check.detail}</p>
                    )}
                    <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>{check.remediation}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card" style={{ marginBottom: 18 }}>
              <div className="section-title">🔎 实时数据质量扫描</div>
              <div style={{ display: "grid", gap: 10 }}>
                {snapshot.data_quality_checks.map(check => (
                  <div key={check.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "start", padding: "12px 0", borderTop: "1px solid var(--border)" }}>
                    <div>
                      <strong>{check.name}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 4 }}>{check.evidence}</p>
                      {check.sampleRefs.length > 0 && (
                        <p style={{ color: "var(--amber)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 4 }}>
                          样例：{check.sampleRefs.join("、")}
                        </p>
                      )}
                      <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 4 }}>{check.remediation}</p>
                    </div>
                    <StatusPill status={check.status} />
                    <span className={check.severity === "high" ? "tag tag-amber" : "tag tag-blue"}>{check.affectedCount} 条</span>
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

            <section className="card" style={{ marginTop: 18 }}>
              <div className="section-title">📜 同步日志</div>
              {!logs ? (
                <p style={{ color: "var(--text2)" }}>正在读取同步日志...</p>
              ) : logs.status !== "succeeded" ? (
                <div>
                  <p style={{ color: "var(--amber)", lineHeight: 1.7 }}>
                    日志状态：{statusText[logs.status] || logs.status}。{logs.migration ? `请执行：${logs.migration}` : logs.detail}
                  </p>
                  <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 8 }}>
                    本次检查写入状态：{statusText[snapshot.sync_log_write.status] || snapshot.sync_log_write.status}
                    {snapshot.sync_log_write.reason ? `；${snapshot.sync_log_write.reason}` : ""}
                  </p>
                </div>
              ) : logs.logs.length === 0 ? (
                <p style={{ color: "var(--text2)" }}>暂无历史同步日志。本页刷新后会产生新的检查记录。</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {logs.logs.slice(0, 8).map(log => (
                    <div key={log.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
                      <StatusPill status={log.status} />
                      <div>
                        <strong>{log.summary}</strong>
                        {log.remediation && <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 4 }}>{log.remediation}</p>}
                      </div>
                      <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                  ))}
                </div>
              )}
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
