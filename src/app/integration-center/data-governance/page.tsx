"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  businessContextSearchParams,
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredDataClass,
  type StoredBusinessContext,
} from "@/features/operating-model/client-context";

type Recommendation = {
  quarantineId: string;
  domain: string;
  domainLabel: string;
  sourceRecordId: string;
  displayName: string;
  externalProjectCode: string | null;
  reasonCode: string;
  reasonDetail: string;
  status: string;
  occurrenceCount: number;
  lastSeenAt: string;
  recommendedDataClass: "production" | "sample" | "test" | "diagnostic" | "unclassified";
  recommendedDataClassLabel: string;
  confidence: "high" | "medium" | "manual";
  basis: string[];
  requiredChineseField: "数据分类";
  suggestedChineseValue: string;
  canBecomeFormalProject: boolean;
  classificationDraft: {
    id: string;
    status: "queued" | "writing" | "failed";
    targetDataClass: string;
    targetChineseValue: string;
    feishuConfirmationId: string | null;
    errorCode: string | null;
  } | null;
};

type GovernanceSnapshot = {
  status: string;
  warnings: string[];
  generated_at: string;
  data_class: string;
  data: {
    total: number;
    summary: {
      total: number;
      formalProjectCandidates: number;
      requiresManualDecision: number;
      byDomain: Array<{ domain: string; label: string; count: number }>;
      byRecommendation: Array<{ dataClass: string; label: string; count: number }>;
    };
    items: Recommendation[];
  };
};

const CLASS_STYLE: Record<string, { color: string; background: string }> = {
  production: { color: "var(--green)", background: "rgba(16,185,129,.12)" },
  sample: { color: "var(--accent2)", background: "rgba(59,130,246,.12)" },
  test: { color: "var(--amber)", background: "rgba(245,158,11,.12)" },
  diagnostic: { color: "#a78bfa", background: "rgba(139,92,246,.12)" },
  unclassified: { color: "var(--red)", background: "rgba(239,68,68,.10)" },
};

function short(value: string, maximum = 30) {
  return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
}

export default function FeishuDataGovernancePage() {
  const [context, setContext] = useState<StoredBusinessContext | null>(null);
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState("all");
  const [classification, setClassification] = useState("all");
  const [page, setPage] = useState(1);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState("");
  const [notice, setNotice] = useState("");

  const queryFor = useCallback((active: StoredBusinessContext, format = "") => {
    const query = businessContextSearchParams(active, readStoredDataClass());
    if (format) query.set("format", format);
    return query;
  }, []);

  const load = useCallback(async (active: StoredBusinessContext) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/integrations/feishu/quarantine-governance?${queryFor(active)}`, { cache: "no-store" });
      const body = await response.json() as GovernanceSnapshot & { error?: string; detail?: string };
      if (!response.ok || body.status !== "succeeded") throw new Error(body.detail || body.error || "飞书隔离数据治理台加载失败。");
      setSnapshot(body);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "飞书隔离数据治理台加载失败。");
    } finally {
      setLoading(false);
    }
  }, [queryFor]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      await loadCurrentBusinessContextSearchParams();
      const active = readStoredBusinessContext();
      if (cancelled) return;
      setContext(active);
      if (!active) {
        setLoading(false);
        setError("尚未分配有效业务角色，请先由管理员配置组织级 PMO 角色。");
        return;
      }
      await load(active);
    };
    void initialize();
    return () => { cancelled = true; };
  }, [load]);

  const visibleItems = useMemo(() => (snapshot?.data.items ?? []).filter(item => (
    (domain === "all" || item.domain === domain)
    && (classification === "all" || item.recommendedDataClass === classification)
  )), [classification, domain, snapshot?.data.items]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pagedItems = visibleItems.slice((safePage - 1) * pageSize, safePage * pageSize);

  const exportUrl = context ? `/api/integrations/feishu/quarantine-governance?${queryFor(context, "csv")}` : "#";
  const sampleCount = snapshot?.data.summary.byRecommendation.find(item => item.dataClass === "sample")?.count ?? 0;
  const productionCount = snapshot?.data.summary.byRecommendation.find(item => item.dataClass === "production")?.count ?? 0;

  const createClassificationConfirmation = useCallback(async (item: Recommendation) => {
    if (!context) return;
    const target = decisions[item.quarantineId] || (item.recommendedDataClass === "unclassified" ? "" : item.recommendedDataClass);
    if (!target) {
      setError("请先由数据负责人选择正式、样例、测试或诊断。");
      return;
    }
    const reason = (reasons[item.quarantineId] || (item.recommendedDataClass !== "unclassified"
      ? `依据来源标记和业务核对，归入${item.recommendedDataClassLabel}数据空间。` : "")).trim();
    if (reason.length < 4) {
      setError("必须填写分类依据，不能只选择结果。");
      return;
    }
    const productionAcknowledged = target === "production"
      ? window.confirm("“正式”只能用于真实业务数据。确认该记录不是样例或测试数据，并由你承担本次分类责任吗？")
      : false;
    if (target === "production" && !productionAcknowledged) return;
    setSubmittingId(item.quarantineId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/integrations/feishu/quarantine-governance?${queryFor(context)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarantine_id: item.quarantineId, target_data_class: target, reason, production_acknowledged: productionAcknowledged }),
      });
      const body = await response.json() as { status?: string; detail?: string; error?: string; data?: { confirmation_url?: string } };
      if (!response.ok) throw new Error(body.detail || body.error || "分类写回确认创建失败。");
      setNotice("分类决定已持久化并进入飞书高风险确认队列；当前尚未改写飞书。完成二次确认后，再按目标数据空间重新对账。");
      await load(context);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分类写回确认创建失败。");
    } finally {
      setSubmittingId("");
    }
  }, [context, decisions, load, queryFor, reasons]);

  return <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "15px 28px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/integration-center" style={{ color: "var(--text2)", textDecoration: "none" }}>← 返回数据与集成中心</Link>
      <strong style={{ color: "var(--accent2)" }}>飞书隔离数据分类治理台</strong>
      <span className="tag tag-blue">中文字段：数据分类</span>
      {context && <a className="btn-secondary" style={{ marginLeft: "auto", textDecoration: "none" }} href={exportUrl}>下载分类治理 CSV</a>}
    </header>
    <div style={{ maxWidth: 1480, margin: "0 auto", padding: 28 }}>
      <section className="card" style={{ background: "linear-gradient(135deg,rgba(59,130,246,.12),rgba(139,92,246,.09))" }}>
        <h1 style={{ margin: 0, fontSize: "1.55rem" }}>把“有隔离记录”变成可逐条执行的数据治理清单</h1>
        <p style={{ color: "var(--text2)", lineHeight: 1.75, marginBottom: 0 }}>系统依据飞书原始字段给出建议；数据负责人可在本页选择分类并生成写回确认，只有在独立确认队列完成高风险二次确认后才会修改飞书。系统绝不会把缺少证据的记录自动推断为正式业务数据。</p>
      </section>

      {loading && <section className="card" style={{ marginTop: 16 }}>正在读取隔离台账并计算分类建议…</section>}
      {error && <section className="card" style={{ marginTop: 16, color: "var(--red)", borderColor: "rgba(239,68,68,.35)" }}>{error}</section>}
      {notice && <section className="card" style={{ marginTop: 16, color: "var(--green)", borderColor: "rgba(16,185,129,.35)" }}>{notice}</section>}

      {snapshot && <>
        {snapshot.warnings.map(warning => <section key={warning} className="card" style={{ marginTop: 12, color: "var(--amber)", borderColor: "rgba(245,158,11,.36)" }}>{warning}</section>)}
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 16 }}>
          <article className="stat-card"><div className="stat-num">{snapshot.data.total}</div><div className="stat-label">待治理隔离记录</div></article>
          <article className="stat-card"><div className="stat-num">{sampleCount}</div><div className="stat-label">建议归入样例空间</div></article>
          <article className="stat-card"><div className="stat-num">{snapshot.data.summary.requiresManualDecision}</div><div className="stat-label">必须人工判断</div></article>
          <article className="stat-card"><div className="stat-num">{productionCount}</div><div className="stat-label">明确正式候选</div></article>
        </section>

        <section className="card" style={{ marginTop: 16, borderColor: productionCount === 0 ? "rgba(245,158,11,.42)" : "rgba(16,185,129,.42)" }}>
          <div className="section-title">当前正式试点结论</div>
          <p style={{ color: "var(--text2)", lineHeight: 1.75 }}>{productionCount === 0
            ? `当前没有任何记录具备“明确正式”证据。${sampleCount ? `其中 ${sampleCount} 条带有样例来源或测试标记，必须留在样例/测试空间。` : ""} 因此不能用这些记录冒充五个真实试点项目。`
            : `已有 ${productionCount} 条记录明确标注为正式；补齐飞书字段并重新对账后，仍需完成稳定项目授权与四角色真人匹配。`}</p>
          <ol style={{ color: "var(--text2)", lineHeight: 1.85, paddingLeft: 22, marginBottom: 0 }}>
            <li>数据负责人逐条核对建议；可下载CSV，也可直接在明细中选择分类并填写依据。</li>
            <li>创建写回确认后，前往飞书确认队列完成高风险二次确认；只允许写入中文字段“数据分类”。</li>
            <li>不要把带“样例来源/测试批次”的记录填写为正式。</li>
            <li>写回成功后系统自动对该记录执行目标数据空间定向对账，不扫描或墓碑化同表其他记录；若镜像未成功，确认事项保持失败可重试且不会重复改写飞书。</li>
            <li>数据与集成中心的“立即从飞书对账”继续用于八类事实全量复核，不再是单条分类闭环的必需人工步骤。</li>
          </ol>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "end", flexWrap: "wrap" }}>
            <div><div className="section-title">分类建议明细</div><p style={{ color: "var(--text2)", marginBottom: 0 }}>当前筛选 {visibleItems.length} / {snapshot.data.summary.total} 条；页面不返回原始整行数据，仅展示治理所需字段。</p></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="input" style={{ minWidth: 150 }} value={domain} onChange={event => { setDomain(event.target.value); setPage(1); }}><option value="all">全部数据表</option>{snapshot.data.summary.byDomain.map(item => <option key={item.domain} value={item.domain}>{item.label}（{item.count}）</option>)}</select>
              <select className="input" style={{ minWidth: 170 }} value={classification} onChange={event => { setClassification(event.target.value); setPage(1); }}><option value="all">全部分类建议</option>{snapshot.data.summary.byRecommendation.filter(item => item.count > 0).map(item => <option key={item.dataClass} value={item.dataClass}>{item.label}（{item.count}）</option>)}</select>
            </div>
          </div>
          <div style={{ overflowX: "auto", marginTop: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280, fontSize: ".78rem" }}>
              <thead><tr style={{ color: "var(--text2)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>{["数据表", "记录", "项目编号", "隔离原因", "分类建议", "建议依据", "飞书操作"].map(label => <th key={label} style={{ padding: "10px 8px" }}>{label}</th>)}</tr></thead>
              <tbody>{pagedItems.map(item => {
                const style = CLASS_STYLE[item.recommendedDataClass] ?? CLASS_STYLE.unclassified;
                return <tr key={item.quarantineId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "11px 8px", whiteSpace: "nowrap" }}>{item.domainLabel}</td>
                  <td style={{ padding: "11px 8px" }}><strong>{item.displayName}</strong><div title={item.sourceRecordId} style={{ color: "var(--text2)", marginTop: 4 }}>{short(item.sourceRecordId)}</div></td>
                  <td style={{ padding: "11px 8px" }}>{item.externalProjectCode || "—"}</td>
                  <td style={{ padding: "11px 8px" }}><span style={{ color: "var(--amber)" }}>{item.reasonCode}</span><div style={{ color: "var(--text2)", marginTop: 4, maxWidth: 250 }}>{item.reasonDetail}</div></td>
                  <td style={{ padding: "11px 8px" }}><span style={{ color: style.color, background: style.background, borderRadius: 999, padding: "4px 8px", whiteSpace: "nowrap" }}>{item.recommendedDataClassLabel}</span></td>
                  <td style={{ padding: "11px 8px", color: "var(--text2)", maxWidth: 320 }}>{item.basis.join("；")}</td>
                  <td style={{ padding: "11px 8px", minWidth: 270 }}>{item.classificationDraft ? <div>
                    <span className="tag tag-blue">{item.classificationDraft.status === "failed" ? "写回失败待恢复" : item.classificationDraft.status === "writing" ? "正在写回" : "等待二次确认"}</span>
                    <div style={{ marginTop: 7 }}>目标：“{item.requiredChineseField}”=<strong>{item.classificationDraft.targetChineseValue}</strong></div>
                    {item.classificationDraft.errorCode && <div style={{ color: "var(--red)", marginTop: 5 }}>{item.classificationDraft.errorCode}</div>}
                    {item.classificationDraft.feishuConfirmationId && <Link href={`/integration-center?confirmation_id=${encodeURIComponent(item.classificationDraft.feishuConfirmationId)}`} style={{ color: "var(--accent2)", display: "inline-block", marginTop: 7 }}>前往确认队列 →</Link>}
                  </div> : <div style={{ display: "grid", gap: 7 }}>
                    <select className="input" value={decisions[item.quarantineId] || (item.recommendedDataClass === "unclassified" ? "" : item.recommendedDataClass)} onChange={event => setDecisions(current => ({ ...current, [item.quarantineId]: event.target.value }))}>
                      <option value="">请选择分类</option><option value="production">正式</option><option value="sample">样例</option><option value="test">测试</option><option value="diagnostic">诊断</option>
                    </select>
                    <input className="input" value={reasons[item.quarantineId] ?? ""} onChange={event => setReasons(current => ({ ...current, [item.quarantineId]: event.target.value }))} placeholder={item.recommendedDataClass === "unclassified" ? "填写人工判断依据" : `可补充依据；默认采用“${item.recommendedDataClassLabel}”建议`} />
                    <button className="btn-secondary" type="button" disabled={submittingId === item.quarantineId} onClick={() => void createClassificationConfirmation(item)}>{submittingId === item.quarantineId ? "正在创建…" : "创建写回确认"}</button>
                  </div>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <span style={{ color: "var(--text2)", fontSize: ".78rem" }}>第 {safePage}/{pageCount} 页 · 每页最多 {pageSize} 条</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" type="button" disabled={safePage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>上一页</button>
              <button className="btn-secondary" type="button" disabled={safePage >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>下一页</button>
            </div>
          </div>
        </section>

        <section className="card" style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn-primary" href="/integration-center" style={{ textDecoration: "none" }}>返回数据与集成中心</Link>
          <Link className="btn-secondary" href="/operations-center/pilot-acceptance" style={{ textDecoration: "none" }}>查看正式试点门禁</Link>
          <span style={{ color: "var(--text2)", fontSize: ".78rem" }}>生成时间：{new Date(snapshot.generated_at).toLocaleString("zh-CN")}</span>
        </section>
      </>}
    </div>
  </main>;
}
