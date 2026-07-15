"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeishuConfirmationInlinePanelClient } from "@/components/FeishuConfirmationInlinePanelClient";
import { IntegrationStatusPanelClient } from "@/components/IntegrationStatusPanelClient";
import {
  REPORT_TYPE_LABELS,
  TONE_LABELS,
  estimateReadingTime,
  type GeneratedReport,
  type ReportActionItem,
  type ReportDataSource,
  type ReportRequest,
  type ReportType,
} from "@/lib/reports";
import { buildProjectControlWriteContract, loadCurrentBusinessContextSearchParams, writeStoredCurrentProject } from "@/features/operating-model/client-context";

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label">{label}</label>
      {children}
      {hint && <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

function SectionCard({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="card" style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: "0.92rem", fontWeight: 800 }}>{title}</h2>
        {hint && <p style={{ margin: "6px 0 0", color: "var(--text2)", fontSize: "0.78rem", lineHeight: 1.6 }}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function SourceBadge({ source }: { source: ReportDataSource }) {
  const color = source.source === "feishu" ? "var(--green)" : source.source === "fallback" ? "var(--amber)" : source.source === "ai" ? "var(--purple)" : "var(--accent2)";
  return (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 800, color, marginBottom: 4 }}>{source.label}</div>
      <div style={{ color: "var(--text2)", fontSize: "0.76rem", lineHeight: 1.55 }}>{source.detail}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("weekly");
  const [projectName, setProjectName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectOptions, setProjectOptions] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [dateRange, setDateRange] = useState(defaultDateRange);
  const [completedWork, setCompletedWork] = useState("");
  const [nextPlans, setNextPlans] = useState("");
  const [issues, setIssues] = useState("");
  const [resourceNeeds, setResourceNeeds] = useState("");
  const [tone, setTone] = useState<ReportRequest["tone"]>("formal");
  const [loading, setLoading] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<GeneratedReport | null>(null);
  const [reportHistory, setReportHistory] = useState<GeneratedReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setHistoryLoading(true);
      try {
        const businessContext = await loadCurrentBusinessContextSearchParams();
        const contextResponse = await fetch(`/api/context/current?${businessContext.toString()}`, { cache: "no-store" });
        const contextBody = await contextResponse.json() as { available_projects?: Array<{ id: string; name: string; code: string | null }> };
        if (!contextResponse.ok) throw new Error("无法读取项目清单。");
        const projects = contextBody.available_projects ?? [];
        const projectId = businessContext.get("project_id") || projects[0]?.id || "";
        const project = projects.find(item => item.id === projectId) ?? projects[0];
        if (!active) return;
        setProjectOptions(projects);
        setSelectedProjectId(project?.id || "");
        setProjectName(project?.name || "");
        if (project?.id) businessContext.set("project_id", project.id);
        const historyResponse = await fetch(`/api/reports?${businessContext.toString()}`, { cache: "no-store" });
        const historyBody = await historyResponse.json() as { reports?: GeneratedReport[]; detail?: string; error?: string };
        if (!historyResponse.ok) throw new Error(historyBody.detail || historyBody.error || "无法读取正式历史。");
        if (active) setReportHistory(historyBody.reports ?? []);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "无法读取报告中心。");
      } finally {
        if (active) setHistoryLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  async function refreshHistory(params: URLSearchParams) {
    const response = await fetch(`/api/reports?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json() as { reports?: GeneratedReport[]; error?: string; detail?: string };
    if (!response.ok) throw new Error(payload.detail || payload.error || "正式历史刷新失败。");
    setReportHistory(payload.reports ?? []);
  }

  async function handleGenerate() {
    if (reportType !== "monthly" && (!selectedProjectId || !projectName.trim())) {
      setError("请先选择已授权项目。");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    setGeneratedReport(null);
    const request: ReportRequest = {
      type: reportType,
      projectName: reportType === "monthly" ? "当前业务身份项目组合" : projectName,
      dateRange: dateRange.start && dateRange.end ? dateRange : undefined,
      completedWork,
      nextPlans,
      issues,
      resourceNeeds,
      tone,
    };
    try {
      const businessContext = await loadCurrentBusinessContextSearchParams();
      if (reportType === "monthly") businessContext.delete("project_id");
      else businessContext.set("project_id", selectedProjectId);
      const response = await fetch(`/api/reports?${businessContext.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const data = await response.json() as { success?: boolean; report?: GeneratedReport; error?: string; detail?: string; formal_output_id?: string; reporting_snapshot_id?: string };
      if (!response.ok || !data.success || !data.report) throw new Error(data.detail || data.error || "报告生成失败。");
      setGeneratedReport(data.report);
      await refreshHistory(businessContext);
      setMessage(`报告已生成并留存为正式草稿 V${data.report.version || 1}，同时建立汇报快照。`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "报告生成失败。");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard() {
    if (!generatedReport) return;
    await navigator.clipboard.writeText(generatedReport.content);
    setMessage("报告内容已复制。");
  }

  async function convertAction(action: ReportActionItem, index: number) {
    if (!generatedReport) return;
    const key = `${generatedReport.id}-${index}`;
    setSavingAction(key);
    setMessage("");
    try {
      const businessContext = await loadCurrentBusinessContextSearchParams();
      businessContext.set("project_id", selectedProjectId);
      const response = await fetch(`/api/issue-change?${businessContext.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildProjectControlWriteContract("create_action", 0),
          operation: "create_action",
          title: action.title,
          owner: action.owner,
          dueDate: action.dueDate,
          priority: action.priority,
          projectName: generatedReport.projectName,
          sourceType: "manual",
          sourceId: generatedReport.id,
          sourceReason: action.sourceReason,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { status?: string; action?: { title?: string }; warning?: string };
      if (!response.ok || payload.status !== "succeeded") throw new Error(payload.warning || "行动项创建失败。");
      setMessage(`已转入统一行动项：${payload.action?.title || action.title}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "行动项创建失败。");
    } finally {
      setSavingAction(null);
    }
  }

  const evidence = generatedReport?.evidence;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
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
        <strong style={{ color: "var(--cyan)" }}>📝 报告工厂与会议闭环</strong>
        <span className="tag" style={{ background: "rgba(6,182,212,0.15)", color: "var(--cyan)" }}>P8</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link href="/workbench" className="btn-secondary" style={{ textDecoration: "none" }}>工作台</Link>
          <Link href="/finance" className="btn-secondary" style={{ textDecoration: "none" }}>经营驾驶舱</Link>
          <Link href="/issue-change" className="btn-secondary" style={{ textDecoration: "none" }}>行动项</Link>
        </div>
      </header>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 32px" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.45rem", fontWeight: 900 }}>报告不只是生成文本，要能追溯数据并驱动行动</h1>
          <p style={{ margin: 0, color: "var(--text2)", fontSize: "0.88rem", lineHeight: 1.7 }}>
            P8 报告工厂会引用项目台账、业财驾驶舱、风险/回款数据和用户输入；会议纪要中的待办可以转入统一行动项闭环。
          </p>
        </div>

        <IntegrationStatusPanelClient moduleName="报告工厂" />
        <FeishuConfirmationInlinePanelClient moduleName="报告工厂" />

        {(message || error) && (
          <div style={{
            marginBottom: 20,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${error ? "rgba(239,68,68,0.35)" : "rgba(16,185,129,0.28)"}`,
            background: error ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
            color: error ? "var(--red)" : "var(--green)",
            fontSize: "0.82rem",
          }}>
            {error || message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 22, alignItems: "start" }}>
          <div>
            <SectionCard title="报告输入" hint="用户录入是报告的重要输入；系统数据只提供事实和预警，正式报告仍需人工复核。">
              <Field label="报告类型">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                  {(["weekly", "monthly", "progress", "meeting", "acceptance"] as ReportType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setReportType(type)}
                      style={{
                        padding: "10px 8px",
                        borderRadius: 8,
                        border: `1px solid ${reportType === type ? "var(--cyan)" : "var(--border)"}`,
                        background: reportType === type ? "rgba(6,182,212,0.12)" : "var(--surface2)",
                        color: reportType === type ? "var(--cyan)" : "var(--text)",
                        cursor: "pointer",
                        fontWeight: reportType === type ? 800 : 500,
                      }}
                    >
                      {REPORT_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
              </Field>

              {reportType === "monthly" ? (
                <Field label="汇报范围" hint="月报按当前组合/组织业务身份汇总，不会被某一个项目筛选。">
                  <div className="input" style={{ display: "flex", alignItems: "center", color: "var(--text2)" }}>当前业务身份项目组合</div>
                </Field>
              ) : <Field label="正式成果所属项目" hint="只能选择当前业务身份已授权的稳定项目，报告不再按名称关联。">
                <select
                  className="input"
                  value={selectedProjectId}
                  onChange={event => {
                    const project = projectOptions.find(item => item.id === event.target.value);
                    setSelectedProjectId(event.target.value);
                    setProjectName(project?.name || "");
                    writeStoredCurrentProject(event.target.value);
                  }}
                >
                  <option value="">请选择项目</option>
                  {projectOptions.map(project => <option key={project.id} value={project.id}>{project.code ? `${project.code} · ` : ""}{project.name}</option>)}
                </select>
              </Field>}

              {(reportType === "weekly" || reportType === "monthly") && (
                <Field label="报告周期">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <input className="input" type="date" value={dateRange.start} onChange={event => setDateRange({ ...dateRange, start: event.target.value })} />
                    <input className="input" type="date" value={dateRange.end} onChange={event => setDateRange({ ...dateRange, end: event.target.value })} />
                  </div>
                </Field>
              )}

              <Field label="语气风格">
                <div style={{ display: "flex", gap: 8 }}>
                  {(["formal", "concise", "detailed"] as const).map(item => (
                    <button
                      key={item}
                      onClick={() => setTone(item)}
                      className={tone === item ? "btn-primary" : "btn-secondary"}
                      style={{ flex: 1 }}
                    >
                      {TONE_LABELS[item]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={reportType === "meeting" ? "会议要点/待办" : "本期完成"}>
                <textarea className="input" rows={4} value={completedWork} onChange={event => setCompletedWork(event.target.value)} placeholder={reportType === "meeting" ? "可按：事项|责任人|截止日期|P1 录入待办" : "填写本期完成事项"} />
              </Field>

              <Field label={reportType === "acceptance" ? "验收标准" : reportType === "meeting" ? "待决事项/后续会议" : "下期计划"}>
                <textarea className="input" rows={3} value={nextPlans} onChange={event => setNextPlans(event.target.value)} />
              </Field>

              <Field label="问题、风险或遗留项">
                <textarea className="input" rows={3} value={issues} onChange={event => setIssues(event.target.value)} />
              </Field>

              <Field label="资源需求">
                <textarea className="input" rows={2} value={resourceNeeds} onChange={event => setResourceNeeds(event.target.value)} />
              </Field>

              <div>
                <button className="btn-primary" onClick={() => void handleGenerate()} disabled={loading || (reportType !== "monthly" && !selectedProjectId)} style={{ width: "100%" }}>
                  {loading ? "生成中..." : "生成报告"}
                </button>
              </div>
            </SectionCard>

            <SectionCard title="正式成果台账" hint="历史由 Supabase 持久化，可追溯状态、版本、来源和汇报快照，不依赖当前浏览器。">
              {historyLoading && <div style={{ color: "var(--text2)", fontSize: "0.84rem" }}>正在读取正式历史...</div>}
              {!historyLoading && reportHistory.length === 0 && <div style={{ color: "var(--text2)", fontSize: "0.84rem" }}>暂无正式历史。</div>}
              <div style={{ display: "grid", gap: 8 }}>
                {reportHistory.map(report => (
                  <button
                    key={report.id}
                    onClick={() => setGeneratedReport(report)}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface2)",
                      color: "var(--text)",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: "0.82rem" }}>{report.title}</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.72rem", marginTop: 4 }}>{new Date(report.generatedAt).toLocaleString("zh-CN")}</div>
                    <div style={{ color: "var(--cyan)", fontSize: "0.7rem", marginTop: 4 }}>{report.formalStatus || "draft"} · V{report.version || 1}</div>
                  </button>
                ))}
              </div>
            </SectionCard>
          </div>

          <div>
            <SectionCard title="报告预览" hint={generatedReport ? `预计阅读 ${estimateReadingTime(generatedReport.content)}` : "生成后会显示完整Markdown报告、数据源和AI依据。"}>
              {!generatedReport && !loading && (
                <div style={{ minHeight: 360, display: "grid", placeItems: "center", color: "var(--text2)", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "3rem", opacity: 0.35, marginBottom: 12 }}>📄</div>
                    <div>填写左侧信息后生成报告。</div>
                  </div>
                </div>
              )}
              {loading && (
                <div style={{ minHeight: 360, display: "grid", placeItems: "center", color: "var(--text2)", textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: "2.4rem", marginBottom: 12 }}>⏳</div>
                    <div>正在聚合数据并生成报告...</div>
                  </div>
                </div>
              )}
              {generatedReport && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontWeight: 900, color: "var(--cyan)" }}>{generatedReport.title}</div>
                      <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 4 }}>{new Date(generatedReport.generatedAt).toLocaleString("zh-CN")} · {generatedReport.requestId || generatedReport.id}</div>
                    </div>
                    <button className="btn-secondary" onClick={() => void copyToClipboard()}>复制报告</button>
                  </div>
                  <div style={{
                    maxHeight: 620,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.75,
                    fontSize: "0.86rem",
                    padding: 16,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                  }}>
                    {generatedReport.content}
                  </div>
                </>
              )}
            </SectionCard>

            {generatedReport?.dataSources && (
              <SectionCard title="数据来源与引用" hint="报告必须可解释：哪些来自用户录入，哪些来自飞书/系统规则，哪些属于AI生成。">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                  {generatedReport.dataSources.map(source => <SourceBadge key={`${source.label}-${source.source}`} source={source} />)}
                </div>
              </SectionCard>
            )}

            {evidence && (
              <SectionCard title="AI依据审计" hint="P6 SQL 未执行时会显示审计未持久化提示，但不影响本次报告生成。">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>输入摘要</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{evidence.inputSummary}</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: "var(--text2)", marginBottom: 6 }}>输出摘要</div>
                    <div style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.6 }}>{evidence.outputSummary}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <span className="tag tag-blue">{evidence.model}</span>
                  <span className="tag tag-purple">{evidence.status}</span>
                  <span className="tag tag-amber">{evidence.confidence}</span>
                  <span className="tag" style={{ color: evidence.auditStatus === "succeeded" ? "var(--green)" : "var(--amber)", background: "rgba(255,255,255,0.05)" }}>
                    审计：{evidence.auditStatus || "待写入"}{evidence.auditWarning ? ` · ${evidence.auditWarning}` : ""}
                  </span>
                </div>
              </SectionCard>
            )}

            {generatedReport?.actionItems && generatedReport.actionItems.length > 0 && (
              <SectionCard title="会议/报告行动项" hint="可转入 P5 统一行动项，继续跟踪责任人、deadline、状态和关闭证据。">
                <div style={{ display: "grid", gap: 10 }}>
                  {generatedReport.actionItems.map((action, index) => {
                    const key = `${generatedReport.id}-${index}`;
                    return (
                      <div key={`${action.title}-${index}`} style={{ padding: 12, borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 800 }}>{action.title}</div>
                            <div style={{ color: "var(--text2)", fontSize: "0.75rem", marginTop: 5 }}>{action.owner} · {action.dueDate} · {action.priority}</div>
                            <div style={{ color: "var(--text2)", fontSize: "0.74rem", marginTop: 5 }}>{action.sourceReason}</div>
                          </div>
                          <button className="btn-secondary" onClick={() => void convertAction(action, index)} disabled={savingAction === key || generatedReport.type === "monthly"} style={{ whiteSpace: "nowrap", alignSelf: "start" }} title={generatedReport.type === "monthly" ? "组合行动项需先在统一收件箱选择责任项目" : undefined}>
                            {generatedReport.type === "monthly" ? "待分派项目" : savingAction === key ? "写入中..." : "转行动项"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
