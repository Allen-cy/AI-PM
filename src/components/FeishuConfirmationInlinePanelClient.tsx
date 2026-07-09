"use client";

import { useEffect, useState } from "react";

type ConfirmationSummary = {
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

type ConfirmationItem = {
  id: string;
  targetSummary: string;
  status: string;
  sourcePage?: string | null;
  riskReview?: {
    riskLevel: "low" | "medium" | "high";
    requiresSecondConfirm: boolean;
    canConfirm: boolean;
    warnings: string[];
    blockingIssues: string[];
  };
};

type ConfirmationResponse = {
  status: string;
  warning?: string;
  migration?: string;
  summary?: ConfirmationSummary;
  confirmations?: ConfirmationItem[];
};

function riskText(level?: string): string {
  if (level === "high") return "高风险";
  if (level === "medium") return "中风险";
  if (level === "low") return "低风险";
  return "待复核";
}

function priorityClass(priority: "P0" | "P1" | "P2"): string {
  return priority === "P0" ? "tag tag-amber" : "tag tag-blue";
}

export function FeishuConfirmationInlinePanelClient({ moduleName }: { moduleName: string }) {
  const [data, setData] = useState<ConfirmationResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/integrations/feishu/actions/confirmations?status=all&limit=30", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setError("无法读取飞书待确认队列。");
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
        <div className="section-title">🛡️ 飞书写入确认提醒</div>
        <p style={{ color: "var(--amber)", lineHeight: 1.6 }}>{moduleName}：{error}</p>
        <a href="/integration-center" className="btn-secondary" style={{ display: "inline-flex", marginTop: 10, textDecoration: "none" }}>去集成中心</a>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="card" style={{ marginBottom: 18 }} aria-busy="true">
        <div className="section-title">🛡️ 飞书写入确认提醒</div>
        <p style={{ color: "var(--text2)", lineHeight: 1.6 }}>{moduleName} 正在读取待确认写入...</p>
      </section>
    );
  }

  if (data.status !== "succeeded") {
    return (
      <section className="card" style={{ marginBottom: 18, borderColor: data.status === "unauthorized" ? "rgba(245,158,11,0.38)" : "rgba(239,68,68,0.32)" }}>
        <div className="section-title">🛡️ 飞书写入确认提醒</div>
        <p style={{ color: data.status === "unauthorized" ? "var(--amber)" : "var(--red)", lineHeight: 1.6 }}>
          {data.warning || data.migration || "飞书确认队列暂不可用。"}
        </p>
        <a href="/integration-center" className="btn-secondary" style={{ display: "inline-flex", marginTop: 10, textDecoration: "none" }}>去集成中心</a>
      </section>
    );
  }

  const summary = data.summary;
  const activeItems = (data.confirmations ?? []).filter(item => item.status === "pending_confirmation" || item.status === "failed");
  const topItems = activeItems.slice(0, 3);
  const hasAttention = Boolean(summary && (summary.pendingCount > 0 || summary.failedCount > 0 || summary.highRiskPendingCount > 0 || summary.overduePendingCount > 0));

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: hasAttention ? "rgba(245,158,11,0.38)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div className="section-title">🛡️ 飞书写入确认提醒</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.6, fontSize: "0.84rem" }}>
            {moduleName} 使用飞书写入时先进入确认队列；这里显示当前账号待处理、高风险和逾期待确认动作。
          </p>
        </div>
        <a href="/integration-center" className="btn-secondary" style={{ textDecoration: "none" }}>去集成中心处理</a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
        {[
          ["待确认", summary?.pendingCount ?? 0],
          ["失败可重试", summary?.failedCount ?? 0],
          ["高风险", summary?.highRiskPendingCount ?? 0],
          ["逾期", summary?.overduePendingCount ?? 0],
          ["二次确认", summary?.requiresSecondConfirmCount ?? 0],
        ].map(([label, value]) => (
          <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{label}</div>
            <div style={{ fontWeight: 900, fontSize: "1.2rem", marginTop: 4, color: label === "高风险" ? "var(--red)" : label === "逾期" ? "var(--amber)" : "var(--accent2)" }}>{value}</div>
          </div>
        ))}
      </div>

      {summary?.reminderDrafts?.length ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {summary.reminderDrafts.slice(0, 3).map(draft => (
            <div key={draft.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: 8, alignItems: "start", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.24)", borderRadius: 10, padding: 10 }}>
              <span className={priorityClass(draft.priority)}>{draft.priority}</span>
              <div>
                <strong style={{ fontSize: "0.82rem" }}>{draft.title}</strong>
                <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.55, marginTop: 3 }}>{draft.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : topItems.length > 0 ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {topItems.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
              <span style={{ fontSize: "0.82rem", fontWeight: 800 }}>{item.targetSummary}</span>
              <span className="tag">{riskText(item.riskReview?.riskLevel)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.6, marginTop: 12 }}>当前没有待处理的飞书写入确认。</p>
      )}
    </section>
  );
}
