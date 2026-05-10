"use client";

import { useState } from "react";
import {
  testDefects,
  testAcceptanceCriteria,
  qualityTrends,
  severityConfig,
  defectStatusConfig,
  generateChecklist,
  calculateDefectMetrics,
  evaluateAcceptance,
  type Defect,
  type ChecklistItem,
  type AcceptanceCriteria,
  type Severity,
} from "@/lib/quality";

const PROJECT_TYPES = [
  { value: "it", label: "信息化系统集成" },
  { value: "content", label: "课程内容开发" },
  { value: "engineering", label: "工程基建施工" },
  { value: "ops", label: "运营服务交付" },
];

const QUALITY_PHASES = [
  { value: "启动", label: "启动" },
  { value: "规划", label: "规划" },
  { value: "执行", label: "执行" },
  { value: "监控", label: "监控" },
  { value: "收尾", label: "收尾" },
];

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "cosmetic"];

export default function QualityPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "checklist" | "defect" | "acceptance">("dashboard");
  const [projectType, setProjectType] = useState("it");
  const [phase, setPhase] = useState("启动");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [aiResult, setAiResult] = useState<{ issues: string[]; suggestions: string[]; riskLevel: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [criteria] = useState<AcceptanceCriteria[]>(testAcceptanceCriteria);
  const [defects] = useState<Defect[]>(testDefects);
  const [checklistFilter, setChecklistFilter] = useState<"all" | "pending" | "completed">("all");

  const metrics = calculateDefectMetrics(defects);
  const acceptance = evaluateAcceptance(criteria);

  const handleGenerateChecklist = () => {
    setChecklist(generateChecklist(projectType, phase));
  };

  const handleToggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const handleAiCheck = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch("/api/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectType, phase }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAiResult(data);
    } catch (e) {
      setAiResult({
        issues: [`检查失败: ${e instanceof Error ? e.message : String(e)}`],
        suggestions: [],
        riskLevel: "medium",
      });
    } finally {
      setAiLoading(false);
    }
  };

  const maxTrendDefects = Math.max(...qualityTrends.map(t => t.defects));

  const filteredChecklist = checklist.filter(item => {
    if (checklistFilter === "pending") return !item.checked;
    if (checklistFilter === "completed") return item.checked;
    return true;
  });

  const checklistProgress = checklist.length > 0
    ? Math.round((checklist.filter(i => i.required && i.checked).length / checklist.filter(i => i.required).length) * 100)
    : 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
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
        <span style={{ fontWeight: 700 }}>Quality Management</span>
        <span className="tag" style={{ background: "rgba(16,185,129,0.15)", color: "var(--green)", fontSize: "0.7rem" }}>质量管理</span>
      </header>

      <main style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "1px solid var(--border)" }}>
          {[
            { key: "dashboard", label: "📊 质量概览" },
            { key: "checklist", label: "📋 检查清单" },
            { key: "defect", label: "🐛 缺陷追踪" },
            { key: "acceptance", label: "✅ 验收标准" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: "12px 24px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--green)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--green)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: "0.88rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ===== DASHBOARD TAB ===== */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--green)" }}>{metrics.total}</div>
                <div className="stat-label">缺陷总数</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--green)" }}>{metrics.resolved}</div>
                <div className="stat-label">已解决</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--amber)" }}>{metrics.open}</div>
                <div className="stat-label">待处理</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--red)" }}>{metrics.critical}</div>
                <div className="stat-label">严重缺陷</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--accent2)" }}>{metrics.testCoverage}%</div>
                <div className="stat-label">测试覆盖率</div>
              </div>
            </div>

            {/* Secondary Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>缺陷漏检率</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--green)" }}>{metrics.leakageRate}%</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>目标 &lt; 5%</span>
                </div>
                <div style={{ marginTop: 10, height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${metrics.leakageRate}%`, background: "var(--green)", borderRadius: 3, maxWidth: "100%" }} />
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>一次验收通过率</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--green)" }}>{metrics.firstPassRate}%</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>目标 ≥ 85%</span>
                </div>
                <div style={{ marginTop: 10, height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${metrics.firstPassRate}%`, background: metrics.firstPassRate >= 85 ? "var(--green)" : "var(--amber)", borderRadius: 3, maxWidth: "100%" }} />
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>验收标准达成</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: "2rem", fontWeight: 800, color: "var(--green)" }}>{acceptance.passRate}%</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text2)" }}>{acceptance.passed}/{acceptance.total} 项</span>
                </div>
                <div style={{ marginTop: 10, height: 6, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${acceptance.passRate}%`, background: acceptance.passRate >= 75 ? "var(--green)" : "var(--amber)", borderRadius: 3, maxWidth: "100%" }} />
                </div>
              </div>
            </div>

            {/* Quality Trends Chart */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
              <div className="section-title" style={{ marginBottom: 20 }}>
                <span>📈 缺陷趋势</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120 }}>
                {qualityTrends.map((item, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: "100%",
                      height: `${(item.defects / maxTrendDefects) * 100}px`,
                      background: item.defects > 5 ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.5)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s ease",
                    }} />
                    <span style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{item.period}</span>
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text)" }}>{item.defects}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Severity Summary */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
              <div className="section-title" style={{ marginBottom: 16 }}>
                <span>🏷️ 缺陷等级分布</span>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                {SEVERITY_ORDER.map(sev => {
                  const cfg = severityConfig[sev];
                  const count = sev === "critical" ? metrics.critical
                    : sev === "major" ? metrics.major
                    : sev === "minor" ? metrics.minor
                    : metrics.cosmetic;
                  return (
                    <div key={sev} style={{
                      flex: 1,
                      background: cfg.bg,
                      border: `1px solid ${cfg.text}30`,
                      borderRadius: 10,
                      padding: "16px",
                      textAlign: "center",
                    }}>
                      <div style={{ fontSize: "1.8rem", fontWeight: 800, color: cfg.text }}>{count}</div>
                      <div style={{ fontSize: "0.75rem", color: cfg.text, marginTop: 4 }}>{cfg.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===== CHECKLIST TAB ===== */}
        {activeTab === "checklist" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Generator Controls */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
              <div className="section-title" style={{ marginBottom: 16 }}>
                <span>🤖 AI 质量检查</span>
                <span className="tag" style={{ background: "rgba(16,185,129,0.15)", color: "var(--green)", fontSize: "0.7rem" }}>AI Assistant</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 16, alignItems: "flex-end" }}>
                <div>
                  <label className="label">项目类型</label>
                  <select className="input" value={projectType} onChange={e => setProjectType(e.target.value)}>
                    {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">项目阶段</label>
                  <select className="input" value={phase} onChange={e => setPhase(e.target.value)}>
                    {QUALITY_PHASES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">操作</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={handleGenerateChecklist} style={{ background: "var(--green)", flex: 1 }}>
                      📋 生成清单
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleAiCheck}
                      disabled={aiLoading}
                      style={{ opacity: aiLoading ? 0.6 : 1, flex: 1 }}
                    >
                      {aiLoading ? "🤖 分析中..." : "✨ AI检查"}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", textAlign: "center", lineHeight: 1.5 }}>
                  MiniMax<br />AI驱动
                </div>
              </div>
            </div>

            {/* AI Result */}
            {aiResult && (
              <div style={{
                background: "var(--surface)",
                border: `1px solid ${aiResult.riskLevel === "high" ? "var(--red)" : aiResult.riskLevel === "medium" ? "var(--amber)" : "var(--green)"}40`,
                borderRadius: 12,
                padding: 24,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div className="section-title">
                    <span>🔍 AI 质量评审结果</span>
                  </div>
                  <span className="tag" style={{
                    background: aiResult.riskLevel === "high" ? "rgba(239,68,68,0.15)" : aiResult.riskLevel === "medium" ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)",
                    color: aiResult.riskLevel === "high" ? "var(--red)" : aiResult.riskLevel === "medium" ? "var(--amber)" : "var(--green)",
                  }}>
                    风险等级: {aiResult.riskLevel === "high" ? "高" : aiResult.riskLevel === "medium" ? "中" : "低"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--red)", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>🔴 发现的问题</div>
                    {aiResult.issues.length > 0 ? (
                      <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                        {aiResult.issues.map((issue, i) => (
                          <li key={i} style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.6 }}>{issue}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>未发现问题</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "var(--green)", fontWeight: 700, marginBottom: 10, textTransform: "uppercase" }}>🟢 改进建议</div>
                    {aiResult.suggestions.length > 0 ? (
                      <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                        {aiResult.suggestions.map((s, i) => (
                          <li key={i} style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.6 }}>{s}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>暂无建议</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Checklist */}
            {checklist.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    {([["all","全部"], ["pending","待检查"], ["completed","已完成"]] as const).map(([k, l]) => (
                      <button
                        key={k}
                        onClick={() => setChecklistFilter(k)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: 20,
                          border: `1px solid ${checklistFilter === k ? "var(--green)" : "var(--border)"}`,
                          background: checklistFilter === k ? "rgba(16,185,129,0.1)" : "transparent",
                          color: checklistFilter === k ? "var(--green)" : "var(--text2)",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                        }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
                    必检项完成进度: <strong style={{ color: "var(--green)" }}>{checklistProgress}%</strong>
                    <span style={{ color: "var(--text2)" }}> ({checklist.filter(i => i.required && i.checked).length}/{checklist.filter(i => i.required).length})</span>
                  </div>
                </div>

                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {filteredChecklist.map(item => (
                      <div key={item.id} style={{
                        background: item.checked ? "rgba(16,185,129,0.08)" : "var(--surface2)",
                        border: `1px solid ${item.checked ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                        borderRadius: 10,
                        padding: "14px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        opacity: item.checked ? 0.8 : 1,
                      }}>
                        <button
                          onClick={() => handleToggleCheck(item.id)}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            border: `2px solid ${item.checked ? "var(--green)" : "var(--border)"}`,
                            background: item.checked ? "var(--green)" : "transparent",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {item.checked && <span style={{ color: "white", fontSize: "0.8rem" }}>✓</span>}
                        </button>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: "0.9rem", color: item.checked ? "var(--text2)" : "var(--text)", textDecoration: item.checked ? "line-through" : "none" }}>
                            {item.text}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.7rem", color: "var(--text2)", padding: "2px 8px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)" }}>
                          {item.category}
                        </span>
                        {item.required && (
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--red)", padding: "2px 6px", borderRadius: 4, background: "rgba(239,68,68,0.1)" }}>
                            必检
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {checklist.length === 0 && !aiResult && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text2)" }}>
                <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
                <div style={{ fontSize: "1rem", fontWeight: 600, marginBottom: 8 }}>暂无检查清单</div>
                <div style={{ fontSize: "0.85rem" }}>选择项目类型和阶段，点击&quot;生成清单&quot;开始质量检查</div>
              </div>
            )}
          </div>
        )}

        {/* ===== DEFECT TAB ===== */}
        {activeTab === "defect" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Defect Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              {([
                ["total", "全部", "var(--text)"],
                ["open", "待处理", "var(--red)"],
                ["inProgress", "处理中", "var(--amber)"],
                ["resolved", "已解决", "var(--green)"],
                ["closed", "已关闭", "var(--text2)"],
                ["rejected", "已驳回", "var(--purple)"],
              ] as const).map(([k, l, c]) => {
                const key = k as keyof typeof metrics;
                return (
                  <div key={k} className="stat-card" style={{ cursor: "default" }}>
                    <div className="stat-num" style={{ color: c }}>{metrics[key]}</div>
                    <div className="stat-label">{l}</div>
                  </div>
                );
              })}
            </div>

            {/* Defect Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <div className="section-title" style={{ margin: 0 }}>
                  <span>🐛 缺陷追踪表</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      {["ID", "描述", "严重程度", "状态", "负责人", "创建日期", "解决日期"].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text2)", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {defects.map((d, i) => {
                      const sevCfg = severityConfig[d.severity];
                      const stCfg = defectStatusConfig[d.status];
                      return (
                        <tr key={d.id} style={{ borderBottom: i < defects.length - 1 ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
                          <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text2)", whiteSpace: "nowrap" }}>{d.id}</td>
                          <td style={{ padding: "12px 16px", color: "var(--text)", maxWidth: 260 }}>{d.description}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700, background: sevCfg.bg, color: sevCfg.text }}>
                              {sevCfg.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700, background: stCfg.bg, color: stCfg.text }}>
                              {stCfg.label}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "var(--text2)", whiteSpace: "nowrap" }}>{d.assignee}</td>
                          <td style={{ padding: "12px 16px", color: "var(--text2)", whiteSpace: "nowrap" }}>{d.createdAt}</td>
                          <td style={{ padding: "12px 16px", color: d.resolvedAt ? "var(--green)" : "var(--text2)", whiteSpace: "nowrap" }}>{d.resolvedAt || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ===== ACCEPTANCE TAB ===== */}
        {activeTab === "acceptance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Acceptance Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>验收通过率</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: "3rem", fontWeight: 800, color: acceptance.passRate >= 75 ? "var(--green)" : "var(--amber)" }}>{acceptance.passRate}%</span>
                  <span style={{ fontSize: "1rem", color: "var(--text2)" }}>{acceptance.passed} / {acceptance.total} 项</span>
                </div>
                <div style={{ height: 8, background: "var(--surface2)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${acceptance.passRate}%`, background: acceptance.passRate >= 75 ? "var(--green)" : "var(--amber)", transition: "width 0.5s ease" }} />
                </div>
              </div>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 16 }}>验收结果分布</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ flex: 1, background: "rgba(16,185,129,0.15)", borderRadius: 8, padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--green)" }}>{acceptance.passed}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>通过</div>
                  </div>
                  <div style={{ flex: 1, background: "rgba(239,68,68,0.15)", borderRadius: 8, padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--red)" }}>{acceptance.total - acceptance.passed}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>未通过</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Acceptance Criteria Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <div className="section-title" style={{ margin: 0 }}>
                  <span>✅ 验收标准追踪</span>
                  <span className="tag" style={{ background: "rgba(16,185,129,0.15)", color: "var(--green)", fontSize: "0.7rem" }}>Criteria Tracker</span>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      {["ID", "验收标准", "目标值", "实际值", "结果"].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "var(--text2)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {criteria.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: i < criteria.length - 1 ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
                        <td style={{ padding: "12px 16px", fontFamily: "monospace", color: "var(--text2)" }}>{c.id}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text)", maxWidth: 300 }}>{c.description}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text2)", whiteSpace: "nowrap" }}>{c.target}</td>
                        <td style={{ padding: "12px 16px", color: c.passed ? "var(--green)" : "var(--red)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.actual || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "3px 10px",
                            borderRadius: 12,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            background: c.passed ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                            color: c.passed ? "var(--green)" : "var(--red)",
                          }}>
                            {c.passed ? "通过" : "未通过"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
