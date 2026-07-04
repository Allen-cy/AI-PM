import { getCurrentUser } from "@/features/auth/server";
import { DEFAULT_DASHBOARD_DATA } from "@/features/dashboard/normalizer";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildFinanceCockpit } from "@/features/finance/cockpit";
import { persistAiEvidence } from "@/features/ai/evidence-repository";
import { withAuditResult } from "@/features/ai/evidence";
import { buildRiskIntegrationDashboard } from "@/features/risk/integration";
import { buildRiskSensitivityImpactDashboard } from "@/features/risk/sensitivity-impact";
import { filterDashboardByProjectAccess, projectAccessMode } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser, writeOperationAudit } from "@/features/security/repository";
import { buildGovernanceImpactDashboard } from "@/features/governance/impact";
import { listGovernanceInstances } from "@/features/governance/repository";
import {
  buildReportEvidence,
  buildReportFactoryPackage,
  createGeneratedReport,
  extractMeetingActionItems,
  fallbackReportContent,
  type ReportFactoryContext,
} from "@/features/reports/factory";
import { llmComplete } from "@/lib/llm";
import { REPORT_TYPE_LABELS, type ReportActionItem, type ReportRequest } from "@/lib/reports";
import { initialRisks } from "@/lib/risk";
import { listRisks } from "@/lib/risk-repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function systemPrompt(type: ReportRequest["type"]): string {
  const common = `你是PMO项目管理专家。请基于用户输入和系统提供的数据包生成中文Markdown报告。
约束：
1. 不编造数据；所有数字必须来自数据包或用户输入。
2. 如数据包标注为估算或兜底，报告中必须说明。
3. 报告末尾必须包含“数据来源与生成边界”。
4. 输出结构要适合PM/PMO直接复核和转发。`;
  const specific: Record<ReportRequest["type"], string> = {
    weekly: "生成项目周报：执行摘要、本周完成、计划偏差、风险问题、下周计划、需协调事项。",
    monthly: "生成PMO月报：组合概览、项目分布、经营指标、重大风险、治理动作、下月重点。",
    progress: "生成项目进度报告：当前阶段、里程碑、偏差分析、关键路径风险、下一步计划。",
    meeting: "生成会议纪要：会议结论、决议、行动项表格、未决事项、后续跟进。",
    acceptance: "生成验收报告：验收范围、交付物对照、问题遗留、验收结论、签字栏。",
  };
  return `${common}\n${specific[type]}`;
}

function userPrompt(request: ReportRequest, dataPackage: ReturnType<typeof buildReportFactoryPackage>, actionItems: ReportActionItem[]): string {
  return [
    `报告类型：${REPORT_TYPE_LABELS[request.type]}`,
    `对象：${request.projectName}`,
    request.dateRange ? `期间：${request.dateRange.start} 至 ${request.dateRange.end}` : "",
    `语气：${request.tone}`,
    "",
    "## 系统数据包",
    dataPackage.executiveSummary,
    "",
    "### 项目事实",
    ...(dataPackage.projectFacts.length > 0 ? dataPackage.projectFacts : dataPackage.portfolioFacts).map(item => `- ${item}`),
    "",
    "### 业财事实",
    ...dataPackage.financeFacts.map(item => `- ${item}`),
    "",
    "### 风险/预警",
    ...(dataPackage.riskFacts.length > 0 ? dataPackage.riskFacts : ["- 暂无高优先级风险线索"]),
    "",
    "## 用户输入",
    `本期完成/会议要点：${request.completedWork || "未填写"}`,
    `下期计划/待决事项：${request.nextPlans || "未填写"}`,
    `问题风险/遗留问题：${request.issues || "无"}`,
    `资源需求：${request.resourceNeeds || "无"}`,
    "",
    "## 候选行动项",
    ...(actionItems.length > 0 ? actionItems.map(item => `- ${item.title}｜${item.owner}｜${item.dueDate}｜${item.priority}`) : ["- 暂无"]),
    "",
    "请输出完整Markdown报告。",
  ].filter(Boolean).join("\n");
}

function actionItemsFor(request: ReportRequest, context: ReportFactoryContext): ReportActionItem[] {
  if (request.type === "meeting") {
    return extractMeetingActionItems([request.completedWork, request.nextPlans, request.issues].filter(Boolean).join("\n"), request.projectName);
  }
  const financeActions = context.finance.alerts.slice(0, 4).map(alert => ({
    title: alert.title,
    owner: alert.owner,
    dueDate: alert.dueDate,
    priority: alert.priority,
    sourceReason: alert.reason,
  }));
  const riskActions = context.riskIntegration?.links
    .flatMap(link => link.actions.slice(0, 2))
    .slice(0, 4)
    .map(action => ({
      title: action.title,
      owner: action.owner,
      dueDate: action.dueDate,
      priority: action.priority,
      sourceReason: action.sourceReason,
    })) ?? [];
  return [...financeActions, ...riskActions].slice(0, 8);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ success: false, status: "unauthorized", error: "请先登录后再生成报告。", request_id: requestId }, 401, requestId);
  }

  let body: ReportRequest;
  try {
    body = await request.json() as ReportRequest;
  } catch {
    return jsonResponse({ success: false, error: "请求 JSON 格式错误。", request_id: requestId }, 400, requestId);
  }
  if (!body.type || !body.projectName?.trim()) {
    return jsonResponse({ success: false, error: "缺少必填字段：type, projectName", request_id: requestId }, 400, requestId);
  }

  const effective = await getEffectiveFeishuConfig();
  const rawDashboard = effective.config
    ? await loadDashboardFromFeishu(effective.config).catch(() => DEFAULT_DASHBOARD_DATA)
    : DEFAULT_DASHBOARD_DATA;
  const grants = await loadProjectAccessGrantsForUser(effective.user);
  const dashboard = filterDashboardByProjectAccess(rawDashboard, effective.user, grants);
  const access = {
    mode: projectAccessMode(effective.user, dashboard.records.length, rawDashboard.records.length),
    visible_projects: dashboard.records.length,
    total_projects: rawDashboard.records.length,
    explicit_grants: grants.length,
  };
  const finance = buildFinanceCockpit(dashboard);
  const governanceResult = await listGovernanceInstances(50);
  const governanceImpact = governanceResult.status === "succeeded"
    ? buildGovernanceImpactDashboard(governanceResult.instances)
    : undefined;
  const riskResult = await listRisks().catch(() => ({ risks: initialRisks, events: [], source: "memory" as const }));
  const riskIntegration = buildRiskIntegrationDashboard({
    risks: riskResult.risks,
    dashboard,
  });
  const riskSensitivityImpact = buildRiskSensitivityImpactDashboard(dashboard);
  const context: ReportFactoryContext = {
    dashboard,
    finance,
    sourceLabel: effective.config ? "飞书项目台账" : "样例数据源",
    sourceStatus: effective.config ? "live" : "fallback",
    model: "configured-llm",
    governanceImpact,
    riskIntegration,
    riskSensitivityImpact,
  };
  const dataPackage = buildReportFactoryPackage(body, context);
  const actionItems = actionItemsFor(body, context);

  let content: string;
  let status: "generated" | "fallback" = "generated";
  try {
    const result = await llmComplete("report", systemPrompt(body.type), userPrompt(body, dataPackage, actionItems), { temperature: 0.45 });
    content = result.content;
    context.model = result.model;
  } catch {
    status = "fallback";
    context.model = "rule-based-fallback";
    content = fallbackReportContent(body, dataPackage, actionItems);
  }

  let evidence = buildReportEvidence({ request: body, context, dataPackage, actionItems, status });
  const audit = await persistAiEvidence({ evidence, user, requestId, metadata: { route: "/api/reports", report_type: body.type } });
  evidence = withAuditResult(evidence, audit.status === "succeeded" ? { status: "succeeded", id: audit.id } : { status: audit.status, warning: audit.warning });
  const operationAudit = await writeOperationAudit({
    user,
    action: "report_generate",
    resourceType: "report",
    resourceId: requestId,
    status: "succeeded",
    severity: body.type === "monthly" ? "medium" : "low",
    summary: `生成${REPORT_TYPE_LABELS[body.type]}：${body.projectName}`,
    detail: { report_type: body.type, access },
    requestId,
  });
  const report = createGeneratedReport({
    request: body,
    content,
    evidence,
    dataSources: dataPackage.dataSources,
    actionItems,
    requestId,
  });

  return jsonResponse({
    success: true,
    status,
    report,
    evidence,
    access,
    operation_audit: operationAudit,
    data_sources: dataPackage.dataSources,
    action_items: actionItems,
    request_id: requestId,
  }, 200, requestId);
}
