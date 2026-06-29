"use client";

import { useState } from "react";
import {
  ClosingChecklist,
  SignOff,
  LessonLearned,
  ProjectClosing,
  calculateClosingProgress,
  getPendingSignoffs,
  searchLessons,
  getCategoryName,
  calculateOverallProgress,
} from "@/lib/closing";

// Test data - 智慧城市一期项目
const TEST_CLOSING: ProjectClosing = {
  projectId: "P-2025-001",
  projectName: "智慧城市一期项目",
  status: "in-progress",
  checklists: [
    // 验收确认 (4/5 completed)
    { id: "a1", category: "acceptance", item: "终验报告已生成", owner: "张伟", dueDate: "2025-05-15", completed: true },
    { id: "a2", category: "acceptance", item: "功能演示与确认记录", owner: "李娜", dueDate: "2025-05-10", completed: true },
    { id: "a3", category: "acceptance", item: "初验问题已全部解决", owner: "王强", dueDate: "2025-05-08", completed: true },
    { id: "a4", category: "acceptance", item: "客户签字确认函已获取", owner: "张伟", dueDate: "2025-05-20", completed: true },
    { id: "a5", category: "acceptance", item: "运维培训已完成", owner: "赵敏", dueDate: "2025-05-18", completed: false },
    // 文档归档 (3/5 completed)
    { id: "d1", category: "documentation", item: "项目计划文档归档", owner: "李娜", dueDate: "2025-05-12", completed: true },
    { id: "d2", category: "documentation", item: "需求变更记录归档", owner: "李娜", dueDate: "2025-05-12", completed: true },
    { id: "d3", category: "documentation", item: "测试报告归档", owner: "王强", dueDate: "2025-05-14", completed: true },
    { id: "d4", category: "documentation", item: "最终交付物清单", owner: "张伟", dueDate: "2025-05-20", completed: false },
    { id: "d5", category: "documentation", item: "配置项基线已建立", owner: "王强", dueDate: "2025-05-22", completed: false },
    // 经验总结 (2/4 completed)
    { id: "l1", category: "lessons", item: "最佳实践已提炼总结", owner: "赵敏", dueDate: "2025-05-18", completed: true },
    { id: "l2", category: "lessons", item: "流程改进建议已记录", owner: "张伟", dueDate: "2025-05-18", completed: true },
    { id: "l3", category: "lessons", item: "知识库已更新", owner: "赵敏", dueDate: "2025-05-25", completed: false },
    { id: "l4", category: "lessons", item: "AI 经验总结已生成", owner: "AI", dueDate: "2025-05-25", completed: false },
    // 财务结算 (1/2 completed)
    { id: "f1", category: "finance", item: "最终付款已确认到账", owner: "财务部", dueDate: "2025-05-20", completed: true },
    { id: "f2", category: "finance", item: "项目成本核算已完成", owner: "财务部", dueDate: "2025-05-22", completed: false },
    // 合同关闭 (0/3 completed)
    { id: "c1", category: "contract", item: "最终付款 milestone 确认", owner: "法务部", dueDate: "2025-05-25", completed: false },
    { id: "c2", category: "contract", item: "质保金条款已妥善安排", owner: "法务部", dueDate: "2025-05-28", completed: false },
    { id: "c3", category: "contract", item: "支持协议已签署", owner: "运维部", dueDate: "2025-05-30", completed: false },
  ],
  signOffs: [
    { role: "customer", name: "某市大数据局", signed: false },
    { role: "pm", name: "张伟", signed: true, signedAt: "2025-05-08" },
    { role: "finance", name: "财务部李经理", signed: false },
    { role: "legal", name: "法务部王律师", signed: false },
  ],
};

const MOCK_ARCHIVED_PROJECTS = [
  { id: "P-2024-015", name: "智慧教育平台一期", status: "已归档", closedDate: "2024-12-15" },
  { id: "P-2024-022", name: "高校数据中台项目", status: "已归档", closedDate: "2024-11-20" },
  { id: "P-2024-031", name: "职业教育基地建设", status: "已归档", closedDate: "2024-10-30" },
  { id: "P-2024-038", name: "智能化校园改造", status: "已归档", closedDate: "2024-09-15" },
];

export default function ClosingPage() {
  const [projectData] = useState<ProjectClosing>(TEST_CLOSING);
  const [checklists, setChecklists] = useState<ClosingChecklist[]>(TEST_CLOSING.checklists);
  const [signOffs, setSignOffs] = useState<SignOff[]>(TEST_CLOSING.signOffs);
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [lessonsSearch, setLessonsSearch] = useState("");
  const [aiReviewResult, setAiReviewResult] = useState<any>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [showFinalReport, setShowFinalReport] = useState(false);

  const toggleChecklist = (id: string) => {
    setChecklists(prev =>
      prev.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const getChecklistsByCategory = (cat: ClosingChecklist["category"]) =>
    checklists.filter(c => c.category === cat);

  const getProgress = (cat: ClosingChecklist["category"]) => {
    const items = getChecklistsByCategory(cat);
    return calculateClosingProgress(items);
  };

  const pendingSignoffs = signOffs.filter(s => !s.signed);
  const overallProgress = calculateOverallProgress(checklists);

  const handleAIReview = async () => {
    setAiReviewLoading(true);
    try {
      const response = await fetch("/api/closing/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectData.projectId,
          checklists: checklists.map(c => ({
            id: c.id,
            category: c.category,
            item: c.item,
            completed: c.completed,
          })),
          signOffs: signOffs.map(s => ({
            role: s.role,
            name: s.name,
            signed: s.signed,
          })),
        }),
      });
      const result = await response.json();
      setAiReviewResult(result);
    } catch (error) {
      console.error("AI review failed:", error);
    } finally {
      setAiReviewLoading(false);
    }
  };

  const searchedLessons = lessonsSearch.trim()
    ? searchLessons([projectData], lessonsSearch)
    : [];

  const categories: ClosingChecklist["category"][] = [
    "acceptance",
    "documentation",
    "lessons",
    "finance",
    "contract",
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "var(--surface)",
        }}
      >
        <a href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>
          ← 返回首页
        </a>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontSize: "1.2rem" }}>🎯</span>
        <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>项目收尾阶段</span>
        <span className="tag" style={{ background: "rgba(16,185,129,0.15)", color: "var(--green)" }}>
          项目收尾阶段
        </span>
      </header>

      {/* Section Navigation */}
      <nav
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "0 32px",
          display: "flex",
          gap: 0,
          background: "var(--surface)",
          overflowX: "auto",
        }}
      >
        {[
          { id: "overview", label: "📊 收尾概览", color: "var(--green)" },
          { id: "checklists", label: "✅ 收尾清单", color: "var(--green)", progress: overallProgress },
          { id: "signoff", label: "✍️ 签字审批", color: "var(--green)" },
          { id: "lessons", label: "📚 经验教训", color: "var(--green)" },
          { id: "archive", label: "📦 项目归档", color: "var(--green)" },
        ].map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            style={{
              padding: "12px 20px",
              background: "none",
              border: "none",
              borderBottom: activeSection === sec.id ? "2px solid " + sec.color : "2px solid transparent",
              color: activeSection === sec.id ? sec.color : "var(--text2)",
              fontWeight: activeSection === sec.id ? 700 : 400,
              fontSize: "0.82rem",
              cursor: "pointer",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {sec.label}
            {sec.progress !== undefined && (
              <span
                style={{
                  fontSize: "0.7rem",
                  padding: "2px 6px",
                  borderRadius: 10,
                  background: `${sec.color}20`,
                  color: sec.color,
                }}
              >
                {sec.progress}%
              </span>
            )}
          </button>
        ))}
      </nav>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {/* ===== OVERVIEW ===== */}
        {activeSection === "overview" && (
          <div>
            {/* Project Info Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(59,130,246,0.1) 100%)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "28px 32px",
                marginBottom: 28,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                <span style={{ fontSize: "2rem" }}>🏙️</span>
                <div>
                  <h2 style={{ fontWeight: 800, fontSize: "1.3rem", marginBottom: 4 }}>
                    {projectData.projectName}
                  </h2>
                  <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
                    项目ID: {projectData.projectId} · 收尾阶段
                  </p>
                </div>
                <span
                  className="tag"
                  style={{ marginLeft: "auto", background: "rgba(16,185,129,0.15)", color: "var(--green)" }}
                >
                  收尾中
                </span>
              </div>

              {/* Overall Progress */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>收尾整体进度</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--green)" }}>
                    {overallProgress}%
                  </span>
                </div>
                <div
                  style={{
                    height: 10,
                    background: "var(--border)",
                    borderRadius: 5,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${overallProgress}%`,
                      background: "var(--green)",
                      borderRadius: 5,
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
                {categories.map((cat) => {
                  const items = getChecklistsByCategory(cat);
                  const completed = items.filter((i) => i.completed).length;
                  return (
                    <div
                      key={cat}
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: "16px",
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontSize: "1.8rem", marginBottom: 8 }}>
                        {cat === "acceptance"
                          ? "✅"
                          : cat === "documentation"
                          ? "📁"
                          : cat === "lessons"
                          ? "📚"
                          : cat === "finance"
                          ? "💰"
                          : "📑"}
                      </div>
                      <div
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 800,
                          color: "var(--green)",
                        }}
                      >
                        {completed}/{items.length}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: 4 }}>
                        {getCategoryName(cat)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Sign-offs Alert */}
            {pendingSignoffs.length > 0 && (
              <div
                style={{
                  background: "rgba(245,158,11,0.1)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  borderRadius: "var(--radius)",
                  padding: "20px 24px",
                  marginBottom: 24,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span style={{ fontSize: "1.5rem" }}>⚠️</span>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>待签字提醒</div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
                    以下签字尚未完成:{" "}
                    {pendingSignoffs.map((s) => `${s.role}(${s.name})`).join("、")}
                  </div>
                </div>
                <button
                  onClick={() => setActiveSection("signoff")}
                  style={{
                    marginLeft: "auto",
                    padding: "8px 16px",
                    background: "var(--amber)",
                    border: "none",
                    borderRadius: 8,
                    color: "#000",
                    fontSize: "0.82rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  去签字
                </button>
              </div>
            )}

            {/* Quick Actions */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "20px 24px",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--text2)", fontWeight: 600 }}>快速操作：</span>
              <button
                onClick={handleAIReview}
                disabled={aiReviewLoading}
                style={{
                  padding: "10px 20px",
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid var(--green)",
                  borderRadius: 8,
                  color: "var(--green)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: aiReviewLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                🤖 AI 收尾审查
              </button>
              <button
                onClick={() => setShowFinalReport(true)}
                style={{
                  padding: "10px 20px",
                  background: "rgba(16,185,129,0.15)",
                  border: "1px solid var(--green)",
                  borderRadius: 8,
                  color: "var(--green)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                📝 生成最终报告
              </button>
            </div>

            {/* AI Review Result */}
            {aiReviewResult && (
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--green)",
                  borderRadius: "var(--radius)",
                  padding: "24px",
                  marginTop: 24,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ fontSize: "1.2rem" }}>🤖</span>
                  <h3 style={{ fontWeight: 700 }}>AI 收尾审查结果</h3>
                  <span
                    className="tag"
                    style={{
                      marginLeft: "auto",
                      background: aiReviewResult.approved
                        ? "rgba(16,185,129,0.15)"
                        : "rgba(245,158,11,0.15)",
                      color: aiReviewResult.approved ? "var(--green)" : "var(--amber)",
                    }}
                  >
                    {aiReviewResult.approved ? "通过" : "待完善"}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text2)",
                        marginBottom: 8,
                      }}
                    >
                      缺失项
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {aiReviewResult.missingItems?.length > 0 ? (
                        aiReviewResult.missingItems.map((item: string, i: number) => (
                          <div
                            key={i}
                            style={{
                              padding: "8px 12px",
                              background: "rgba(245,158,11,0.1)",
                              borderRadius: 6,
                              fontSize: "0.82rem",
                            }}
                          >
                            ⚠️ {item}
                          </div>
                        ))
                      ) : (
                        <div
                          style={{
                            padding: "8px 12px",
                            background: "rgba(16,185,129,0.1)",
                            borderRadius: 6,
                            fontSize: "0.82rem",
                            color: "var(--green)",
                          }}
                        >
                          ✓ 所有检查项已完成
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text2)",
                        marginBottom: 8,
                      }}
                    >
                      改进建议
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {aiReviewResult.suggestions?.map((s: string, i: number) => (
                        <div
                          key={i}
                          style={{
                            padding: "8px 12px",
                            background: "var(--surface2)",
                            borderRadius: 6,
                            fontSize: "0.82rem",
                          }}
                        >
                          💡 {s}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {aiReviewResult.finalReport && (
                  <div style={{ marginTop: 16, padding: "16px", background: "var(--surface2)", borderRadius: 8 }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text2)",
                        marginBottom: 8,
                      }}
                    >
                      最终报告摘要
                    </div>
                    <p style={{ fontSize: "0.88rem", lineHeight: 1.6 }}>{aiReviewResult.finalReport}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== CHECKLISTS ===== */}
        {activeSection === "checklists" && (
          <div>
            {categories.map((cat) => {
              const items = getChecklistsByCategory(cat);
              const progress = getProgress(cat);
              return (
                <div
                  key={cat}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "24px",
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <span style={{ fontSize: "1.3rem" }}>
                      {cat === "acceptance"
                        ? "✅"
                        : cat === "documentation"
                        ? "📁"
                        : cat === "lessons"
                        ? "📚"
                        : cat === "finance"
                        ? "💰"
                        : "📑"}
                    </span>
                    <div>
                      <h3 style={{ fontWeight: 700, fontSize: "1rem" }}>{getCategoryName(cat)}</h3>
                      <p style={{ color: "var(--text2)", fontSize: "0.78rem" }}>
                        {items.filter((i) => i.completed).length}/{items.length} 项完成
                      </p>
                    </div>
                    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 120,
                          height: 6,
                          background: "var(--border)",
                          borderRadius: 3,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${progress}%`,
                            background: "var(--green)",
                            borderRadius: 3,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          color: "var(--green)",
                          minWidth: 40,
                        }}
                      >
                        {progress}%
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => toggleChecklist(item.id)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "32px 1fr 100px 100px 80px",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 16px",
                          background: item.completed
                            ? "rgba(16,185,129,0.08)"
                            : "var(--surface2)",
                          border: `1px solid ${item.completed ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                          borderRadius: 8,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `2px solid ${item.completed ? "var(--green)" : "var(--border)"}`,
                            background: item.completed ? "var(--green)" : "transparent",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {item.completed && (
                            <span style={{ color: "#fff", fontSize: "0.8rem" }}>✓</span>
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: "0.88rem",
                              color: item.completed ? "var(--text)" : "var(--text2)",
                            }}
                          >
                            {item.item}
                          </div>
                          {item.evidence && (
                            <div
                              style={{
                                fontSize: "0.72rem",
                                color: "var(--green)",
                                marginTop: 2,
                              }}
                            >
                              📎 {item.evidence}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text2)",
                            textAlign: "center",
                          }}
                        >
                          {item.owner}
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text2)",
                            textAlign: "center",
                          }}
                        >
                          {item.dueDate}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <span
                            className="tag"
                            style={{
                              fontSize: "0.68rem",
                              background: item.completed
                                ? "rgba(16,185,129,0.15)"
                                : "rgba(245,158,11,0.15)",
                              color: item.completed ? "var(--green)" : "var(--amber)",
                            }}
                          >
                            {item.completed ? "已完成" : "待处理"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== SIGN-OFF ===== */}
        {activeSection === "signoff" && (
          <div>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>✍️</span>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: "1.1rem" }}>签字审批</h3>
                  <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
                    {signOffs.filter((s) => s.signed).length}/{signOffs.length} 项已完成签字
                  </p>
                </div>
                <div
                  style={{
                    width: 120,
                    height: 6,
                    background: "var(--border)",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginLeft: "auto",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(signOffs.filter((s) => s.signed).length / signOffs.length) * 100}%`,
                      background: "var(--green)",
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {signOffs.map((so) => (
                  <div
                    key={so.role}
                    style={{
                      padding: "20px",
                      background: so.signed ? "rgba(16,185,129,0.08)" : "var(--surface2)",
                      border: `1px solid ${so.signed ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: "50%",
                        background: so.signed ? "var(--green)" : "var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        color: so.signed ? "#fff" : "var(--text2)",
                      }}
                    >
                      {so.name[0]}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{so.name}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text2)" }}>
                        {so.role === "customer"
                          ? "客户"
                          : so.role === "pm"
                          ? "项目经理"
                          : so.role === "finance"
                          ? "财务"
                          : "法务"}
                      </div>
                      {so.signedAt && (
                        <div style={{ fontSize: "0.72rem", color: "var(--green)", marginTop: 4 }}>
                          ✓ 已签字于 {so.signedAt}
                        </div>
                      )}
                      {so.comments && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text2)",
                            marginTop: 4,
                            fontStyle: "italic",
                          }}
                        >
                          "{so.comments}"
                        </div>
                      )}
                    </div>
                    <span
                      className="tag"
                      style={{
                        background: so.signed
                          ? "rgba(16,185,129,0.15)"
                          : "rgba(245,158,11,0.15)",
                        color: so.signed ? "var(--green)" : "var(--amber)",
                      }}
                    >
                      {so.signed ? "已签字" : "待签字"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Contract Close Checklist */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>📑</span>
                <h3 style={{ fontWeight: 700 }}>合同关闭清单</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  {
                    item: "最终付款 milestone 确认",
                    status: getChecklistsByCategory("contract").find((c) => c.item.includes("最终付款"))?.completed ?? false,
                  },
                  {
                    item: "质保金条款已妥善安排",
                    status: getChecklistsByCategory("contract").find((c) => c.item.includes("质保金"))?.completed ?? false,
                  },
                  {
                    item: "支持协议已签署",
                    status: getChecklistsByCategory("contract").find((c) => c.item.includes("支持协议"))?.completed ?? false,
                  },
                ].map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 16px",
                      background: c.status ? "rgba(16,185,129,0.08)" : "var(--surface2)",
                      border: `1px solid ${c.status ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: `2px solid ${c.status ? "var(--green)" : "var(--border)"}`,
                        background: c.status ? "var(--green)" : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {c.status && <span style={{ color: "#fff", fontSize: "0.8rem" }}>✓</span>}
                    </div>
                    <span style={{ fontSize: "0.88rem", flex: 1 }}>{c.item}</span>
                    <span
                      className="tag"
                      style={{
                        background: c.status
                          ? "rgba(16,185,129,0.15)"
                          : "rgba(245,158,11,0.15)",
                        color: c.status ? "var(--green)" : "var(--amber)",
                      }}
                    >
                      {c.status ? "已完成" : "待处理"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== LESSONS LEARNED ===== */}
        {activeSection === "lessons" && (
          <div>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>📚</span>
                <div>
                  <h3 style={{ fontWeight: 700 }}>经验教训库</h3>
                  <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
                    历史项目经验，可搜索复用
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <input
                  className="input"
                  placeholder="搜索经验教训（输入关键词）..."
                  value={lessonsSearch}
                  onChange={(e) => setLessonsSearch(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn-primary"
                  onClick={() => searchLessons([projectData], lessonsSearch)}
                  style={{ background: "var(--green)", whiteSpace: "nowrap" }}
                >
                  🔍 搜索
                </button>
              </div>

              {searchedLessons.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {searchedLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      style={{
                        padding: "16px",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          className="tag tag-purple"
                          style={{ fontSize: "0.72rem" }}
                        >
                          {lesson.category}
                        </span>
                        <span
                          className="tag"
                          style={{
                            fontSize: "0.72rem",
                            background:
                              lesson.impact === "high"
                                ? "rgba(239,68,68,0.15)"
                                : lesson.impact === "medium"
                                ? "rgba(245,158,11,0.15)"
                                : "rgba(59,130,246,0.15)",
                            color:
                              lesson.impact === "high"
                                ? "var(--red)"
                                : lesson.impact === "medium"
                                ? "var(--amber)"
                                : "var(--accent)",
                          }}
                        >
                          {lesson.impact === "high" ? "高影响" : lesson.impact === "medium" ? "中影响" : "低影响"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                        📁 {lesson.projectName}
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--text2)", marginBottom: 8 }}>
                        <span style={{ color: "var(--red)" }}>问题：</span>
                        {lesson.issue}
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--green)" }}>
                        <span>✓ 解决方案：</span>
                        {lesson.resolution}
                      </div>
                    </div>
                  ))}
                </div>
              ) : lessonsSearch.trim() ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "32px",
                    color: "var(--text2)",
                    fontSize: "0.88rem",
                  }}
                >
                  未找到匹配的经验教训
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    {
                      category: "需求管理",
                      project: "某市智慧教育平台",
                      issue: "需求调研阶段用户访谈不足，导致后期需求变更频繁",
                      resolution: "建立用户访谈清单模板，增加原型确认环节",
                      impact: "high",
                    },
                    {
                      category: "测试管理",
                      project: "高校数据中台项目",
                      issue: "测试环境与生产环境存在差异，导致上线后出现兼容性问题",
                      resolution: "引入容器化测试环境，建立环境一致性检查清单",
                      impact: "high",
                    },
                    {
                      category: "沟通协作",
                      project: "智能化校园改造",
                      issue: "每日站会形式化，问题升级通道不畅通",
                      resolution: "优化站会流程，引入问题跟踪工具",
                      impact: "medium",
                    },
                  ].map((l, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "16px",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <span className="tag tag-purple" style={{ fontSize: "0.72rem" }}>
                          {l.category}
                        </span>
                        <span
                          className="tag"
                          style={{
                            fontSize: "0.72rem",
                            background:
                              l.impact === "high"
                                ? "rgba(239,68,68,0.15)"
                                : "rgba(245,158,11,0.15)",
                            color: l.impact === "high" ? "var(--red)" : "var(--amber)",
                          }}
                        >
                          {l.impact === "high" ? "高影响" : "中影响"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
                        📁 {l.project}
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--text2)", marginBottom: 8 }}>
                        <span style={{ color: "var(--red)" }}>问题：</span>
                        {l.issue}
                      </div>
                      <div style={{ fontSize: "0.82rem", color: "var(--green)" }}>
                        <span>✓ 解决方案：</span>
                        {l.resolution}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ARCHIVE ===== */}
        {activeSection === "archive" && (
          <div>
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "24px",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>📦</span>
                <div>
                  <h3 style={{ fontWeight: 700 }}>项目归档</h3>
                  <p style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
                    已完成的收尾项目归档列表
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Current project - pending archive */}
                <div
                  style={{
                    padding: "16px 20px",
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 8,
                      background: "rgba(245,158,11,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.3rem",
                    }}
                  >
                    🏙️
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {projectData.projectName}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text2)" }}>
                      ID: {projectData.projectId} · 收尾进度 {overallProgress}%
                    </div>
                  </div>
                  <span
                    className="tag"
                    style={{
                      background: "rgba(245,158,11,0.15)",
                      color: "var(--amber)",
                    }}
                  >
                    收尾中
                  </span>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "0.82rem" }}
                    disabled
                  >
                    归档
                  </button>
                </div>

                {/* Archived projects */}
                {MOCK_ARCHIVED_PROJECTS.map((proj) => (
                  <div
                    key={proj.id}
                    style={{
                      padding: "16px 20px",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        background: "rgba(16,185,129,0.15)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.3rem",
                      }}
                    >
                      📁
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{proj.name}</div>
                      <div style={{ fontSize: "0.78rem", color: "var(--text2)" }}>
                        ID: {proj.id} · 已归档于 {proj.closedDate}
                      </div>
                    </div>
                    <span
                      className="tag"
                      style={{
                        background: "rgba(16,185,129,0.15)",
                        color: "var(--green)",
                      }}
                    >
                      {proj.status}
                    </span>
                    <button className="btn-secondary" style={{ fontSize: "0.82rem" }}>
                      查看
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== FINAL REPORT MODAL ===== */}
        {showFinalReport && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: 20,
            }}
            onClick={() => setShowFinalReport(false)}
          >
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "32px",
                maxWidth: 700,
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                <span style={{ fontSize: "1.3rem" }}>📝</span>
                <h3 style={{ fontWeight: 700, fontSize: "1.2rem" }}>项目最终报告</h3>
                <button
                  onClick={() => setShowFinalReport(false)}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    color: "var(--text2)",
                    fontSize: "1.2rem",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "24px",
                  fontSize: "0.88rem",
                  lineHeight: 1.7,
                }}
              >
                <h4 style={{ fontWeight: 700, marginBottom: 12 }}>{projectData.projectName}</h4>
                <p style={{ color: "var(--text2)", marginBottom: 16 }}>
                  项目收尾进度：{overallProgress}% · 签字完成：{signOffs.filter((s) => s.signed).length}/
                  {signOffs.length}
                </p>

                <div style={{ marginBottom: 16 }}>
                  <h5 style={{ fontWeight: 600, marginBottom: 8 }}>各阶段完成情况</h5>
                  {categories.map((cat) => {
                    const items = getChecklistsByCategory(cat);
                    const completed = items.filter((i) => i.completed).length;
                    return (
                      <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ width: 80, fontSize: "0.82rem" }}>{getCategoryName(cat)}</span>
                        <div style={{ flex: 1, height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${(completed / items.length) * 100}%`,
                              background: "var(--green)",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "0.78rem", color: "var(--green)" }}>
                          {completed}/{items.length}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <h5 style={{ fontWeight: 600, marginBottom: 8 }}>待处理事项</h5>
                  {pendingSignoffs.length > 0 ? (
                    <ul style={{ paddingLeft: 20, color: "var(--amber)" }}>
                      {pendingSignoffs.map((s) => (
                        <li key={s.role} style={{ marginBottom: 4 }}>
                          {s.role} ({s.name}) 签字待完成
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: "var(--green)" }}>✓ 所有签字已完成</p>
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                <button className="btn-secondary" style={{ flex: 1 }}>
                  📋 复制报告
                </button>
                <button className="btn-primary" style={{ flex: 1, background: "var(--feishu)" }}>
                  📤 导出
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
          fontSize: "0.78rem",
          color: "var(--text2)",
        }}
      >
        <span>AI项目管理助手 · 项目收尾阶段 · 验收、移交与归档</span>
        <span style={{ color: "var(--border)" }}>|</span>
        <span>{projectData.projectName}</span>
      </footer>
    </div>
  );
}
