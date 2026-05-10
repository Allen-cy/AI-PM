"use client";

import { useState } from "react";
import {
  type Risk,
  initialRisks,
  calculateRiskScore,
  getRiskLevel,
  classifyRisks,
  getRiskColor,
  generateMatrixGrid,
  statusLabels,
  categoryLabels,
} from "@/lib/risk";

const emptyRisk = {
  description: "",
  category: "技术" as Risk["category"],
  probability: 3 as Risk["probability"],
  impact: 3 as Risk["impact"],
  responseStrategy: "",
  owner: "",
};

export default function RiskPage() {
  const [risks, setRisks] = useState<Risk[]>(initialRisks);
  const [showForm, setShowForm] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [formData, setFormData] = useState(emptyRisk);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [statusFilter, setStatusFilter] = useState<Risk["status"] | "all">("all");
  const [activeTab, setActiveTab] = useState<"list" | "matrix">("list");

  // Stats
  const classified = classifyRisks(risks);
  const filteredRisks = statusFilter === "all"
    ? risks
    : risks.filter(r => r.status === statusFilter);

  // P-I Matrix Grid (5x5)
  const matrixGrid = generateMatrixGrid(risks);

  // Risk trend mock data
  const trendData = [
    { month: "1月", count: 3 },
    { month: "2月", count: 5 },
    { month: "3月", count: 4 },
    { month: "4月", count: 7 },
    { month: "5月", count: risks.length },
  ];
  const maxTrend = Math.max(...trendData.map(d => d.count), 1);

  const handleSave = () => {
    if (!formData.description.trim()) {
      setError("请填写风险描述");
      return;
    }
    const piScore = calculateRiskScore(formData.probability, formData.impact);

    if (editingRisk) {
      setRisks(prev => prev.map(r =>
        r.id === editingRisk.id
          ? { ...formData, piScore, id: editingRisk.id, createdAt: editingRisk.createdAt, status: editingRisk.status }
          : r
      ));
    } else {
      const newRisk: Risk = {
        ...formData,
        piScore,
        id: `R${String(risks.length + 1).padStart(3, "0")}`,
        status: "identified",
        createdAt: new Date().toISOString().split("T")[0],
      };
      setRisks(prev => [...prev, newRisk]);
    }
    setShowForm(false);
    setEditingRisk(null);
    setFormData(emptyRisk);
    setError("");
  };

  const handleEdit = (risk: Risk) => {
    setEditingRisk(risk);
    setFormData({
      description: risk.description,
      category: risk.category,
      probability: risk.probability,
      impact: risk.impact,
      responseStrategy: risk.responseStrategy,
      owner: risk.owner,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    setRisks(prev => prev.filter(r => r.id !== id));
  };

  const handleAIScan = async () => {
    if (!projectDesc.trim()) {
      setError("请填写项目描述");
      return;
    }
    setScanning(true);
    setError("");

    try {
      const response = await fetch("/api/risk/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDescription: projectDesc }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI扫描失败");

      setRisks(prev => [...prev, ...data.risks]);
      setProjectDesc("");
    } catch (e: unknown) {
      setError(`AI扫描失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScanning(false);
    }
  };

  const statusColorMap: Record<Risk["status"], string> = {
    identified: "#3b82f6",
    tracking: "#f59e0b",
    resolved: "#22c55e",
  };

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
        <span style={{ fontWeight: 700 }}>🔐 风险管理</span>
        <span className="tag" style={{ fontSize: "0.7rem", background: "rgba(139,92,246,0.15)", color: "var(--purple)" }}>AI</span>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Stats Bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-num">{classified.total}</div>
            <div className="stat-label">风险总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#ef4444" }}>{classified.high.length}</div>
            <div className="stat-label">高风险 (P×I≥16)</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#f59e0b" }}>{classified.medium.length}</div>
            <div className="stat-label">中风险 (6≤P×I&lt;16)</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#22c55e" }}>{classified.low.length}</div>
            <div className="stat-label">低风险 (P×I&lt;6)</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          {[
            { key: "list", icon: "📋", label: "风险登记册" },
            { key: "matrix", icon: "🎯", label: "P-I矩阵" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                padding: "10px 24px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--purple)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--purple)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: "0.85rem",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>{tab.icon}</span> {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "list" && (
          <>
            {/* AI Scan Section */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", marginBottom: 24 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🤖 AI风险扫描
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="请输入项目描述（背景、目标、范围、团队情况等），AI将自动识别潜在风险..."
                  value={projectDesc}
                  onChange={e => setProjectDesc(e.target.value)}
                  style={{ flex: 1, resize: "vertical", fontSize: "0.85rem" }}
                />
                <button
                  className="btn-primary"
                  onClick={handleAIScan}
                  disabled={scanning}
                  style={{ opacity: scanning ? 0.6 : 1, whiteSpace: "nowrap", alignSelf: "flex-start" }}
                >
                  {scanning ? "⏳ 扫描中..." : "🔍 智能扫描"}
                </button>
              </div>
              {error && (
                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 16px", color: "var(--red)", fontSize: "0.85rem", marginTop: 12 }}>
                  {error}
                </div>
              )}
            </div>

            {/* Status Filter */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {[
                { key: "all", label: "全部" },
                { key: "identified", label: "识别中" },
                { key: "tracking", label: "跟踪中" },
                { key: "resolved", label: "已解决" },
              ].map(filter => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key as typeof statusFilter)}
                  style={{
                    padding: "6px 16px",
                    borderRadius: 20,
                    border: "1px solid var(--border)",
                    background: statusFilter === filter.key ? "var(--purple)" : "transparent",
                    color: statusFilter === filter.key ? "#fff" : "var(--text2)",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    fontWeight: statusFilter === filter.key ? 600 : 400,
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Add Button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--text2)" }}>
                共 {filteredRisks.length} 项风险
              </div>
              <button
                className="btn-primary"
                onClick={() => { setEditingRisk(null); setFormData(emptyRisk); setShowForm(true); }}
              >
                + 添加风险
              </button>
            </div>

            {/* Risk Table */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["ID", "风险描述", "类别", "概率(P)", "影响(I)", "P×I", "状态", "应对策略", "操作"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "var(--text2)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRisks.map(risk => {
                    const colors = getRiskColor(risk.piScore);
                    const level = getRiskLevel(risk.piScore);
                    return (
                      <tr key={risk.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface2)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "var(--text2)" }}>{risk.id}</td>
                        <td style={{ padding: "12px 16px", maxWidth: 240 }}>
                          <span style={{ fontWeight: 500 }}>{risk.description}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span className="tag" style={{ fontSize: "0.72rem", background: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
                            {categoryLabels[risk.category]}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-block", width: 28, height: 28, lineHeight: "28px", textAlign: "center",
                            borderRadius: "50%", fontWeight: 700, fontSize: "0.78rem",
                            background: risk.probability >= 4 ? "rgba(239,68,68,0.15)" : risk.probability >= 2 ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                            color: risk.probability >= 4 ? "#ef4444" : risk.probability >= 2 ? "#f59e0b" : "#22c55e",
                          }}>{risk.probability}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-block", width: 28, height: 28, lineHeight: "28px", textAlign: "center",
                            borderRadius: "50%", fontWeight: 700, fontSize: "0.78rem",
                            background: risk.impact >= 4 ? "rgba(239,68,68,0.15)" : risk.impact >= 2 ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                            color: risk.impact >= 4 ? "#ef4444" : risk.impact >= 2 ? "#f59e0b" : "#22c55e",
                          }}>{risk.impact}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            ...colors,
                            padding: "4px 10px",
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            border: `1px solid ${colors.border}`,
                          }}>
                            {risk.piScore} ({level === "high" ? "高" : level === "medium" ? "中" : "低"})
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            padding: "4px 10px",
                            borderRadius: 12,
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            background: `${statusColorMap[risk.status]}15`,
                            color: statusColorMap[risk.status],
                          }}>
                            {statusLabels[risk.status]}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", maxWidth: 200, color: "var(--text2)", fontSize: "0.8rem" }}>{risk.responseStrategy}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => handleEdit(risk)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--accent2)" }}>编辑</button>
                            <button onClick={() => handleDelete(risk.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--red)" }}>删除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRisks.length === 0 && (
                <div style={{ padding: "48px", textAlign: "center", color: "var(--text2)" }}>
                  <div style={{ fontSize: "2rem", marginBottom: 12 }}>📋</div>
                  <p>暂无风险记录</p>
                </div>
              )}
            </div>

            {/* Risk Trend Chart */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "24px", marginTop: 24 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                📈 风险趋势
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 16, height: 120 }}>
                {trendData.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: "100%",
                      height: `${(d.count / maxTrend) * 100}%`,
                      background: i === trendData.length - 1 ? "var(--purple)" : "var(--accent)",
                      borderRadius: "4px 4px 0 0",
                      minHeight: 4,
                    }} />
                    <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>{d.month}</div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>{d.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === "matrix" && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "28px" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              🎯 概率-影响矩阵 (5×5 P-I Matrix)
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 24, marginBottom: 24, fontSize: "0.8rem", color: "var(--text2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: "#ef4444" }} />
                <span>高风险 (16-25)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: "#f59e0b" }} />
                <span>中风险 (6-15)</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: "#22c55e" }} />
                <span>低风险 (1-5)</span>
              </div>
            </div>

            {/* 5x5 Matrix Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "auto repeat(5, 1fr)", gridTemplateRows: "auto repeat(5, 1fr)", gap: 4, maxWidth: 700 }}>
              {/* Header Row */}
              <div />
              {[5, 4, 3, 2, 1].map(p => (
                <div key={p} style={{ textAlign: "center", fontWeight: 700, fontSize: "0.75rem", color: "var(--text2)", padding: "8px 4px" }}>
                  P={p}
                </div>
              ))}

              {/* Grid Rows - Impact from 5 to 1 */}
              {[5, 4, 3, 2, 1].map(i => (
                <>
                  <div key={`label-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "0.75rem", color: "var(--text2)", padding: "4px" }}>
                    I={i}
                  </div>
                  {[5, 4, 3, 2, 1].map(p => {
                    const score = p * i;
                    const colors = getRiskColor(score);
                    const cellRisks = matrixGrid[`${p}-${i}`] || [];
                    return (
                      <div key={`${p}-${i}`} style={{
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: 8,
                        padding: 8,
                        minHeight: 60,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        cursor: "pointer",
                        transition: "transform 0.15s",
                      }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = "scale(1.02)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = "scale(1)"}
                      >
                        <div style={{ fontSize: "0.65rem", fontWeight: 700, color: colors.text, textAlign: "center" }}>
                          {score}
                        </div>
                        {cellRisks.slice(0, 2).map(r => (
                          <div key={r.id} style={{ fontSize: "0.65rem", padding: "2px 4px", background: "var(--surface)", borderRadius: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            onClick={() => handleEdit(r)}>
                            {r.description.slice(0, 10)}
                          </div>
                        ))}
                        {cellRisks.length > 2 && (
                          <div style={{ fontSize: "0.6rem", color: "var(--text2)" }}>+{cellRisks.length - 2}</div>
                        )}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>

            <div style={{ marginTop: 16, fontSize: "0.78rem", color: "var(--text2)" }}>
              矩阵说明: P=概率 (1-5), I=影响 (1-5) | 点击风险项可编辑 | 分数 = P × I
            </div>
          </div>
        )}
      </main>

      {/* Form Modal */}
      {showForm && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: 20,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false); }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "28px",
            width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto",
          }}>
            <div style={{ fontSize: "1rem", fontWeight: 700, marginBottom: 24 }}>
              {editingRisk ? "编辑风险" : "添加风险"}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label className="label">风险描述 *</label>
                <textarea className="input" rows={2} placeholder="描述风险内容..." value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} style={{ resize: "vertical" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="label">类别</label>
                  <select className="input" value={formData.category}
                    onChange={e => setFormData(prev => ({ ...prev, category: e.target.value as Risk["category"] }))}>
                    {(["技术", "人员", "外部", "管理", "质量"] as const).map(c => (
                      <option key={c} value={c}>{categoryLabels[c]}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">责任人</label>
                  <input className="input" placeholder="负责人姓名" value={formData.owner}
                    onChange={e => setFormData(prev => ({ ...prev, owner: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="label">概率 (P) 1-5</label>
                  <select className="input" value={formData.probability}
                    onChange={e => setFormData(prev => ({ ...prev, probability: parseInt(e.target.value) as Risk["probability"] }))}>
                    <option value={1}>1 - 极低</option>
                    <option value={2}>2 - 低</option>
                    <option value={3}>3 - 中等</option>
                    <option value={4}>4 - 高</option>
                    <option value={5}>5 - 极高</option>
                  </select>
                </div>

                <div>
                  <label className="label">影响 (I) 1-5</label>
                  <select className="input" value={formData.impact}
                    onChange={e => setFormData(prev => ({ ...prev, impact: parseInt(e.target.value) as Risk["impact"] }))}>
                    <option value={1}>1 - 轻微</option>
                    <option value={2}>2 - 较小</option>
                    <option value={3}>3 - 中等</option>
                    <option value={4}>4 - 严重</option>
                    <option value={5}>5 - 极严重</option>
                  </select>
                </div>
              </div>

              {/* P×I Score Preview */}
              <div style={{ padding: "12px 16px", background: "var(--surface2)", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text2)", fontSize: "0.85rem" }}>风险评分 P×I</span>
                <span style={{ fontWeight: 700, fontSize: "1.2rem", color: getRiskColor(calculateRiskScore(formData.probability, formData.impact)).text }}>
                  {calculateRiskScore(formData.probability, formData.impact)}
                </span>
              </div>

              {editingRisk && (
                <div>
                  <label className="label">状态</label>
                  <select className="input" value={editingRisk.status}
                    onChange={e => {
                      const newStatus = e.target.value as Risk["status"];
                      setRisks(prev => prev.map(r => r.id === editingRisk.id ? { ...r, status: newStatus } : r));
                      setEditingRisk({ ...editingRisk, status: newStatus });
                    }}>
                    <option value="identified">识别中</option>
                    <option value="tracking">跟踪中</option>
                    <option value="resolved">已解决</option>
                  </select>
                </div>
              )}

              <div>
                <label className="label">应对策略</label>
                <textarea className="input" rows={3} placeholder="风险应对措施..." value={formData.responseStrategy}
                  onChange={e => setFormData(prev => ({ ...prev, responseStrategy: e.target.value }))} style={{ resize: "vertical" }} />
              </div>
            </div>

            {error && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 16px", color: "var(--red)", fontSize: "0.85rem", marginTop: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingRisk(null); setError(""); }}>
                取消
              </button>
              <button className="btn-primary" onClick={handleSave}>
                {editingRisk ? "保存修改" : "添加风险"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}