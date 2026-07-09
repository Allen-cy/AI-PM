"use client";

import { useEffect, useState } from "react";

type ImpactReview = {
  id: string;
  pageId: string;
  title?: string | null;
  moduleName: string;
  priority: "P0" | "P1" | "P2";
  status: "待复核" | "处理中" | "已关闭" | "无需处理";
  ownerName: string;
  dueDate: string;
  reviewOutput: string;
  closureEvidence?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
};

type PersistenceSnapshot =
  | {
      status: "succeeded";
      summary: {
        persistedItems: number;
        persistedVersions: number;
        openImpactReviews: number;
        closedImpactReviews: number;
      };
      impactReviews: ImpactReview[];
      latestEvents: Array<{ id: string; pageId: string; eventType: string; actorName?: string | null; createdAt: string }>;
    }
  | { status: "not_configured"; warning: string; migration: string; impactReviews: []; latestEvents: [] }
  | { status: "unauthorized"; warning: string; impactReviews: []; latestEvents: [] }
  | { status: "failed"; warning: string; impactReviews: []; latestEvents: [] };

type KnowledgeOperationsResponse = {
  persistence?: PersistenceSnapshot;
};

const priorityClass: Record<string, string> = {
  P0: "tag tag-amber",
  P1: "tag tag-blue",
  P2: "tag tag-green",
};

export function KnowledgeLifecyclePersistenceClient() {
  const [persistence, setPersistence] = useState<PersistenceSnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [closureEvidence, setClosureEvidence] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
      const data = await response.json() as KnowledgeOperationsResponse;
      if (!cancelled) setPersistence(data.persistence ?? null);
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
    const data = await response.json() as KnowledgeOperationsResponse;
    setPersistence(data.persistence ?? null);
  }

  async function syncLifecycle() {
    if (!window.confirm("确认将当前 RAG 快照同步到 Supabase 知识生命周期表？该动作会写入知识条目、版本、影响复核和审计事件。")) return;
    setBusy("sync");
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json() as { status?: string; warning?: string; syncedItems?: number; syncedImpactReviews?: number };
      setMessage(response.ok ? `已同步 ${data.syncedItems ?? 0} 条知识条目，生成/更新 ${data.syncedImpactReviews ?? 0} 条影响复核。` : data.warning || "知识生命周期同步失败。");
      await load();
    } catch {
      setMessage("知识生命周期同步请求失败。");
    } finally {
      setBusy("");
    }
  }

  async function transitionReview(review: ImpactReview, status: "已关闭" | "无需处理") {
    const evidence = closureEvidence[review.id]?.trim();
    if (!evidence) {
      setMessage("请先填写复核结论/关闭证据。");
      return;
    }
    setBusy(review.id);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, status, closureEvidence: evidence }),
      });
      const data = await response.json() as { status?: string; warning?: string };
      setMessage(response.ok ? `已将 ${review.moduleName} 影响复核更新为 ${status}。` : data.warning || "影响复核状态更新失败。");
      await load();
    } catch {
      setMessage("影响复核状态更新请求失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: persistence?.status === "not_configured" ? "rgba(245,158,11,0.38)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="section-title">💾 知识生命周期持久化</div>
          <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7 }}>
            将当前 RAG 快照同步到 Supabase 后，知识版本、影响复核、关闭证据和操作审计才能跨会话留存。
          </p>
        </div>
        <button className="btn-primary" type="button" disabled={busy === "sync"} onClick={() => void syncLifecycle()}>
          {busy === "sync" ? "同步中..." : "同步当前快照"}
        </button>
      </div>

      {message && <p style={{ color: message.includes("失败") ? "var(--red)" : "var(--accent2)", lineHeight: 1.6, marginBottom: 10 }}>{message}</p>}

      {!persistence ? (
        <p style={{ color: "var(--text2)" }}>正在读取知识生命周期持久化状态...</p>
      ) : persistence.status === "not_configured" ? (
        <div style={{ color: "var(--amber)", lineHeight: 1.7 }}>
          <p>{persistence.warning}</p>
          <p style={{ marginTop: 6 }}>需要执行 SQL：{persistence.migration}</p>
        </div>
      ) : persistence.status === "unauthorized" ? (
        <p style={{ color: "var(--amber)", lineHeight: 1.7 }}>{persistence.warning}</p>
      ) : persistence.status === "failed" ? (
        <p style={{ color: "var(--red)", lineHeight: 1.7 }}>{persistence.warning}</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["已持久化条目", persistence.summary.persistedItems],
              ["已持久化版本", persistence.summary.persistedVersions],
              ["待处理复核", persistence.summary.openImpactReviews],
              ["已关闭复核", persistence.summary.closedImpactReviews],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          {persistence.impactReviews.length === 0 ? (
            <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>暂无持久化影响复核记录。点击“同步当前快照”后生成。</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {persistence.impactReviews.slice(0, 6).map(review => (
                <article key={review.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div>
                      <strong>{review.moduleName} · {review.title || review.pageId}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 5 }}>
                        责任人：{review.ownerName} · 截止：{review.dueDate} · 状态：{review.status}
                      </p>
                    </div>
                    <span className={priorityClass[review.priority]}>{review.priority}</span>
                  </div>
                  <p style={{ color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.7, marginTop: 8 }}>{review.reviewOutput}</p>
                  {review.status === "待复核" || review.status === "处理中" ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                      <input
                        className="input"
                        value={closureEvidence[review.id] ?? ""}
                        onChange={event => setClosureEvidence(prev => ({ ...prev, [review.id]: event.target.value }))}
                        placeholder="填写复核结论/关闭证据，例如：报告模板引用口径已复核，无需调整。"
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn-primary" type="button" disabled={busy === review.id} onClick={() => void transitionReview(review, "已关闭")}>关闭复核</button>
                        <button className="btn-secondary" type="button" disabled={busy === review.id} onClick={() => void transitionReview(review, "无需处理")}>标记无需处理</button>
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: "var(--green)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>
                      {review.reviewerName || "系统"} 已复核：{review.closureEvidence || "已处理"}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
