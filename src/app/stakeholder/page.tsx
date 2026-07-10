"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type Stakeholder,
  type EngagementLevel,
  type MatrixQuadrant,
  initialStakeholders,
  classifyStakeholders,
  calculateEngagementGap,
  getManagementRecommendation,
  getQuadrantLabel,
  getQuadrantColor,
  getStakeholderQuadrant,
  getEngagementColor,
} from "@/lib/stakeholder";

const engagementLevels: EngagementLevel[] = ['不知情', '抵制', '中立', '支持', '领导'];
const frequencies: Stakeholder['communicationFrequency'][] = ['每周', '每两周', '每月', '按需'];
const methods: Stakeholder['communicationMethod'][] = ['邮件', '会议', '电话', '即时通讯'];

const quadrantOrder: MatrixQuadrant[] = ['manageClosely', 'keepSatisfied', 'keepInformed', 'monitor'];

function EngagementBadge({ level }: { level: EngagementLevel }) {
  const color = getEngagementColor(level);
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: "0.72rem",
      fontWeight: 600,
      background: `${color}15`,
      color: color,
      border: `1px solid ${color}30`,
    }}>
      {level}
    </span>
  );
}

function GapBadge({ gap }: { gap: ReturnType<typeof calculateEngagementGap> }) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      padding: "2px 8px",
      borderRadius: 12,
      fontSize: "0.72rem",
      fontWeight: 600,
      background: `${gap.color}15`,
      color: gap.color,
      border: `1px solid ${gap.color}30`,
    }}>
      {gap.label}
    </span>
  );
}

const emptyForm: Partial<Stakeholder> = {
  power: 3,
  interest: 3,
  currentEngagement: '中立',
  desiredEngagement: '中立',
  communicationFrequency: '每月',
  communicationMethod: '邮件',
  managementStrategy: '',
};

export default function StakeholderPage() {
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>(initialStakeholders);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Stakeholder>>(emptyForm);
  const [activeTab, setActiveTab] = useState<"register" | "matrix" | "plan">("register");
  const [loading, setLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>("");

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = () => {
    if (!form.name || !form.role || !form.organization) return;

    if (editingId) {
      setStakeholders(prev => prev.map(s => s.id === editingId ? { ...s, ...form } as Stakeholder : s));
    } else {
      const newId = `S${String(stakeholders.length + 1).padStart(3, '0')}`;
      setStakeholders(prev => [...prev, { id: newId, ...form } as Stakeholder]);
    }
    resetForm();
  };

  const handleEdit = (s: Stakeholder) => {
    setForm(s);
    setEditingId(s.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("确认删除该干系人？")) {
      setStakeholders(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleAISuggest = async () => {
    setLoading(true);
    setAiResult("");
    try {
      const response = await fetch("/api/stakeholder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stakeholders }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "AI建议生成失败");
      setStakeholders(data.suggestions || stakeholders);
      setAiResult(data.aiReasoning || "已生成管理策略建议");
    } catch (e: unknown) {
      alert(`AI建议失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const classified = classifyStakeholders(stakeholders);

  const stats = {
    total: stakeholders.length,
    manageClosely: classified.manageClosely.length,
    keepSatisfied: classified.keepSatisfied.length,
    keepInformed: classified.keepInformed.length,
    monitor: classified.monitor.length,
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
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontWeight: 700 }}>👥 干系人管理</span>
        <span className="tag tag-blue" style={{ fontSize: "0.7rem" }}>Power-Interest Matrix</span>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {/* Stats Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "var(--accent)" }}>{stats.total}</div>
            <div className="stat-label">干系人总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#ef4444" }}>{stats.manageClosely}</div>
            <div className="stat-label">重点管理</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#f59e0b" }}>{stats.keepSatisfied}</div>
            <div className="stat-label">保持满意</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#3b82f6" }}>{stats.keepInformed}</div>
            <div className="stat-label">随时告知</div>
          </div>
          <div className="stat-card">
            <div className="stat-num" style={{ color: "#6b7280" }}>{stats.monitor}</div>
            <div className="stat-label">监督</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
          {[
            { key: "register" as const, label: "📋 干系人登记册" },
            { key: "matrix" as const, label: "🎯 权力-利益矩阵" },
            { key: "plan" as const, label: "📡 沟通计划" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "12px 24px",
                background: "none",
                border: "none",
                borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
                color: activeTab === tab.key ? "var(--accent)" : "var(--text2)",
                fontWeight: activeTab === tab.key ? 700 : 400,
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 8, alignSelf: "flex-end", marginBottom: 8 }}>
            <button
              className="btn-secondary"
              onClick={handleAISuggest}
              disabled={loading}
              style={{ opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "⏳ AI分析中..." : "🤖 AI管理策略"}
            </button>
            <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>
              + 添加干系人
            </button>
          </div>
        </div>

        {/* Register Tab */}
        {activeTab === "register" && (
          <div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["姓名", "角色", "组织", "权力(P)", "利益(I)", "当前参与", "期望参与", "差距", "管理策略", "操作"].map(h => (
                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text2)", textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stakeholders.map(s => {
                    const gap = calculateEngagementGap(s);
                    return (
                      <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600 }}>{s.name}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text2)" }}>{s.role}</td>
                        <td style={{ padding: "12px 16px", color: "var(--text2)" }}>{s.organization}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: "50%", fontWeight: 700, fontSize: "0.78rem",
                            background: s.power >= 4 ? "rgba(239,68,68,0.15)" : s.power >= 2 ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                            color: s.power >= 4 ? "#ef4444" : s.power >= 2 ? "#f59e0b" : "#22c55e",
                          }}>{s.power}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 28, height: 28, borderRadius: "50%", fontWeight: 700, fontSize: "0.78rem",
                            background: s.interest >= 4 ? "rgba(239,68,68,0.15)" : s.interest >= 2 ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)",
                            color: s.interest >= 4 ? "#ef4444" : s.interest >= 2 ? "#f59e0b" : "#22c55e",
                          }}>{s.interest}</span>
                        </td>
                        <td style={{ padding: "12px 16px" }}><EngagementBadge level={s.currentEngagement} /></td>
                        <td style={{ padding: "12px 16px" }}><EngagementBadge level={s.desiredEngagement} /></td>
                        <td style={{ padding: "12px 16px" }}><GapBadge gap={gap} /></td>
                        <td style={{ padding: "12px 16px", maxWidth: 200, color: "var(--text2)", fontSize: "0.8rem" }}>{s.managementStrategy}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => handleEdit(s)} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.8rem" }}>编辑</button>
                            <button onClick={() => handleDelete(s.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: "0.8rem" }}>删除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Matrix Tab */}
        {activeTab === "matrix" && (
          <div>
            {/* 4-Quadrant Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: 12,
              height: 520,
              marginBottom: 24,
            }}>
              {/* Y-axis label */}
              <div style={{ gridColumn: "1", gridRow: "1", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 8 }}>
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", color: "var(--text2)", fontSize: "0.8rem" }}>权力 →</span>
              </div>

              {quadrantOrder.map(quadrant => {
                const config = getQuadrantColor(quadrant);
                const items = stakeholders.filter(s => getStakeholderQuadrant(s) === quadrant);
                const isTop = quadrant === "manageClosely" || quadrant === "keepSatisfied";
                const isRight = quadrant === "manageClosely" || quadrant === "keepInformed";

                return (
                  <div
                    key={quadrant}
                    style={{
                      gridColumn: isRight ? "2" : "1",
                      gridRow: isTop ? "1" : "2",
                      background: config.bg,
                      border: `1px solid ${config.border}`,
                      borderRadius: 12,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ color: config.color, fontWeight: 700, fontSize: "0.9rem" }}>
                        {getQuadrantLabel(quadrant)}
                      </div>
                      <div style={{ color: "var(--text2)", fontSize: "0.7rem" }}>
                        {quadrant === "manageClosely" ? "高权力 × 高利益" :
                         quadrant === "keepSatisfied" ? "高权力 × 低利益" :
                         quadrant === "keepInformed" ? "低权力 × 高利益" : "低权力 × 低利益"}
                      </div>
                    </div>
                    <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 8, alignContent: "flex-start", overflow: "auto" }}>
                      {items.map(s => (
                        <div
                          key={s.id}
                          onClick={() => handleEdit(s)}
                          style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            padding: "8px 12px",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            minWidth: 80,
                          }}
                          title={`${s.name}\n权力:${s.power} 利益:${s.interest}\n参与度:${s.currentEngagement}`}
                        >
                          <div style={{ fontWeight: 600, fontSize: "0.8rem" }}>{s.name}</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text2)" }}>{s.role}</div>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div style={{ color: "var(--text2)", fontSize: "0.75rem", opacity: 0.5, alignSelf: "center", width: "100%", textAlign: "center", padding: 20 }}>
                          暂无干系人
                        </div>
                      )}
                    </div>
                    <div style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--text2)", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                      {items.length} 人
                    </div>
                  </div>
                );
              })}

              {/* X-axis label */}
              <div style={{ gridColumn: "2", gridRow: "2", display: "flex", justifyContent: "center", paddingTop: 8 }}>
                <span style={{ color: "var(--text2)", fontSize: "0.8rem" }}>← 利益 →</span>
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 24, justifyContent: "center", marginBottom: 16 }}>
              {quadrantOrder.map(q => {
                const config = getQuadrantColor(q);
                return (
                  <div key={q} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: config.color }} />
                    <span style={{ color: "var(--text2)" }}>{getQuadrantLabel(q)}</span>
                  </div>
                );
              })}
            </div>

            {/* Management Tips */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 20 }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 12 }}>💡 管理策略建议</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text2)", lineHeight: 1.8 }}>
                <p><span style={{ color: "#ef4444", fontWeight: 600 }}>重点管理</span>：高权力高利益干系人需优先关注，每周至少沟通一次，确保项目方向与组织战略一致。</p>
                <p style={{ marginTop: 8 }}><span style={{ color: "#f59e0b", fontWeight: 600 }}>保持满意</span>：高权力低利益干系人关注项目成果，定期汇报进展，维护支持。</p>
                <p style={{ marginTop: 8 }}><span style={{ color: "#3b82f6", fontWeight: 600 }}>随时告知</span>：低权力高利益干系人积极参与，及时反馈收集，确保持续支持。</p>
                <p style={{ marginTop: 8 }}><span style={{ color: "#6b7280", fontWeight: 600 }}>监督</span>：低权力低利益干系人定期检查状态，通过邮件或简报更新信息即可。</p>
              </div>
            </div>
          </div>
        )}

        {/* Communication Plan Tab */}
        {activeTab === "plan" && (
          <div>
            <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: 20 }}>
              基于权力-利益矩阵自动生成的沟通计划推荐：
            </div>

            {/* Communication Plan Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
              {quadrantOrder.map(quadrant => {
                const config = getQuadrantColor(quadrant);
                const items = stakeholders.filter(s => getStakeholderQuadrant(s) === quadrant);
                const quadrantStakeholders = items.map(s => s.name).join("、") || "暂无";

                const commConfig: Record<MatrixQuadrant, { frequency: string; method: string; focus: string }> = {
                  manageClosely: { frequency: "每周", method: "会议 / 面对面", focus: "项目进展、决策支持、风险预警" },
                  keepSatisfied: { frequency: "每月", method: "邮件 / 书面报告", focus: "成果展示、满意度维护、预算执行" },
                  keepInformed: { frequency: "每两周", method: "即时通讯 / 周会", focus: "需求收集、反馈收集、功能评审" },
                  monitor: { frequency: "每月", method: "邮件 / 简报", focus: "状态更新、里程碑通报" },
                };

                const comm = commConfig[quadrant];

                return (
                  <div key={quadrant} style={{ background: "var(--surface)", border: `1px solid ${config.border}`, borderRadius: 12, padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: config.color }} />
                      <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{getQuadrantLabel(quadrant)}</span>
                      <span className="tag tag-blue" style={{ fontSize: "0.65rem" }}>{items.length}人</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>沟通频率</span>
                        <span style={{ fontWeight: 600, color: config.color }}>{comm.frequency}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>沟通方式</span>
                        <span style={{ fontWeight: 600 }}>{comm.method}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
                        <span style={{ color: "var(--text2)" }}>沟通重点</span>
                        <span style={{ fontWeight: 600, color: "var(--green)" }}>{comm.focus}</span>
                      </div>
                      <div style={{ marginTop: 8, padding: "8px 12px", background: "var(--surface2)", borderRadius: 8, fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--text2)" }}>成员：</span>
                        <span>{quadrantStakeholders}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* AI Suggestions Result */}
            {aiResult && (
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: "1.2rem" }}>🤖</span>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>AI 分析结果</span>
                  <span className="tag tag-purple" style={{ fontSize: "0.65rem" }}>M2.7</span>
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", lineHeight: 1.8 }}>
                  {aiResult}
                </div>
              </div>
            )}

            {/* Individual Stakeholder Plans */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: 16 }}>📅 个人沟通计划</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {stakeholders.map(s => (
                  <div key={s.id} style={{ display: "flex", gap: 16, padding: "12px 16px", background: "var(--surface2)", borderRadius: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 100 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text2)" }}>{s.role}</div>
                    </div>
                    <div style={{ display: "flex", gap: 16, flex: 1 }}>
                      <div style={{ fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--text2)" }}>频率：</span>
                        <span style={{ fontWeight: 600 }}>{s.communicationFrequency}</span>
                      </div>
                      <div style={{ fontSize: "0.78rem" }}>
                        <span style={{ color: "var(--text2)" }}>方式：</span>
                        <span style={{ fontWeight: 600 }}>{s.communicationMethod}</span>
                      </div>
                      <div style={{ fontSize: "0.78rem", flex: 1 }}>
                        <span style={{ color: "var(--text2)" }}>策略：</span>
                        <span>{s.managementStrategy}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 32,
            width: 560,
            maxHeight: "90vh",
            overflow: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>{editingId ? "编辑干系人" : "添加干系人"}</h2>
              <button onClick={resetForm} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
            </div>

            {/* Basic Info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="label">姓名 *</label>
                <input className="input" placeholder="干系人姓名" value={form.name || ""}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">角色 *</label>
                <input className="input" placeholder="如：CEO、PMO负责人" value={form.role || ""}
                  onChange={e => setForm(prev => ({ ...prev, role: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="label">组织 *</label>
              <input className="input" placeholder="所属部门或组织" value={form.organization || ""}
                onChange={e => setForm(prev => ({ ...prev, organization: e.target.value }))} />
            </div>

            {/* Power & Interest */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div>
                <label className="label">权力等级 (P) 1-5</label>
                <select className="input" value={form.power || 3}
                  onChange={e => setForm(prev => ({ ...prev, power: parseInt(e.target.value) as Stakeholder["power"] }))}>
                  {[1, 2, 3, 4, 5].map(p => <option key={p} value={p}>{p} - {p >= 4 ? "高" : p >= 2 ? "中" : "低"}</option>)}
                </select>
              </div>
              <div>
                <label className="label">利益等级 (I) 1-5</label>
                <select className="input" value={form.interest || 3}
                  onChange={e => setForm(prev => ({ ...prev, interest: parseInt(e.target.value) as Stakeholder["interest"] }))}>
                  {[1, 2, 3, 4, 5].map(i => <option key={i} value={i}>{i} - {i >= 4 ? "高" : i >= 2 ? "中" : "低"}</option>)}
                </select>
              </div>
            </div>

            {/* Engagement */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div>
                <label className="label">当前参与度</label>
                <select className="input" value={form.currentEngagement || "中立"}
                  onChange={e => setForm(prev => ({ ...prev, currentEngagement: e.target.value as EngagementLevel }))}>
                  {engagementLevels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label">期望参与度</label>
                <select className="input" value={form.desiredEngagement || "中立"}
                  onChange={e => setForm(prev => ({ ...prev, desiredEngagement: e.target.value as EngagementLevel }))}>
                  {engagementLevels.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Communication */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <div>
                <label className="label">沟通频率</label>
                <select className="input" value={form.communicationFrequency || "每月"}
                  onChange={e => setForm(prev => ({ ...prev, communicationFrequency: e.target.value as Stakeholder["communicationFrequency"] }))}>
                  {frequencies.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="label">沟通方式</label>
                <select className="input" value={form.communicationMethod || "邮件"}
                  onChange={e => setForm(prev => ({ ...prev, communicationMethod: e.target.value as Stakeholder["communicationMethod"] }))}>
                  {methods.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            {/* Strategy */}
            <div style={{ marginTop: 16 }}>
              <label className="label">管理策略</label>
              <textarea className="input" rows={3} placeholder="输入管理策略..." value={form.managementStrategy || ""}
                onChange={e => setForm(prev => ({ ...prev, managementStrategy: e.target.value }))}
                style={{ resize: "vertical" }} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="btn-primary" onClick={handleSave} style={{ flex: 1 }}>保存</button>
              <button className="btn-secondary" onClick={resetForm} style={{ flex: 1 }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
