"use client";

import { useState } from "react";
import { feishuTableUrl } from "@/features/feishu/links";

const MOCK_DATA = {
  kpi: {
    totalProjects: 47,
    totalContract: 5280,
    totalCollection: 3120,
    collectionRate: 59.1,
    receivable: 1850,
  },
  statusDistribution: [
    { name: "执行中", value: 22, color: "#3b82f6" },
    { name: "验收中", value: 12, color: "#10b981" },
    { name: "待启动", value: 8, color: "#f59e0b" },
    { name: "已延期", value: 5, color: "#ef4444" },
  ],
  monthlyTrend: [
    { month: "1月", contract: 420, collection: 280 },
    { month: "2月", contract: 380, collection: 260 },
    { month: "3月", contract: 520, collection: 340 },
    { month: "4月", contract: 480, collection: 390 },
    { month: "5月", contract: 600, collection: 420 },
    { month: "6月", contract: 540, collection: 480 },
  ],
  regionDistribution: [
    { region: "华东", count: 15, amount: 1800 },
    { region: "华北", count: 12, amount: 1400 },
    { region: "华南", count: 10, amount: 1200 },
    { region: "西南", count: 6, amount: 580 },
    { region: "华中", count: 4, amount: 300 },
  ],
  paymentGroups: [
    { range: "<30天", count: 8, amount: 420 },
    { range: "30-60天", count: 12, amount: 680 },
    { range: "60-90天", count: 15, amount: 920 },
    { range: ">90天", count: 7, amount: 380 },
  ],
  projectLevels: [
    { name: "A级(战略)", value: 5, color: "#8b5cf6" },
    { name: "B级(重点)", value: 12, color: "#3b82f6" },
    { name: "C级(普通)", value: 20, color: "#10b981" },
    { name: "D级(观察)", value: 10, color: "#f59e0b" },
  ],
  healthMatrix: [
    { name: "项目A", progressDev: 5, costHealth: 85, status: "green" },
    { name: "项目B", progressDev: -8, costHealth: 72, status: "green" },
    { name: "项目C", progressDev: 12, costHealth: 65, status: "yellow" },
    { name: "项目D", progressDev: -15, costHealth: 58, status: "red" },
    { name: "项目E", progressDev: 3, costHealth: 90, status: "green" },
    { name: "项目F", progressDev: -5, costHealth: 68, status: "yellow" },
    { name: "项目G", progressDev: 18, costHealth: 55, status: "red" },
    { name: "项目H", progressDev: 8, costHealth: 78, status: "green" },
    { name: "项目I", progressDev: -12, costHealth: 62, status: "yellow" },
    { name: "项目J", progressDev: 20, costHealth: 48, status: "red" },
    { name: "项目K", progressDev: 2, costHealth: 88, status: "green" },
    { name: "项目L", progressDev: -3, costHealth: 75, status: "green" },
  ],
  riskProjects: [
    { id: "P-2024-015", name: "某市智慧教育平台", riskType: "进度风险", severity: "高", status: "监控中", trend: "恶化" },
    { id: "P-2024-022", name: "高校数据中台项目", riskType: "成本风险", severity: "高", status: "处理中", trend: "平稳" },
    { id: "P-2024-031", name: "职业教育基地建设", riskType: "范围风险", severity: "中", status: "监控中", trend: "恶化" },
    { id: "P-2024-038", name: "智能化校园改造", riskType: "资源风险", severity: "中", status: "已识别", trend: "平稳" },
  ],
  upcomingPayments: [
    { project: "智慧校园一期", party: "某市教育局", amount: 280, dueDate: "2024/06/15", daysLeft: 5 },
    { project: "高职虚拟仿真", party: "某职业学院", amount: 160, dueDate: "2024/06/18", daysLeft: 8 },
    { project: "教育局数据平台", party: "省教育厅", amount: 420, dueDate: "2024/06/20", daysLeft: 10 },
    { project: "中学智慧课堂", party: "某市第一中学", amount: 85, dueDate: "2024/06/22", daysLeft: 12 },
    { project: "职教云平台", party: "某职教集团", amount: 195, dueDate: "2024/06/25", daysLeft: 15 },
  ],
};

function formatCurrency(num: number): string {
  return `¥${num.toLocaleString()}万`;
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

function PieChart({ data }: { data: typeof MOCK_DATA.statusDistribution }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let cumulative = 0;
  const paths = data.map((d) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 360;
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

function LineChart({ data }: { data: typeof MOCK_DATA.monthlyTrend }) {
  const maxVal = Math.max(...data.flatMap(d => [d.contract, d.collection]));
  const h = 140, w = 400;
  const scale = (v: number) => (1 - v / maxVal) * h;

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"} ${(i / (values.length - 1)) * w} ${scale(v)}`).join(" ");

  const areaPath = (values: number[]) =>
    `${linePath(values)} L ${w} ${h} L 0 ${h} Z`;

  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" height="180" viewBox={`0 0 ${w} 180`} preserveAspectRatio="none">
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
        <path d={areaPath(data.map(d => d.contract))} fill="url(#contractGrad)" />
        <path d={areaPath(data.map(d => d.collection))} fill="url(#collectionGrad)" />
        <path d={linePath(data.map(d => d.contract))} fill="none" stroke="#3b82f6" strokeWidth="2.5" />
        <path d={linePath(data.map(d => d.collection))} fill="none" stroke="#10b981" strokeWidth="2.5" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={(i / (data.length - 1)) * w} cy={scale(d.contract)} r="4" fill="#3b82f6" />
            <circle cx={(i / (data.length - 1)) * w} cy={scale(d.collection)} r="4" fill="#10b981" />
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{d.month}</span>
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

function RegionBarChart({ data }: { data: typeof MOCK_DATA.regionDistribution }) {
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

function Histogram({ data }: { data: typeof MOCK_DATA.paymentGroups }) {
  const maxAmount = Math.max(...data.map(d => d.amount));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 120, paddingTop: 20 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{
            width: "100%",
            height: `${(d.amount / maxAmount) * 100}%`,
            background: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444"][i],
            borderRadius: "6px 6px 0 0",
            minHeight: 20,
          }} />
          <span style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{d.range}</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{d.amount}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ data }: { data: typeof MOCK_DATA.projectLevels }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let cumulative = 0;
  const paths = data.map((d) => {
    const startAngle = (cumulative / total) * 360;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 360;
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

function HealthMatrix({ data }: { data: typeof MOCK_DATA.healthMatrix }) {
  const statusColors = { green: "#10b981", yellow: "#f59e0b", red: "#ef4444" };
  return (
    <div style={{ position: "relative", height: 220, background: "var(--surface2)", borderRadius: 8, padding: 16 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: "30%", height: 1, borderTop: "1px dashed var(--border)", opacity: 0.5 }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: "70%", height: 1, borderTop: "1px dashed var(--border)", opacity: 0.5 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, borderLeft: "1px dashed var(--border)", opacity: 0.5 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "25%", width: 1, borderLeft: "1px dashed var(--border)", opacity: 0.5 }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "75%", width: 1, borderLeft: "1px dashed var(--border)", opacity: 0.5 }} />
      <div style={{ fontSize: "0.65rem", color: "var(--text2)", position: "absolute", left: -4, top: "50%", transform: "rotate(-90deg) translateX(-50%)", whiteSpace: "nowrap" }}>成本健康度 →</div>
      <div style={{ fontSize: "0.65rem", color: "var(--text2)", position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)" }}>← 进度偏差(%)</div>
      <span style={{ fontSize: "0.6rem", color: "var(--green)", position: "absolute", right: 8, top: 8 }}>绿区(健康)</span>
      <span style={{ fontSize: "0.6rem", color: "var(--amber)", position: "absolute", left: 8, bottom: 8 }}>红区(危险)</span>
      <svg width="100%" height="100%" style={{ position: "absolute", top: 0, left: 0 }}>
        {data.map((p, i) => {
          const x = ((p.progressDev + 25) / 50) * 100;
          const y = 100 - ((p.costHealth - 40) / 60) * 100;
          return (
            <g key={i}>
              <circle cx={`${x}%`} cy={`${y}%`} r="8" fill={statusColors[p.status as keyof typeof statusColors]} opacity="0.7" />
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
        <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</a>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontWeight: 700 }}>📊 项目组合看板</span>
        <span className="tag tag-blue" style={{ fontSize: "0.7rem" }}>飞书 + ECharts</span>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* KPI Cards */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <KPICard label="项目总数" value="47" subValue="较上月 +3" color="var(--accent)" />
          <KPICard label="合同总额" value="¥5,280万" subValue="本年累计" color="var(--text)" />
          <KPICard label="回款总额" value="¥3,120万" subValue="较上月 +¥180万" color="var(--green)" />
          <KPICard label="回款率" value="59.1%" subValue="目标 65%" color="var(--amber)" />
          <KPICard label="应催账款" value="¥1,850万" subValue="逾期 ¥320万" color="var(--red)" />
        </div>

        {/* Charts Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
          {/* Status Pie */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              项目状态分布
            </div>
            <PieChart data={MOCK_DATA.statusDistribution} />
          </div>

          {/* Monthly Trend */}
          <div className="card" style={{ gridColumn: "span 2" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              月度趋势
            </div>
            <LineChart data={MOCK_DATA.monthlyTrend} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 24 }}>
          {/* Region Distribution */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              省域分布
            </div>
            <RegionBarChart data={MOCK_DATA.regionDistribution} />
          </div>

          {/* Payment Groups */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              回款分组（账龄）
            </div>
            <Histogram data={MOCK_DATA.paymentGroups} />
            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 8, textAlign: "center" }}>单位：万元</div>
          </div>

          {/* Project Level Donut */}
          <div className="card">
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              项目分级分布
            </div>
            <DonutChart data={MOCK_DATA.projectLevels} />
          </div>
        </div>

        {/* Health Matrix */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            项目健康矩阵
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24 }}>
            <HealthMatrix data={MOCK_DATA.healthMatrix} />
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
                {MOCK_DATA.riskProjects.map((p, i) => (
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
                {MOCK_DATA.upcomingPayments.map((p, i) => (
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
              <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>合计：<span style={{ color: "var(--green)", fontWeight: 600 }}>¥1,140万</span></span>
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
            <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>以上为本地预览版本，实际数据来自飞书多维表格。点击链接查看完整版。</div>
          </div>
          <a href={feishuTableUrl("project")} target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ textDecoration: "none", fontSize: "0.8rem" }}>
            打开飞书项目台账
          </a>
        </div>
      </main>
    </div>
  );
}
