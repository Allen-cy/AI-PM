import { getCurrentUser } from "@/features/auth/server";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { buildFinanceCockpit } from "@/features/finance/cockpit";
import { persistAiEvidence } from "@/features/ai/evidence-repository";
import { withAuditResult } from "@/features/ai/evidence";
import { buildRiskClosureDashboard } from "@/features/risk/closure";
import { buildRiskIntegrationDashboard } from "@/features/risk/integration";
import { buildRiskRetrospectiveDashboard } from "@/features/risk/retrospective";
import { listRiskRetrospectiveGovernanceFollowups } from "@/features/risk/retrospective-governance-followups";
import { buildRiskRetrospectiveGovernanceFollowupClosureDashboard } from "@/features/risk/retrospective-governance-followup-workbench";
import { buildRiskSensitivityImpactDashboard } from "@/features/risk/sensitivity-impact";
import { filterDashboardByProjectAccess, projectAccessMode } from "@/features/security/authorization";
import { loadProjectAccessGrantsForUser, writeOperationAudit } from "@/features/security/repository";
import { buildGovernanceImpactDashboard } from "@/features/governance/impact";
import { listGovernanceInstances } from "@/features/governance/repository";
import { buildKnowledgeOperationDashboard } from "@/features/knowledge/operations";
import { createKnowledgeOutputReference } from "@/features/knowledge/lifecycle-repository";
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
import { listRisks } from "@/lib/risk-repository";
import { authorizeRiskRequest } from "@/features/risk/access";
import { filterRiskScopedProjectRecords } from "@/features/risk/scope";
import { buildDashboardData } from "@/features/dashboard/normalizer";
import { getLatestFormalOutputVersion, listFormalBusinessOutputs, saveFormalReportWithSnapshot } from "@/features/formal-output/repository";

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

function snapshotTypeFor(type: ReportRequest["type"], subjectScope: string) {
  if (type === "weekly" && ["project", "portfolio"].includes(subjectScope)) return "weekly" as const;
  if (type === "monthly" && ["portfolio", "organization"].includes(subjectScope)) return "monthly" as const;
  return "ad_hoc" as const;
}

function outputKeyFor(type: ReportRequest["type"], periodStart: string) {
  return `report:${type}:${periodStart}`;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const riskAccess = await authorizeRiskRequest(request, "read");
  if (!riskAccess.ok) return jsonResponse({ success: false, error: riskAccess.error, detail: riskAccess.detail, request_id: requestId }, riskAccess.status, requestId);
  const result = await listFormalBusinessOutputs({
    orgId: riskAccess.scope.orgId, subjectScope: riskAccess.scope.subjectScope, subjectId: riskAccess.scope.subjectId,
    projectId: riskAccess.scope.requestedProjectId ?? null, dataClass: riskAccess.scope.dataClass,
    outputTypes: ["generated_report"], limit: 100,
  });
  if (result.status !== "succeeded") return jsonResponse({ success: false, status: result.status, error: "REPORT_HISTORY_UNAVAILABLE", detail: result.warning, request_id: requestId }, result.status === "not_configured" ? 503 : 500, requestId);
  const reports = (result.data ?? []).map(output => {
    const stored = output.structuredPayload.report;
    const report = stored && typeof stored === "object" && !Array.isArray(stored) ? stored as Record<string, unknown> : {};
    return {
      ...report,
      id: String(report.id || output.id), title: String(report.title || output.title), content: output.content,
      generatedAt: String(report.generatedAt || output.createdAt), formalOutputId: output.id,
      reportingSnapshotId: output.reportingSnapshotId || undefined, formalStatus: output.status, version: output.version,
    };
  });
  return jsonResponse({ success: true, status: "succeeded", reports, source: { type: "supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) {
    return jsonResponse({ success: false, status: "unauthorized", error: "请先登录后再生成报告。", request_id: requestId }, 401, requestId);
  }
  const riskAccess = await authorizeRiskRequest(request, "read");
  if (!riskAccess.ok) {
    return jsonResponse({ success: false, error: riskAccess.error, detail: riskAccess.detail, request_id: requestId }, riskAccess.status, requestId);
  }
  if (!["pm", "operations", "pmo"].includes(riskAccess.scope.businessRole)) {
    return jsonResponse({ success: false, error: "REPORT_CREATE_ROLE_FORBIDDEN", detail: "仅项目经理、运营和PMO可创建正式汇报成果。", request_id: requestId }, 403, requestId);
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
  if (!effective.config) {
    return jsonResponse({
      success: false,
      status: "not_configured",
      error: "REPORT_DATA_SOURCE_UNAVAILABLE",
      detail: effective.setupHint || "请先配置飞书项目台账。",
      request_id: requestId,
    }, 503, requestId);
  }
  let rawDashboard: Awaited<ReturnType<typeof loadDashboardFromFeishu>>;
  try {
    rawDashboard = await loadDashboardFromFeishu(effective.config, { dataClass: riskAccess.scope.dataClass });
  } catch {
    return jsonResponse({
      success: false,
      status: "source_failed",
      error: "REPORT_DATA_SOURCE_UNAVAILABLE",
      detail: "飞书项目台账读取失败，本次不会使用样例数据生成正式报告。",
      request_id: requestId,
    }, 503, requestId);
  }
  if (rawDashboard.records.length === 0) {
    return jsonResponse({
      success: false,
      status: "source_empty",
      error: "REPORT_DATA_SOURCE_UNAVAILABLE",
      detail: "飞书项目台账为空，本次不会使用样例数据生成正式报告。",
      request_id: requestId,
    }, 422, requestId);
  }
  const grants = await loadProjectAccessGrantsForUser(effective.user);
  const grantedDashboard = filterDashboardByProjectAccess(rawDashboard, effective.user, grants);
  const scopedRecords = filterRiskScopedProjectRecords(grantedDashboard.records, riskAccess.scope);
  const dashboard = buildDashboardData(scopedRecords, { type: grantedDashboard.source.type, name: grantedDashboard.source.name, note: grantedDashboard.source.note }, { useTemplateFallback: false });
  if (dashboard.records.length === 0) {
    return jsonResponse({
      success: false,
      status: "scope_empty",
      error: "REPORT_SCOPE_EMPTY",
      detail: "当前业务身份没有已归类、已映射且可访问的项目台账，本次不会用0项目生成正式报告。",
      request_id: requestId,
    }, 422, requestId);
  }
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
  let riskResult: Awaited<ReturnType<typeof listRisks>>;
  try {
    riskResult = await listRisks(riskAccess.scope);
  } catch {
    return jsonResponse({
      success: false,
      status: "source_failed",
      error: "REPORT_DATA_SOURCE_UNAVAILABLE",
      detail: "风险登记册读取失败，本次不会使用内置风险生成正式报告。",
      request_id: requestId,
    }, 503, requestId);
  }
  const riskIntegration = buildRiskIntegrationDashboard({
    risks: riskResult.risks,
    dashboard,
  });
  const riskSensitivityImpact = buildRiskSensitivityImpactDashboard(dashboard);
  const riskClosure = buildRiskClosureDashboard(riskResult.risks, riskResult.events);
  const riskRetrospective = buildRiskRetrospectiveDashboard(riskResult.risks, riskResult.events, riskClosure);
  const governanceFollowupResult = await listRiskRetrospectiveGovernanceFollowups(120, riskAccess.scope);
  const riskRetrospectiveGovernanceFollowups = buildRiskRetrospectiveGovernanceFollowupClosureDashboard({
    followups: governanceFollowupResult.followups,
    warning: "warning" in governanceFollowupResult ? governanceFollowupResult.warning : undefined,
  });
  const context: ReportFactoryContext = {
    dashboard,
    finance,
    sourceLabel: "飞书项目台账",
    sourceStatus: "live",
    model: "configured-llm",
    governanceImpact,
    riskIntegration,
    riskSensitivityImpact,
    riskClosure,
    riskRetrospective,
    riskRetrospectiveGovernanceFollowups,
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
  const report = createGeneratedReport({
    request: body,
    content,
    evidence,
    dataSources: dataPackage.dataSources,
    actionItems,
    requestId,
  });
  const generatedAt = new Date().toISOString();
  const periodStart = body.dateRange?.start || generatedAt.slice(0, 10);
  const periodEnd = body.dateRange?.end || generatedAt.slice(0, 10);
  const outputKey = outputKeyFor(body.type, periodStart);
  const currentVersion = await getLatestFormalOutputVersion({
    orgId: riskAccess.scope.orgId, subjectScope: riskAccess.scope.subjectScope, subjectId: riskAccess.scope.subjectId,
    dataClass: riskAccess.scope.dataClass, outputKey,
  });
  if (currentVersion.status !== "succeeded") return jsonResponse({ success: false, status: currentVersion.status, error: "REPORT_OUTPUT_STORAGE_UNAVAILABLE", detail: currentVersion.warning, request_id: requestId }, currentVersion.status === "not_configured" ? 503 : 500, requestId);
  const sourceDefinition = {
    type: "report_factory",
    report_type: body.type,
    sources: dataPackage.dataSources,
    model: context.model,
    evidence_id: evidence.id,
    source_status: context.sourceStatus,
  };
  const saved = await saveFormalReportWithSnapshot({
    orgId: riskAccess.scope.orgId, subjectScope: riskAccess.scope.subjectScope, subjectId: riskAccess.scope.subjectId,
    projectId: riskAccess.scope.requestedProjectId ?? (riskAccess.scope.subjectScope === "project" ? riskAccess.scope.subjectId : null),
    dataClass: riskAccess.scope.dataClass, outputType: "generated_report", outputKey, title: report.title,
    contentType: "text/markdown", content: report.content,
    structuredPayload: { report, request: body, generation_status: status, access }, sourceDefinition, sourceSnapshotAt: generatedAt,
    actor: user, actorBusinessRole: riskAccess.scope.businessRole,
    idempotencyKey: `v634:report:${requestId}`, expectedVersion: currentVersion.data ?? 0,
    snapshotType: snapshotTypeFor(body.type, riskAccess.scope.subjectScope), periodStart, periodEnd,
    metrics: { visible_projects: access.visible_projects, total_projects: access.total_projects, project_fact_count: dataPackage.projectFacts.length, finance_fact_count: dataPackage.financeFacts.length, risk_fact_count: dataPackage.riskFacts.length },
    exceptions: [
      ...dataPackage.riskFacts.map(description => ({ type: "risk", description })),
      ...context.finance.alerts.map(alert => ({ type: "finance", title: alert.title, owner: alert.owner, due_date: alert.dueDate, priority: alert.priority })),
    ],
    narrative: dataPackage.executiveSummary,
  });
  if (saved.status !== "succeeded" || !saved.data) return jsonResponse({ success: false, status: saved.status, error: "REPORT_FORMAL_PERSIST_FAILED", detail: saved.warning, request_id: requestId }, saved.status === "conflict" ? 409 : saved.status === "not_configured" ? 503 : 500, requestId);
  report.formalOutputId = saved.data.output.id;
  report.reportingSnapshotId = String(saved.data.snapshot.id || "");
  report.formalStatus = saved.data.output.status;
  report.version = saved.data.output.version;
  const operationAudit = await writeOperationAudit({
    user,
    action: "report_generate",
    resourceType: "formal_business_output",
    resourceId: saved.data.output.id,
    status: "succeeded",
    severity: body.type === "monthly" ? "medium" : "low",
    summary: `生成并留档${REPORT_TYPE_LABELS[body.type]}：${body.projectName}`,
    detail: { report_type: body.type, access, output_version: saved.data.output.version, reporting_snapshot_id: saved.data.snapshot.id },
    requestId,
  });
  const knowledgeReferences = [];
  const knowledgeDashboard = buildKnowledgeOperationDashboard();
  for (const item of knowledgeDashboard.items.filter(entry => entry.impactedModules.includes("报告工厂")).slice(0, 5)) {
    const knowledgeSaved = await createKnowledgeOutputReference({
      outputType: "report",
      outputId: saved.data.output.id,
      outputTitle: report.title,
      moduleName: "报告工厂",
      pageId: item.pageId,
      citationText: `报告「${report.title}」生成时引用报告工厂相关知识口径：${item.title} / ${item.version}`,
      confidence: status === "generated" ? 0.82 : 0.65,
      user,
      requestId,
    }).catch(error => ({ status: "failed" as const, warning: error instanceof Error ? error.message : String(error), requestId }));
    if (knowledgeSaved.status === "succeeded") knowledgeReferences.push(knowledgeSaved.reference);
  }

  return jsonResponse({
    success: true,
    status,
    report,
    formal_output_id: saved.data.output.id,
    reporting_snapshot_id: saved.data.snapshot.id,
    evidence,
    access,
    knowledge_references: knowledgeReferences,
    operation_audit: operationAudit,
    data_sources: dataPackage.dataSources,
    action_items: actionItems,
    request_id: requestId,
  }, 200, requestId);
}
