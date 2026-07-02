import Link from "next/link";
import type { CSSProperties } from "react";
import {
  deliveryPhases,
  getBlueprintSummary,
  getControlPointsByPhase,
  monitoringTracks,
  salesStages,
  toolSupports,
} from "@/lib/delivery-blueprint";

const panelStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 16,
};

const mutedText: CSSProperties = {
  color: "var(--text2)",
  lineHeight: 1.7,
};

function ChevronStage({ name, description, index }: { name: string; description: string; index: number }) {
  return (
    <div
      style={{
        minWidth: 190,
        background: "linear-gradient(90deg, rgba(245,158,11,0.95), rgba(249,115,22,0.92))",
        color: "#111827",
        padding: "14px 18px",
        borderRadius: 12,
        position: "relative",
        border: "1px solid rgba(255,255,255,0.16)",
      }}
    >
      <div style={{ fontSize: "0.72rem", fontWeight: 900, opacity: 0.72 }}>销售节点 {index + 1}</div>
      <div style={{ marginTop: 5, fontWeight: 900 }}>{name}</div>
      <div style={{ marginTop: 6, fontSize: "0.74rem", lineHeight: 1.5, opacity: 0.78 }}>{description}</div>
    </div>
  );
}

function ControlPointTag({ id, title, output }: { id: number; title: string; output: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "28px 1fr",
        gap: 8,
        padding: "9px 10px",
        borderRadius: 12,
        background: "rgba(96,165,250,0.1)",
        border: "1px solid rgba(96,165,250,0.24)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(96,165,250,0.18)",
          color: "var(--accent2)",
          fontWeight: 900,
          fontSize: "0.78rem",
        }}
      >
        {id}
      </span>
      <div>
        <div style={{ color: "var(--accent2)", fontWeight: 900, fontSize: "0.8rem" }}>{title}</div>
        <div style={{ color: "var(--text2)", fontSize: "0.72rem", marginTop: 3, lineHeight: 1.45 }}>{output}</div>
      </div>
    </div>
  );
}

export default function DeliveryManagementBlueprintPage() {
  const summary = getBlueprintSummary();

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
          <span className="tag tag-amber">正式版</span>
        </div>
        <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>
          销售经营 × 项目交付 × 成本闭环
        </div>
      </header>

      <section style={{ padding: "32px", maxWidth: 1480, margin: "0 auto" }}>
        <div
          style={{
            ...panelStyle,
            padding: 24,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
            gap: 22,
            alignItems: "stretch",
          }}
        >
          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              <span className="tag tag-amber">从原图结构化</span>
              <span className="tag tag-blue">BPM泳道</span>
              <span className="tag tag-green">交付经营联动</span>
            </div>
            <h1 style={{ margin: "0 0 12px", fontSize: "1.8rem", fontWeight: 950, letterSpacing: "-0.03em" }}>
              项目全流程交付管理蓝图
            </h1>
            <p style={{ ...mutedText, margin: 0, maxWidth: 900 }}>
              本页面将原附件中的业务流程图正式产品化：上层是销售经营链路，中层是项目立项、规划、执行、收尾四阶段交付链路，
              下层是贯穿全流程的进度/风险/成本监控，以及概算、预算、核算、决算的成本闭环。核心不是“画流程”，而是把合同、SOW、里程碑、验收、应收、核销和项目损益串成可管理的业务闭环。
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            {[
              ["销售节点", summary.salesStages],
              ["项目阶段", summary.projectPhases],
              ["联动控制点", summary.controlPoints],
              ["监控轨道", summary.monitoringTracks],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: 14 }}>
                <div style={{ color: "var(--text2)", fontSize: "0.76rem" }}>{label}</div>
                <div style={{ color: "var(--text)", fontSize: "1.6rem", fontWeight: 950, marginTop: 6 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <section aria-labelledby="sales-chain-title" style={{ ...panelStyle, padding: 20, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <h2 id="sales-chain-title" style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>销售管理链路</h2>
              <p style={{ ...mutedText, margin: 0, fontSize: "0.82rem" }}>销售链路负责经营结果，项目链路负责交付事实；两者通过里程碑、验收和应收进行耦合。</p>
            </div>
            <span className="tag tag-amber">商机 → 签约 → 回款 → 售后</span>
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {salesStages.map((stage, index) => (
              <ChevronStage key={stage.id} name={stage.name} description={stage.description} index={index} />
            ))}
          </div>
        </section>

        <section aria-labelledby="project-chain-title" style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "end", marginBottom: 12, flexWrap: "wrap" }}>
            <div>
              <h2 id="project-chain-title" style={{ margin: "0 0 6px", fontSize: "1.05rem" }}>项目交付泳道</h2>
              <p style={{ ...mutedText, margin: 0, fontSize: "0.82rem" }}>每个阶段明确业务含义、销售触点、成本关口、管理动作和输出证据。</p>
            </div>
            <span className="tag tag-blue">立项 → 规划 → 执行 → 收尾</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(280px, 1fr))",
              gap: 12,
              overflowX: "auto",
              alignItems: "stretch",
            }}
          >
            {deliveryPhases.map((phase, index) => {
              const controlPoints = getControlPointsByPhase(phase.id);
              return (
                <article
                  key={phase.id}
                  style={{
                    ...panelStyle,
                    padding: 16,
                    minWidth: 280,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      background: "linear-gradient(90deg, rgba(245,158,11,0.92), rgba(249,115,22,0.88))",
                      color: "#111827",
                      borderRadius: 12,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: "0.72rem", fontWeight: 900, opacity: 0.72 }}>阶段 {index + 1}</div>
                    <h3 style={{ margin: "4px 0 0", fontSize: "1.05rem", fontWeight: 950 }}>{phase.name}</h3>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{phase.businessMeaning}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.22)", borderRadius: 10, padding: 10 }}>
                        <div style={{ color: "var(--accent2)", fontSize: "0.72rem", fontWeight: 900 }}>销售触点</div>
                        <div style={{ color: "var(--text)", marginTop: 4, fontSize: "0.78rem" }}>{phase.salesTouchpoint}</div>
                      </div>
                      <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.22)", borderRadius: 10, padding: 10 }}>
                        <div style={{ color: "var(--green)", fontSize: "0.72rem", fontWeight: 900 }}>成本关口</div>
                        <div style={{ color: "var(--text)", marginTop: 4, fontSize: "0.78rem" }}>{phase.costGate}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    {phase.nodes.map(node => (
                      <Link
                        key={node.id}
                        href={node.href}
                        style={{
                          textDecoration: "none",
                          display: "block",
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: 12,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                          <strong style={{ color: "var(--text)", fontSize: "0.88rem" }}>{node.name}</strong>
                          <span style={{ color: "var(--text2)", fontSize: "0.7rem", whiteSpace: "nowrap" }}>{node.role}</span>
                        </div>
                        <div style={{ color: "var(--green)", fontSize: "0.75rem", marginTop: 7 }}>输出：{node.output}</div>
                        <div style={{ color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5, marginTop: 5 }}>依据：{node.evidence}</div>
                        {node.children?.length ? (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {node.children.map(child => <span key={child} className="tag tag-blue" style={{ fontSize: "0.68rem" }}>{child}</span>)}
                          </div>
                        ) : null}
                      </Link>
                    ))}
                  </div>

                  <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
                    {controlPoints.map(point => (
                      <ControlPointTag key={point.id} id={point.id} title={point.title} output={point.output} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="monitoring-title" style={{ ...panelStyle, marginTop: 18, overflow: "hidden" }}>
          <div style={{ background: "rgba(249,115,22,0.92)", color: "#111827", padding: "14px 20px", fontWeight: 950, textAlign: "center" }}>
            监控管理：贯穿项目全流程
          </div>
          <div id="monitoring-title" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(240px, 1fr))", gap: 12, padding: 16 }}>
            {monitoringTracks.map(track => (
              <div key={track.id} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <h3 style={{ margin: 0, color: "var(--accent2)", fontSize: "0.95rem" }}>{track.name}</h3>
                <p style={{ ...mutedText, margin: "8px 0 0", fontSize: "0.78rem" }}>{track.purpose}</p>
                <div style={{ color: "var(--green)", fontSize: "0.74rem", lineHeight: 1.55, marginTop: 8 }}>证据：{track.evidence}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>成本管理闭环</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 10, overflowX: "auto" }}>
              {deliveryPhases.map(phase => (
                <div key={phase.id} style={{ minWidth: 180, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text2)", fontSize: "0.75rem" }}>{phase.name}</div>
                  <div style={{ color: "var(--green)", fontWeight: 950, marginTop: 6 }}>{phase.costGate}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.05rem" }}>工具与系统支撑</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(180px, 1fr))", gap: 10, overflowX: "auto" }}>
              {toolSupports.map(tool => (
                <Link key={tool.id} href={tool.href} style={{ minWidth: 180, textDecoration: "none", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "var(--text)", fontWeight: 900 }}>{tool.name}</div>
                  <div style={{ color: "var(--text2)", fontSize: "0.75rem", lineHeight: 1.55, marginTop: 7 }}>{tool.purpose}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section style={{ ...panelStyle, padding: 18, marginTop: 18 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: "1.05rem" }}>原图逻辑解读</h2>
          <ul style={{ ...mutedText, paddingLeft: 20, margin: 0, fontSize: "0.82rem" }}>
            <li>销售管理不是独立流程，它在商机、签约、回款、应收、核销和售后服务节点上持续影响项目管理。</li>
            <li>项目管理不是只看进度，必须把SOW、WBS、里程碑、资源、预算、变更、验收和移交形成连续链条。</li>
            <li>监控管理横跨所有项目阶段，进度、风险和成本监控要直接生成行动项，而不是停留在看板展示。</li>
            <li>成本管理从概算到预算、核算、决算，与报价、资源投入、回款和项目损益共同构成业财一体化闭环。</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
