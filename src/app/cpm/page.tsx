"use client";

import Link from "next/link";
import { useState } from "react";
import { calculateCPM, type Task } from "@/lib/cpm";
import { buildCriticalPathNetworkLayout } from "@/lib/cpm-network";

interface AIMindedTask extends Task {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  isCritical: boolean;
}

type CPMResultTask = AIMindedTask;

interface CPMApiResponse {
  tasks?: AIMindedTask[];
  criticalPath?: string[];
  projectDuration?: number;
  reasoning?: string;
  aiWarning?: string;
  error?: string;
}

function CriticalPathNetwork({
  tasks,
  criticalPath,
}: {
  tasks: CPMResultTask[];
  criticalPath: string[];
}) {
  if (tasks.length === 0) return null;

  const sortedTasks = [...tasks].sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
  const layout = buildCriticalPathNetworkLayout(sortedTasks, criticalPath);

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "24px",
      marginBottom: 24,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            🕸️ 关键路径网络图
          </div>
          <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.78rem" }}>
            按依赖层级从左到右排布；折线在节点间的空白通道内绕行，红色节点和红色连线表示关键路径。
          </div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: "0.75rem", color: "var(--text2)", flexShrink: 0 }}>
          <span><span style={{ color: "var(--red)" }}>●</span> 关键活动</span>
          <span><span style={{ color: "var(--accent)" }}>●</span> 非关键活动</span>
        </div>
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 8 }}>
        <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="关键路径网络图">
          <defs>
            <marker id="arrow-critical" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L10,4 z" fill="var(--red)" />
            </marker>
            <marker id="arrow-normal" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,8 L10,4 z" fill="var(--text2)" />
            </marker>
          </defs>
          {layout.edges.map(edge => (
            <path
              key={`${edge.fromId}-${edge.toId}`}
              d={edge.path}
              fill="none"
              stroke={edge.isCritical ? "var(--red)" : "var(--text2)"}
              strokeWidth={edge.isCritical ? 2.6 : 1.4}
              strokeOpacity={edge.isCritical ? 0.95 : 0.48}
              markerEnd={edge.isCritical ? "url(#arrow-critical)" : "url(#arrow-normal)"}
            />
          ))}
          {sortedTasks.map(task => {
            const pos = layout.positions.get(task.id)!;
            return (
              <g key={task.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <title>{`${task.id} ${task.name}，工期 ${task.duration} 天，ES ${task.es}，EF ${task.ef}，LS ${task.ls}，LF ${task.lf}`}</title>
                <rect
                  width={layout.nodeWidth}
                  height={layout.nodeHeight}
                  rx="10"
                  fill={task.isCritical ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.1)"}
                  stroke={task.isCritical ? "var(--red)" : "var(--accent)"}
                  strokeWidth={task.isCritical ? 2 : 1.4}
                />
                <text x="14" y="20" fill={task.isCritical ? "var(--red)" : "var(--accent2)"} fontSize="13" fontWeight="800">
                  {task.id}
                </text>
                <text x="44" y="20" fill="var(--text)" fontSize="12" fontWeight="700">
                  {task.name.length > 12 ? `${task.name.slice(0, 12)}…` : task.name}
                </text>
                <text x="14" y="42" fill="var(--text2)" fontSize="11">
                  ES {task.es} / EF {task.ef} · {task.duration}天
                </text>
                <text x="14" y="58" fill="var(--text2)" fontSize="10">
                  LS {task.ls} / LF {task.lf} · 浮动 {task.totalFloat}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function CPMPage() {
  const [tasks, setTasks] = useState<Task[]>([
    { id: "A", name: "项目启动与规划", duration: 5, predecessors: [] },
    { id: "B", name: "需求分析与设计", duration: 8, predecessors: ["A"] },
    { id: "C", name: "开发阶段一", duration: 15, predecessors: ["B"] },
    { id: "D", name: "开发阶段二", duration: 10, predecessors: ["B"] },
    { id: "E", name: "测试与集成", duration: 7, predecessors: ["C", "D"] },
    { id: "F", name: "用户验收测试", duration: 5, predecessors: ["E"] },
    { id: "G", name: "部署与上线", duration: 3, predecessors: ["F"] },
  ]);

  const [result, setResult] = useState<ReturnType<typeof calculateCPM> | null>(null);
  const [aiResult, setAiResult] = useState<AIMindedTask[] | null>(null);
  const [aiCriticalPath, setAiCriticalPath] = useState<string[]>([]);
  const [aiProjectDuration, setAiProjectDuration] = useState<number>(0);
  const [aiReasoning, setAiReasoning] = useState<string>("");
  const [aiWarning, setAiWarning] = useState<string>("");
  const [isCalculatingAI, setIsCalculatingAI] = useState(false);
  const [useAI, setUseAI] = useState(false);

  const handleAddTask = () => {
    const newId = String.fromCharCode(65 + tasks.length);
    setTasks([...tasks, { id: newId, name: `新任务${newId}`, duration: 5, predecessors: [] }]);
  };

  const handleUpdateTask = (id: string, field: keyof Task, value: unknown) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id).map(t => ({
      ...t,
      predecessors: t.predecessors.filter(p => p !== id),
    })));
  };

  const handleCalculate = () => {
    const res = calculateCPM(tasks);
    setResult(res);
    setAiWarning("");
  };

  const handleAICalculate = async () => {
    setIsCalculatingAI(true);
    try {
      const response = await fetch("/api/cpm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      const data = await response.json() as CPMApiResponse;
      if (!response.ok && !data.tasks) {
        throw new Error(data.error || `HTTP_${response.status}`);
      }
      if (!Array.isArray(data.tasks) || !Array.isArray(data.criticalPath) || typeof data.projectDuration !== "number") {
        throw new Error(data.error || "关键路径接口返回数据不完整");
      }
      setAiResult(data.tasks);
      setAiCriticalPath(data.criticalPath);
      setAiProjectDuration(data.projectDuration);
      setAiReasoning(data.reasoning || "");
      setAiWarning(data.aiWarning || "");
    } catch (error) {
      alert("AI计算失败: " + (error instanceof Error ? error.message : "未知错误"));
    } finally {
      setIsCalculatingAI(false);
    }
  };

  const displayedTasks = (useAI ? aiResult : result?.tasks) as CPMResultTask[] | undefined;
  const displayedCriticalPath = (useAI ? aiCriticalPath : result?.criticalPath) ?? [];

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
        <span style={{ fontWeight: 700 }}>🔗 关键路径计算</span>
        <span className="tag tag-purple" style={{ fontSize: "0.7rem" }}>本地算法</span>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", cursor: "pointer", marginLeft: 8 }}>
          <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
          <span style={{ color: useAI ? "var(--purple)" : "var(--text2)" }}>AI增强</span>
        </label>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1000, margin: "0 auto", width: "100%" }}>
        {/* Input Section */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "28px",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              任务列表
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn-secondary" onClick={handleAddTask} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                + 添加任务
              </button>
              {useAI ? (
                <button className="btn-primary" onClick={handleAICalculate} disabled={isCalculatingAI} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                  {isCalculatingAI ? "🤖 AI计算中..." : "🤖 AI计算关键路径"}
                </button>
              ) : (
                <button className="btn-primary" onClick={handleCalculate} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                  🔗 计算关键路径
                </button>
              )}
            </div>
          </div>

          {/* Task Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--accent2)", fontWeight: 600 }}>ID</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--accent2)", fontWeight: 600 }}>任务名称</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "var(--accent2)", fontWeight: 600 }}>工期(天)</th>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--accent2)", fontWeight: 600 }}>前置任务</th>
                  <th style={{ textAlign: "center", padding: "8px 12px", color: "var(--accent2)", fontWeight: 600 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(task => (
                  <tr key={task.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700, color: "var(--accent2)" }}>
                      {task.id}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <input
                        className="input"
                        value={task.name}
                        onChange={e => handleUpdateTask(task.id, "name", e.target.value)}
                        style={{ fontSize: "0.85rem", padding: "6px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <input
                        className="input"
                        type="number"
                        value={task.duration}
                        onChange={e => handleUpdateTask(task.id, "duration", parseInt(e.target.value) || 0)}
                        style={{ width: 80, textAlign: "center", fontSize: "0.85rem", padding: "6px 10px" }}
                      />
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {tasks
                          .filter(t => t.id !== task.id)
                          .map(t => (
                            <label
                              key={t.id}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                fontSize: "0.75rem",
                                cursor: "pointer",
                                background: task.predecessors.includes(t.id) ? "rgba(59,130,246,0.2)" : "var(--surface2)",
                                color: task.predecessors.includes(t.id) ? "var(--accent2)" : "var(--text2)",
                                border: `1px solid ${task.predecessors.includes(t.id) ? "var(--accent)" : "var(--border)"}`,
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={task.predecessors.includes(t.id)}
                                onChange={e => {
                                  const new_preds = e.target.checked
                                    ? [...task.predecessors, t.id]
                                    : task.predecessors.filter(p => p !== t.id);
                                  handleUpdateTask(task.id, "predecessors", new_preds);
                                }}
                                style={{ display: "none" }}
                              />
                              {t.id}
                            </label>
                          ))}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--red)",
                          color: "var(--red)",
                          borderRadius: 6,
                          padding: "4px 10px",
                          cursor: "pointer",
                          fontSize: "0.75rem",
                        }}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {useAI && aiWarning && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(245,158,11,0.35)", background: "rgba(245,158,11,0.1)", color: "var(--amber)", fontSize: "0.78rem", lineHeight: 1.5 }}>
              {aiWarning}
            </div>
          )}
        </div>

        {/* Results */}
        {(result || aiResult) && (
          <>
            {/* Summary Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--accent2)" }}>{useAI ? aiProjectDuration : result?.projectDuration}</div>
                <div className="stat-label">项目总工期（天）</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--purple)" }}>{(useAI ? aiCriticalPath : result?.criticalPath)?.length}</div>
                <div className="stat-label">关键路径任务数</div>
              </div>
              <div className="stat-card">
                <div className="stat-num" style={{ color: "var(--green)" }}>{useAI ? "🤖" : "✓"}</div>
                <div className="stat-label">{useAI ? "AI计算完成" : "CPM计算完成"}</div>
              </div>
            </div>

            {/* Critical Path */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
              marginBottom: 24,
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🔴 关键路径
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {(useAI ? aiCriticalPath : result?.criticalPath)?.map((id, i) => {
                  const task = (useAI ? aiResult : result?.tasks)?.find(t => t.id === id);
                  const cp = useAI ? aiCriticalPath : result?.criticalPath;
                  return (
                    <div key={id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid var(--red)",
                        borderRadius: 8,
                        padding: "10px 16px",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}>
                        <span style={{ fontWeight: 800, color: "var(--red)", fontFamily: "monospace" }}>{id}</span>
                        <span style={{ fontSize: "0.85rem", color: "var(--text)" }}>{task?.name}</span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text2)" }}>{task?.duration}天</span>
                      </div>
                      {cp && i < cp.length - 1 && (
                        <span style={{ color: "var(--border)", fontSize: "1.2rem" }}>→</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {displayedTasks && (
              <CriticalPathNetwork tasks={displayedTasks} criticalPath={displayedCriticalPath} />
            )}

            {/* AI Reasoning */}
            {useAI && aiReasoning && (
              <div style={{
                background: "var(--surface)",
                border: "1px solid var(--purple)",
                borderRadius: "var(--radius)",
                padding: "24px",
                marginBottom: 24,
              }}>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--purple)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  🤖 AI推理过程
                </div>
                <div style={{ fontSize: "0.85rem", color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {aiReasoning}
                </div>
              </div>
            )}

            {/* Task Schedule Table */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "24px",
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                完整时间表
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["任务ID", "任务名称", "工期", "ES早开", "EF早完", "LS晚开", "LF晚完", "总浮动", "关键?"].map(h => (
                        <th key={h} style={{ textAlign: "center", padding: "8px 10px", color: "var(--accent2)", fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(useAI ? aiResult : result?.tasks)?.map(task => (
                      <tr
                        key={task.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: task.isCritical ? "rgba(239,68,68,0.05)" : undefined,
                        }}
                      >
                        <td style={{ padding: "8px 10px", textAlign: "center", fontFamily: "monospace", fontWeight: 700, color: task.isCritical ? "var(--red)" : "var(--accent2)" }}>
                          {task.id}
                        </td>
                        <td style={{ padding: "8px 10px" }}>{task.name}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>{task.duration}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--green)" }}>{task.es}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--green)" }}>{task.ef}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--amber)" }}>{task.ls}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: "var(--amber)" }}>{task.lf}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center", color: task.totalFloat === 0 ? "var(--text2)" : "var(--text2)" }}>{task.totalFloat}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          {task.isCritical ? (
                            <span style={{ color: "var(--red)", fontWeight: 700 }}>🔴</span>
                          ) : (
                            <span style={{ color: "var(--green)", fontSize: "0.8rem" }}>{task.totalFloat}天</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Gantt Chart */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: "0.8rem", color: "var(--text2)" }}>甘特图预览（0-{useAI ? aiProjectDuration : result?.projectDuration}天）</div>
                  <div style={{ display: "flex", gap: 16, fontSize: "0.75rem" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 12, height: 12, background: "var(--red)", borderRadius: 2, display: "inline-block" }}></span>
                      关键路径
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 12, height: 12, background: "var(--accent)", borderRadius: 2, display: "inline-block" }}></span>
                      非关键
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowX: "auto", paddingBottom: 8 }}>
                  {(useAI ? aiResult : result?.tasks)?.map(task => {
                    const es = task.es ?? 0;
                    const ef = task.ef ?? task.duration;
                    const projectDuration = useAI ? aiProjectDuration : (result?.projectDuration ?? 1);
                    const barWidth = Math.max((ef - es) / projectDuration * 100, 2);
                    const barLeft = es / projectDuration * 100;
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 600 }}>
                        <div style={{ width: 50, fontSize: "0.75rem", color: task.isCritical ? "var(--red)" : "var(--text2)", fontFamily: "monospace", flexShrink: 0 }}>
                          {task.id}
                        </div>
                        <div style={{ flex: 1, height: 24, background: "var(--surface2)", borderRadius: 4, position: "relative", overflow: "hidden", minWidth: 300 }}>
                          <div style={{
                            position: "absolute",
                            left: `${barLeft}%`,
                            width: `${barWidth}%`,
                            top: 2,
                            bottom: 2,
                            background: task.isCritical ? "var(--red)" : "var(--accent)",
                            borderRadius: 4,
                            opacity: 0.85,
                          }} />
                        </div>
                        <div style={{ width: 70, fontSize: "0.72rem", color: "var(--text2)", flexShrink: 0, textAlign: "right" }}>
                          {es}-{ef}天
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Time axis */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text2)", marginTop: 4, paddingLeft: 58, minWidth: 600 }}>
                  {Array.from({ length: 9 }, (_, i) => {
                    const val = Math.round(i * (useAI ? aiProjectDuration : (result?.projectDuration ?? 43)) / 8);
                    return <span key={i}>{val}d</span>;
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
