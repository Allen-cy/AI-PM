"use client";

import Link from "next/link";

const DIFFICULTIES = [
  {
    icon: "🎨",
    title: "AI不懂设计原则",
    subtitle: "对比、留白、对齐、重复",
    color: "#ef4444",
    desc: "AI生成的PPT往往缺乏专业设计师对视觉层次、空间节奏的把控",
  },
  {
    icon: "📝",
    title: "AI是结构化呈现",
    subtitle: "非内容生成",
    color: "#f59e0b",
    desc: "AI擅长整理和呈现内容，但无法替代人类思考和创作核心内容",
  },
  {
    icon: "🎤",
    title: "演讲者能力",
    subtitle: "是PPT的灵魂",
    color: "#22c55e",
    desc: "再好的PPT也需要演讲者注入情感、故事和临场应变",
  },
];

const BEST_PRACTICES = [
  { icon: "1️⃣", text: "先有核心观点，再让AI帮你结构化呈现" },
  { icon: "2️⃣", text: "PPT是视觉辅助，不是演讲稿的堆砌" },
  { icon: "3️⃣", text: "每页一个核心观点，不要贪多" },
  { icon: "4️⃣", text: "留白是给观众思考的空间" },
  { icon: "5️⃣", text: "用数据说话，但别让数据孤军奋战" },
  { icon: "6️⃣", text: "设计服务于内容，不要为炫技而设计" },
];

const KEY_TAKEAWAYS = [
  "AI是工具，不是主角",
  "内容为王，设计为辅",
  "演讲者的故事比PPT更重要",
  "持续迭代，不求一步完美",
];

export default function PptGuidePage() {
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
        <span style={{ fontWeight: 700 }}>📊 PPT智能制作难点分析</span>
        <span className="tag" style={{ fontSize: "0.7rem", background: "rgba(59, 130, 246, 0.1)", color: "#3b82f6" }}>方法论</span>
      </header>

      {/* Hero Section */}
      <section style={{
        padding: "48px 32px",
        textAlign: "center",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, transparent 100%)",
      }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 12 }}>
          PPT智能制作的<span style={{ color: "#3b82f6" }}>三大认知陷阱</span>
        </h1>
        <p style={{ color: "var(--text2)", fontSize: "0.95rem", maxWidth: 600, margin: "0 auto 24px" }}>
          理解AI做PPT的局限性，才能更好地利用它提升效率
        </p>
      </section>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "32px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {/* Three Difficulties */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginBottom: 48 }}>
          {DIFFICULTIES.map((item) => (
            <div
              key={item.title}
              style={{
                background: "var(--surface)",
                border: `2px solid ${item.color}30`,
                borderRadius: 16,
                padding: "28px 24px",
                textAlign: "center",
                transition: "all 0.3s",
              }}
            >
              <div style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                background: `${item.color}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
                margin: "0 auto 16px",
              }}>
                {item.icon}
              </div>
              <h3 style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: item.color,
                marginBottom: 8,
              }}>
                {item.title}
              </h3>
              <div style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--text2)",
                marginBottom: 12,
              }}>
                {item.subtitle}
              </div>
              <p style={{
                fontSize: "0.82rem",
                color: "var(--text2)",
                lineHeight: 1.6,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Best Practices */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span>✨</span>
            <span>正确使用AI做PPT的6个原则</span>
          </h2>
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "24px",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              {BEST_PRACTICES.map((item) => (
                <div
                  key={item.icon}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 16px",
                    background: "var(--bg)",
                    borderRadius: 10,
                  }}
                >
                  <span style={{ fontSize: "1.2rem", flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.5 }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key Takeaways */}
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span>💡</span>
            <span>核心认知</span>
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}>
            {KEY_TAKEAWAYS.map((takeaway, idx) => (
              <div
                key={idx}
                style={{
                  padding: "20px",
                  background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  borderRadius: 12,
                  textAlign: "center",
                }}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "rgba(59, 130, 246, 0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  color: "#3b82f6",
                  margin: "0 auto 12px",
                }}>
                  {idx + 1}
                </div>
                <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)" }}>
                  {takeaway}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Flow Diagram Reference */}
        <section>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span>🔗</span>
            <span>相关流程</span>
          </h2>
          <div style={{
            display: "flex",
            gap: 16,
            justifyContent: "center",
          }}>
            <Link
              href="/blueprint-v3/delivery-management"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 28px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: "1.4rem" }}>🗺️</span>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)" }}>项目全流程交付管理蓝图</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>查看销售、交付、监控、成本联动关系</div>
              </div>
            </Link>
            <Link
              href="/reports"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 28px",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                textDecoration: "none",
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: "1.4rem" }}>📊</span>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text)" }}>AI报告生成</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>智能生成各类报告</div>
              </div>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
