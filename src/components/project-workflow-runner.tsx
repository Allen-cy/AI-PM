"use client";

import Link from "next/link";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import {
  buildWorkflowReport,
  type WorkflowDefinition,
  type WorkflowInput,
  type WorkflowStep,
} from "@/lib/project-workflows";

function valueKey(step: WorkflowStep, input: WorkflowInput) {
  return `${step.id}.${input.id}`;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildMarkdown(workflow: WorkflowDefinition, values: Record<string, string>) {
  const report = buildWorkflowReport(workflow, values);
  const lines = [
    `# ${workflow.title} 输出报告`,
    "",
    workflow.subtitle,
    "",
    `- 准备度：${report.readiness}%`,
    `- 已完成步骤：${report.readyCount}/${report.total}`,
    "",
    "## 输入与输出",
  ];

  for (const item of report.completed) {
    lines.push("", `### ${item.step.phase} / ${item.step.title}`);
    lines.push(`- 来源：${item.step.source}`);
    lines.push(`- 是否就绪：${item.ready ? "是" : "否"}`);
    if (item.missing.length > 0) {
      lines.push(`- 缺失输入：${item.missing.map(input => input.label).join("、")}`);
    }
    for (const input of item.step.userInputs) {
      lines.push(`- ${input.label}：${values[valueKey(item.step, input)] || "未填写"}`);
    }
    lines.push(`- 用户动作：${item.step.userActions.join("；")}`);
    lines.push(`- AI可辅助：${item.step.aiAssist.join("；")}`);
    lines.push(`- 输出成果：${item.step.outputs.join("；")}`);
    lines.push(`- 完成标准：${item.step.acceptanceCriteria.join("；")}`);
  }

  lines.push("", "## 管理建议");
  if (report.readiness < 100) {
    lines.push("- 仍有必填输入缺失，不建议进入正式评审或发布计划。");
    lines.push("- 请先补齐缺失输入，再由项目经理确认责任人和deadline。");
  } else {
    lines.push("- 所有必填输入已齐备，可进入项目评审、Kickoff或交接确认。");
    lines.push("- 建议将本报告同步到项目资料库，并把风险事项写入风险登记册。");
  }
  return lines.join("\n");
}

function inputControl(
  step: WorkflowStep,
  input: WorkflowInput,
  values: Record<string, string>,
  setValues: (next: Record<string, string>) => void,
) {
  const key = valueKey(step, input);
  const common = {
    className: "input",
    value: values[key] || "",
    placeholder: input.placeholder,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues({ ...values, [key]: event.target.value }),
  };
  if (input.type === "textarea") {
    return <textarea {...common} rows={3} style={{ resize: "vertical" }} />;
  }
  return <input {...common} type={input.type || "text"} />;
}

export function ProjectWorkflowRunner({ workflow }: { workflow: WorkflowDefinition }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeStepId, setActiveStepId] = useState(workflow.steps[0]?.id || "");
  const [message, setMessage] = useState("");
  const report = useMemo(() => buildWorkflowReport(workflow, values), [workflow, values]);
  const markdown = useMemo(() => buildMarkdown(workflow, values), [workflow, values]);
  const activeStep = workflow.steps.find(step => step.id === activeStepId) || workflow.steps[0];

  const downloadReport = () => {
    downloadText(`${workflow.title}-输出报告.md`, markdown);
    setMessage("工作流输出报告已生成并下载。");
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 32 }}>
      <div style={{ maxWidth: 1360, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link href="/planning" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回规划中心</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.8rem" }}>{workflow.title}</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>{workflow.subtitle}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {workflow.sourceFiles.map(file => <span key={file} className="tag tag-blue">{file}</span>)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/templates" className="btn-secondary" style={{ textDecoration: "none" }}>下载线下模板</Link>
            <button className="btn-primary" onClick={downloadReport}>下载输出报告</button>
          </div>
        </header>

        {message && (
          <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 12, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", color: "var(--green)", fontWeight: 700 }}>
            {message}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 360px", gap: 20, alignItems: "start" }}>
          <aside className="card">
            <div style={{ fontSize: "0.86rem", fontWeight: 900, marginBottom: 14 }}>流程步骤</div>
            <div style={{ display: "grid", gap: 10 }}>
              {report.completed.map((item, index) => (
                <button
                  key={item.step.id}
                  onClick={() => setActiveStepId(item.step.id)}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${activeStepId === item.step.id ? "var(--purple)" : "var(--border)"}`,
                    borderRadius: 12,
                    background: item.ready ? "rgba(16,185,129,0.08)" : "var(--surface2)",
                    padding: 12,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span style={{ fontWeight: 900 }}>{index + 1}. {item.step.phase}</span>
                    <span className={item.ready ? "tag tag-green" : "tag tag-amber"}>{item.ready ? "已就绪" : "待补"}</span>
                  </div>
                  <div style={{ marginTop: 6, color: "var(--text2)", fontSize: "0.74rem", lineHeight: 1.45 }}>{item.step.title}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
              <div style={{ color: "var(--text2)", fontSize: "0.74rem", marginBottom: 6 }}>准备度</div>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: report.readiness === 100 ? "var(--green)" : "var(--purple)" }}>{report.readiness}%</div>
              <div style={{ height: 8, borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden", marginTop: 10 }}>
                <div style={{ height: "100%", width: `${report.readiness}%`, background: report.readiness === 100 ? "var(--green)" : "var(--purple)" }} />
              </div>
            </div>
          </aside>

          <section className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <div>
                <div className="section-title" style={{ marginBottom: 6 }}><span>📥</span>{activeStep.phase}：{activeStep.title}</div>
                <div style={{ color: "var(--text2)", fontSize: "0.78rem" }}>来源：{activeStep.source}</div>
              </div>
              <span className="tag tag-purple">用户录入为主</span>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {activeStep.userInputs.map(input => (
                <div key={input.id}>
                  <label className="label">
                    {input.label}{input.required ? " *" : ""}
                  </label>
                  {inputControl(activeStep, input, values, setValues)}
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 20 }}>
              <div style={{ padding: 14, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>用户必须完成的动作</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>
                  {activeStep.userActions.map(action => <li key={action}>{action}</li>)}
                </ul>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>AI可辅助处理</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7 }}>
                  {activeStep.aiAssist.map(action => <li key={action}>{action}</li>)}
                </ul>
              </div>
            </div>

            <div style={{ marginTop: 20, padding: 14, borderRadius: 12, background: "rgba(51,112,255,0.08)", border: "1px solid rgba(51,112,255,0.18)", color: "var(--text2)", fontSize: "0.82rem", lineHeight: 1.7 }}>
              <strong style={{ color: "var(--text)" }}>本步骤输出：</strong>{activeStep.outputs.join("、")}。<br />
              <strong style={{ color: "var(--text)" }}>完成标准：</strong>{activeStep.acceptanceCriteria.join("、")}。
            </div>
          </section>

          <section className="card">
            <div className="section-title"><span>📤</span>实时输出预览</div>
            <pre style={{
              whiteSpace: "pre-wrap",
              maxHeight: 720,
              overflowY: "auto",
              padding: 16,
              borderRadius: 12,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontSize: "0.76rem",
              lineHeight: 1.6,
            }}>
              {markdown}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}
