"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from "@/features/operating-model/client-context";
import { buildCriticalPathNetworkLayout } from "@/lib/cpm-network";

type WbsVersion = { id: string; revision_no: number; title: string; status: string; version: number; updated_at: string };
type WbsTask = { id: string; item_code: string; name: string; duration_days: number; predecessors: string[]; planned_start?: string | null; planned_end?: string | null };
type ResultTask = { id: string; name: string; duration: number; predecessors: string[]; es: number; ef: number; ls: number; lf: number; totalFloat: number; isCritical: boolean };
type CpmResult = { tasks: ResultTask[]; criticalPath: string[]; projectDuration: number; criticalDuration: number; reasoning?: string; model?: string | null; inputHash?: string };
type Snapshot = { id: string; calculation_version: number; result: CpmResult; created_at: string };

export default function CpmPage() {
  const [wbs, setWbs] = useState<WbsVersion | null>(null);
  const [tasks, setTasks] = useState<WbsTask[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [result, setResult] = useState<CpmResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = await loadCurrentBusinessContextSearchParams({ preferredRole: "pm" });
      if (!params.get("project_id")) throw new Error("请先选择已授权项目。");
      const response = await fetch(`/api/cpm?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: { wbs?: WbsVersion | null; items?: WbsTask[]; snapshots?: Snapshot[]; latest?: Snapshot | null }; detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "关键路径数据读取失败");
      setWbs(payload.data?.wbs ?? null);
      setTasks(payload.data?.items ?? []);
      setSnapshots(payload.data?.snapshots ?? []);
      setResult(payload.data?.latest?.result ?? null);
      setMessage("");
    } catch (error) {
      setWbs(null); setTasks([]); setSnapshots([]); setResult(null);
      setMessage(error instanceof Error ? error.message : "关键路径数据源不可用");
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
    if (!context?.businessRole || !projectId || !wbs) return setMessage("请先保存当前项目的WBS版本。");
    setCalculating(true);
    try {
      const response = await fetch("/api/cpm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "calculate", project_id: projectId, business_role: context.businessRole, data_class: readStoredDataClass(), expected_version: wbs.version, idempotency_key: `v631:cpm:${projectId}:${crypto.randomUUID()}` }) });
      const payload = await response.json() as { data?: { result?: CpmResult }; detail?: string; error?: string; warnings?: string[] };
      if (!response.ok || !payload.data?.result) throw new Error(payload.detail || payload.error || "关键路径计算失败");
      setResult(payload.data.result);
      setMessage(payload.warnings?.[0] || "已从当前项目持久化WBS重新计算并保存CPM快照。");
      await loadData();
    } catch (error) { setMessage(`计算失败：${error instanceof Error ? error.message : "未知错误"}`); }
    finally { setCalculating(false); }
  };

  return <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
    <header style={{ padding: "14px 28px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      <Link href="/">← 返回首页</Link><strong>🔗 关键路径计算</strong><span className="tag tag-purple">确定性CPM + AI解释</span>
      <span style={{ marginLeft: "auto", color: "var(--text2)", fontSize: 13 }}>{wbs ? `WBS R${wbs.revision_no} · ${wbs.status} · v${wbs.version}` : "无持久化WBS"}</span>
    </header>
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: 28 }}>
      {message && <div className="card" style={{ padding: 14, marginBottom: 18, borderLeft: "4px solid var(--accent)" }}>{message}</div>}
      <section className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>当前项目WBS输入</h2><p style={{ color: "var(--text2)", marginBottom: 0 }}>任务、工期和前置关系只读自当前项目已保存WBS；本页不能临时改写任务来影响正式结果。</p></div><button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={calculate} disabled={calculating || !wbs || tasks.length === 0}>{calculating ? "计算并保存中…" : "从WBS重新计算"}</button></div>
        <div style={{ overflowX: "auto", marginTop: 16 }}><table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}><thead><tr>{["编码", "工作包", "工期(天)", "前置工作包", "计划开始", "计划完成"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td style={{ padding: 9 }}>{task.item_code}</td><td>{task.name}</td><td>{task.duration_days}</td><td>{task.predecessors?.join("、") || "无"}</td><td>{task.planned_start || "—"}</td><td>{task.planned_end || "—"}</td></tr>)}</tbody></table></div>
        {!loading && tasks.length === 0 && <p style={{ color: "var(--text2)" }}>尚无可计算的持久化WBS工作包，请先前往<Link href="/wbs">WBS页面</Link>录入并保存。</p>}
      </section>

      {result && <>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 20 }}>
          <Metric label="项目总工期" value={`${result.projectDuration}天`} tone="var(--accent)" />
          <Metric label="关键活动数" value={String(result.criticalPath.length)} tone="var(--red)" />
          <Metric label="任务总数" value={String(result.tasks.length)} tone="var(--purple)" />
          <Metric label="快照版本" value={snapshots[0] ? `#${snapshots[0].calculation_version}` : "—"} tone="var(--green)" />
        </section>
        <CriticalPathNetwork tasks={result.tasks} criticalPath={result.criticalPath} />
        <section className="card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>关键路径与调度解释</h2><p style={{ fontSize: 18, color: "var(--red)", fontWeight: 700 }}>{result.criticalPath.join(" → ") || "未识别"}</p><div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{result.reasoning || "系统已完成确定性计算，暂无AI解释。"}</div></section>
        <section className="card" style={{ padding: 20, overflowX: "auto" }}><h2 style={{ marginTop: 0 }}>CPM计算明细</h2><table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}><thead><tr>{["任务", "工期", "ES", "EF", "LS", "LF", "总浮动", "关键"].map((label) => <th key={label} style={{ textAlign: "left", padding: 9, borderBottom: "1px solid var(--border)" }}>{label}</th>)}</tr></thead><tbody>{result.tasks.map((task) => <tr key={task.id} style={{ color: task.isCritical ? "var(--red)" : "inherit" }}><td style={{ padding: 9 }}>{task.id} {task.name}</td><td>{task.duration}</td><td>{task.es}</td><td>{task.ef}</td><td>{task.ls}</td><td>{task.lf}</td><td>{task.totalFloat}</td><td>{task.isCritical ? "是" : "否"}</td></tr>)}</tbody></table></section>
      </>}
    </main>
  </div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) { return <div className="card" style={{ padding: 18 }}><div style={{ color: "var(--text2)", fontSize: 13 }}>{label}</div><div style={{ color: tone, fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div></div>; }

function CriticalPathNetwork({ tasks, criticalPath }: { tasks: ResultTask[]; criticalPath: string[] }) {
  if (!tasks.length) return null;
  const sortedTasks = [...tasks].sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
  const layout = buildCriticalPathNetworkLayout(sortedTasks, criticalPath);
  return <section className="card" style={{ padding: 20, marginBottom: 20 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}><div><h2 style={{ margin: 0 }}>关键路径网络图</h2><p style={{ color: "var(--text2)" }}>节点按依赖层级排列，折线在节点间通道绕行；红色表示关键路径。</p></div><div><span style={{ color: "var(--red)" }}>● 关键活动</span>　<span style={{ color: "var(--accent)" }}>● 非关键活动</span></div></div><div style={{ overflowX: "auto" }}><svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="关键路径网络图"><defs><marker id="cpm-arrow-critical" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0,0 L0,8 L10,4 z" fill="var(--red)" /></marker><marker id="cpm-arrow-normal" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0,0 L0,8 L10,4 z" fill="var(--text2)" /></marker></defs>{layout.edges.map((edge) => <path key={`${edge.fromId}-${edge.toId}`} d={edge.path} fill="none" stroke={edge.isCritical ? "var(--red)" : "var(--text2)"} strokeWidth={edge.isCritical ? 2.6 : 1.4} strokeOpacity={edge.isCritical ? 0.95 : 0.5} markerEnd={edge.isCritical ? "url(#cpm-arrow-critical)" : "url(#cpm-arrow-normal)"} />)}{sortedTasks.map((task) => { const position = layout.positions.get(task.id)!; return <g key={task.id} transform={`translate(${position.x},${position.y})`}><rect width={layout.nodeWidth} height={layout.nodeHeight} rx="10" fill={task.isCritical ? "rgba(239,68,68,.12)" : "rgba(59,130,246,.1)"} stroke={task.isCritical ? "var(--red)" : "var(--accent)"} strokeWidth={task.isCritical ? 2 : 1.4} /><text x="14" y="20" fill={task.isCritical ? "var(--red)" : "var(--accent2)"} fontSize="13" fontWeight="800">{task.id}</text><text x="44" y="20" fill="var(--text)" fontSize="12" fontWeight="700">{task.name.length > 12 ? `${task.name.slice(0, 12)}…` : task.name}</text><text x="14" y="42" fill="var(--text2)" fontSize="11">ES {task.es} / EF {task.ef} · {task.duration}天</text><text x="14" y="58" fill="var(--text2)" fontSize="10">LS {task.ls} / LF {task.lf} · 浮动 {task.totalFloat}</text></g>; })}</svg></div></section>;
}
