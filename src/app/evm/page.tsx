"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from "@/features/operating-model/client-context";

type Baseline = { id: string; title: string; status: string; baseline_value: number; currency?: string | null; effective_date?: string | null };
type Wbs = { id: string; revision_no: number; status: string; version: number; title: string };
type Period = { period: string; plannedValue: number; earnedValue: number; actualCost: number };
type EvmResult = { bac: number; pv: number; ev: number; ac: number; sv: number; cv: number; spi: number; cpi: number; eac: number; etc: number; vac: number; periods: Period[]; analysis?: string; model?: string | null };
type Snapshot = { id: string; snapshot_version: number; as_of_date: string; result: EvmResult; created_at: string };

export default function EvmPage() {
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [wbs, setWbs] = useState<Wbs | null>(null);
  const [actualCount, setActualCount] = useState(0);
  const [costCount, setCostCount] = useState(0);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [result, setResult] = useState<EvmResult | null>(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pm" });
      if (!params.get("project_id")) throw new Error("请先选择已授权项目。");
      const response = await fetch(`/api/evm?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { baseline?: Baseline | null; wbs?: Wbs | null; actuals?: unknown[]; costs?: unknown[]; snapshots?: Snapshot[]; latest?: Snapshot | null }; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "EVM数据读取失败");
      setBaseline(payload.data?.baseline ?? null);
      setWbs(payload.data?.wbs ?? null);
      setActualCount(payload.data?.actuals?.length ?? 0);
      setCostCount(payload.data?.costs?.length ?? 0);
      setSnapshots(payload.data?.snapshots ?? []);
      setResult(payload.data?.latest?.result ?? null);
      if (payload.data?.latest?.as_of_date) setAsOfDate(payload.data.latest.as_of_date);
      setMessage("");
    } catch (error) {
      setBaseline(null); setWbs(null); setActualCount(0); setCostCount(0); setSnapshots([]); setResult(null);
      setMessage(error instanceof Error ? error.message : "EVM数据源不可用");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void loadData(), 0);
    const reload = () => void loadData();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("ai-pmo:project-context-changed", reload);
      window.removeEventListener("ai-pmo:business-context-changed", reload);
      window.removeEventListener("ai-pmo:data-class-changed", reload);
    };
  }, [loadData]);

  const calculate = async () => {
    const context = readStoredBusinessContext();
    const projectId = readStoredCurrentProject();
    if (!context?.businessRole || !projectId || !wbs) return setMessage("请先完成已批准WBS。");
    setCalculating(true);
    try {
      const response = await fetch("/api/evm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "calculate", project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: wbs.version, idempotency_key: `v631:evm:${projectId}:${crypto.randomUUID()}`, as_of_date: asOfDate }) });
      const payload = await response.json() as { data?: { result?: EvmResult }; warnings?: string[]; detail?: string; error?: string };
      if (!response.ok || !payload.data?.result) throw new Error(payload.detail || payload.error || "EVM计算失败");
      setResult(payload.data.result);
      setMessage(payload.warnings?.[0] || "EVM已按批准成本基准、WBS实绩和成本台账重新计算并保存快照。");
      await loadData();
    } catch (error) { setMessage(`计算失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setCalculating(false); }
  };

  const blockers = useMemo(() => [!baseline && "缺少已批准成本基准", !wbs && "缺少已批准WBS", actualCount === 0 && "缺少工作包实绩", costCount === 0 && "缺少成本台账实绩"].filter(Boolean) as string[], [baseline, wbs, actualCount, costCount]);

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}><Link href="/">← 返回首页</Link><strong>📈 挣值管理（EVM）</strong><span className="tag tag-blue">真实基准 + 实绩 + 成本</span><span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{snapshots[0] ? `快照 #${snapshots[0].snapshot_version}` : "尚无正式快照"}</span></header>
    <main style={{ maxWidth: 1400, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ padding: 14, marginBottom: 18, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <section className="card" style={{ padding: 20, marginBottom: 20 }}><div style={{ display: "flex", alignItems: "end", gap: 14, flexWrap: "wrap" }}><div style={{ flex: 1 }}><h2 style={{ marginTop: 0 }}>计算前置条件</h2><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10 }}><SourceState label="批准成本基准" ok={Boolean(baseline)} detail={baseline ? `${baseline.title} · ${baseline.baseline_value} ${baseline.currency || ""}` : "请在规划中心保存并批准"} /><SourceState label="批准WBS" ok={Boolean(wbs)} detail={wbs ? `R${wbs.revision_no} · v${wbs.version}` : "请在WBS页面完成审批"} /><SourceState label="工作包实绩" ok={actualCount > 0} detail={`${actualCount}条`} /><SourceState label="成本台账" ok={costCount > 0} detail={`${costCount}条真实成本记录`} /></div></div><div><label className="label">统计截止日</label><input className="input" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} /><button className="btn btn-primary" style={{ marginTop: 10, width: "100%" }} onClick={calculate} disabled={calculating || blockers.length > 0}>{calculating ? "计算中…" : "计算并保存EVM"}</button></div></div>{blockers.length > 0 && !loading && <p style={{ color: "var(--red)", marginBottom: 0 }}>当前不能形成正式EVM：{blockers.join("；")}。</p>}</section>

      {result && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}><Metric label="BAC" value={result.bac} /><Metric label="PV" value={result.pv} /><Metric label="EV" value={result.ev} /><Metric label="AC" value={result.ac} /><Metric label="SPI" value={result.spi} alert={result.spi < 1} /><Metric label="CPI" value={result.cpi} alert={result.cpi < 1} /><Metric label="EAC" value={result.eac} alert={result.eac > result.bac} /><Metric label="VAC" value={result.vac} alert={result.vac < 0} /></section>
        <section className="card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>累计趋势</h2><p style={{ color: "var(--text2)" }}>蓝色PV、绿色EV、橙色AC均来自当前正式快照的期间事实。</p><EvmCurve periods={result.periods} /></section>
        <section className="card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>期间明细</h2><div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}><thead><tr>{["期间", "计划价值PV", "挣值EV", "实际成本AC", "进度偏差", "成本偏差"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead><tbody>{result.periods.map((period) => <tr key={period.period}><td style={{ padding: 9 }}>{period.period}</td><td>{period.plannedValue.toFixed(2)}</td><td>{period.earnedValue.toFixed(2)}</td><td>{period.actualCost.toFixed(2)}</td><td style={{ color: period.earnedValue - period.plannedValue < 0 ? "var(--red)" : "var(--green)" }}>{(period.earnedValue - period.plannedValue).toFixed(2)}</td><td style={{ color: period.earnedValue - period.actualCost < 0 ? "var(--red)" : "var(--green)" }}>{(period.earnedValue - period.actualCost).toFixed(2)}</td></tr>)}</tbody></table></div></section>
        <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>绩效分析</h2><div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75 }}>{result.analysis || "暂无AI解释；确定性指标已保存。"}</div><p style={{ color: "var(--text2)", fontSize: 13 }}>AI仅解释系统计算结果，不可覆盖指标或替代人工纠偏决策。</p></section>
      </>}
    </main>
  </div>;
}

function SourceState({ label, ok, detail }: { label: string; ok: boolean; detail: string }) { return <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}><strong style={{ color: ok ? "var(--green)" : "var(--red)" }}>{ok ? "✓" : "!"} {label}</strong><div style={{ color: "var(--text2)", fontSize: 13, marginTop: 5 }}>{detail}</div></div>; }
function Metric({ label, value, alert }: { label: string; value: number; alert?: boolean }) { return <div className="card" style={{ padding: 16 }}><div style={{ color: "var(--text2)", fontSize: 12 }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800, color: alert ? "var(--red)" : "var(--accent)", marginTop: 5 }}>{Number(value).toFixed(label === "SPI" || label === "CPI" ? 2 : 1)}</div></div>; }

function EvmCurve({ periods }: { periods: Period[] }) {
  if (!periods.length) return <p>暂无期间数据</p>;
  const cumulative = periods.reduce<Array<Period>>((rows, period) => { const prior = rows.at(-1); rows.push({ period: period.period, plannedValue: (prior?.plannedValue || 0) + period.plannedValue, earnedValue: (prior?.earnedValue || 0) + period.earnedValue, actualCost: (prior?.actualCost || 0) + period.actualCost }); return rows; }, []);
  const width = Math.max(720, cumulative.length * 120); const height = 300; const left = 54; const top = 24; const bottom = 42; const plotWidth = width - left - 30; const plotHeight = height - top - bottom; const max = Math.max(1, ...cumulative.flatMap((row) => [row.plannedValue, row.earnedValue, row.actualCost]));
  const point = (value: number, index: number) => `${left + (cumulative.length === 1 ? plotWidth / 2 : index * plotWidth / (cumulative.length - 1))},${top + plotHeight - value / max * plotHeight}`;
  return <div style={{ overflowX: "auto" }}><svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="EVM累计趋势图"><line x1={left} y1={top} x2={left} y2={top + plotHeight} stroke="var(--text2)" /><line x1={left} y1={top + plotHeight} x2={width - 30} y2={top + plotHeight} stroke="var(--text2)" />{[0, .25, .5, .75, 1].map((ratio) => <g key={ratio}><line x1={left} y1={top + plotHeight * (1 - ratio)} x2={width - 30} y2={top + plotHeight * (1 - ratio)} stroke="var(--border)" /><text x={5} y={top + plotHeight * (1 - ratio) + 4} fill="var(--text2)" fontSize="11">{(max * ratio).toFixed(0)}</text></g>)}<polyline points={cumulative.map((row, index) => point(row.plannedValue, index)).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="3" /><polyline points={cumulative.map((row, index) => point(row.earnedValue, index)).join(" ")} fill="none" stroke="var(--green)" strokeWidth="3" /><polyline points={cumulative.map((row, index) => point(row.actualCost, index)).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="3" />{cumulative.map((row, index) => <text key={row.period} x={Number(point(0, index).split(",")[0])} y={height - 15} fill="var(--text2)" fontSize="11" textAnchor="middle">{row.period}</text>)}<text x={width - 210} y={18} fill="var(--accent)" fontSize="12">● PV</text><text x={width - 145} y={18} fill="var(--green)" fontSize="12">● EV</text><text x={width - 80} y={18} fill="#f59e0b" fontSize="12">● AC</text></svg></div>;
}
