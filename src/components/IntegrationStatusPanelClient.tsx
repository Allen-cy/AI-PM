"use client";

import { useEffect, useState } from "react";
import { IntegrationStatusPanel, type IntegrationStatusItem } from "./IntegrationStatusPanel";

type IntegrationSnapshot = {
  checked_at: string;
  ai_model: { providerLabel: string; model: string; source: string; configured: boolean };
  feishu: {
    status: "ok" | "degraded" | "not_configured" | "error";
    source: string;
    table_count?: number;
    configured_table_count?: number;
    detail?: string;
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
};

type SyncLogSnapshot = {
  status: string;
  migration?: string;
  detail?: string;
  logs?: Array<unknown>;
};

function sourceLabel(source: string): string {
  if (source === "user") return "个人配置";
  if (source === "global") return "全局配置";
  if (source === "default") return "默认配置";
  return "未配置";
}

function buildItems(snapshot: IntegrationSnapshot, logs: SyncLogSnapshot | null): IntegrationStatusItem[] {
  const ragIndexVersion = snapshot.rag.indexVersion ?? snapshot.rag.index_version ?? "未知";
  const ragPageCount = snapshot.rag.pageCount ?? snapshot.rag.page_count ?? 0;
  const ragRetrievalMode = snapshot.rag.retrievalMode ?? snapshot.rag.retrieval_mode ?? "未知";
  return [
    {
      id: "ai-model",
      label: "AI 模型",
      status: snapshot.ai_model.configured ? "ok" : "not_configured",
      source: sourceLabel(snapshot.ai_model.source),
      detail: `${snapshot.ai_model.providerLabel} · ${snapshot.ai_model.model}${snapshot.ai_model.configured ? "，已配置密钥。" : "，缺少可用 API Key。"}`,
      nextAction: snapshot.ai_model.configured ? "可继续使用当前模型；如需验证个人模型，请到用户中心测试。" : "到用户中心配置并测试个人模型，或联系管理员补齐全局模型密钥。",
      href: "/account",
    },
    {
      id: "feishu",
      label: "飞书业务底座",
      status: snapshot.feishu.status,
      source: sourceLabel(snapshot.feishu.source),
      detail: snapshot.feishu.detail || `已配置 ${snapshot.feishu.configured_table_count ?? 0} 张表；Base 中识别 ${snapshot.feishu.table_count ?? 0} 张表。`,
      nextAction: snapshot.feishu.status === "ok" ? "飞书只读能力可用；写入动作需进入确认队列。" : "到用户中心补齐个人飞书配置，或到集成中心查看字段与权限诊断。",
      href: snapshot.feishu.status === "ok" ? "/integration-center" : "/account",
    },
    {
      id: "rag",
      label: "RAG 知识库",
      status: snapshot.rag.status,
      source: snapshot.rag.provider,
      detail: `索引 ${ragIndexVersion}；语料 ${ragPageCount} 篇；检索模式 ${ragRetrievalMode}。`,
      nextAction: snapshot.rag.status === "ok" ? "知识问答可用；实时业务数据问题仍按边界拒答。" : "检查 RAG 语料加载和健康接口。",
      href: "/knowledge",
    },
    {
      id: "sync-log",
      label: "同步审计",
      status: logs?.status || "unknown",
      source: "Supabase",
      detail: logs?.status === "succeeded" ? `最近同步日志 ${logs.logs?.length ?? 0} 条。` : logs?.detail || logs?.migration || "同步日志状态待检查。",
      nextAction: logs?.status === "succeeded" ? "审计日志可用；飞书写入确认和执行会留痕。" : "检查集成同步日志 SQL 和 Supabase service role 权限。",
      href: "/integration-center",
    },
  ];
}

export function IntegrationStatusPanelClient({ moduleName }: { moduleName: string }) {
  const [snapshot, setSnapshot] = useState<IntegrationSnapshot | null>(null);
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
        if (cancelled) return;
        setSnapshot(integrationData);
        setLogs(logsData);
      } catch {
        if (!cancelled) setError("无法读取统一集成状态，请到数据与集成中心查看详情。");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="card" style={{ marginBottom: 18, borderColor: "rgba(245,158,11,0.38)" }}>
        <div className="section-title">🧭 统一集成状态</div>
        <p style={{ color: "var(--amber)", lineHeight: 1.6 }}>{moduleName}：{error}</p>
        <a href="/integration-center" className="btn-secondary" style={{ display: "inline-flex", marginTop: 10, textDecoration: "none" }}>去集成中心</a>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="card" style={{ marginBottom: 18 }} aria-busy="true">
        <div className="section-title">🧭 统一集成状态</div>
        <p style={{ color: "var(--text2)", lineHeight: 1.6 }}>{moduleName} 正在检查 AI、飞书、RAG 和同步审计状态...</p>
      </section>
    );
  }

  return <IntegrationStatusPanel items={buildItems(snapshot, logs)} checkedAt={snapshot.checked_at} />;
}
