"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  loadCurrentBusinessContextSearchParams,
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
} from "@/features/operating-model/client-context";
import type { ProjectControlSnapshot } from "@/features/project-control/snapshot";

type Insight = { insights: string[]; rootCauses: string[]; recommendations: string[]; model?: string; warnings?: string[] };

const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 18 };
const healthColor = (value: string) => value === "red" ? "var(--red)" : value === "yellow" ? "var(--amber)" : value === "green" ? "var(--green)" : "var(--text2)";
const healthText = (value: string) => ({ red: "红灯", yellow: "黄灯", green: "绿灯", unknown: "待数据" }[value] || value);

export default function MonitoringPage() {
  const [snapshot, setSnapshot] = useState<ProjectControlSnapshot | null>(null);
  const [sourceDetail, setSourceDetail] = useState("正在读取当前项目的真实监控事实…");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [insight, setInsight] = useState<Insight | null>(null);

  const loadSnapshot = useCallback(async () => {
    setLoading(true); setInsight(null);
    try {
      const projectId = readStoredCurrentProject();
      const context = readStoredBusinessContext();
      if (!projectId || !context?.businessRole) throw new Error("请先在顶部选择已授权项目和业务角色。");
      const params = await loadCurrentBusinessContextSearchParams();
      params.set("project_id", projectId);
      params.set("business_role", context.businessRole);
      params.set("data_class", readStoredDataClass());
      const response = await fetch(`/api/monitoring?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { data?: ProjectControlSnapshot; source?: { detail?: string }; warnings?: string[]; detail?: string; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.detail || payload.error || "监控事实读取失败。");
      setSnapshot(payload.data);
      setSourceDetail(payload.source?.detail || "真实项目事实已连接。");
      setWarnings(payload.warnings || []);
    } catch (error) {
      setSnapshot(null); setWarnings([]); setSourceDetail(error instanceof Error ? error.message : "监控事实不可用。");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSnapshot(), 0);
    const reload = () => void loadSnapshot();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ai-pmo:project-context-changed", reload);
      window.removeEventListener("ai-pmo:business-context-changed", reload);
      window.removeEventListener("ai-pmo:data-class-changed", reload);
    };
  }, [loadSnapshot]);

  const analyse = async () => {
    const projectId = readStoredCurrentProject();
    const context = readStoredBusinessContext();
    if (!projectId || !context?.businessRole) return;
    setAnalysing(true);
    try {
      const response = await fetch("/api/monitoring", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "generate_monitoring_insight",
          project_id: projectId,
          business_role: context.businessRole,
          data_class: readStoredDataClass(),
          idempotency_key: `monitoring:${projectId}:${new Date().toISOString().slice(0, 13)}`,
          expected_version: 0,
        }),
      });
      const payload = await response.json() as Insight & { detail?: string; error?: string };
      if (!response.ok) throw new Error(payload.detail || payload.error || "监控分析失败。");
      setInsight(payload);
    } catch (error) {
      setWarnings(items => [...items, error instanceof Error ? error.message : "监控分析失败。"]) ;
    } finally { setAnalysing(false); }
  };

  const metrics = snapshot ? [
    ["任务进度", `${snapshot.execution.progress}%`, `${snapshot.execution.blocked_tasks} 阻塞 / ${snapshot.execution.overdue_tasks} 逾期`],
    ["延期里程碑", snapshot.schedule.delayed_milestones, `里程碑共 ${snapshot.execution.milestones.length}`],
    ["重大风险", snapshot.governance.open_high_risks, `未关闭问题 ${snapshot.governance.open_issues}`],
    ["质量与验收", snapshot.quality.open_defects, `待验收 ${snapshot.quality.pending_acceptances}`],
    ["统一行动项", snapshot.governance.open_actions, `待变更 ${snapshot.governance.pending_changes}`],
    ["收尾门禁", snapshot.closure.ready ? "可收尾" : "未就绪", snapshot.closure.status],
  ] : [];

  return <div className="monitor-page">
    <header className="monitor-header">
      <div><Link href="/">← 返回首页</Link><h1>监控中心</h1><p>当前项目的执行、进度、风险、质量、行动和收尾统一事实面。</p></div>
      <div className="header-actions"><button onClick={() => void loadSnapshot()} disabled={loading}>{loading ? "读取中…" : "刷新事实"}</button><button className="primary" onClick={() => void analyse()} disabled={!snapshot || analysing}>{analysing ? "AI分析中…" : "AI监控分析"}</button></div>
    </header>

    <main>
      <section className={`source ${snapshot ? "ready" : "attention"}`}>
        <strong>{snapshot ? `${snapshot.project.name} · 飞书业务事实 / Supabase镜像` : "当前项目尚未连接"}</strong>
        <span>{sourceDetail}</span>
        {snapshot?.source.latest_source_updated_at && <small>最近源更新时间：{new Date(snapshot.source.latest_source_updated_at).toLocaleString("zh-CN")}</small>}
        {warnings.map((item, index) => <small key={`${item}-${index}`}>⚠ {item}</small>)}
      </section>

      {!snapshot ? <section style={card}><h2>需要完成业务上下文</h2><p>{sourceDetail}</p><Link href="/workbench">前往角色工作台选择项目 →</Link></section> : <>
        <section className="health-grid">
          {Object.entries(snapshot.health).map(([key, value]) => <article key={key} style={card}>
            <span>{({ overall: "总体", schedule: "进度", quality: "质量", risk: "风险", governance: "治理" } as Record<string, string>)[key]}</span>
            <strong style={{ color: healthColor(value) }}>{healthText(value)}</strong>
          </article>)}
        </section>

        <section className="metric-grid">{metrics.map(([label, value, note]) => <article key={String(label)} style={card}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>)}</section>

        <section className="two-column">
          <article style={card}>
            <div className="section-title"><div><h2>异常池</h2><p>从同一项目事实自动聚合，按严重度和期限排序。</p></div><span>{snapshot.exceptions.length} 项</span></div>
            <div className="list">
              {snapshot.exceptions.map(item => <div className="list-row" key={item.id}>
                <i className={`severity ${item.severity}`} />
                <div><strong>{item.title}</strong><small>{item.domain} · {item.status || "待处理"} · 来源 {item.source.table}</small></div>
                <div className="right"><span>{item.owner || "待分配"}</span><small>{item.deadline || "未设期限"}</small></div>
              </div>)}
              {snapshot.exceptions.length === 0 && <p className="empty">当前没有异常；若业务实际存在事项，请先检查飞书对账和数据质量。</p>}
            </div>
          </article>

          <article style={card}>
            <div className="section-title"><div><h2>统一行动项</h2><p>风险、问题、变更、会议和治理动作共同进入一个责任台账。</p></div><Link href="/issue-change">进入管理</Link></div>
            <div className="list">
              {snapshot.governance.actions.filter(row => !["done", "closed", "cancelled"].includes(String(row.status))).slice(0, 12).map(row => <div className="list-row" key={String(row.id)}>
                <i className={`priority ${String(row.priority || "P1").toLowerCase()}`} />
                <div><strong>{String(row.title || "未命名行动")}</strong><small>{String(row.source_type || "manual")} · {String(row.status || "open")}</small></div>
                <div className="right"><span>{String(row.owner || "待分配")}</span><small>{String(row.due_date || "未设期限")}</small></div>
              </div>)}
              {snapshot.governance.open_actions === 0 && <p className="empty">当前没有未完成行动项。</p>}
            </div>
          </article>
        </section>

        <section className="two-column">
          <article style={card}><h2>进度与绩效</h2><dl><dt>任务</dt><dd>{snapshot.execution.completed_tasks}/{snapshot.execution.total_tasks} 已完成</dd><dt>关键路径</dt><dd>{snapshot.schedule.latest_snapshot ? "已有正式计算快照" : "尚未生成正式快照"}</dd><dt>EVM</dt><dd>{snapshot.performance.latest_evm ? `SPI ${String(snapshot.performance.latest_evm.spi ?? "-")} / CPI ${String(snapshot.performance.latest_evm.cpi ?? "-")}` : "尚未生成正式EVM快照"}</dd></dl></article>
          <article style={card}><h2>质量与收尾</h2><dl><dt>缺陷</dt><dd>{snapshot.quality.open_defects} 未关闭</dd><dt>验收</dt><dd>{snapshot.quality.pending_acceptances} 待完成</dd><dt>收尾</dt><dd>{snapshot.closure.ready ? "已通过正式门禁" : `阻塞项 ${snapshot.closure.blockers.length}`}</dd></dl><Link href="/closure-knowledge">进入收尾与知识复用 →</Link></article>
        </section>

        {insight && <section style={card} className="insight"><div className="section-title"><div><h2>AI监控分析</h2><p>依据当前服务器项目快照生成，模型：{insight.model || "当前配置模型"}</p></div></div><div className="insight-grid"><div><h3>核心洞察</h3>{insight.insights.map(item => <p key={item}>{item}</p>)}</div><div><h3>根因提示</h3>{insight.rootCauses.map(item => <p key={item}>{item}</p>)}</div><div><h3>行动建议</h3>{insight.recommendations.map(item => <p key={item}>{item}</p>)}</div></div></section>}
      </>}
    </main>

    <style jsx>{`
      .monitor-page{min-height:100vh;background:var(--bg);color:var(--text)}
      .monitor-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:24px 32px;border-bottom:1px solid var(--border);background:var(--surface)}
      .monitor-header a,.section-title a,main a{color:var(--accent);text-decoration:none}.monitor-header h1{margin:8px 0 4px;font-size:1.65rem}.monitor-header p,.section-title p{margin:0;color:var(--text2);font-size:.84rem}.header-actions{display:flex;gap:10px}.header-actions button{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:9px;padding:9px 14px}.header-actions .primary{background:var(--accent);color:white;border-color:var(--accent)}button:disabled{opacity:.5}
      main{max-width:1440px;margin:0 auto;padding:24px 32px}.source{display:flex;flex-direction:column;gap:5px;padding:13px 16px;border-radius:12px;margin-bottom:18px;font-size:.84rem}.source.ready{background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25)}.source.attention{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25)}.source span,.source small{color:var(--text2)}
      .health-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:12px}.health-grid article{display:flex;align-items:center;justify-content:space-between}.health-grid strong{font-size:1.15rem}.health-grid span,.metric-grid span{color:var(--text2);font-size:.78rem}
      .metric-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:18px}.metric-grid article{display:flex;flex-direction:column;gap:7px}.metric-grid strong{font-size:1.5rem}.metric-grid small{color:var(--text2)}
      .two-column{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.section-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}.section-title h2,article h2{margin:0 0 4px;font-size:1rem}.section-title>span{padding:3px 9px;border-radius:99px;background:var(--surface2);font-size:.75rem}
      .list{display:flex;flex-direction:column}.list-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 0;border-top:1px solid var(--border)}.list-row:first-child{border-top:0}.list-row div{display:flex;flex-direction:column;gap:3px;min-width:0}.list-row strong{font-size:.83rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.list-row small{color:var(--text2);font-size:.7rem}.list-row .right{text-align:right}.severity,.priority{width:8px;height:8px;border-radius:50%}.severity.critical,.severity.high,.priority.p0{background:var(--red)}.severity.medium,.priority.p1{background:var(--amber)}.severity.low,.priority.p2{background:var(--accent)}.empty{color:var(--text2);font-size:.82rem}
      dl{display:grid;grid-template-columns:92px 1fr;gap:10px;margin:16px 0}dt{color:var(--text2);font-size:.78rem}dd{margin:0;font-size:.84rem}.insight{margin-bottom:20px}.insight-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.insight-grid h3{font-size:.82rem}.insight-grid p{font-size:.78rem;line-height:1.55;color:var(--text2);padding-left:10px;border-left:2px solid var(--accent)}
      @media(max-width:760px){.monitor-header{align-items:flex-start;flex-direction:column;padding:18px}.header-actions{width:100%}.header-actions button{flex:1}main{padding:16px}.health-grid{grid-template-columns:repeat(2,1fr)}.metric-grid{grid-template-columns:repeat(2,1fr)}.two-column,.insight-grid{grid-template-columns:1fr}.list-row{grid-template-columns:8px minmax(0,1fr)}.list-row .right{grid-column:2;text-align:left;flex-direction:row;gap:8px}.health-grid article:last-child{grid-column:1/-1}}
    `}</style>
  </div>;
}
