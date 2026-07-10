"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  businessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  writeStoredBusinessContext,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";
import type {
  AssistantDraftTarget,
  OperationsAssistantSnapshot,
  PmAssistantSnapshot,
} from "@/features/operating-assistant/snapshot";
import styles from "./business-assistant.module.css";

type AssistantSnapshot = PmAssistantSnapshot | OperationsAssistantSnapshot;

type AssistantResponse = {
  status: string;
  detail?: string;
  generated_at?: string;
  snapshot?: AssistantSnapshot;
  source?: { feishu?: string; fallback_used?: boolean };
};

type DraftRecord = {
  id: string;
  projectId: string;
  businessRole: "pm" | "operations";
  sourceType: string;
  sourceRecordId: string;
  changes: Array<{ field: string; currentValue: unknown; proposedValue: unknown; reason: string }>;
  status: "pending_confirmation" | "confirmed" | "cancelled" | "superseded";
  writebackStatus: string;
  feishuConfirmationId: string | null;
  createdAt: string;
};

type DraftsResponse = { status: string; detail?: string; drafts?: DraftRecord[] };

type ContextResponse = {
  active_context?: { assignmentId: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string } | null;
  available_contexts?: Array<{ id: string; businessRole: string; orgId: string; subjectScope: string; subjectId: string; status: string }>;
  detail?: string;
};

const DRAFT_STATUS: Record<DraftRecord["status"], string> = {
  pending_confirmation: "待确认",
  confirmed: "已确认",
  cancelled: "已取消",
  superseded: "已失效",
};

const WRITEBACK_STATUS: Record<string, string> = {
  not_requested: "未申请",
  queued: "待最终确认",
  writing: "写入中",
  succeeded: "已写回",
  failed: "写回失败",
  cancelled: "已取消写回",
};

function text(value: unknown, fallback = "待补充"): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function money(value: number | null | undefined): string {
  return value === null || value === undefined ? "待补充" : `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万`;
}

function displayTime(value?: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

function DataBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "danger" | "success" }) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}

function DraftEditor({
  targets,
  context,
  onCreated,
}: {
  targets: AssistantDraftTarget[];
  context: StoredBusinessContext;
  onCreated: () => Promise<void>;
}) {
  const [targetKey, setTargetKey] = useState("");
  const [field, setField] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const selected = targets.find(item => `${item.sourceType}:${item.sourceRecordId}` === targetKey) ?? targets[0] ?? null;
  const fields = selected ? Object.keys(selected.editableFacts) : [];
  const selectedField = fields.includes(field) ? field : fields[0] ?? "";
  const currentValue = selected && selectedField ? selected.editableFacts[selectedField] : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !selectedField || !reason.trim() || proposedValue.trim() === text(currentValue, "")) return;
    setSaving(true);
    setMessage("");
    const query = businessContextSearchParams(context, readStoredDataClass());
    try {
      const response = await fetch(`/api/business-assistant/change-drafts?${query.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          role: context.businessRole,
          projectId: selected.projectId,
          sourceType: selected.sourceType,
          sourceRecordId: selected.sourceRecordId,
          changes: [{ field: selectedField, currentValue: currentValue ?? null, proposedValue: proposedValue.trim(), reason: reason.trim() }],
        }),
      });
      const body = await response.json() as { detail?: string; boundary?: string };
      if (!response.ok) throw new Error(body.detail || "变化草稿创建失败。");
      setMessage(body.boundary || "已生成待确认变化草稿。");
      setProposedValue("");
      setReason("");
      await onCreated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "变化草稿创建失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="delta-editor-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>DELTA UPDATE</p><h2 id="delta-editor-title">只填变化</h2></div>
        <DataBadge tone="warning">先草稿，后确认</DataBadge>
      </div>
      <p className={styles.explainer}>当前值由系统从真实业务源重新读取。你只填写新值和变化原因；保存后不会直接改写飞书。</p>
      {targets.length === 0 ? <Empty>当前范围没有可编辑的稳定关联记录。</Empty> : (
        <form className={styles.editorGrid} onSubmit={submit}>
          <label><span>业务对象</span><select value={selected ? `${selected.sourceType}:${selected.sourceRecordId}` : ""} onChange={event => { setTargetKey(event.target.value); setField(""); setProposedValue(""); setReason(""); }}>
            {targets.map(item => <option key={`${item.sourceType}:${item.sourceRecordId}`} value={`${item.sourceType}:${item.sourceRecordId}`}>{item.label}</option>)}
          </select></label>
          <label><span>变化字段</span><select value={selectedField} onChange={event => { setField(event.target.value); setProposedValue(""); setReason(""); }}>
            {fields.map(item => <option key={item} value={item}>{item}</option>)}
          </select></label>
          <label><span>当前事实</span><input value={text(currentValue, "未登记")} readOnly aria-readonly="true" /></label>
          <label><span>变化后的值</span><input value={proposedValue} onChange={event => setProposedValue(event.target.value)} placeholder="仅填写变化后的值" required /></label>
          <label className={styles.reason}><span>变化原因</span><textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="说明业务事实为何发生变化" maxLength={500} required /></label>
          <div className={styles.editorActions}>
            <button type="submit" disabled={saving || !selectedField || !reason.trim() || proposedValue.trim() === text(currentValue, "")}>{saving ? "正在核对当前事实…" : "生成待确认草稿"}</button>
            <small>提交时会再次读取源记录，若当前值已经变化，将要求刷新后重填。</small>
          </div>
          {message && <p className={styles.formMessage} role="status">{message}</p>}
        </form>
      )}
    </section>
  );
}

function DraftQueue({ drafts, context, onChanged }: { drafts: DraftRecord[]; context: StoredBusinessContext; onChanged: () => Promise<void> }) {
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function decide(draft: DraftRecord, decision: "confirm" | "cancel") {
    if (decision === "confirm" && !window.confirm("确认这份变化草稿？确认后将进入独立的飞书Base写回确认队列，仍不会静默改写业务主数据。")) return;
    setWorking(draft.id);
    setMessage("");
    try {
      const query = businessContextSearchParams(context, readStoredDataClass());
      const response = await fetch(`/api/business-assistant/change-drafts/${draft.id}?${query.toString()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, confirm: decision === "confirm", reason: decision === "cancel" ? "用户在业务助理中取消" : undefined }),
      });
      const body = await response.json() as { detail?: string; boundary?: string; confirmation_url?: string };
      if (!response.ok) throw new Error(body.detail || "草稿处理失败。");
      setMessage(body.boundary || "草稿状态已更新。");
      await onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "草稿处理失败。");
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="draft-queue-title">
      <div className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>CONFIRMATION QUEUE</p><h2 id="draft-queue-title">待确认变化草稿</h2></div>
        <DataBadge>{drafts.filter(item => item.status === "pending_confirmation").length} 待确认</DataBadge>
      </div>
      {message && <p className={styles.queueMessage} role="status">{message}</p>}
      <div className={styles.draftList}>
        {drafts.length === 0 && <Empty>还没有变化草稿。</Empty>}
        {drafts.map(draft => (
          <article className={styles.draftItem} key={draft.id}>
            <div className={styles.draftTop}><strong>{draft.sourceType} · {draft.sourceRecordId}</strong><DataBadge tone={draft.status === "confirmed" ? "success" : draft.status === "cancelled" ? "danger" : "warning"}>{DRAFT_STATUS[draft.status]}</DataBadge></div>
            {draft.changes.map(change => <div className={styles.changeLine} key={change.field}>
              <span>{change.field}</span><del>{text(change.currentValue, "未登记")}</del><b>→</b><ins>{text(change.proposedValue)}</ins><small>{change.reason}</small>
            </div>)}
            <div className={styles.draftFooter}><small>{displayTime(draft.createdAt)} · 写回状态：{WRITEBACK_STATUS[draft.writebackStatus] || draft.writebackStatus}</small>
              <div>
                {draft.feishuConfirmationId && <Link className={styles.queueLink} href={`/integration-center?confirmation_id=${encodeURIComponent(draft.feishuConfirmationId)}`}>前往最终确认</Link>}
                {draft.status === "pending_confirmation" && <><button className={styles.secondaryButton} disabled={working === draft.id} onClick={() => void decide(draft, "cancel")}>取消</button><button disabled={working === draft.id} onClick={() => void decide(draft, "confirm")}>确认并入队</button></>}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function PmView({ snapshot }: { snapshot: PmAssistantSnapshot }) {
  return <>
    <section className={styles.kpis} aria-label="项目经理工作摘要">
      <div><span>项目承诺</span><strong>{snapshot.projects.length}</strong><small>稳定关联项目</small></div>
      <div><span>里程碑</span><strong>{snapshot.milestones.length}</strong><small>飞书里程碑事实</small></div>
      <div><span>高风险</span><strong>{snapshot.risks.filter(item => item.level?.includes("高")).length}</strong><small>需优先应对</small></div>
      <div><span>未闭环行动</span><strong>{snapshot.actions.length}</strong><small>统一行动台账</small></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>DELIVERY PROMISE</p><h2>项目承诺与里程碑</h2></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>项目</th><th>客户承诺</th><th>当前预测</th><th>进度</th><th>状态</th></tr></thead><tbody>
        {snapshot.projects.map(item => <tr key={item.projectId}><td><Link href={`/projects/${item.projectId}?role=pm&data_class=${readStoredDataClass()}`}>{item.projectName}</Link><small>{item.externalProjectCode}</small></td><td>{text(item.commitment.customerDueDate)}</td><td>{text(item.commitment.forecastDueDate)}</td><td>{text(item.commitment.progress, "-")}%</td><td>{text(item.commitment.status)}</td></tr>)}
      </tbody></table>{snapshot.projects.length === 0 && <Empty>当前范围没有可稳定关联的项目承诺。</Empty>}</div>
      <div className={styles.recordGrid}>{snapshot.milestones.map(item => <article key={item.sourceRecordId}><div><DataBadge>{text(item.status)}</DataBadge><small>{item.projectName}</small></div><h3>{item.name}</h3><p>基线 {text(item.baselineDate)} · 预测 {text(item.forecastDate)}</p><footer>责任人：{text(item.owner)}</footer></article>)}</div>
    </section>
    <div className={styles.twoColumns}>
      <section className={styles.panel}><div className={styles.sectionHeading}><h2>风险焦点</h2><DataBadge tone="danger">{snapshot.risks.length}</DataBadge></div><div className={styles.list}>{snapshot.risks.map(item => <article key={item.sourceRecordId}><div><DataBadge tone={item.level?.includes("高") ? "danger" : "warning"}>{text(item.level)}</DataBadge><small>{item.projectName}</small></div><strong>{item.description}</strong><p>{text(item.status)} · {text(item.owner)} · {text(item.dueDate)}</p></article>)}{snapshot.risks.length === 0 && <Empty>没有已关联风险记录。</Empty>}</div></section>
      <section className={styles.panel}><div className={styles.sectionHeading}><h2>行动闭环</h2><DataBadge>{snapshot.actions.length}</DataBadge></div><div className={styles.list}>{snapshot.actions.map(item => <article key={item.id}><div><DataBadge tone={item.priority === "P0" ? "danger" : "neutral"}>{text(item.priority)}</DataBadge><small>{item.projectName}</small></div><strong>{item.title}</strong><p>{text(item.status)} · {text(item.owner)} · {text(item.dueDate)}</p></article>)}{snapshot.actions.length === 0 && <Empty>没有未闭环行动项。</Empty>}</div></section>
    </div>
  </>;
}

function OperationsView({ snapshot }: { snapshot: OperationsAssistantSnapshot }) {
  const outstanding = snapshot.receivables.reduce((sum, item) => sum + (item.outstandingAmount ?? 0), 0);
  const invoiced = snapshot.invoices.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const maxForecast = Math.max(1, ...snapshot.cashForecast.map(item => item.amount));
  return <>
    <section className={styles.kpis} aria-label="运营工作摘要">
      <div><span>合同</span><strong>{snapshot.contracts.length}</strong><small>已稳定关联</small></div>
      <div><span>累计开票</span><strong>{money(invoiced)}</strong><small>来自回款台账</small></div>
      <div><span>待回款</span><strong>{money(outstanding)}</strong><small>应收减实收</small></div>
      <div><span>待验收</span><strong>{snapshot.acceptances.filter(item => !item.status.includes("已验收")).length}</strong><small>影响现金闭环</small></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CONTRACT TO CASH</p><h2>合同到现金</h2></div><DataBadge>真实台账</DataBadge></div>
      <div className={styles.tableWrap}><table><thead><tr><th>项目 / 合同</th><th>合同金额</th><th>状态</th><th>付款条件</th></tr></thead><tbody>
        {snapshot.contracts.map(item => <tr key={item.sourceRecordId}><td>{item.projectName}<small>{item.contractCode}</small></td><td>{money(item.amount)}</td><td>{text(item.status)}</td><td>{text(item.paymentTerms)}</td></tr>)}
      </tbody></table>{snapshot.contracts.length === 0 && <Empty>合同表没有可稳定关联的记录。</Empty>}</div>
    </section>
    <div className={styles.twoColumns}>
      <section className={styles.panel}><div className={styles.sectionHeading}><h2>验收与开票</h2></div><div className={styles.list}>{snapshot.acceptances.map(item => <article key={`a-${item.sourceRecordId}`}><strong>{item.projectName}</strong><p>{item.status} · 计划 {text(item.plannedDate)} · 实际 {text(item.actualDate)}</p></article>)}{snapshot.invoices.map(item => <article key={`i-${item.sourceRecordId}`}><strong>{item.projectName} · {text(item.contractCode)}</strong><p>{text(item.status)} · {money(item.amount)} · {text(item.invoiceDate)}</p></article>)}{snapshot.acceptances.length + snapshot.invoices.length === 0 && <Empty>没有验收或开票事实。</Empty>}</div></section>
      <section className={styles.panel}><div className={styles.sectionHeading}><h2>应收与实收</h2><DataBadge tone="warning">待收 {money(outstanding)}</DataBadge></div><div className={styles.list}>{snapshot.receivables.map(item => <article key={item.sourceRecordId}><strong>{item.projectName} · {text(item.contractCode)}</strong><p>应收 {money(item.receivableAmount)} · 实收 {money(item.collectedAmount)} · 待收 {money(item.outstandingAmount)}</p><small>计划回款：{text(item.plannedCollectionDate)}</small></article>)}{snapshot.receivables.length === 0 && <Empty>回款表没有可稳定关联的记录。</Empty>}</div></section>
    </div>
    <section className={styles.panel}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>CASH FORECAST</p><h2>现金预测</h2></div><small>仅根据有日期且尚未收回的真实应收计算</small></div><div className={styles.forecast}>{snapshot.cashForecast.map(item => <div key={item.month}><span>{item.month}</span><div><i style={{ width: `${Math.max(3, item.amount / maxForecast * 100)}%` }} /></div><strong>{money(item.amount)}</strong><small>{item.recordCount} 笔</small></div>)}{snapshot.cashForecast.length === 0 && <Empty>缺少带计划回款日期的未收应收，无法生成现金预测。</Empty>}</div></section>
  </>;
}

export default function BusinessAssistantPage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [generatedAt, setGeneratedAt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("ai-pmo:business-context-changed", refresh);
    window.addEventListener("ai-pmo:data-class-changed", refresh);
    return () => { window.removeEventListener("ai-pmo:business-context-changed", refresh); window.removeEventListener("ai-pmo:data-class-changed", refresh); };
  }, []);

  const loadDrafts = useCallback(async (activeContext: StoredBusinessContext) => {
    const query = businessContextSearchParams(activeContext, readStoredDataClass());
    const response = await fetch(`/api/business-assistant/change-drafts?${query.toString()}`, { cache: "no-store" });
    const body = await response.json() as DraftsResponse;
    if (!response.ok) throw new Error(body.detail || "变化草稿读取失败。");
    setDrafts(body.drafts ?? []);
  }, []);

  const refreshDrafts = useCallback(async () => { if (context) await loadDrafts(context); }, [context, loadDrafts]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const contextResponse = await fetch("/api/context/current", { cache: "no-store" });
        const contextBody = await contextResponse.json() as ContextResponse;
        if (!contextResponse.ok) throw new Error(contextBody.detail || "无法读取当前业务身份。");
        const stored = readStoredBusinessContext();
        const assignment = contextBody.available_contexts?.find(item => item.id === stored?.assignmentId && item.status === "active")
          ?? contextBody.available_contexts?.find(item => item.id === contextBody.active_context?.assignmentId && item.status === "active");
        if (!assignment) throw new Error("尚未分配有效业务角色，请联系管理员。");
        if (assignment.businessRole !== "pm" && assignment.businessRole !== "operations") throw new Error("当前业务身份不是项目经理或运营，请在顶部切换角色后再使用业务助理。");
        const activeContext = { assignmentId: assignment.id, businessRole: assignment.businessRole, orgId: assignment.orgId, subjectScope: assignment.subjectScope, subjectId: assignment.subjectId };
        writeStoredBusinessContext(activeContext);
        const query = businessContextSearchParams(activeContext, readStoredDataClass());
        const [assistantResponse, draftsResponse] = await Promise.all([
          fetch(`/api/business-assistant?${query.toString()}`, { cache: "no-store" }),
          fetch(`/api/business-assistant/change-drafts?${query.toString()}`, { cache: "no-store" }),
        ]);
        const assistantBody = await assistantResponse.json() as AssistantResponse;
        const draftsBody = await draftsResponse.json() as DraftsResponse;
        if (!assistantResponse.ok) throw new Error(assistantBody.detail || "业务助理数据读取失败。");
        if (!draftsResponse.ok) throw new Error(draftsBody.detail || "变化草稿读取失败。");
        if (!cancelled) { setContext(activeContext); setSnapshot(assistantBody.snapshot ?? null); setDrafts(draftsBody.drafts ?? []); setGeneratedAt(assistantBody.generated_at ?? ""); }
      } catch (loadError) {
        if (!cancelled) { setSnapshot(null); setError(loadError instanceof Error ? loadError.message : "业务助理加载失败。"); }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [revision]);

  const warnings = snapshot?.source.warnings ?? [];
  const roleName = snapshot?.role === "pm" ? "项目经理" : snapshot?.role === "operations" ? "运营" : "业务";
  const targets = (snapshot?.draftTargets ?? []).filter(item => item.sourceType !== "action");
  const pending = useMemo(() => drafts.filter(item => item.status === "pending_confirmation").length, [drafts]);

  return <main className={styles.page}>
    <header className={styles.header}><div><Link href="/">← 返回主页</Link><p className={styles.eyebrow}>ROLE-BASED BUSINESS ASSISTANT</p><h1>{roleName}业务助理</h1><p>把交付事实、经营事实和责任动作放在同一条工作链上。</p><Link href="/business-assistant/operations-loop">进入 PM/运营联合检查与运行日历 →</Link></div><div className={styles.headerMeta}><DataBadge tone="success">无演示回退</DataBadge><DataBadge tone={pending > 0 ? "warning" : "neutral"}>{pending} 个待确认</DataBadge>{generatedAt && <small>更新于 {displayTime(generatedAt)}</small>}</div></header>
    {loading && <section className={styles.state}>正在核对业务身份、稳定项目映射和真实数据源…</section>}
    {!loading && error && <section className={`${styles.state} ${styles.errorState}`}><h2>业务助理暂不可用</h2><p>{error}</p><small>系统不会在真实来源不可用时展示样例数据。请检查业务角色、P17/P19 数据库迁移、稳定项目映射和个人飞书配置。</small></section>}
    {!loading && snapshot && context && <div className={styles.content}>
      {warnings.length > 0 && <aside className={styles.warnings}><strong>数据完整性提示</strong>{warnings.map(item => <p key={item}>{item}</p>)}</aside>}
      {snapshot.role === "pm" ? <PmView snapshot={snapshot} /> : <OperationsView snapshot={snapshot} />}
      <div className={styles.twoColumns}><DraftEditor targets={targets} context={context} onCreated={refreshDrafts} /><DraftQueue drafts={drafts} context={context} onChanged={refreshDrafts} /></div>
      <aside className={styles.boundary}><strong>写回边界</strong><p>“确认并入队”会在同一数据库事务中确认草稿并创建独立飞书Base写回预览。只有在集成中心完成二次人工确认、权限与当前事实复核后才更新。行动项不伪装成飞书写回，必须走Supabase统一行动台账的受控状态机。</p></aside>
    </div>}
  </main>;
}
