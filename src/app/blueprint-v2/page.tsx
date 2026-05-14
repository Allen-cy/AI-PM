"use client";

import Link from "next/link";
import { useState } from "react";

interface ProcessNode {
  id: string;
  name: string;
  href: string;
  status: "done" | "current" | "pending";
}

interface Module {
  id: string;
  name: string;
  icon: string;
  color: string;
  items: ProcessNode[];
}

const MODULES: Module[] = [
  {
    id: "sales",
    name: "销售管理",
    icon: "💼",
    color: "#3b82f6",
    items: [
      { id: "opportunity", name: "商机", href: "/initiation", status: "done" },
      { id: "sign", name: "合同签约", href: "/contract", status: "done" },
      { id: "contract-order", name: "合同/订单", href: "/contract", status: "current" },
      { id: "payment-plan", name: "回款计划", href: "/contract", status: "pending" },
      { id: "receivable", name: "应收", href: "/contract", status: "pending" },
      { id: "writeoff", name: "核销", href: "/contract", status: "pending" },
      { id: "aftersale", name: "售后服务", href: "/execution", status: "pending" },
    ],
  },
  {
    id: "project",
    name: "项目管理",
    icon: "📋",
    color: "#22c55e",
    items: [
      { id: "initiation", name: "项目立项", href: "/initiation", status: "done" },
      { id: "planning", name: "项目规划", href: "/planning", status: "current" },
      { id: "execution", name: "项目执行", href: "/execution", status: "pending" },
      { id: "closure", name: "项目收尾", href: "/closing", status: "pending" },
      { id: "monitoring", name: "监控管理", href: "/monitoring", status: "pending" },
    ],
  },
  {
    id: "cost",
    name: "成本管理",
    icon: "💰",
    color: "#f59e0b",
    items: [
      { id: "estimate", name: "项目概算", href: "/evm", status: "done" },
      { id: "budget", name: "项目预算", href: "/evm", status: "current" },
      { id: "budget-exec", name: "预算执行(核算)", href: "/evm", status: "pending" },
      { id: "final", name: "决算", href: "/evm", status: "pending" },
    ],
  },
  {
    id: "tools",
    name: "工具",
    icon: "🛠️",
    color: "#8b5cf6",
    items: [
      { id: "wecom", name: "项目与企业微信", href: "/process", status: "pending" },
      { id: "pmo-board", name: "PMO看板", href: "/pmo", status: "pending" },
      { id: "template", name: "项目模版", href: "/knowledge", status: "pending" },
      { id: "doc", name: "结构化文档", href: "/knowledge", status: "pending" },
      { id: "other", name: "其他", href: "/knowledge", status: "pending" },
    ],
  },
];

// Central flow nodes (top to bottom)
const FLOW_NODES = [
  { id: "start", name: "启动", icon: "🚀", color: "#64748b", y: 5 },
  { id: "demand", name: "需求", icon: "📝", color: "#3b82f6", y: 20 },
  { id: "plan", name: "方案/规划", icon: "📐", color: "#8b5cf6", y: 35 },
  { id: "bid", name: "招投标", icon: "📋", color: "#f59e0b", y: 50 },
  { id: "contract", name: "合同签约", icon: "✍️", color: "#22c55e", y: 65 },
  { id: "execute", name: "项目执行", icon: "⚙️", color: "#3b82f6", y: 80 },
  { id: "accept", name: "验收交付", icon: "✅", color: "#22c55e", y: 95 },
  { id: "close", name: "项目收尾", icon: "🏁", color: "#64748b", y: 110 },
  { id: "payment", name: "回款", icon: "💵", color: "#ec4899", y: 125 },
  { id: "archive", name: "归档", icon: "📁", color: "#64748b", y: 140 },
];

const STATUS_STYLE = {
  done: { bg: "rgba(34, 197, 94, 0.2)", border: "#22c55e", text: "已完成" },
  current: { bg: "rgba(59, 130, 246, 0.2)", border: "#3b82f6", text: "进行中" },
  pending: { bg: "rgba(148, 163, 184, 0.2)", border: "#94a3b8", text: "待启动" },
};

export default function BlueprintV2Page() {
  const [editingModule, setEditingModule] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>(MODULES);
  const [editName, setEditName] = useState("");
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleEditModule = (module: Module) => {
    setEditingModule(module.id);
    setEditName(module.name);
  };

  const handleSaveModule = () => {
    if (editingModule) {
      setModules(modules.map(m =>
        m.id === editingModule ? { ...m, name: editName } : m
      ));
      setEditingModule(null);
    }
  };

  const handleEditItem = (moduleId: string, itemId: string) => {
    const module = modules.find(m => m.id === moduleId);
    const item = module?.items.find(i => i.id === itemId);
    if (item) {
      const newName = prompt("修改节点名称", item.name);
      if (newName && newName !== item.name) {
        setModules(modules.map(m =>
          m.id === moduleId
            ? { ...m, items: m.items.map(i => i.id === itemId ? { ...i, name: newName } : i) }
            : m
        ));
      }
    }
  };

  const handleStatusChange = (moduleId: string, itemId: string) => {
    const module = modules.find(m => m.id === moduleId);
    const item = module?.items.find(i => i.id === itemId);
    if (item) {
      const nextStatus = item.status === "done" ? "current" : item.status === "current" ? "pending" : "done";
      setModules(modules.map(m =>
        m.id === moduleId
          ? { ...m, items: m.items.map(i => i.id === itemId ? { ...i, status: nextStatus } : i) }
          : m
      ));
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</a>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>🗺️ 项目全流程交付管理蓝图 V2</span>
          <span className="tag" style={{ fontSize: "0.7rem", background: "rgba(139, 92, 246, 0.1)", color: "#8b5cf6" }}>可编辑</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text2)", padding: "4px 12px", background: "var(--surface2)", borderRadius: 6 }}>
            💡 点击模块名称或节点可编辑
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left Sidebar - Modules */}
        <aside style={{
          width: 280,
          borderRight: "1px solid var(--border)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 4 }}>业务场景 & 工具模块</h2>
            <p style={{ fontSize: "0.7rem", color: "var(--text2)" }}>共 {modules.length} 个模块 · {modules.reduce((sum, m) => sum + m.items.length, 0)} 个节点</p>
          </div>

          {/* Module List */}
          <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
            {modules.map((module) => (
              <div
                key={module.id}
                style={{
                  marginBottom: 16,
                  background: "var(--bg)",
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid var(--border)`,
                }}
              >
                {/* Module Header */}
                <div
                  style={{
                    padding: "10px 12px",
                    background: `${module.color}15`,
                    borderBottom: `1px solid ${module.color}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                  }}
                  onClick={() => handleEditModule(module)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: "1.2rem" }}>{module.icon}</span>
                    {editingModule === module.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={handleSaveModule}
                        onKeyDown={e => e.key === "Enter" && handleSaveModule()}
                        autoFocus
                        style={{
                          background: "var(--surface)",
                          border: `1px solid ${module.color}`,
                          borderRadius: 4,
                          padding: "2px 6px",
                          fontSize: "0.8rem",
                          width: 100,
                          color: "var(--text)",
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: module.color }}>
                        {module.name}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.7rem", color: "var(--text2)" }}>
                    {module.items.length}项
                  </span>
                </div>

                {/* Module Items */}
                <div style={{ padding: 8 }}>
                  {module.items.map((item, idx) => {
                    const status = STATUS_STYLE[item.status];
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "8px 10px",
                          borderRadius: 6,
                          marginBottom: idx < module.items.length - 1 ? 4 : 0,
                          background: status.bg,
                          border: `1px solid ${status.border}40`,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onClick={() => handleEditItem(module.id, item.id)}
                        onDoubleClick={() => handleStatusChange(module.id, item.id)}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.transform = "translateX(2px)";
                          (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${status.border}30`;
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.transform = "none";
                          (e.currentTarget as HTMLElement).style.boxShadow = "none";
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: status.border,
                          }} />
                          <span style={{ fontSize: "0.78rem", color: "var(--text)", fontWeight: 500 }}>
                            {item.name}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.65rem", color: status.border, fontWeight: 600 }}>
                          {item.status === "done" ? "✓" : item.status === "current" ? "●" : "○"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right Canvas - Flow Diagram */}
        <div style={{
          flex: 1,
          background: "linear-gradient(180deg, rgba(59, 130, 246, 0.02) 0%, rgba(139, 92, 246, 0.02) 100%)",
          position: "relative",
          overflow: "auto",
          padding: 24,
        }}>
          {/* Flow Title */}
          <div style={{
            textAlign: "center",
            marginBottom: 24,
            padding: "12px 20px",
            background: "var(--surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            width: "fit-content",
            margin: "0 auto 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            <span style={{ fontSize: "1.2rem" }}>📋</span>
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>项目全流程交付管理</span>
          </div>

          {/* Central Flow Canvas */}
          <div style={{
            display: "flex",
            justifyContent: "center",
            position: "relative",
          }}>
            {/* Vertical Flow Line */}
            <div style={{
              position: "absolute",
              left: "50%",
              top: 60,
              bottom: 60,
              width: 2,
              background: "linear-gradient(180deg, #64748b 0%, #3b82f6 50%, #64748b 100%)",
              transform: "translateX(-50%)",
              opacity: 0.3,
            }} />

            {/* Flow Nodes */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              position: "relative",
              zIndex: 1,
            }}>
              {FLOW_NODES.map((node, idx) => {
                const isHovered = hoveredNode === node.id;
                return (
                  <Link
                    key={node.id}
                    href="/"
                    style={{ textDecoration: "none" }}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "12px 24px",
                        background: isHovered ? `${node.color}20` : "var(--surface)",
                        border: `2px solid ${isHovered ? node.color : "var(--border)"}`,
                        borderRadius: 12,
                        minWidth: 200,
                        transition: "all 0.2s",
                        transform: isHovered ? "scale(1.05)" : "scale(1)",
                        boxShadow: isHovered ? `0 8px 24px ${node.color}30` : "0 2px 8px rgba(0,0,0,0.05)",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        background: `${node.color}20`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        border: `2px solid ${node.color}`,
                      }}>
                        {node.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.9rem", color: node.color }}>
                          {node.name}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginTop: 2 }}>
                          {idx + 1} / {FLOW_NODES.length}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Monitoring Module - Horizontal across the middle */}
          <div style={{
            position: "absolute",
            top: "38%",
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
          }}>
            <div style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
              padding: "16px 24px",
              background: "rgba(34, 197, 94, 0.1)",
              border: "2px dashed #22c55e",
              borderRadius: 16,
              transform: "rotate(-90deg)",
              transformOrigin: "center",
            }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#22c55e" }}>
                📡 监控管理（贯穿全流程）
              </span>
              {["进度监控", "风险监控", "成本监控", "需求监控", "变更监控"].map((item, idx) => (
                <span
                  key={item}
                  style={{
                    padding: "4px 12px",
                    background: "var(--surface)",
                    border: "1px solid #22c55e40",
                    borderRadius: 12,
                    fontSize: "0.7rem",
                    color: "#22c55e",
                    fontWeight: 500,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            display: "flex",
            gap: 16,
            padding: "12px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text2)" }}>状态：</span>
            {Object.entries(STATUS_STYLE).map(([key, val]) => (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: val.border,
                }} />
                <span style={{ fontSize: "0.72rem", color: "var(--text)" }}>{val.text}</span>
              </div>
            ))}
            <span style={{ color: "var(--border)" }}>|</span>
            <span style={{ fontSize: "0.72rem", color: "var(--text2)" }}>双击切换状态</span>
          </div>
        </div>
      </main>
    </div>
  );
}
