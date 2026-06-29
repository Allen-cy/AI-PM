"use client";

import { useState } from "react";
import type { FeishuTableKey } from "@/features/feishu/config";
import { FEISHU_BASE_HOME_URL, feishuTableUrl } from "@/features/feishu/links";

// 12 LTC stages with full metadata
const STAGES = [
  {
    id: "S01",
    name: "商机立项",
    desc: "识别并正式立项潜在项目机会",
    entry: ["销售提交商机信息", "客户需求初步确认"],
    exit: ["商机评审通过", "项目目标明确"],
    tasks: ["收集客户需求", "初步资源评估", "编写商机评审报告", "内部立项审批"],
    deliverables: ["商机信息表", "初步SOW", "立项审批单"],
    raci: { R: "销售", A: "PMO", C: "解决方案", I: "区域负责人" },
    avgDays: 5,
    feishuTable: "商机管理表",
  },
  {
    id: "S02",
    name: "需求调研与评审",
    desc: "深度调研客户需求并完成需求文档评审",
    entry: ["立项审批完成", "客户对接人指派"],
    exit: ["需求文档评审通过", "需求范围确认签字"],
    tasks: ["客户深度访谈", "业务现状分析", "需求清单编写", "需求评审会", "需求基线确认"],
    deliverables: ["需求调研报告", "需求规格说明书", "需求评审纪要"],
    raci: { R: "解决方案", A: "PM", C: "客户", I: "销售" },
    avgDays: 10,
    feishuTable: "需求管理表",
  },
  {
    id: "S03",
    name: "方案建设",
    desc: "制定整体解决方案并完成技术方案评审",
    entry: ["需求基线确认", "技术可行性评审"],
    exit: ["解决方案评审通过", "技术方案定稿"],
    tasks: ["技术架构设计", "解决方案编写", "标品/定制方案评估", "方案评审会", "预算估算"],
    deliverables: ["解决方案文档", "技术架构图", "项目预算表"],
    raci: { R: "解决方案", A: "PM", C: "研发/交付", I: "销售/客户" },
    avgDays: 15,
    feishuTable: "方案管理表",
  },
  {
    id: "S04",
    name: "招投标",
    desc: "参与或发起招投标流程",
    entry: ["方案确认", "客户启动招标"],
    exit: ["中标/比选结果确认", "中标通知书获取"],
    tasks: ["招标文件解读", "投标响应文件编制", "讲标与答疑", "中标结果确认"],
    deliverables: ["投标响应文件", "讲标PPT", "中标通知书"],
    raci: { R: "销售", A: "PMO", C: "解决方案/法务", I: "财务" },
    avgDays: 20,
    feishuTable: "招投标管理表",
  },
  {
    id: "S05",
    name: "合同签约",
    desc: "完成合同谈判与正式签署",
    entry: ["中标结果确认", "合同模板准备"],
    exit: ["合同双方签署完成", "合同文本定稿"],
    tasks: ["合同条款谈判", "法务审核", "合同用印", "合同归档"],
    deliverables: ["合同文本", "合同审批单", "用印记录"],
    raci: { R: "销售", A: "法务/PMO", C: "财务/总经理", I: "PM/客户" },
    avgDays: 10,
    feishuTable: "合同管理表",
  },
  {
    id: "S06",
    name: "合同管理",
    desc: "合同履行过程管理与变更控制",
    entry: ["合同签署完成", "项目团队组建"],
    exit: ["合同全部履约完成", "最终验收签字"],
    tasks: ["合同交底", "变更流程管理", "履约进度跟踪", "验收管理", "合同关闭"],
    deliverables: ["合同交底记录", "变更单", "验收报告", "合同关闭确认单"],
    raci: { R: "PM", A: "PMO", C: "销售/法务", I: "财务/客户" },
    avgDays: 30,
    feishuTable: "合同执行表",
  },
  {
    id: "S07",
    name: "项目前准备",
    desc: "项目正式启动前的各项准备工作",
    entry: ["合同管理阶段启动", "项目团队组建完成"],
    exit: ["项目启动会召开", "项目计划基线发布"],
    tasks: ["项目团队组建", "环境准备", "详细调研启动", "项目计划编制", "启动会召开"],
    deliverables: ["项目团队名单", "项目章程", "项目管理计划", "启动会纪要"],
    raci: { R: "PM", A: "PMO", C: "客户/销售", I: "研发/交付" },
    avgDays: 7,
    feishuTable: "项目启动准备表",
  },
  {
    id: "S08",
    name: "项目规划",
    desc: "制定详细的项目执行计划",
    entry: ["项目管理计划编制", "详细WBS分解"],
    exit: ["项目计划基线批准", "资源计划确认"],
    tasks: ["WBS分解细化", "里程碑计划编制", "资源计划编制", "风险管理计划", "沟通计划编制"],
    deliverables: ["项目计划基线", "WBS字典", "资源计划", "风险管理计划", "沟通管理计划"],
    raci: { R: "PM", A: "PMO", C: "研发/质量/客户", I: "销售/财务" },
    avgDays: 5,
    feishuTable: "项目计划表",
  },
  {
    id: "S09",
    name: "项目实施",
    desc: "按计划执行项目工作，交付项目成果",
    entry: ["项目计划基线批准", "详细设计完成"],
    exit: ["项目成果全部交付", "初步验收通过"],
    tasks: ["详细设计与开发", "迭代评审", "质量检查", "进度监控", "变更控制", "阶段性交付"],
    deliverables: ["阶段性交付物", "测试报告", "问题日志", "周报/双周报", "变更单"],
    raci: { R: "研发/交付", A: "PM", C: "质量/客户", I: "PMO/销售" },
    avgDays: 60,
    feishuTable: "项目执行表",
  },
  {
    id: "S10",
    name: "项目结项",
    desc: "完成项目验收与结项评审",
    entry: ["项目实施完成", "初步验收通过"],
    exit: ["项目结项评审通过", "项目结项报告发布"],
    tasks: ["项目验收测试", "验收评审会", "结项报告编制", "知识库归档", "团队复盘"],
    deliverables: ["验收报告", "结项报告", "项目复盘总结", "知识库文档"],
    raci: { R: "PM", A: "PMO", C: "客户/质量/销售", I: "财务/研发" },
    avgDays: 7,
    feishuTable: "项目结项表",
  },
  {
    id: "S11",
    name: "回款管理",
    desc: "管理项目回款进度与应收账款",
    entry: ["合同签约/里程碑达成", "发票开具申请"],
    exit: ["全部款项收回", "财务归档完成"],
    tasks: ["应收账款跟踪", "发票开具", "回款确认", "逾期催收", "对账管理"],
    deliverables: ["回款计划表", "发票记录", "回款凭证", "应收账款报表"],
    raci: { R: "财务", A: "PM/PMO", C: "销售/客户", I: "法务" },
    avgDays: 15,
    feishuTable: "回款管理表",
  },
  {
    id: "S12",
    name: "运营运维",
    desc: "项目交付后的持续运营与支持",
    entry: ["项目结项", "运维交接完成"],
    exit: ["运维合同到期/续签", "运营指标达标"],
    tasks: ["运维团队交接", "运营指标监控", "满意度回访", "续费/续签跟进", "运维报告"],
    deliverables: ["运维交接单", "运营月报", "满意度调查报告", "续签意向书"],
    raci: { R: "运维", A: "PMO", C: "客户/销售", I: "PM/研发" },
    avgDays: 90,
    feishuTable: "运营运维表",
  },
];

// Simulated project progress data for demo
const DEMO_PROJECTS = [
  { name: "某中学智慧校园项目", currentStage: 6, stageStatus: Array(12).fill("").map((_, i) => i < 6 ? "completed" : i === 6 ? "current" : "upcoming") },
  { name: "某省政务云平台项目", currentStage: 9, stageStatus: Array(12).fill("").map((_, i) => i < 9 ? "completed" : i === 9 ? "current" : "upcoming") },
  { name: "某三甲医院HIS系统", currentStage: 3, stageStatus: Array(12).fill("").map((_, i) => i < 3 ? "completed" : i === 3 ? "current" : "upcoming") },
  { name: "某职校数字化校园", currentStage: 1, stageStatus: Array(12).fill("").map((_, i) => i < 1 ? "completed" : i === 1 ? "current" : "upcoming") },
];

// RACI matrix summary
const RACI_ROLES = ["PMO", "PM", "销售", "解决方案", "研发/交付", "客户", "财务", "法务"];

function getStageColor(status: string) {
  switch (status) {
    case "completed": return "var(--green)";
    case "current": return "var(--accent)";
    case "blocked": return "var(--red)";
    default: return "var(--text2)";
  }
}

function getStageBg(status: string) {
  switch (status) {
    case "completed": return "rgba(16,185,129,0.15)";
    case "current": return "rgba(59,130,246,0.2)";
    case "blocked": return "rgba(239,68,68,0.15)";
    default: return "rgba(148,163,184,0.08)";
  }
}

function getStageBorder(status: string) {
  switch (status) {
    case "completed": return "rgba(16,185,129,0.4)";
    case "current": return "var(--accent)";
    case "blocked": return "rgba(239,68,68,0.5)";
    default: return "var(--border)";
  }
}

function getStageFeishuTableKey(stageId: string): FeishuTableKey {
  if (stageId === "S05" || stageId === "S06") return "contract";
  if (stageId === "S11") return "payment";
  if (stageId === "S03") return "cost";
  if (stageId === "S08" || stageId === "S09" || stageId === "S10") return "milestone";
  if (stageId === "S12") return "task";
  return "project";
}

// AI bottleneck analysis
const BOTTLENECK_DATA = STAGES.map(s => ({
  ...s,
  avgDays: s.avgDays + Math.floor(Math.random() * 10 - 5), // Add some variance for demo
})).sort((a, b) => b.avgDays - a.avgDays);

export default function LTCPage() {
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState(0);
  const [showBottleneck, setShowBottleneck] = useState(false);
  const [activeTab, setActiveTab] = useState<"flow" | "raci" | "bottleneck">("flow");

  const project = DEMO_PROJECTS[selectedProject];
  const stageStatuses = project.stageStatus;

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
        <span style={{ fontWeight: 700 }}>🔄 LTC全流程管理</span>
        <span className="tag tag-blue">飞书 + AI</span>
      </header>

      <main style={{ flex: 1, padding: "28px 32px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>

        {/* Project Selector */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px 24px",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              当前项目
            </div>
            {DEMO_PROJECTS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setSelectedProject(i); setSelectedStage(null); }}
                style={{
                  padding: "6px 16px",
                  borderRadius: 20,
                  border: i === selectedProject ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: i === selectedProject ? "rgba(59,130,246,0.15)" : "transparent",
                  color: i === selectedProject ? "var(--accent2)" : "var(--text2)",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "flow", label: "📊 流程图" },
            { key: "raci", label: "👥 RACI矩阵" },
            { key: "bottleneck", label: "🧠 AI瓶颈分析" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key as typeof activeTab); setShowBottleneck(tab.key === "bottleneck"); }}
              style={{
                padding: "10px 20px",
                borderRadius: "8px 8px 0 0",
                border: "1px solid var(--border)",
                borderBottom: activeTab === tab.key ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: activeTab === tab.key ? "var(--surface)" : "rgba(255,255,255,0.02)",
                color: activeTab === tab.key ? "var(--text)" : "var(--text2)",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Flow View */}
        {activeTab === "flow" && (
          <div>
            {/* Flow Diagram */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "28px 24px",
              marginBottom: 24,
              overflowX: "auto",
            }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 24, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 8 }}>
                <span>12阶段流程图</span>
                <span style={{ display: "flex", gap: 12, marginLeft: 16, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--green)" }} />已完成
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)" }} />进行中
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--text2)" }} />待开始
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--red)" }} />已阻塞
                  </span>
                </span>
              </div>

              {/* Horizontal flow */}
              <div style={{ display: "flex", gap: 0, minWidth: 900 }}>
                {STAGES.map((stage, idx) => {
                  const status = stageStatuses[idx] as string;
                  const isSelected = selectedStage === idx;
                  return (
                    <div key={stage.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                      {/* Stage node */}
                      <div
                        onClick={() => setSelectedStage(isSelected ? null : idx)}
                        style={{
                          flex: 1,
                          minWidth: 72,
                          background: getStageBg(status),
                          border: isSelected ? `2px solid ${getStageBorder(status)}` : `1px solid ${getStageBorder(status)}`,
                          borderRadius: 8,
                          padding: "10px 6px",
                          textAlign: "center",
                          cursor: "pointer",
                          transition: "all 0.2s",
                          position: "relative",
                        }}
                      >
                        <div style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          color: getStageColor(status),
                          marginBottom: 4,
                        }}>
                          {stage.id}
                        </div>
                        <div style={{
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          color: status === "upcoming" ? "var(--text2)" : "var(--text)",
                          lineHeight: 1.3,
                          minHeight: 28,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          {stage.name}
                        </div>
                        {status === "current" && (
                          <div style={{
                            position: "absolute",
                            top: -6,
                            right: -6,
                            width: 12,
                            height: 12,
                            borderRadius: "50%",
                            background: "var(--accent)",
                            border: "2px solid var(--surface)",
                            animation: "pulse 2s infinite",
                          }} />
                        )}
                      </div>
                      {/* Connector arrow */}
                      {idx < STAGES.length - 1 && (
                        <div style={{
                          width: 16,
                          height: 2,
                          background: stageStatuses[idx + 1] === "completed" ? "var(--green)" : "var(--border)",
                          flexShrink: 0,
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage Detail Panel */}
            {selectedStage !== null && (() => {
              const stage = STAGES[selectedStage];
              const status = stageStatuses[selectedStage];
              return (
                <div style={{
                  background: "var(--surface)",
                  border: `1px solid ${getStageBorder(status)}`,
                  borderRadius: "var(--radius)",
                  padding: "28px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>{stage.id}</span>
                        <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>{stage.name}</span>
                        <span className={`tag tag-${status === "completed" ? "green" : status === "current" ? "blue" : "amber"}`} style={{ fontSize: "0.7rem" }}>
                          {status === "completed" ? "已完成" : status === "current" ? "进行中" : "待开始"}
                        </span>
                      </div>
                      <p style={{ color: "var(--text2)", fontSize: "0.88rem" }}>{stage.desc}</p>
                    </div>
                    <button
                      onClick={() => setSelectedStage(null)}
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        padding: "6px 14px",
                        color: "var(--text2)",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      关闭
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    {/* Entry/Exit Conditions */}
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>入点条件</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {stage.entry.map((e, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", flexShrink: 0 }} />
                            {e}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginTop: 16, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>出点条件</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {stage.exit.map((e, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                            {e}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Tasks & Deliverables */}
                    <div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>关键任务</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                        {stage.tasks.map((t, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem" }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", color: "var(--text2)", flexShrink: 0 }}>{i + 1}</div>
                            {t}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>阶段产出</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {stage.deliverables.map((d, i) => (
                          <div key={i} style={{ fontSize: "0.85rem", color: "var(--text2)", paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
                            {d}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RACI for this stage */}
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text2)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>本阶段RACI</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                      {Object.entries(stage.raci).map(([role, name]) => (
                        <div key={role} style={{
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "10px 14px",
                          textAlign: "center",
                        }}>
                          <div style={{ fontSize: "0.72rem", color: "var(--text2)", marginBottom: 4 }}>{role}</div>
                          <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{name}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Feishu link */}
                  <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
                    <a
                      href={feishuTableUrl(getStageFeishuTableKey(stage.id))}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 20px",
                        background: "rgba(51,112,255,0.15)",
                        border: "1px solid rgba(51,112,255,0.3)",
                        borderRadius: 8,
                        color: "var(--feishu)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      📋 打开飞书 {stage.feishuTable}
                    </a>
                    <span style={{ color: "var(--text2)", fontSize: "0.78rem" }}>进入该阶段的实际数据录入</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* RACI Matrix View */}
        {activeTab === "raci" && (
          <div style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "28px",
          }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 20, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              LTC全流程RACI责任矩阵
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 800 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--border)" }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--text2)", fontWeight: 600 }}>阶段</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>PMO</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>PM</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>销售</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>解决方案</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>研发/交付</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>客户</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>财务</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--text2)", fontWeight: 600 }}>法务</th>
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((stage, idx) => (
                    <tr key={stage.id} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontWeight: 700, color: "var(--accent2)" }}>{stage.id}</span>
                        <span style={{ marginLeft: 6, color: "var(--text)" }}>{stage.name}</span>
                      </td>
                      {["PMO", "PM", "销售", "解决方案", "研发/交付", "客户", "财务", "法务"].map(role => {
                        let val = "";
                        Object.entries(stage.raci).forEach(([k, v]) => {
                          if (v === role || (role === "PMO" && k === "A")) return;
                        });
                        // Find the RACI letter
                        let letter = "";
                        if (stage.raci.R === role && stage.raci.A !== role) letter = "R";
                        if (stage.raci.A === role) letter = "A";
                        if (stage.raci.C === role && stage.raci.A !== role && stage.raci.R !== role) letter = "C";
                        if (stage.raci.I === role && stage.raci.A !== role && stage.raci.R !== role && stage.raci.C !== role) letter = "I";
                        if (role === "PMO" && stage.raci.A === "PMO") letter = "A";
                        if (role === "PM" && stage.raci.A === "PM") letter = "A";
                        if (role === "销售" && stage.raci.A === "销售") letter = "A";

                        const bgColor = letter === "A" ? "rgba(59,130,246,0.2)" : letter === "R" ? "rgba(16,185,129,0.15)" : letter === "C" ? "rgba(245,158,11,0.12)" : "transparent";
                        const textColor = letter === "A" ? "var(--accent2)" : letter === "R" ? "var(--green)" : letter === "C" ? "var(--amber)" : "var(--text2)";
                        return (
                          <td key={role} style={{ padding: "8px 12px", textAlign: "center" }}>
                            {letter ? (
                              <span style={{
                                display: "inline-block",
                                width: 24,
                                height: 24,
                                lineHeight: "24px",
                                borderRadius: 6,
                                background: bgColor,
                                color: textColor,
                                fontWeight: 700,
                                fontSize: "0.75rem",
                              }}>
                                {letter}
                              </span>
                            ) : (
                              <span style={{ color: "var(--border)", fontSize: "0.7rem" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 20, marginTop: 20, fontSize: "0.78rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: "rgba(59,130,246,0.2)", color: "var(--accent2)", fontWeight: 700, textAlign: "center", lineHeight: "20px", fontSize: "0.7rem" }}>A</span>
                <span style={{ color: "var(--text2)" }}>A = 决策/批准</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: "rgba(16,185,129,0.15)", color: "var(--green)", fontWeight: 700, textAlign: "center", lineHeight: "20px", fontSize: "0.7rem" }}>R</span>
                <span style={{ color: "var(--text2)" }}>R = 执行</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: "rgba(245,158,11,0.12)", color: "var(--amber)", fontWeight: 700, textAlign: "center", lineHeight: "20px", fontSize: "0.7rem" }}>C</span>
                <span style={{ color: "var(--text2)" }}>C = 咨询</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 20, height: 20, borderRadius: 4, background: "transparent", color: "var(--text2)", fontWeight: 700, textAlign: "center", lineHeight: "20px", fontSize: "0.7rem" }}>I</span>
                <span style={{ color: "var(--text2)" }}>I = 知会</span>
              </span>
            </div>
          </div>
        )}

        {/* AI Bottleneck Analysis */}
        {activeTab === "bottleneck" && (
          <div>
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "28px",
              marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: "1.3rem" }}>🧠</span>
                <div>
                  <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em" }}>AI流程瓶颈分析</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text2)", marginTop: 2 }}>基于所有项目在各阶段的平均耗时，识别流程瓶颈</div>
                </div>
              </div>

              <div style={{
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.2)",
                borderRadius: 8,
                padding: "16px 20px",
                marginBottom: 20,
                fontSize: "0.85rem",
                color: "var(--text2)",
                lineHeight: 1.7,
              }}>
                📊 分析范围：{DEMO_PROJECTS.length} 个项目 | 12个阶段 | 时间跨度：过去6个月
                <br />
                ⚠️ 当前识别瓶颈：S03方案建设（平均15天）、S04招投标（平均20天）、S09项目实施（平均60天）
              </div>

              {/* Stage time bars */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
                {BOTTLENECK_DATA.map((stage, idx) => {
                  const maxDays = Math.max(...BOTTLENECK_DATA.map(s => s.avgDays));
                  const pct = (stage.avgDays / maxDays) * 100;
                  const isBottleneck = stage.avgDays > 20;
                  return (
                    <div key={stage.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text2)" }}>{stage.id}</span>
                          <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>{stage.name}</span>
                          {isBottleneck && (
                            <span style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 10,
                              background: "rgba(239,68,68,0.15)",
                              color: "var(--red)",
                              fontSize: "0.68rem",
                              fontWeight: 700,
                            }}>
                              ⚠ 瓶颈
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                          <div style={{ flex: 1, height: 20, background: "var(--surface2)", borderRadius: 6, overflow: "hidden" }}>
                            <div style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: isBottleneck
                                ? "linear-gradient(90deg, var(--amber), var(--red))"
                                : "linear-gradient(90deg, var(--accent), var(--green))",
                              borderRadius: 6,
                              transition: "width 0.5s ease",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: 8,
                            }}>
                              <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "white", whiteSpace: "nowrap" }}>
                                {stage.avgDays}天
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI Recommendations */}
              <div style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "20px 24px",
              }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  💡 AI优化建议
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "0.88rem", lineHeight: 1.7, color: "var(--text2)" }}>
                  <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderLeft: "3px solid var(--amber)", borderRadius: "0 6px 6px 0" }}>
                    <span style={{ color: "var(--amber)", fontWeight: 600 }}>S04招投标</span> 平均耗时 20 天，为最长阶段。建议：引入招标模板库，标准化投标响应文件，将平均耗时压缩至 12 天以内。
                  </div>
                  <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", borderLeft: "3px solid var(--amber)", borderRadius: "0 6px 6px 0" }}>
                    <span style={{ color: "var(--amber)", fontWeight: 600 }}>S09项目实施</span> 平均耗时 60 天，建议分阶段验收（每2周一次Sprint Review），加速交付反馈循环。
                  </div>
                  <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", borderLeft: "3px solid var(--green)", borderRadius: "0 6px 6px 0" }}>
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>S08项目规划</span> 平均耗时仅 5 天，效率优秀。建议将此阶段快速规划方法论推广至全组织。
                  </div>
                </div>
              </div>
            </div>

            {/* Parallel Sign-off Section */}
            <div style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "28px",
              marginBottom: 24,
            }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text2)", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🔀 条件分支与并行会签配置
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "16px 20px",
                }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>标品项目跳过规则</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem", color: "var(--text2)", lineHeight: 1.6 }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--red)", fontWeight: 600 }}>S06 合同管理</span>
                      <span>跳过条件：</span>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>项目类型="标品"</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ color: "var(--red)", fontWeight: 600 }}>S03 方案建设</span>
                      <span>跳过条件：</span>
                      <span style={{ color: "var(--green)", fontWeight: 600 }}>产品类型="标准产品"</span>
                    </div>
                  </div>
                </div>
                <div style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "16px 20px",
                }}>
                  <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>并行会签阶段</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "0.82rem", color: "var(--text2)", lineHeight: 1.6 }}>
                    <div>
                      <span style={{ color: "var(--accent2)", fontWeight: 600 }}>S01 商机立项</span>
                      <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.8rem" }}>
                        并行审批人：销售总监 / PMO / 解决方案负责人
                      </div>
                    </div>
                    <div>
                      <span style={{ color: "var(--accent2)", fontWeight: 600 }}>S02 需求调研与评审</span>
                      <div style={{ marginTop: 4, color: "var(--text2)", fontSize: "0.8rem" }}>
                        并行会签人：客户代表 / 技术负责人 / 交付负责人
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Feishu Integration Banner */}
        <div style={{
          background: "linear-gradient(135deg, rgba(51,112,255,0.1), rgba(51,112,255,0.05))",
          border: "1px solid rgba(51,112,255,0.2)",
          borderRadius: "var(--radius)",
          padding: "20px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 8,
          flexWrap: "wrap",
          gap: 16,
        }}>
          <div>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>📋 飞书多维表格数据同步</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text2)" }}>
              所有流程数据存储在飞书多维表格，点击阶段可直接跳转至对应数据表进行实际数据录入与管理
            </div>
          </div>
          <a
            href={FEISHU_BASE_HOME_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 24px",
              background: "var(--feishu)",
              color: "white",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.88rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            打开飞书数据平台
          </a>
        </div>
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
