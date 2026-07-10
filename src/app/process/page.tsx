"use client";

import Link from "next/link";
import { useState } from "react";
import {
  type ProcessTemplate,
  type ProcessElement,
  PROCESS_TEMPLATES,
  exportToDrawio,
  exportToExcalidraw,
  downloadFile,
  loadFromStorage,
  saveToStorage,
} from "@/lib/process";

const DRAWIO_URL = "https://next-ai-drawio.jiang.jp/zh";
const EXCALIDRAW_URL = "https://excalidraw.com";

// Blue color scheme for process/flow theme
const BLUE = {
  primary: "#3b82f6",
  secondary: "#60a5fa",
  accent: "#2563eb",
  light: "rgba(59, 130, 246, 0.1)",
  medium: "rgba(59, 130, 246, 0.15)",
  dark: "rgba(37, 99, 235, 0.2)",
};

export default function ProcessPage() {
  const [activeTab, setActiveTab] = useState<"drawio" | "excalidraw">("drawio");
  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savedFlows, setSavedFlows] = useState<ProcessTemplate[]>(() => loadFromStorage("templates"));
  const [currentTemplate, setCurrentTemplate] = useState<ProcessTemplate | null>(null);
  const [loadError, setLoadError] = useState("");

  // Save current flow
  const saveCurrentFlow = () => {
    if (!currentTemplate) return;
    const exists = savedFlows.findIndex((f) => f.id === currentTemplate.id);
    let updated: ProcessTemplate[];
    if (exists >= 0) {
      updated = savedFlows.map((f, i) => (i === exists ? currentTemplate : f));
    } else {
      updated = [...savedFlows, currentTemplate];
    }
    saveToStorage("templates", updated);
    setSavedFlows(updated);
  };

  // Delete saved flow
  const deleteSavedFlow = (id: string) => {
    const updated = savedFlows.filter((f) => f.id !== id);
    saveToStorage("templates", updated);
    setSavedFlows(updated);
  };

  // Load template
  const loadTemplate = (template: ProcessTemplate) => {
    setCurrentTemplate(template);
    setShowTemplates(false);
    setAiPrompt(template.name);
  };

  // Generate flow using AI
  const handleGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setLoadError("");

    try {
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiPrompt }),
      });

      if (!response.ok) {
        throw new Error("生成失败");
      }

      const data = await response.json();

      // Create template from AI response
      const newTemplate: ProcessTemplate = {
        id: `custom-${Date.now()}`,
        name: aiPrompt.slice(0, 20),
        description: data.flowDescription || aiPrompt,
        category: "AI生成",
        diagramType: "flowchart",
        elements: data.elements || [],
      };

      setCurrentTemplate(newTemplate);
      setShowTemplates(false);
    } catch (e) {
      setLoadError(`生成失败: ${e instanceof Error ? e.message : "请检查API配置"}`);
    } finally {
      setGenerating(false);
    }
  };

  // Export functions
  const handleExportDrawio = () => {
    if (!currentTemplate) return;
    const xml = exportToDrawio(currentTemplate);
    downloadFile(xml, `${currentTemplate.name}.drawio`, "application/xml");
  };

  const handleExportExcalidraw = () => {
    if (!currentTemplate) return;
    const json = exportToExcalidraw(currentTemplate);
    downloadFile(json, `${currentTemplate.name}.excalidraw`, "application/json");
  };

  // Quick action templates
  const quickActions = [
    { label: "LTC全流程", emoji: "📋", action: () => loadTemplate(PROCESS_TEMPLATES[0]) },
    { label: "项目立项流程", emoji: "🗂️", action: () => loadTemplate(PROCESS_TEMPLATES[1]) },
    { label: "风险审批流程", emoji: "🔐", action: () => loadTemplate(PROCESS_TEMPLATES[2]) },
    { label: "采购流程", emoji: "🛒", action: () => loadTemplate(PROCESS_TEMPLATES[3]) },
  ];

  // Excalidraw templates
  const excalidrawTemplates = [
    { label: "空白画布", emoji: "🎨", desc: "自由绘制" },
    { label: "架构草图", emoji: "🏗️", desc: "系统架构讨论" },
    { label: "用户流程", emoji: "👤", desc: "用户体验设计" },
    { label: "头脑风暴", emoji: "💡", desc: "创意发散讨论" },
  ];

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
        <span style={{ fontWeight: 700 }}>🎨 流程设计与白板</span>
        <span className="tag" style={{ fontSize: "0.7rem", background: BLUE.light, color: BLUE.primary }}>draw.io + Excalidraw</span>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Tab Navigation */}
        <div style={{
          display: "flex",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          padding: "0 32px",
        }}>
          <button
            onClick={() => setActiveTab("drawio")}
            style={{
              padding: "14px 28px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "drawio" ? `2px solid ${BLUE.primary}` : "2px solid transparent",
              color: activeTab === "drawio" ? BLUE.primary : "var(--text2)",
              fontWeight: activeTab === "drawio" ? 700 : 500,
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>📊</span> 流程设计 (draw.io)
          </button>
          <button
            onClick={() => setActiveTab("excalidraw")}
            style={{
              padding: "14px 28px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "excalidraw" ? `2px solid ${BLUE.primary}` : "2px solid transparent",
              color: activeTab === "excalidraw" ? BLUE.primary : "var(--text2)",
              fontWeight: activeTab === "excalidraw" ? 700 : 500,
              fontSize: "0.9rem",
              cursor: "pointer",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span>🎨</span> 协作白板 (Excalidraw)
          </button>
        </div>

        {/* draw.io Tab */}
        {activeTab === "drawio" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px" }}>
            {/* AI Flow Generator */}
            <div style={{
              background: "var(--surface)",
              border: `1px solid ${BLUE.dark}`,
              borderRadius: "var(--radius)",
              padding: "20px 24px",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: "1.1rem" }}>🤖</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: BLUE.primary, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    AI流程生成器
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    style={{
                      background: BLUE.medium,
                      border: `1px solid ${BLUE.dark}`,
                      borderRadius: 8,
                      padding: "6px 14px",
                      color: BLUE.primary,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>📚</span> 模板库
                  </button>
                  <div style={{ position: "relative" }}>
                    <button
                      onClick={() => setShowQuickActions(!showQuickActions)}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "6px 14px",
                        color: "var(--text2)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span>⚡</span> 快捷模板
                      <span style={{ transform: showQuickActions ? "rotate(180deg)" : "none", transition: "0.2s" }}>▼</span>
                    </button>
                    {showQuickActions && (
                      <div style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 8,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        padding: 8,
                        minWidth: 200,
                        zIndex: 50,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                      }}>
                        {quickActions.map((action) => (
                          <button
                            key={action.label}
                            onClick={() => { action.action(); setShowQuickActions(false); }}
                            style={{
                              width: "100%",
                              background: "none",
                              border: "none",
                              padding: "10px 14px",
                              borderRadius: 8,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              color: "var(--text)",
                              fontSize: "0.85rem",
                              textAlign: "left",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}
                          >
                            <span style={{ fontSize: "1.1rem" }}>{action.emoji}</span>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Template Gallery */}
              {showTemplates && (
                <div style={{
                  marginBottom: 16,
                  padding: "16px",
                  background: BLUE.light,
                  borderRadius: 10,
                }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 700, color: BLUE.primary, marginBottom: 12 }}>
                    📚 预置模板
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {PROCESS_TEMPLATES.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        onClick={() => loadTemplate(tmpl)}
                        style={{
                          background: "var(--surface)",
                          border: `1px solid ${BLUE.dark}`,
                          borderRadius: 10,
                          padding: "14px",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          textAlign: "center",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = BLUE.primary;
                          (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.borderColor = BLUE.dark;
                          (e.currentTarget as HTMLElement).style.transform = "none";
                        }}
                      >
                        <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>📊</div>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                          {tmpl.name}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "var(--text2)" }}>
                          {tmpl.elements.length} 个节点
                        </div>
                      </div>
                    ))}
                  </div>

                  {savedFlows.length > 0 && (
                    <>
                      <div style={{ fontSize: "0.8rem", fontWeight: 700, color: BLUE.primary, margin: "16px 0 12px" }}>
                        💾 已保存流程
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        {savedFlows.map((flow) => (
                          <div
                            key={flow.id}
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              padding: "14px",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                              {flow.name}
                            </div>
                            <div style={{ fontSize: "0.7rem", color: "var(--text2)", marginBottom: 8 }}>
                              {flow.category} · {flow.elements.length}个节点
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                onClick={() => loadTemplate(flow)}
                                style={{
                                  flex: 1,
                                  padding: "4px 8px",
                                  background: BLUE.medium,
                                  border: "none",
                                  borderRadius: 6,
                                  color: BLUE.primary,
                                  fontSize: "0.72rem",
                                  cursor: "pointer",
                                }}
                              >
                                加载
                              </button>
                              <button
                                onClick={() => deleteSavedFlow(flow.id)}
                                style={{
                                  flex: 1,
                                  padding: "4px 8px",
                                  background: "rgba(239,68,68,0.1)",
                                  border: "none",
                                  borderRadius: 6,
                                  color: "#ef4444",
                                  fontSize: "0.72rem",
                                  cursor: "pointer",
                                }}
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Input Area */}
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  className="input"
                  placeholder="描述流程，例如：画出LTC全流程，从商机立项到回款管理，包含12个阶段..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && aiPrompt.trim() && !generating) {
                      handleGenerate();
                    }
                  }}
                  style={{ paddingRight: 120 }}
                />
                {aiPrompt && (
                  <button
                    onClick={() => setAiPrompt("")}
                    style={{
                      position: "absolute",
                      right: 120,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text2)",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      padding: "4px 8px",
                    }}
                  >
                    ✕
                  </button>
                )}
                <button
                  onClick={handleGenerate}
                  disabled={!aiPrompt.trim() || generating}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: generating ? "var(--surface2)" : BLUE.primary,
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    color: generating ? "var(--text2)" : "white",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: aiPrompt.trim() && !generating ? "pointer" : "not-allowed",
                    opacity: aiPrompt.trim() ? 1 : 0.5,
                  }}
                >
                  {generating ? "⏳ 生成中..." : "✨ 生成"}
                </button>
              </div>

              {loadError && (
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8,
                  color: "#ef4444",
                  fontSize: "0.82rem",
                }}>
                  {loadError}
                </div>
              )}

              {/* LTC Flow Reference */}
              <div style={{
                marginTop: 16,
                padding: "14px 16px",
                background: BLUE.light,
                border: `1px solid ${BLUE.dark}`,
                borderRadius: 10,
              }}>
                <div style={{ fontSize: "0.75rem", color: BLUE.primary, fontWeight: 700, marginBottom: 8 }}>
                  💡 LTC全流程（12阶段）
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {[
                    "商机立项", "需求调研评审", "方案建设", "招投标", "合同签约",
                    "合同管理", "项目前准备", "项目规划", "项目实施", "项目结项",
                    "回款管理", "运营运维",
                  ].map((stage, i) => (
                    <span key={stage} style={{
                      fontSize: "0.72rem",
                      color: "var(--text2)",
                      background: "var(--surface2)",
                      padding: "4px 10px",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}>
                      <span style={{ color: BLUE.primary, fontWeight: 700 }}>{i + 1}</span>
                      {stage}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Current Flow Info & Actions */}
            {currentTemplate && (
              <div style={{
                background: "var(--surface)",
                border: `1px solid ${BLUE.dark}`,
                borderRadius: "var(--radius)",
                padding: "14px 20px",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}>
                <div>
                  <span style={{ fontSize: "0.8rem", fontWeight: 700, color: BLUE.primary }}>当前流程：</span>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, marginLeft: 8 }}>{currentTemplate.name}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text2)", marginLeft: 12 }}>
                    {currentTemplate.elements.length} 个节点 · {currentTemplate.category}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={saveCurrentFlow}
                    style={{
                      padding: "6px 14px",
                      background: BLUE.medium,
                      border: `1px solid ${BLUE.dark}`,
                      borderRadius: 6,
                      color: BLUE.primary,
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    💾 保存
                  </button>
                  <button
                    onClick={handleExportDrawio}
                    style={{
                      padding: "6px 14px",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text2)",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    📥 导出.drawio
                  </button>
                  <button
                    onClick={handleExportExcalidraw}
                    style={{
                      padding: "6px 14px",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      color: "var(--text2)",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                    }}
                  >
                    📥 导出.excalidraw
                  </button>
                </div>
              </div>
            )}

            {/* draw.io Iframe */}
            <div style={{
              flex: 1,
              background: "var(--surface)",
              border: `1px solid ${BLUE.dark}`,
              borderRadius: "var(--radius)",
              overflow: "hidden",
              minHeight: 500,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--surface2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text2)" }}>
                  <span>📊</span>
                  <span style={{ fontWeight: 600 }}>next-ai-drawio</span>
                  <span>|</span>
                  <span>AI自然语言 → 流程图</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span className="tag" style={{ fontSize: "0.65rem", background: BLUE.light, color: BLUE.primary }}>日文界面</span>
                  <a
                    href={DRAWIO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.75rem", color: "var(--text2)", textDecoration: "none" }}
                  >
                    新窗口 ↗
                  </a>
                </div>
              </div>
              <iframe
                src={DRAWIO_URL}
                style={{
                  flex: 1,
                  border: "none",
                  width: "100%",
                  minHeight: 600,
                }}
                title="draw.io Process Design"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>
          </div>
        )}

        {/* Excalidraw Tab */}
        {activeTab === "excalidraw" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px" }}>
            {/* Quick Templates */}
            <div style={{
              background: "var(--surface)",
              border: `1px solid ${BLUE.dark}`,
              borderRadius: "var(--radius)",
              padding: "20px 24px",
              marginBottom: 20,
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: BLUE.primary, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14 }}>
                📐 快捷模板
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {excalidrawTemplates.map((tmpl) => (
                  <a
                    key={tmpl.label}
                    href={EXCALIDRAW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: BLUE.light,
                      border: `1px solid ${BLUE.dark}`,
                      borderRadius: 10,
                      padding: "16px",
                      cursor: "pointer",
                      textDecoration: "none",
                      transition: "all 0.2s",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = BLUE.primary;
                      (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = BLUE.dark;
                      (e.currentTarget as HTMLElement).style.transform = "none";
                    }}
                  >
                    <span style={{ fontSize: "1.8rem" }}>{tmpl.emoji}</span>
                    <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{tmpl.label}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--text2)" }}>{tmpl.desc}</span>
                  </a>
                ))}
              </div>
            </div>

            {/* Excalidraw Iframe */}
            <div style={{
              flex: 1,
              background: "var(--surface)",
              border: `1px solid ${BLUE.dark}`,
              borderRadius: "var(--radius)",
              overflow: "hidden",
              minHeight: 500,
              display: "flex",
              flexDirection: "column",
            }}>
              <div style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "var(--surface2)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text2)" }}>
         <span>🎨</span>
                  <span style={{ fontWeight: 600 }}>Excalidraw</span>
                  <span>|</span>
                  <span>多人协作白板</span>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span className="tag" style={{ fontSize: "0.65rem", background: BLUE.light, color: BLUE.primary }}>支持多人协作</span>
                  <a
                    href={EXCALIDRAW_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.75rem", color: "var(--text2)", textDecoration: "none" }}
                  >
                    新窗口 ↗
                  </a>
                </div>
              </div>
              <iframe
                src={EXCALIDRAW_URL}
                style={{
                  flex: 1,
                  border: "none",
                  width: "100%",
                  minHeight: 600,
                }}
                title="Excalidraw Whiteboard"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
