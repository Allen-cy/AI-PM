"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

interface SubProcess {
  id: string;
  name: string;
  href: string;
}

interface MainProcess {
  id: string;
  name: string;
  icon: string;
  color: string;
  subProcesses: SubProcess[];
}

const BLUEPRINT_DATA: MainProcess[] = [
  {
    id: "initiation",
    name: "启动",
    icon: "🚀",
    color: "#f97316",
    subProcesses: [
      { id: "opportunity", name: "商机立项", href: "/ltc" },
      { id: "requirements", name: "需求调研", href: "/execution" },
    ],
  },
  {
    id: "execution",
    name: "交付",
    icon: "⚙️",
    color: "#3b82f6",
    subProcesses: [
      { id: "construction", name: "施工调试", href: "/execution" },
      { id: "acceptance", name: "验收培训", href: "/quality" },
      { id: "contract", name: "合同管理", href: "/contract" },
    ],
  },
  {
    id: "monitoring",
    name: "运维",
    icon: "📡",
    color: "#22c55e",
    subProcesses: [
      { id: "incident", name: "故障响应", href: "/monitoring" },
      { id: "report", name: "服务报告", href: "/reports" },
    ],
  },
  {
    id: "administration",
    name: "行政",
    icon: "📋",
    color: "#a855f7",
    subProcesses: [
      { id: "budget", name: "预算管理", href: "/evm" },
      { id: "archive", name: "档案验收", href: "/closing" },
    ],
  },
  {
    id: "support",
    name: "客服",
    icon: "💬",
    color: "#ec4899",
    subProcesses: [
      { id: "satisfaction", name: "客户满意度", href: "/reports" },
      { id: "retrospective", name: "项目复盘", href: "/pmo" },
    ],
  },
];

export default function BlueprintV2Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: Math.max(600, containerRef.current.offsetHeight),
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const centerX = dimensions.width / 2;
  const centerY = dimensions.height / 2;
  const mainRadius = Math.min(dimensions.width, dimensions.height) * 0.35;
  const subRadius = Math.min(dimensions.width, dimensions.height) * 0.55;

  const getPosition = (angle: number, radius: number) => ({
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  });

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
        <span style={{ fontWeight: 700 }}>🗺️ 项目全流程交付管理蓝图 V2</span>
        <span className="tag" style={{ fontSize: "0.7rem", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>图形化视图</span>
      </header>

      {/* Blueprint Canvas */}
      <main
        ref={containerRef}
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "radial-gradient(circle at center, rgba(59, 130, 246, 0.03) 0%, transparent 70%)",
        }}
      >
        <svg
          width={dimensions.width}
          height={dimensions.height}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <defs>
            {/* Gradient for center */}
            <radialGradient id="centerGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.05" />
            </radialGradient>

            {/* Arrow marker */}
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>

            {/* Glowing center gradient */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connection lines from center to main processes */}
          {BLUEPRINT_DATA.map((main, index) => {
            const angle = (index / BLUEPRINT_DATA.length) * 2 * Math.PI - Math.PI / 2;
            const mainPos = getPosition(angle, mainRadius);

            return (
              <g key={`connections-${main.id}`}>
                {/* Line from center to main process */}
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={mainPos.x}
                  y2={mainPos.y}
                  stroke="#e2e8f0"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  opacity="0.5"
                />

                {/* Lines from main process to sub processes */}
                {main.subProcesses.map((sub, subIndex) => {
                  const subAngle = angle + (subIndex - (main.subProcesses.length - 1) / 2) * 0.3;
                  const subPos = getPosition(subAngle, subRadius);

                  return (
                    <g key={`sub-line-${sub.id}`}>
                      {/* Curved or straight line */}
                      <path
                        d={`M ${mainPos.x} ${mainPos.y} Q ${(mainPos.x + subPos.x) / 2} ${mainPos.y - 30} ${subPos.x} ${subPos.y}`}
                        stroke={main.color}
                        strokeWidth="2"
                        fill="none"
                        opacity="0.6"
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Main Process Nodes */}
        {BLUEPRINT_DATA.map((main, index) => {
          const angle = (index / BLUEPRINT_DATA.length) * 2 * Math.PI - Math.PI / 2;
          const pos = getPosition(angle, mainRadius);

          return (
            <div
              key={main.id}
              style={{
                position: "absolute",
                left: pos.x,
                top: pos.y,
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: `linear-gradient(135deg, ${main.color} 0%, ${main.color}88 100%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: `0 4px 20px ${main.color}40`,
                  border: `3px solid ${main.color}`,
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                }}
              >
                <span style={{ fontSize: "1.8rem" }}>{main.icon}</span>
              </div>
              <span
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: main.color,
                  textShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}
              >
                {main.name}
              </span>
            </div>
          );
        })}

        {/* Sub Process Nodes */}
        {BLUEPRINT_DATA.map((main, index) => {
          const angle = (index / BLUEPRINT_DATA.length) * 2 * Math.PI - Math.PI / 2;

          return main.subProcesses.map((sub, subIndex) => {
            const subAngle = angle + (subIndex - (main.subProcesses.length - 1) / 2) * 0.3;
            const pos = getPosition(subAngle, subRadius);

            return (
              <Link
                key={sub.id}
                href={sub.href}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  transform: "translate(-50%, -50%)",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    padding: "8px 16px",
                    background: "var(--surface)",
                    border: `2px solid ${main.color}`,
                    borderRadius: 20,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: main.color,
                    whiteSpace: "nowrap",
                    boxShadow: `0 2px 12px ${main.color}30`,
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.transform = "translate(-50%, -50%) scale(1.08)";
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${main.color}50`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.transform = "translate(-50%, -50%) scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 12px ${main.color}30`;
                  }}
                >
                  {sub.name}
                </div>
              </Link>
            );
          });
        })}

        {/* Center Hub */}
        <div
          style={{
            position: "absolute",
            left: centerX,
            top: centerY,
            transform: "translate(-50%, -50%)",
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 8px 40px rgba(59, 130, 246, 0.4)",
            zIndex: 10,
          }}
        >
          <span style={{ fontSize: "2.5rem" }}>🎯</span>
          <span style={{ color: "white", fontWeight: 800, fontSize: "0.9rem" }}>项目管理</span>
          <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "0.7rem" }}>全流程</span>
        </div>

        {/* Legend */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 20,
            padding: "12px 24px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}
        >
          {BLUEPRINT_DATA.map((main) => (
            <div
              key={main.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: main.color,
                  boxShadow: `0 0 8px ${main.color}60`,
                }}
              />
              <span style={{ fontSize: "0.78rem", color: "var(--text)" }}>
                {main.icon} {main.name}
              </span>
            </div>
          ))}
        </div>

        {/* Title */}
        <div
          style={{
            position: "absolute",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 20px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
            📋 项目全流程交付管理蓝图
          </span>
        </div>
      </main>
    </div>
  );
}
