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

type KnowledgeVersionDiff = {
  pageId: string;
  title: string;
  changeType: "新增" | "已更新" | "已删除" | "无变化";
  priority: "P0" | "P1" | "P2";
  ownerName: string;
  previousVersionLabel?: string | null;
  currentVersionLabel?: string | null;
  impactedModules: string[];
  linkedTemplates: string[];
  dueDate: string;
  changeSummary: string;
  reviewOutput: string;
};

type KnowledgeSubscriptionReminder = {
  id: string;
  subscriberName: string;
  moduleName: string;
  domain?: string | null;
  notificationChannel: "in_app" | "feishu" | "email";
  priority: "P0" | "P1" | "P2";
  relatedPageIds: string[];
  title: string;
  message: string;
  dueDate: string;
  actionRequired: string;
};

type KnowledgeActionCandidate = {
  reviewId: string;
  sourceId: string;
  pageId: string;
  title: string;
  moduleName: string;
  priority: "P0" | "P1";
  status: "待复核" | "处理中";
  ownerName: string;
  dueDate: string;
  reviewOutput: string;
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

type ChangeControlSnapshot =
  | {
      status: "succeeded";
      summary: {
        comparedItems: number;
        additions: number;
        modifications: number;
        removals: number;
        unchanged: number;
        activeSubscriptions: number;
        reminderDrafts: number;
        p0p1ActionCandidates: number;
      };
      versionDiffs: KnowledgeVersionDiff[];
      subscriptionReminders: KnowledgeSubscriptionReminder[];
      actionCandidates: KnowledgeActionCandidate[];
    }
  | { status: "not_configured"; warning: string; migration: string; versionDiffs: []; subscriptionReminders: []; actionCandidates: [] }
  | { status: "unauthorized"; warning: string; versionDiffs: []; subscriptionReminders: []; actionCandidates: [] }
  | { status: "failed"; warning: string; versionDiffs: []; subscriptionReminders: []; actionCandidates: [] };

type KnowledgeOperationsResponse = {
  persistence?: PersistenceSnapshot;
  changeControl?: ChangeControlSnapshot;
};

const priorityClass: Record<string, string> = {
  P0: "tag tag-amber",
  P1: "tag tag-blue",
  P2: "tag tag-green",
};

export function KnowledgeLifecyclePersistenceClient() {
  const [persistence, setPersistence] = useState<PersistenceSnapshot | null>(null);
  const [changeControl, setChangeControl] = useState<ChangeControlSnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [closureEvidence, setClosureEvidence] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
      const data = await response.json() as KnowledgeOperationsResponse;
      if (!cancelled) {
        setPersistence(data.persistence ?? null);
        setChangeControl(data.changeControl ?? null);
      }
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
    setChangeControl(data.changeControl ?? null);
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

  async function createActionItems() {
    if (!changeControl || changeControl.status !== "succeeded" || changeControl.actionCandidates.length === 0) {
      setMessage("暂无可转为统一行动项的 P0/P1 知识影响复核。");
      return;
    }
    if (!window.confirm("确认将当前 P0/P1 知识影响复核转为统一行动项？系统会跳过已存在的行动项。")) return;
    setBusy("create-action-items");
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_action_items",
          confirm: true,
          reviewIds: changeControl.actionCandidates.map(item => item.reviewId),
        }),
      });
      const data = await response.json() as { status?: string; warning?: string; createdActions?: number; skippedExisting?: number };
      setMessage(response.ok
        ? `已生成 ${data.createdActions ?? 0} 条统一行动项，跳过 ${data.skippedExisting ?? 0} 条已存在行动项。`
        : data.warning || "统一行动项生成失败。");
      await load();
    } catch {
      setMessage("统一行动项生成请求失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
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
    <section className="card" style={{ marginBottom: 18, borderColor: changeControl?.status === "not_configured" ? "rgba(245,158,11,0.38)" : "rgba(59,130,246,0.24)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div className="section-title">🧭 知识版本差异与订阅提醒</div>
          <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7 }}>
            将当前 RAG 快照与上一持久化版本对比，形成新增、更新、撤出清单；再根据订阅关系生成提醒草稿，并把 P0/P1 影响复核转入统一行动项。
          </p>
        </div>
        <button
          className="btn-primary"
          type="button"
          disabled={busy === "create-action-items" || changeControl?.status !== "succeeded" || changeControl.actionCandidates.length === 0}
          onClick={() => void createActionItems()}
        >
          {busy === "create-action-items" ? "生成中..." : "生成统一行动项"}
        </button>
      </div>

      {!changeControl ? (
        <p style={{ color: "var(--text2)" }}>正在读取知识版本差异和订阅提醒...</p>
      ) : changeControl.status === "not_configured" ? (
        <div style={{ color: "var(--amber)", lineHeight: 1.7 }}>
          <p>{changeControl.warning}</p>
          <p style={{ marginTop: 6 }}>需要执行 SQL：{changeControl.migration}</p>
        </div>
      ) : changeControl.status === "unauthorized" ? (
        <p style={{ color: "var(--amber)", lineHeight: 1.7 }}>{changeControl.warning}</p>
      ) : changeControl.status === "failed" ? (
        <p style={{ color: "var(--red)", lineHeight: 1.7 }}>{changeControl.warning}</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["对比条目", changeControl.summary.comparedItems],
              ["新增", changeControl.summary.additions],
              ["更新", changeControl.summary.modifications],
              ["撤出", changeControl.summary.removals],
              ["订阅提醒", changeControl.summary.reminderDrafts],
              ["行动候选", changeControl.summary.p0p1ActionCandidates],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(320px, 0.85fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <strong>版本差异清单</strong>
              {changeControl.versionDiffs.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>当前快照与上一持久化版本未发现新增、更新或撤出。</p>
              ) : changeControl.versionDiffs.slice(0, 8).map(diff => (
                <article key={`${diff.pageId}-${diff.changeType}`} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong>{diff.changeType} · {diff.title}</strong>
                      <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 5 }}>
                        {diff.pageId} · 责任人：{diff.ownerName} · 截止：{diff.dueDate}
                      </p>
                    </div>
                    <span className={priorityClass[diff.priority]}>{diff.priority}</span>
                  </div>
                  <p style={{ color: "var(--text)", fontSize: "0.8rem", lineHeight: 1.7, marginTop: 8 }}>{diff.changeSummary}</p>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>
                    版本：{diff.previousVersionLabel || "无"} → {diff.currentVersionLabel || "已撤出当前快照"}
                  </p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {diff.impactedModules.slice(0, 4).map(module => <span key={`${diff.pageId}-${module}`} className="tag tag-blue">{module}</span>)}
                    {diff.linkedTemplates.slice(0, 3).map(template => <span key={`${diff.pageId}-${template}`} className="tag tag-purple">模板：{template}</span>)}
                  </div>
                </article>
              ))}
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <strong>订阅提醒与行动候选</strong>
              {changeControl.subscriptionReminders.length === 0 ? (
                <p style={{ color: "var(--text2)", lineHeight: 1.7 }}>
                  暂无订阅提醒草稿。可在后续为模块负责人建立知识订阅关系后，由这里生成站内、飞书或邮件提醒。
                </p>
              ) : changeControl.subscriptionReminders.slice(0, 4).map(reminder => (
                <article key={reminder.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: "0.86rem" }}>{reminder.title}</strong>
                    <span className={priorityClass[reminder.priority]}>{reminder.priority}</span>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>
                    {reminder.subscriberName} · {reminder.notificationChannel} · 截止：{reminder.dueDate}
                  </p>
                  <p style={{ color: "var(--text)", fontSize: "0.78rem", lineHeight: 1.6, marginTop: 8 }}>{reminder.message}</p>
                </article>
              ))}

              {changeControl.actionCandidates.length > 0 && (
                <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                  {changeControl.actionCandidates.slice(0, 5).map(candidate => (
                    <div key={candidate.reviewId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: "0.8rem" }}>{candidate.title}</span>
                        <span className={priorityClass[candidate.priority]}>{candidate.priority}</span>
                      </div>
                      <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.5, marginTop: 4 }}>
                        {candidate.ownerName} · {candidate.dueDate} · {candidate.sourceId}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
    </>
  );
}
