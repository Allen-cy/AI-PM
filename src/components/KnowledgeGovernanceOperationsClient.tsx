"use client";

import { useEffect, useState } from "react";

type KnowledgeLifecycleItemStatus = "draft" | "reviewed" | "published" | "deprecated" | "archived";
type NotificationChannel = "in_app" | "feishu" | "email";
type SubscriptionStatus = "active" | "paused" | "cancelled";

type GovernanceItem = {
  pageId: string;
  title: string;
  status: KnowledgeLifecycleItemStatus;
  ownerName: string;
  currentVersionLabel?: string | null;
  lifecycleHealth: string;
  expiresAt?: string | null;
  impactedModules: string[];
  linkedTemplates: string[];
};

type Subscription = {
  id: string;
  subscriberName?: string | null;
  moduleName: string;
  domain?: string | null;
  notificationChannel: NotificationChannel;
  status: SubscriptionStatus;
};

type NotificationRecord = {
  id: string;
  subscriberName?: string | null;
  moduleName: string;
  notificationChannel: NotificationChannel;
  title: string;
  priority: "P0" | "P1" | "P2";
  status: string;
  feishuConfirmationId?: string | null;
};

type ChangeReport = {
  id?: string;
  reportPeriod: string;
  title: string;
  markdown: string;
  createdAt?: string | null;
};

type GovernanceSnapshot =
  | {
      status: "succeeded";
      summary: {
        managedItems: number;
        activeSubscriptions: number;
        queuedNotifications: number;
        latestReports: number;
      };
      items: GovernanceItem[];
      subscriptions: Subscription[];
      notifications: NotificationRecord[];
      latestReports: ChangeReport[];
      changeReportPreview: ChangeReport;
    }
  | { status: "not_configured"; warning: string; migration: string; items: []; subscriptions: []; notifications: []; latestReports: []; changeReportPreview: null }
  | { status: "unauthorized"; warning: string; items: []; subscriptions: []; notifications: []; latestReports: []; changeReportPreview: null }
  | { status: "failed"; warning: string; items: []; subscriptions: []; notifications: []; latestReports: []; changeReportPreview: null };

type ChangeControlSnapshot =
  | {
      status: "succeeded";
      subscriptionReminders: Array<{ id: string; title: string; notificationChannel: NotificationChannel; priority: "P0" | "P1" | "P2" }>;
    }
  | { status: string; subscriptionReminders: [] };

type KnowledgeOperationsResponse = {
  governance?: GovernanceSnapshot;
  changeControl?: ChangeControlSnapshot;
};

const statusLabels: Record<KnowledgeLifecycleItemStatus, string> = {
  draft: "草稿",
  reviewed: "已评审",
  published: "已发布",
  deprecated: "已废弃/过期",
  archived: "已归档",
};

const channelLabels: Record<NotificationChannel, string> = {
  in_app: "站内",
  feishu: "飞书",
  email: "邮件",
};

const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  active: "启用",
  paused: "暂停",
  cancelled: "取消",
};

export function KnowledgeGovernanceOperationsClient() {
  const [governance, setGovernance] = useState<GovernanceSnapshot | null>(null);
  const [changeControl, setChangeControl] = useState<ChangeControlSnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [transitionDrafts, setTransitionDrafts] = useState<Record<string, { status: KnowledgeLifecycleItemStatus; note: string }>>({});
  const [subscriptionForm, setSubscriptionForm] = useState({
    moduleName: "报告工厂",
    domain: "",
    notificationChannel: "in_app" as NotificationChannel,
    subscriberName: "",
  });
  const [feishuReceiveId, setFeishuReceiveId] = useState("");
  const [feishuReceiveIdType, setFeishuReceiveIdType] = useState<"chat_id" | "open_id">("chat_id");

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
      const data = await response.json() as KnowledgeOperationsResponse;
      if (!cancelled) {
        setGovernance(data.governance ?? null);
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
    setGovernance(data.governance ?? null);
    setChangeControl(data.changeControl ?? null);
  }

  async function transitionItem(item: GovernanceItem) {
    const draft = transitionDrafts[item.pageId];
    if (!draft?.note.trim()) {
      setMessage("请先填写状态流转的复核/审批意见。");
      return;
    }
    setBusy(`transition-${item.pageId}`);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "knowledge_item",
          pageId: item.pageId,
          status: draft.status,
          reviewNote: draft.note,
        }),
      });
      const data = await response.json() as { status?: string; warning?: string; item?: { status?: string } };
      setMessage(response.ok ? `已将 ${item.title} 更新为 ${statusLabels[(data.item?.status as KnowledgeLifecycleItemStatus) || draft.status]}。` : data.warning || "知识条目状态流转失败。");
      await load();
    } catch {
      setMessage("知识条目状态流转请求失败。");
    } finally {
      setBusy("");
    }
  }

  async function saveSubscription() {
    if (!subscriptionForm.moduleName.trim()) {
      setMessage("订阅模块不能为空。");
      return;
    }
    setBusy("subscription");
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_subscription",
          confirm: true,
          ...subscriptionForm,
        }),
      });
      const data = await response.json() as { status?: string; warning?: string; subscription?: { moduleName?: string } };
      setMessage(response.ok ? `知识订阅已保存：${data.subscription?.moduleName || subscriptionForm.moduleName}。` : data.warning || "知识订阅保存失败。");
      await load();
    } catch {
      setMessage("知识订阅保存请求失败。");
    } finally {
      setBusy("");
    }
  }

  async function updateSubscriptionStatus(subscription: Subscription, status: SubscriptionStatus) {
    setBusy(`subscription-${subscription.id}`);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_subscription_status",
          confirm: true,
          subscriptionId: subscription.id,
          subscriptionStatus: status,
        }),
      });
      const data = await response.json() as { warning?: string };
      setMessage(response.ok ? `订阅状态已更新为 ${subscriptionStatusLabels[status]}。` : data.warning || "订阅状态更新失败。");
      await load();
    } catch {
      setMessage("订阅状态更新请求失败。");
    } finally {
      setBusy("");
    }
  }

  async function sendReminders() {
    if (!changeControl || changeControl.status !== "succeeded" || changeControl.subscriptionReminders.length === 0) {
      setMessage("暂无可发送的订阅提醒草稿。");
      return;
    }
    const hasFeishu = changeControl.subscriptionReminders.some(item => item.notificationChannel === "feishu");
    if (hasFeishu && !feishuReceiveId.trim()) {
      setMessage("存在飞书提醒草稿，请填写飞书接收对象 chat_id 或 open_id；系统会先进入飞书待确认队列。");
      return;
    }
    if (!window.confirm("确认生成订阅提醒发送记录？飞书提醒只会进入待确认队列，不会直接外发。")) return;
    setBusy("send-reminders");
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_subscription_reminders",
          confirm: true,
          reminderIds: changeControl.subscriptionReminders.map(item => item.id),
          feishuReceiveId,
          feishuReceiveIdType,
        }),
      });
      const data = await response.json() as { warning?: string; queuedNotifications?: number; feishuConfirmations?: number };
      setMessage(response.ok
        ? `已生成 ${data.queuedNotifications ?? 0} 条订阅通知记录，飞书待确认 ${data.feishuConfirmations ?? 0} 条。`
        : data.warning || "订阅提醒发送记录生成失败。");
      await load();
    } catch {
      setMessage("订阅提醒发送请求失败。");
    } finally {
      setBusy("");
    }
  }

  async function generateReport() {
    if (!window.confirm("确认生成并保存知识变更报告？")) return;
    setBusy("report");
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_change_report", confirm: true }),
      });
      const data = await response.json() as { warning?: string; report?: { title?: string } };
      setMessage(response.ok ? `知识变更报告已生成：${data.report?.title || "未命名报告"}。` : data.warning || "知识变更报告生成失败。");
      await load();
    } catch {
      setMessage("知识变更报告生成请求失败。");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: governance?.status === "not_configured" ? "rgba(245,158,11,0.38)" : "rgba(168,85,247,0.26)" }}>
      <div className="section-title">🧑‍⚖️ 知识状态流转、订阅发送与变更报告</div>
      <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7, marginBottom: 12 }}>
        这里把知识运营从“看见差异”推进到“使用者可操作”：知识管理员可流转条目状态，模块负责人可订阅变更提醒，PMO 可生成知识变更周报。
      </p>

      {message && <p style={{ color: message.includes("失败") ? "var(--red)" : "var(--accent2)", lineHeight: 1.6, marginBottom: 10 }}>{message}</p>}

      {!governance ? (
        <p style={{ color: "var(--text2)" }}>正在读取知识治理运营状态...</p>
      ) : governance.status === "not_configured" ? (
        <div style={{ color: "var(--amber)", lineHeight: 1.7 }}>
          <p>{governance.warning}</p>
          <p style={{ marginTop: 6 }}>需要执行 SQL：{governance.migration}</p>
        </div>
      ) : governance.status === "unauthorized" ? (
        <p style={{ color: "var(--amber)", lineHeight: 1.7 }}>{governance.warning}</p>
      ) : governance.status === "failed" ? (
        <p style={{ color: "var(--red)", lineHeight: 1.7 }}>{governance.warning}</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["可管理知识", governance.summary.managedItems],
              ["启用订阅", governance.summary.activeSubscriptions],
              ["待发送通知", governance.summary.queuedNotifications],
              ["历史报告", governance.summary.latestReports],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.74rem" }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.8fr)", gap: 12, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 10 }}>
              <strong>知识条目状态流转</strong>
              {governance.items.slice(0, 6).map(item => {
                const draft = transitionDrafts[item.pageId] ?? { status: item.status, note: "" };
                return (
                  <article key={item.pageId} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{item.pageId} · {item.title}</strong>
                      <span className="tag tag-blue">{statusLabels[item.status]}</span>
                    </div>
                    <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 5 }}>
                      责任人：{item.ownerName} · 版本：{item.currentVersionLabel || "未设置"} · 健康：{item.lifecycleHealth}
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr) auto", gap: 8, marginTop: 10 }}>
                      <select
                        className="input"
                        value={draft.status}
                        onChange={event => setTransitionDrafts(prev => ({
                          ...prev,
                          [item.pageId]: { ...draft, status: event.target.value as KnowledgeLifecycleItemStatus },
                        }))}
                      >
                        {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <input
                        className="input"
                        value={draft.note}
                        onChange={event => setTransitionDrafts(prev => ({
                          ...prev,
                          [item.pageId]: { ...draft, note: event.target.value },
                        }))}
                        placeholder="填写复核/审批意见，例如：已确认适用，发布为当前口径。"
                      />
                      <button className="btn-primary" type="button" disabled={busy === `transition-${item.pageId}`} onClick={() => void transitionItem(item)}>
                        流转
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                <strong>订阅关系维护</strong>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <input className="input" value={subscriptionForm.moduleName} onChange={event => setSubscriptionForm(prev => ({ ...prev, moduleName: event.target.value }))} placeholder="订阅模块，例如：报告工厂" />
                  <input className="input" value={subscriptionForm.domain} onChange={event => setSubscriptionForm(prev => ({ ...prev, domain: event.target.value }))} placeholder="订阅领域/模板，可为空" />
                  <input className="input" value={subscriptionForm.subscriberName} onChange={event => setSubscriptionForm(prev => ({ ...prev, subscriberName: event.target.value }))} placeholder="订阅人名称，默认当前用户" />
                  <select className="input" value={subscriptionForm.notificationChannel} onChange={event => setSubscriptionForm(prev => ({ ...prev, notificationChannel: event.target.value as NotificationChannel }))}>
                    {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="btn-primary" type="button" disabled={busy === "subscription"} onClick={() => void saveSubscription()}>保存订阅</button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {governance.subscriptions.slice(0, 5).map(subscription => (
                  <div key={subscription.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: "0.82rem" }}>{subscription.moduleName}</strong>
                      <span className={subscription.status === "active" ? "tag tag-green" : "tag tag-amber"}>{subscriptionStatusLabels[subscription.status]}</span>
                    </div>
                    <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.5, marginTop: 4 }}>
                      {subscription.subscriberName || "未指定"} · {channelLabels[subscription.notificationChannel]} · {subscription.domain || "全部领域"}
                    </p>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="btn-secondary" type="button" disabled={busy === `subscription-${subscription.id}`} onClick={() => void updateSubscriptionStatus(subscription, "active")}>启用</button>
                      <button className="btn-secondary" type="button" disabled={busy === `subscription-${subscription.id}`} onClick={() => void updateSubscriptionStatus(subscription, "paused")}>暂停</button>
                      <button className="btn-secondary" type="button" disabled={busy === `subscription-${subscription.id}`} onClick={() => void updateSubscriptionStatus(subscription, "cancelled")}>取消</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                <strong>订阅提醒发送</strong>
                <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6, marginTop: 6 }}>
                  当前提醒草稿：{changeControl?.status === "succeeded" ? changeControl.subscriptionReminders.length : 0} 条。飞书提醒会进入待确认队列。
                </p>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  <select className="input" value={feishuReceiveIdType} onChange={event => setFeishuReceiveIdType(event.target.value as "chat_id" | "open_id")}>
                    <option value="chat_id">chat_id</option>
                    <option value="open_id">open_id</option>
                  </select>
                  <input className="input" value={feishuReceiveId} onChange={event => setFeishuReceiveId(event.target.value)} placeholder="飞书接收对象，可在飞书提醒时填写" />
                  <button className="btn-primary" type="button" disabled={busy === "send-reminders"} onClick={() => void sendReminders()}>生成提醒发送记录</button>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.7fr)", gap: 12, alignItems: "start" }}>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <strong>知识变更报告预览</strong>
                <button className="btn-primary" type="button" disabled={busy === "report"} onClick={() => void generateReport()}>保存报告</button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6, marginTop: 10, maxHeight: 320, overflow: "auto" }}>
                {governance.changeReportPreview.markdown}
              </pre>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <strong>通知与报告记录</strong>
              {governance.notifications.slice(0, 4).map(notification => (
                <div key={notification.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.8rem" }}>{notification.title}</span>
                    <span className="tag tag-blue">{notification.status}</span>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.5, marginTop: 4 }}>
                    {channelLabels[notification.notificationChannel]} · {notification.subscriberName || "未指定"}
                    {notification.feishuConfirmationId ? ` · 待确认：${notification.feishuConfirmationId}` : ""}
                  </p>
                </div>
              ))}
              {governance.latestReports.slice(0, 3).map(report => (
                <div key={report.id || report.title} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <strong style={{ fontSize: "0.8rem" }}>{report.title}</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.5, marginTop: 4 }}>{report.reportPeriod} · {report.createdAt || "未记录时间"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
