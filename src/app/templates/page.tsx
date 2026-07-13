"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { templateCatalog, type TemplateCategory } from "@/lib/template-center";
import type { Risk } from "@/lib/risk";
import { loadCurrentBusinessContextSearchParams } from "@/features/operating-model/client-context";

const categoryLabels: Record<TemplateCategory, string> = {
  risk: "风险管理",
  planning: "规划工作流",
  governance: "治理",
};

export default function TemplateCenterPage() {
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const filtered = useMemo(() => templateCatalog.filter(item => category === "all" || item.category === category), [category]);

  const importRiskTemplate = async () => {
    if (!file) {
      setError("请先选择线下填写好的风险登记模板。");
      return;
    }
    setImporting(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const parseResponse = await fetch("/api/templates/import/risk", { method: "POST", body: formData });
      const parsed = await parseResponse.json() as { risks?: Risk[]; count?: number; error?: string };
      if (!parseResponse.ok || !Array.isArray(parsed.risks)) throw new Error(parsed.error || "模板解析失败");
      if (parsed.risks.length === 0) throw new Error("未识别到可导入的风险记录，请确认字段名称与模板一致。");

      const riskScope = await loadCurrentBusinessContextSearchParams();
      const selectedProjectId = riskScope.get("project_id") || "";
      const contextResponse = await fetch(`/api/context/current?${riskScope.toString()}`, { cache: "no-store" });
      const contextBody = await contextResponse.json() as {
        available_projects?: Array<{ id: string; name: string }>;
        error?: string;
        detail?: string;
      };
      if (!contextResponse.ok) throw new Error(contextBody.detail || contextBody.error || "无法核对导入项目。");
      const selectedProject = contextBody.available_projects?.find(project => project.id === selectedProjectId);
      if (!selectedProject) throw new Error("TEMPLATE_PROJECT_MISMATCH：当前业务范围没有可导入的授权项目。");
      const mismatchedProjects = [...new Set(parsed.risks
        .map(risk => risk.projectName?.trim())
        .filter((name): name is string => Boolean(name && name !== selectedProject.name)))];
      if (mismatchedProjects.length > 0) {
        throw new Error(`TEMPLATE_PROJECT_MISMATCH：模板中的项目“${mismatchedProjects.join("、")}”与当前授权项目“${selectedProject.name}”不一致，请按项目分开导入。`);
      }
      const scopedRisks = parsed.risks.map(risk => ({
        ...risk,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
      }));
      const saveResponse = await fetch(`/api/risk?${riskScope.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risks: scopedRisks,
          expected_version: 0,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      const saved = await saveResponse.json() as { risks?: Risk[]; error?: string; migrationHint?: string };
      if (!saveResponse.ok || !Array.isArray(saved.risks)) {
        throw new Error([saved.error, saved.migrationHint].filter(Boolean).join("；") || "写入风险登记册失败");
      }
      setMessage(`已导入 ${saved.risks.length} 条风险记录，并写入正式风险登记册。`);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: 32 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <Link href="/" style={{ color: "var(--text2)", textDecoration: "none", fontSize: "0.86rem" }}>← 返回首页</Link>
            <h1 style={{ marginTop: 12, fontSize: "1.8rem" }}>工具/模板下载中心</h1>
            <p style={{ color: "var(--text2)", lineHeight: 1.7, marginTop: 8 }}>
              将风险管理和项目接手模板植入系统。使用者可以下载模板线下填写，再导入系统形成正式登记册或工作流输入。
            </p>
          </div>
          <Link href="/risk" className="btn-secondary" style={{ textDecoration: "none" }}>进入风险管理</Link>
        </header>

        {(message || error) && (
          <div style={{
            marginBottom: 18,
            padding: "12px 14px",
            borderRadius: 12,
            background: error ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)",
            border: `1px solid ${error ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`,
            color: error ? "var(--red)" : "var(--green)",
            fontWeight: 700,
          }}>
            {error || message}
          </div>
        )}

        <section className="card" style={{ marginBottom: 22 }}>
          <div className="section-title"><span>📤</span>模板导入</div>
          <p style={{ color: "var(--text2)", fontSize: "0.84rem", lineHeight: 1.7, marginBottom: 14 }}>
            当前支持导入“风险登记册模板”。导入后，系统会识别风险描述、类别、阶段、概率、影响、责任人、deadline、应对计划等字段，并写入正式风险登记册。
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center" }}>
            <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={event => setFile(event.target.files?.[0] ?? null)} />
            <button className="btn-primary" onClick={importRiskTemplate} disabled={importing}>
              {importing ? "导入中..." : "导入风险登记册"}
            </button>
          </div>
        </section>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {[
            { id: "all", label: "全部" },
            { id: "risk", label: "风险管理" },
            { id: "planning", label: "规划工作流" },
          ].map(item => (
            <button
              key={item.id}
              className={category === item.id ? "btn-primary" : "btn-secondary"}
              onClick={() => setCategory(item.id as TemplateCategory | "all")}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
          {filtered.map(template => (
            <article key={template.id} className="card" style={{ display: "flex", flexDirection: "column", minHeight: 250 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <span className={template.category === "risk" ? "tag tag-purple" : "tag tag-blue"}>{categoryLabels[template.category]}</span>
                <span style={{ color: "var(--text2)", fontSize: "0.72rem" }}>{template.format.toUpperCase()}</span>
              </div>
              <h2 style={{ fontSize: "1rem", marginBottom: 8 }}>{template.title}</h2>
              <p style={{ color: "var(--text2)", fontSize: "0.8rem", lineHeight: 1.7, flex: 1 }}>{template.description}</p>
              <div style={{ marginTop: 12, color: "var(--text2)", fontSize: "0.72rem", lineHeight: 1.5 }}>
                来源：{template.source}
              </div>
              <a
                className="btn-primary"
                href={`/api/templates/download?id=${template.id}`}
                style={{ textDecoration: "none", textAlign: "center", marginTop: 16 }}
              >
                下载模板
              </a>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
