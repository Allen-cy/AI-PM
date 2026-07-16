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
        <p style={{ color: "var(--text2)", lineHeight: 1.75, marginBottom: 0 }}>系统只依据飞书原始字段给出分类建议，不修改源表、不代替业务负责人确认，也绝不会把缺少证据的记录自动推断为正式业务数据。完成飞书中文字段“数据分类”后，再回到集成中心重新对账。</p>
      </section>

      {loading && <section className="card" style={{ marginTop: 16 }}>正在读取隔离台账并计算分类建议…</section>}
      {error && <section className="card" style={{ marginTop: 16, color: "var(--red)", borderColor: "rgba(239,68,68,.35)" }}>{error}</section>}

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
            <li>下载分类治理 CSV，由数据负责人核对每条建议。</li>
            <li>回到对应飞书智能表，新增或补齐中文字段“数据分类”，只允许：正式、样例、测试、诊断。</li>
            <li>不要把带“样例来源/测试批次”的记录填写为正式。</li>
            <li>返回数据与集成中心执行“立即从飞书对账”，隔离记录通过门禁后会自动关闭。</li>
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980, fontSize: ".78rem" }}>
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
                  <td style={{ padding: "11px 8px" }}>填写“{item.requiredChineseField}”=<strong>{item.suggestedChineseValue}</strong></td>
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
          <Link className="btn-primary" href="/integration-center" style={{ textDecoration: "none" }}>返回并重新对账</Link>
          <Link className="btn-secondary" href="/operations-center/pilot-acceptance" style={{ textDecoration: "none" }}>查看正式试点门禁</Link>
          <span style={{ color: "var(--text2)", fontSize: ".78rem" }}>生成时间：{new Date(snapshot.generated_at).toLocaleString("zh-CN")}</span>
        </section>
      </>}
    </div>
  </main>;
}
