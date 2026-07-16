"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IntegrationStatusPanel, type IntegrationStatusItem } from "@/components/IntegrationStatusPanel";
import { loadCurrentBusinessContextSearchParams } from "@/features/operating-model/client-context";

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

type FeishuReconcileSnapshot = {
  status: string;
  error?: string;
  detail?: string;
  source?: { type?: string; label?: string; mirror?: string };
  data_class?: string;
  generated_at?: string;
  warnings?: string[];
  data?: {
    latest_batch?: {
      id: string;
      status: string;
      requested_domains: string[];
      completed_domains: string[];
      total_records: number;
      inserted_records: number;
      updated_records: number;
      unchanged_records: number;
      tombstoned_records: number;
      quarantined_records: number;
      failed_records: number;
      completed_at?: string | null;
      updated_at?: string | null;
    } | null;
    cursors?: Array<{
      domain: string;
      source_record_count: number;
      last_source_updated_at?: string | null;
      last_succeeded_at?: string | null;
    }>;
    quality?: {
      status: string;
      pending_quarantine_count: number;
    };
    freshness?: {
      latest_source_updated_at?: string | null;
      last_succeeded_at?: string | null;
    };
    batch_id?: string;
    counts?: Record<string, number>;
    domains?: Array<{ domain: string; source_records: number; quarantined: number }>;
  };
};

type FeishuActionConfirmationSnapshot = {
  status: string;
  warning?: string;
  migration?: string;
  summary?: {
    totalCount: number;
    pendingCount: number;
    failedCount: number;
    highRiskPendingCount: number;
    overduePendingCount: number;
    requiresSecondConfirmCount: number;
    reminderDrafts: Array<{
      id: string;
      priority: "P0" | "P1" | "P2";
      title: string;
      detail: string;
      nextAction: string;
      targetSummary: string;
    }>;
  };
  confirmations: Array<{
    id: string;
    requesterName?: string | null;
    source: string;
    sourcePage?: string | null;
    actionType: string;
    targetSummary: string;
    riskLevel: string;
    status: string;
    preview: {
      targetType: string;
      targetSummary: string;
      riskReasons: string[];
      fields: Array<{ label: string; value: string }>;
    };
    riskReview?: {
      riskLevel: "low" | "medium" | "high";
      baseRiskLevel: "low" | "medium" | "high";
      canConfirm: boolean;
      canCancel: boolean;
      requiresSecondConfirm: boolean;
      ageDays: number | null;
      blockingIssues: string[];
      warnings: string[];
      checklist: Array<{ id: string; label: string; status: "pass" | "warning" | "block"; detail: string }>;
      suggestedAction: "confirm" | "review" | "cancel";
    };
    errorCode?: string | null;
    cancelReason?: string | null;
    createdAt: string;
    writebackAttemptCount?: number;
    writebackLeaseExpiresAt?: string | null;
  }>;
};

type FeishuBatchRiskReview = {
  selectedCount: number;
  confirmableCount: number;
  blockedCount: number;
  highRiskCount: number;
  requiresSecondConfirmCount: number;
  confirmableIds: string[];
  blockedIds: string[];
  inaccessibleIds?: string[];
  missingIds?: string[];
  warnings: string[];
  blockingIssues: string[];
  decisionText: string;
};

const statusColor: Record<string, string> = {
  ok: "var(--green)",
  succeeded: "var(--green)",
  degraded: "var(--amber)",
  warning: "var(--amber)",
  not_configured: "var(--amber)",
  pending_confirmation: "var(--amber)",
  writing: "var(--cyan)",
  cancelled: "var(--text2)",
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
  pending_confirmation: "待确认",
  writing: "写入中",
  cancelled: "已取消",
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

function canCancelFeishuAction(status: string): boolean {
  return !["succeeded", "writing", "cancelled"].includes(status);
}

function canConfirmFeishuAction(item: FeishuActionConfirmationSnapshot["confirmations"][number]): boolean {
  return item.status === "pending_confirmation"
    || item.status === "failed"
    || (item.status === "writing" && item.riskReview?.canConfirm === true);
}

function riskLabel(value: string): string {
  if (value === "high") return "高风险";
  if (value === "medium") return "中风险";
  return "低风险";
}

function riskColor(value: string): string {
  if (value === "high") return "var(--red)";
  if (value === "medium") return "var(--amber)";
  return "var(--accent2)";
}

export default function IntegrationCenterPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [logs, setLogs] = useState<SyncLogSnapshot | null>(null);
  const [confirmations, setConfirmations] = useState<FeishuActionConfirmationSnapshot | null>(null);
  const [reconcile, setReconcile] = useState<FeishuReconcileSnapshot | null>(null);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState("");
  const [confirmationBusyId, setConfirmationBusyId] = useState("");
  const [confirmationStatusFilter, setConfirmationStatusFilter] = useState("all");
  const [confirmationSearch, setConfirmationSearch] = useState(() => (
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("confirmation_id")?.trim() || ""
  ));
  const [selectedConfirmationIds, setSelectedConfirmationIds] = useState<string[]>([]);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [error, setError] = useState("");

  async function loadConfirmations(status = confirmationStatusFilter) {
    const params = new URLSearchParams({ status, limit: "50" });
    const response = await fetch(`/api/integrations/feishu/actions/confirmations?${params.toString()}`, { cache: "no-store" });
    const data = await response.json();
    setConfirmations(data);
    setSelectedConfirmationIds([]);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const context = await loadCurrentBusinessContextSearchParams({ preferredRole: "pmo", preferredSubjectScope: "organization" });
        context.set("business_role", context.get("role") || "pmo");
        context.delete("role");
        context.delete("project_id");
        const [integrationResponse, logsResponse, confirmationsResponse, reconcileResponse] = await Promise.all([
          fetch("/api/operating-system/integrations", { cache: "no-store" }),
          fetch("/api/operating-system/sync-logs", { cache: "no-store" }),
          fetch("/api/integrations/feishu/actions/confirmations?status=all&limit=20", { cache: "no-store" }),
          fetch(`/api/integrations/feishu/reconcile?${context.toString()}`, { cache: "no-store" }),
        ]);
        const [integrationData, logsData, confirmationData, reconcileData] = await Promise.all([
          integrationResponse.json(),
          logsResponse.json(),
          confirmationsResponse.json(),
          reconcileResponse.json(),
        ]);
        if (!cancelled) {
          setSnapshot(integrationData);
          setLogs(logsData);
          setConfirmations(confirmationData);
          setReconcile(reconcileData);
          setSelectedConfirmationIds([]);
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

  async function runReconcile() {
    if (!window.confirm("系统将从飞书八类业务表读取完整快照，与 Supabase 镜像做幂等对账；飞书原记录不会被修改。是否继续？")) return;
    setReconcileBusy(true);
    setReconcileMessage("");
    try {
      const context = await loadCurrentBusinessContextSearchParams({ preferredRole: "pmo", preferredSubjectScope: "organization" });
      const idempotencyKey = `manual:${crypto.randomUUID()}`;
      const response = await fetch("/api/integrations/feishu/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: context.get("org_id"),
          subject_scope: context.get("subject_scope"),
          subject_id: context.get("subject_id"),
          business_role: context.get("role"),
          data_class: context.get("data_class") || "production",
          idempotency_key: idempotencyKey,
          expected_version: 0,
          source_checkpoint: idempotencyKey,
          domains: ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"],
        }),
      });
      const data = await response.json() as FeishuReconcileSnapshot;
      if (response.ok) {
        const refresh = new URLSearchParams({
          org_id: context.get("org_id") || "",
          subject_scope: context.get("subject_scope") || "",
          subject_id: context.get("subject_id") || "",
          business_role: context.get("role") || "",
          data_class: context.get("data_class") || "production",
        });
        const refreshed = await fetch(`/api/integrations/feishu/reconcile?${refresh.toString()}`, { cache: "no-store" });
        setReconcile(await refreshed.json());
        setReconcileMessage("飞书真实数据对账已完成。");
      } else {
        setReconcile(data);
        setReconcileMessage(data.detail || "飞书真实数据对账失败。");
      }
    } catch {
      setReconcileMessage("飞书真实数据对账请求失败，请稍后重试。");
    } finally {
      setReconcileBusy(false);
    }
  }

  async function confirmFeishuAction(item: FeishuActionConfirmationSnapshot["confirmations"][number]) {
    const riskReview = item.riskReview;
    const riskLines = [
      `目标：${item.targetSummary}`,
      `风险：${riskLabel(riskReview?.riskLevel || item.riskLevel)}`,
      ...(riskReview?.requiresSecondConfirm ? ["该动作需要二次风险确认。"] : []),
      ...(riskReview?.blockingIssues.length ? [`阻断项：${riskReview.blockingIssues.join("；")}`] : []),
      ...(riskReview?.warnings.length ? [`提示：${riskReview.warnings.slice(0, 4).join("；")}`] : []),
    ];
    if (riskReview && !riskReview.canConfirm) {
      setConfirmationMessage(riskReview.blockingIssues[0] || "该动作风险复核未通过，不能确认执行。");
      return;
    }
    if (!window.confirm(`${riskLines.join("\n")}\n\n确认后系统会使用当前账号的有效飞书配置执行该写入动作，并写入同步流水。是否继续？`)) return;
    setConfirmationBusyId(item.id);
    setConfirmationMessage("");
    try {
      const response = await fetch(`/api/integrations/feishu/actions/confirmations/${item.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, riskAcknowledged: true }),
      });
      const data = await response.json();
      setConfirmationMessage(response.ok ? "飞书写入已确认执行。" : data.warning || "飞书写入确认失败。");
      await loadConfirmations();
    } catch {
      setConfirmationMessage("飞书写入确认请求失败，请稍后重试。");
    } finally {
      setConfirmationBusyId("");
    }
  }

  async function reviewFeishuBatch(ids: string[]): Promise<FeishuBatchRiskReview | null> {
    const response = await fetch("/api/integrations/feishu/actions/confirmations/batch-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await response.json();
    if (!response.ok || data.status !== "succeeded") {
      setConfirmationMessage(data.warning || "批量确认前风险复核失败。");
      return null;
    }
    return data.batchReview as FeishuBatchRiskReview;
  }

  async function batchConfirmFeishuActions() {
    const ids = selectedConfirmationIds.filter(id => confirmations?.confirmations.some(item => item.id === id && canConfirmFeishuAction(item)));
    if (ids.length === 0) {
      setConfirmationMessage("请先勾选待确认或失败可重试的飞书写入动作。");
      return;
    }
    setConfirmationBusyId("batch-confirm-review");
    setConfirmationMessage("");
    try {
      const review = await reviewFeishuBatch(ids);
      if (!review) return;
      if (review.confirmableCount === 0) {
        setConfirmationMessage(review.blockingIssues[0] || "本次选择没有可批量确认的记录。");
        return;
      }
      const warningLines = [
        review.decisionText,
        ...(review.blockingIssues.length ? [`阻断项：${review.blockingIssues.join("；")}`] : []),
        ...(review.warnings.length ? [`风险提示：${review.warnings.slice(0, 6).join("；")}`] : []),
      ];
      if (!window.confirm(`${warningLines.join("\n")}\n\n将仅确认可执行的 ${review.confirmableCount} 条记录。是否继续？`)) return;

      setConfirmationBusyId("batch-confirm");
      let successCount = 0;
      let failedCount = 0;
      for (const id of review.confirmableIds) {
        const response = await fetch(`/api/integrations/feishu/actions/confirmations/${id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true, riskAcknowledged: true }),
        });
        if (response.ok) successCount += 1;
        else failedCount += 1;
      }
      setConfirmationMessage(`批量确认完成：成功 ${successCount} 条，失败 ${failedCount} 条；复核阻断 ${review.blockedCount} 条。`);
      await loadConfirmations();
    } catch {
      setConfirmationMessage("批量确认请求失败，请稍后重试。");
    } finally {
      setConfirmationBusyId("");
    }
  }

  async function cancelFeishuAction(id: string) {
    const reason = window.prompt("请输入取消原因，可留空：") || "用户取消飞书写入。";
    setConfirmationBusyId(id);
    setConfirmationMessage("");
    try {
      const response = await fetch(`/api/integrations/feishu/actions/confirmations/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json();
      setConfirmationMessage(response.ok ? "飞书写入已取消。" : data.warning || "取消飞书写入失败。");
      await loadConfirmations();
    } catch {
      setConfirmationMessage("取消请求失败，请稍后重试。");
    } finally {
      setConfirmationBusyId("");
    }
  }

  async function batchCancelFeishuActions() {
    const ids = selectedConfirmationIds.filter(id => confirmations?.confirmations.some(item => item.id === id && canCancelFeishuAction(item.status)));
    if (ids.length === 0) {
      setConfirmationMessage("请先勾选可取消的飞书写入动作。");
      return;
    }
    const reason = window.prompt(`将批量取消 ${ids.length} 条飞书写入动作，请输入取消原因：`) || "用户批量取消飞书写入。";
    setConfirmationBusyId("batch");
    setConfirmationMessage("");
    try {
      let successCount = 0;
      let failedCount = 0;
      for (const id of ids) {
        const response = await fetch(`/api/integrations/feishu/actions/confirmations/${id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        if (response.ok) successCount += 1;
        else failedCount += 1;
      }
      setConfirmationMessage(`批量取消完成：成功 ${successCount} 条，失败 ${failedCount} 条。`);
      await loadConfirmations();
    } catch {
      setConfirmationMessage("批量取消请求失败，请稍后重试。");
    } finally {
      setConfirmationBusyId("");
    }
  }

  const ragIndexVersion = snapshot?.rag.indexVersion ?? snapshot?.rag.index_version ?? "未知";
  const ragPageCount = snapshot?.rag.pageCount ?? snapshot?.rag.page_count ?? 0;
  const ragRetrievalMode = snapshot?.rag.retrievalMode ?? snapshot?.rag.retrieval_mode ?? "未知";
  const confirmationRows = confirmations?.confirmations ?? [];
  const confirmationKeyword = confirmationSearch.trim().toLowerCase();
  const visibleConfirmations = confirmationRows.filter(item => {
    if (!confirmationKeyword) return true;
    return [
      item.id,
      item.targetSummary,
      item.actionType,
      item.source,
      item.sourcePage || "",
      item.requesterName || "",
      item.status,
      item.preview.targetType,
      ...item.preview.fields.map(field => `${field.label}:${field.value}`),
    ].join(" ").toLowerCase().includes(confirmationKeyword);
  });
  const selectableConfirmationIds = visibleConfirmations.filter(item => canCancelFeishuAction(item.status) || canConfirmFeishuAction(item)).map(item => item.id);
  const selectedVisibleConfirmationIds = selectedConfirmationIds.filter(id => selectableConfirmationIds.includes(id));
  const confirmableConfirmationIds = visibleConfirmations.filter(item => canConfirmFeishuAction(item)).map(item => item.id);
  const selectedConfirmableConfirmationIds = selectedConfirmationIds.filter(id => confirmableConfirmationIds.includes(id));
  const cancellableConfirmationIds = visibleConfirmations.filter(item => canCancelFeishuAction(item.status)).map(item => item.id);
  const selectedCancellableConfirmationIds = selectedConfirmationIds.filter(id => cancellableConfirmationIds.includes(id));
  const confirmationSummary = confirmations?.summary;
  const statusItems: IntegrationStatusItem[] = snapshot ? [
    {
      id: "ai-model",
      label: "AI 模型",
      status: snapshot.ai_model.configured ? "ok" : "not_configured",
      source: snapshot.ai_model.source === "user" ? "用户配置" : snapshot.ai_model.source === "global" ? "系统配置" : "默认模型",
      detail: `${snapshot.ai_model.providerLabel} · ${snapshot.ai_model.model}${snapshot.ai_model.configured ? "，已配置密钥。" : "，缺少可用 API Key。"}`,
      nextAction: snapshot.ai_model.configured ? "如需验证个人模型，请到用户中心点击“测试AI模型”。" : "到用户中心配置并测试个人模型，或联系管理员补齐全局模型密钥。",
      href: "/account",
    },
    {
      id: "feishu",
      label: "飞书业务底座",
      status: snapshot.feishu.status,
      source: snapshot.feishu.source === "user" ? "个人配置" : snapshot.feishu.source === "global" ? "全局配置" : "未配置",
      detail: snapshot.feishu.detail || `已配置 ${snapshot.feishu.configured_table_count ?? 0} 张表；Base 中识别 ${snapshot.feishu.table_count ?? 0} 张表。`,
      nextAction: snapshot.feishu.status === "ok" ? "如需验证字段和写入权限，请到用户中心执行飞书连接测试。" : "到用户中心补齐个人飞书 App、Base Token、表 ID，并执行连接测试。",
      href: "/account",
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
      detail: logs?.status === "succeeded" ? `最近同步日志 ${logs.logs.length} 条。` : logs?.detail || logs?.migration || "同步日志状态待检查。",
      nextAction: logs?.status === "succeeded" ? "同步审计可用，继续保持写入动作留痕。" : "检查集成同步日志 SQL 和 Supabase 权限。",
      href: "/integration-center",
    },
  ] : [];

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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/integration-center/organization-feishu" className="btn-secondary" style={{ textDecoration: "none" }}>组织飞书连接</Link>
            <Link href="/migration-center" className="btn-secondary" style={{ textDecoration: "none" }}>迁移与数据接入</Link>
            <Link href="/account" className="btn-secondary" style={{ textDecoration: "none" }}>用户配置</Link>
          </div>
        </div>

        {error && <div className="card" style={{ borderColor: "var(--red)", color: "var(--red)", marginBottom: 18 }}>{error}</div>}

        {!snapshot ? (
          <div className="card" aria-busy="true">正在检查系统依赖...</div>
        ) : (
          <>
            <IntegrationStatusPanel items={statusItems} checkedAt={snapshot.checked_at} />

            <section className="card" style={{ marginBottom: 18, borderColor: reconcile?.data?.quality?.status === "attention" ? "rgba(245,158,11,0.38)" : "var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div>
                  <div className="section-title">🔄 飞书真实数据对账</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.7, fontSize: "0.84rem", maxWidth: 760 }}>
                    飞书是业务事实源，Supabase 是稳定镜像、权限、审计与分析底座。对账覆盖项目、里程碑、任务、风险、合同、回款、成本和同步账本，不按项目名称关联。
                  </p>
                </div>
                <button className="btn-primary" type="button" disabled={reconcileBusy} onClick={() => void runReconcile()}>
                  {reconcileBusy ? "正在对账..." : "立即从飞书对账"}
                </button>
              </div>
              {reconcileMessage && <p style={{ marginTop: 12, color: reconcileMessage.includes("失败") ? "var(--red)" : "var(--accent2)" }}>{reconcileMessage}</p>}
              {!reconcile ? (
                <p style={{ color: "var(--text2)", marginTop: 14 }}>正在读取最近对账状态...</p>
              ) : reconcile.status === "failed" ? (
                <p style={{ color: "var(--red)", marginTop: 14, lineHeight: 1.7 }}>对账底座尚不可用：{reconcile.detail || reconcile.error || "请检查 V6.2 数据库迁移和业务身份。"}</p>
              ) : (
                <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {[
                      ["数据来源", `${reconcile.source?.label || "飞书多维表格"} → ${reconcile.source?.mirror || "Supabase受治理镜像"}`],
                      ["最近更新时间", reconcile.data?.freshness?.last_succeeded_at ? new Date(reconcile.data.freshness.last_succeeded_at).toLocaleString("zh-CN") : "尚未完成同步"],
                      ["源数据时间", reconcile.data?.freshness?.latest_source_updated_at ? new Date(reconcile.data.freshness.latest_source_updated_at).toLocaleString("zh-CN") : "飞书未提供"],
                      ["数据质量", reconcile.data?.quality?.status === "attention" ? `需治理 · ${reconcile.data.quality.pending_quarantine_count} 条隔离` : reconcile.data?.quality?.status === "ready" ? "通过" : "尚未同步"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bg2)", border: "1px solid var(--border)" }}>
                        <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>{label}</div>
                        <div style={{ marginTop: 6, fontWeight: 700, lineHeight: 1.45 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(126px, 1fr))", gap: 8 }}>
                    {["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"].map(domain => {
                      const cursor = reconcile.data?.cursors?.find(item => item.domain === domain);
                      const labels: Record<string, string> = { project: "项目", milestone: "里程碑", task: "任务", risk: "风险", contract: "合同", payment: "回款", cost: "成本", syncLedger: "同步账本" };
                      return (
                        <div key={domain} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", textAlign: "center" }}>
                          <div style={{ fontWeight: 700 }}>{labels[domain]}</div>
                          <div style={{ color: "var(--text2)", fontSize: "0.78rem", marginTop: 4 }}>{cursor ? `${cursor.source_record_count} 条` : "未同步"}</div>
                        </div>
                      );
                    })}
                  </div>
                  {reconcile.data?.latest_batch && (
                    <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.65 }}>
                      最近批次：{reconcile.data.latest_batch.status}；读取 {reconcile.data.latest_batch.total_records} 条，新增 {reconcile.data.latest_batch.inserted_records} 条，更新 {reconcile.data.latest_batch.updated_records} 条，未变化 {reconcile.data.latest_batch.unchanged_records} 条，软删除标记 {reconcile.data.latest_batch.tombstoned_records} 条，隔离 {reconcile.data.latest_batch.quarantined_records} 条。
                    </p>
                  )}
                  {Number(reconcile.data?.quality?.pending_quarantine_count ?? 0) > 0 && (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "12px 14px", borderRadius: 12, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.28)" }}>
                      <span style={{ color: "var(--amber)", lineHeight: 1.6 }}>隔离记录需要补齐飞书中文字段“数据分类”，系统不会把未确认数据自动写入正式空间。</span>
                      <Link className="btn-secondary" href="/integration-center/data-governance" style={{ textDecoration: "none", marginLeft: "auto" }}>进入分类治理台</Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="card" style={{ marginBottom: 18, borderColor: confirmations?.status === "not_configured" ? "rgba(245,158,11,0.38)" : "var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
                <div>
                  <div className="section-title">🛡️ 飞书写入待确认队列</div>
                  <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
                    通用飞书写入动作不会再通过 token 直写。系统先生成预览和风险提示，授权用户确认后才会执行。
                  </p>
                </div>
                <button className="btn-secondary" type="button" onClick={() => void loadConfirmations()}>刷新队列</button>
              </div>
              {confirmationMessage && <p style={{ color: confirmationMessage.includes("失败") ? "var(--red)" : "var(--accent2)", lineHeight: 1.6, marginBottom: 10 }}>{confirmationMessage}</p>}
              {!confirmations ? (
                <p style={{ color: "var(--text2)" }}>正在读取飞书写入确认队列...</p>
              ) : confirmations.status !== "succeeded" ? (
                <div>
                  <p style={{ color: confirmations.status === "unauthorized" ? "var(--amber)" : "var(--red)", lineHeight: 1.7 }}>
                    队列状态：{statusText[confirmations.status] || confirmations.status}。{confirmations.warning || confirmations.migration || "请检查登录状态和 Supabase 配置。"}
                  </p>
                  {confirmations.migration && (
                    <p style={{ color: "var(--accent2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 6 }}>
                      需要执行 SQL：{confirmations.migration}
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {confirmationSummary && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                      {[
                        ["待确认", confirmationSummary.pendingCount, "需人工确认后才写飞书"],
                        ["失败可重试", confirmationSummary.failedCount, "可先复核再重试"],
                        ["高风险", confirmationSummary.highRiskPendingCount, "需要二次确认"],
                        ["逾期待处理", confirmationSummary.overduePendingCount, "超过7天未处理"],
                        ["二次确认", confirmationSummary.requiresSecondConfirmCount, "需显式风险确认"],
                      ].map(([label, value, hint]) => (
                        <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                          <div style={{ color: "var(--text2)", fontSize: "0.74rem", marginBottom: 6 }}>{label}</div>
                          <div style={{ fontSize: "1.35rem", fontWeight: 900, color: label === "高风险" ? "var(--red)" : label === "逾期待处理" ? "var(--amber)" : "var(--accent2)" }}>{value}</div>
                          <p style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 4 }}>{hint}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {confirmationSummary?.reminderDrafts?.length ? (
                    <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.28)", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <strong style={{ color: "var(--amber)" }}>待处理提醒草稿</strong>
                        <span className="tag tag-amber">{confirmationSummary.reminderDrafts.length} 条需提醒</span>
                      </div>
                      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                        {confirmationSummary.reminderDrafts.map(draft => (
                          <div key={draft.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
                            <span className={draft.priority === "P0" ? "tag tag-amber" : "tag tag-blue"}>{draft.priority}</span>
                            <div>
                              <div style={{ fontSize: "0.82rem", fontWeight: 800 }}>{draft.title}</div>
                              <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.5, marginTop: 2 }}>{draft.detail} · {draft.nextAction}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ display: "grid", gridTemplateColumns: "180px minmax(220px, 1fr) auto auto auto", gap: 10, alignItems: "center" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text2)", fontSize: "0.74rem" }}>状态筛选</span>
                      <select
                        className="input"
                        value={confirmationStatusFilter}
                        onChange={event => {
                          const next = event.target.value;
                          setConfirmationStatusFilter(next);
                          void loadConfirmations(next);
                        }}
                      >
                        <option value="all">全部状态</option>
                        <option value="pending_confirmation">待确认</option>
                        <option value="failed">失败可重试</option>
                        <option value="succeeded">已成功</option>
                        <option value="cancelled">已取消</option>
                        <option value="writing">写入中</option>
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "var(--text2)", fontSize: "0.74rem" }}>关键词搜索</span>
                      <input
                        className="input"
                        value={confirmationSearch}
                        onChange={event => setConfirmationSearch(event.target.value)}
                        placeholder="搜索目标、来源、申请人、字段内容"
                      />
                    </label>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={selectableConfirmationIds.length === 0}
                      onClick={() => {
                        setSelectedConfirmationIds(prev => (
                          selectedVisibleConfirmationIds.length === selectableConfirmationIds.length
                            ? prev.filter(id => !selectableConfirmationIds.includes(id))
                            : Array.from(new Set([...prev, ...selectableConfirmationIds]))
                        ));
                      }}
                    >
                      {selectedVisibleConfirmationIds.length === selectableConfirmationIds.length && selectableConfirmationIds.length > 0 ? "取消全选" : "全选待处理"}
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={selectedConfirmableConfirmationIds.length === 0 || confirmationBusyId.startsWith("batch-confirm")}
                      onClick={() => void batchConfirmFeishuActions()}
                    >
                      {confirmationBusyId.startsWith("batch-confirm") ? "批量确认中..." : `批量确认${selectedConfirmableConfirmationIds.length ? ` ${selectedConfirmableConfirmationIds.length}` : ""}`}
                    </button>
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={selectedCancellableConfirmationIds.length === 0 || confirmationBusyId === "batch"}
                      onClick={() => void batchCancelFeishuActions()}
                    >
                      {confirmationBusyId === "batch" ? "批量处理中..." : `批量取消${selectedCancellableConfirmationIds.length ? ` ${selectedCancellableConfirmationIds.length}` : ""}`}
                    </button>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                    当前筛选返回 {confirmationRows.length} 条，页面匹配 {visibleConfirmations.length} 条；批量确认会先调用风险复核接口，阻断项不会执行。
                  </p>
                  {confirmationRows.length === 0 ? (
                    <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无飞书写入动作。</p>
                  ) : visibleConfirmations.length === 0 ? (
                    <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>没有匹配当前关键词的飞书写入动作。</p>
                  ) : visibleConfirmations.map(item => (
                    <div key={item.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                          <input
                            type="checkbox"
                            aria-label={`选择 ${item.targetSummary}`}
                            checked={selectedConfirmationIds.includes(item.id)}
                            disabled={!canCancelFeishuAction(item.status) && !canConfirmFeishuAction(item)}
                            onChange={event => {
                              setSelectedConfirmationIds(prev => event.target.checked
                                ? Array.from(new Set([...prev, item.id]))
                                : prev.filter(id => id !== item.id));
                            }}
                            style={{ marginTop: 4 }}
                          />
                          <div>
                            <strong>{item.targetSummary}</strong>
                            <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 4 }}>
                              来源：{item.sourcePage || item.source} · 申请人：{item.requesterName || "系统/API"} · 创建：{new Date(item.createdAt).toLocaleString("zh-CN")}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <StatusPill status={item.status} />
                          {item.actionType === "base_record_update" && Number(item.writebackAttemptCount) > 0 && (
                            <span className="tag">写回尝试 {item.writebackAttemptCount}</span>
                          )}
                          <span className="tag" style={{ background: `${riskColor(item.riskReview?.riskLevel || item.riskLevel)}22`, color: riskColor(item.riskReview?.riskLevel || item.riskLevel) }}>
                            {riskLabel(item.riskReview?.riskLevel || item.riskLevel)}
                          </span>
                          {item.riskReview?.requiresSecondConfirm && <span className="tag tag-amber">需二次确认</span>}
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
                        {item.preview.fields.map(field => (
                          <div key={`${item.id}-${field.label}`} style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                            <span style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{field.label}</span>
                            <p style={{ color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.5, marginTop: 2 }}>{field.value}</p>
                          </div>
                        ))}
                      </div>
                      {item.preview.riskReasons.length > 0 && (
                        <p style={{ color: "var(--amber)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 10 }}>
                          风险提示：{item.preview.riskReasons.join("；")}
                        </p>
                      )}
                      {item.riskReview && (
                        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                            <strong style={{ fontSize: "0.82rem" }}>确认前风险复核</strong>
                            <span className="tag">{item.riskReview.canConfirm ? "可确认" : "需处理阻断"}</span>
                            {item.riskReview.ageDays !== null && <span className="tag">等待 {item.riskReview.ageDays} 天</span>}
                          </div>
                          {item.riskReview.blockingIssues.length > 0 && (
                            <p style={{ color: "var(--red)", fontSize: "0.78rem", lineHeight: 1.6 }}>
                              阻断项：{item.riskReview.blockingIssues.join("；")}
                            </p>
                          )}
                          {item.riskReview.warnings.length > 0 && (
                            <p style={{ color: "var(--amber)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 4 }}>
                              复核提示：{item.riskReview.warnings.slice(0, 4).join("；")}
                            </p>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 6, marginTop: 8 }}>
                            {item.riskReview.checklist.slice(0, 6).map(check => (
                              <div key={`${item.id}-${check.id}`} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                                <span className={check.status === "block" ? "tag tag-amber" : check.status === "warning" ? "tag tag-blue" : "tag"}>{check.status === "block" ? "阻断" : check.status === "warning" ? "提示" : "通过"}</span>
                                <div style={{ fontSize: "0.76rem", fontWeight: 800, marginTop: 6 }}>{check.label}</div>
                                <p style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.45, marginTop: 3 }}>{check.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {item.errorCode && <p style={{ color: "var(--red)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 8 }}>失败原因：{item.errorCode}</p>}
                      {item.cancelReason && <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6, marginTop: 8 }}>取消原因：{item.cancelReason}</p>}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                        {canConfirmFeishuAction(item) && (
                          <button className="btn-primary" type="button" disabled={confirmationBusyId === item.id || item.riskReview?.canConfirm === false} onClick={() => void confirmFeishuAction(item)}>
                            {confirmationBusyId === item.id ? "处理中..." : item.status === "writing" ? "恢复并对账" : "确认执行"}
                          </button>
                        )}
                        {canCancelFeishuAction(item.status) && (
                          <button className="btn-secondary" type="button" disabled={confirmationBusyId === item.id} onClick={() => void cancelFeishuAction(item.id)}>
                            取消写入
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

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
