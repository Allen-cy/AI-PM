"use client";

import Link from "next/link";

const PHASE_MODULES = [
  {
    phase: "启动阶段",
    emoji: "🚀",
    tag: "阶段门治理",
    modules: [
      {
        href: "/initiation",
        icon: "📋",
        title: "立项与启动",
        desc: "商业论证、项目章程、干系人识别、需求管理",
        color: "amber",
      },
      {
        href: "/dashboard",
        icon: "📊",
        title: "项目组合看板",
        desc: "KPI卡片、状态分布、健康度矩阵、风险项目",
        color: "blue",
      },
    ],
  },
  {
    phase: "规划阶段",
    emoji: "📋",
    tag: "计划与基线",
    modules: [
      {
        href: "/planning",
        icon: "🗺️",
        title: "规划中心",
        desc: "10大知识领域规划、基准建立、整合管理",
        color: "purple",
      },
      {
        href: "/wbs",
        icon: "🧩",
        title: "AI WBS智能拆解",
        desc: "输入SOW自动生成工作分解结构",
        color: "accent",
      },
      {
        href: "/cpm",
        icon: "🔗",
        title: "关键路径计算",
        desc: "CPM算法、ES/EF/LS/LF、浮动时间分析",
        color: "purple",
      },
      {
        href: "/evm",
        icon: "📊",
        title: "挣值分析",
        desc: "EVM全自动计算，SPI/CPI/EAC，S曲线",
        color: "green",
      },
    ],
  },
  {
    phase: "执行阶段",
    emoji: "⚙️",
    tag: "交付协同",
    modules: [
      {
        href: "/execution",
        icon: "📈",
        title: "执行与交付",
        desc: "变更执行、质量保证、团队管理、交付物追踪",
        color: "cyan",
      },
      {
        href: "/quality",
        icon: "✅",
        title: "质量管理",
        desc: "AI检查清单、阶段评审、缺陷追踪、验收标准",
        color: "green",
      },
      {
        href: "/contract",
        icon: "📑",
        title: "合同与回款",
        desc: "AI解析付款条件、回款里程碑、逾期提醒",
        color: "green",
      },
    ],
  },
  {
    phase: "监控阶段",
    emoji: "📡",
    tag: "绩效与风险",
    modules: [
      {
        href: "/monitoring",
        icon: "🎯",
        title: "监控中心",
        desc: "健康度仪表盘、偏差分析、绩效报告",
        color: "amber",
      },
      {
        href: "/risk",
        icon: "🔐",
        title: "风险管理",
        desc: "AI风险扫描、P-I矩阵、风险登记册与预警",
        color: "purple",
      },
      {
        href: "/stakeholder",
        icon: "👥",
        title: "干系人管理",
        desc: "权力-利益矩阵、沟通计划、参与度评估",
        color: "purple",
      },
    ],
  },
  {
    phase: "收尾阶段",
    emoji: "🎯",
    tag: "验收与归档",
    modules: [
      {
        href: "/closing",
        icon: "🏁",
        title: "项目收尾",
        desc: "验收确收、复盘总结、经验教训、文档归档",
        color: "green",
      },
      {
        href: "/reports",
        icon: "📝",
        title: "AI报告生成",
        desc: "周报/月报/进度报告一键生成",
        color: "cyan",
      },
    ],
  },
  {
    phase: "工具与集成",
    emoji: "🛠️",
    tag: "扩展能力",
    modules: [
      {
        href: "/ltc",
        icon: "🔄",
        title: "LTC全流程",
        desc: "12阶段端到端流程、阶段卡控、RACI矩阵",
        color: "blue",
      },
      {
        href: "/process",
        icon: "🎨",
        title: "流程设计与白板",
        desc: "draw.io流程图、Excalidraw协作白板",
        color: "blue",
      },
      {
        href: "/knowledge",
        icon: "📚",
        title: "知识库与AI问答",
        desc: "飞书知识库+Coze机器人、RAG问答",
        color: "blue",
      },
    ],
  },
  {
    phase: "战略治理",
    emoji: "🎯",
    tag: "PRINCE2 Executive",
    modules: [
      {
        href: "/pmo",
        icon: "🏛️",
        title: "PMO治理中心",
        desc: "项目治理、OKR管理、战略决策支持、PRINCE2合规",
        color: "amber",
      },
    ],
  },
  {
    phase: "蓝图中心",
    emoji: "🗺️",
    tag: "流程总览",
    modules: [
      {
        href: "/blueprint-v1",
        icon: "📊",
        title: "蓝图v1-看板视图",
        desc: "卡片式流程总览，5大阶段17子流程",
        color: "blue",
      },
      {
        href: "/blueprint-v3",
        icon: "🗺️",
        title: "蓝图v2-BPM视图",
        desc: "业务场景与工具画布，支持节点编辑",
        color: "green",
      },
      {
        href: "/ppt-guide",
        icon: "📊",
        title: "PPT制作难点",
        desc: "AI做PPT的局限性与最佳实践指南",
        color: "cyan",
      },
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; color: string }> = {
  amber: { bg: "rgba(245,158,11,0.15)", color: "var(--amber)" },
  blue: { bg: "rgba(59,130,246,0.15)", color: "var(--accent2)" },
  purple: { bg: "rgba(139,92,246,0.15)", color: "var(--purple)" },
  cyan: { bg: "rgba(6,182,212,0.15)", color: "var(--cyan)" },
  green: { bg: "rgba(16,185,129,0.15)", color: "var(--green)" },
  accent: { bg: "rgba(59,130,246,0.15)", color: "var(--accent2)" },
};

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "var(--surface)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: "1.4rem" }}>🏗️</span>
          <span style={{ fontWeight: 800, fontSize: "1.05rem" }}>AI项目管理助手</span>
          <span className="tag tag-blue">V5.0.10</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: "0.8rem", color: "var(--text2)", alignItems: "center" }}>
          <span>作者：柴春宇</span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span>飞书底座 + Vercel AI增强</span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span>DeepSeek + MiniMax</span>
        </div>
      </header>

      {/* Hero */}
      <section style={{
        padding: "48px 32px 36px",
        textAlign: "center",
        borderBottom: "1px solid var(--border)",
      }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 12, letterSpacing: "-0.02em" }}>
          {(() => {
            const h = new Date().getHours();
            if (h < 12) return '☀️ 早上好，开启高效的一天';
            if (h < 18) return '🌤️ 下午好，保持专注';
            return '🌙 晚上好，整理一天收获';
          })()}
          <br />让AI成为项目管理的<span style={{ color: "var(--accent2)" }}>超级助手</span>
        </h1>
        <p style={{ color: "var(--text2)", fontSize: "0.92rem", maxWidth: 520, margin: "0 auto 24px", lineHeight: 1.7 }}>
          融合PMBOK与PRINCE2方法论，覆盖项目全生命周期5大阶段 + 12大核心模块。
          飞书负责数据，AI负责智能。
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <span className="tag tag-blue">PMBOK 7th</span>
          <span className="tag tag-purple">PRINCE2 2017</span>
          <span className="tag tag-green">EVM挣值管理</span>
          <span className="tag tag-amber">LTC全流程</span>
        </div>
      </section>

      {/* Phase Sections */}
      <main style={{ flex: 1, padding: "32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 32 }}>
          {PHASE_MODULES.map((section) => (
            <div key={section.phase}>
              {/* Phase Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: "1.3rem" }}>{section.emoji}</span>
                <h2 style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>{section.phase}</h2>
                <span className="tag" style={{
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text2)",
                  fontSize: "0.7rem",
                }}>{section.tag}</span>
              </div>

              {/* Module Cards Grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 14,
              }}>
                {section.modules.map((mod) => {
                  const colors = COLOR_MAP[mod.color] || COLOR_MAP.blue;
                  return (
                    <Link
                      key={mod.href}
                      href={mod.href}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px 18px",
                        textDecoration: "none",
                        color: "inherit",
                        transition: "all 0.2s ease",
                        display: "flex",
                        flexDirection: "column",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <span style={{ fontSize: "1.5rem" }}>{mod.icon}</span>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>{mod.title}</span>
                      </div>
                      <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.5, flex: 1 }}>
                        {mod.desc}
                      </p>
                      <div style={{
                        marginTop: 12,
                        paddingTop: 10,
                        borderTop: "1px solid var(--border)",
                        color: colors.color,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                      }}>
                        立即使用 →
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Architecture Summary */}
        <div style={{
          maxWidth: 1200,
          margin: "40px auto 0",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "24px 28px",
        }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            架构理念
          </div>
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--feishu)", fontSize: "1.1rem" }}>📊</span>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>飞书底座</span>
                <span className="tag tag-green" style={{ fontSize: "0.65rem" }}>零代码</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text2)", lineHeight: 1.6 }}>
                多维表格 · 知识库 · 仪表盘 · 自动化规则
              </p>
            </div>
            <div style={{ fontSize: "1.2rem", color: "var(--border)", display: "flex", alignItems: "center" }}>→</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--accent)", fontSize: "1.1rem" }}>🤖</span>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>Vercel AI层</span>
                <span className="tag tag-blue" style={{ fontSize: "0.65rem" }}>自建</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text2)", lineHeight: 1.6 }}>
                WBS · CPM · EVM · 风险 · 报告生成
              </p>
            </div>
            <div style={{ fontSize: "1.2rem", color: "var(--border)", display: "flex", alignItems: "center" }}>→</div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ color: "var(--cyan)", fontSize: "1.1rem" }}>🧠</span>
                <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>模型路由</span>
                <span className="tag tag-purple" style={{ fontSize: "0.65rem" }}>双备选</span>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text2)", lineHeight: 1.6 }}>
                DeepSeek（推理）+ MiniMax（文本）
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "14px 32px",
        textAlign: "center",
        color: "var(--text2)",
        fontSize: "0.75rem",
        background: "var(--surface)",
      }}>
        AI项目管理助手 V2.0 · 基于 PMBOK 7th 与 PRINCE2 2017 · 飞书底座 + Vercel AI增强层混合架构
      </footer>
    </div>
  );
}
