"use client";

import { useState } from "react";
import Link from "next/link";
import mammoth from "mammoth";
import { SYSTEM_PROMPTS } from "@/lib/llm-prompts";

const PROJECT_TYPES = [
  { value: "it", label: "信息化系统集成" },
  { value: "content", label: "课程内容开发" },
  { value: "engineering", label: "工程基建施工" },
  { value: "ops", label: "运营服务交付" },
];

interface SOWData {
  projectBackground: string;
  constructionGoal: string;
  projectRequirements: string;
  deliverables: string;
  scheduleGoal: string;
  qualityGoal: string;
  deliveryForm: string;
  acceptanceCriteria: string;
  projectScope: string;
  teamMembers: string;
  riskNotes: string;
}

interface WBSItem {
  id: string;
  name: string;
  duration: number;
  level: number;
  parent?: string;
}

const emptySOW: SOWData = {
  projectBackground: "",
  constructionGoal: "",
  projectRequirements: "",
  deliverables: "",
  scheduleGoal: "",
  qualityGoal: "",
  deliveryForm: "",
  acceptanceCriteria: "",
  projectScope: "",
  teamMembers: "",
  riskNotes: "",
};

export default function WBSPage() {
  const [projectType, setProjectType] = useState("it");
  const [projectName, setProjectName] = useState("");
  const [sow, setSow] = useState<SOWData>(emptySOW);
  const [scope, setScope] = useState("");
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [wbsData, setWbsData] = useState<WBSItem[]>([]);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"structured" | "manual">("structured");

  const updateSow = (field: keyof SOWData, value: string) => {
    setSow(prev => ({ ...prev, [field]: value }));
  };

  const buildPromptFromSOW = () => {
    return `项目类型：${PROJECT_TYPES.find(t => t.value === projectType)?.label}
项目名称：${projectName || "未命名项目"}

【项目背景】
${sow.projectBackground}

【建设目标】
${sow.constructionGoal}

【项目需求】
${sow.projectRequirements}

【交付内容】
${sow.deliverables}

【进度目标】
${sow.scheduleGoal}

【质量目标】
${sow.qualityGoal}

【交付形式】
${sow.deliveryForm}

【验收标准】
${sow.acceptanceCriteria}

【项目范围及边际】
${sow.projectScope}

【项目团队】
${sow.teamMembers}

【风险备注】
${sow.riskNotes}`;
  };

  const handleGenerate = async () => {
    const source = activeTab === "structured" ? buildPromptFromSOW() : scope;
    if (!source.trim()) {
      setError("请填写项目范围描述");
      return;
    }

    setLoading(true);
    setError("");
    setResult("");

    try {
      const prompt = activeTab === "structured"
        ? source
        : `项目类型：${PROJECT_TYPES.find(t => t.value === projectType)?.label}\n项目名称：${projectName || "未命名项目"}\n项目范围：${source}`;

      const response = await fetch("/api/wbs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: "wbs",
          systemPrompt: activeTab === "structured" ? `项目类型：${PROJECT_TYPES.find(t => t.value === projectType)?.label}\n项目名称：${projectName || "未命名项目"}\n\n${SYSTEM_PROMPTS.wbs}` : SYSTEM_PROMPTS.wbs,
          userMessage: prompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "生成失败");
      setResult(data.content || "");

      const content = data.content || "";
      const lines = content.split("\n").filter((l: string) => l.match(/^\d+\.\d+/));
      const items: WBSItem[] = lines.slice(0, 30).map((line: string, i: number) => {
        const match = line.match(/^(\d+(?:\.\d+)*)\s+(.+?)(?:\s+(\d+)天?)?$/);
        return {
          id: `wbs-${i}`,
          name: match ? match[2].trim() : line.replace(/^\d+\.\d+\s*/, "").trim(),
          duration: match ? parseInt(match[3]) || 5 : 5,
          level: match ? match[1].split(".").length : 1,
        };
      });
      setWbsData(items);
    } catch (e: unknown) {
      setError(`生成失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const isDocx = fileName.toLowerCase().endsWith(".docx");

    setFileName(fileName);
    setLoading(true);
    setError("");

    try {
      let text: string;
      if (isDocx) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else {
        text = await file.text();
      }
      setScope(text);
      setActiveTab("manual");
    } catch (err) {
      setError(`文件读取失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const fieldLabels: Record<keyof SOWData, string> = {
  projectBackground: "项目背景",
  constructionGoal: "建设目标",
  projectRequirements: "项目需求",
  deliverables: "交付内容",
  scheduleGoal: "进度目标",
  qualityGoal: "质量目标",
  deliveryForm: "交付形式",
  acceptanceCriteria: "验收标准",
  projectScope: "范围与边界",
  teamMembers: "项目团队",
  riskNotes: "风险备注",
};

const fieldPlaceholders: Record<keyof SOWData, string> = {
  projectBackground: "项目背景、项目介绍、建设缘由...",
  constructionGoal: "建设目标、预期成果、系统架构...",
  projectRequirements: "详细功能需求、非功能需求、技术要求...",
  deliverables: "交付物清单、可交付成果...",
  scheduleGoal: "项目周期、里程碑时间节点...",
  qualityGoal: "质量标准、验收指标...",
  deliveryForm: "交付形式：本地部署/云服务/混合...",
  acceptanceCriteria: "验收标准、通过条件...",
  projectScope: "项目范围、边界、除外责任...",
  teamMembers: "项目团队规模、角色分工...",
  riskNotes: "已知风险、特殊约束、历史遗留问题...",
};

const renderField = (field: keyof SOWData) => {
  const label = fieldLabels[field];
  const placeholder = fieldPlaceholders[field];
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="label" style={{ fontSize: "0.78rem", color: "var(--text2)", fontWeight: 600, marginBottom: 6, display: "block" }}>{label}</label>
      <textarea
        className="input"
        rows={field === "riskNotes" ? 2 : 3}
        placeholder={placeholder}
        value={sow[field]}
        onChange={e => updateSow(field, e.target.value)}
        style={{ resize: "vertical", fontSize: "0.85rem" }}
      />
    </div>
  );
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
        <span style={{ fontWeight: 700 }}>🧩 AI WBS智能拆解</span>
        <span className="tag tag-blue" style={{ fontSize: "0.7rem" }}>MiniMax</span>
      </header>

      <main style={{ flex: 1, padding: "32px", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
        {/* Input Section */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "28px", marginBottom: 24 }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            输入项目信息
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div>
              <label className="label">项目类型</label>
              <select className="input" value={projectType} onChange={e => setProjectType(e.target.value)}>
                {PROJECT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">项目名称（可选）</label>
              <input className="input" placeholder="例如：XX智慧作业项目" value={projectName} onChange={e => setProjectName(e.target.value)} />
            </div>
          </div>

          {/* Tab Switcher */}
          <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
            <button
              onClick={() => setActiveTab("structured")}
              style={{
                padding: "10px 24px",
                background: "none",
                border: "none",
                borderBottom: activeTab === "structured" ? "2px solid var(--accent)" : "2px solid transparent",
                color: activeTab === "structured" ? "var(--accent)" : "var(--text2)",
                fontWeight: activeTab === "structured" ? 700 : 400,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              📋 结构化输入
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              style={{
                padding: "10px 24px",
                background: "none",
                border: "none",
                borderBottom: activeTab === "manual" ? "2px solid var(--accent)" : "2px solid transparent",
                color: activeTab === "manual" ? "var(--accent)" : "var(--text2)",
                fontWeight: activeTab === "manual" ? 700 : 400,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              📝 自由文本输入
            </button>
          </div>

          {/* Structured Input */}
          {activeTab === "structured" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
                {renderField("projectBackground")}
                {renderField("constructionGoal")}
                {renderField("projectRequirements")}
                {renderField("deliverables")}
                {renderField("scheduleGoal")}
                {renderField("qualityGoal")}
                {renderField("deliveryForm")}
                {renderField("acceptanceCriteria")}
                {renderField("projectScope")}
                {renderField("teamMembers")}
              </div>
              {renderField("riskNotes")}
            </div>
          )}

          {/* Manual Input */}
          {activeTab === "manual" && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label className="label">项目范围描述（SOW）</label>
                <textarea
                  className="input"
                  rows={8}
                  placeholder="请详细描述项目的交付内容、目标、关键技术要求等..."
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                  style={{ resize: "vertical", minHeight: 160 }}
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label className="label">或上传SOW文件</label>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <label style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 20px",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text2)",
                  }}>
                    <span>📄</span>
                    {fileName || "选择文件"}
                    <input type="file" accept=".txt,.md,.doc,.docx,.pdf" onChange={handleFileChange} style={{ display: "none" }} />
                  </label>
                  {scope && fileName && <span style={{ fontSize: "0.8rem", color: "var(--green)" }}>✓ 已导入 {fileName}</span>}
                  {scope && (
                    <button onClick={() => { setScope(""); setFileName(""); }} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: "0.8rem" }}>清除</button>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text2)", marginTop: 8 }}>支持 .txt / .md / .doc / .docx / .pdf</div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 16px", color: "var(--red)", fontSize: "0.85rem", marginBottom: 16 }}>
              {error}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={loading}
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "🤖 AI生成中..." : "🧩 智能生成WBS"}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "40px", textAlign: "center", color: "var(--text2)" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
            <p>MiniMax正在分析项目范围，生成WBS结构...</p>
            <p style={{ fontSize: "0.8rem", marginTop: 8 }}>通常需要5-15秒</p>
          </div>
        )}

        {/* WBS Tree Preview */}
        {wbsData.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "28px", marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                📊 WBS 结构预览
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <span className="tag tag-green">{wbsData.length}个工作包</span>
                <span className="tag tag-blue">MiniMax-M2.7</span>
              </div>
            </div>
            <div style={{ fontFamily: "system-ui, sans-serif", fontSize: "0.9rem" }}>
              {wbsData.map((item, i) => (
                <div key={item.id} style={{
                  padding: "10px 12px",
                  paddingLeft: (item.level - 1) * 32 + 12,
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  position: "relative",
                  background: item.level === 1 ? "rgba(59, 130, 246, 0.05)" : item.level === 2 ? "rgba(16, 185, 129, 0.03)" : "transparent",
                }}>
                  {/* Tree lines */}
                  {item.level > 1 && (
                    <>
                      <div style={{
                        position: "absolute",
                        left: (item.level - 2) * 32 + 20,
                        top: 0,
                        bottom: 0,
                        width: 1,
                        background: "var(--border)",
                      }} />
                    </>
                  )}
                  {/* Level icon */}
                  <span style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: item.level === 1 ? "var(--accent)" : item.level === 2 ? "var(--green)" : "var(--text2)",
                    color: item.level <= 2 ? "#fff" : "var(--bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {item.level === 1 ? "📋" : item.level === 2 ? "📦" : "⚙️"}
                  </span>
                  {/* Level badge */}
                  <span style={{
                    fontSize: "0.65rem",
                    color: "var(--text2)",
                    background: "var(--surface2)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}>
                    L{item.level}
                  </span>
                  {/* Item name */}
                  <span style={{
                    color: item.level === 1 ? "var(--text)" : "var(--text2)",
                    fontWeight: item.level === 1 ? 600 : item.level === 2 ? 500 : 400,
                    flex: 1,
                  }}>
                    {item.name}
                  </span>
                  {/* Duration badge */}
                  <span style={{
                    fontSize: "0.75rem",
                    color: "var(--green)",
                    background: "rgba(16, 185, 129, 0.1)",
                    padding: "4px 10px",
                    borderRadius: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    ⏱ {item.duration}天
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full Result */}
        {result && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "28px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                完整WBS输出
              </div>
              <button className="btn-secondary" onClick={() => navigator.clipboard.writeText(result)} style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
                复制内容
              </button>
            </div>
            <div className="prose" dangerouslySetInnerHTML={{
              __html: result.replace(/\n/g, "<br/>").replace(/^\d+\.\d+/gm, "<strong>$&</strong>")
            }} />
          </div>
        )}
      </main>
    </div>
  );
}
