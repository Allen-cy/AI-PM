"use client";

import { useState } from "react";
import {
  Task,
  Deliverable,
  ChangeRequest,
  TeamWorkload,
  calculateTeamWorkload,
  getBlockedTasks,
  calculateProgress,
  DEMO_TASKS,
  DEMO_DELIVERABLES,
  DEMO_CHANGE_REQUESTS,
} from "@/lib/execution";

export default function ExecutionPage() {
  const [tasks, setTasks] = useState<Task[]>(DEMO_TASKS);
  const [deliverables, setDeliverables] = useState<Deliverable[]>(DEMO_DELIVERABLES);
  const [changeRequests] = useState<ChangeRequest[]>(DEMO_CHANGE_REQUESTS);
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    risks: string[];
    recommendations: string[];
  } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const blockedTasks = getBlockedTasks(tasks);
  const teamWorkload = calculateTeamWorkload(tasks);
  const progress = calculateProgress(tasks);

  const kanbanColumns = [
    { key: "pending", label: "待处理", color: "var(--text2)" },
    { key: "in-progress", label: "进行中", color: "var(--accent)" },
    { key: "completed", label: "已完成", color: "var(--green)" },
    { key: "blocked", label: "阻塞", color: "var(--red)" },
  ] as const;

  const getTasksByStatus = (status: string) =>
    tasks.filter((t) => t.status === status);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return "✓";
      case "in-progress": return "●";
      case "blocked": return "⚠";
      default: return "○";
    }
  };

  const priorityColor = (p: string) => {
    if (p === "high") return "var(--red)";
    if (p === "medium") return "var(--amber)";
    return "var(--text2)";
  };

  const deliverableStatusIcon = (s: string) => {
    switch (s) {
      case "accepted": return "✓";
      case "ready": return "→";
      case "in-progress": return "●";
      case "rejected": return "✗";
      default: return "○";
    }
  };

  const requestAiSummary = async () => {
    setLoadingAI(true);
    setMessage(null);
    try {
      const res = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks,
          deliverables,
          projectId: "PRJ-2026-001",
        }),
      });
      if (!res.ok) throw new Error("AI summary request failed");
      const data = await res.json();
      setAiSummary({
        summary: typeof data.summary === "string" ? data.summary : "当前执行数据已完成分析，但AI返回格式不完整。",
        risks: Array.isArray(data.risks) ? data.risks : ["AI返回格式异常，请人工复核阻塞任务和交付物状态。"],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : ["优先处理阻塞任务，并补齐交付物验收责任人。"],
      });
    } catch {
      setAiSummary({
        summary: "AI摘要暂时不可用，已根据当前任务状态生成本地兜底摘要。",
        risks: blockedTasks.length > 0
          ? blockedTasks.map(task => `${task.name}存在阻塞：${task.blockedReason ?? "原因待补充"}`)
          : ["当前未发现阻塞任务，但仍需持续关注交付物验收状态。"],
        recommendations: [
          "先处理高优先级阻塞任务，明确责任人和解除时间。",
          "将待验收交付物补齐质量检查结论。",
          "每次状态会后同步更新任务进度，避免进度数据滞后。",
        ],
      });
    } finally {
      setLoadingAI(false);
    }
  };

  const handleAddTask = () => {
    const nextNo = tasks.length + 1;
    const newTask: Task = {
      id: `T${nextNo}`,
      name: `新增任务${nextNo}`,
      assignee: "待分配",
      status: "pending",
      priority: "medium",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      progress: 0,
    };
    setTasks(prev => [...prev, newTask]);
    setMessage(`已添加任务 ${newTask.id}，当前为待处理状态。`);
  };

  const handleAddDeliverable = () => {
    const nextNo = deliverables.length + 1;
    const newDeliverable: Deliverable = {
      id: `D${nextNo}`,
      name: `新增交付物${nextNo}`,
      status: "pending",
      qualityCheck: "待检查",
    };
    setDeliverables(prev => [...prev, newDeliverable]);
    setMessage(`已添加交付物 ${newDeliverable.id}，当前为待验收状态。`);
  };

  // Baseline: 10 tasks over 20 days
  const baselineProgress = 65;
  const currentProgress = progress;

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
        <span style={{ fontWeight: 700 }}>⚡ 执行与交付</span>
        <span className="tag" style={{ background: "rgba(6,182,212,0.15)", color: "var(--cyan)", border: "1px solid rgba(6,182,212,0.3)" }}>
          执行追踪
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={requestAiSummary}
            disabled={loadingAI}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "1px solid rgba(6,182,212,0.4)",
              background: loadingAI ? "rgba(6,182,212,0.1)" : "rgba(6,182,212,0.15)",
              color: "var(--cyan)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: loadingAI ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {loadingAI ? "⏳ 分析中..." : "🤖 AI状态摘要"}
          </button>
          <button onClick={handleAddTask} style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}>
            + 添加任务
          </button>
          <button onClick={handleAddDeliverable} style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
          }}>
            + 添加交付物
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        {message && (
          <div style={{
            marginBottom: 16,
            padding: "10px 14px",
            borderRadius: 8,
            background: "rgba(6,182,212,0.1)",
            border: "1px solid rgba(6,182,212,0.25)",
            color: "var(--cyan)",
            fontSize: "0.84rem",
          }}>
            {message}
          </div>
        )}

        {/* Progress vs Baseline */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px 24px",
          marginBottom: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              进度 vs 基线
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--text2)", display: "flex", gap: 20 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--cyan)" }} />
                当前进度: {currentProgress}%
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: "var(--text2)" }} />
                基线: {baselineProgress}%
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 24, background: "var(--surface2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
              {/* Baseline marker */}
              <div style={{
                position: "absolute",
                left: `${baselineProgress}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--text2)",
                zIndex: 2,
              }} />
              {/* Current progress */}
              <div style={{
                height: "100%",
                width: `${currentProgress}%`,
                background: currentProgress >= baselineProgress
                  ? "linear-gradient(90deg, var(--cyan), var(--green))"
                  : "linear-gradient(90deg, var(--cyan), var(--amber))",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 10,
              }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "white" }}>
                  {currentProgress}%
                </span>
              </div>
            </div>
            <div style={{
              padding: "4px 12px",
              borderRadius: 12,
              background: currentProgress >= baselineProgress ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
              color: currentProgress >= baselineProgress ? "var(--green)" : "var(--amber)",
              fontSize: "0.78rem",
              fontWeight: 700,
            }}>
              {currentProgress >= baselineProgress ? "正常" : "落后"}
            </div>
          </div>
          {/* Mini Gantt bars */}
          <div style={{ display: "flex", gap: 4, marginTop: 14, height: 20 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((day) => {
              const isBaseline = day <= 13;
              const isCurrent = day <= Math.round((currentProgress / 100) * 15);
              return (
                <div key={day} style={{
                  flex: 1,
                  borderRadius: 3,
                  background: isCurrent
                    ? day <= 13 ? "var(--cyan)" : "rgba(6,182,212,0.4)"
                    : isBaseline
                    ? "rgba(148,163,184,0.3)"
                    : "rgba(148,163,184,0.1)",
                  border: day === 13 ? "1px solid var(--text2)" : "none",
                }} />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text2)", marginTop: 4 }}>
            <span>Day 1</span>
            <span>Day 20 (基线)</span>
          </div>
        </div>

        {/* Main Grid: Kanban + Sidebar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          {/* Left: Kanban Board */}
          <div>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px 24px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
                活动任务看板
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {kanbanColumns.map((col) => {
                  const colTasks = getTasksByStatus(col.key);
                  return (
                    <div key={col.key} style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px",
                      minHeight: 160,
                    }}>
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: "1px solid var(--border)",
                      }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: col.color, textTransform: "uppercase" }}>
                          {col.label}
                        </span>
                        <span style={{
                          background: col.color,
                          color: "white",
                          borderRadius: 10,
                          padding: "1px 8px",
                          fontSize: "0.68rem",
                          fontWeight: 700,
                        }}>
                          {colTasks.length}
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {colTasks.map((task) => (
                          <div key={task.id} style={{
                            background: "var(--surface)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            padding: "10px 12px",
                            cursor: "pointer",
                          }}>
                            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ color: col.color, fontSize: "0.7rem" }}>{statusIcon(task.status)}</span>
                              {task.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: "var(--text2)" }}>
                              <span style={{ color: priorityColor(task.priority), fontWeight: 600 }}>{task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}</span>
                              <span>·</span>
                              <span>{task.assignee}</span>
                              <span>·</span>
                              <span>{task.progress}%</span>
                            </div>
                            {task.blockedReason && (
                              <div style={{
                                marginTop: 6,
                                padding: "4px 8px",
                                background: "rgba(239,68,68,0.1)",
                                borderRadius: 4,
                                fontSize: "0.68rem",
                                color: "var(--red)",
                              }}>
                                ⚠ {task.blockedReason}
                              </div>
                            )}
                            {/* Progress bar */}
                            <div style={{
                              marginTop: 8,
                              height: 4,
                              background: "var(--surface2)",
                              borderRadius: 2,
                              overflow: "hidden",
                            }}>
                              <div style={{
                                height: "100%",
                                width: `${task.progress}%`,
                                background: col.color,
                                borderRadius: 2,
                              }} />
                            </div>
                          </div>
                        ))}
                        {colTasks.length === 0 && (
                          <div style={{ color: "var(--text2)", fontSize: "0.75rem", textAlign: "center", padding: "20px 0" }}>
                            暂无任务
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Change Request Log */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "20px 24px",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
                变更请求日志
              </div>
              <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["CR ID", "描述", "影响", "申请人", "状态"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "var(--text2)", fontWeight: 600, fontSize: "0.75rem" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changeRequests.map((cr, idx) => {
                    const statusColor = cr.status === "approved" ? "var(--green)" : cr.status === "rejected" ? "var(--red)" : "var(--amber)";
                    return (
                      <tr key={cr.id} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                        <td style={{ padding: "10px", fontWeight: 700, color: "var(--cyan)" }}>{cr.id}</td>
                        <td style={{ padding: "10px" }}>{cr.description}</td>
                        <td style={{ padding: "10px", color: "var(--amber)" }}>{cr.impact}</td>
                        <td style={{ padding: "10px", color: "var(--text2)" }}>{cr.requestor}</td>
                        <td style={{ padding: "10px" }}>
                          <span style={{
                            padding: "2px 10px",
                            borderRadius: 10,
                            background: `${statusColor}20`,
                            color: statusColor,
                            fontWeight: 600,
                            fontSize: "0.72rem",
                          }}>
                            {cr.status === "approved" ? "已批准" : cr.status === "rejected" ? "已拒绝" : "待审批"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Sidebar Panels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* AI Summary */}
            {aiSummary && (
              <div style={{
                background: "var(--surface)",
                border: "1px solid rgba(6,182,212,0.3)",
                borderRadius: "var(--radius)",
                padding: "18px 20px",
              }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--cyan)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  🤖 AI状态摘要
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.6, marginBottom: 12 }}>
                  {aiSummary.summary}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase" }}>⚠️ 风险</div>
                  {aiSummary.risks.map((r, i) => (
                    <div key={i} style={{ fontSize: "0.8rem", color: "var(--red)", paddingLeft: 10, borderLeft: "2px solid var(--red)", marginBottom: 4 }}>
                      {r}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text2)", marginBottom: 6, textTransform: "uppercase" }}>💡 建议</div>
                  {aiSummary.recommendations.map((r, i) => (
                    <div key={i} style={{ fontSize: "0.8rem", color: "var(--green)", paddingLeft: 10, borderLeft: "2px solid var(--green)", marginBottom: 4 }}>
                      {r}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Standup */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "18px 20px",
            }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                📋 今日站会摘要
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginBottom: 4 }}>今日任务: {tasks.filter(t => t.status === 'in-progress').length}个进行中</div>
                <div style={{ fontSize: "0.72rem", color: "var(--red)" }}>
                  阻塞: {blockedTasks.length}个
                  {blockedTasks.length > 0 && (
                    <span style={{ marginLeft: 6 }}>
                      — {blockedTasks.map(t => t.name).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tasks.filter(t => t.status === 'in-progress').map((task) => (
                  <div key={task.id} style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "8px 12px",
                  }}>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 4 }}>{task.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text2)" }}>
                      {task.assignee} · {task.progress}% · {task.dueDate}截止
                    </div>
                    <div style={{
                      marginTop: 6,
                      height: 4,
                      background: "var(--surface)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${task.progress}%`,
                        background: "var(--cyan)",
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Workload */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "18px 20px",
            }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                👥 团队工作负载
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {teamWorkload.map((w: TeamWorkload) => (
                  <div key={w.member} style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{w.member}</span>
                      <span style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        color: w.utilization > 80 ? "var(--red)" : w.utilization > 50 ? "var(--amber)" : "var(--green)",
                      }}>
                        {w.utilization}%
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: "0.68rem", color: "var(--text2)" }}>
                        共{w.taskCount}个任务
                      </span>
                      {w.blockedCount > 0 && (
                        <span style={{ fontSize: "0.68rem", color: "var(--red)" }}>
                          ⚠ {w.blockedCount}阻塞
                        </span>
                      )}
                    </div>
                    <div style={{ height: 6, background: "var(--surface)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        width: `${w.utilization}%`,
                        background: w.utilization > 80 ? "var(--red)" : w.utilization > 50 ? "var(--amber)" : "var(--green)",
                        borderRadius: 3,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deliverables Tracking */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "18px 20px",
            }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                📦 交付物追踪
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {deliverables.map((d: Deliverable) => {
                  const statusColor = d.status === "accepted" ? "var(--green)" : d.status === "ready" ? "var(--cyan)" : d.status === "rejected" ? "var(--red)" : "var(--text2)";
                  return (
                    <div key={d.id} style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "10px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: statusColor, fontSize: "0.7rem" }}>{deliverableStatusIcon(d.status)}</span>
                        <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{d.name}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text2)" }}>
                        <span>{d.status === "accepted" ? "已验收" : d.status === "ready" ? "待验收" : d.status === "in-progress" ? "进行中" : "待开始"}</span>
                        {d.qualityCheck && (
                          <span style={{ color: d.qualityCheck === "通过" ? "var(--green)" : "var(--amber)" }}>
                            质检: {d.qualityCheck}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
