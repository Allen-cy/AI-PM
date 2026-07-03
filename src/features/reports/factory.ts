import { createAiEvidence, type AiEvidence } from "../ai/evidence.ts";
import type { DashboardData } from "../dashboard/types.ts";
import type { FinanceCockpit } from "../finance/cockpit.ts";
import type { GovernanceImpactDashboard } from "../governance/impact.ts";
import {
  generateReportId,
  REPORT_TYPE_LABELS,
  type GeneratedReport,
  type ReportActionItem,
  type ReportDataSource,
  type ReportRequest,
} from "../../lib/reports.ts";

export interface ReportFactoryContext {
  dashboard: DashboardData;
  finance: FinanceCockpit;
  sourceLabel: string;
  sourceStatus: "live" | "fallback";
  model: string;
  governanceImpact?: GovernanceImpactDashboard;
}

export interface ReportFactoryPackage {
  executiveSummary: string;
  projectFacts: string[];
  portfolioFacts: string[];
  financeFacts: string[];
  riskFacts: string[];
  dataSources: ReportDataSource[];
}

function dateByOffset(days = 1): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number): string {
  return `${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}万`;
}

function percent(value: number): string {
  return `${Number(value || 0).toFixed(1)}%`;
}

function clip(text: string, max = 600): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function isPortfolioReport(type: ReportRequest["type"]): boolean {
  return type === "monthly";
}

export function buildReportFactoryPackage(request: ReportRequest, context: ReportFactoryContext): ReportFactoryPackage {
  const dashboard = context.dashboard;
  const finance = context.finance;
  const selectedProject = dashboard.records.find(item => item.项目名称 === request.projectName)
    ?? dashboard.records.find(item => item.项目名称.includes(request.projectName) || request.projectName.includes(item.项目名称));
  const selectedFinance = finance.projects.find(item => item.name === selectedProject?.项目名称 || item.name === request.projectName);
  const riskCount = dashboard.riskProjects.length;
  const p0AlertCount = finance.alerts.filter(item => item.priority === "P0").length;
  const executiveSummary = isPortfolioReport(request.type)
    ? `项目组合共${dashboard.kpi.totalProjects}个项目，合同额${money(dashboard.kpi.totalContract)}，回款率${percent(dashboard.kpi.collectionRate)}，经营预警${finance.alerts.length}项。`
    : selectedProject
      ? `${selectedProject.项目名称} 当前状态为${selectedProject.项目状态}，进度${percent((selectedProject.当前进度 > 1 ? selectedProject.当前进度 / 100 : selectedProject.当前进度) * 100)}，应收${money(selectedProject.应收金额)}。`
      : `${request.projectName} 未在当前项目台账中精确匹配，报告将结合用户输入和组合数据生成。`;

  const projectFacts = selectedProject ? [
    `项目编号：${selectedProject.项目编号}`,
    `客户：${selectedProject.客户名称}`,
    `状态/等级：${selectedProject.项目状态}/${selectedProject.项目等级}`,
    `当前进度：${percent((selectedProject.当前进度 > 1 ? selectedProject.当前进度 / 100 : selectedProject.当前进度) * 100)}`,
    `合同/已回款/应收：${money(selectedProject.合同金额)} / ${money(selectedProject.已回款金额)} / ${money(selectedProject.应收金额)}`,
    `风险：${selectedProject.风险等级} · ${selectedProject.风险类型} · ${selectedProject.风险趋势}`,
  ] : [];

  const financeFacts = [
    `组合合同额：${money(finance.kpis.totalContract)}`,
    `预计毛利率：${percent(finance.kpis.grossMarginRate)}`,
    `回款率：${percent(finance.kpis.collectionRate)}`,
    `应收金额：${money(finance.kpis.receivable)}`,
    `逾期应收：${money(finance.kpis.overdueReceivable)}`,
    `验收阻塞回款：${money(finance.kpis.acceptanceBlockedReceivable)}`,
    ...(selectedFinance ? [
      `本项目经营健康：${selectedFinance.businessHealth}`,
      `本项目预计毛利率：${percent(selectedFinance.grossMarginRate)}`,
      `本项目下一步：${selectedFinance.nextAction}`,
    ] : []),
  ];

  const portfolioFacts = [
    `项目数：${dashboard.kpi.totalProjects}`,
    `重点项目：${dashboard.keyProjects.length}`,
    `风险项目：${riskCount}`,
    `即将/待回款项目：${dashboard.upcomingPayments.length}`,
    `P0经营预警：${p0AlertCount}`,
  ];

  const riskFacts = [
    ...dashboard.riskProjects.slice(0, 5).map(item => `${item.name}：${item.severity} · ${item.riskType} · ${item.trend}`),
    ...finance.alerts.slice(0, 5).map(item => `${item.priority} · ${item.projectName}：${item.title}`),
    ...(context.governanceImpact?.reportFacts.slice(0, 6).map(item => `治理联动：${item}`) ?? []),
  ];

  const dataSources: ReportDataSource[] = [
    {
      label: "用户录入",
      detail: "报告类型、项目/组合名称、完成事项、下期计划、问题风险、资源需求。",
      source: "user_input",
    },
    {
      label: context.sourceLabel,
      detail: `${dashboard.source.name}；项目${dashboard.records.length}条，风险${dashboard.riskProjects.length}条，回款提醒${dashboard.upcomingPayments.length}条。`,
      source: context.sourceStatus === "live" ? "feishu" : "fallback",
    },
    {
      label: "业财经营驾驶舱",
      detail: `合同、成本、回款、应收、毛利、验收阻塞和经营预警；成本口径=${finance.source.costBasis}。`,
      source: "system",
    },
    {
      label: "治理工作流与审批联动",
      detail: context.governanceImpact
        ? `治理联动包${context.governanceImpact.summary.totalImpacts}个，项目写回建议${context.governanceImpact.summary.projectWritebacks}条，风险写回建议${context.governanceImpact.summary.riskWritebacks}条，待确认${context.governanceImpact.summary.pendingConfirmation}项。`
        : "未读取到治理工作流数据；报告不引用治理审批结果。",
      source: "system",
    },
    {
      label: "AI依据审计",
      detail: "报告生成会返回 evidence；如果已执行 P6 SQL，会尝试写入 Supabase 审计表。",
      source: "ai",
    },
  ];

  return { executiveSummary, projectFacts, portfolioFacts, financeFacts, riskFacts, dataSources };
}

export function extractMeetingActionItems(text: string, projectName: string): ReportActionItem[] {
  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  const actions: ReportActionItem[] = [];
  for (const line of lines) {
    const parts = line.split("|").map(item => item.trim()).filter(Boolean);
    if (parts.length >= 2) {
      actions.push({
        title: parts[0],
        owner: parts[1] || "项目经理",
        dueDate: parts[2] || dateByOffset(3),
        priority: (["P0", "P1", "P2"].includes(parts[3]) ? parts[3] : "P1") as "P0" | "P1" | "P2",
        sourceReason: `会议纪要解析：${line}`,
      });
      continue;
    }
    if (/待办|行动项|需|需要|协调|跟进|完成|确认|提交|复核/.test(line)) {
      actions.push({
        title: line.replace(/^待办[:：]?/, "").trim(),
        owner: "项目经理",
        dueDate: dateByOffset(3),
        priority: /阻塞|逾期|高风险|紧急|P0/.test(line) ? "P0" : "P1",
        sourceReason: `会议纪要自动识别：${line}`,
      });
    }
  }
  if (actions.length === 0 && text.trim()) {
    actions.push({
      title: `复核${projectName}会议纪要并补齐行动项`,
      owner: "项目经理",
      dueDate: dateByOffset(2),
      priority: "P1",
      sourceReason: "会议纪要未识别到结构化待办，需要人工补齐责任人和deadline。",
    });
  }
  return actions.slice(0, 10);
}

export function buildReportEvidence(input: {
  request: ReportRequest;
  context: ReportFactoryContext;
  dataPackage: ReportFactoryPackage;
  actionItems: ReportActionItem[];
  status: "generated" | "fallback";
}): AiEvidence {
  const citations = input.dataPackage.dataSources.map(item => item.label);
  return createAiEvidence({
    scene: "report",
    title: `${input.request.projectName || "项目/组合"}${REPORT_TYPE_LABELS[input.request.type]}生成依据`,
    model: input.context.model,
    status: input.status,
    confidence: input.context.sourceStatus === "live" ? "medium" : "low",
    inputSummary: clip([
      `报告类型：${REPORT_TYPE_LABELS[input.request.type]}`,
      `对象：${input.request.projectName}`,
      `用户输入：完成事项${input.request.completedWork ? "已填写" : "未填写"}，计划${input.request.nextPlans ? "已填写" : "未填写"}，问题风险${input.request.issues ? "已填写" : "未填写"}`,
      input.dataPackage.executiveSummary,
    ].join("；")),
    outputSummary: `生成${REPORT_TYPE_LABELS[input.request.type]}，引用${citations.length}类数据源，识别${input.actionItems.length}条可转行动项。`,
    basis: [
      { label: "用户录入", detail: "报告对象、周期、完成事项、计划、风险问题和资源需求。", source: "user_input" },
      { label: "业务数据", detail: input.dataPackage.executiveSummary, source: input.context.sourceStatus === "live" ? "feishu" : "system_template" },
      { label: "业财口径", detail: input.dataPackage.financeFacts.slice(0, 4).join("；"), source: "rule" },
      { label: "治理审批依据", detail: input.context.governanceImpact?.reportFacts.slice(0, 4).join("；") || "当前无治理审批联动事实。", source: "rule" },
      { label: "生成边界", detail: "报告不编造财务结果；估算项必须保留口径说明，正式报告提交前需人工复核。", source: "rule" },
    ],
    sourceRefs: [
      { type: "project", name: input.request.projectName },
      { type: "system", name: "报告工厂" },
      { type: "system", name: "业财一体化经营驾驶舱" },
    ],
    citations,
    suggestedActions: input.actionItems.map(item => ({
      title: item.title,
      owner: item.owner,
      dueDate: item.dueDate,
      priority: item.priority,
      sourceReason: item.sourceReason,
    })),
  });
}

export function fallbackReportContent(request: ReportRequest, dataPackage: ReportFactoryPackage, actionItems: ReportActionItem[]): string {
  const title = `${request.projectName} - ${REPORT_TYPE_LABELS[request.type]}`;
  const actionTable = actionItems.length > 0
    ? actionItems.map(item => `| ${item.title} | ${item.owner} | ${item.dueDate} | ${item.priority} |`).join("\n")
    : "| 暂无 | - | - | - |";
  return [
    `# ${title}`,
    "",
    "## 一、执行摘要",
    dataPackage.executiveSummary,
    "",
    "## 二、项目/组合事实",
    ...(dataPackage.projectFacts.length > 0 ? dataPackage.projectFacts : dataPackage.portfolioFacts).map(item => `- ${item}`),
    "",
    "## 三、业财经营情况",
    ...dataPackage.financeFacts.map(item => `- ${item}`),
    "",
    "## 四、风险与问题",
    ...(dataPackage.riskFacts.length > 0 ? dataPackage.riskFacts : ["暂无高优先级风险线索。"]).map(item => `- ${item}`),
    "",
    "## 五、用户补充",
    `- 本期完成：${request.completedWork || "未填写"}`,
    `- 下期计划：${request.nextPlans || "未填写"}`,
    `- 问题风险：${request.issues || "无"}`,
    `- 资源需求：${request.resourceNeeds || "无"}`,
    "",
    "## 六、行动项",
    "| 事项 | 责任人 | 截止日期 | 优先级 |",
    "| --- | --- | --- | --- |",
    actionTable,
    "",
    "## 七、数据来源与生成边界",
    ...dataPackage.dataSources.map(item => `- ${item.label}：${item.detail}`),
    "",
    "> 本报告由系统根据当前数据包生成；估算项仅作管理预警，正式提交前需要人工复核。",
  ].join("\n");
}

export function createGeneratedReport(input: {
  request: ReportRequest;
  content: string;
  evidence: AiEvidence;
  dataSources: ReportDataSource[];
  actionItems: ReportActionItem[];
  requestId: string;
}): GeneratedReport {
  return {
    id: generateReportId(),
    type: input.request.type,
    title: `${input.request.projectName} - ${REPORT_TYPE_LABELS[input.request.type]}`,
    content: input.content,
    generatedAt: new Date().toISOString(),
    projectName: input.request.projectName,
    dataSources: input.dataSources,
    actionItems: input.actionItems,
    evidence: input.evidence,
    requestId: input.requestId,
  };
}
