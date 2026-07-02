import Link from "next/link";
import type { CSSProperties } from "react";
import {
  deliveryControlPoints,
  deliveryPhases,
  monitoringTracks,
  toolSupports,
} from "@/lib/delivery-blueprint";

type NodeKind = "sales" | "project" | "cost" | "tool";

type FlowNode = {
  id: string;
  lane: "sales" | "project" | "cost" | "tools";
  label: string;
  sub?: string;
  href?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: NodeKind;
};

type FlowLink = {
  from: string;
  to: string;
  label?: string;
  tone?: "primary" | "control" | "cost";
  bend?: "straight" | "vertical" | "up";
};

const CANVAS = { width: 2520, height: 980 };

const laneRows = [
  { id: "sales", label: "销售管理", y: 72, h: 130, border: "rgba(245,158,11,0.32)" },
  { id: "project", label: "项目管理", y: 224, h: 300, border: "rgba(96,165,250,0.28)" },
  { id: "monitoring", label: "监控管理", y: 548, h: 160, border: "rgba(249,115,22,0.32)" },
  { id: "cost", label: "成本管理", y: 734, h: 112, border: "rgba(16,185,129,0.28)" },
  { id: "tools", label: "工具", y: 872, h: 80, border: "rgba(139,92,246,0.28)" },
];

const salesNodes: FlowNode[] = [
  { id: "s-opportunity", lane: "sales", label: "商机", sub: "线索进入项目化评估", x: 150, y: 104, w: 210, h: 64, kind: "sales" },
  { id: "s-sign", lane: "sales", label: "合同签约", sub: "合同/SOW边界确认", x: 410, y: 104, w: 210, h: 64, kind: "sales" },
  { id: "s-order", lane: "sales", label: "合同/订单", sub: "付款条件与订单口径", x: 670, y: 104, w: 250, h: 64, kind: "sales" },
  { id: "s-payment-plan", lane: "sales", label: "回款计划", sub: "里程碑触发回款", x: 980, y: 104, w: 220, h: 64, kind: "sales" },
  { id: "s-receivable", lane: "sales", label: "应收", sub: "验收后确认应收", x: 1260, y: 104, w: 210, h: 64, kind: "sales" },
  { id: "s-writeoff", lane: "sales", label: "核销", sub: "到账核销与损益", x: 1530, y: 104, w: 210, h: 64, kind: "sales" },
  { id: "s-service", lane: "sales", label: "售后服务", sub: "移交CSM持续服务", x: 1810, y: 104, w: 230, h: 64, kind: "sales" },
];

const projectNodes: FlowNode[] = deliveryPhases.flatMap((phase, phaseIndex) => {
  const starts = [150, 670, 1370, 1990];
  const y = 332;
  return phase.nodes.map((node, index) => ({
    id: `p-${node.id}`,
    lane: "project" as const,
    label: node.name,
    sub: node.output,
    href: node.href,
    x: starts[phaseIndex] + index * 128,
    y,
    w: 112,
    h: 74,
    kind: "project" as const,
  }));
});

const costNodes: FlowNode[] = [
  { id: "c-estimate", lane: "cost", label: "项目概算", sub: "支撑报价/预立项", x: 300, y: 762, w: 260, h: 54, kind: "cost" },
  { id: "c-budget", lane: "cost", label: "项目预算", sub: "预算审批后形成基线", x: 820, y: 762, w: 320, h: 54, kind: "cost" },
  { id: "c-accounting", lane: "cost", label: "核算（预算执行）", sub: "人力/采购/物料实际成本", x: 1420, y: 762, w: 320, h: 54, kind: "cost" },
  { id: "c-final", lane: "cost", label: "决算", sub: "计算项目损益", x: 2030, y: 762, w: 260, h: 54, kind: "cost" },
];

const toolNodes: FlowNode[] = toolSupports.map((tool, index) => ({
  id: `t-${tool.id}`,
  lane: "tools" as const,
  label: tool.name,
  sub: tool.purpose,
  href: tool.href,
  x: 150 + index * 440,
  y: 895,
  w: 300,
  h: 42,
  kind: "tool" as const,
}));

const allNodes = [...salesNodes, ...projectNodes, ...costNodes, ...toolNodes];

const phaseBars = [
  { name: "项目立项", x: 150, w: 500 },
  { name: "项目规划", x: 670, w: 670 },
  { name: "项目执行", x: 1370, w: 590 },
  { name: "项目收尾", x: 1990, w: 390 },
];

const salesLinks: FlowLink[] = salesNodes.slice(0, -1).map((node, index) => ({
  from: node.id,
  to: salesNodes[index + 1].id,
  tone: "primary",
}));

const projectLinks: FlowLink[] = projectNodes.slice(0, -1).map((node, index) => ({
  from: node.id,
  to: projectNodes[index + 1].id,
  tone: "primary",
}));

const costLinks: FlowLink[] = costNodes.slice(0, -1).map((node, index) => ({
  from: node.id,
  to: costNodes[index + 1].id,
  tone: "cost",
}));

const controlLinks: FlowLink[] = [
  { from: "s-opportunity", to: "p-initiation-request", label: "① 预立项申请", tone: "control", bend: "vertical" },
  { from: "c-estimate", to: "s-sign", label: "② 概算指导销售报价", tone: "cost", bend: "up" },
  { from: "p-sow-breakdown", to: "s-sign", label: "③ 工作计划作为合同附件", tone: "control", bend: "up" },
  { from: "s-sign", to: "p-team-setup", label: "④ 正式立项", tone: "control", bend: "vertical" },
  { from: "s-order", to: "p-milestone-plan", label: "⑤ 付款条件+SOW生成里程碑", tone: "control", bend: "vertical" },
  { from: "p-milestone-plan", to: "s-payment-plan", label: "⑥ 里程碑关联回款计划", tone: "control", bend: "up" },
  { from: "p-milestone", to: "s-payment-plan", label: "⑦ 里程碑验收触发回款", tone: "control", bend: "up" },
  { from: "p-acceptance", to: "s-receivable", label: "⑧ 项目验收确认应收", tone: "control", bend: "up" },
  { from: "s-writeoff", to: "c-final", label: "⑨ 核销回款，计算损益", tone: "cost", bend: "vertical" },
  { from: "p-handover", to: "s-service", label: "⑩ 项目移交到CSM", tone: "control", bend: "up" },
];

const flowLinks = [...salesLinks, ...projectLinks, ...costLinks, ...controlLinks];

const nodeMap = new Map(allNodes.map(node => [node.id, node]));

const pagePanel: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
};

function nodeCenter(node: FlowNode, side: "left" | "right" | "top" | "bottom" | "center") {
  if (side === "left") return { x: node.x, y: node.y + node.h / 2 };
  if (side === "right") return { x: node.x + node.w, y: node.y + node.h / 2 };
  if (side === "top") return { x: node.x + node.w / 2, y: node.y };
  if (side === "bottom") return { x: node.x + node.w / 2, y: node.y + node.h };
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function linkPath(link: FlowLink) {
  const from = nodeMap.get(link.from);
  const to = nodeMap.get(link.to);
  if (!from || !to) return null;
  const start = link.bend === "up" ? nodeCenter(from, "top") : link.bend === "vertical" ? nodeCenter(from, "bottom") : nodeCenter(from, "right");
  const end = link.bend === "up" ? nodeCenter(to, "bottom") : link.bend === "vertical" ? nodeCenter(to, "top") : nodeCenter(to, "left");
  if (link.bend === "vertical" || link.bend === "up") {
    const midY = link.bend === "up" ? Math.min(start.y, end.y) - 24 : Math.max(start.y, end.y) + 22;
    return `M ${start.x} ${start.y} L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
  }
  const midX = start.x + (end.x - start.x) / 2;
  return `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;
}

function labelPosition(link: FlowLink) {
  const from = nodeMap.get(link.from);
  const to = nodeMap.get(link.to);
  if (!from || !to) return { x: 0, y: 0 };
  const a = nodeCenter(from, "center");
  const b = nodeCenter(to, "center");
  return {
    x: a.x + (b.x - a.x) / 2,
    y: link.bend === "up" ? Math.min(a.y, b.y) - 48 : a.y + (b.y - a.y) / 2 - 10,
  };
}

function FlowNodeView({ node }: { node: FlowNode }) {
  const colors: Record<NodeKind, { bg: string; border: string; text: string }> = {
    sales: { bg: "rgba(245,158,11,0.94)", border: "rgba(251,191,36,0.96)", text: "#111827" },
    project: { bg: "rgba(30,41,59,0.96)", border: "rgba(96,165,250,0.58)", text: "var(--text)" },
    cost: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.42)", text: "var(--text)" },
    tool: { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.36)", text: "var(--text)" },
  };
  const color = colors[node.kind];
  const content = (
    <div
      style={{
        position: "absolute",
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        borderRadius: node.kind === "sales" ? 4 : 10,
        border: `1px solid ${color.border}`,
        background: color.bg,
        color: color.text,
        padding: node.kind === "tool" ? "7px 10px" : "9px 11px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        textAlign: "center",
        boxShadow: node.kind === "project" ? "0 10px 24px rgba(0,0,0,0.16)" : "none",
      }}
    >
      <strong style={{ fontSize: node.kind === "project" ? "0.82rem" : "0.86rem", lineHeight: 1.25 }}>{node.label}</strong>
      {node.sub ? <span style={{ fontSize: "0.68rem", lineHeight: 1.35, marginTop: 4, opacity: node.kind === "sales" ? 0.72 : 0.82 }}>{node.sub}</span> : null}
    </div>
  );
  if (!node.href) return content;
  return (
    <Link href={node.href} aria-label={`打开${node.label}`} style={{ textDecoration: "none" }}>
      {content}
    </Link>
  );
}

export default function DeliveryManagementBlueprintPage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
          <Link href="/blueprint-v3" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>蓝图v2-BPM视图</Link>
          <span style={{ color: "var(--border)" }}>|</span>
          <strong style={{ color: "var(--amber)" }}>项目全流程交付管理蓝图</strong>
          <span className="tag tag-amber">BPM流程图</span>
        </div>
        <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>独立子页面 · 原蓝图v2-BPM视图保留</span>
      </header>

      <section style={{ padding: "28px 32px", maxWidth: 1520, margin: "0 auto" }}>
        <div style={{ ...pagePanel, padding: 22, marginBottom: 18 }}>
          <h1 style={{ margin: "0 0 10px", fontSize: "1.75rem", fontWeight: 950, letterSpacing: "-0.03em" }}>
            项目全流程交付管理蓝图
          </h1>
          <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.75, maxWidth: 1040 }}>
            本页按 BPM 泳道图重构原图：箭头表示流程流转、编号表示跨泳道触发点、虚线表示管理控制或成本沉淀关系。
            销售从商机推进到回款与售后，项目从立项推进到规划、执行、收尾，监控和成本贯穿并反向约束交付动作。
          </p>
        </div>

        <section aria-label="项目全流程交付管理BPM泳道图" style={{ ...pagePanel, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1rem" }}>BPM泳道流程图</h2>
              <p style={{ margin: "6px 0 0", color: "var(--text2)", fontSize: "0.78rem" }}>横向箭头表示阶段流转；跨泳道箭头表示销售、项目、成本之间的触发和状态变更。</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="tag tag-amber">销售流</span>
              <span className="tag tag-blue">项目流</span>
              <span className="tag tag-green">成本流</span>
            </div>
          </div>

          <div style={{ overflowX: "auto", overflowY: "hidden", background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.08))" }}>
            <div style={{ position: "relative", width: CANVAS.width, height: CANVAS.height }}>
              {laneRows.map(row => (
                <div key={row.id}>
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: row.y,
                      width: 118,
                      height: row.h,
                      borderRight: "2px solid var(--border)",
                      borderTop: `1px solid ${row.border}`,
                      borderBottom: `1px solid ${row.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text)",
                      fontWeight: 950,
                      background: "rgba(15,23,42,0.88)",
                    }}
                  >
                    {row.label}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      left: 118,
                      top: row.y,
                      width: CANVAS.width - 118,
                      height: row.h,
                      borderTop: `1px solid ${row.border}`,
                      borderBottom: `1px solid ${row.border}`,
                      background: row.id === "sales" ? "rgba(245,158,11,0.04)" : row.id === "monitoring" ? "rgba(249,115,22,0.03)" : "rgba(15,23,42,0.22)",
                    }}
                  />
                </div>
              ))}

              {phaseBars.map(phase => (
                <div
                  key={phase.name}
                  style={{
                    position: "absolute",
                    left: phase.x,
                    top: 252,
                    width: phase.w,
                    height: 42,
                    background: "rgba(249,115,22,0.92)",
                    color: "#111827",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 950,
                    clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%, 20px 50%)",
                  }}
                >
                  {phase.name}
                </div>
              ))}

              <svg width={CANVAS.width} height={CANVAS.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
                <defs>
                  <marker id="arrow-primary" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#60a5fa" />
                  </marker>
                  <marker id="arrow-control" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#fbbf24" />
                  </marker>
                  <marker id="arrow-cost" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="#10b981" />
                  </marker>
                </defs>
                {flowLinks.map((link, index) => {
                  const path = linkPath(link);
                  if (!path) return null;
                  const color = link.tone === "cost" ? "#10b981" : link.tone === "control" ? "#fbbf24" : "#60a5fa";
                  const marker = link.tone === "cost" ? "url(#arrow-cost)" : link.tone === "control" ? "url(#arrow-control)" : "url(#arrow-primary)";
                  const position = labelPosition(link);
                  return (
                    <g key={`${link.from}-${link.to}-${index}`}>
                      <path
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth={link.tone === "primary" ? 2.4 : 1.8}
                        strokeDasharray={link.tone === "primary" ? undefined : "7 5"}
                        markerEnd={marker}
                        opacity={link.tone === "primary" ? 0.88 : 0.78}
                      />
                      {link.label ? (
                        <foreignObject x={position.x - 86} y={position.y - 14} width={172} height={44}>
                          <div
                            style={{
                              color,
                              background: "rgba(10,14,23,0.92)",
                              border: `1px solid ${color}55`,
                              borderRadius: 999,
                              padding: "4px 8px",
                              textAlign: "center",
                              fontSize: "0.66rem",
                              lineHeight: 1.35,
                              fontWeight: 850,
                            }}
                          >
                            {link.label}
                          </div>
                        </foreignObject>
                      ) : null}
                    </g>
                  );
                })}
              </svg>

              {allNodes.map(node => <FlowNodeView key={node.id} node={node} />)}

              <div style={{ position: "absolute", left: 150, top: 570, width: 2240 }}>
                <div style={{ height: 34, background: "rgba(249,115,22,0.92)", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 950, clipPath: "polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%)" }}>
                  监控管理贯穿全流程
                </div>
                <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
                  {monitoringTracks.map(track => (
                    <div key={track.id} style={{ height: 30, border: "1px solid rgba(148,163,184,0.34)", color: "var(--text2)", display: "grid", gridTemplateColumns: "180px 1fr 220px", alignItems: "center", padding: "0 12px", background: "rgba(15,23,42,0.76)" }}>
                      <strong style={{ color: "var(--text)", fontSize: "0.78rem" }}>{track.name}</strong>
                      <span style={{ fontSize: "0.72rem" }}>{track.purpose}</span>
                      <span style={{ color: "var(--green)", fontSize: "0.72rem", textAlign: "right" }}>{track.evidence}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 0.7fr)", gap: 16, marginTop: 18 }}>
          <div style={{ ...pagePanel, padding: 18 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1rem" }}>10个关键流转与状态变更</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {deliveryControlPoints.map(point => (
                <div key={point.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "var(--surface2)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 999, background: "rgba(96,165,250,0.18)", color: "var(--accent2)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 950 }}>{point.id}</span>
                    <strong style={{ color: "var(--text)", fontSize: "0.82rem" }}>{point.title}</strong>
                  </div>
                  <p style={{ color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.55, margin: "8px 0 0" }}>{point.description}</p>
                  <div style={{ color: "var(--green)", fontSize: "0.72rem", marginTop: 7 }}>输出：{point.output}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ ...pagePanel, padding: 18 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1rem" }}>图例</h2>
            <div style={{ display: "grid", gap: 10, color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>
              <div><span className="tag tag-amber">橙色节点</span> 销售经营节点，表达商机、签约、回款、核销、售后的经营流。</div>
              <div><span className="tag tag-blue">蓝色箭头</span> 项目交付主流程，从立项到移交。</div>
              <div><span className="tag tag-green">绿色箭头</span> 成本从概算、预算、核算到决算的业财流。</div>
              <div><span className="tag tag-amber">虚线箭头</span> 跨泳道触发，表示合同、SOW、里程碑、验收、应收、核销之间的状态变更。</div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)", color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.7 }}>
              这个子页面保留为独立流程蓝图；原 `/blueprint-v3` 仍是蓝图v2-BPM视图入口，不再被替换。
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
