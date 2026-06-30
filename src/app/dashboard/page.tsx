"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buildDashboardData, DEFAULT_DASHBOARD_DATA, normalizeProjectRows } from "@/features/dashboard/normalizer";
import type { DashboardData } from "@/features/dashboard/types";
import { feishuTableUrl } from "@/features/feishu/links";

const DASHBOARD_CACHE_KEY = "ai-pmo-dashboard-data-v3";
const LEGACY_DASHBOARD_CACHE_KEYS = ["ai-pmo-dashboard-data", "ai-pmo-dashboard-data-v2"];

function isDashboardData(data: unknown): data is DashboardData {
  if (!data || typeof data !== "object") return false;
  const candidate = data as Partial<DashboardData>;
  return Boolean(
    candidate.source &&
    candidate.kpi &&
    Array.isArray(candidate.records) &&
    Array.isArray(candidate.statusDistribution) &&
    Array.isArray(candidate.monthlyTrend)
  );
}

function formatCurrency(num: number): string {
  return `¥${num.toLocaleString()}万`;
}

function refreshDerivedDashboardData(data: DashboardData): DashboardData {
  return buildDashboardData(normalizeProjectRows(data.records as unknown as Record<string, unknown>[]), data.source);
}

function KPICard({ label, value, subValue, color }: { label: string; value: string; subValue?: string; color: string }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 8, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "2rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {subValue && <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: 6 }}>{subValue}</div>}
    </div>
  );
}

function PieChart({ data }: { data: DashboardData["statusDistribution"] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const safeTotal = Math.max(1, total);
  const paths = data.map((d, index) => {
    const startValue = data.slice(0, index).reduce((sum, item) => sum + item.value, 0);
    const endValue = startValue + d.value;
    const startAngle = (startValue / safeTotal) * 360;
    const endAngle = (endValue / safeTotal) * 360;
    const start = (startAngle - 90) * (Math.PI / 180);
    const end = (endAngle - 90) * (Math.PI / 180);
    const r = 70;
    const cx = 90, cy = 90;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: d.color, name: d.name, value: d.value };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} opacity={0.9} />
        ))}
        <circle cx="90" cy="90" r="35" fill="var(--surface)" />
      </svg>
      <div style={{ flex: 1 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color }} />
            <span style={{ fontSize: "0.8rem", color: "var(--text2)", flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data }: { data: DashboardData["monthlyTrend"] }) {
  const visibleData = data.filter(item => (
    item.month &&
    Number.isFinite(item.contract) &&
    Number.isFinite(item.collection)
  ));
  if (visibleData.length === 0) {
    return (
      <div style={{
        minHeight: 210,
        display: "grid",
        placeItems: "center",
        background: "var(--surface2)",
        borderRadius: 10,
        border: "1px dashed var(--border)",
        color: "var(--text2)",
        fontSize: "0.84rem",
        lineHeight: 1.7,
        textAlign: "center",
        padding: 24,
      }}>
        暂无可用于月度趋势的日期数据。<br />
        请检查飞书项目台账中的签约时间或计划开始字段。
      </div>
    );
  }
  const maxVal = Math.max(1, ...visibleData.flatMap(d => [d.contract, d.collection]));
  const h = 170, w = 480;
  const top = 14, bottom = 28, left = 12, right = 12;
  const plotBottom = h - bottom;
  const plotWidth = w - left - right;
  const scale = (v: number) => top + (1 - v / maxVal) * (h - top - bottom);
  const xPos = (i: number, length: number) => length <= 1 ? w / 2 : left + (i / (length - 1)) * plotWidth;

  const linePath = (values: number[]) => {
    if (values.length === 1) {
      const y = scale(values[0]);
      return `M ${left} ${y} L ${w - right} ${y}`;
    }
    return values.map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i, values.length)} ${scale(v)}`).join(" ");
  };

  const areaPath = (values: number[]) =>
    values.length <= 1
      ? `${linePath(values)} L ${w - right} ${plotBottom} L ${left} ${plotBottom} Z`
      : `${linePath(values)} L ${w - right} ${plotBottom} L ${left} ${plotBottom} Z`;
  const labelStep = Math.max(1, Math.ceil(visibleData.length / 8));

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" height="200" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="月度合同金额和回款金额趋势">
        <defs>
          <linearGradient id="contractGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="collectionGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((tick) => {
          const y = top + tick * (h - top - bottom);
          return <line key={tick} x1={left} x2={w - right} y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 6" opacity="0.42" vectorEffect="non-scaling-stroke" />;
        })}
        <path d={areaPath(visibleData.map(d => d.contract))} fill="url(#contractGrad)" />
        <path d={areaPath(visibleData.map(d => d.collection))} fill="url(#collectionGrad)" />
        <path d={linePath(visibleData.map(d => d.contract))} fill="none" stroke="#3b82f6" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        <path d={linePath(visibleData.map(d => d.collection))} fill="none" stroke="#10b981" strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
        {visibleData.map((d, i) => (
          <g key={i}>
            <circle cx={xPos(i, visibleData.length)} cy={scale(d.contract)} r="4" fill="#3b82f6" vectorEffect="non-scaling-stroke" />
            <circle cx={xPos(i, visibleData.length)} cy={scale(d.collection)} r="4" fill="#10b981" vectorEffect="non-scaling-stroke" />
            <title>{d.month}: 合同金额{d.contract}万，回款金额{d.collection}万</title>
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, gap: 8 }}>
        {visibleData.map((d, i) => (
          <span key={i} style={{ fontSize: "0.7rem", color: "var(--text2)", visibility: i % labelStep === 0 || i === visibleData.length - 1 ? "visible" : "hidden", whiteSpace: "nowrap" }}>{d.month}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
          <span style={{ display: "inline-block", width: 16, height: 3, background: "#3b82f6", borderRadius: 2, marginRight: 6, verticalAlign: "middle" }} />
          合同金额
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
          <span style={{ display: "inline-block", width: 16, height: 3, background: "#10b981", borderRadius: 2, marginRight: 6, verticalAlign: "middle" }} />
          回款金额
        </span>
      </div>
    </div>
  );
}

function RegionBarChart({ data }: { data: DashboardData["regionDistribution"] }) {
  const maxCount = Math.max(...data.map(d => d.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 40, fontSize: "0.75rem", color: "var(--text2)" }}>{d.region}</span>
          <div style={{ flex: 1, height: 20, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${(d.count / maxCount) * 100}%`,
              height: "100%",
              background: `hsl(${200 + i * 15}, 70%, 55%)`,
              borderRadius: 4,
              transition: "width 0.3s",
            }} />
          </div>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, width: 50, textAlign: "right" }}>{d.count}个</span>
        </div>
      ))}
    </div>
  );
}

function Histogram({ data }: { data: DashboardData["paymentGroups"] }) {
  const maxAmount = Math.max(1, ...data.map(d => d.amount));
  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  if (totalAmount <= 0) {
    return (
      <div style={{
        height: 150,
        display: "grid",
        placeItems: "center",
        background: "var(--surface2)",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        color: "var(--text2)",
        fontSize: "0.82rem",
        textAlign: "center",
        lineHeight: 1.7,
        padding: 18,
      }}>
        当前数据源暂无未回款应收金额。<br />
        回款分组只统计应收金额大于 0 的项目。
      </div>
    );
  }
  const colors = ["#3b82f6", "#f59e0b", "#fb923c", "#ef4444", "#991b1b", "#8b5cf6"];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 158, paddingTop: 18 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{
            width: "100%",
            height: `${(d.amount / maxAmount) * 100}%`,
            background: colors[i % colors.length],
            borderRadius: "6px 6px 0 0",
            minHeight: d.amount > 0 ? 18 : 6,
            opacity: d.amount > 0 ? 0.95 : 0.35,
          }} />
          <span style={{ fontSize: "0.68rem", color: "var(--text2)", textAlign: "center", lineHeight: 1.2, minHeight: 28 }}>{d.range}</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>{d.amount}</span>
          <span style={{ fontSize: "0.65rem", color: "var(--text2)" }}>{d.count}项</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: DashboardData["projectLevels"] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const safeTotal = Math.max(1, total);
  const paths = data.map((d, index) => {
    const startValue = data.slice(0, index).reduce((sum, item) => sum + item.value, 0);
    const endValue = startValue + d.value;
    const startAngle = (startValue / safeTotal) * 360;
    const endAngle = (endValue / safeTotal) * 360;
    const start = (startAngle - 90) * (Math.PI / 180);
    const end = (endAngle - 90) * (Math.PI / 180);
    const r = 60, cx = 70, cy = 70;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: d.color, name: d.name, value: d.value };
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.9} />)}
        <circle cx="70" cy="70" r="30" fill="var(--surface)" />
        <text x="70" y="68" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="800">{total}</text>
        <text x="70" y="82" textAnchor="middle" fill="var(--text2)" fontSize="9">个项目</text>
      </svg>
      <div style={{ flex: 1 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />
            <span style={{ fontSize: "0.75rem", color: "var(--text2)", flex: 1 }}>{d.name}</span>
            <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthMatrix({ data }: { data: DashboardData["healthMatrix"] }) {
  const statusColors = { green: "#10b981", yellow: "#f59e0b", red: "#ef4444" };
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return (
    <div style={{ position: "relative", minHeight: 330, background: "var(--surface2)", borderRadius: 12, padding: "24px 24px 60px 72px", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "24px 24px 60px 72px", border: "1px solid var(--border)", borderRadius: 10, background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(245,158,11,0.06) 45%, rgba(16,185,129,0.08))" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text2)", position: "absolute", left: 18, top: "46%", transform: "rotate(-90deg)", transformOrigin: "center", whiteSpace: "nowrap" }}>成本健康度（越高越好）</div>
      <div style={{ fontSize: "0.72rem", color: "var(--text2)", position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap" }}>进度偏差（左：落后 / 右：领先）</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text2)", position: "absolute", left: 74, bottom: 40 }}>-25%</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text2)", position: "absolute", left: "50%", bottom: 40, transform: "translateX(-50%)" }}>0%</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text2)", position: "absolute", right: 24, bottom: 40 }}>+25%</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text2)", position: "absolute", left: 42, top: 24 }}>100</div>
      <div style={{ fontSize: "0.68rem", color: "var(--text2)", position: "absolute", left: 48, bottom: 58 }}>40</div>
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="项目健康矩阵散点图" style={{ position: "absolute", top: 24, left: 72, right: 24, bottom: 60, width: "calc(100% - 96px)", height: "calc(100% - 84px)" }}>
        {[33, 66].map(y => (
          <line key={`h-${y}`} x1="0" x2="100" y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 5" opacity="0.55" vectorEffect="non-scaling-stroke" />
        ))}
        {[25, 50, 75].map(x => (
          <line key={`v-${x}`} x1={x} x2={x} y1="0" y2="100" stroke="var(--border)" strokeDasharray="4 5" opacity="0.55" vectorEffect="non-scaling-stroke" />
        ))}
        {data.map((p, i) => {
          const x = clamp(((p.progressDev + 25) / 50) * 100, 3, 97);
          const y = clamp(100 - ((p.costHealth - 40) / 60) * 100, 3, 97);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="2.4" fill={statusColors[p.status as keyof typeof statusColors]} opacity="0.82" stroke="rgba(255,255,255,0.38)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
              <title>{p.name}: 进度{p.progressDev}%, 成本{p.costHealth}%</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const [riskFilter, setRiskFilter] = useState("全部");
  const [dashboardData, setDashboardData] = useState<DashboardData>(DEFAULT_DASHBOARD_DATA);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cacheKeys = [DASHBOARD_CACHE_KEY, ...LEGACY_DASHBOARD_CACHE_KEYS];
    for (const key of cacheKeys) {
      const cached = localStorage.getItem(key);
      if (!cached) continue;
      try {
        const parsed = JSON.parse(cached);
        if (isDashboardData(parsed)) {
          const repaired = refreshDerivedDashboardData(parsed);
          localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(repaired));
          LEGACY_DASHBOARD_CACHE_KEYS.forEach(item => localStorage.removeItem(item));
          queueMicrotask(() => setDashboardData(repaired));
          return;
        }
      } catch {
        // Fall through and clear the invalid cache below.
      }
      localStorage.removeItem(key);
    }
  }, []);

  const persistData = (data: DashboardData) => {
    setDashboardData(data);
    LEGACY_DASHBOARD_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  };

  const loadFromFeishu = async (manual = true) => {
    setLoading(true);
    setMessage(manual ? "正在从飞书智能表拉取数据..." : null);
    try {
      const response = await fetch("/api/dashboard/feishu", { cache: "no-store" });
      const payload = await response.json() as { data?: DashboardData; code?: string };
      if (!response.ok || !payload.data) throw new Error(payload.code ?? `HTTP_${response.status}`);
      persistData(payload.data);
      setMessage(`已从飞书智能表拉取 ${payload.data.records.length} 条项目数据。`);
    } catch (error) {
      if (manual) setMessage(`飞书拉取失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  };

  const importFile = async (file: File) => {
    setLoading(true);
    setMessage("正在解析导入文件...");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/dashboard/import", {
        method: "POST",
        body: form,
      });
      const payload = await response.json() as { data?: DashboardData; code?: string };
      if (!response.ok || !payload.data) throw new Error(payload.code ?? `HTTP_${response.status}`);
      persistData(payload.data);
      setMessage(`已导入 ${payload.data.records.length} 条项目数据。`);
    } catch (error) {
      setMessage(`导入失败：${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resetData = () => {
    LEGACY_DASHBOARD_CACHE_KEYS.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(DASHBOARD_CACHE_KEY);
    setDashboardData(DEFAULT_DASHBOARD_DATA);
    setMessage("已切回作业帮项目样例数据源。");
  };

  const kpi = dashboardData.kpi;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "var(--surface)",
      }}>
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontWeight: 700 }}>📊 项目组合看板</span>
        <span className="tag tag-blue" style={{ fontSize: "0.7rem" }}>{dashboardData.source.type === "feishu" ? "飞书实时数据" : dashboardData.source.type === "file" ? "文件导入数据" : "样例数据源"}</span>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: 4 }}>数据源：{dashboardData.source.name}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text2)", lineHeight: 1.6 }}>
              已加载 {dashboardData.records.length} 条项目记录 · 生成时间 {new Date(dashboardData.source.generatedAt).toLocaleString("zh-CN")}
              {dashboardData.source.note ? ` · ${dashboardData.source.note}` : ""}
            </div>
            {message && <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--accent2)" }}>{message}</div>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: "none" }}
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
            }}
          />
          <button className="btn-secondary" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            导入Excel/CSV
          </button>
          <a className="btn-secondary" href="/api/dashboard/template" style={{ textDecoration: "none" }}>
            下载导入模板
          </a>
          <button className="btn-primary" disabled={loading} onClick={() => void loadFromFeishu(true)}>
            从飞书智能表拉取
          </button>
          <button className="btn-secondary" disabled={loading} onClick={resetData}>
            重置示例
          </button>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <KPICard label="项目总数" value={String(kpi.totalProjects)} subValue="来自当前数据源" color="var(--accent)" />
          <KPICard label="合同总额" value={formatCurrency(kpi.totalContract)} subValue="当前数据源合计" color="var(--text)" />
          <KPICard label="回款总额" value={formatCurrency(kpi.totalCollection)} subValue="当前数据源合计" color="var(--green)" />
          <KPICard label="回款率" value={`${kpi.collectionRate}%`} subValue="已回款/合同总额" color="var(--amber)" />
          <KPICard label="应催账款" value={formatCurrency(kpi.receivable)} subValue="应收金额合计" color="var(--red)" />
        </div>

        {/* Charts Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
          {/* Status Pie */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              项目状态分布
            </div>
            <PieChart data={dashboardData.statusDistribution} />
          </div>

          {/* Monthly Trend */}
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              月度趋势
            </div>
            <LineChart data={dashboardData.monthlyTrend} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
          {/* Region Distribution */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              省域分布
            </div>
            <RegionBarChart data={dashboardData.regionDistribution} />
          </div>

          {/* Payment Groups */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              回款分组（账龄）
            </div>
            <Histogram data={dashboardData.paymentGroups} />
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 8, textAlign: "center", lineHeight: 1.6 }}>单位：万元 · 仅统计应收金额 &gt; 0 的项目</div>
          </div>

          {/* Project Level Donut */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              项目分级分布
            </div>
            <DonutChart data={dashboardData.projectLevels} />
          </div>
        </div>

        {/* Health Matrix */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            项目健康矩阵
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
            <HealthMatrix data={dashboardData.healthMatrix} />
            <div style={{ borderLeft: "1px solid var(--border)", paddingLeft: 24 }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 12 }}>健康度说明</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--green)" }} />
                  <span style={{ fontSize: "0.8rem" }}>绿区：进度正常，成本可控</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--amber)" }} />
                  <span style={{ fontSize: "0.8rem" }}>黄区：存在偏差，需关注</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--red)" }} />
                  <span style={{ fontSize: "0.8rem" }}>红区：严重偏差，需干预</span>
                </div>
              </div>
              <div style={{ marginTop: 20, padding: 12, background: "var(--surface2)", borderRadius: 8 }}>
                <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 6 }}>矩阵说明</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", lineHeight: 1.6 }}>
                  X轴：进度偏差 = (计划进度 - 实际进度) / 计划进度 × 100%<br />
                  Y轴：成本健康度 = (预算 - 实际支出) / 预算 × 100%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Tables */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Risk Projects */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                风险项目列表
              </div>
              <select
                className="input"
                value={riskFilter}
                onChange={e => setRiskFilter(e.target.value)}
                style={{ width: "auto", padding: "4px 8px", fontSize: "0.75rem" }}
              >
                <option>全部</option>
                <option>高风险</option>
                <option>中风险</option>
              </select>
            </div>
            <table style={{ width: "100%", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>项目</th>
                  <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>风险类型</th>
                  <th style={{ textAlign: "center", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>严重度</th>
                  <th style={{ textAlign: "center", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>状态</th>
                  <th style={{ textAlign: "center", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>趋势</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.riskProjects
                  .filter(p => riskFilter === "全部" || p.severity === riskFilter.replace("风险", ""))
                  .map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 0" }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{p.id}</div>
                    </td>
                    <td style={{ padding: "10px 0", color: "var(--text2)" }}>{p.riskType}</td>
                    <td style={{ padding: "10px 0", textAlign: "center" }}>
                      <span className={`tag ${p.severity === "高" ? "tag-amber" : "tag-blue"}`}>{p.severity}</span>
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "center", color: "var(--text2)" }}>{p.status}</td>
                    <td style={{ padding: "10px 0", textAlign: "center" }}>
                      {p.trend === "恶化" ? (
                        <span style={{ color: "var(--red)", fontSize: "0.85rem" }}>↑</span>
                      ) : (
                        <span style={{ color: "var(--text2)", fontSize: "0.85rem" }}>→</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <a href={feishuTableUrl("risk")} target="_blank" rel="noopener noreferrer" style={{ display: "block", marginTop: 12, fontSize: "0.8rem", color: "var(--feishu)", textDecoration: "none" }}>
              查看全部风险项目 →
            </a>
          </div>

          {/* Upcoming Payments */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              未来30天回款计划
            </div>
            <table style={{ width: "100%", fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>项目</th>
                  <th style={{ textAlign: "left", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>甲方</th>
                  <th style={{ textAlign: "right", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>金额</th>
                  <th style={{ textAlign: "center", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>到期日</th>
                  <th style={{ textAlign: "center", padding: "8px 0", color: "var(--text2)", fontWeight: 500 }}>剩余</th>
                </tr>
              </thead>
              <tbody>
                {dashboardData.upcomingPayments.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 0", fontWeight: 500 }}>{p.project}</td>
                    <td style={{ padding: "10px 0", color: "var(--text2)" }}>{p.party}</td>
                    <td style={{ padding: "10px 0", textAlign: "right", color: "var(--green)", fontWeight: 600 }}>¥{p.amount}万</td>
                    <td style={{ padding: "10px 0", textAlign: "center", color: "var(--text2)" }}>{p.dueDate}</td>
                    <td style={{ padding: "10px 0", textAlign: "center" }}>
                      <span className={`tag ${p.daysLeft <= 7 ? "tag-amber" : "tag-green"}`}>
                        {p.daysLeft}天
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>合计：<span style={{ color: "var(--green)", fontWeight: 600 }}>{formatCurrency(dashboardData.upcomingPayments.reduce((sum, item) => sum + item.amount, 0))}</span></span>
              <a href={feishuTableUrl("payment")} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.8rem", color: "var(--feishu)", textDecoration: "none" }}>
                查看全部回款计划 →
              </a>
            </div>
          </div>
        </div>

        {/* Feishu Integration */}
        <div style={{ marginTop: 24, padding: "16px 20px", background: "rgba(51, 112, 255, 0.08)", border: "1px solid rgba(51, 112, 255, 0.2)", borderRadius: "var(--radius)", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: "1.5rem" }}>🔗</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 4 }}>飞书仪表盘集成</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>看板由当前数据源动态计算；点击链接可进入飞书多维表格查看或维护原始数据。</div>
          </div>
          <a href={feishuTableUrl("project")} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
            打开飞书项目台账
          </a>
        </div>
      </main>
    </div>
  );
}
