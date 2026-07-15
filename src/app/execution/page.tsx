"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AiEvidence, AiSuggestedAction } from "@/features/ai/evidence";
import {
  readStoredBusinessContext,
  readStoredCurrentProject,
  readStoredDataClass,
  loadCurrentBusinessContextSearchParams,
  buildProjectControlWriteContract,
} from "@/features/operating-model/client-context";
import {
  Task,
  Deliverable,
  ChangeRequest,
  TeamWorkload,
  calculateTeamWorkload,
  getBlockedTasks,
  calculateProgress,
} from "@/lib/execution";

type ExecutionSourceState = {
  status: "loading" | "ready" | "unavailable";
  detail: string;
  warnings: string[];
};

export default function ExecutionPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [source, setSource] = useState<ExecutionSourceState>({ status: "loading", detail: "正在读取当前项目的飞书任务和交付物。", warnings: [] });
  const [aiSummary, setAiSummary] = useState<{
    summary: string;
    risks: string[];
    recommendations: string[];
    evidence?: AiEvidence;
  } | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savingEvidenceAction, setSavingEvidenceAction] = useState<string | null>(null);

  const loadExecutionData = useCallback(async () => {
    const context = readStoredBusinessContext();
    const currentProject = readStoredCurrentProject();
    const dataClass = readStoredDataClass();
    setProjectId(currentProject);
    setAiSummary(null);
    if (!context?.businessRole || !currentProject) {
      setTasks([]); setDeliverables([]); setChangeRequests([]); setProjectName("");
      setSource({ status: "unavailable", detail: "请先在顶部业务上下文中选择已授权的项目和项目经理/运营/PMO角色。", warnings: [] });
      return;
    }
    setSource({ status: "loading", detail: "正在读取飞书事实、Supabase镜像与人工治理记录。", warnings: [] });
    const params = new URLSearchParams({ project_id: currentProject, business_role: context.businessRole, data_class: dataClass });
    try {
      const response = await fetch(`/api/execution?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as {
        tasks?: Task[];
        deliverables?: Deliverable[];
        change_requests?: ChangeRequest[];
        project?: { name?: string };
        source?: { detail?: string; warnings?: string[] };
        detail?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.detail || payload.error || "执行数据读取失败");
      setTasks(Array.isArray(payload.tasks) ? payload.tasks : []);
      setDeliverables(Array.isArray(payload.deliverables) ? payload.deliverables : []);
      setChangeRequests(Array.isArray(payload.change_requests) ? payload.change_requests : []);
      setProjectName(payload.project?.name || "当前项目");
      setSource({ status: "ready", detail: payload.source?.detail || "已读取真实数据源。", warnings: payload.source?.warnings?.filter(Boolean) || [] });
    } catch (error) {
      setTasks([]); setDeliverables([]); setChangeRequests([]); setProjectName("");
      setSource({ status: "unavailable", detail: error instanceof Error ? error.message : "执行数据源不可用。", warnings: [] });
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadExecutionData(), 0);
    const reload = () => void loadExecutionData();
    window.addEventListener("ai-pmo:project-context-changed", reload);
    window.addEventListener("ai-pmo:business-context-changed", reload);
    window.addEventListener("ai-pmo:data-class-changed", reload);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("ai-pmo:project-context-changed", reload);
      window.removeEventListener("ai-pmo:business-context-changed", reload);
      window.removeEventListener("ai-pmo:data-class-changed", reload);
    };
  }, [loadExecutionData]);

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
          ...buildProjectControlWriteContract("generate_summary", 0),
          operation: "generate_summary",
        }),
      });
      if (!res.ok) throw new Error("AI summary request failed");
      const data = await res.json();
      setAiSummary({
        summary: typeof data.summary === "string" ? data.summary : "当前执行数据已完成分析，但AI返回格式不完整。",
        risks: Array.isArray(data.risks) ? data.risks : ["AI返回格式异常，请人工复核阻塞任务和交付物状态。"],
        recommendations: Array.isArray(data.recommendations) ? data.recommendations : ["优先处理阻塞任务，并补齐交付物验收责任人。"],
        evidence: data.evidence,
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

  const convertEvidenceAction = async (action: AiSuggestedAction, index: number) => {
    if (!aiSummary?.evidence) return;
    const actionKey = `${aiSummary.evidence.id}-${index}`;
    setSavingEvidenceAction(actionKey);
    setMessage(null);
    try {
      const businessContext = await loadCurrentBusinessContextSearchParams();
      const response = await fetch(`/api/issue-change?${businessContext.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildProjectControlWriteContract("create_action", 0),
          operation: "create_action",
          title: action.title,
          owner: action.owner || "项目经理",
          dueDate: action.dueDate,
          priority: action.priority,
          projectName: "执行与交付",
          sourceType: "manual",
          sourceId: aiSummary.evidence.id,
          sourceReason: action.sourceReason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { action?: { id?: string }; error?: string; migrationHint?: string };
      if (!response.ok || !payload.action) throw new Error([payload.error, payload.migrationHint].filter(Boolean).join("；") || "行动项创建失败");
      setMessage(`已转为问题/变更行动项：${payload.action.id || action.title}`);
    } catch (e: unknown) {
      setMessage(`行动项创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSavingEvidenceAction(null);
    }
  };

  const createExecutionRecord = async (operation: "create_task" | "create_deliverable") => {
    const context = readStoredBusinessContext();
    const dataClass = readStoredDataClass();
    if (!context?.businessRole || !projectId) {
      setMessage("请先选择已授权的当前项目和业务角色。");
      return;
    }
    const name = window.prompt(operation === "create_task" ? "请输入任务名称" : "请输入交付物名称");
    if (!name?.trim()) return;
    setMessage(operation === "create_task" ? "正在写入飞书任务表…" : "正在写入飞书里程碑表…");
    try {
      const response = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildProjectControlWriteContract(operation, 0),
          operation,
          project_id: projectId,
          business_role: context.businessRole,
          data_class: dataClass,
          name: name.trim(),
        }),
      });
      const payload = await response.json() as { record_id?: string; detail?: string; error?: string };
      if (!response.ok || !payload.record_id) throw new Error(payload.detail || payload.error || "写入飞书失败");
      setMessage(`已写入飞书，记录ID：${payload.record_id}`);
      await loadExecutionData();
    } catch (error) {
      setMessage(`创建失败：${error instanceof Error ? error.message : "数据源不可用"}`);
    }
  };

  const baselineProgress: number | null = null;
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
        <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.85rem" }}>← 返回首页</Link>
        <span style={{ color: "var(--border)" }}>|</span>
        <span style={{ fontWeight: 700 }}>⚡ 执行与交付</span>
        <span className="tag" style={{ background: "rgba(6,182,212,0.15)", color: "var(--cyan)", border: "1px solid rgba(6,182,212,0.3)" }}>
          执行追踪
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
          <button
            onClick={requestAiSummary}
            disabled={loadingAI || source.status !== "ready" || (tasks.length === 0 && deliverables.length === 0)}
            style={{
              padding: "7px 16px",
              borderRadius: 8,
              border: "1px solid rgba(6,182,212,0.4)",
              background: loadingAI ? "rgba(6,182,212,0.1)" : "rgba(6,182,212,0.15)",
              color: "var(--cyan)",
              fontSize: "0.82rem",
              fontWeight: 600,
              cursor: loadingAI || source.status !== "ready" || (tasks.length === 0 && deliverables.length === 0) ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {loadingAI ? "⏳ 分析中..." : "🤖 AI状态摘要"}
          </button>
          <button onClick={() => void createExecutionRecord("create_task")} disabled={source.status !== "ready"} style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: source.status === "ready" ? "pointer" : "not-allowed",
          }}>
            + 添加任务
          </button>
          <button onClick={() => void createExecutionRecord("create_deliverable")} disabled={source.status !== "ready"} style={{
            padding: "7px 16px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface2)",
            color: "var(--text)",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: source.status === "ready" ? "pointer" : "not-allowed",
          }}>
            + 添加交付物
          </button>
        </div>
      </header>

      <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%" }}>
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: source.status === "ready" ? "rgba(16,185,129,0.08)" : source.status === "loading" ? "rgba(59,130,246,0.08)" : "rgba(245,158,11,0.1)",
          border: `1px solid ${source.status === "ready" ? "rgba(16,185,129,0.25)" : source.status === "loading" ? "rgba(59,130,246,0.25)" : "rgba(245,158,11,0.3)"}`,
          color: source.status === "ready" ? "var(--green)" : source.status === "loading" ? "var(--accent)" : "var(--amber)",
          fontSize: "0.82rem",
          lineHeight: 1.6,
        }}>
          <strong>{projectName ? `${projectName} · ` : ""}{source.status === "ready" ? "真实数据已连接" : source.status === "loading" ? "数据读取中" : "数据源不可用"}</strong>
          <span style={{ marginLeft: 8 }}>{source.detail}</span>
          {source.warnings.map(warning => <div key={warning}>⚠ {warning}</div>)}
        </div>
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
                基线: {baselineProgress === null ? "未录入" : `${baselineProgress}%`}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 24, background: "var(--surface2)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
              {/* Baseline marker */}
              {baselineProgress !== null && <div style={{
                position: "absolute",
                left: `${baselineProgress}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: "var(--text2)",
                zIndex: 2,
              }} />}
              {/* Current progress */}
              <div style={{
                height: "100%",
                width: `${currentProgress}%`,
                background: baselineProgress !== null && currentProgress >= baselineProgress
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
              background: baselineProgress === null ? "rgba(148,163,184,0.12)" : currentProgress >= baselineProgress ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
              color: baselineProgress === null ? "var(--text2)" : currentProgress >= baselineProgress ? "var(--green)" : "var(--amber)",
              fontSize: "0.78rem",
              fontWeight: 700,
            }}>
              {baselineProgress === null ? "基线未录入" : currentProgress >= baselineProgress ? "正常" : "落后"}
            </div>
          </div>
          {/* Mini Gantt bars */}
          <div style={{ display: "flex", gap: 4, marginTop: 14, height: 20 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((day) => {
              const isBaseline = false;
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
                  border: "none",
                }} />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.68rem", color: "var(--text2)", marginTop: 4 }}>
            <span>Day 1</span>
            <span>计划基线未接入</span>
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
                {aiSummary.evidence && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(6,182,212,0.22)" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text2)", marginBottom: 8, textTransform: "uppercase" }}>依据与审计</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text2)", lineHeight: 1.6, marginBottom: 8 }}>
                      {aiSummary.evidence.inputSummary}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                      <span className="tag" style={{ background: "rgba(6,182,212,0.15)", color: "var(--cyan)" }}>{aiSummary.evidence.model}</span>
                      <span className="tag" style={{ background: "rgba(139,92,246,0.14)", color: "var(--purple)" }}>{aiSummary.evidence.status}</span>
                      <span className="tag" style={{ background: "rgba(245,158,11,0.14)", color: "var(--amber)" }}>{aiSummary.evidence.confidence}</span>
                    </div>
                    {aiSummary.evidence.basis.map(item => (
                      <div key={`${item.source}-${item.label}`} style={{ fontSize: "0.76rem", color: "var(--text2)", lineHeight: 1.5, marginBottom: 4 }}>
                        <strong style={{ color: "var(--text)" }}>{item.label}：</strong>{item.detail}
                      </div>
                    ))}
                    {aiSummary.evidence.suggestedActions.map((action, index) => {
                      const actionKey = `${aiSummary.evidence!.id}-${index}`;
                      return (
                        <div key={action.title} style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(16,185,129,0.08)", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: "0.76rem", color: "var(--text2)", lineHeight: 1.5 }}>
                            <strong style={{ color: "var(--green)" }}>{action.priority}</strong> · {action.title} · {action.owner || "待定"} · {action.dueDate || "待定"}
                          </span>
                          <button className="btn-secondary" onClick={() => void convertEvidenceAction(action, index)} disabled={savingEvidenceAction === actionKey} style={{ fontSize: "0.7rem", padding: "4px 8px", whiteSpace: "nowrap" }}>
                            {savingEvidenceAction === actionKey ? "转入中..." : "转行动项"}
                          </button>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 8, fontSize: "0.75rem", color: aiSummary.evidence.auditStatus === "succeeded" ? "var(--green)" : "var(--amber)" }}>
                      审计状态：{aiSummary.evidence.auditStatus || "待写入"}
                      {aiSummary.evidence.auditId ? ` · ${aiSummary.evidence.auditId}` : ""}
                      {aiSummary.evidence.auditWarning ? ` · ${aiSummary.evidence.auditWarning}` : ""}
                    </div>
                  </div>
                )}
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
