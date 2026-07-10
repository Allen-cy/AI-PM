"use client";

import Link from "next/link";
import { useState } from "react";

interface SubProcess {
  id: string;
  name: string;
  href: string;
  desc: string;
  status: "pending" | "active" | "completed";
}

interface MainProcess {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  subProcesses: SubProcess[];
}

const BLUEPRINT_DATA: MainProcess[] = [
  {
    id: "initiation",
    name: "启动阶段",
    icon: "🚀",
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.08)",
    borderColor: "rgba(245, 158, 11, 0.3)",
    subProcesses: [
      { id: "crm", name: "客户关系管理", href: "/initiation", desc: "客户档案建立与维护", status: "completed" },
      { id: "opportunity", name: "商机挖掘", href: "/initiation", desc: "销售线索转化", status: "completed" },
      { id: "project-kickoff", name: "项目立项", href: "/initiation", desc: "立项审批与章程制定", status: "active" },
    ],
  },
  {
    id: "execution",
    name: "交付执行",
    icon: "⚙️",
    color: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.08)",
    borderColor: "rgba(59, 130, 246, 0.3)",
    subProcesses: [
      { id: "requirements", name: "需求调研", href: "/execution", desc: "业务需求采集与分析", status: "active" },
      { id: "planning-design", name: "项目策划", href: "/planning", desc: "WBS分解与进度计划", status: "pending" },
      { id: "procurement", name: "采购管理", href: "/resource", desc: "供应商筛选与采购执行", status: "pending" },
      { id: "construction", name: "施工安装", href: "/execution", desc: "现场实施与设备安装", status: "pending" },
      { id: "development", name: "开发部署", href: "/execution", desc: "系统开发与环境部署", status: "pending" },
      { id: "testing", name: "测试验收", href: "/quality", desc: "功能测试与质量验收", status: "pending" },
      { id: "acceptance", name: "项目验收", href: "/execution", desc: "客户验收与交付确认", status: "pending" },
    ],
  },
  {
    id: "monitoring",
    name: "运维监控",
    icon: "📡",
    color: "#10b981",
    bgColor: "rgba(16, 185, 129, 0.08)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    subProcesses: [
      { id: "operation", name: "运维监控", href: "/monitoring", desc: "系统运行状态监控", status: "pending" },
      { id: "incident", name: "故障响应", href: "/monitoring", desc: "问题处理与应急响应", status: "pending" },
      { id: "service-report", name: "服务报告", href: "/reports", desc: "运维服务月度报告", status: "pending" },
    ],
  },
  {
    id: "administration",
    name: "行政保障",
    icon: "📋",
    color: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.08)",
    borderColor: "rgba(139, 92, 246, 0.3)",
    subProcesses: [
      { id: "budget", name: "预算管理", href: "/evm", desc: "成本预算与费用控制", status: "pending" },
      { id: "archive", name: "档案验收", href: "/closing", desc: "项目文档归档管理", status: "pending" },
    ],
  },
  {
    id: "support",
    name: "客服支持",
    icon: "💬",
    color: "#ec4899",
    bgColor: "rgba(236, 72, 153, 0.08)",
    borderColor: "rgba(236, 72, 153, 0.3)",
    subProcesses: [
      { id: "satisfaction", name: "客户满意度", href: "/reports", desc: "客户满意度调查分析", status: "pending" },
      { id: "retrospective", name: "项目复盘", href: "/pmo", desc: "经验总结与持续改进", status: "pending" },
    ],
  },
];

const STATUS_CONFIG = {
  completed: { label: "已完成", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
  active: { label: "进行中", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.15)" },
  pending: { label: "待启动", color: "#6b7280", bg: "rgba(107, 114, 128, 0.15)" },
};

export default function BlueprintPage() {
  const [activeMain, setActiveMain] = useState<string | null>(null);
  const [hoveredSub, setHoveredSub] = useState<string | null>(null);

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
        <span style={{ fontWeight: 700 }}>🗺️ 项目全流程交付管理蓝图</span>
        <span className="tag" style={{ fontSize: "0.7rem", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>5大阶段 · 17个子流程</span>
      </header>

      {/* Blueprint Container */}
      <main style={{ flex: 1, padding: "32px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Central Hub */}
        <div style={{
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 60px rgba(59, 130, 246, 0.3)",
          margin: "20px 0 40px",
          position: "relative",
          zIndex: 10,
        }}>
          <span style={{ fontSize: "2.5rem", marginBottom: 4 }}>🎯</span>
          <span style={{ color: "white", fontWeight: 700, fontSize: "0.85rem" }}>项目管理</span>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.7rem" }}>生命周期</span>
        </div>

        {/* Main Processes Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 20,
          width: "100%",
          maxWidth: 1400,
          padding: "0 20px",
        }}>
          {BLUEPRINT_DATA.map((main) => (
            <div
              key={main.id}
              style={{
                background: main.bgColor,
                border: `1px solid ${main.borderColor}`,
                borderRadius: 16,
                padding: "20px 16px",
                display: "flex",
                flexDirection: "column",
                transition: "all 0.3s ease",
                transform: activeMain === main.id ? "translateY(-4px)" : "none",
                boxShadow: activeMain === main.id ? `0 8px 30px ${main.borderColor}` : "none",
              }}
              onMouseEnter={() => setActiveMain(main.id)}
              onMouseLeave={() => setActiveMain(null)}
            >
              {/* Main Process Header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: `1px solid ${main.borderColor}`,
              }}>
                <span style={{ fontSize: "1.8rem" }}>{main.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.95rem", color: main.color }}>
                    {main.name}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text2)" }}>
                    {main.subProcesses.length} 个子流程
                  </div>
                </div>
              </div>

              {/* Sub Processes */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {main.subProcesses.map((sub, idx) => {
                  const statusCfg = STATUS_CONFIG[sub.status];
                  const isHovered = hoveredSub === sub.id;

                  return (
                    <Link
                      key={sub.id}
                      href={sub.href}
                      style={{
                        display: "block",
                        background: isHovered ? main.bgColor : "var(--surface)",
                        border: `1px solid ${isHovered ? main.borderColor : "var(--border)"}`,
                        borderRadius: 10,
                        padding: "10px 12px",
                        textDecoration: "none",
                        transition: "all 0.2s ease",
                        position: "relative",
                        overflow: "hidden",
                      }}
                      onMouseEnter={() => setHoveredSub(sub.id)}
                      onMouseLeave={() => setHoveredSub(null)}
                    >
                      {/* Connection Line */}
                      {idx < main.subProcesses.length - 1 && (
                        <div style={{
                          position: "absolute",
                          bottom: -9,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 1,
                          height: 9,
                          background: main.borderColor,
                        }} />
                      )}

                      {/* Status Indicator */}
                      <div style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: statusCfg.color,
                        boxShadow: `0 0 6px ${statusCfg.color}`,
                      }} />

                      {/* Sub Process Name */}
                      <div style={{
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        color: isHovered ? main.color : "var(--text)",
                        marginBottom: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <span style={{ fontSize: "0.7rem", opacity: 0.6 }}>{idx + 1}</span>
                        {sub.name}
                      </div>

                      {/* Description */}
                      <div style={{
                        fontSize: "0.68rem",
                        color: "var(--text2)",
                        lineHeight: 1.4,
                      }}>
                        {sub.desc}
                      </div>

                      {/* Status Badge */}
                      <div style={{
                        marginTop: 6,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: statusCfg.bg,
                        fontSize: "0.62rem",
                        color: statusCfg.color,
                        fontWeight: 600,
                      }}>
                        {sub.status === "completed" && "✓ "}
                        {sub.status === "active" && "● "}
                        {statusCfg.label}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Flow Arrows Legend */}
        <div style={{
          marginTop: 40,
          padding: "16px 24px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          gap: 24,
        }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text2)" }}>流程状态：</span>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: cfg.color,
                boxShadow: `0 0 6px ${cfg.color}`,
              }} />
              <span style={{ fontSize: "0.78rem", color: "var(--text)" }}>{cfg.label}</span>
            </div>
          ))}
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: "0.78rem", color: "var(--text2)" }}>点击子流程名称可跳转到对应页面进行操作</span>
        </div>

        {/* Quick Navigation */}
        <div style={{
          marginTop: 24,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          justifyContent: "center",
        }}>
          {[
            { href: "/ltc", icon: "📋", label: "LTC流程" },
            { href: "/wbs", icon: "🧩", label: "WBS拆解" },
            { href: "/cpm", icon: "🔗", label: "关键路径" },
            { href: "/evm", icon: "💰", label: "挣值分析" },
            { href: "/risk", icon: "⚠️", label: "风险管理" },
            { href: "/quality", icon: "✅", label: "质量管理" },
            { href: "/reports", icon: "📊", label: "报告中心" },
            { href: "/pmo", icon: "🏛️", label: "PMO治理" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                textDecoration: "none",
                fontSize: "0.8rem",
                color: "var(--text)",
                transition: "all 0.2s",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "#3b82f6";
                (e.currentTarget as HTMLElement).style.color = "#3b82f6";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.color = "var(--text)";
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
