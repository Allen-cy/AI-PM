"use client";

import { useState } from "react";
import {
  TEST_TEAM_MEMBERS,
  ACTIVE_PROJECTS,
  SKILL_CATEGORIES,
  calculateUtilization,
  getUtilizationColor,
  getSkillMatrixData,
  optimizeAllocation,
  TeamMember,
  Allocation,
} from "@/lib/resource";

// Allocation Bar Component
function AllocationBar({ member }: { member: TeamMember }) {
  const utilization = calculateUtilization(member);
  const color = getUtilizationColor(utilization);
  const totalAllocated = member.allocation.reduce((sum, a) => sum + a.allocatedHours, 0);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{member.name}</span>
        <span style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
          {totalAllocated}h / {member.availableHours}h
        </span>
      </div>
      <div style={{
        height: 20,
        background: "var(--border)",
        borderRadius: 10,
        overflow: "hidden",
        position: "relative",
      }}>
        <div style={{
          width: `${Math.min(utilization, 100)}%`,
          height: "100%",
          background: color,
          borderRadius: 10,
          transition: "width 0.3s ease",
        }} />
        {utilization > 100 && (
          <div style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "0.75rem",
            fontWeight: 700,
            color: "var(--red)",
          }}>
            +{utilization - 100}%
          </div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span style={{
          fontSize: "0.8rem",
          fontWeight: 600,
          color,
        }}>
          {utilization}%
        </span>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {member.allocation.map((a, i) => (
            <span key={i} className="tag" style={{
              fontSize: "0.7rem",
              background: "var(--surface)",
              padding: "2px 8px",
              borderRadius: 4,
            }}>
              {a.projectName.split(" ")[0]} {a.allocatedHours}h
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Skills Matrix Cell
function SkillCell({ level }: { level: number }) {
  if (level === 0) return <div style={{ width: 36, height: 28, background: "var(--border)", borderRadius: 4 }} />;

  const colors = [
    "var(--text2)",    // 1
    "var(--text)",     // 2
    "var(--green)",    // 3
    "var(--accent)",   // 4
    "#e67e22",         // 5 - 专家
  ];

  return (
    <div style={{
      width: 36,
      height: 28,
      background: colors[level - 1],
      borderRadius: 4,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: level >= 3 ? "var(--bg)" : "var(--text)",
      fontSize: "0.75rem",
      fontWeight: 600,
    }}>
      {level}
    </div>
  );
}

// Add/Edit Resource Modal
function ResourceModal({
  member,
  onClose,
  onSave,
}: {
  member?: TeamMember;
  onClose: () => void;
  onSave: (data: Partial<TeamMember>) => void;
}) {
  const [name, setName] = useState(member?.name || "");
  const [role, setRole] = useState(member?.role || "");
  const [skills, setSkills] = useState<string[]>(member?.skills || []);
  const [hourlyRate, setHourlyRate] = useState(member?.hourlyRate || 300);
  const [availableHours, setAvailableHours] = useState(member?.availableHours || 40);

  const toggleSkill = (skill: string) => {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const handleSubmit = () => {
    onSave({ name, role, skills, hourlyRate, availableHours, allocation: member?.allocation || [] });
    onClose();
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div style={{
        background: "var(--surface)",
        borderRadius: 16,
        padding: 32,
        width: 500,
        maxHeight: "80vh",
        overflow: "auto",
      }}>
        <h3 style={{ marginTop: 0, marginBottom: 24 }}>
          {member ? "编辑资源" : "添加资源"}
        </h3>

        <div style={{ marginBottom: 16 }}>
          <label className="input-label">姓名</label>
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="请输入姓名"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="input-label">角色</label>
          <input
            className="input"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="如：高级Java开发"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label className="input-label">技能</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SKILL_CATEGORIES.map(skill => (
              <button
                key={skill}
                onClick={() => toggleSkill(skill)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 16,
                  border: "1px solid",
                  borderColor: skills.includes(skill) ? "var(--accent)" : "var(--border)",
                  background: skills.includes(skill) ? "var(--accent)" : "transparent",
                  color: skills.includes(skill) ? "var(--bg)" : "var(--text)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                }}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <label className="input-label">时薪 (元/h)</label>
            <input
              className="input"
              type="number"
              value={hourlyRate}
              onChange={e => setHourlyRate(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label className="input-label">可用小时/周</label>
            <input
              className="input"
              type="number"
              value={availableHours}
              onChange={e => setAvailableHours(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button className="btn-secondary" onClick={onClose}>取消</button>
          <button className="btn-primary" onClick={handleSubmit}>
            {member ? "保存" : "添加"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ResourcePage() {
  const [members, setMembers] = useState<TeamMember[]>(TEST_TEAM_MEMBERS);
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | undefined>();
  const [activeTab, setActiveTab] = useState<"pool" | "matrix" | "planning">("pool");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState<{
    suggestions: string[];
    conflicts: string[];
  } | null>(null);

  const overloadedCount = members.filter(m => calculateUtilization(m) > 100).length;
  const underutilizedCount = members.filter(m => calculateUtilization(m) < 60 && calculateUtilization(m) > 0).length;
  const skillMatrixData = getSkillMatrixData(members);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptimizationResult(null);

    try {
      const response = await fetch("/api/resource/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members,
          projects: ACTIVE_PROJECTS.map(p => p.name),
          targetUtilization: 80,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setOptimizationResult({
          suggestions: data.suggestions || [],
          conflicts: data.conflicts || [],
        });
      }
    } catch (error) {
      console.error("Optimization failed:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleSaveMember = (data: Partial<TeamMember>) => {
    if (editingMember) {
      setMembers(prev =>
        prev.map(m => m.id === editingMember.id ? { ...m, ...data } : m)
      );
    }
    setEditingMember(undefined);
  };

  return (
    <div style={{ padding: "24px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>资源管理</h1>
          <p style={{ margin: "8px 0 0", color: "var(--text2)", fontSize: "0.9rem" }}>
            团队资源池 · 分配矩阵 · 容量规划
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={handleOptimize}
          disabled={isOptimizing}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          {isOptimizing ? (
            <>
              <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid", borderColor: "var(--bg)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              AI 优化中...
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              AI 资源优化
            </>
          )}
        </button>
      </div>

      {/* Stats Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <div className="stat-card">
          <div style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 4 }}>团队成员</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{members.length}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>人</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 4 }}>超负荷</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: overloadedCount > 0 ? "var(--red)" : "var(--text)" }}>{overloadedCount}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>人</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 4 }}>低利用率</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: underutilizedCount > 0 ? "var(--amber)" : "var(--text)" }}>{underutilizedCount}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>人</div>
        </div>
        <div className="stat-card">
          <div style={{ color: "var(--text2)", fontSize: "0.85rem", marginBottom: 4 }}>活跃项目</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--accent)" }}>{ACTIVE_PROJECTS.length}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>个</div>
        </div>
      </div>

      {/* Optimization Results Alert */}
      {optimizationResult && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--amber)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: "var(--amber)" }}>
            AI 优化建议
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: 8 }}>调整建议</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem" }}>
                {optimizationResult.suggestions.slice(0, 5).map((s, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                ))}
              </ul>
            </div>
            {optimizationResult.conflicts.length > 0 && (
              <div>
                <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: 8 }}>资源冲突</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: "0.9rem", color: "var(--red)" }}>
                  {optimizationResult.conflicts.map((c, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
        {[
          { id: "pool", label: "资源池" },
          { id: "matrix", label: "技能矩阵" },
          { id: "planning", label: "容量规划" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: activeTab === tab.id ? "var(--accent)" : "transparent",
              color: activeTab === tab.id ? "var(--bg)" : "var(--text)",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Resource Pool View */}
      {activeTab === "pool" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Allocation Matrix */}
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>资源分配矩阵</h3>
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {members.map(member => (
                <AllocationBar key={member.id} member={member} />
              ))}
            </div>
          </div>

          {/* Team Members & Skills */}
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>团队技能概览</h3>
            <div style={{ display: "grid", gap: 12 }}>
              {members.map(member => (
                <div key={member.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "var(--bg)",
                  borderRadius: 8,
                }}>
                  <div style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: "var(--accent)",
                    color: "var(--bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                  }}>
                    {member.name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{member.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>{member.role}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {member.skills.map(skill => (
                      <span key={skill} className="tag" style={{ fontSize: "0.7rem" }}>{skill}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setEditingMember(member);
                      setShowModal(true);
                    }}
                    style={{
                      padding: "4px 8px",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      background: "transparent",
                      color: "var(--text2)",
                      cursor: "pointer",
                      fontSize: "0.75rem",
                    }}
                  >
                    编辑
                  </button>
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                setEditingMember(undefined);
                setShowModal(true);
              }}
              style={{ width: "100%", marginTop: 16 }}
            >
              + 添加团队成员
            </button>
          </div>
        </div>
      )}

      {/* Skills Matrix View */}
      {activeTab === "matrix" && (
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16 }}>技能水平矩阵</h3>
          <div style={{ overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "12px 8px", color: "var(--text2)", fontWeight: 600, fontSize: "0.85rem" }}>成员</th>
                  <th style={{ textAlign: "left", padding: "12px 8px", color: "var(--text2)", fontWeight: 600, fontSize: "0.85rem" }}>角色</th>
                  {SKILL_CATEGORIES.map(skill => (
                    <th key={skill} style={{ textAlign: "center", padding: "12px 4px", color: "var(--text2)", fontWeight: 600, fontSize: "0.75rem" }}>{skill}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {skillMatrixData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{row.member}</td>
                    <td style={{ padding: "12px 8px", color: "var(--text2)", fontSize: "0.85rem" }}>{row.role}</td>
                    {SKILL_CATEGORIES.map(skill => (
                      <td key={skill} style={{ padding: "12px 4px", textAlign: "center" }}>
                        <SkillCell level={row.skills[skill]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 16, justifyContent: "center" }}>
            {[1, 2, 3, 4, 5].map(level => (
              <div key={level} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
                <div style={{
                  width: 20,
                  height: 16,
                  background: [
                    "var(--text2)",
                    "var(--text)",
                    "var(--green)",
                    "var(--accent)",
                    "#e67e22",
                  ][level - 1],
                  borderRadius: 4,
                }} />
                <span style={{ color: "var(--text2)" }}>
                  {level}={["基础", "初级", "中级", "高级", "专家"][level - 1]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capacity Planning View */}
      {activeTab === "planning" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {/* Weekly Capacity */}
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>本周容量 (小时)</h3>
            <div style={{ maxHeight: 350, overflow: "auto" }}>
              {members.map(member => {
                const totalAllocated = member.allocation.reduce((sum, a) => sum + a.allocatedHours, 0);
                const available = member.availableHours - totalAllocated;
                const utilization = calculateUtilization(member);
                const color = getUtilizationColor(utilization);

                return (
                  <div key={member.id} style={{ marginBottom: 16, padding: 12, background: "var(--bg)", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 600 }}>{member.name}</span>
                      <span style={{ color: "var(--text2)", fontSize: "0.85rem" }}>
                        可用 {available}h / {member.availableHours}h
                      </span>
                    </div>
                    <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", background: "var(--border)" }}>
                      <div style={{
                        width: `${(totalAllocated / member.availableHours) * 100}%`,
                        background: color,
                        transition: "width 0.3s ease",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Project Resource Needs */}
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ marginTop: 0, marginBottom: 16 }}>项目资源需求</h3>
            <div style={{ display: "grid", gap: 12 }}>
              {ACTIVE_PROJECTS.map(project => {
                const assignedMembers = members.filter(m =>
                  m.allocation.some(a => a.projectId === project.id)
                );
                const totalHours = members.reduce((sum, m) =>
                  sum + m.allocation.filter(a => a.projectId === project.id).reduce((s, a) => s + a.allocatedHours, 0), 0
                );

                return (
                  <div key={project.id} style={{
                    padding: 16,
                    background: "var(--bg)",
                    borderRadius: 8,
                    borderLeft: "4px solid var(--accent)",
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>{project.name}</div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text2)", marginBottom: 8 }}>
                      分配 {assignedMembers.length} 人 · 共 {totalHours}h
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {assignedMembers.map(m => (
                        <span key={m.id} className="tag" style={{ fontSize: "0.75rem" }}>
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        marginTop: 24,
        padding: 16,
        background: "var(--surface)",
        borderRadius: 8,
        display: "flex",
        gap: 24,
        fontSize: "0.85rem",
      }}>
        <span style={{ color: "var(--text2)" }}>利用率图例:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 12, background: "var(--green)", borderRadius: 3 }} />
          <span style={{ color: "var(--text2)" }}>健康 (≤80%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 12, background: "var(--amber)", borderRadius: 3 }} />
          <span style={{ color: "var(--text2)" }}>高负荷 (80-100%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, height: 12, background: "var(--red)", borderRadius: 3 }} />
          <span style={{ color: "var(--text2)" }}>超负荷 (&gt;100%)</span>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <ResourceModal
          member={editingMember}
          onClose={() => {
            setShowModal(false);
            setEditingMember(undefined);
          }}
          onSave={handleSaveMember}
        />
      )}

      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}