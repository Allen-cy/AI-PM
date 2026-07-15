"use client";

import { useEffect, useState } from "react";
import { BusinessEntitySelect } from "@/components/BusinessEntitySelect";

type OutputType = "ai_answer" | "report" | "governance" | "risk" | "template" | "other";
type NotificationChannel = "in_app" | "feishu" | "email";
type DeliveryStatus = "queued" | "sent" | "read" | "handled" | "failed" | "cancelled";
type TemplateUsageEventType = "download" | "reference" | "import" | "export";

type OutputReference = {
  id: string;
  outputType: OutputType;
  outputId: string;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  versionLabel?: string | null;
  referenceStatus: string;
  createdAt?: string | null;
};

type ReferenceCandidate = {
  outputType: OutputType;
  outputTitle: string;
  moduleName: string;
  pageId: string;
  versionLabel: string;
  suggestedReason: string;
};

type TemplateDirectoryItem = {
  id: string;
  templateKey: string;
  title: string;
  category: string;
  source: string;
  description: string;
  lifecycleStatus: "draft" | "active" | "reviewing" | "deprecated" | "archived";
  ownerName: string;
  linkedKnowledgePageIds: string[];
  downloadCount: number;
  referenceCount: number;
};

type NotificationRecord = {
  id: string;
  title: string;
  notificationChannel: NotificationChannel;
  status: string;
  subscriberName?: string | null;
};

type DeliveryReceipt = {
  id: string;
  notificationId?: string | null;
  deliveryChannel: NotificationChannel;
  deliveryStatus: DeliveryStatus;
  deliveredTo?: string | null;
  handledByName?: string | null;
  occurredAt?: string | null;
};

type AuditPackage = {
  id?: string;
  title: string;
  packagePeriod: string;
  markdown: string;
  createdAt?: string | null;
};

type ReferenceAuditSnapshot =
  | {
      status: "succeeded";
      summary: {
        outputReferences: number;
        managedTemplates: number;
        templateDownloads: number;
        templateReferences: number;
        deliveryReceipts: number;
        handledDeliveries: number;
        auditPackages: number;
      };
      outputReferences: OutputReference[];
      referenceCandidates: ReferenceCandidate[];
      templateDirectory: TemplateDirectoryItem[];
      deliveryReceipts: DeliveryReceipt[];
      recentNotifications: NotificationRecord[];
      auditPackages: AuditPackage[];
      auditPackagePreview: AuditPackage;
    }
  | {
      status: "not_configured";
      warning: string;
      migration: string;
      outputReferences: [];
      referenceCandidates: [];
      templateDirectory: [];
      deliveryReceipts: [];
      recentNotifications: [];
      auditPackages: [];
      auditPackagePreview: null;
    }
  | { status: "unauthorized"; warning: string; outputReferences: []; referenceCandidates: []; templateDirectory: []; deliveryReceipts: []; recentNotifications: []; auditPackages: []; auditPackagePreview: null }
  | { status: "failed"; warning: string; outputReferences: []; referenceCandidates: []; templateDirectory: []; deliveryReceipts: []; recentNotifications: []; auditPackages: []; auditPackagePreview: null };

type KnowledgeOperationsResponse = {
  referenceAudit?: ReferenceAuditSnapshot;
};

const outputTypeLabels: Record<OutputType, string> = {
  ai_answer: "AI问答",
  report: "报告",
  governance: "治理结论",
  risk: "风险输出",
  template: "模板",
  other: "其他",
};

const deliveryStatusLabels: Record<DeliveryStatus, string> = {
  queued: "排队中",
  sent: "已发送",
  read: "已读",
  handled: "已处理",
  failed: "失败",
  cancelled: "已取消",
};

function splitPageIds(value: string): string[] {
  return value.split(/[,，、\s]+/).map(item => item.trim()).filter(Boolean);
}

export function KnowledgeReferenceAuditClient() {
  const [snapshot, setSnapshot] = useState<ReferenceAuditSnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [referenceForm, setReferenceForm] = useState({
    outputType: "report" as OutputType,
    outputId: "",
    outputTitle: "报告工厂输出口径引用",
    moduleName: "报告工厂",
    pageId: "",
    citationText: "",
  });
  const [templateForm, setTemplateForm] = useState({
    templateKey: "risk-register",
    title: "风险登记册模板",
    category: "risk",
    source: "模板中心",
    description: "风险识别、分析、应对和跟踪的结构化登记模板。",
    ownerName: "知识库管理员",
    linkedKnowledgePageIds: "",
    lifecycleStatus: "active" as TemplateDirectoryItem["lifecycleStatus"],
  });
  const [deliveryForm, setDeliveryForm] = useState({
    notificationId: "",
    notificationChannel: "in_app" as NotificationChannel,
    deliveryStatus: "handled" as DeliveryStatus,
    deliveredTo: "",
  });

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
      const data = await response.json() as KnowledgeOperationsResponse;
      if (!cancelled) setSnapshot(data.referenceAudit ?? null);
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  async function load() {
    const response = await fetch("/api/knowledge/operations", { cache: "no-store" });
    const data = await response.json() as KnowledgeOperationsResponse;
    setSnapshot(data.referenceAudit ?? null);
  }

  async function postAction(action: string, payload: Record<string, unknown>, successMessage: string) {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/knowledge/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, confirm: true, ...payload }),
      });
      const data = await response.json() as { warning?: string };
      setMessage(response.ok ? successMessage : data.warning || "操作失败。");
      await load();
    } catch {
      setMessage("请求失败，请稍后再试。");
    } finally {
      setBusy("");
    }
  }

  function applyCandidate(candidate: ReferenceCandidate) {
    setReferenceForm({
      outputType: candidate.outputType,
      outputId: `${candidate.outputType}-${candidate.pageId}`,
      outputTitle: candidate.outputTitle,
      moduleName: candidate.moduleName,
      pageId: candidate.pageId,
      citationText: candidate.suggestedReason,
    });
  }

  async function saveReference() {
    if (!referenceForm.outputId.trim()) {
      setMessage("请先选择要绑定的正式业务成果，或从候选引用中选择一条。");
      return;
    }
    if (!referenceForm.pageId.trim()) {
      setMessage("请先填写知识 pageId，或从候选引用中选择一条。");
      return;
    }
    await postAction("create_output_reference", referenceForm, "知识版本引用链已保存。");
  }

  async function saveTemplate() {
    await postAction("upsert_template_directory_item", {
      ...templateForm,
      linkedKnowledgePageIds: splitPageIds(templateForm.linkedKnowledgePageIds),
    }, "模板/最佳实践目录已保存。");
  }

  async function recordTemplateUsage(templateKey: string, eventType: TemplateUsageEventType) {
    await postAction("record_template_usage", {
      templateKey,
      templateEventType: eventType,
      outputReferenceType: eventType === "reference" ? "knowledge_operations" : undefined,
      outputId: eventType === "reference" ? "template-directory" : undefined,
    }, eventType === "download" ? "模板下载统计已记录。" : "模板引用统计已记录。");
  }

  async function recordDeliveryReceipt() {
    if (!deliveryForm.notificationId.trim()) {
      setMessage("请先选择或填写通知ID。");
      return;
    }
    await postAction("record_subscription_delivery_receipt", deliveryForm, "订阅投递回执已记录。");
  }

  async function generateAuditPackage() {
    if (!window.confirm("确认生成 PMO 知识运营审计包？")) return;
    await postAction("generate_knowledge_audit_package", {}, "PMO知识运营审计包已生成，可在历史记录中下载。");
  }

  return (
    <section className="card" style={{ marginBottom: 18, borderColor: snapshot?.status === "not_configured" ? "rgba(245,158,11,0.38)" : "rgba(14,165,233,0.24)" }}>
      <div className="section-title">🔎 知识版本引用链、模板目录与审计包</div>
      <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7, marginBottom: 12 }}>
        V5.3.55-V5.3.58 将知识运营补成可审计闭环：业务输出绑定具体知识版本，模板/最佳实践可维护并统计下载引用，订阅通知有投递回执，最终生成 PMO 审计包。
      </p>

      {message && <p style={{ color: message.includes("失败") ? "var(--red)" : "var(--accent2)", lineHeight: 1.6, marginBottom: 10 }}>{message}</p>}

      {!snapshot ? (
        <p style={{ color: "var(--text2)" }}>正在读取知识引用链与审计包状态...</p>
      ) : snapshot.status === "not_configured" ? (
        <div style={{ color: "var(--amber)", lineHeight: 1.7 }}>
          <p>{snapshot.warning}</p>
          <p style={{ marginTop: 6 }}>需要执行 SQL：{snapshot.migration}</p>
        </div>
      ) : snapshot.status === "unauthorized" ? (
        <p style={{ color: "var(--amber)", lineHeight: 1.7 }}>{snapshot.warning}</p>
      ) : snapshot.status === "failed" ? (
        <p style={{ color: "var(--red)", lineHeight: 1.7 }}>{snapshot.warning}</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["引用记录", snapshot.summary.outputReferences],
              ["持久化模板", snapshot.summary.managedTemplates],
              ["模板下载", snapshot.summary.templateDownloads],
              ["模板引用", snapshot.summary.templateReferences],
              ["投递回执", snapshot.summary.deliveryReceipts],
              ["审计包", snapshot.summary.auditPackages],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{label}</div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 0.8fr)", gap: 12, alignItems: "start" }}>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <strong>输出绑定知识版本</strong>
              <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 8, marginTop: 10 }}>
                <select className="input" value={referenceForm.outputType} onChange={event => setReferenceForm(prev => ({ ...prev, outputType: event.target.value as OutputType }))}>
                  {Object.entries(outputTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input className="input" value={referenceForm.outputTitle} onChange={event => setReferenceForm(prev => ({ ...prev, outputTitle: event.target.value }))} placeholder="输出标题" />
                <BusinessEntitySelect kind="formalOutput" value={referenceForm.outputId} onChange={outputId => setReferenceForm(prev => ({ ...prev, outputId }))} onSelectedOption={option => option && setReferenceForm(prev => ({ ...prev, outputTitle: option.label }))} placeholder="选择要绑定的正式业务成果"/>
                <input className="input" value={referenceForm.moduleName} onChange={event => setReferenceForm(prev => ({ ...prev, moduleName: event.target.value }))} placeholder="模块名称" />
                <input className="input" value={referenceForm.pageId} onChange={event => setReferenceForm(prev => ({ ...prev, pageId: event.target.value }))} placeholder="知识 pageId，例如 KB-001" />
                <input className="input" value={referenceForm.citationText} onChange={event => setReferenceForm(prev => ({ ...prev, citationText: event.target.value }))} placeholder="引用说明，可为空" />
              </div>
              <button className="btn-primary" type="button" disabled={busy === "create_output_reference"} onClick={() => void saveReference()} style={{ marginTop: 10 }}>
                保存引用链
              </button>
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {snapshot.outputReferences.slice(0, 5).map(item => (
                  <div key={item.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <strong style={{ fontSize: "0.8rem" }}>{item.outputTitle}</strong>
                    <p style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 4 }}>
                      {outputTypeLabels[item.outputType]} · {item.moduleName} · {item.pageId} · 版本 {item.versionLabel || "未绑定"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <strong>候选引用</strong>
              {snapshot.referenceCandidates.slice(0, 6).map(candidate => (
                <button
                  key={`${candidate.outputType}-${candidate.pageId}-${candidate.moduleName}`}
                  className="btn-secondary"
                  type="button"
                  onClick={() => applyCandidate(candidate)}
                  style={{ textAlign: "left", lineHeight: 1.5 }}
                >
                  {candidate.moduleName} · {candidate.pageId} · {candidate.versionLabel}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 12, alignItems: "start" }}>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <strong>模板/最佳实践目录维护</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <input className="input" value={templateForm.templateKey} onChange={event => setTemplateForm(prev => ({ ...prev, templateKey: event.target.value }))} placeholder="templateKey" />
                <input className="input" value={templateForm.title} onChange={event => setTemplateForm(prev => ({ ...prev, title: event.target.value }))} placeholder="标题" />
                <input className="input" value={templateForm.category} onChange={event => setTemplateForm(prev => ({ ...prev, category: event.target.value }))} placeholder="分类" />
                <input className="input" value={templateForm.source} onChange={event => setTemplateForm(prev => ({ ...prev, source: event.target.value }))} placeholder="来源" />
                <input className="input" value={templateForm.ownerName} onChange={event => setTemplateForm(prev => ({ ...prev, ownerName: event.target.value }))} placeholder="责任人" />
                <input className="input" value={templateForm.linkedKnowledgePageIds} onChange={event => setTemplateForm(prev => ({ ...prev, linkedKnowledgePageIds: event.target.value }))} placeholder="关联知识 pageId，用逗号分隔" />
                <textarea className="input" rows={2} value={templateForm.description} onChange={event => setTemplateForm(prev => ({ ...prev, description: event.target.value }))} placeholder="说明" />
                <button className="btn-primary" type="button" disabled={busy === "upsert_template_directory_item"} onClick={() => void saveTemplate()}>保存目录</button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {snapshot.templateDirectory.slice(0, 8).map(template => (
                <div key={template.templateKey} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ fontSize: "0.82rem" }}>{template.title}</strong>
                    <span className="tag tag-green">{template.lifecycleStatus}</span>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 4 }}>
                    {template.templateKey} · {template.ownerName} · 下载 {template.downloadCount} · 引用 {template.referenceCount}
                  </p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="btn-secondary" type="button" disabled={busy === "record_template_usage"} onClick={() => void recordTemplateUsage(template.templateKey, "download")}>记录下载</button>
                    <button className="btn-secondary" type="button" disabled={busy === "record_template_usage"} onClick={() => void recordTemplateUsage(template.templateKey, "reference")}>记录引用</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 12, alignItems: "start" }}>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <strong>订阅投递回执</strong>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <select className="input" value={deliveryForm.notificationId} onChange={event => setDeliveryForm(prev => ({ ...prev, notificationId: event.target.value }))}>
                  <option value="">选择通知ID</option>
                  {snapshot.recentNotifications.map(notification => <option key={notification.id} value={notification.id}>{notification.title} · {notification.id.slice(0, 8)}</option>)}
                </select>
                <select className="input" value={deliveryForm.notificationChannel} onChange={event => setDeliveryForm(prev => ({ ...prev, notificationChannel: event.target.value as NotificationChannel }))}>
                  <option value="in_app">站内</option>
                  <option value="feishu">飞书</option>
                  <option value="email">邮件</option>
                </select>
                <select className="input" value={deliveryForm.deliveryStatus} onChange={event => setDeliveryForm(prev => ({ ...prev, deliveryStatus: event.target.value as DeliveryStatus }))}>
                  {Object.entries(deliveryStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <input className="input" value={deliveryForm.deliveredTo} onChange={event => setDeliveryForm(prev => ({ ...prev, deliveredTo: event.target.value }))} placeholder="接收对象，可为空" />
                <button className="btn-primary" type="button" disabled={busy === "record_subscription_delivery_receipt"} onClick={() => void recordDeliveryReceipt()}>记录回执</button>
              </div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {snapshot.deliveryReceipts.slice(0, 8).map(receipt => (
                <div key={receipt.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <strong style={{ fontSize: "0.8rem" }}>{deliveryStatusLabels[receipt.deliveryStatus]} · {receipt.deliveryChannel}</strong>
                  <p style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 4 }}>
                    通知：{receipt.notificationId || "未关联"} · 接收对象：{receipt.deliveredTo || "未记录"} · 处理人：{receipt.handledByName || "未处理"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.7fr)", gap: 12, alignItems: "start" }}>
            <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <strong>PMO知识运营审计包预览</strong>
                <button className="btn-primary" type="button" disabled={busy === "generate_knowledge_audit_package"} onClick={() => void generateAuditPackage()}>生成审计包</button>
              </div>
              <pre style={{ whiteSpace: "pre-wrap", color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.6, marginTop: 10, maxHeight: 300, overflow: "auto" }}>
                {snapshot.auditPackagePreview.markdown}
              </pre>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <strong>审计包下载</strong>
              {snapshot.auditPackages.slice(0, 5).map(item => (
                <a key={item.id || item.title} href={`/api/knowledge/audit-packages/${item.id}/download`} className="btn-secondary" style={{ textDecoration: "none", lineHeight: 1.5 }}>
                  下载 {item.title}
                </a>
              ))}
              {snapshot.auditPackages.length === 0 && <p style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.6 }}>暂无已保存审计包，生成后会出现在这里。</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
