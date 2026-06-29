"use client";

import { useState } from "react";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const HEALTH_OVERVIEW = {
  overall: "yellow" as "green" | "yellow" | "red",
  schedule: "yellow",
  cost: "green",
  quality: "green",
  scope: "red",
  risk: "yellow",
};

const EVM_DATA = {
  pv: 480,
  ev: 450,
  ac: 460,
  bac: 800,
  spi: 0.938,
  cpi: 0.978,
  sv: -30,
  cv: -10,
  eac: 818,
  vac: -18,
};

const SCHEDULE_DATA = {
  planned: 65,
  actual: 58,
  criticalPathStatus: "at-risk",
  criticalPathTasks: 12,
  delayedTasks: 3,
  variance: -7,
};

const COST_DATA = {
  budget: 800,
  actual: 460,
  committed: 280,
  forecast: 818,
  variance: -18,
};

const SCOPE_DATA = {
  verifiedDeliverables: 18,
  totalDeliverables: 24,
  acceptanceRate: 75,
  scopeCreepCount: 2,
  pendingAcceptances: 4,
  rejectedItems: 1,
};

const QUALITY_DATA = {
  defectDensity: 3.2,
  defectTrend: "down",
  inspectionPassRate: 92,
  qualityIndex: 87,
  openDefects: 5,
  resolvedDefects: 23,
};

const RISK_WATCH_LIST = [
  { id: "R1", description: "第三方接口不稳定", probability: "H", impact: "H", trigger: "已触发", owner: "李工" },
  { id: "R2", description: "需求变更频繁", probability: "M", impact: "H", trigger: "监控中", owner: "张经理" },
  { id: "R3", description: "核心人员离职风险", probability: "P", impact: "M", trigger: "未触发", owner: "王总" },
];

const CHANGE_CONTROL = {
  open: 5,
  inProgress: 3,
  approved: 12,
  rejected: 2,
  implemented: 10,
  pending: 3,
};

const PERFORMANCE_DATA = {
  pc: 56.3,
  status: "behind",
  trend: ["+2%", "-1%", "-3%", "-5%", "-7%"],
  forecast: "项目预计超支 ¥18万，进度落后约7天",
};

const DELIVERABLES = [
  { id: "D1", name: "需求规格说明书", status: "accepted", date: "2026-03-15" },
  { id: "D2", name: "系统设计文档", status: "accepted", date: "2026-03-28" },
  { id: "D3", name: "核心模块开发", status: "accepted", date: "2026-04-20" },
  { id: "D4", name: "接口联调报告", status: "pending", date: "-" },
  { id: "D5", name: "UAT测试报告", status: "rejected", date: "-" },
  { id: "D6", name: "用户手册初稿", status: "in_progress", date: "-" },
];

// ─── Helper Components ───────────────────────────────────────────────────────

function HealthDot({ status, size = 12 }: { status: "green" | "yellow" | "red"; size?: number }) {
  const colors = { green: "var(--green)", yellow: "var(--amber)", red: "var(--red)" };
  return (
    <span style={{
      display: "inline-block",
      width: size,
      height: size,
      borderRadius: "50%",
      background: colors[status],
      boxShadow: `0 0 6px ${colors[status]}88`,
    }} />
  );
}

function StatusTag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: 20,
      fontSize: "0.72rem",
      fontWeight: 600,
      color,
      background: bg,
    }}>
      {label}
    </span>
  );
}

function Gauge({ value, max = 100, label, unit = "%", color = "var(--accent)" }: {
  value: number; max?: number; label: string; unit?: string; color?: string;
}) {
  const pct = Math.min(value / max, 1);
  const r = 50, cx = 60, cy = 60;
  const circumference = Math.PI * r;
  const dashLen = pct * circumference;
  const trackLen = circumference;

  return (
    <div style={{ textAlign: "center" }}>
      <svg width="120" height="80" viewBox="0 0 120 80">
        <path
          d={`M 10 70 A ${r} ${r} 0 0 1 ${cx + r} 70`}
          fill="none"
          stroke="var(--surface2)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d={`M 10 70 A ${r} ${r} 0 0 1 ${cx + r} 70`}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${trackLen}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="60" y="65" textAnchor="middle" fill="var(--text)" fontSize="18" fontWeight="800">
          {value.toFixed(1)}{unit}
        </text>
      </svg>
      <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Bar({ label, value, max, color = "var(--accent)" }: {
  label: string; value: number; max: number; color?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.8rem" }}>
        <span style={{ color: "var(--text2)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}%</span>
      </div>
      <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${(value / max) * 100}%`,
          background: color,
          borderRadius: 4,
          transition: "width 0.4s ease",
        }} />
      </div>
    </div>
  );
}

function SectionCard({ title, icon, tag, children, tagColor = "var(--text2)" }: {
  title: string; icon: string; tag?: string; tagColor?: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "20px 24px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: "1.1rem" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{title}</span>
        {tag && (
          <span style={{
            marginLeft: 8,
            fontSize: "0.68rem",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 10,
            background: "var(--surface2)",
            color: tagColor,
          }}>
            {tag}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "📡 监控总览", icon: "overview" },
    { key: "scope", label: "🔍 范围核实", icon: "scope" },
    { key: "schedule", label: "⏱️ 进度监控", icon: "schedule" },
    { key: "cost", label: "💰 成本控制", icon: "cost" },
    { key: "quality", label: "✅ 质量控制", icon: "quality" },
    { key: "risk", label: "🔐 风险监控", icon: "risk" },
    { key: "change", label: "🔄 变更监控", icon: "change" },
    { key: "report", label: "📊 绩效报告", icon: "report" },
  ];

  const healthStatus = HEALTH_OVERVIEW;
  const healthColors = { green: "var(--green)", yellow: "var(--amber)", red: "var(--red)" };
  const healthLabels = { green: "正常", yellow: "关注", red: "危险" };

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
        <span style={{ fontWeight: 700 }}>📡 项目监控阶段</span>
        <span style={{
          fontSize: "0.68rem",
          fontWeight: 600,
          padding: "3px 10px",
          borderRadius: 20,
          background: "rgba(139, 92, 246, 0.15)",
          color: "var(--purple)",
        }}>
          监控阶段
        </span>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>

        {/* Tab Navigation */}
        <div style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border)",
          marginBottom: 24,
          overflowX: "auto",
        }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 20px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: "0.82rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Overview Tab ──────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div>
            {/* Project Health Overview */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.2rem" }}>🏥</span>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>项目健康概览</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>综合状态：</span>
                  <HealthDot status={healthStatus.overall} size={16} />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: healthColors[healthStatus.overall] }}>
                    {healthLabels[healthStatus.overall]}
                  </span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16 }}>
                {([
                  { label: "整体健康", value: healthStatus.overall },
                  { label: "进度", value: healthStatus.schedule },
                  { label: "成本", value: healthStatus.cost },
                  { label: "质量", value: healthStatus.quality },
                  { label: "范围", value: healthStatus.scope },
                  { label: "风险", value: healthStatus.risk },
                ] as { label: string; value: "green" | "yellow" | "red" }[]).map(item => (
                  <div key={item.label} style={{
                    background: "var(--surface2)",
                    border: `1px solid ${healthColors[item.value]}33`,
                    borderRadius: 10,
                    padding: "16px 12px",
                    textAlign: "center",
                  }}>
                    <HealthDot status={item.value} size={14} />
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, marginTop: 8, color: healthColors[item.value] }}>
                      {healthLabels[item.value]}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* SPI/CPI Gauges + Key Variances */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 20 }}>
              {/* SPI Gauge */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  📈 进度绩效指数 (SPI)
                </div>
                <Gauge
                  value={(EVM_DATA.spi * 100)}
                  max={100}
                  label="SPI"
                  unit="%"
                  color={EVM_DATA.spi >= 1 ? "var(--green)" : "var(--amber)"}
                />
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: EVM_DATA.spi >= 1 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  color: EVM_DATA.spi >= 1 ? "var(--green)" : "var(--amber)",
                  textAlign: "center",
                }}>
                  {EVM_DATA.spi >= 1 ? "✓ 进度正常" : `↓ 落后 ${Math.abs(EVM_DATA.sv)}万元`}
                </div>
              </div>

              {/* CPI Gauge */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  💰 成本绩效指数 (CPI)
                </div>
                <Gauge
                  value={(EVM_DATA.cpi * 100)}
                  max={100}
                  label="CPI"
                  unit="%"
                  color={EVM_DATA.cpi >= 1 ? "var(--green)" : "var(--amber)"}
                />
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: EVM_DATA.cpi >= 1 ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.1)",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  color: EVM_DATA.cpi >= 1 ? "var(--green)" : "var(--amber)",
                  textAlign: "center",
                }}>
                  {EVM_DATA.cpi >= 1 ? "✓ 成本可控" : `⚠ 超支 ${Math.abs(EVM_DATA.cv)}万元`}
                </div>
              </div>

              {/* Key Variances */}
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                  📉 关键偏差
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "进度偏差 SV", value: EVM_DATA.sv, unit: "万元", positive: false },
                    { label: "成本偏差 CV", value: EVM_DATA.cv, unit: "万元", positive: false },
                    { label: "完工偏差 VAC", value: EVM_DATA.vac, unit: "万元", positive: false },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>{item.label}</span>
                      <span style={{
                        fontWeight: 700,
                        color: item.value >= 0 ? "var(--green)" : "var(--red)",
                        fontSize: "0.9rem",
                      }}>
                        {item.value >= 0 ? "+" : ""}{item.value}{item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Trend Indicators */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
            }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
                📊 趋势指标 (近5期)
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {PERFORMANCE_DATA.trend.map((t, i) => {
                  const isPositive = t.startsWith("+");
                  return (
                    <div key={i} style={{
                      flex: 1,
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "16px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginBottom: 8 }}>第{i + 1}期</div>
                      <div style={{
                        fontSize: "1.4rem",
                        fontWeight: 800,
                        color: isPositive ? "var(--green)" : "var(--red)",
                      }}>
                        {t}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 6 }}>
                        {isPositive ? "改善" : "恶化"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{
                marginTop: 16,
                padding: "12px 16px",
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 8,
                fontSize: "0.82rem",
                color: "var(--amber)",
              }}>
                ⚠ {PERFORMANCE_DATA.forecast}
              </div>
            </div>
          </div>
        )}

        {/* ─── Scope Verification Tab ────────────────────────────────────── */}
        {activeTab === "scope" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="范围核实" icon="🔍" tag="范围核实">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "已验收交付物", value: SCOPE_DATA.verifiedDeliverables, total: SCOPE_DATA.totalDeliverables, color: "var(--green)" },
                    { label: "验收通过率", value: SCOPE_DATA.acceptanceRate, total: 100, color: "var(--accent)" },
                    { label: "待验收项", value: SCOPE_DATA.pendingAcceptances, total: SCOPE_DATA.totalDeliverables, color: "var(--amber)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "16px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                      {item.total !== 100 && (
                        <div style={{ fontSize: "0.68rem", color: "var(--text2)", marginTop: 2 }}>/ {item.total}</div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text2)", lineHeight: 1.6 }}>
                  <span style={{ color: "var(--red)", fontWeight: 600 }}>⚠ 范围蔓延检测：</span>
                  本期发现 {SCOPE_DATA.scopeCreepCount} 项未经批准的变更请求，涉及范围蔓延风险。
                  已拒绝 {SCOPE_DATA.rejectedItems} 项不合理变更申请。
                </div>
              </SectionCard>

              <SectionCard title="交付物验收状态" icon="📦" tag="交付物">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {DELIVERABLES.map(d => {
                    const statusMap = {
                      accepted: { color: "var(--green)", bg: "rgba(16,185,129,0.1)", label: "已验收" },
                      pending: { color: "var(--amber)", bg: "rgba(245,158,11,0.1)", label: "待验收" },
                      rejected: { color: "var(--red)", bg: "rgba(239,68,68,0.1)", label: "已拒绝" },
                      in_progress: { color: "var(--accent)", bg: "rgba(59,130,246,0.1)", label: "进行中" },
                    };
                    const s = statusMap[d.status as keyof typeof statusMap];
                    return (
                      <div key={d.id} style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: s.bg,
                        borderRadius: 8,
                        border: `1px solid ${s.color}33`,
                      }}>
                        <div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{d.name}</div>
                          {d.date !== "-" && (
                            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 2 }}>验收于 {d.date}</div>
                          )}
                        </div>
                        <StatusTag label={s.label} color={s.color} bg={s.bg} />
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Schedule Control Tab ───────────────────────────────────────── */}
        {activeTab === "schedule" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="进度监控" icon="⏱️" tag="进度控制">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  {[
                    { label: "计划进度", value: SCHEDULE_DATA.planned, unit: "%", color: "var(--accent)" },
                    { label: "实际进度", value: SCHEDULE_DATA.actual, unit: "%", color: SCHEDULE_DATA.actual < SCHEDULE_DATA.planned ? "var(--amber)" : "var(--green)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "16px",
                      textAlign: "center",
                    }}>
                      <Gauge value={item.value} max={100} label={item.label} unit="%" color={item.color} />
                    </div>
                  ))}
                </div>
                <div style={{
                  padding: "12px 16px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  color: "var(--amber)",
                  marginBottom: 12,
                }}>
                  📉 进度偏差：{SCHEDULE_DATA.variance}% (落后约7天)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>关键路径任务数</span>
                    <span style={{ fontWeight: 600, color: SCHEDULE_DATA.criticalPathTasks > 10 ? "var(--amber)" : "var(--text)" }}>
                      {SCHEDULE_DATA.criticalPathTasks} 项
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>延误任务数</span>
                    <span style={{ fontWeight: 600, color: SCHEDULE_DATA.delayedTasks > 0 ? "var(--red)" : "var(--text)" }}>
                      {SCHEDULE_DATA.delayedTasks} 项
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>关键路径状态</span>
                    <StatusTag
                      label={SCHEDULE_DATA.criticalPathStatus === "at-risk" ? "有风险" : "正常"}
                      color={SCHEDULE_DATA.criticalPathStatus === "at-risk" ? "var(--amber)" : "var(--green)"}
                      bg={SCHEDULE_DATA.criticalPathStatus === "at-risk" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)"}
                    />
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="进度详情" icon="📋" tag="偏差分析">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { task: "需求分析与设计", planned: 100, actual: 100, status: "完成" },
                    { task: "核心模块开发", planned: 80, actual: 75, status: "落后" },
                    { task: "接口联调", planned: 60, actual: 45, status: "落后" },
                    { task: "UAT测试", planned: 30, actual: 10, status: "落后" },
                    { task: "部署上线", planned: 10, actual: 0, status: "待开始" },
                  ].map((t, i) => (
                    <div key={i} style={{ padding: "12px 14px", background: "var(--surface2)", borderRadius: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{t.task}</span>
                        <StatusTag
                          label={t.status}
                          color={t.status === "完成" ? "var(--green)" : t.status === "落后" ? "var(--amber)" : "var(--text2)"}
                          bg={t.status === "完成" ? "rgba(16,185,129,0.1)" : t.status === "落后" ? "rgba(245,158,11,0.1)" : "rgba(148,163,184,0.1)"}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${t.planned}%`, height: "100%", background: "var(--accent)", opacity: 0.4, borderRadius: 3 }} />
                        </div>
                        <div style={{ flex: 1, height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${t.actual}%`,
                            height: "100%",
                            background: t.actual < t.planned ? "var(--amber)" : "var(--green)",
                            borderRadius: 3,
                          }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: "0.68rem", color: "var(--text2)" }}>
                        <span>计划 {t.planned}%</span>
                        <span>实际 {t.actual}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16 }}>
                  <a
                    href="/cpm"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "var(--accent)",
                      color: "white",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    ↗ 详细进度管理 (CPM)
                  </a>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Cost Control Tab ───────────────────────────────────────────── */}
        {activeTab === "cost" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="成本控制" icon="💰" tag="成本控制">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "预算 BAC", value: COST_DATA.budget, unit: "万", color: "var(--accent)" },
                    { label: "实际成本 AC", value: COST_DATA.actual, unit: "万", color: "var(--amber)" },
                    { label: "已承诺", value: COST_DATA.committed, unit: "万", color: "var(--text2)" },
                    { label: "预测 EAC", value: COST_DATA.forecast, unit: "万", color: COST_DATA.forecast > COST_DATA.budget ? "var(--red)" : "var(--green)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "14px 10px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text2)" }}>(万元)</div>
                    </div>
                  ))}
                </div>

                <Bar label="预算消耗进度" value={57.5} max={100} color="var(--accent)" />
                <Bar label="完工预测进度" value={(COST_DATA.forecast / COST_DATA.budget) * 100} max={100} color="var(--amber)" />

                <div style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  color: "var(--red)",
                }}>
                  ⚠ 成本偏差 VAC：-{Math.abs(COST_DATA.variance)}万元 (预计超支 {Math.abs(COST_DATA.variance)}万)
                </div>
              </SectionCard>

              <SectionCard title="EVM 成本分析" icon="📊" tag="挣值分析">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "计划价值 PV", value: EVM_DATA.pv, color: "var(--accent)" },
                    { label: "挣值 EV", value: EVM_DATA.ev, color: "var(--green)" },
                    { label: "实际成本 AC", value: EVM_DATA.ac, color: "var(--amber)" },
                    { label: "完工预算 BAC", value: EVM_DATA.bac, color: "var(--text)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                        <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>{item.label}</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>¥{item.value}万</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16 }}>
                  <a
                    href="/evm"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "var(--green)",
                      color: "white",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    ↗ 挣值分析 (EVM)
                  </a>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Quality Control Tab ─────────────────────────────────────────── */}
        {activeTab === "quality" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="质量控制" icon="✅" tag="质量控制">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "缺陷密度", value: QUALITY_DATA.defectDensity, unit: "个/KLOC", color: "var(--green)" },
                    { label: "质检通过率", value: QUALITY_DATA.inspectionPassRate, unit: "%", color: "var(--accent)" },
                    { label: "质量指数", value: QUALITY_DATA.qualityIndex, unit: "%", color: "var(--cyan)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "14px 10px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text2)" }}>{item.unit}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>开放缺陷</span>
                    <span style={{ fontWeight: 600, color: QUALITY_DATA.openDefects > 0 ? "var(--amber)" : "var(--text)" }}>
                      {QUALITY_DATA.openDefects} 项
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>已解决缺陷</span>
                    <span style={{ fontWeight: 600, color: "var(--green)" }}>{QUALITY_DATA.resolvedDefects} 项</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text2)" }}>缺陷趋势</span>
                    <span style={{ fontWeight: 600, color: "var(--green)" }}>
                      {QUALITY_DATA.defectTrend === "down" ? "↓ 下降中" : "↑ 上升中"}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <a
                    href="/quality"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "var(--green)",
                      color: "white",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    ↗ 质量管理 (Quality)
                  </a>
                </div>
              </SectionCard>

              <SectionCard title="缺陷追踪" icon="🐛" tag="缺陷追踪">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { title: "用户权限验证逻辑漏洞", severity: "严重", status: "处理中", statusColor: "var(--amber)" },
                    { title: "报表导出格式偏差", severity: "重要", status: "待处理", statusColor: "var(--red)" },
                    { title: "页面加载动画不流畅", severity: "一般", status: "已解决", statusColor: "var(--green)" },
                  ].map((d, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <span style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: d.severity === "严重" ? "rgba(239,68,68,0.15)" : d.severity === "重要" ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.1)",
                        color: d.severity === "严重" ? "var(--red)" : d.severity === "重要" ? "var(--amber)" : "var(--text2)",
                      }}>
                        {d.severity}
                      </span>
                      <span style={{ flex: 1, fontSize: "0.82rem" }}>{d.title}</span>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, color: d.statusColor }}>{d.status}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Risk Monitoring Tab ────────────────────────────────────────── */}
        {activeTab === "risk" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="风险监控" icon="🔐" tag="风险监控">
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {RISK_WATCH_LIST.map(r => {
                    const probColor = r.probability === "H" ? "var(--red)" : r.probability === "M" ? "var(--amber)" : "var(--green)";
                    const impColor = r.impact === "H" ? "var(--red)" : r.impact === "M" ? "var(--amber)" : "var(--green)";
                    const triggerColor = r.trigger === "已触发" ? "var(--red)" : r.trigger === "监控中" ? "var(--amber)" : "var(--text2)";
                    return (
                      <div key={r.id} style={{
                        padding: "12px 14px",
                        background: "var(--surface2)",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text2)", width: 30 }}>{r.id}</span>
                          <span style={{ flex: 1, fontSize: "0.85rem", fontWeight: 500 }}>{r.description}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                          <span>概率 <span style={{ fontWeight: 700, color: probColor }}>{r.probability}</span></span>
                          <span>影响 <span style={{ fontWeight: 700, color: impColor }}>{r.impact}</span></span>
                          <span>触发 <span style={{ fontWeight: 600, color: triggerColor }}>{r.trigger}</span></span>
                          <span>责任人: {r.owner}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <a
                    href="/risk"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "var(--purple)",
                      color: "white",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    ↗ 风险管理 (Risk)
                  </a>
                </div>
              </SectionCard>

              <SectionCard title="风险应对效果" icon="🎯" tag="应对有效性">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { strategy: "规避", triggers: 2, effective: 2, rate: 100 },
                    { strategy: "转移", triggers: 1, effective: 1, rate: 100 },
                    { strategy: "减轻", triggers: 3, effective: 2, rate: 67 },
                    { strategy: "接受", triggers: 2, effective: 1, rate: 50 },
                  ].map(s => (
                    <div key={s.strategy} style={{
                      padding: "12px 14px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{s.strategy}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                          {s.effective}/{s.triggers} 有效 ({s.rate}%)
                        </span>
                      </div>
                      <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          width: `${s.rate}%`,
                          height: "100%",
                          background: s.rate === 100 ? "var(--green)" : s.rate >= 67 ? "var(--amber)" : "var(--red)",
                          borderRadius: 3,
                          transition: "width 0.4s",
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Change Control Tab ─────────────────────────────────────────── */}
        {activeTab === "change" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="变更控制监控" icon="🔄" tag="整体变更控制">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "待处理", value: CHANGE_CONTROL.pending, color: "var(--amber)" },
                    { label: "进行中", value: CHANGE_CONTROL.inProgress, color: "var(--accent)" },
                    { label: "已实施", value: CHANGE_CONTROL.implemented, color: "var(--green)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "14px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.6rem", fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { label: "已批准", value: CHANGE_CONTROL.approved, color: "var(--green)" },
                    { label: "已拒绝", value: CHANGE_CONTROL.rejected, color: "var(--red)" },
                    { label: "打开总数", value: CHANGE_CONTROL.open, color: "var(--amber)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>{item.label}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.9rem", color: item.color }}>{item.value} 项</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="变更影响分析" icon="📋" tag="变更影响">
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.82rem" }}>
                  {[
                    { change: "增加用户权限模块", impact: "高", scope: "+15%", schedule: "+3天", cost: "+¥8万" },
                    { change: "修改报表导出逻辑", impact: "中", scope: "+5%", schedule: "+1天", cost: "+¥2万" },
                    { change: "优化数据库索引", impact: "低", scope: "0", schedule: "+0.5天", cost: "+¥0.5万" },
                  ].map((c, i) => (
                    <div key={i} style={{
                      padding: "12px 14px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>{c.change}</span>
                        <StatusTag
                          label={c.impact}
                          color={c.impact === "高" ? "var(--red)" : c.impact === "中" ? "var(--amber)" : "var(--green)"}
                          bg={c.impact === "高" ? "rgba(239,68,68,0.1)" : c.impact === "中" ? "rgba(245,158,11,0.1)" : "rgba(16,185,129,0.1)"}
                        />
                      </div>
                      <div style={{ display: "flex", gap: 20, fontSize: "0.75rem", color: "var(--text2)" }}>
                        <span>范围: <span style={{ color: "var(--accent)" }}>{c.scope}</span></span>
                        <span>进度: <span style={{ color: "var(--amber)" }}>{c.schedule}</span></span>
                        <span>成本: <span style={{ color: "var(--text)" }}>{c.cost}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─── Performance Reporting Tab ──────────────────────────────────── */}
        {activeTab === "report" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SectionCard title="挣值状态" icon="📈" tag="挣值状态">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "完成进度 (PC)", value: `${EVM_DATA.ev / EVM_DATA.bac * 100}%`.replace("%", ""), color: "var(--accent)", unit: "%" },
                    { label: "计划价值 (PV)", value: EVM_DATA.pv, color: "var(--accent)", unit: "万" },
                    { label: "挣值 (EV)", value: EVM_DATA.ev, color: "var(--green)", unit: "万" },
                    { label: "实际成本 (AC)", value: EVM_DATA.ac, color: "var(--amber)", unit: "万" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "var(--surface2)",
                      borderRadius: 10,
                      padding: "14px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.4rem", fontWeight: 800, color: item.color }}>{item.value}<span style={{ fontSize: "0.7rem" }}>{item.unit}</span></div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 4 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{
                  padding: "12px 16px",
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  color: "var(--amber)",
                  marginBottom: 16,
                }}>
                  📉 当前状态：进度落后 ({EVM_DATA.spi < 1 ? "SPI=" + EVM_DATA.spi.toFixed(3) : ""})
                </div>

                <Bar label="PV vs EV 完成率" value={(EVM_DATA.ev / EVM_DATA.pv) * 100} max={100} color="var(--green)" />
              </SectionCard>

              <SectionCard title="完工预测" icon="🔮" tag="预测">
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "完工估算 (EAC)", value: `¥${EVM_DATA.eac}万`, status: EVM_DATA.eac > EVM_DATA.bac ? "超支" : "节约", statusColor: EVM_DATA.eac > EVM_DATA.bac ? "var(--red)" : "var(--green)" },
                    { label: "完工尚需 (ETC)", value: `¥${EVM_DATA.eac - EVM_DATA.ac}万`, status: "待投入", statusColor: "var(--amber)" },
                    { label: "完工偏差 (VAC)", value: `${EVM_DATA.vac >= 0 ? "+" : ""}¥${EVM_DATA.vac}万`, status: EVM_DATA.vac >= 0 ? "节约" : "超支", statusColor: EVM_DATA.vac >= 0 ? "var(--green)" : "var(--red)" },
                  ].map(item => (
                    <div key={item.label} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "12px 16px",
                      background: "var(--surface2)",
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--text2)" }}>{item.label}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: item.statusColor }}>{item.value}</span>
                        <StatusTag label={item.status} color={item.statusColor} bg={item.statusColor + "15" as string} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="关键问题与风险摘要" icon="⚠️" tag="关键问题" tagColor="var(--amber)">
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.82rem" }}>
                  {[
                    { icon: "🔴", text: "进度落后约7天，关键路径存在延误风险", type: "issue" },
                    { icon: "🔴", text: "需求变更频繁，已产生2项范围蔓延", type: "issue" },
                    { icon: "🟡", text: "第三方接口不稳定，可能影响集成测试", type: "risk" },
                    { icon: "🟡", text: "预计超支¥18万，需优化资源配置", type: "concern" },
                    { icon: "🟢", text: "质量控制有效，缺陷密度呈下降趋势", type: "positive" },
                  ].map((item, i) => (
                    <div key={i} style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 14px",
                      background: item.type === "positive" ? "rgba(16,185,129,0.08)" : item.type === "risk" ? "rgba(245,158,11,0.08)" : "rgba(239,68,68,0.08)",
                      borderRadius: 8,
                    }}>
                      <span style={{ fontSize: "0.85rem", flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ color: "var(--text)" }}>{item.text}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="绩效报告摘要" icon="📋" tag="执行摘要">
                <div style={{ fontSize: "0.82rem", color: "var(--text2)", lineHeight: 1.8 }}>
                  <p style={{ marginBottom: 12 }}>
                    <strong style={{ color: "var(--text)" }}>整体评估：</strong>
                    项目整体健康度为<span style={{ color: "var(--amber)", fontWeight: 600 }}>"关注"</span>等级，
                    进度与成本均出现轻度偏差，但整体可控。
                  </p>
                  <p style={{ marginBottom: 12 }}>
                    <strong style={{ color: "var(--text)" }}>SPI/CPI：</strong>
                    SPI = {EVM_DATA.spi.toFixed(3)} (进度落后)，CPI = {EVM_DATA.cpi.toFixed(3)} (成本略超)。
                    建议优先关注关键路径任务的执行效率。
                  </p>
                  <p>
                    <strong style={{ color: "var(--text)" }}>预测：</strong>
                    按当前趋势，项目完工估算 (EAC) 为 ¥{EVM_DATA.eac}万，
                    较预算超支 ¥{Math.abs(EVM_DATA.vac)}万。
                    建议采取赶工措施或优化范围。
                  </p>
                </div>
                <div style={{ marginTop: 16 }}>
                  <a
                    href="/reports"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 16px",
                      background: "var(--accent)",
                      color: "white",
                      borderRadius: 8,
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    ↗ 查看完整报告
                  </a>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
