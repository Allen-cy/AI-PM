"use client";

import { useState, useEffect } from "react";
import {
  ReportType,
  ReportRequest,
  GeneratedReport,
  REPORT_TYPE_LABELS,
  TONE_LABELS,
  estimateReadingTime,
  getReportHistory,
  saveReportToHistory,
} from "@/lib/reports";

// Project list for selector
const PROJECTS = [
  "智慧城市一期项目",
  "智慧教育平台",
  "企业数字化转型",
  "智慧医疗系统",
  "智慧物流平台",
  "智慧政务系统",
];

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("weekly");
  const [projectName, setProjectName] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [completedWork, setCompletedWork] = useState("");
  const [nextPlans, setNextPlans] = useState("");
  const [issues, setIssues] = useState("");
  const [resourceNeeds, setResourceNeeds] = useState("");
  const [tone, setTone] = useState<"formal" | "concise" | "detailed">("formal");
  const [loading, setLoading] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [reportHistory, setReportHistory] = useState<GeneratedReport[]>([]);
  const [error, setError] = useState("");

  // Load report history on mount
  useEffect(() => {
    setReportHistory(getReportHistory());
  }, []);

  // Load test data
  const loadTestData = () => {
    setProjectName("智慧城市一期项目");
    setCompletedWork("完成了需求分析文档，确认了UI设计方案，开发团队到位");
    setNextPlans("开始前端开发，完成登录模块，召开项目启动会");
    setIssues("第三方接口文档不完整，需要协调");
    setResourceNeeds("需要增加1名后端开发");
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    setDateRange({
      start: weekAgo.toISOString().split("T")[0],
      end: today.toISOString().split("T")[0],
    });
  };

  const handleGenerate = async () => {
    if (!projectName) {
      setError("请选择或输入项目名称");
      return;
    }

    setLoading(true);
    setError("");
    setGeneratedReport(null);

    const request: ReportRequest = {
      type: reportType,
      projectName,
      dateRange: dateRange.start && dateRange.end ? dateRange : undefined,
      completedWork,
      nextPlans,
      issues,
      resourceNeeds,
      tone,
    };

    try {
      const response = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (data.success && data.report) {
        setGeneratedReport(data.report);
        saveReportToHistory(data.report);
        setReportHistory(getReportHistory());
      } else {
        setError(data.error || "生成失败");
      }
    } catch (e) {
      setError(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (generatedReport) {
      navigator.clipboard.writeText(generatedReport.content);
    }
  };

  const loadFromHistory = (report: GeneratedReport) => {
    setGeneratedReport(report);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
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
        <span style={{ fontWeight: 700, color: "var(--cyan)" }}>📝 AI报告生成</span>
        <span className="tag" style={{ background: "rgba(6,182,212,0.15)", color: "var(--cyan)", fontSize: "0.7rem" }}>青</span>
      </header>

      <main style={{ padding: "32px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
          {/* Left Column - Input */}
          <div>
            {/* Report Type Selector */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                选择报告类型
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                {(["weekly", "monthly", "progress", "meeting", "acceptance"] as ReportType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => setReportType(type)}
                    style={{
                      padding: "14px 8px",
                      borderRadius: 8,
                      border: `2px solid ${reportType === type ? "var(--cyan)" : "var(--border)"}`,
                      background: reportType === type ? "rgba(6,182,212,0.1)" : "var(--surface2)",
                      color: reportType === type ? "var(--cyan)" : "var(--text)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: reportType === type ? 700 : 400,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: "1.2rem" }}>
                      {type === "weekly" && "📅"}
                      {type === "monthly" && "📆"}
                      {type === "progress" && "📊"}
                      {type === "meeting" && "📋"}
                      {type === "acceptance" && "✅"}
                    </span>
                    {REPORT_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                报告内容
              </div>

              {/* Project Selector */}
              <div style={{ marginBottom: 16 }}>
                <label className="label">项目名称</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <select
                    className="input"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">选择项目...</option>
                    {PROJECTS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  <button
                    className="btn-secondary"
                    onClick={loadTestData}
                    style={{ fontSize: "0.75rem", padding: "8px 16px" }}
                  >
                    填充测试数据
                  </button>
                </div>
              </div>

              {/* Date Range */}
              {(reportType === "weekly" || reportType === "monthly") && (
                <div style={{ marginBottom: 16 }}>
                  <label className="label">报告日期范围</label>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <input
                      type="date"
                      className="input"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      style={{ flex: 1 }}
                    />
                    <span style={{ color: "var(--text2)" }}>至</span>
                    <input
                      type="date"
                      className="input"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              )}

              {/* Tone Selector */}
              <div style={{ marginBottom: 16 }}>
                <label className="label">AI语气风格</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {(["formal", "concise", "detailed"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      style={{
                        flex: 1,
                        padding: "10px",
                        borderRadius: 8,
                        border: `2px solid ${tone === t ? "var(--cyan)" : "var(--border)"}`,
                        background: tone === t ? "rgba(6,182,212,0.1)" : "var(--surface2)",
                        color: tone === t ? "var(--cyan)" : "var(--text2)",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        fontWeight: tone === t ? 600 : 400,
                      }}
                    >
                      {TONE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content Fields */}
              <div style={{ marginBottom: 16 }}>
                <label className="label">
                  {reportType === "meeting" ? "会议要点/决议" : "本期完成内容"}
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={
                    reportType === "meeting"
                      ? "输入会议核心要点和决议..."
                      : "描述本期完成的主要工作..."
                  }
                  value={completedWork}
                  onChange={(e) => setCompletedWork(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">
                  {reportType === "acceptance" ? "验收标准" : "下期计划"}
                </label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={
                    reportType === "acceptance"
                      ? "列出验收标准和对照条件..."
                      : "描述下期工作计划和目标..."
                  }
                  value={nextPlans}
                  onChange={(e) => setNextPlans(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">
                  {reportType === "acceptance" ? "缺陷与遗留问题" : "遇到的问题与风险"}
                </label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="描述遇到的问题、需要协调的事项..."
                  value={issues}
                  onChange={(e) => setIssues(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="label">资源需求</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="描述资源需求，如人力、设备、预算等..."
                  value={resourceNeeds}
                  onChange={(e) => setResourceNeeds(e.target.value)}
                  style={{ resize: "vertical" }}
                />
              </div>

              {/* Error Display */}
              {error && (
                <div style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid var(--red)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  color: "var(--red)",
                  fontSize: "0.85rem",
                  marginBottom: 16,
                }}>
                  {error}
                </div>
              )}

              {/* Generate Button */}
              <button
                className="btn-primary"
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  width: "100%",
                  opacity: loading ? 0.6 : 1,
                  background: "var(--cyan)",
                  fontSize: "1rem",
                  padding: "14px",
                }}
              >
                {loading ? "⏳ AI生成中..." : "🚀 生成报告"}
              </button>
            </div>
          </div>

          {/* Right Column - Preview & History */}
          <div>
            {/* Generated Report Preview */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              marginBottom: 20,
              minHeight: 400,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  报告预览
                </div>
                {generatedReport && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                      预计阅读: {estimateReadingTime(generatedReport.content)}
                    </span>
                    <button
                      className="btn-secondary"
                      onClick={copyToClipboard}
                      style={{ fontSize: "0.75rem", padding: "6px 12px" }}
                    >
                      📋 复制
                    </button>
                  </div>
                )}
              </div>

              {loading && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text2)" }}>
                  <div style={{ fontSize: "3rem", marginBottom: 16 }}>⏳</div>
                  <p style={{ fontWeight: 600 }}>MiniMax 正在生成报告...</p>
                  <p style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--text2)" }}>通常需要5-15秒</p>
                </div>
              )}

              {!loading && !generatedReport && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text2)" }}>
                  <div style={{ fontSize: "3.5rem", marginBottom: 16, opacity: 0.3 }}>📄</div>
                  <p>填写左侧信息，点击生成按钮</p>
                  <p style={{ fontSize: "0.8rem", marginTop: 8 }}>AI将自动生成结构化报告</p>
                </div>
              )}

              {generatedReport && (
                <div style={{ flex: 1, overflow: "auto" }}>
                  <div style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "16px",
                    marginBottom: 12,
                  }}>
                    <div style={{ fontWeight: 700, color: "var(--cyan)", marginBottom: 4 }}>
                      {generatedReport.title}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                      {new Date(generatedReport.generatedAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="prose" style={{
                    whiteSpace: "pre-wrap",
                    fontSize: "0.88rem",
                    lineHeight: 1.8,
                    maxHeight: 500,
                    overflow: "auto",
                  }}>
                    {generatedReport.content}
                  </div>
                </div>
              )}
            </div>

            {/* Report History */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                历史记录（最近5条）
              </div>

              {reportHistory.length === 0 ? (
                <div style={{ color: "var(--text2)", fontSize: "0.85rem", textAlign: "center", padding: "20px 0" }}>
                  暂无历史记录
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {reportHistory.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => loadFromHistory(report)}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "12px",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = "var(--cyan)";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "var(--text)", marginBottom: 4 }}>
                        {report.title}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>
                        {new Date(report.generatedAt).toLocaleString("zh-CN")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}