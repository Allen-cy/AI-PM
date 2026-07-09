import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  dataQualityRules,
  deriveWorkbenchSummary,
  governanceWorkflows,
  operatingDependencies,
} from '../src/features/pmo-operating-system.ts';
import {
  diagnoseIntegrationState,
  evaluateDataQuality,
  evaluateFeishuFieldMappings,
} from '../src/features/operating-system/diagnostics.ts';
import {
  aiConnectionFailureActions,
  classifyAiConnectionHttpFailure,
} from '../src/features/ai/connection-test.ts';
import {
  buildFeishuConfigCompletenessSteps,
  summarizeFeishuConnectionSteps,
  writeCheckStep,
} from '../src/features/feishu/connection-test.ts';
import {
  buildFeishuActionPreview,
  validateFeishuActionBody,
} from '../src/features/feishu/action-payload.ts';
import { buildKnowledgeOperationDashboard } from '../src/features/knowledge/operations.ts';
import {
  buildFeishuConfirmationBatchRiskReview,
  buildFeishuConfirmationQueueSummary,
  buildFeishuConfirmationRiskReview,
  canManageFeishuActionConfirmation,
  type FeishuActionConfirmationRecord,
} from '../src/features/feishu/action-confirmations.ts';
import { buildOperationalWorkbench } from '../src/features/operating-system/workbench.ts';
import {
  buildRiskRetrospectiveGovernanceFollowupClosureDashboard,
  buildRiskRetrospectiveGovernanceFollowupOperationReport,
  buildRiskRetrospectiveGovernanceFollowupWorkbench,
} from '../src/features/risk/retrospective-governance-followup-workbench.ts';
import {
  maskFeishuReceiveId,
  reminderLogKey,
} from '../src/features/risk/retrospective-governance-operation-utils.ts';
import {
  buildRiskRetrospectiveGovernanceOperationHistorySummary,
  suppressRiskRetrospectiveGovernanceReminderDraftsForWeek,
} from '../src/features/risk/retrospective-governance-operation-analytics.ts';
import { buildKnowledgeGovernanceWorkflowCandidate } from '../src/features/risk/retrospective-governance-workflow-candidate.ts';
import { buildKnowledgeGovernanceWritebackRecommendation } from '../src/features/risk/retrospective-governance-evidence-chain-model.ts';
import {
  buildGovernanceReport,
  deriveGovernanceNextState,
  initialGovernanceState,
  parseGovernanceActionItems,
} from '../src/features/governance/model.ts';
import {
  buildGovernanceSlaDashboard,
  deriveGovernanceSla,
} from '../src/features/governance/sla.ts';
import {
  buildGovernanceAuditCollectionMarkdown,
  buildGovernanceAuditPackage,
  filterGovernanceAuditInstances,
  redactGovernanceAuditText,
} from '../src/features/governance/audit-package.ts';
import {
  buildGovernanceImpactDashboard,
  buildGovernanceImpactPackage,
} from '../src/features/governance/impact.ts';
import {
  evaluateGovernanceStrategy,
  GOVERNANCE_STRATEGY_VERSION,
  listGovernanceStrategyCatalog,
} from '../src/features/governance/strategy.ts';
import {
  buildIssueChangeChainReport,
  deriveChangeNextStatus,
  deriveIssueNextStatus,
  parseUnifiedActionItems,
  riskToIssueDraft,
} from '../src/features/issue-change/model.ts';
import {
  buildBusinessCaseEvidence,
  buildExecutionSummaryEvidence,
  buildRiskScanEvidence,
} from '../src/features/ai/evidence.ts';
import { buildFinanceCockpit } from '../src/features/finance/cockpit.ts';
import { buildRiskEscalationDraftDashboard } from '../src/features/risk/escalation.ts';
import { buildRiskIntegrationDashboard } from '../src/features/risk/integration.ts';
import { buildRiskSensitivityImpactDashboard } from '../src/features/risk/sensitivity-impact.ts';
import {
  buildRiskClosureDashboard,
  buildRiskClosurePackage,
  validateRiskClosureReview,
} from '../src/features/risk/closure.ts';
import { buildRiskRetrospectiveDashboard } from '../src/features/risk/retrospective.ts';
import {
  buildRiskRetrospectiveAssetDuplicateWarnings,
  buildRiskRetrospectiveAssetMergePreview,
  buildRiskRetrospectiveAssetUpdatePayload,
  buildRiskRetrospectiveRecommendations,
  buildRiskRetrospectiveAssetDraft,
  riskRetrospectiveAssetToRagDocument,
} from '../src/features/risk/retrospective-assets.ts';
import { buildRiskRetrospectiveKnowledgeExport } from '../src/features/risk/retrospective-knowledge-sync.ts';
import { buildRiskRetrospectiveGovernanceDashboard, type RiskRetrospectiveGovernanceLog } from '../src/features/risk/retrospective-governance.ts';
import { buildRiskRetrospectiveQualityDashboard } from '../src/features/risk/retrospective-quality.ts';
import {
  buildReportEvidence,
  buildReportFactoryPackage,
  extractMeetingActionItems,
  fallbackReportContent,
} from '../src/features/reports/factory.ts';
import { queryRagWithAdditionalDocuments } from '../src/features/rag/provider.ts';
import {
  filterDashboardByProjectAccess,
  hasPermission,
  PERMISSION_DEFINITIONS,
  projectAccessMode,
  recordMatchesProjectGrant,
  ROLE_PERMISSION_MATRIX,
} from '../src/features/security/authorization.ts';
import { buildSecurityCsv, buildSecurityMarkdown } from '../src/features/security/export.ts';
import { isMissingSecurityTableError } from '../src/features/security/errors.ts';
import {
  deliveryControlPoints,
  deliveryPhases,
  getBlueprintSummary,
  monitoringTracks,
  salesStages,
} from '../src/lib/delivery-blueprint.ts';
import {
  assessMigrationReadiness,
  migrationDataObjects,
  migrationReadinessAreas,
  migrationStages,
} from '../src/features/migration/readiness.ts';
import {
  analyzeMigrationRows,
  buildMigrationFieldMappingReuseCheck,
  buildMigrationRemediationActions,
  buildMigrationReviewReport,
  buildMigrationTemplateSheets,
  summarizeMigrationBatch,
} from '../src/features/migration/package.ts';
import {
  buildMigrationBatchComparison,
  buildMigrationBatchComparisonReport,
} from '../src/features/migration/batch-comparison.ts';
import {
  buildMigrationCutoverDecision,
  buildMigrationCutoverDecisionReport,
  defaultMigrationCutoverManualChecks,
} from '../src/features/migration/cutover-decision.ts';
import { POST as analyzeMigrationPackage } from '../src/app/api/migration/analyze/route.ts';
import { POST as downloadMigrationBatchComparisonReport } from '../src/app/api/migration/batch-comparison/report/route.ts';
import { POST as downloadMigrationCutoverDecisionReport } from '../src/app/api/migration/cutover-decision/report/route.ts';
import { POST as downloadMigrationReport } from '../src/app/api/migration/report/route.ts';
import { GET as downloadMigrationTemplate } from '../src/app/api/migration/template/route.ts';
import type { Risk } from '../src/lib/risk.ts';
import type { DashboardData } from '../src/features/dashboard/types.ts';

test('operating system dependencies cover data ai knowledge and storage', () => {
  const categories = new Set(operatingDependencies.map(item => item.category));

  assert.equal(categories.has('data'), true);
  assert.equal(categories.has('ai'), true);
  assert.equal(categories.has('knowledge'), true);
  assert.equal(categories.has('storage'), true);
  assert.equal(operatingDependencies.every(item => item.action.length > 0), true);
});

test('delivery management blueprint models sales project monitoring and cost dependencies', () => {
  const summary = getBlueprintSummary();
  assert.deepEqual(summary, {
    salesStages: 7,
    projectPhases: 4,
    controlPoints: 10,
    monitoringTracks: 3,
    toolSupports: 5,
  });
  assert.deepEqual(salesStages.map(stage => stage.name), ['商机', '合同签约', '合同/订单', '回款计划', '应收', '核销', '售后服务']);
  assert.deepEqual(deliveryPhases.map(phase => phase.name), ['项目立项', '项目规划', '项目执行', '项目收尾']);
  assert.equal(deliveryPhases.every(phase => phase.costGate && phase.nodes.every(node => node.output && node.evidence)), true);
  assert.equal(deliveryControlPoints.some(point => point.title.includes('里程碑') && point.output.includes('回款')), true);
  assert.equal(monitoringTracks.every(track => track.purpose && track.evidence), true);
  const nodeChildren = new Map(deliveryPhases.flatMap(phase => phase.nodes.map(node => [node.id, node.children ?? []])));
  assert.deepEqual(nodeChildren.get('wbs'), ['任务管理', 'WBS物料管理']);
  assert.deepEqual(nodeChildren.get('resource-plan'), ['人力资源计划', '采购计划', '物料计划', '外包计划']);
  assert.deepEqual(nodeChildren.get('budget-approval'), ['拆解详细预算']);
  assert.deepEqual(nodeChildren.get('progress'), ['周报汇报', '周报工时管理']);
  assert.deepEqual(nodeChildren.get('resource'), ['人力资源管理', '采购管理', '物料管理']);
  assert.deepEqual(nodeChildren.get('milestone'), ['里程碑验收']);
});

test('delivery management blueprint remains a separate BPM subpage with arrow flow links', () => {
  const homeSource = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const deliveryPageSource = readFileSync(new URL('../src/app/blueprint-v3/delivery-management/page.tsx', import.meta.url), 'utf8');
  assert.match(homeSource, /href: "\/blueprint-v3"/);
  assert.doesNotMatch(homeSource, /href: "\/blueprint-v3\/delivery-management"[\s\S]*title: "蓝图v2-BPM视图"/);
  assert.match(deliveryPageSource, /项目全流程交付管理蓝图/);
  assert.match(deliveryPageSource, /BPM泳道流程图/);
  assert.match(deliveryPageSource, /flowLinks/);
  assert.match(deliveryPageSource, /markerEnd/);
  assert.match(deliveryPageSource, /controlAnnotations/);
  for (const label of ['①预立项申请', '⑤合同付款条件\\+SOW生成里程碑节点', '⑩项目移交到CSM']) {
    assert.match(deliveryPageSource, new RegExp(label));
  }
  assert.match(deliveryPageSource, /node\.children/);
  assert.match(deliveryPageSource, /ChildTaskNodeView/);
  assert.doesNotMatch(deliveryPageSource, /这里需.*里程碑/);
});

test('governance workflows define inputs outputs owners states and audit trail', () => {
  const governancePageSource = readFileSync(new URL('../src/app/governance-workflows/GovernanceWorkflowsClient.tsx', import.meta.url), 'utf8');
  const governanceRouteSource = readFileSync(new URL('../src/app/api/governance/workflows/route.ts', import.meta.url), 'utf8');
  const governanceAuditRouteSource = readFileSync(new URL('../src/app/api/governance/audit-package/route.ts', import.meta.url), 'utf8');
  const governanceStrategyRouteSource = readFileSync(new URL('../src/app/api/governance/strategy/route.ts', import.meta.url), 'utf8');
  const governanceRepositorySource = readFileSync(new URL('../src/features/governance/repository.ts', import.meta.url), 'utf8');
  const workbenchPageSource = readFileSync(new URL('../src/app/workbench/page.tsx', import.meta.url), 'utf8');
  const pmoPageSource = readFileSync(new URL('../src/app/pmo/page.tsx', import.meta.url), 'utf8');

  assert.equal(governanceWorkflows.length >= 5, true);
  for (const workflow of governanceWorkflows) {
    assert.ok(workflow.owner);
    assert.ok(workflow.approver);
    assert.equal(workflow.inputs.length > 0, true);
    assert.equal(workflow.outputs.length > 0, true);
    assert.equal(workflow.states.length > 0, true);
    assert.ok(workflow.auditTrail);
  }
  assert.match(governanceRouteSource, /buildGovernanceSlaDashboard/);
  assert.match(governanceRouteSource, /buildGovernanceImpactDashboard/);
  assert.match(governanceRouteSource, /buildRiskRetrospectiveGovernanceOperationHistorySummary/);
  assert.match(governanceRouteSource, /governance_knowledge_operation/);
  assert.match(governanceRouteSource, /buildKnowledgeGovernanceWorkflowCandidate/);
  assert.match(governanceRouteSource, /workflowCandidates/);
  assert.match(governancePageSource, /治理 SLA 与待我处理/);
  assert.match(governancePageSource, /治理结果业务联动/);
  assert.match(governancePageSource, /知识治理运营趋势/);
  assert.match(governancePageSource, /处理率/);
  assert.match(governancePageSource, /知识治理升级候选流程/);
  assert.match(governancePageSource, /带入创建表单/);
  assert.match(governancePageSource, /知识治理证据链/);
  assert.match(governancePageSource, /生成反写建议/);
  assert.match(governancePageSource, /确认反写待办/);
  assert.match(governancePageSource, /\/api\/risk\/retrospective\/assets\/governance\/followups\/evidence-chain/);
  assert.match(governancePageSource, /治理审计包导出/);
  assert.match(governancePageSource, /治理策略配置与预览/);
  assert.match(governancePageSource, /\/api\/governance\/strategy/);
  assert.match(governancePageSource, /\/api\/governance\/audit-package/);
  assert.match(governancePageSource, /未设 SLA/);
  assert.match(governanceAuditRouteSource, /governanceAuditCollectionMarkdown/);
  assert.match(governanceStrategyRouteSource, /evaluateGovernanceStrategy/);
  assert.match(governanceRepositorySource, /governance_strategy/);
  assert.match(workbenchPageSource, /待我处理治理事项/);
  assert.match(workbenchPageSource, /\/api\/governance\/workflows/);
  assert.match(workbenchPageSource, /知识治理待办/);
  assert.match(workbenchPageSource, /转统一行动项/);
  assert.match(workbenchPageSource, /riskRetrospectiveGovernanceFollowups/);
  assert.match(pmoPageSource, /知识治理运营/);
  assert.match(pmoPageSource, /负责人 Top 追踪/);
  assert.match(pmoPageSource, /evidenceCompletenessRate/);
});

test('governance strategy previews require classification fields before recommending workflows', () => {
  const preview = evaluateGovernanceStrategy({
    projectName: '策略预览项目',
    projectType: '',
    riskLevel: '',
  }, { baseDate: new Date('2026-07-03T00:00:00.000Z') });

  assert.equal(preview.status, 'needs_input');
  assert.equal(preview.recommendation, null);
  assert.equal(preview.blockers.some(item => item.includes('项目等级')), true);
  assert.equal(preview.blockers.some(item => item.includes('项目类型')), true);
  assert.equal(preview.blockers.some(item => item.includes('风险等级')), true);
  assert.match(preview.strategy.historyBoundary, /历史治理流程/);
});

test('governance strategy recommends strong stage gates for S key high risk projects', () => {
  const preview = evaluateGovernanceStrategy({
    projectName: '战略重点项目A',
    projectLevel: 'S级',
    projectType: '信息化交付',
    riskLevel: '高',
    isKeyProject: true,
    currentStage: '执行',
  }, { baseDate: new Date('2026-07-03T00:00:00.000Z') });

  assert.equal(preview.status, 'ready');
  assert.equal(preview.recommendation?.strategyVersion, GOVERNANCE_STRATEGY_VERSION);
  assert.equal(preview.recommendation?.ruleId, 's-key-high-risk');
  assert.equal(preview.recommendation?.primaryWorkflowId, 'stage-gate-review');
  assert.equal(preview.recommendation?.recommendedWorkflowIds.includes('risk-escalation'), true);
  assert.equal(preview.recommendation?.priority, 'high');
  assert.equal(preview.recommendation?.deadlineDays, 1);
  assert.equal(preview.recommendation?.deadlineDate, '2026-07-04');
  assert.equal(preview.recommendation?.creationDefaults.strategyRuleId, 's-key-high-risk');

  const catalog = listGovernanceStrategyCatalog();
  assert.equal(catalog.version, GOVERNANCE_STRATEGY_VERSION);
  assert.equal(catalog.rules.some(rule => rule.id === 'c-level-governance'), true);
});

test('data quality rules include high severity closure prerequisites', () => {
  assert.equal(dataQualityRules.some(rule => rule.severity === 'high' && rule.id === 'risk-without-action'), true);
});

test('migration center models competitor migration conditions and data onboarding gates', () => {
  assert.equal(migrationReadinessAreas.length >= 7, true);
  assert.equal(migrationReadinessAreas.reduce((sum, area) => sum + area.weight, 0), 100);
  assert.equal(migrationStages.map(stage => stage.id).join('>'), 'inventory>mapping>trial-import>pilot>cutover>operate');
  assert.equal(migrationDataObjects.some(object => object.name === '项目台账' && object.requiredFields.includes('项目经理')), true);
  assert.equal(migrationDataObjects.some(object => object.name === '合同与回款' && object.qualityChecks.some(check => check.includes('合同额'))), true);

  const trial = assessMigrationReadiness(['process-coverage', 'data-portability', 'security']);
  assert.equal(trial.level, 'trial-ready');
  assert.match(trial.summary, /小批量数据试迁移|流程回放/);

  const ready = assessMigrationReadiness(migrationReadinessAreas.map(area => area.id));
  assert.equal(ready.level, 'migration-ready');
  assert.equal(ready.score, 100);
});

test('migration package analyzer maps aliases and flags trial data quality issues', () => {
  const analysis = analyzeMigrationRows('项目台账', [
    { '项目ID': 'P-001', '项目名称': '迁移项目A', PM: '张三', 状态: '进行中', 计划开始: '2026-07-01', 计划完成: '2026-08-01', 合同额: '100000' },
    { '项目ID': 'P-001', '项目名称': '迁移项目B', PM: '', 状态: '进行中', 计划开始: '错误日期', 计划完成: '2026-08-10', 合同额: 'abc' },
  ], new Date('2026-07-02T00:00:00.000Z'));

  assert.equal(analysis.fieldCoverage.rate, 100);
  assert.deepEqual(analysis.sourceFields, ['项目ID', '项目名称', 'PM', '状态', '计划开始', '计划完成', '合同额']);
  assert.equal(analysis.mappings.some(mapping => mapping.targetField === '项目经理' && mapping.status === 'alias' && mapping.sourceField === 'PM'), true);
  assert.equal(analysis.qualityIssues.some(issue => issue.id === 'duplicate-项目编号' && issue.severity === 'high'), true);
  assert.equal(analysis.qualityIssues.some(issue => issue.id === 'invalid-date-计划开始日期'), true);
  assert.equal(analysis.qualityIssues.some(issue => issue.id === 'invalid-amount-合同金额'), true);
  assert.equal(analysis.canTrialImport, false);

  const templates = buildMigrationTemplateSheets();
  assert.equal(templates.some(sheet => sheet.name === '项目台账' && sheet.headers.includes('项目经理')), true);
});

test('migration field mapping profile reuse check surfaces differences before reuse', () => {
  const first = analyzeMigrationRows('项目台账', [
    { 项目编号: 'P-001', 项目名称: '项目A', 项目经理: '张三', 项目状态: '进行中', 计划开始日期: '2026-07-01', 计划完成日期: '2026-08-01', 合同金额: '100000' },
  ], new Date('2026-07-03T00:00:00.000Z'));
  const current = analyzeMigrationRows('项目台账', [
    { 项目ID: 'P-002', 项目名称: '项目B', PM: '李四', 状态: '进行中', 计划开始: '2026-07-01', 计划完成: '2026-08-01', 合同额: '200000', 额外字段: '新增' },
  ], new Date('2026-07-03T00:00:00.000Z'));

  const reuse = buildMigrationFieldMappingReuseCheck({
    id: 'profile-1',
    profileName: '项目台账标准字段方案',
    objectName: '项目台账',
    mappings: first.mappings,
    sourceFields: first.sourceFields,
    requiredFields: first.mappings.map(mapping => mapping.targetField),
    fieldCoverageRate: first.fieldCoverage.rate,
  }, current);

  assert.equal(reuse.objectName, '项目台账');
  assert.equal(reuse.changedCount > 0, true);
  assert.equal(reuse.sourceFieldsAdded.includes('额外字段'), true);
  assert.equal(reuse.warnings.some(warning => warning.includes('字段映射与当前文件不一致')), true);
  assert.equal(reuse.differences.some(item => item.targetField === '项目经理' && item.profileSourceField === '项目经理' && item.currentSourceField === 'PM'), true);
});

test('migration APIs provide template download and CSV trial analysis', async () => {
  const templateResponse = await downloadMigrationTemplate();
  assert.equal(templateResponse.status, 200);
  assert.match(templateResponse.headers.get('Content-Disposition') ?? '', /ai-pmo-migration-template\.xlsx/);

  const csv = [
    '项目编号,项目名称,项目经理,项目状态,计划开始日期,计划完成日期,合同金额',
    'P-001,试迁移项目,张三,进行中,2026-07-01,2026-08-01,100000',
  ].join('\n');
  const form = new FormData();
  form.append('objectName', '项目台账');
  form.append('file', new File([csv], 'migration.csv', { type: 'text/csv' }));
  const response = await analyzeMigrationPackage(new Request('http://localhost/api/migration/analyze', { method: 'POST', body: form }));
  assert.equal(response.status, 200);
  const payload = await response.json() as { status: string; analysis: { canTrialImport: boolean; fieldCoverage: { rate: number } } };
  assert.equal(payload.status, 'succeeded');
  assert.equal(payload.analysis.canTrialImport, true);
  assert.equal(payload.analysis.fieldCoverage.rate, 100);
});

test('migration batch persistence keeps trial analysis metrics and audit hooks discoverable', () => {
  const analysis = analyzeMigrationRows('风险/问题/变更', [
    { 事项类型: '风险', 严重程度: '高', 应对动作: '', 责任人: '李四', 复核日期: '2026-07-31' },
  ], new Date('2026-07-02T00:00:00.000Z'));
  const metrics = summarizeMigrationBatch(analysis);
  const batchRouteSource = readFileSync(new URL('../src/app/api/migration/batches/route.ts', import.meta.url), 'utf8');
  const batchSql = readFileSync(new URL('../supabase-v5313-migration-batches.sql', import.meta.url), 'utf8');

  assert.equal(metrics.totalRows, 1);
  assert.equal(metrics.highIssueCount > 0, true);
  assert.equal(metrics.canTrialImport, false);
  assert.match(batchRouteSource, /migration_batch_save/);
  assert.match(batchRouteSource, /writeOperationAudit/);
  assert.match(batchSql, /create table if not exists migration_trial_batches/);
  assert.match(batchSql, /analysis jsonb/);
  assert.match(batchSql, /next_actions jsonb/);
});

test('migration batch comparison reports trend and remediation closure rate', async () => {
  const batches = [
    {
      id: 'batch-1',
      batchName: '项目台账第一轮',
      objectName: '项目台账',
      fileName: 'round1.xlsx',
      totalRows: 20,
      fieldCoverageRate: 80,
      missingRequiredFields: 2,
      qualityIssueCount: 6,
      highIssueCount: 2,
      canTrialImport: false,
      analysis: {} as never,
      nextActions: [],
      createdByName: 'PMO',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'batch-2',
      batchName: '项目台账第二轮',
      objectName: '项目台账',
      fileName: 'round2.xlsx',
      totalRows: 20,
      fieldCoverageRate: 100,
      missingRequiredFields: 0,
      qualityIssueCount: 1,
      highIssueCount: 0,
      canTrialImport: true,
      analysis: {} as never,
      nextActions: [],
      createdByName: 'PMO',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ];
  const actions = [
    { id: 'a1', batchId: 'batch-2', batchName: '项目台账第二轮', objectName: '项目台账', status: '已关闭' },
    { id: 'a2', batchId: 'batch-2', batchName: '项目台账第二轮', objectName: '项目台账', status: '已关闭' },
  ] as never;

  const comparison = buildMigrationBatchComparison({
    objectName: '项目台账',
    batches,
    remediationActions: actions,
    now: new Date('2026-07-03T00:00:00.000Z'),
  });
  const markdown = buildMigrationBatchComparisonReport(comparison);

  assert.equal(comparison.snapshots.length, 2);
  assert.equal(comparison.deltas[0].verdict, '改善');
  assert.equal(comparison.deltas[0].coverageDelta, 20);
  assert.equal(comparison.snapshots[1].remediationClosureRate, 100);
  assert.equal(comparison.goNoGo, 'Go');
  assert.match(markdown, /试迁移批次对比报告/);
  assert.match(markdown, /Go\/No-Go 建议：Go/);

  const response = await downloadMigrationBatchComparisonReport(new Request('http://localhost/api/migration/batch-comparison/report', {
    method: 'POST',
    body: JSON.stringify({ comparison }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition') ?? '', /filename\*=UTF-8''/);
  assert.match(await response.text(), /相邻批次变化/);
});

test('migration cutover decision package combines saved evidence and manual signoff checks', async () => {
  const batches = [
    {
      id: 'batch-1',
      batchName: '项目台账第一轮',
      objectName: '项目台账',
      fileName: 'round1.xlsx',
      totalRows: 20,
      fieldCoverageRate: 90,
      missingRequiredFields: 1,
      qualityIssueCount: 3,
      highIssueCount: 1,
      canTrialImport: false,
      analysis: {} as never,
      nextActions: [],
      createdByName: 'PMO',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'batch-2',
      batchName: '项目台账第二轮',
      objectName: '项目台账',
      fileName: 'round2.xlsx',
      totalRows: 20,
      fieldCoverageRate: 100,
      missingRequiredFields: 0,
      qualityIssueCount: 0,
      highIssueCount: 0,
      canTrialImport: true,
      analysis: {} as never,
      nextActions: [],
      createdByName: 'PMO',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
  ];
  const actions = [
    {
      id: 'a1',
      batchId: 'batch-2',
      batchName: '项目台账第二轮',
      objectName: '项目台账',
      priority: 'P0',
      status: '已关闭',
      feishuSyncStatus: '已同步',
    },
  ] as never;
  const selectedAreaIds = migrationReadinessAreas.map(area => area.id);
  const comparison = buildMigrationBatchComparison({
    objectName: '项目台账',
    batches,
    remediationActions: actions,
    now: new Date('2026-07-03T00:00:00.000Z'),
  });
  const manualChecks = Object.fromEntries(
    Object.keys(defaultMigrationCutoverManualChecks).map(key => [key, true]),
  ) as typeof defaultMigrationCutoverManualChecks;
  const decisionPackage = buildMigrationCutoverDecision({
    objectName: '项目台账',
    readinessResult: assessMigrationReadiness(selectedAreaIds),
    selectedAreaIds,
    batchComparison: comparison,
    fieldMappingProfile: {
      id: 'profile-1',
      profileName: '项目台账正式字段映射',
      objectName: '项目台账',
      mappings: [],
      sourceFields: ['项目编号', '项目名称'],
      requiredFields: ['项目编号', '项目名称'],
      fieldCoverageRate: 100,
      matchedFieldCount: 2,
      missingFieldCount: 0,
      notes: null,
      createdByName: 'PMO',
      createdAt: '2026-07-02T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    },
    remediationActions: actions,
    manualChecks,
    now: new Date('2026-07-03T00:00:00.000Z'),
  });
  const markdown = buildMigrationCutoverDecisionReport(decisionPackage);

  assert.equal(decisionPackage.decision, 'Go');
  assert.equal(decisionPackage.blockers.length, 0);
  assert.match(markdown, /正式迁移 Go\/No-Go 决策包/);
  assert.match(markdown, /签字栏/);
  assert.match(markdown, /字段映射方案：项目台账正式字段映射/);

  const response = await downloadMigrationCutoverDecisionReport(new Request('http://localhost/api/migration/cutover-decision/report', {
    method: 'POST',
    body: JSON.stringify({ decisionPackage }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Disposition') ?? '', /Go-NoGo/);
  assert.match(await response.text(), /正式迁移检查清单/);
});

test('migration review report exports field mapping and fix checklist as markdown', async () => {
  const analysis = analyzeMigrationRows('项目台账', [
    { 项目编号: 'P-001', 项目名称: '迁移项目A', 项目经理: '', 项目状态: '进行中', 计划开始日期: '2026-07-01', 计划完成日期: '2026-08-01', 合同金额: '100000' },
  ], new Date('2026-07-02T00:00:00.000Z'));
  const markdown = buildMigrationReviewReport({ analysis, batchName: '项目台账第一轮试迁移', fileName: 'sample.csv' });

  assert.match(markdown, /# 项目台账第一轮试迁移/);
  assert.match(markdown, /字段映射确认表/);
  assert.match(markdown, /数据质量问题与修复清单/);
  assert.match(markdown, /项目经理存在空值/);
  assert.match(markdown, /迁移评审签字/);

  const response = await downloadMigrationReport(new Request('http://localhost/api/migration/report', {
    method: 'POST',
    body: JSON.stringify({ analysis, batchName: '项目台账第一轮试迁移', fileName: 'sample.csv' }),
    headers: { 'Content-Type': 'application/json' },
  }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /text\/markdown/);
  assert.match(response.headers.get('Content-Disposition') ?? '', /filename\*=UTF-8''/);
  assert.match(await response.text(), /阶段门结论/);
});

test('migration quality issues become accountable remediation actions', () => {
  const analysis = analyzeMigrationRows('项目台账', [
    { 项目编号: 'P-001', 项目名称: '迁移项目A', 项目经理: '', 项目状态: '进行中', 计划开始日期: '错误日期', 计划完成日期: '2026-08-01', 合同金额: 'abc' },
  ], new Date('2026-07-03T00:00:00.000Z'));
  const actions = buildMigrationRemediationActions(analysis);
  const report = buildMigrationReviewReport({ analysis, batchName: '项目台账整改评审' });
  const remediationRouteSource = readFileSync(new URL('../src/app/api/migration/remediation-actions/route.ts', import.meta.url), 'utf8');
  const remediationSql = readFileSync(new URL('../supabase-v5316-migration-remediation-actions.sql', import.meta.url), 'utf8');
  const feishuSyncRouteSource = readFileSync(new URL('../src/app/api/migration/remediation-actions/feishu-sync/route.ts', import.meta.url), 'utf8');
  const feishuSyncSql = readFileSync(new URL('../supabase-v5317-migration-remediation-feishu-sync.sql', import.meta.url), 'utf8');
  const mappingRouteSource = readFileSync(new URL('../src/app/api/migration/field-mappings/route.ts', import.meta.url), 'utf8');
  const mappingSql = readFileSync(new URL('../supabase-v5318-migration-field-mapping-profiles.sql', import.meta.url), 'utf8');

  assert.equal(actions.some(action => action.priority === 'P0' && action.ownerRole === '项目经理'), true);
  assert.equal(actions.every(action => action.status === '待处理' && action.dueDate >= '2026-07-04'), true);
  assert.equal(actions.some(action => action.acceptanceCriteria.includes('重新上传样本')), true);
  assert.match(report, /## 四、整改行动项/);
  assert.match(report, /责任角色/);
  assert.match(remediationRouteSource, /migration_remediation_actions_save/);
  assert.match(remediationRouteSource, /migration_remediation_action_transition/);
  assert.match(remediationSql, /create table if not exists migration_remediation_actions/);
  assert.match(remediationSql, /'待处理', '处理中', '待复检', '已关闭'/);
  assert.match(feishuSyncSql, /feishu_sync_status/);
  assert.match(feishuSyncSql, /'未同步', '待确认', '同步中', '已同步', '同步失败'/);
  assert.match(feishuSyncRouteSource, /confirm/);
  assert.match(feishuSyncRouteSource, /migration_remediation_feishu_task_prepare/);
  assert.match(feishuSyncRouteSource, /migration_remediation_feishu_task_sync/);
  assert.match(feishuSyncRouteSource, /createTask/);
  assert.match(mappingRouteSource, /migration_field_mapping_profile_save/);
  assert.match(mappingSql, /create table if not exists migration_field_mapping_profiles/);
  assert.match(mappingSql, /source_fields jsonb/);
});

test('migration center is discoverable from home and integration center', () => {
  const homeSource = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const integrationSource = readFileSync(new URL('../src/app/integration-center/page.tsx', import.meta.url), 'utf8');
  const integrationStatusPanelSource = readFileSync(new URL('../src/components/IntegrationStatusPanel.tsx', import.meta.url), 'utf8');
  const migrationPageSource = readFileSync(new URL('../src/app/migration-center/page.tsx', import.meta.url), 'utf8');
  const comparisonReportRouteSource = readFileSync(new URL('../src/app/api/migration/batch-comparison/report/route.ts', import.meta.url), 'utf8');
  const cutoverDecisionRouteSource = readFileSync(new URL('../src/app/api/migration/cutover-decision/report/route.ts', import.meta.url), 'utf8');

  assert.match(homeSource, /href: "\/migration-center"/);
  assert.match(integrationSource, /href="\/migration-center"/);
  assert.match(integrationSource, /IntegrationStatusPanel/);
  assert.match(integrationStatusPanelSource, /统一集成状态/);
  assert.match(integrationStatusPanelSource, /当前账号实际使用的 AI、飞书、RAG 和同步审计状态/);
  assert.match(migrationPageSource, /迁移与数据接入中心/);
  assert.match(migrationPageSource, /字段均要求中文口径/);
  assert.match(migrationPageSource, /\/api\/migration\/analyze/);
  assert.match(migrationPageSource, /\/api\/migration\/template/);
  assert.match(migrationPageSource, /\/api\/migration\/batches/);
  assert.match(migrationPageSource, /\/api\/migration\/report/);
  assert.match(migrationPageSource, /保存为迁移批次/);
  assert.match(migrationPageSource, /历史迁移批次/);
  assert.match(migrationPageSource, /下载评审报告\/修复清单/);
  assert.match(migrationPageSource, /整改行动项/);
  assert.match(migrationPageSource, /\/api\/migration\/remediation-actions/);
  assert.match(migrationPageSource, /保存整改行动项/);
  assert.match(migrationPageSource, /整改行动项跟踪/);
  assert.match(migrationPageSource, /待处理、处理中、待复检、已关闭/);
  assert.match(migrationPageSource, /\/api\/migration\/remediation-actions\/feishu-sync/);
  assert.match(migrationPageSource, /准备同步飞书/);
  assert.match(migrationPageSource, /确认写入飞书任务/);
  assert.match(migrationPageSource, /\/api\/migration\/field-mappings/);
  assert.match(migrationPageSource, /保存字段映射方案/);
  assert.match(migrationPageSource, /字段映射方案库/);
  assert.match(migrationPageSource, /复用差异检查/);
  assert.match(migrationPageSource, /试迁移批次对比与问题关闭率/);
  assert.match(migrationPageSource, /下载多轮试迁移对比报告/);
  assert.match(migrationPageSource, /\/api\/migration\/batch-comparison\/report/);
  assert.match(comparisonReportRouteSource, /buildMigrationBatchComparisonReport/);
  assert.match(migrationPageSource, /正式迁移前检查清单与 Go\/No-Go 决策包/);
  assert.match(migrationPageSource, /下载正式迁移 Go\/No-Go 决策包/);
  assert.match(migrationPageSource, /\/api\/migration\/cutover-decision\/report/);
  assert.match(cutoverDecisionRouteSource, /buildMigrationCutoverDecisionReport/);
});

test('workbench summary derives action priorities from dashboard facts', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书智能表', generatedAt: '2026-07-01T00:00:00.000Z' },
    kpi: {
      totalProjects: 3,
      totalContract: 100,
      totalCollection: 60,
      collectionRate: 60,
      receivable: 40,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [
      {
        id: 'P-1',
        name: '重点项目A',
        level: 'A',
        status: '进行中',
        marker: '是',
        reason: '高金额',
        executionProgress: 70,
        monitoringProgress: 50,
        closingProgress: 10,
        riskLevel: '高',
        riskType: '交付风险',
        receivable: 40,
        dependencyNote: '监控阶段落后于执行阶段，需要复核。',
      },
    ],
    riskProjects: [
      { id: 'R-1', name: '重点项目A', riskType: '交付风险', severity: '高', status: '应对中', trend: '恶化' },
    ],
    upcomingPayments: [
      { project: '重点项目A', party: '客户A', amount: 10, dueDate: '2026-07-03', daysLeft: 2 },
    ],
    records: [],
  };

  const summary = deriveWorkbenchSummary(dashboard);

  assert.equal(summary.kpis.find(item => item.label === '高风险项目')?.value, '1');
  assert.equal(summary.actions.some(action => action.priority === 'P0' && action.id === 'review-high-risks'), true);
  assert.equal(summary.keyProjects[0].name, '重点项目A');
  assert.match(summary.aiSuggestions[0].basis, /高风险项目1个/);
});

test('workbench summary gives setup action when dashboard data is unavailable', () => {
  const summary = deriveWorkbenchSummary(null);

  assert.equal(summary.actions[0].id, 'connect-feishu');
  assert.equal(summary.kpis[0].value, '待连接');
});

test('risk sensitivity impact package turns ledger facts into health and report signals', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书项目台账', generatedAt: '2026-07-04T00:00:00.000Z' },
    kpi: {
      totalProjects: 1,
      totalContract: 180,
      totalCollection: 60,
      collectionRate: 33.3,
      receivable: 120,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [
      {
        name: '高敏项目A',
        progressDev: -12,
        costHealth: 76,
        status: 'yellow',
      },
    ],
    keyProjects: [],
    riskProjects: [],
    upcomingPayments: [],
    records: [
      {
        项目编号: 'PRJ-SEN-1',
        项目名称: '高敏项目A',
        省份: '北京',
        客户名称: '客户A',
        项目状态: '执行中',
        项目等级: 'A',
        项目类型: '交付',
        产品类别: 'AI PMO',
        项目经理: '张三',
        当前进度: 0.52,
        合同金额: 180,
        已回款金额: 60,
        应收金额: 120,
        回款率: 0.333,
        成本健康度: 76,
        进度偏差: -12,
        风险类型: '回款风险',
        风险等级: '高',
        风险状态: '应对中',
        风险趋势: '恶化',
        计划成本: 100,
        实际成本: 118,
      },
    ],
  };

  const impact = buildRiskSensitivityImpactDashboard(dashboard);

  assert.equal(impact.summary.analyzedProjects, 1);
  assert.equal(impact.summary.highSensitivity >= 1, true);
  assert.equal(impact.summary.healthMatrixSuggestions >= 1, true);
  assert.equal(impact.projectImpacts[0].projectName, '高敏项目A');
  assert.equal(impact.projectImpacts[0].requiresConfirmation, true);
  assert.match(impact.projectImpacts[0].reportFact, /需人工确认/);
  assert.match(impact.boundary, /不自动写回飞书/);
  assert.equal(impact.reportFacts.some(item => item.includes('高敏项目A')), true);
});

test('risk sensitivity impact is discoverable from api dashboard and sensitivity page', () => {
  const apiSource = readFileSync(new URL('../src/app/api/risk/sensitivity-impact/route.ts', import.meta.url), 'utf8');
  const dashboardSource = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8');
  const sensitivityPageSource = readFileSync(new URL('../src/app/risk/sensitivity/page.tsx', import.meta.url), 'utf8');
  const reportRouteSource = readFileSync(new URL('../src/app/api/reports/route.ts', import.meta.url), 'utf8');
  const closureApiSource = readFileSync(new URL('../src/app/api/risk/closure/route.ts', import.meta.url), 'utf8');
  const retrospectiveApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/route.ts', import.meta.url), 'utf8');
  const retrospectiveAssetsApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/route.ts', import.meta.url), 'utf8');
  const retrospectiveRecommendationsApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/recommendations/route.ts', import.meta.url), 'utf8');
  const retrospectiveExportApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/export/route.ts', import.meta.url), 'utf8');
  const retrospectiveQualityApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/quality/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceFollowupsApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceFollowupsFeishuApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/feishu-sync/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceWeeklyReminderApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/weekly-reminder/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceOperationHistoryApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/operation-history/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceWorkflowApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/operation-history/governance-workflow/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceEvidenceChainApiSource = readFileSync(new URL('../src/app/api/risk/retrospective/assets/governance/followups/evidence-chain/route.ts', import.meta.url), 'utf8');
  const retrospectiveGovernanceEvidenceChainFeatureSource = readFileSync(new URL('../src/features/risk/retrospective-governance-evidence-chain.ts', import.meta.url), 'utf8');
  const issueChangeRepositorySource = readFileSync(new URL('../src/features/issue-change/repository.ts', import.meta.url), 'utf8');
  const retrospectiveAssetsSql = readFileSync(new URL('../supabase-v5330-risk-retrospective-assets.sql', import.meta.url), 'utf8');
  const retrospectiveExportSql = readFileSync(new URL('../supabase-v5331-risk-retrospective-knowledge-sync.sql', import.meta.url), 'utf8');
  const retrospectiveValueSql = readFileSync(new URL('../supabase-v5332-risk-retrospective-value.sql', import.meta.url), 'utf8');
  const retrospectiveGovernanceSql = readFileSync(new URL('../supabase-v5334-risk-retrospective-governance.sql', import.meta.url), 'utf8');
  const retrospectiveGovernanceFollowupsSql = readFileSync(new URL('../supabase-v5338-risk-retrospective-governance-followups.sql', import.meta.url), 'utf8');
  const retrospectiveGovernanceOperationsSql = readFileSync(new URL('../supabase-v5344-risk-retrospective-governance-operations.sql', import.meta.url), 'utf8');
  const retrospectiveGovernanceEvidenceChainSql = readFileSync(new URL('../supabase-v5347-knowledge-governance-evidence-chain.sql', import.meta.url), 'utf8');
  const ragQueryRouteSource = readFileSync(new URL('../src/app/api/rag/query/route.ts', import.meta.url), 'utf8');
  const riskPageSource = readFileSync(new URL('../src/app/risk/page.tsx', import.meta.url), 'utf8');
  const workbenchPageSource = readFileSync(new URL('../src/app/workbench/page.tsx', import.meta.url), 'utf8');
  const trackingPageSource = readFileSync(new URL('../src/app/risk/tracking/page.tsx', import.meta.url), 'utf8');

  assert.match(apiSource, /buildRiskSensitivityImpactDashboard/);
  assert.match(dashboardSource, /buildRiskSensitivityImpactDashboard/);
  assert.match(dashboardSource, /\/api\/risk\/sensitivity-impact/);
  assert.match(sensitivityPageSource, /系统联动口径/);
  assert.match(sensitivityPageSource, /\/api\/risk\/sensitivity-impact/);
  assert.match(reportRouteSource, /riskSensitivityImpact/);
  assert.match(reportRouteSource, /knowledge_references/);
  assert.match(reportRouteSource, /createKnowledgeOutputReference/);
  assert.match(closureApiSource, /buildRiskClosureDashboard/);
  assert.match(retrospectiveApiSource, /buildRiskRetrospectiveDashboard/);
  assert.match(retrospectiveAssetsApiSource, /confirmRiskRetrospectiveAsset/);
  assert.match(retrospectiveAssetsApiSource, /updateRiskRetrospectiveAssetDetails/);
  assert.match(retrospectiveAssetsApiSource, /mergeRiskRetrospectiveAssets/);
  assert.match(retrospectiveRecommendationsApiSource, /buildRiskRetrospectiveRecommendations/);
  assert.match(retrospectiveExportApiSource, /buildRiskRetrospectiveKnowledgeExport/);
  assert.match(retrospectiveQualityApiSource, /buildRiskRetrospectiveQualityDashboard/);
  assert.match(retrospectiveGovernanceApiSource, /buildRiskRetrospectiveGovernanceDashboard/);
  assert.match(retrospectiveGovernanceApiSource, /buildRiskRetrospectiveGovernanceFollowupClosureDashboard/);
  assert.match(retrospectiveGovernanceApiSource, /risk_retrospective_governance/);
  assert.match(retrospectiveGovernanceApiSource, /risk_retrospective_governance_followup_closure/);
  assert.match(retrospectiveGovernanceFollowupsApiSource, /saveRiskRetrospectiveGovernanceFollowups/);
  assert.match(retrospectiveGovernanceFollowupsApiSource, /transitionRiskRetrospectiveGovernanceFollowup/);
  assert.match(retrospectiveGovernanceFollowupsApiSource, /buildRiskRetrospectiveGovernanceFollowupOperationReport/);
  assert.match(retrospectiveGovernanceFollowupsApiSource, /operation_report/);
  assert.match(retrospectiveGovernanceFollowupsApiSource, /format.*markdown/);
  assert.match(retrospectiveGovernanceFollowupsFeishuApiSource, /FeishuActionClient/);
  assert.match(retrospectiveGovernanceFollowupsFeishuApiSource, /confirm/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /confirmation_required/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /sendTextMessage/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /confirm/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /persistRiskRetrospectiveGovernanceReminderLogs/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /persistRiskRetrospectiveGovernanceOperationSnapshot/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /suppressRiskRetrospectiveGovernanceReminderDraftsForWeek/);
  assert.match(retrospectiveGovernanceWeeklyReminderApiSource, /suppressed_this_week/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /operation_report/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /snapshots/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /reminder_logs/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /linked_followup/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /createUnifiedAction/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /processed/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /ignored/);
  assert.match(retrospectiveGovernanceOperationHistoryApiSource, /escalated/);
  assert.match(retrospectiveGovernanceWorkflowApiSource, /confirmation_required/);
  assert.match(retrospectiveGovernanceWorkflowApiSource, /buildKnowledgeGovernanceWorkflowCandidate/);
  assert.match(retrospectiveGovernanceWorkflowApiSource, /createGovernanceInstance/);
  assert.match(retrospectiveGovernanceWorkflowApiSource, /duplicate_skipped/);
  assert.match(retrospectiveGovernanceEvidenceChainApiSource, /getKnowledgeGovernanceEvidenceChain/);
  assert.match(retrospectiveGovernanceEvidenceChainApiSource, /saveKnowledgeGovernanceEvidenceRecommendation/);
  assert.match(retrospectiveGovernanceEvidenceChainApiSource, /applyKnowledgeGovernanceEvidenceRecommendation/);
  assert.match(retrospectiveGovernanceEvidenceChainApiSource, /confirmation_required/);
  assert.match(retrospectiveGovernanceEvidenceChainFeatureSource, /buildKnowledgeGovernanceWritebackRecommendation/);
  assert.match(retrospectiveGovernanceEvidenceChainFeatureSource, /risk_retrospective_governance_evidence_links/);
  assert.match(riskPageSource, /知识治理周趋势/);
  assert.match(riskPageSource, /确认发送飞书提醒/);
  assert.match(riskPageSource, /\/api\/risk\/retrospective\/assets\/governance\/followups\/weekly-reminder/);
  assert.match(riskPageSource, /运营历史快照与提醒闭环/);
  assert.match(riskPageSource, /保存今日快照/);
  assert.match(riskPageSource, /\/api\/risk\/retrospective\/assets\/governance\/followups\/operation-history/);
  assert.match(riskPageSource, /\/api\/risk\/retrospective\/assets\/governance\/followups\/operation-history\/governance-workflow/);
  assert.match(riskPageSource, /updateGovernanceReminderLog/);
  assert.match(riskPageSource, /转治理流程/);
  assert.match(workbenchPageSource, /知识治理运营提醒草稿/);
  assert.match(workbenchPageSource, /riskRetrospectiveGovernanceFollowupOperation/);
  assert.match(issueChangeRepositorySource, /risk-retro-governance-followup-/);
  assert.match(issueChangeRepositorySource, /transitionRiskRetrospectiveGovernanceFollowup/);
  assert.match(retrospectiveAssetsSql, /risk_retrospective_assets/);
  assert.match(retrospectiveExportSql, /risk_retrospective_asset_sync_logs/);
  assert.match(retrospectiveValueSql, /risk_retrospective_asset_usage_logs/);
  assert.match(retrospectiveGovernanceSql, /risk_retrospective_asset_governance_logs/);
  assert.match(retrospectiveGovernanceFollowupsSql, /risk_retrospective_governance_followups/);
  assert.match(retrospectiveGovernanceFollowupsSql, /feishu_sync_status/);
  assert.match(retrospectiveGovernanceOperationsSql, /risk_retrospective_governance_operation_snapshots/);
  assert.match(retrospectiveGovernanceOperationsSql, /risk_retrospective_governance_reminder_logs/);
  assert.match(retrospectiveGovernanceOperationsSql, /processed/);
  assert.match(retrospectiveGovernanceEvidenceChainSql, /risk_retrospective_governance_evidence_links/);
  assert.match(retrospectiveGovernanceEvidenceChainSql, /governance_instance_id/);
  assert.match(retrospectiveGovernanceEvidenceChainSql, /review_status/);
  assert.match(ragQueryRouteSource, /listPublishedRiskRetrospectiveRagDocuments/);
  assert.match(ragQueryRouteSource, /recordRiskRetrospectiveRagUsage/);
  assert.match(ragQueryRouteSource, /knowledge_references/);
  assert.match(ragQueryRouteSource, /saveKnowledgeOutputReference/);
  assert.match(riskPageSource, /关闭证据/);
  assert.match(riskPageSource, /\/api\/risk\/closure/);
  assert.match(riskPageSource, /复盘资产/);
  assert.match(riskPageSource, /\/api\/risk\/retrospective/);
  assert.match(riskPageSource, /发布到RAG/);
  assert.match(riskPageSource, /同类项目预警推荐/);
  assert.match(riskPageSource, /导出AI-PMO-SYS知识页/);
  assert.match(riskPageSource, /重复资产提示/);
  assert.match(riskPageSource, /RAG引用/);
  assert.match(riskPageSource, /资产质量与治理队列/);
  assert.match(riskPageSource, /补充资产/);
  assert.match(riskPageSource, /合并到主资产/);
  assert.match(riskPageSource, /治理审计台/);
  assert.match(riskPageSource, /知识治理效果/);
  assert.match(riskPageSource, /二次治理待办/);
  assert.match(riskPageSource, /保存待办/);
  assert.match(riskPageSource, /知识治理待办运营报表/);
  assert.match(riskPageSource, /导出周运营清单/);
  assert.match(riskPageSource, /确认写入飞书任务/);
  assert.match(riskPageSource, /下载治理报告/);
  assert.match(reportRouteSource, /riskRetrospective/);
  assert.match(reportRouteSource, /riskRetrospectiveGovernanceFollowups/);
  assert.match(trackingPageSource, /关闭证据与复核意见/);
});

test('risk closure requires evidence review opinion reviewer date and dependency disposition', () => {
  const risk: Risk = {
    id: 'R-CLOSE-1',
    riskCode: 'R-CLOSE-1',
    projectName: '关闭门禁项目',
    description: '客户验收和回款阻塞风险',
    category: '合同',
    stage: '验收',
    source: '风险登记册',
    impactArea: '回款',
    probability: 4,
    impact: 5,
    urgency: 5,
    piScore: 20,
    priorityScore: 100,
    status: 'resolved',
    responseStrategyType: '上报',
    responseStrategy: '完成验收材料和回款承诺复核',
    preventiveAction: '周会跟踪验收材料',
    contingencyPlan: '必要时升级PMO',
    trigger: '验收签字延迟',
    trackingMethod: '周会跟踪',
    owner: '项目经理',
    dueDate: '2026-07-10',
    nextReviewDate: '2026-07-08',
    closingCriteria: '验收签字并确认付款计划',
    linkedModule: '合同回款',
    createdAt: '2026-07-01',
  };

  const missing = validateRiskClosureReview(risk, {
    closureEvidence: '',
    reviewOpinion: '',
    reviewer: '',
    reviewedAt: '',
    dependencyDisposition: '',
  });
  assert.equal(missing.length >= 5, true);

  const closurePackage = buildRiskClosurePackage(risk, {
    closureEvidence: '验收单与付款计划链接',
    reviewOpinion: '已满足关闭条件，剩余回款动作进入经营提醒。',
    reviewer: 'PMO',
    reviewedAt: '2026-07-04',
    closureDecision: 'conditional',
    dependencyDisposition: '治理流程已完成；回款动作转入经营提醒。',
    followUpAction: '7月10日前确认首笔回款',
    followUpOwner: '商务负责人',
    followUpDeadline: '2026-07-10',
  });

  assert.match(closurePackage.evidenceText, /关闭证据/);
  assert.match(closurePackage.outputSummary, /复核意见/);
  assert.match(closurePackage.actionRequired, /商务负责人/);
});

test('risk closure dashboard exposes evidence gaps and report facts', () => {
  const risks: Risk[] = [
    {
      id: 'R-CLOSE-2',
      riskCode: 'R-CLOSE-2',
      projectName: '已证据关闭项目',
      description: '高风险已完成关闭复核',
      category: '质量',
      stage: '结项',
      source: '风险登记册',
      impactArea: '质量',
      probability: 4,
      impact: 4,
      urgency: 4,
      piScore: 16,
      priorityScore: 64,
      status: 'closed',
      responseStrategyType: '缓解',
      responseStrategy: '关闭质量缺陷',
      preventiveAction: '补充测试',
      contingencyPlan: '保留支持窗口',
      trigger: '缺陷复发',
      trackingMethod: '复盘',
      owner: '测试负责人',
      dueDate: '2026-07-04',
      nextReviewDate: '2026-07-04',
      closingCriteria: '缺陷关闭并完成回归测试',
      linkedModule: '质量',
      evidence: '关闭证据：回归测试报告\n复核意见：同意关闭\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：缺陷单已关闭',
      createdAt: '2026-07-01',
    },
    {
      id: 'R-CLOSE-3',
      riskCode: 'R-CLOSE-3',
      projectName: '待补证据项目',
      description: '已解决但未关闭',
      category: '进度',
      stage: '监控',
      source: '风险登记册',
      impactArea: '工期',
      probability: 3,
      impact: 3,
      urgency: 3,
      piScore: 9,
      priorityScore: 27,
      status: 'resolved',
      responseStrategyType: '缓解',
      responseStrategy: '补齐计划',
      preventiveAction: '更新计划',
      contingencyPlan: '资源协调',
      trigger: '里程碑延迟',
      trackingMethod: '周会',
      owner: '项目经理',
      dueDate: '2026-07-06',
      nextReviewDate: '2026-07-05',
      closingCriteria: '里程碑恢复基线',
      linkedModule: '监控',
      createdAt: '2026-07-01',
    },
  ];
  const dashboard = buildRiskClosureDashboard(risks, []);

  assert.equal(dashboard.summary.closedRisks, 1);
  assert.equal(dashboard.summary.closedWithEvidence, 1);
  assert.equal(dashboard.summary.closureGaps, 1);
  assert.equal(dashboard.reportFacts.some(item => item.includes('风险关闭')), true);
  assert.equal(dashboard.closureGaps[0].nextAction.includes('提交关闭证据'), true);
});

test('risk retrospective dashboard turns closed risks into knowledge cards warning rules and markdown', () => {
  const risks: Risk[] = [
    {
      id: 'R-RETRO-1',
      riskCode: 'R-RETRO-1',
      projectName: '复盘沉淀项目',
      description: '验收阻塞导致回款延期',
      category: '财务',
      stage: '结项',
      source: '风险登记册',
      impactArea: '回款',
      probability: 4,
      impact: 5,
      urgency: 5,
      piScore: 20,
      priorityScore: 100,
      status: 'closed',
      responseStrategyType: '上报',
      responseStrategy: '升级PMO协调验收和付款路径',
      preventiveAction: '提前冻结验收材料和付款条件',
      contingencyPlan: '必要时发起风险升级评审',
      trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
      trackingMethod: '复盘会',
      owner: '项目经理',
      dueDate: '2026-07-04',
      nextReviewDate: '2026-07-03',
      closingCriteria: '验收签字并确认付款计划',
      linkedModule: '合同回款',
      evidence: '关闭证据：验收单与付款计划链接\n复核意见：同意关闭但首笔回款继续跟踪\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：治理流程已完成，回款动作转经营提醒\n经验教训：提前冻结验收标准、付款条件和缺陷关闭口径。',
      createdAt: '2026-07-01',
    },
    {
      id: 'R-RETRO-2',
      riskCode: 'R-RETRO-2',
      projectName: '待补复盘项目',
      description: '质量缺陷关闭后缺少经验教训',
      category: '质量',
      stage: '结项',
      source: '风险登记册',
      impactArea: '质量',
      probability: 3,
      impact: 4,
      urgency: 4,
      piScore: 12,
      priorityScore: 48,
      status: 'closed',
      responseStrategyType: '缓解',
      responseStrategy: '补充回归测试',
      preventiveAction: '增加测试准出检查',
      contingencyPlan: '保留支持窗口',
      trigger: '缺陷复发',
      trackingMethod: '复盘会',
      owner: '测试负责人',
      dueDate: '2026-07-04',
      nextReviewDate: '2026-07-03',
      closingCriteria: '缺陷关闭并完成回归测试',
      linkedModule: '质量',
      evidence: '关闭证据：回归测试报告\n复核意见：同意关闭\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：缺陷单已关闭',
      createdAt: '2026-07-01',
    },
  ];
  const closure = buildRiskClosureDashboard(risks, []);
  const retrospective = buildRiskRetrospectiveDashboard(risks, [], closure);

  assert.equal(retrospective.summary.closedRisks, 2);
  assert.equal(retrospective.summary.knowledgeCards, 2);
  assert.equal(retrospective.summary.warningRules, 2);
  assert.equal(retrospective.summary.highRiskRetrospectives, 1);
  assert.equal(retrospective.summary.missingLessons, 1);
  assert.match(retrospective.knowledgeCards[0].earlyWarningRule, /下一次复核前/);
  assert.match(retrospective.markdown, /风险复盘清单与组织过程资产/);
  assert.equal(retrospective.reportFacts.some(item => item.includes('风险复盘资产')), true);
  assert.equal(retrospective.missingLessons[0].nextAction.includes('补充触发器'), true);
});

test('risk retrospective assets can be published as dynamic RAG documents', () => {
  const risk: Risk = {
    id: 'R-RAG-RETRO',
    riskCode: 'R-RAG-RETRO',
    projectName: '复盘入库项目',
    description: '验收阻塞导致回款延期',
    category: '财务',
    stage: '结项',
    source: '风险登记册',
    impactArea: '回款',
    probability: 4,
    impact: 5,
    urgency: 5,
    piScore: 20,
    priorityScore: 100,
    status: 'closed',
    responseStrategyType: '上报',
    responseStrategy: '升级PMO协调验收和付款路径',
    preventiveAction: '提前冻结验收材料和付款条件',
    contingencyPlan: '必要时发起风险升级评审',
    trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
    trackingMethod: '复盘会',
    owner: '项目经理',
    dueDate: '2026-07-04',
    nextReviewDate: '2026-07-03',
    closingCriteria: '验收签字并确认付款计划',
    linkedModule: '合同回款',
    evidence: '关闭证据：验收单与付款计划链接\n复核意见：同意关闭但首笔回款继续跟踪\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：治理流程已完成，回款动作转经营提醒\n经验教训：提前冻结验收标准、付款条件和缺陷关闭口径。',
    createdAt: '2026-07-01',
  };
  const retrospective = buildRiskRetrospectiveDashboard([risk], []);
  const asset = buildRiskRetrospectiveAssetDraft(retrospective.knowledgeCards[0], {
    status: 'published',
    sourceRiskCode: risk.riskCode,
  });
  const document = riskRetrospectiveAssetToRagDocument(asset);
  const activeRisk: Risk = {
    ...risk,
    id: 'R-RAG-RETRO-ACTIVE',
    riskCode: 'R-RAG-RETRO-ACTIVE',
    status: 'monitoring',
    description: '新项目也出现验收签字和付款材料确认风险',
    evidence: undefined,
  };
  const recommendations = buildRiskRetrospectiveRecommendations([activeRisk], [asset]);
  const result = queryRagWithAdditionalDocuments({
    query: '验收阻塞 回款延期 复盘 预警规则',
    top_k: 3,
  }, [document]);

  assert.equal(document.status, 'published');
  assert.equal(recommendations.length, 1);
  assert.match(recommendations[0].matchReason, /影响领域一致/);
  assert.equal(result.answer_status, 'answered');
  assert.equal(result.citations.some(item => item.page_id.startsWith('RISK-RETRO-')), true);
  assert.match(result.answer, /提前冻结验收材料/);
  assert.match(result.retrieval.index_version, /dynamic-1/);
});

test('risk retrospective assets export to AI PMO SYS markdown with audit hash', () => {
  const risk: Risk = {
    id: 'R-EXPORT-RETRO',
    riskCode: 'R-EXPORT-RETRO',
    projectName: '知识库导出项目',
    description: '供应商交付延迟造成里程碑风险',
    category: '供应商',
    stage: '结项',
    source: '风险登记册',
    impactArea: '供应商',
    probability: 4,
    impact: 4,
    urgency: 4,
    piScore: 16,
    priorityScore: 64,
    status: 'closed',
    responseStrategyType: '缓解',
    responseStrategy: '建立供应商周度交付验收节奏',
    preventiveAction: '关键物料提前锁定备选供应商',
    contingencyPlan: '切换备选供应商',
    trigger: '供应商连续两周未按计划交付。',
    trackingMethod: '复盘会',
    owner: '采购负责人',
    dueDate: '2026-07-04',
    nextReviewDate: '2026-07-03',
    closingCriteria: '供应商完成补交并恢复里程碑计划',
    linkedModule: '资源',
    evidence: '关闭证据：补交验收单\n复核意见：同意关闭\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：里程碑计划已恢复\n经验教训：供应商风险需要提前设置备选资源和交付预警阈值。',
    createdAt: '2026-07-01',
  };
  const retrospective = buildRiskRetrospectiveDashboard([risk], []);
  const asset = buildRiskRetrospectiveAssetDraft(retrospective.knowledgeCards[0], { status: 'published', sourceRiskCode: risk.riskCode });
  const exported = buildRiskRetrospectiveKnowledgeExport([asset]);

  assert.match(exported.markdown, /风险复盘组织过程资产/);
  assert.match(exported.markdown, /供应商连续两周未按计划交付/);
  assert.match(exported.targetPath, /AI-PMO/);
  assert.equal(exported.assetCount, 1);
  assert.equal(exported.sha256.length, 64);
});

test('risk retrospective assets expose usage references and duplicate warnings', () => {
  const risk: Risk = {
    id: 'R-DUP-RETRO',
    riskCode: 'R-DUP-RETRO',
    projectName: '重复资产项目',
    description: '客户验收标准反复变化造成验收风险',
    category: '客户',
    stage: '结项',
    source: '风险登记册',
    impactArea: '回款',
    probability: 4,
    impact: 4,
    urgency: 4,
    piScore: 16,
    priorityScore: 64,
    status: 'closed',
    responseStrategyType: '缓解',
    responseStrategy: '冻结验收标准并拉通客户确认人',
    preventiveAction: '评审验收口径',
    contingencyPlan: '升级客户决策人',
    trigger: '客户连续两次调整验收口径。',
    trackingMethod: '复盘会',
    owner: '项目经理',
    dueDate: '2026-07-04',
    nextReviewDate: '2026-07-03',
    closingCriteria: '客户签署验收标准',
    linkedModule: '合同回款',
    evidence: '关闭证据：验收标准确认单\n复核意见：同意关闭\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：回款提醒已建立\n经验教训：客户验收口径要在启动和规划阶段双重冻结。',
    createdAt: '2026-07-01',
  };
  const retrospective = buildRiskRetrospectiveDashboard([risk], []);
  const asset = buildRiskRetrospectiveAssetDraft(retrospective.knowledgeCards[0], {
    status: 'published',
    sourceRiskCode: risk.riskCode,
  });
  const duplicated = {
    ...asset,
    id: 'R-DUP-RETRO-COPY',
    assetKey: 'risk-retrospective:R-DUP-RETRO-COPY',
    projectName: '重复资产项目二',
    lastExportSha256: 'same-export-hash',
  };
  const exportedOnce = { ...asset, lastExportSha256: 'same-export-hash' };
  const warnings = buildRiskRetrospectiveAssetDuplicateWarnings([exportedOnce, duplicated]);
  const document = riskRetrospectiveAssetToRagDocument(asset);

  assert.equal(document.source_refs.includes(asset.id), true);
  assert.equal(document.source_refs.includes(asset.assetKey), true);
  assert.equal(warnings.some(item => item.type === 'same_title'), true);
  assert.equal(warnings.some(item => item.type === 'same_source_risk'), true);
  assert.equal(warnings.some(item => item.type === 'same_content'), true);
  assert.equal(warnings.some(item => item.type === 'same_export_hash'), true);
});

test('risk retrospective quality dashboard prioritizes low quality and duplicate assets', () => {
  const baseCard = {
    id: 'R-QUALITY-1',
    sourceRiskId: 'R-QUALITY-1',
    projectName: '质量评分项目',
    title: '验收标准不清导致回款延期复盘',
    riskDescription: '验收标准不清导致回款延期',
    category: '客户',
    impactArea: '回款',
    severity: 'high' as const,
    trigger: '客户未确认验收标准',
    effectiveResponse: '补充验收标准评审会',
    closingEvidence: '',
    reviewOpinion: '',
    lessonLearned: '',
    earlyWarningRule: '',
    reusablePractice: '',
    tags: ['验收', '回款'],
  };
  const weakAsset = buildRiskRetrospectiveAssetDraft(baseCard, { status: 'published' });
  const duplicateAsset = {
    ...weakAsset,
    id: 'R-QUALITY-2',
    assetKey: 'risk-retrospective:R-QUALITY-2',
    sourceRiskId: 'R-QUALITY-1',
  };
  const dashboard = buildRiskRetrospectiveQualityDashboard([weakAsset, duplicateAsset], new Date('2026-07-04T00:00:00.000Z'));

  assert.equal(dashboard.summary.totalAssets, 2);
  assert.equal(dashboard.summary.needsGovernance, 2);
  assert.equal(dashboard.summary.duplicateRiskAssets, 2);
  assert.equal(dashboard.governanceQueue.length, 2);
  assert.equal(dashboard.governanceQueue[0].suggestedActions.some(action => action.includes('补充')), true);
  assert.match(dashboard.boundary, /不自动删除/);
});

test('risk retrospective asset governance builds edit payload and merge preview', () => {
  const baseCard = {
    id: 'R-GOV-1',
    sourceRiskId: 'R-GOV-1',
    projectName: '治理动作项目',
    title: '供应商交付延期复盘',
    riskDescription: '供应商交付延期',
    category: '供应商',
    impactArea: '进度',
    severity: 'medium' as const,
    trigger: '供应商延期',
    effectiveResponse: '建立周度交付看板',
    closingEvidence: '补交验收单',
    reviewOpinion: '同意关闭',
    lessonLearned: '提前准备备选供应商',
    earlyWarningRule: '连续一周未交付即预警',
    reusablePractice: '供应商交付拆成周粒度验收',
    tags: ['供应商', '进度'],
  };
  const source = buildRiskRetrospectiveAssetDraft(baseCard, { status: 'reviewed' });
  const target = buildRiskRetrospectiveAssetDraft({
    ...baseCard,
    id: 'R-GOV-2',
    sourceRiskId: 'R-GOV-2',
    title: '供应商里程碑延期复盘',
    tags: ['供应商', '里程碑'],
  }, { status: 'published' });
  const payload = buildRiskRetrospectiveAssetUpdatePayload({
    title: ' 供应商交付延期复盘 ',
    applicability: ' 软件外包供应商项目 ',
    lessonLearned: '',
    tags: ['供应商', '进度', '供应商'],
  });
  const preview = buildRiskRetrospectiveAssetMergePreview(source, target);

  assert.equal(payload.title, '供应商交付延期复盘');
  assert.equal(payload.applicability, '软件外包供应商项目');
  assert.deepEqual(payload.tags, ['供应商', '进度']);
  assert.equal('lesson_learned' in payload, false);
  assert.equal(preview.sourceAssetId, source.id);
  assert.equal(preview.targetAssetId, target.id);
  assert.equal(preview.mergedTags.includes('里程碑'), true);
  assert.match(preview.actionSummary, /合并到主资产/);
});

test('risk retrospective governance dashboard exports traceable markdown report', () => {
  const baseCard = {
    id: 'R-GOV-REPORT-1',
    sourceRiskId: 'R-GOV-REPORT-1',
    projectName: '治理报告项目',
    title: '回款延期风险复盘',
    riskDescription: '回款延期',
    category: '合同',
    impactArea: '回款',
    severity: 'high' as const,
    trigger: '客户未确认付款计划',
    effectiveResponse: '锁定付款计划并升级商务负责人',
    closingEvidence: '付款计划确认邮件',
    reviewOpinion: 'PMO同意关闭',
    lessonLearned: '付款条件需要在验收前冻结',
    earlyWarningRule: '付款计划超过7天未确认即预警',
    reusablePractice: '验收清单和付款计划双签',
    tags: ['回款', '验收'],
  };
  const asset = buildRiskRetrospectiveAssetDraft(baseCard, { status: 'published' });
  const enrichedAsset = {
    ...asset,
    earlyWarningRule: `${asset.earlyWarningRule}；回款计划超过3天未确认即预警`,
    ragReferenceCount: 2,
  };
  const quality = buildRiskRetrospectiveQualityDashboard([asset], new Date('2026-07-04T00:00:00.000Z'));
  const logs: RiskRetrospectiveGovernanceLog[] = [
    {
      id: 'log-1',
      assetId: asset.id,
      targetAssetId: null,
      action: 'edit',
      actionLabel: '补充编辑',
      actionSummary: '补充早期预警规则',
      beforeTitle: asset.title,
      afterTitle: asset.title,
      beforeStatus: 'reviewed',
      afterStatus: 'published',
      beforeSnapshot: {
        ...asset,
        earlyWarningRule: '',
        ragReferenceCount: 0,
      },
      afterSnapshot: enrichedAsset,
      performedByName: 'PMO知识管理员',
      requestId: 'req-1',
      createdAt: '2026-07-04T10:00:00.000Z',
    },
  ];
  const dashboard = buildRiskRetrospectiveGovernanceDashboard({ assets: [asset], logs, quality });

  assert.equal(dashboard.summary.totalLogs, 1);
  assert.equal(dashboard.summary.editActions, 1);
  assert.equal(dashboard.summary.touchedAssets, 1);
  assert.equal(dashboard.effect.monthlyActions, 1);
  assert.equal(dashboard.effect.improvedActions, 1);
  assert.equal(dashboard.effect.referencedAssets, 1);
  assert.equal(dashboard.effect.ragReferenceGrowth, 2);
  assert.equal(dashboard.effect.items[0]?.qualityDelta > 0, true);
  assert.match(dashboard.reportMarkdown, /风险复盘资产治理报告/);
  assert.match(dashboard.reportMarkdown, /治理效果趋势/);
  assert.match(dashboard.reportMarkdown, /质量分净变化/);
  assert.match(dashboard.reportMarkdown, /补充早期预警规则/);
  assert.match(dashboard.boundary, /治理审计台/);
});

test('risk retrospective governance creates second-pass actions for ineffective governance', () => {
  const weakCard = {
    id: 'R-GOV-ACTION-1',
    sourceRiskId: 'R-GOV-ACTION-1',
    projectName: '二次治理项目',
    title: '低质量复盘资产',
    riskDescription: '供应商多次延期',
    category: '供应商',
    impactArea: '进度',
    severity: 'medium' as const,
    trigger: '供应商未提交计划',
    effectiveResponse: '召开供应商例会',
    closingEvidence: '',
    reviewOpinion: '',
    lessonLearned: '',
    earlyWarningRule: '',
    reusablePractice: '',
    tags: ['供应商'],
  };
  const before = buildRiskRetrospectiveAssetDraft(weakCard, { status: 'reviewed' });
  const after = { ...before, status: 'published' as const };
  const logs: RiskRetrospectiveGovernanceLog[] = [
    {
      id: 'log-low-effect',
      assetId: after.id,
      targetAssetId: null,
      action: 'publish',
      actionLabel: '发布RAG',
      actionSummary: '低质量资产发布到RAG',
      beforeTitle: before.title,
      afterTitle: after.title,
      beforeStatus: before.status,
      afterStatus: after.status,
      beforeSnapshot: before,
      afterSnapshot: after,
      performedByName: 'PMO知识管理员',
      requestId: 'req-low-effect',
      createdAt: '2026-07-04T12:00:00.000Z',
    },
  ];
  const dashboard = buildRiskRetrospectiveGovernanceDashboard({
    assets: [after],
    logs,
    quality: buildRiskRetrospectiveQualityDashboard([after], new Date('2026-07-04T00:00:00.000Z')),
  });

  assert.equal(dashboard.effect.actionItems.length, 1);
  assert.equal(dashboard.effect.reminders.length, 1);
  assert.equal(dashboard.effect.actionItems[0]?.priority, 'high');
  assert.match(dashboard.effect.actionItems[0]?.reason ?? '', /低于70|质量分/);
  assert.match(dashboard.effect.actionItems[0]?.closingCriteria ?? '', /质量分提升/);
  assert.match(dashboard.reportMarkdown, /二次治理待办/);
  assert.match(dashboard.reportMarkdown, /PMO知识管理员/);
});

test('field mapping diagnostics detect missing Chinese fields and aliases', () => {
  const checks = evaluateFeishuFieldMappings({
    configuredTables: ['project'],
    fieldNamesByTable: {
      project: ['项目ID', '项目名称', '项目状态', '项目等级', '项目类型', '项目负责人', '当前进度'],
    },
  });

  const project = checks.find(item => item.tableKey === 'project');
  const risk = checks.find(item => item.tableKey === 'risk');

  assert.equal(project?.status, 'warning');
  assert.equal(project?.missingFields.includes('项目编号'), false);
  assert.equal(project?.missingFields.includes('合同金额'), true);
  assert.equal(risk?.status, 'not_configured');
});

test('live data quality scanner flags owner deadline finance and risk closure issues', () => {
  const checks = evaluateDataQuality({
    rules: dataQualityRules,
    dashboard: null,
    projectRecords: [
      {
        项目名称: '高风险项目A',
        项目状态: '随便填',
        风险等级: '高',
        合同金额: 100,
        已回款金额: 120,
      },
    ],
    riskRecords: [
      {
        风险编号: 'R-1',
        项目名称: '高风险项目A',
        风险等级: '高',
      },
    ],
  });

  assert.equal(checks.find(item => item.id === 'missing-owner')?.affectedCount, 1);
  assert.equal(checks.find(item => item.id === 'missing-deadline')?.status, 'error');
  assert.equal(checks.find(item => item.id === 'finance-mismatch')?.affectedCount, 1);
  assert.equal(checks.find(item => item.id === 'risk-without-action')?.status, 'error');
});

test('integration diagnostics summarize failed mappings and data quality issues', () => {
  const fieldChecks = evaluateFeishuFieldMappings({
    configuredTables: ['project'],
    fieldNamesByTable: { project: ['项目名称'] },
  });
  const qualityChecks = evaluateDataQuality({
    rules: dataQualityRules,
    dashboard: null,
    projectRecords: [{ 项目名称: '项目A', 风险等级: '高' }],
  });

  const advices = diagnoseIntegrationState({
    feishuStatus: 'degraded',
    aiConfigured: false,
    ragStatus: 'ok',
    fieldMappingChecks: fieldChecks,
    dataQualityChecks: qualityChecks,
    syncLogStatus: 'skipped',
  });

  assert.equal(advices.some(item => item.id === 'field-mapping-missing'), true);
  assert.equal(advices.some(item => item.id === 'data-quality-issues'), true);
  assert.equal(advices.some(item => item.id === 'ai-model-not-configured'), true);
  assert.equal(advices.some(item => item.id === 'sync-log-not-persisted'), true);
});

test('user AI connection test classifies provider failures without exposing secrets', () => {
  assert.equal(classifyAiConnectionHttpFailure(401), 'auth_error');
  assert.equal(classifyAiConnectionHttpFailure(403), 'auth_error');
  assert.equal(classifyAiConnectionHttpFailure(429), 'rate_limited');
  assert.equal(classifyAiConnectionHttpFailure(503), 'provider_error');
  assert.equal(classifyAiConnectionHttpFailure(400), 'http_error');
  assert.equal(aiConnectionFailureActions('missing_key').some(action => action.includes('API Key')), true);
});

test('user Feishu connection test summarizes config field and write permission steps', () => {
  const incomplete = buildFeishuConfigCompletenessSteps({
    appId: '',
    appSecret: 'secret',
    baseToken: '',
    configuredTableCount: 0,
  });
  assert.equal(incomplete.some(step => step.id === 'app_id' && step.status === 'failed'), true);
  assert.equal(incomplete.some(step => step.id === 'table_mapping' && step.status === 'warning'), true);

  const writeSkipped = writeCheckStep({ requested: false, attempted: false, succeeded: false });
  const summary = summarizeFeishuConnectionSteps([...incomplete, writeSkipped]);
  assert.equal(writeSkipped.status, 'skipped');
  assert.equal(summary.status, 'failed');
  assert.equal(summary.failedCount > 0, true);
});

test('user center exposes one click AI and Feishu connection tests', () => {
  const accountPageSource = readFileSync(new URL('../src/app/account/page.tsx', import.meta.url), 'utf8');
  const aiTestRouteSource = readFileSync(new URL('../src/app/api/user/ai-settings/test/route.ts', import.meta.url), 'utf8');
  const feishuTestRouteSource = readFileSync(new URL('../src/app/api/user/feishu-connection/test/route.ts', import.meta.url), 'utf8');

  assert.match(accountPageSource, /测试AI模型/);
  assert.match(accountPageSource, /测试飞书连接/);
  assert.match(accountPageSource, /确认写入测试/);
  assert.match(accountPageSource, /\/api\/user\/ai-settings\/test/);
  assert.match(accountPageSource, /\/api\/user\/feishu-connection\/test/);
  assert.match(aiTestRouteSource, /testAiConnection/);
  assert.match(feishuTestRouteSource, /writeCheckStep/);
  assert.match(feishuTestRouteSource, /includeWriteCheck/);
});

test('generic Feishu action preview requires confirmation before write execution', () => {
  const body = {
    type: 'message',
    idempotency_key: 'weekly-risk-2026-07-06',
    receive_id_type: 'chat_id',
    receive_id: 'oc-team',
    text: '项目周报已生成，请确认风险和回款阻塞。',
  };

  const validated = validateFeishuActionBody(body);
  const preview = buildFeishuActionPreview(body);

  assert.equal(validated.actionType, 'message');
  assert.equal(preview.confirmationRequired, true);
  assert.equal(preview.targetType, '飞书消息');
  assert.equal(preview.riskLevel, 'medium');
  assert.match(preview.targetSummary, /群聊/);
  assert.equal(preview.fields.some(field => field.label === '消息摘要' && field.value.includes('项目周报')), true);
});

test('Feishu action confirmation can only be managed by requester or admin', () => {
  const confirmation = {
    id: 'confirmation-1',
    requesterId: 'user-1',
    requesterName: '张三',
    requesterEmail: 'zhangsan@example.com',
    source: 'integration_center',
    sourcePage: '/integration-center',
    actionType: 'task',
    idempotencyKey: 'task-1',
    targetSummary: '创建任务：处理项目风险',
    riskLevel: 'medium',
    status: 'pending_confirmation',
    payload: { type: 'task', idempotency_key: 'task-1', summary: '处理项目风险' },
    preview: buildFeishuActionPreview({ type: 'task', idempotency_key: 'task-1', summary: '处理项目风险' }),
    resource: null,
    errorCode: null,
    cancelReason: null,
    requestId: 'req-1',
    createdAt: '2026-07-06T00:00:00.000Z',
    confirmedAt: null,
    executedAt: null,
    cancelledAt: null,
  } satisfies FeishuActionConfirmationRecord;

  assert.equal(canManageFeishuActionConfirmation({ id: 'user-1', email: 'a@example.com', phone: '13800000000', name: '张三', role: 'user', status: 'active' }, confirmation), true);
  assert.equal(canManageFeishuActionConfirmation({ id: 'user-2', email: 'b@example.com', phone: '13800000001', name: '李四', role: 'user', status: 'active' }, confirmation), false);
  assert.equal(canManageFeishuActionConfirmation({ id: 'admin-1', email: 'admin@example.com', phone: '13800000002', name: '管理员', role: 'admin', status: 'active' }, confirmation), true);
});

test('Feishu action confirmation risk review supports batch pre-check and reminders', () => {
  const confirmation = {
    id: 'confirmation-risk-1',
    requesterId: null,
    requesterName: null,
    requesterEmail: null,
    source: 'api_token',
    sourcePage: '/api/integrations/feishu/actions',
    actionType: 'message',
    idempotencyKey: 'message-1',
    targetSummary: '向群聊 oc-team 发送消息',
    riskLevel: 'medium',
    status: 'pending_confirmation',
    payload: {
      type: 'message',
      idempotency_key: 'message-1',
      receive_id_type: 'chat_id',
      receive_id: 'oc-team',
      text: '项目风险提醒，请确认责任人与截止时间。',
    },
    preview: buildFeishuActionPreview({
      type: 'message',
      idempotency_key: 'message-1',
      receive_id_type: 'chat_id',
      receive_id: 'oc-team',
      text: '项目风险提醒，请确认责任人与截止时间。',
    }),
    resource: null,
    errorCode: null,
    cancelReason: null,
    requestId: 'req-risk-1',
    createdAt: '2026-06-20T00:00:00.000Z',
    confirmedAt: null,
    executedAt: null,
    cancelledAt: null,
  } satisfies FeishuActionConfirmationRecord;
  const admin = { id: 'admin-1', email: 'admin@example.com', phone: '13800000002', name: '管理员', role: 'admin' as const, status: 'active' as const };

  const review = buildFeishuConfirmationRiskReview(confirmation, { user: admin, now: new Date('2026-07-09T00:00:00.000Z') });
  assert.equal(review.riskLevel, 'high');
  assert.equal(review.canConfirm, true);
  assert.equal(review.requiresSecondConfirm, true);
  assert.equal(review.ageDays, 19);
  assert.equal(review.warnings.some(item => item.includes('群聊')), true);

  const batchReview = buildFeishuConfirmationBatchRiskReview([confirmation], { user: admin, now: new Date('2026-07-09T00:00:00.000Z') });
  assert.equal(batchReview.selectedCount, 1);
  assert.equal(batchReview.confirmableCount, 1);
  assert.equal(batchReview.highRiskCount, 1);
  assert.match(batchReview.decisionText, /需要二次确认 1 条/);

  const summary = buildFeishuConfirmationQueueSummary([confirmation], new Date('2026-07-09T00:00:00.000Z'));
  assert.equal(summary.highRiskPendingCount, 1);
  assert.equal(summary.overduePendingCount, 1);
  assert.equal(summary.reminderDrafts[0].priority, 'P0');
});

test('generic Feishu action APIs expose queue confirm and cancel boundaries', () => {
  const actionRouteSource = readFileSync(new URL('../src/app/api/integrations/feishu/actions/route.ts', import.meta.url), 'utf8');
  const confirmationsRouteSource = readFileSync(new URL('../src/app/api/integrations/feishu/actions/confirmations/route.ts', import.meta.url), 'utf8');
  const confirmRouteSource = readFileSync(new URL('../src/app/api/integrations/feishu/actions/confirmations/[id]/confirm/route.ts', import.meta.url), 'utf8');
  const cancelRouteSource = readFileSync(new URL('../src/app/api/integrations/feishu/actions/confirmations/[id]/cancel/route.ts', import.meta.url), 'utf8');
  const batchReviewRouteSource = readFileSync(new URL('../src/app/api/integrations/feishu/actions/confirmations/batch-review/route.ts', import.meta.url), 'utf8');
  const integrationCenterSource = readFileSync(new URL('../src/app/integration-center/page.tsx', import.meta.url), 'utf8');
  const inlinePanelSource = readFileSync(new URL('../src/components/FeishuConfirmationInlinePanelClient.tsx', import.meta.url), 'utf8');
  const confirmationSql = readFileSync(new URL('../supabase-v5349-feishu-action-confirmations.sql', import.meta.url), 'utf8');

  assert.match(actionRouteSource, /confirmation_required/);
  assert.match(actionRouteSource, /createFeishuActionConfirmation/);
  assert.doesNotMatch(actionRouteSource, /executeFeishuAction\(config/);
  assert.match(confirmationsRouteSource, /listFeishuActionConfirmations/);
  assert.match(confirmationsRouteSource, /createFeishuActionConfirmation/);
  assert.match(confirmationsRouteSource, /buildFeishuConfirmationQueueSummary/);
  assert.match(confirmationsRouteSource, /riskReview/);
  assert.match(confirmRouteSource, /executeFeishuAction/);
  assert.match(confirmRouteSource, /claimEvent/);
  assert.match(confirmRouteSource, /writeOperationAudit/);
  assert.match(confirmRouteSource, /riskAcknowledged/);
  assert.match(confirmRouteSource, /risk_acknowledgement_required/);
  assert.match(cancelRouteSource, /updateFeishuActionConfirmationStatus/);
  assert.match(batchReviewRouteSource, /buildFeishuConfirmationBatchRiskReview/);
  assert.match(batchReviewRouteSource, /只做批量确认前风险复核/);
  assert.match(integrationCenterSource, /飞书写入待确认队列/);
  assert.match(integrationCenterSource, /confirmFeishuAction/);
  assert.match(integrationCenterSource, /cancelFeishuAction/);
  assert.match(integrationCenterSource, /confirmationStatusFilter/);
  assert.match(integrationCenterSource, /confirmationSearch/);
  assert.match(integrationCenterSource, /batchCancelFeishuActions/);
  assert.match(integrationCenterSource, /batchConfirmFeishuActions/);
  assert.match(integrationCenterSource, /确认前风险复核/);
  assert.match(integrationCenterSource, /待处理提醒草稿/);
  assert.match(integrationCenterSource, /批量取消/);
  assert.match(inlinePanelSource, /飞书写入确认提醒/);
  assert.match(inlinePanelSource, /\/api\/integrations\/feishu\/actions\/confirmations/);
  assert.match(confirmationSql, /create table if not exists feishu_action_confirmations/);
  assert.match(confirmationSql, /pending_confirmation/);
});

test('core operating pages reuse unified integration status panel', () => {
  const integrationStatusPanelClientSource = readFileSync(new URL('../src/components/IntegrationStatusPanelClient.tsx', import.meta.url), 'utf8');
  const pages = [
    ['../src/app/dashboard/page.tsx', '项目组合看板'],
    ['../src/app/risk/page.tsx', '风险管理'],
    ['../src/app/pmo/page.tsx', 'PMO治理中心'],
    ['../src/app/reports/page.tsx', '报告工厂'],
    ['../src/app/workbench/page.tsx', 'PM/PMO每日工作台'],
    ['../src/app/knowledge/page.tsx', '知识库与AI问答'],
  ] as const;

  assert.match(integrationStatusPanelClientSource, new RegExp('/api/operating-system/integrations'));
  assert.match(integrationStatusPanelClientSource, new RegExp('/api/operating-system/sync-logs'));
  assert.match(integrationStatusPanelClientSource, /IntegrationStatusPanel/);

  for (const [path, moduleName] of pages) {
    const pageSource = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(pageSource, /IntegrationStatusPanelClient/);
    assert.match(pageSource, /FeishuConfirmationInlinePanelClient/);
    assert.match(pageSource, new RegExp(moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('knowledge operation dashboard maps lifecycle to impact modules templates and review actions', () => {
  const dashboard = buildKnowledgeOperationDashboard(new Date('2026-07-07T00:00:00.000Z'));
  const knowledgePageSource = readFileSync(new URL('../src/app/knowledge/page.tsx', import.meta.url), 'utf8');
  const operationPageSource = readFileSync(new URL('../src/app/knowledge/operations/page.tsx', import.meta.url), 'utf8');
  const operationRouteSource = readFileSync(new URL('../src/app/api/knowledge/operations/route.ts', import.meta.url), 'utf8');
  const lifecycleRepositorySource = readFileSync(new URL('../src/features/knowledge/lifecycle-repository.ts', import.meta.url), 'utf8');
  const lifecycleClientSource = readFileSync(new URL('../src/components/KnowledgeLifecyclePersistenceClient.tsx', import.meta.url), 'utf8');
  const governanceClientSource = readFileSync(new URL('../src/components/KnowledgeGovernanceOperationsClient.tsx', import.meta.url), 'utf8');
  const referenceAuditClientSource = readFileSync(new URL('../src/components/KnowledgeReferenceAuditClient.tsx', import.meta.url), 'utf8');
  const lifecycleSql = readFileSync(new URL('../supabase-v5352-knowledge-lifecycle.sql', import.meta.url), 'utf8');
  const governanceSql = readFileSync(new URL('../supabase-v5354-knowledge-governance-operations.sql', import.meta.url), 'utf8');
  const referenceAuditSql = readFileSync(new URL('../supabase-v5355-v5358-knowledge-reference-template-audit.sql', import.meta.url), 'utf8');

  assert.equal(dashboard.summary.total, 27);
  assert.equal(dashboard.summary.reviewed > 0, true);
  assert.equal(dashboard.summary.affectedModules > 0, true);
  assert.equal(dashboard.impactModules.some(module => module.module === '报告工厂'), true);
  assert.equal(dashboard.lifecycleActions.length > 0, true);
  assert.equal(dashboard.templateDirectory.some(template => template.lifecycleStatus === '已关联'), true);
  assert.match(dashboard.boundary, /不会自动修改/);
  assert.match(knowledgePageSource, new RegExp('/knowledge/operations'));
  assert.match(operationPageSource, /知识生命周期运营/);
  assert.match(operationPageSource, /KnowledgeLifecyclePersistenceClient/);
  assert.match(operationPageSource, /KnowledgeReferenceAuditClient/);
  assert.match(operationRouteSource, /buildKnowledgeOperationDashboard/);
  assert.match(operationRouteSource, /syncKnowledgeLifecycleFromDashboard/);
  assert.match(operationRouteSource, /transitionKnowledgeImpactReview/);
  assert.match(operationRouteSource, /loadKnowledgeChangeControl/);
  assert.match(operationRouteSource, /loadKnowledgeGovernanceWorkbench/);
  assert.match(operationRouteSource, /loadKnowledgeReferenceAuditWorkbench/);
  assert.match(operationRouteSource, /transitionKnowledgeItemStatus/);
  assert.match(operationRouteSource, /upsertKnowledgeSubscription/);
  assert.match(operationRouteSource, /queueKnowledgeSubscriptionReminders/);
  assert.match(operationRouteSource, /persistKnowledgeChangeReport/);
  assert.match(operationRouteSource, /createKnowledgeOutputReference/);
  assert.match(operationRouteSource, /upsertKnowledgeTemplateDirectoryItem/);
  assert.match(operationRouteSource, /recordKnowledgeTemplateUsage/);
  assert.match(operationRouteSource, /recordKnowledgeSubscriptionDeliveryReceipt/);
  assert.match(operationRouteSource, /persistKnowledgeAuditPackage/);
  assert.match(operationRouteSource, /createKnowledgeImpactReviewActionItems/);
  assert.match(operationRouteSource, /create_action_items/);
  assert.match(operationRouteSource, /send_subscription_reminders/);
  assert.match(operationRouteSource, /generate_change_report/);
  assert.match(operationRouteSource, /create_output_reference/);
  assert.match(operationRouteSource, /upsert_template_directory_item/);
  assert.match(operationRouteSource, /record_template_usage/);
  assert.match(operationRouteSource, /record_subscription_delivery_receipt/);
  assert.match(operationRouteSource, /generate_knowledge_audit_package/);
  assert.match(operationRouteSource, /confirm=true/);
  assert.match(lifecycleRepositorySource, /knowledge_items/);
  assert.match(lifecycleRepositorySource, /knowledge_impact_reviews/);
  assert.match(lifecycleRepositorySource, /KnowledgeVersionDiffRecord/);
  assert.match(lifecycleRepositorySource, /KnowledgeSubscriptionReminderDraft/);
  assert.match(lifecycleRepositorySource, /knowledge_subscriptions/);
  assert.match(lifecycleRepositorySource, /knowledge_subscription_notifications/);
  assert.match(lifecycleRepositorySource, /knowledge_change_reports/);
  assert.match(lifecycleRepositorySource, /knowledge_output_references/);
  assert.match(lifecycleRepositorySource, /knowledge_template_directory_items/);
  assert.match(lifecycleRepositorySource, /knowledge_template_usage_events/);
  assert.match(lifecycleRepositorySource, /knowledge_subscription_delivery_receipts/);
  assert.match(lifecycleRepositorySource, /knowledge_audit_packages/);
  assert.match(lifecycleRepositorySource, /supabase-v5354-knowledge-governance-operations\.sql/);
  assert.match(lifecycleRepositorySource, /supabase-v5355-v5358-knowledge-reference-template-audit\.sql/);
  assert.match(lifecycleRepositorySource, /unified_action_items/);
  assert.match(lifecycleRepositorySource, /supabase-v530-issue-change-action-chain\.sql/);
  assert.match(lifecycleClientSource, /同步当前快照/);
  assert.match(lifecycleClientSource, /关闭复核/);
  assert.match(lifecycleClientSource, /知识版本差异与订阅提醒/);
  assert.match(lifecycleClientSource, /生成统一行动项/);
  assert.match(governanceClientSource, /知识状态流转、订阅发送与变更报告/);
  assert.match(governanceClientSource, /send_subscription_reminders/);
  assert.match(governanceClientSource, /generate_change_report/);
  assert.match(governanceClientSource, /change-reports/);
  assert.match(referenceAuditClientSource, /知识版本引用链、模板目录与审计包/);
  assert.match(referenceAuditClientSource, /create_output_reference/);
  assert.match(referenceAuditClientSource, /record_template_usage/);
  assert.match(referenceAuditClientSource, /record_subscription_delivery_receipt/);
  assert.match(referenceAuditClientSource, /generate_knowledge_audit_package/);
  assert.match(referenceAuditClientSource, /audit-packages/);
  assert.equal(lifecycleSql.includes('create table if not exists public.knowledge_items'), true);
  assert.equal(lifecycleSql.includes('create table if not exists public.knowledge_item_versions'), true);
  assert.equal(lifecycleSql.includes('create table if not exists public.knowledge_lifecycle_events'), true);
  assert.equal(lifecycleSql.includes('create table if not exists public.knowledge_impact_reviews'), true);
  assert.equal(lifecycleSql.includes('create table if not exists public.knowledge_subscriptions'), true);
  assert.equal(governanceSql.includes('create table if not exists public.knowledge_subscription_notifications'), true);
  assert.equal(governanceSql.includes('create table if not exists public.knowledge_change_reports'), true);
  assert.match(governanceSql, /subscription_notification_queued/);
  assert.match(governanceSql, /change_report_generated/);
  assert.equal(referenceAuditSql.includes('create table if not exists public.knowledge_output_references'), true);
  assert.equal(referenceAuditSql.includes('create table if not exists public.knowledge_template_directory_items'), true);
  assert.equal(referenceAuditSql.includes('create table if not exists public.knowledge_template_usage_events'), true);
  assert.equal(referenceAuditSql.includes('create table if not exists public.knowledge_subscription_delivery_receipts'), true);
  assert.equal(referenceAuditSql.includes('create table if not exists public.knowledge_audit_packages'), true);
  assert.match(referenceAuditSql, /output_reference_created/);
  assert.match(referenceAuditSql, /template_usage_recorded/);
  assert.match(referenceAuditSql, /subscription_delivery_recorded/);
  assert.match(referenceAuditSql, /audit_package_generated/);
});

test('operational workbench filters projects risks todos and reminders for current user', () => {
  const workbench = buildOperationalWorkbench({
    user: { name: '张三', email: 'zhangsan@example.com', phone: '13800000000', role: 'user' },
    projects: [
      {
        项目编号: 'P-1',
        项目名称: '张三负责项目',
        项目负责人: '张三',
        项目状态: '进行中',
        当前阶段: '执行',
        当前进度: 0.55,
        风险等级: '高',
        应收金额: 20,
        到期日期: '2026-07-02',
      },
      {
        项目编号: 'P-2',
        项目名称: '李四负责项目',
        项目负责人: '李四',
        项目状态: '进行中',
        当前进度: 0.9,
      },
    ],
    risks: [
      {
        风险编号: 'R-1',
        项目名称: '张三负责项目',
        风险描述: '核心资源冲突',
        风险等级: '高',
        状态: '应对中',
        风险责任人: '张三',
        复核日期: '2026-07-02',
        应对措施: '升级资源协调',
      },
    ],
    tasks: [
      {
        任务编号: 'T-1',
        项目名称: '张三负责项目',
        任务名称: '完成阶段计划',
        责任人: '张三',
        计划完成: '2026-07-02',
        任务状态: '进行中',
      },
    ],
    milestones: [
      {
        里程碑编号: 'M-1',
        项目名称: '李四负责项目',
        里程碑名称: '李四项目阶段门',
        责任人: '李四',
        计划完成: '2026-07-02',
        里程碑状态: '进行中',
      },
    ],
    payments: [
      {
        回款编号: 'PAY-1',
        项目名称: '张三负责项目',
        客户名称: '客户A',
        应收金额: 20,
        到期日期: '2026-07-02',
        回款状态: '待回款',
      },
    ],
    riskRetrospectiveGovernanceFollowups: [
      {
        id: 'followup-1',
        actionKey: 'risk-retro-governance-action:log-1',
        sourceLogId: null,
        assetTitle: '低效果复盘资产',
        reason: '治理后质量分仍低于70分',
        actionRequired: '补充经验教训、早期预警规则和适用范围',
        ownerName: '张三',
        dueDate: '2020-01-01',
        priority: 'high',
        status: '待复核',
        closingCriteria: '质量分提升到70分以上，并形成可引用知识卡',
        reminderText: '请完成二次治理',
        closureNote: null,
        reviewResult: null,
        feishuSyncStatus: '待确认',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: 'PMO知识管理员',
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: null,
      },
    ],
  });

  assert.equal(workbench.evidence.userScope, 'matched-owner');
  assert.equal(workbench.myProjects.length, 1);
  assert.equal(workbench.myProjects[0].name, '张三负责项目');
  assert.equal(workbench.myRisks.length, 1);
  assert.equal(workbench.todayTodos.some(item => item.id === 'T-1'), true);
  assert.equal(workbench.todayTodos.some(item => item.id === 'M-1'), false);
  assert.equal(workbench.businessReminders.length >= 1, true);
  assert.equal(workbench.riskIntegration.summary.openRiskLinks >= 1, true);
  assert.equal(workbench.riskIntegration.summary.paymentImpacts >= 1, true);
  assert.equal(workbench.riskIntegration.links.some(link => link.writebackMode === 'manual_confirmation_required'), true);
  assert.equal(workbench.riskRetrospectiveGovernanceFollowups.summary.myPending, 1);
  assert.equal(workbench.riskRetrospectiveGovernanceFollowups.summary.highPriority, 1);
  assert.equal(workbench.riskRetrospectiveGovernanceFollowups.summary.waitingFeishuConfirmation, 1);
  assert.equal(workbench.riskRetrospectiveGovernanceFollowups.workItems[0]?.actionDraft.sourceType, 'governance');
  assert.equal(workbench.riskRetrospectiveGovernanceFollowupOperation.reminderDrafts.length, 1);
  assert.equal(workbench.riskRetrospectiveGovernanceFollowupOperation.reminderDrafts[0]?.type, 'overdue');
  assert.equal(workbench.riskRetrospectiveGovernanceFollowupOperation.feishuReminderDraft?.confirmationRequired, true);
  assert.equal(workbench.kpis.some(item => item.label === '知识治理待办' && item.value === '1'), true);
  assert.equal(workbench.kpis.some(item => item.label === '知识治理提醒' && item.value === '1'), true);
  assert.equal(workbench.actions.some(action => action.id === 'p3-risk-retro-governance-reminders'), true);
  assert.equal(workbench.actions.some(action => action.id === 'p3-risk-retro-governance-followups'), true);
  assert.match(workbench.aiSuggestions[0].basis, /任务1条/);
});

test('risk retrospective governance followups become scoped workbench actions', () => {
  const dashboard = buildRiskRetrospectiveGovernanceFollowupWorkbench({
    user: { name: '张三', role: 'user' },
    followups: [
      {
        id: 'followup-zhangsan',
        actionKey: 'risk-retro-governance-action:log-zhangsan',
        sourceLogId: null,
        assetTitle: '张三负责资产',
        reason: '治理后未产生引用增长',
        actionRequired: '补充标签、标题别名和适用场景',
        ownerName: '张三',
        dueDate: '2026-07-06',
        priority: 'medium',
        status: '处理中',
        closingCriteria: 'RAG引用数增加或完成撤回决策',
        reminderText: '请完成二次治理',
        closureNote: null,
        reviewResult: null,
        feishuSyncStatus: '未同步',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: null,
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: null,
      },
      {
        id: 'followup-lisi',
        actionKey: 'risk-retro-governance-action:log-lisi',
        sourceLogId: null,
        assetTitle: '李四负责资产',
        reason: '重复风险未下降',
        actionRequired: '复核合并对象',
        ownerName: '李四',
        dueDate: '2026-07-06',
        priority: 'high',
        status: '待复核',
        closingCriteria: '重复风险下降',
        reminderText: '请完成二次治理',
        closureNote: null,
        reviewResult: null,
        feishuSyncStatus: '未同步',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: null,
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: null,
      },
    ],
  });

  assert.equal(dashboard.summary.totalOpen, 2);
  assert.equal(dashboard.summary.myPending, 1);
  assert.equal(dashboard.workItems[0]?.assetTitle, '张三负责资产');
  assert.equal(dashboard.workItems[0]?.actionDraft.priority, 'P1');
  assert.match(dashboard.workItems[0]?.actionDraft.sourceReason ?? '', /关闭标准/);
  assert.match(dashboard.boundary, /保存待办/);
});

test('risk retrospective governance followup closure dashboard exposes reportable closure evidence', () => {
  const dashboard = buildRiskRetrospectiveGovernanceFollowupClosureDashboard({
    followups: [
      {
        id: 'followup-open',
        actionKey: 'risk-retro-governance-action:open',
        sourceLogId: null,
        assetTitle: '待关闭知识卡',
        reason: 'RAG引用未增长',
        actionRequired: '补充适用范围和早期预警规则',
        ownerName: '张三',
        dueDate: '2020-01-01',
        priority: 'high',
        status: '处理中',
        closingCriteria: '完成补充并通过PMO验收',
        reminderText: '请完成二次治理',
        closureNote: null,
        reviewResult: null,
        feishuSyncStatus: '待确认',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: 'PMO知识管理员',
        createdAt: '2026-07-04T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: null,
      },
      {
        id: 'followup-closed',
        actionKey: 'risk-retro-governance-action:closed',
        sourceLogId: null,
        assetTitle: '已关闭知识卡',
        reason: '治理后质量分仍低',
        actionRequired: '补齐经验教训',
        ownerName: '李四',
        dueDate: '2026-07-01',
        priority: 'medium',
        status: '已关闭',
        closingCriteria: '质量分提升并形成可引用知识卡',
        reminderText: '请复核',
        closureNote: '已补齐经验教训、适用范围和RAG标签。',
        reviewResult: '统一行动项已关闭。',
        feishuSyncStatus: '已同步',
        feishuTaskGuid: 'task-1',
        feishuTaskUrl: 'https://example.com/task-1',
        feishuSyncError: null,
        feishuSyncedAt: '2026-07-04T00:00:00.000Z',
        feishuSyncRequestId: 'req-1',
        createdByName: 'PMO知识管理员',
        createdAt: '2026-07-03T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: '2026-07-04T00:00:00.000Z',
      },
    ],
  });

  assert.equal(dashboard.summary.total, 2);
  assert.equal(dashboard.summary.open, 1);
  assert.equal(dashboard.summary.closed, 1);
  assert.equal(dashboard.summary.closureRate, 50);
  assert.equal(dashboard.summary.closedWithEvidence, 1);
  assert.equal(dashboard.summary.highPriorityOpen, 1);
  assert.equal(dashboard.summary.waitingFeishuConfirmation, 1);
  assert.equal(dashboard.recentClosed[0]?.assetTitle, '已关闭知识卡');
  assert.equal(dashboard.openWorkItems[0]?.actionDraft.sourceId, 'risk-retro-governance-followup-followup-open');
  assert.equal(dashboard.reportFacts.some(item => item.includes('关闭率50.0%')), true);
  assert.match(dashboard.boundary, /关闭证据/);
});

test('risk retrospective governance followup operation report filters owners and exports weekly markdown', () => {
  const report = buildRiskRetrospectiveGovernanceFollowupOperationReport({
    filters: { owner: '张三', due: 'overdue', feishuSyncStatus: '待确认' },
    followups: [
      {
        id: 'ops-open-overdue',
        actionKey: 'risk-retro-governance-action:ops-open-overdue',
        sourceLogId: null,
        assetTitle: '逾期待办知识卡',
        reason: '治理后重复风险未下降',
        actionRequired: '补充重复风险识别和处置规则',
        ownerName: '张三',
        dueDate: '2020-01-01',
        priority: 'high',
        status: '处理中',
        closingCriteria: '重复风险下降并完成PMO复核',
        reminderText: '请完成二次治理',
        closureNote: null,
        reviewResult: null,
        feishuSyncStatus: '待确认',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: 'PMO',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
        closedAt: null,
      },
      {
        id: 'ops-closed-gap',
        actionKey: 'risk-retro-governance-action:ops-closed-gap',
        sourceLogId: null,
        assetTitle: '缺证据已关闭知识卡',
        reason: '关闭时未补充证据',
        actionRequired: '补齐关闭证据',
        ownerName: '李四',
        dueDate: '2026-07-01',
        priority: 'medium',
        status: '已关闭',
        closingCriteria: '补齐证据',
        reminderText: '请补证据',
        closureNote: null,
        reviewResult: '已关闭但证据缺失',
        feishuSyncStatus: '已同步',
        feishuTaskGuid: null,
        feishuTaskUrl: null,
        feishuSyncError: null,
        feishuSyncedAt: null,
        feishuSyncRequestId: null,
        createdByName: 'PMO',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-04T00:00:00.000Z',
        closedAt: '2026-07-04T00:00:00.000Z',
      },
    ],
  });

  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.filtered, 1);
  assert.equal(report.summary.overdueOpen, 1);
  assert.equal(report.summary.highPriorityOpen, 1);
  assert.equal(report.summary.evidenceGaps, 1);
  assert.equal(report.ownerStats.find(item => item.ownerName === '张三')?.overdue, 1);
  assert.equal(report.items[0]?.id, 'ops-open-overdue');
  assert.equal(report.weeklyTrend.length, 6);
  assert.equal(report.weeklyTrend.some(item => item.created >= 1 || item.closed >= 1), true);
  assert.equal(report.reminderDrafts.some(item => item.type === 'overdue' && item.confirmationRequired), true);
  assert.equal(report.reminderDrafts.some(item => item.type === 'evidence_gap' && item.confirmationRequired), true);
  assert.equal(report.feishuReminderDraft?.confirmationRequired, true);
  assert.equal(report.feishuReminderDraft?.target, 'feishu_message');
  assert.equal(report.reportFacts.some(item => item.includes('知识治理周运营')), true);
  assert.equal(report.reportFacts.some(item => item.includes('知识治理提醒')), true);
  assert.match(report.reportMarkdown, /知识治理待办周运营清单/);
  assert.match(report.reportMarkdown, /负责人追踪/);
  assert.match(report.reportMarkdown, /趋势与自动提醒草稿/);
  assert.match(report.reportMarkdown, /自动提醒草稿必须由用户显式确认/);
  assert.match(report.boundary, /周运营/);
});

test('risk retrospective governance operation helpers mask Feishu receivers and build stable reminder keys', () => {
  assert.equal(maskFeishuReceiveId('oc_1234567890abcdef'), 'oc_1***cdef');
  assert.equal(maskFeishuReceiveId('abc123'), 'ab***');
  assert.equal(reminderLogKey('overdue-followup-1', '2026-07-05'), '2026-07-05:overdue-followup-1');
});

test('risk retrospective governance operation history suppresses weekly duplicate reminders and summarizes closure rate', () => {
  const reminders = [
    {
      id: 'overdue-followup-1',
      type: 'overdue' as const,
      priority: 'P0' as const,
      title: '[逾期提醒] 复盘资产A',
      ownerName: '张三',
      dueDate: '2026-07-05',
      assetTitle: '复盘资产A',
      reason: '逾期未处理',
      actionRequired: '补齐治理动作',
      confirmationRequired: true as const,
      feishuMessage: '提醒A',
    },
    {
      id: 'waiting_acceptance-followup-2',
      type: 'waiting_acceptance' as const,
      priority: 'P1' as const,
      title: '[待验收提醒] 复盘资产B',
      ownerName: '李四',
      dueDate: '2026-07-06',
      assetTitle: '复盘资产B',
      reason: '待验收',
      actionRequired: 'PMO验收',
      confirmationRequired: true as const,
      feishuMessage: '提醒B',
    },
  ];
  const reminderLogs = [
    {
      id: 'log-1',
      reminderKey: '2026-07-05:overdue-followup-1',
      reminderType: 'overdue' as const,
      originalReminderId: 'overdue-followup-1',
      sourceFollowupId: 'followup-1',
      priority: 'P0' as const,
      title: '[逾期提醒] 复盘资产A',
      assetTitle: '复盘资产A',
      ownerName: '张三',
      dueDate: '2026-07-05',
      actionRequired: '补齐治理动作',
      status: 'sent' as const,
      feishuMessageId: 'msg-1',
      feishuReceiveIdType: 'chat_id' as const,
      feishuReceiveIdMasked: 'oc_1***cdef',
      sentAt: '2026-07-05T01:00:00.000Z',
      closedAt: null,
      closureNote: null,
      error: null,
      createdByName: 'PMO',
      requestId: 'req-1',
      createdAt: '2026-07-05T01:00:00.000Z',
      updatedAt: '2026-07-05T01:00:00.000Z',
    },
    {
      id: 'log-2',
      reminderKey: '2026-07-04:evidence_gap-followup-3',
      reminderType: 'evidence_gap' as const,
      originalReminderId: 'evidence_gap-followup-3',
      sourceFollowupId: 'followup-3',
      priority: 'P1' as const,
      title: '[证据缺口提醒] 复盘资产C',
      assetTitle: '复盘资产C',
      ownerName: '王五',
      dueDate: '2026-07-04',
      actionRequired: '补证据',
      status: 'processed' as const,
      feishuMessageId: 'msg-2',
      feishuReceiveIdType: 'chat_id' as const,
      feishuReceiveIdMasked: 'oc_1***cdef',
      sentAt: '2026-07-04T01:00:00.000Z',
      closedAt: '2026-07-05T02:00:00.000Z',
      closureNote: '已处理',
      error: null,
      createdByName: 'PMO',
      requestId: 'req-2',
      createdAt: '2026-07-04T01:00:00.000Z',
      updatedAt: '2026-07-05T02:00:00.000Z',
    },
  ];
  const suppression = suppressRiskRetrospectiveGovernanceReminderDraftsForWeek({
    reminders,
    reminderLogs,
    weekStart: '2026-06-30',
  });
  assert.deepEqual(suppression.suppressedReminderIds, ['overdue-followup-1']);
  assert.equal(suppression.summary.sendable, 1);
  assert.match(suppression.boundary, /同一周/);

  const summary = buildRiskRetrospectiveGovernanceOperationHistorySummary({
    snapshots: [
      {
        id: 'snapshot-1',
        snapshotDate: '2026-07-05',
        snapshotWeekStart: '2026-06-30',
        total: 8,
        open: 5,
        closed: 3,
        overdueOpen: 2,
        dueSoonOpen: 1,
        waitingAcceptance: 1,
        evidenceGaps: 1,
        reminderCount: 2,
        p0ReminderCount: 1,
        evidenceCompletenessRate: 66.7,
        reportFacts: ['知识治理周运营'],
        reportMarkdownSha256: 'hash',
        createdByName: 'PMO',
        requestId: 'req-snapshot',
        createdAt: '2026-07-05T03:00:00.000Z',
        updatedAt: '2026-07-05T03:00:00.000Z',
      },
    ],
    reminderLogs,
  });
  assert.equal(summary.summary.latestOpen, 5);
  assert.equal(summary.summary.sentReminderLogs, 1);
  assert.equal(summary.summary.closedReminderLogs, 1);
  assert.equal(summary.summary.handlingRate, 50);
  assert.equal(summary.reminderOwnerStats.some(item => item.ownerName === '张三'), true);
});

test('knowledge governance workflow candidate requires manual confirmation and preserves reminder provenance', () => {
  const candidate = buildKnowledgeGovernanceWorkflowCandidate({
    id: 'reminder-log-1',
    reminderKey: '2026-07-05:overdue-followup-1',
    reminderType: 'overdue',
    originalReminderId: 'overdue-followup-1',
    sourceFollowupId: 'followup-1',
    priority: 'P0',
    title: '[逾期提醒] 复盘资产A',
    assetTitle: '复盘资产A',
    ownerName: '张三',
    dueDate: '2026-07-05',
    actionRequired: '补齐治理动作和关闭证据',
    status: 'escalated',
    feishuMessageId: 'msg-1',
    feishuReceiveIdType: 'chat_id',
    feishuReceiveIdMasked: 'oc_1***cdef',
    sentAt: '2026-07-05T01:00:00.000Z',
    closedAt: '2026-07-05T02:00:00.000Z',
    closureNote: '需要PMO升级处理',
    error: null,
    createdByName: 'PMO',
    requestId: 'req-1',
    createdAt: '2026-07-05T01:00:00.000Z',
    updatedAt: '2026-07-05T02:00:00.000Z',
  });

  assert.equal(candidate.workflowId, 'risk-escalation');
  assert.equal(candidate.priority, 'high');
  assert.equal(candidate.owner, '张三');
  assert.equal(candidate.sourceId, 'reminder-log-1');
  assert.equal(candidate.sourceLinkId, 'followup-1');
  assert.match(candidate.inputSummary, /知识治理升级输入/);
  assert.match(candidate.sourceSummary, /需要PMO升级处理/);
  assert.match(candidate.boundary, /显式确认/);
});

test('knowledge governance evidence chain recommendation requires manual confirmation before followup writeback', () => {
  const recommendation = buildKnowledgeGovernanceWritebackRecommendation({
    followup: {
      id: 'followup-1',
      actionKey: 'risk-retro-governance-action:followup-1',
      sourceLogId: null,
      assetTitle: '验收付款知识卡',
      reason: '同类风险仍重复出现',
      actionRequired: '补齐验收付款早期预警规则',
      ownerName: 'PMO知识管理员',
      dueDate: '2026-07-10',
      priority: 'high',
      status: '处理中',
      closingCriteria: '规则被RAG引用并降低重复风险',
      reminderText: '请补齐知识卡',
      closureNote: null,
      reviewResult: null,
      feishuSyncStatus: '待确认',
      feishuTaskGuid: null,
      feishuTaskUrl: null,
      feishuSyncError: null,
      feishuSyncedAt: null,
      feishuSyncRequestId: null,
      createdByName: 'PMO',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-05T00:00:00.000Z',
      closedAt: null,
    },
    reminderLog: {
      id: 'reminder-log-1',
      reminderKey: '2026-07-05:overdue-followup-1',
      reminderType: 'overdue',
      originalReminderId: 'overdue-followup-1',
      sourceFollowupId: 'followup-1',
      priority: 'P0',
      title: '[逾期提醒] 验收付款知识卡',
      assetTitle: '验收付款知识卡',
      ownerName: 'PMO知识管理员',
      dueDate: '2026-07-10',
      actionRequired: '补齐治理动作和关闭证据',
      status: 'escalated',
      feishuMessageId: 'msg-1',
      feishuReceiveIdType: 'chat_id',
      feishuReceiveIdMasked: 'oc_1***cdef',
      sentAt: '2026-07-05T01:00:00.000Z',
      closedAt: '2026-07-05T02:00:00.000Z',
      closureNote: '需要PMO升级处理',
      error: null,
      createdByName: 'PMO',
      requestId: 'req-1',
      createdAt: '2026-07-05T01:00:00.000Z',
      updatedAt: '2026-07-05T02:00:00.000Z',
    },
    governanceInstance: {
      id: 'governance-1',
      workflowId: 'risk-escalation',
      workflowName: '风险升级评审',
      stage: '监控阶段',
      projectId: null,
      projectName: '风险复盘资产治理',
      title: '[知识治理升级] 验收付款知识卡',
      triggerSummary: '知识治理提醒升级',
      inputSummary: '来源提醒、来源资产和升级原因',
      outputSummary: '已形成验收付款早期预警规则并补齐责任人。',
      owner: 'PMO知识管理员',
      approver: 'PMO',
      state: '已关闭',
      priority: 'high',
      deadline: '2026-07-10',
      source: 'ai-pmo',
      feishuRecordId: null,
      createdByName: 'PMO',
      sourceType: 'risk_retrospective_governance_reminder',
      sourceId: 'reminder-log-1',
      sourceLinkId: 'followup-1',
      sourceSummary: '运营提醒升级',
      createdAt: '2026-07-05T03:00:00.000Z',
      updatedAt: '2026-07-06T03:00:00.000Z',
      closedAt: '2026-07-06T03:00:00.000Z',
    },
    governanceEvents: [
      {
        id: 'event-1',
        instanceId: 'governance-1',
        eventType: 'close',
        fromState: '应对中',
        toState: '已关闭',
        comment: '治理动作完成，进入PMO验收。',
        actorName: 'PMO',
        actorRole: 'admin',
        decision: 'close',
        outputs: { output_summary: '已补齐规则' },
        createdAt: '2026-07-06T03:00:00.000Z',
      },
    ],
    governanceActions: [
      {
        id: 'governance-action-1',
        instanceId: 'governance-1',
        title: '补齐验收付款规则',
        owner: 'PMO知识管理员',
        dueDate: '2026-07-10',
        status: 'done',
        closeEvidence: 'RAG知识卡已更新并通过复核。',
        createdAt: '2026-07-05T03:00:00.000Z',
        updatedAt: '2026-07-06T03:00:00.000Z',
      },
    ],
  });

  assert.equal(recommendation.targetFollowupStatus, '待验收');
  assert.match(recommendation.closureNote, /治理流程反写建议/);
  assert.match(recommendation.evidenceSummary, /风险升级评审/);
  assert.match(recommendation.evidenceSummary, /RAG知识卡已更新/);
  assert.match(recommendation.boundary, /显式确认/);
  assert.equal(recommendation.riskWarnings.length, 0);
});

test('ai evidence builders expose basis citations and convertible actions', () => {
  const business = buildBusinessCaseEvidence({
    projectName: 'AI PMO平台',
    projectType: '信息化',
    projectLevel: 'S',
    sponsor: 'PMO',
    businessJustification: '提升项目治理效率',
    recommendation: '批准',
  });
  const risk = buildRiskScanEvidence({
    projectName: 'AI PMO平台',
    stage: '执行',
    description: '关键路径延期，客户验收标准未冻结。',
    riskCount: 3,
    model: 'MiniMax-M3',
    status: 'generated',
  });
  const execution = buildExecutionSummaryEvidence({
    projectId: 'PRJ-1',
    taskCount: 5,
    blockedTaskCount: 1,
    deliverableCount: 2,
    pendingDeliverableCount: 1,
    model: 'MiniMax-M3',
    status: 'generated',
  });

  for (const evidence of [business, risk, execution]) {
    assert.ok(evidence.id.startsWith('AIE-'));
    assert.equal(evidence.basis.length > 0, true);
    assert.equal(evidence.citations.length > 0, true);
    assert.equal(evidence.suggestedActions.length > 0, true);
    assert.match(evidence.suggestedActions[0].priority, /^P[0-2]$/);
    assert.ok(evidence.inputSummary);
    assert.ok(evidence.outputSummary);
  }
  assert.equal(business.scene, 'business_case');
  assert.equal(risk.scene, 'risk_scan');
  assert.equal(execution.scene, 'execution_summary');
});

test('finance cockpit links contract cost collection margin and acceptance blockers', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书智能表', generatedAt: '2026-07-02T00:00:00.000Z' },
    kpi: {
      totalProjects: 2,
      totalContract: 500,
      totalCollection: 220,
      collectionRate: 44,
      receivable: 280,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [],
    riskProjects: [],
    upcomingPayments: [],
    records: [
      {
        项目编号: 'P-FIN-1',
        项目名称: '验收阻塞项目',
        省份: '上海',
        客户名称: '客户A',
        项目状态: '验收中',
        项目等级: 'A',
        项目类型: '信息化',
        产品类别: '平台',
        当前进度: 0.95,
        合同金额: 300,
        已回款金额: 120,
        应收金额: 180,
        回款率: 0.4,
        成本健康度: 70,
        进度偏差: -3,
        风险类型: '回款风险',
        风险等级: '高',
        风险状态: '应对中',
        风险趋势: '恶化',
        到期日期: '2026-07-01',
        预算金额: 210,
        实际成本: 205,
        预计成本: 255,
        验收状态: '验收中',
      },
      {
        项目编号: 'P-FIN-2',
        项目名称: '健康项目',
        省份: '浙江',
        客户名称: '客户B',
        项目状态: '已验收',
        项目等级: 'B',
        项目类型: '信息化',
        产品类别: '平台',
        当前进度: 1,
        合同金额: 200,
        已回款金额: 100,
        应收金额: 100,
        回款率: 0.5,
        成本健康度: 90,
        进度偏差: 2,
        风险类型: '综合风险',
        风险等级: '低',
        风险状态: '监控中',
        风险趋势: '平稳',
        到期日期: '2026-08-30',
        预算金额: 120,
        实际成本: 80,
        预计成本: 120,
        验收状态: '已验收',
      },
    ],
  };

  const cockpit = buildFinanceCockpit(dashboard, { asOf: new Date('2026-07-02T00:00:00.000Z') });

  assert.equal(cockpit.kpis.totalContract, 500);
  assert.equal(cockpit.kpis.receivable, 280);
  assert.equal(cockpit.kpis.overdueReceivable, 180);
  assert.equal(cockpit.kpis.acceptanceBlockedReceivable, 180);
  assert.equal(cockpit.projects[0].businessHealth, 'red');
  assert.equal(cockpit.projects.some(project => project.costSource === 'actual' || project.costSource === 'forecast'), true);
  assert.equal(cockpit.alerts.some(alert => alert.type === 'acceptance_block' && alert.priority === 'P0'), true);
  assert.equal(cockpit.alerts.some(alert => alert.type === 'low_margin'), true);
  assert.equal(cockpit.paymentAcceptanceLinks[0].projectName, '验收阻塞项目');
  assert.equal(cockpit.portfolioByLevel.some(group => group.name === 'A级' && group.contractAmount === 300), true);
});

test('report factory cites data sources and turns meeting minutes into actions', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书项目台账', generatedAt: '2026-07-02T00:00:00.000Z' },
    kpi: {
      totalProjects: 1,
      totalContract: 300,
      totalCollection: 120,
      collectionRate: 40,
      receivable: 180,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [],
    riskProjects: [
      { id: 'R-1', name: '智慧校园一期', riskType: '回款风险', severity: '高', status: '应对中', trend: '恶化' },
    ],
    upcomingPayments: [
      { project: '智慧校园一期', party: '客户A', amount: 180, dueDate: '2026-07-01', daysLeft: -1 },
    ],
    records: [
      {
        项目编号: 'P-RPT-1',
        项目名称: '智慧校园一期',
        省份: '上海',
        客户名称: '客户A',
        项目状态: '验收中',
        项目等级: 'A',
        项目类型: '信息化',
        产品类别: '平台',
        当前进度: 0.92,
        合同金额: 300,
        已回款金额: 120,
        应收金额: 180,
        回款率: 0.4,
        成本健康度: 70,
        进度偏差: -3,
        风险类型: '回款风险',
        风险等级: '高',
        风险状态: '应对中',
        风险趋势: '恶化',
        到期日期: '2026-07-01',
        预算金额: 210,
        实际成本: 205,
        预计成本: 255,
        验收状态: '验收中',
      },
    ],
  };
  const finance = buildFinanceCockpit(dashboard, { asOf: new Date('2026-07-02T00:00:00.000Z') });
  const riskIntegration = buildRiskIntegrationDashboard({
    dashboard,
    risks: [
      {
        id: 'R-RPT-1',
        riskCode: 'R-RPT-1',
        projectName: '智慧校园一期',
        description: '验收阻塞导致回款延期',
        category: '财务',
        stage: '监控',
        source: '风险登记册',
        impactArea: '回款',
        probability: 4,
        impact: 5,
        urgency: 5,
        piScore: 20,
        priorityScore: 100,
        status: 'tracking',
        responseStrategyType: '上报',
        responseStrategy: '升级PMO协调验收和付款路径',
        preventiveAction: '补齐验收材料',
        contingencyPlan: '必要时发起风险升级评审',
        trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
        trackingMethod: '周会跟踪',
        owner: '项目经理',
        dueDate: '2026-07-04',
        nextReviewDate: '2026-07-03',
        closingCriteria: '验收签字并确认付款计划',
        linkedModule: '合同回款',
        createdAt: '2026-07-01',
      },
    ],
    asOf: new Date('2026-07-02T00:00:00.000Z'),
  });
  const riskSensitivityImpact = buildRiskSensitivityImpactDashboard(dashboard);
  const closedReportRisks: Risk[] = [
    {
      id: 'R-RPT-CLOSED',
      riskCode: 'R-RPT-CLOSED',
      projectName: '智慧校园一期',
      description: '验收阻塞导致回款延期',
      category: '财务',
      stage: '验收',
      source: '风险登记册',
      impactArea: '回款',
      probability: 4,
      impact: 5,
      urgency: 5,
      piScore: 20,
      priorityScore: 100,
      status: 'closed',
      responseStrategyType: '上报',
      responseStrategy: '升级PMO协调验收和付款路径',
      preventiveAction: '补齐验收材料',
      contingencyPlan: '必要时发起风险升级评审',
      trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
      trackingMethod: '周会跟踪',
      owner: '项目经理',
      dueDate: '2026-07-04',
      nextReviewDate: '2026-07-03',
      closingCriteria: '验收签字并确认付款计划',
      linkedModule: '合同回款',
      evidence: '关闭证据：验收单与付款计划链接\n复核意见：同意关闭但首笔回款继续跟踪\n复核人：PMO\n复核日期：2026-07-04\n依赖处置：治理流程已完成，回款动作转经营提醒\n经验教训：提前冻结验收标准、付款条件和缺陷关闭口径。',
      createdAt: '2026-07-01',
    },
  ];
  const riskClosure = buildRiskClosureDashboard(closedReportRisks, []);
  const riskRetrospective = buildRiskRetrospectiveDashboard(closedReportRisks, [], riskClosure);
  const request = {
    type: 'meeting' as const,
    projectName: '智慧校园一期',
    completedWork: '补齐客户付款条件清单|商务负责人|2026-07-05|P1\n协调交付负责人关闭剩余缺陷|交付负责人|2026-07-04|P0',
    nextPlans: '下次会议复核验收材料、回款承诺和遗留缺陷关闭情况。',
    issues: '客户验收签字依赖缺陷修复和付款材料确认。',
    resourceNeeds: '需要PMO协调商务、交付和财务BP共同确认应收与验收口径。',
    tone: 'formal' as const,
  };
  const context = {
    dashboard,
    finance,
    sourceLabel: '飞书项目台账',
    sourceStatus: 'live' as const,
    model: 'MiniMax-M3',
    riskIntegration,
    riskSensitivityImpact,
    riskClosure,
    riskRetrospective,
    riskRetrospectiveGovernanceFollowups: buildRiskRetrospectiveGovernanceFollowupClosureDashboard({
      followups: [
        {
          id: 'report-followup-open',
          actionKey: 'risk-retro-governance-action:report-open',
          sourceLogId: null,
          assetTitle: '验收付款知识卡',
          reason: '同类风险仍有重复出现',
          actionRequired: '补充验收付款早期预警规则',
          ownerName: 'PMO知识管理员',
          dueDate: '2026-07-05',
          priority: 'high',
          status: '处理中',
          closingCriteria: '规则被RAG引用并降低重复风险',
          reminderText: '请补齐知识卡',
          closureNote: null,
          reviewResult: null,
          feishuSyncStatus: '待确认',
          feishuTaskGuid: null,
          feishuTaskUrl: null,
          feishuSyncError: null,
          feishuSyncedAt: null,
          feishuSyncRequestId: null,
          createdByName: 'PMO',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          closedAt: null,
        },
        {
          id: 'report-followup-closed',
          actionKey: 'risk-retro-governance-action:report-closed',
          sourceLogId: null,
          assetTitle: '缺陷关闭知识卡',
          reason: '复盘资产质量分低',
          actionRequired: '补齐缺陷关闭口径',
          ownerName: '交付负责人',
          dueDate: '2026-07-04',
          priority: 'medium',
          status: '已关闭',
          closingCriteria: '知识卡可被周报引用',
          reminderText: '请复核关闭证据',
          closureNote: '统一行动项已补齐关闭证据和复核意见。',
          reviewResult: 'PMO验收通过。',
          feishuSyncStatus: '已同步',
          feishuTaskGuid: 'task-report-closed',
          feishuTaskUrl: 'https://example.com/task-report-closed',
          feishuSyncError: null,
          feishuSyncedAt: '2026-07-04T00:00:00.000Z',
          feishuSyncRequestId: 'req-report-closed',
          createdByName: 'PMO',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-04T00:00:00.000Z',
          closedAt: '2026-07-04T00:00:00.000Z',
        },
      ],
    }),
    governanceImpact: buildGovernanceImpactDashboard([{
      id: 'gov-rpt-1',
      workflowId: 'project-closure',
      workflowName: '项目收尾验收',
      stage: '收尾阶段',
      projectName: '智慧校园一期',
      title: '智慧校园一期验收评审',
      owner: '项目经理',
      approver: 'PMO',
      state: '需整改',
      priority: 'high',
      deadline: '2026-07-05',
      source: 'ai-pmo',
      createdByName: '管理员',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    } as never]),
  };

  const dataPackage = buildReportFactoryPackage(request, context);
  const actionItems = extractMeetingActionItems(request.completedWork, request.projectName);
  const evidence = buildReportEvidence({ request, context, dataPackage, actionItems, status: 'generated' });
  const markdown = fallbackReportContent(request, dataPackage, actionItems);

  assert.equal(dataPackage.dataSources.some(source => source.source === 'feishu'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '风险联动包'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '风险敏感性影响包'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '风险关闭证据包'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '风险复盘资产包'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '知识治理待办闭环'), true);
  assert.equal(dataPackage.dataSources.some(source => source.label === '治理工作流与审批联动'), true);
  assert.equal(dataPackage.financeFacts.some(item => item.includes('验收阻塞回款')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('风险联动')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('敏感性分析')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('风险关闭')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('风险复盘')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('知识治理闭环')), true);
  assert.equal(dataPackage.riskFacts.some(item => item.includes('治理联动')), true);
  assert.equal(actionItems.length, 2);
  assert.equal(actionItems[1].priority, 'P0');
  assert.equal(evidence.scene, 'report');
  assert.equal(evidence.citations.includes('飞书项目台账'), true);
  assert.equal(evidence.citations.includes('风险联动包'), true);
  assert.equal(evidence.citations.includes('风险敏感性影响包'), true);
  assert.equal(evidence.citations.includes('风险关闭证据包'), true);
  assert.equal(evidence.citations.includes('风险复盘资产包'), true);
  assert.equal(evidence.citations.includes('知识治理待办闭环'), true);
  assert.equal(evidence.citations.includes('治理工作流与审批联动'), true);
  assert.equal(evidence.basis.some(item => item.label === '敏感性分析依据'), true);
  assert.equal(evidence.basis.some(item => item.label === '风险关闭依据'), true);
  assert.equal(evidence.basis.some(item => item.label === '风险复盘依据'), true);
  assert.equal(evidence.basis.some(item => item.label === '知识治理待办闭环依据'), true);
  assert.equal(evidence.suggestedActions.length, 2);
  assert.match(markdown, /数据来源与生成边界/);
  assert.match(markdown, /补齐客户付款条件清单/);
});

test('risk integration links register risks to project health milestones payments governance and reports', () => {
  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书项目台账', generatedAt: '2026-07-04T00:00:00.000Z' },
    kpi: {
      totalProjects: 1,
      totalContract: 300,
      totalCollection: 120,
      collectionRate: 40,
      receivable: 180,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [],
    riskProjects: [
      { id: 'R-INT-1', name: '智慧校园一期', riskType: '回款风险', severity: '高', status: '应对中', trend: '恶化' },
    ],
    upcomingPayments: [
      { project: '智慧校园一期', party: '客户A', amount: 180, dueDate: '2026-07-01', daysLeft: -3 },
    ],
    records: [
      {
        项目编号: 'P-INT-1',
        项目名称: '智慧校园一期',
        省份: '上海',
        客户名称: '客户A',
        项目状态: '验收中',
        项目等级: 'A',
        项目类型: '信息化',
        产品类别: '平台',
        项目经理: '张三',
        当前进度: 0.92,
        合同金额: 300,
        已回款金额: 120,
        应收金额: 180,
        回款率: 0.4,
        成本健康度: 70,
        进度偏差: -8,
        风险类型: '回款风险',
        风险等级: '高',
        风险状态: '应对中',
        风险趋势: '恶化',
        到期日期: '2026-07-01',
      },
    ],
  };
  const dashboardOnly = buildRiskIntegrationDashboard({
    dashboard,
    risks: [],
    asOf: new Date('2026-07-04T00:00:00.000Z'),
  });
  const fromRegister = buildRiskIntegrationDashboard({
    dashboard,
    asOf: new Date('2026-07-04T00:00:00.000Z'),
    risks: [
      {
        id: 'R-INT-1',
        riskCode: 'R-INT-1',
        projectName: '智慧校园一期',
        description: '验收阻塞导致回款延期',
        category: '财务',
        stage: '监控',
        source: '风险登记册',
        impactArea: '回款',
        probability: 4,
        impact: 5,
        urgency: 5,
        piScore: 20,
        priorityScore: 100,
        status: 'tracking',
        responseStrategyType: '上报',
        responseStrategy: '升级PMO协调验收和付款路径',
        preventiveAction: '补齐验收材料',
        contingencyPlan: '必要时发起风险升级评审',
        trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
        trackingMethod: '周会跟踪',
        owner: '张三',
        dueDate: '2026-07-04',
        nextReviewDate: '2026-07-04',
        closingCriteria: '验收签字并确认付款计划',
        linkedModule: '合同回款',
        createdAt: '2026-07-01',
      },
    ],
  });

  assert.equal(dashboardOnly.summary.openRiskLinks, 1);
  assert.equal(fromRegister.summary.highSeverity, 1);
  assert.equal(fromRegister.summary.paymentImpacts, 1);
  assert.equal(fromRegister.summary.milestoneImpacts, 1);
  assert.equal(fromRegister.summary.governanceEscalations, 1);
  assert.equal(fromRegister.links[0].suggestedWritebacks.every(item => item.requiresConfirmation), true);
  assert.equal(fromRegister.links[0].actions.some(action => action.targetModule === '治理工作流' && action.priority === 'P0'), true);
  assert.match(fromRegister.reportFacts[0], /智慧校园一期/);
  assert.match(fromRegister.reportFacts[0], /回款/);
});

test('risk escalation drafts convert linked risks into confirmable governance workflows and actions', () => {
  const riskIntegration = buildRiskIntegrationDashboard({
    asOf: new Date('2026-07-04T00:00:00.000Z'),
    risks: [
      {
        id: 'R-ESC-1',
        riskCode: 'R-ESC-1',
        projectName: '智慧校园一期',
        description: '验收阻塞导致回款延期',
        category: '财务',
        stage: '监控',
        source: '风险登记册',
        impactArea: '回款',
        probability: 4,
        impact: 5,
        urgency: 5,
        piScore: 20,
        priorityScore: 100,
        status: 'tracking',
        responseStrategyType: '上报',
        responseStrategy: '升级PMO协调验收和付款路径',
        preventiveAction: '补齐验收材料',
        contingencyPlan: '必要时发起风险升级评审',
        trigger: '客户验收签字依赖缺陷修复和付款材料确认。',
        trackingMethod: '周会跟踪',
        owner: '张三',
        dueDate: '2026-07-04',
        nextReviewDate: '2026-07-04',
        closingCriteria: '验收签字并确认付款计划',
        linkedModule: '合同回款',
        createdAt: '2026-07-01',
      },
    ],
  });
  const drafts = buildRiskEscalationDraftDashboard({ riskIntegration });

  assert.equal(drafts.summary.candidateRiskLinks, 1);
  assert.equal(drafts.summary.governanceDrafts, 1);
  assert.equal(drafts.summary.actionDrafts >= 1, true);
  assert.equal(drafts.summary.pendingConfirmation, drafts.summary.governanceDrafts + drafts.summary.actionDrafts);
  assert.equal(drafts.governanceDrafts[0].createInput.workflowId, 'risk-escalation');
  assert.equal(drafts.governanceDrafts[0].confirmationRequired, true);
  assert.match(drafts.governanceDrafts[0].createInput.inputSummary || '', /风险联动包/);
  assert.match(drafts.governanceDrafts[0].createInput.strategySummary || '', /确认后才创建/);
  assert.equal(drafts.actionDrafts[0].createInput.sourceType, 'risk');
  assert.equal(drafts.actionDrafts[0].createInput.sourceId, 'R-ESC-1');
  assert.match(drafts.boundary, /用户点击确认前不写/);
});

test('risk escalation draft API requires explicit confirmation before writes', () => {
  const routeSource = readFileSync(new URL('../src/app/api/risk/escalation-drafts/route.ts', import.meta.url), 'utf8');
  const riskPageSource = readFileSync(new URL('../src/app/risk/page.tsx', import.meta.url), 'utf8');

  assert.match(routeSource, /confirm !== true/);
  assert.match(routeSource, /createGovernanceInstance/);
  assert.match(routeSource, /createUnifiedAction/);
  assert.match(routeSource, /already_exists/);
  assert.match(riskPageSource, /\/api\/risk\/escalation-drafts/);
});

test('enterprise security permissions and project access scope data', () => {
  assert.equal(hasPermission({ role: 'admin' }, 'users:manage'), true);
  assert.equal(hasPermission({ role: 'user' }, 'users:manage'), false);
  assert.equal(hasPermission({ role: 'user' }, 'reports:generate'), true);
  assert.equal(ROLE_PERMISSION_MATRIX.admin.length, PERMISSION_DEFINITIONS.length);

  const dashboard: DashboardData = {
    source: { type: 'feishu', name: '飞书项目台账', generatedAt: '2026-07-02T00:00:00.000Z' },
    kpi: {
      totalProjects: 2,
      totalContract: 300,
      totalCollection: 100,
      collectionRate: 33.3,
      receivable: 200,
    },
    statusDistribution: [],
    monthlyTrend: [],
    regionDistribution: [],
    paymentGroups: [],
    projectLevels: [],
    healthMatrix: [],
    keyProjects: [],
    riskProjects: [],
    upcomingPayments: [],
    records: [
      {
        项目编号: 'P-SEC-1',
        项目名称: '张三负责项目',
        省份: '上海',
        客户名称: '客户A',
        项目状态: '执行中',
        项目等级: 'A',
        项目类型: '信息化',
        产品类别: '平台',
        项目负责人: '张三',
        当前进度: 0.6,
        合同金额: 100,
        已回款金额: 40,
        应收金额: 60,
        回款率: 0.4,
        成本健康度: 80,
        进度偏差: -3,
        风险类型: '综合风险',
        风险等级: '中',
        风险状态: '应对中',
        风险趋势: '平稳',
      },
      {
        项目编号: 'P-SEC-2',
        项目名称: '授权项目',
        省份: '浙江',
        客户名称: '客户B',
        项目状态: '执行中',
        项目等级: 'B',
        项目类型: '信息化',
        产品类别: '平台',
        项目负责人: '李四',
        当前进度: 0.5,
        合同金额: 200,
        已回款金额: 60,
        应收金额: 140,
        回款率: 0.3,
        成本健康度: 70,
        进度偏差: -8,
        风险类型: '回款风险',
        风险等级: '高',
        风险状态: '应对中',
        风险趋势: '恶化',
      },
    ],
  };

  const user = { id: 'u-1', name: '张三', email: 'zhangsan@example.com', phone: '13800000000', role: 'user' as const, status: 'active' as const };
  const ownerScoped = filterDashboardByProjectAccess(dashboard, user, []);
  assert.equal(ownerScoped.records.length, 1);
  assert.equal(ownerScoped.records[0].项目名称, '张三负责项目');
  assert.equal(ownerScoped.kpi.totalProjects, 1);

  const grant = { projectName: '授权项目', accessLevel: 'viewer' as const, status: 'active' as const };
  assert.equal(recordMatchesProjectGrant(dashboard.records[1] as unknown as Record<string, unknown>, [grant]), true);
  const grantScoped = filterDashboardByProjectAccess(dashboard, user, [grant]);
  assert.equal(grantScoped.records.length, 2);
  assert.equal(projectAccessMode(user, grantScoped.records.length, dashboard.records.length), 'scoped');

  const otherUser = { ...user, name: '王五', email: 'wangwu@example.com', phone: '13900000000' };
  const emptyScoped = filterDashboardByProjectAccess(dashboard, otherUser, []);
  assert.equal(emptyScoped.records.length, 0);
  assert.equal(emptyScoped.kpi.totalProjects, 0);
  assert.equal(emptyScoped.source.note?.includes('可见项目 0/2 个'), true);
});

test('security missing table detection does not confuse PostgREST relationship cache errors with P9 migration', () => {
  assert.equal(
    isMissingSecurityTableError(
      "Could not find a relationship between 'user_project_access_grants' and 'app_users' in the schema cache",
      "user_project_access_grants",
    ),
    false,
  );
  assert.equal(
    isMissingSecurityTableError(
      'relation "public.user_project_access_grants" does not exist',
      "user_project_access_grants",
    ),
    true,
  );
});

test('security export includes access requests audits and omits secrets', () => {
  const snapshot = {
    permissions: { definitions: PERMISSION_DEFINITIONS, matrix: ROLE_PERMISSION_MATRIX },
    users: [
      { id: 'u-1', email: 'zhangsan@example.com', phone: '13800000000', name: '张三', role: 'user' as const, status: 'active' as const },
    ],
    projectAccess: [
      { id: 'g-1', userId: 'u-1', userName: '张三', userEmail: 'zhangsan@example.com', projectName: '智慧校园一期', accessLevel: 'viewer' as const, status: 'active' as const, grantReason: '参与验收' },
    ],
    projectAccessRequests: [
      { id: 'r-1', requesterId: 'u-1', requesterName: '张三', requesterEmail: 'zhangsan@example.com', projectName: '智慧校园一期', accessLevel: 'viewer' as const, reason: '参与验收复核', status: 'pending' as const },
    ],
    auditLogs: [
      { id: 'a-1', actorName: '管理员', actorRole: 'admin', action: 'approve_project_access_request', resourceType: 'project_access_request', status: 'succeeded' as const, severity: 'medium' as const, summary: '批准访问', createdAt: '2026-07-02T00:00:00.000Z', requestId: 'req-1' },
    ],
    systemConfigurations: [],
    warnings: ['xlsx dependency pending replacement'],
  };

  const markdown = buildSecurityMarkdown(snapshot, '2026-07-02T00:00:00.000Z');
  const csv = buildSecurityCsv(snapshot);

  assert.match(markdown, /企业安全运营报告/);
  assert.match(markdown, /项目访问申请/);
  assert.match(markdown, /批准访问/);
  assert.match(csv, /access_request/);
  assert.equal(/sk-[A-Za-z0-9_-]{20,}|TEST_PASSWORD_SHOULD_NOT_APPEAR|TEST_PHONE_SHOULD_NOT_APPEAR/.test(markdown), false);
});

test('operational workbench shows all records for admin role', () => {
  const workbench = buildOperationalWorkbench({
    user: { name: '管理员', role: 'admin' },
    projects: [
      { 项目编号: 'P-1', 项目名称: '项目A', 项目负责人: '张三', 项目状态: '进行中', 当前进度: 0.5 },
      { 项目编号: 'P-2', 项目名称: '项目B', 项目负责人: '李四', 项目状态: '进行中', 当前进度: 0.6 },
    ],
    risks: [],
    tasks: [],
    milestones: [],
    payments: [],
  });

  assert.equal(workbench.evidence.userScope, 'admin-all');
  assert.equal(workbench.myProjects.length, 2);
  assert.equal(workbench.kpis.find(item => item.label === '我的项目')?.value, '2');
});

test('governance workflow model derives lifecycle transitions', () => {
  assert.equal(initialGovernanceState('project-initiation-review'), '待提交');
  assert.equal(deriveGovernanceNextState('project-initiation-review', '待提交', 'submit'), '待评审');
  assert.equal(deriveGovernanceNextState('project-initiation-review', '待评审', 'approve'), '已通过');
  assert.equal(deriveGovernanceNextState('project-initiation-review', '待评审', 'return'), '需补充');
  assert.equal(deriveGovernanceNextState('change-control', '待审批', 'reject'), '已拒绝');
  assert.equal(deriveGovernanceNextState('project-closure', '已验收', 'close'), '已归档');
});

test('governance SLA dashboard highlights overdue and my pending workflow items', () => {
  const instances = [
    {
      id: 'gov-1',
      workflowId: 'stage-gate-review',
      workflowName: '阶段门评审',
      stage: '全生命周期',
      projectName: '项目A',
      title: '项目A阶段门评审',
      owner: '张三',
      approver: 'PMO',
      state: '待评审',
      priority: 'high',
      deadline: '2026-07-01',
      source: 'ai-pmo',
      createdByName: '管理员',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'gov-2',
      workflowId: 'change-control',
      workflowName: '变更评审',
      stage: '执行',
      projectName: '项目B',
      title: '项目B范围变更',
      owner: '李四',
      approver: '张三',
      state: '待审批',
      priority: 'medium',
      deadline: '2026-07-03',
      source: 'ai-pmo',
      createdByName: '李四',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    {
      id: 'gov-3',
      workflowId: 'project-closure',
      workflowName: '收尾验收',
      stage: '收尾',
      projectName: '项目C',
      title: '项目C归档',
      owner: '王五',
      approver: 'PMO',
      state: '已归档',
      priority: 'low',
      deadline: '2026-07-01',
      source: 'ai-pmo',
      createdByName: '王五',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
      closedAt: '2026-07-01T00:00:00.000Z',
    },
  ] as never;
  const now = new Date('2026-07-03T10:00:00+08:00');
  const sla = deriveGovernanceSla(instances[0], now);
  const dashboard = buildGovernanceSlaDashboard(instances, { name: '张三', role: 'user' }, now);

  assert.equal(sla.status, '已逾期');
  assert.equal(sla.daysLeft, -2);
  assert.equal(dashboard.summary.totalOpen, 2);
  assert.equal(dashboard.summary.overdue, 1);
  assert.equal(dashboard.summary.dueToday, 1);
  assert.equal(dashboard.summary.myPending, 2);
  assert.deepEqual(dashboard.workItems.map(item => item.role), ['责任人', '审批人']);
});

test('governance impact packages connect approvals to project risk and report facts', () => {
  const stageGate = {
    id: 'gov-impact-1',
    workflowId: 'stage-gate-review',
    workflowName: '阶段门评审',
    stage: '全生命周期',
    projectName: '重点项目A',
    title: '重点项目A阶段门评审',
    owner: '张三',
    approver: 'PMO',
    state: '已通过',
    priority: 'high',
    deadline: '2026-07-05',
    source: 'ai-pmo',
    createdByName: '管理员',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as never;
  const riskEscalation = {
    ...stageGate,
    id: 'gov-impact-2',
    workflowId: 'risk-escalation',
    workflowName: '风险升级评审',
    title: '重点项目A风险升级',
    state: '已升级',
  } as never;
  const gateImpact = buildGovernanceImpactPackage({ instance: stageGate });
  const riskImpact = buildGovernanceImpactPackage({ instance: riskEscalation });
  const dashboard = buildGovernanceImpactDashboard([stageGate, riskEscalation]);

  assert.equal(gateImpact.writebackMode, 'manual_confirmation_required');
  assert.equal(gateImpact.updates.some(update => update.targetType === 'project' && update.field === '下一阶段授权'), true);
  assert.equal(riskImpact.updates.some(update => update.targetType === 'risk' && update.suggestedValue === '应对实施中'), true);
  assert.equal(dashboard.summary.projectWritebacks > 0, true);
  assert.equal(dashboard.summary.riskWritebacks > 0, true);
  assert.equal(dashboard.reportFacts.some(item => item.includes('治理联动') || item.includes('阶段门已通过')), true);
});

test('governance action item parser supports text rows and structured rows', () => {
  const textRows = parseGovernanceActionItems('补充商业论证 | 项目经理 | 2026-07-05\n确认回款条件 | 商务 | 2026-07-06');
  assert.equal(textRows.length, 2);
  assert.equal(textRows[0].owner, '项目经理');

  const structuredRows = parseGovernanceActionItems([{ title: '更新阶段门材料', owner: 'PMO', dueDate: '2026-07-07' }]);
  assert.equal(structuredRows.length, 1);
  assert.equal(structuredRows[0].title, '更新阶段门材料');
});

test('governance report includes outputs actions and audit trail', () => {
  const markdown = buildGovernanceReport({
    instance: {
      id: 'gov-1',
      workflowId: 'stage-gate-review',
      workflowName: '阶段门评审',
      stage: '全生命周期',
      projectName: '项目A',
      title: '项目A阶段门评审',
      triggerSummary: '进入下一阶段前',
      inputSummary: '阶段成果、风险清单',
      outputSummary: '同意进入下一阶段',
      owner: '项目经理',
      approver: 'PMO',
      state: '已通过',
      priority: 'high',
      deadline: '2026-07-05',
      source: 'ai-pmo',
      createdByName: '管理员',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    },
    events: [
      {
        id: 'event-1',
        instanceId: 'gov-1',
        eventType: 'approve',
        fromState: '待评审',
        toState: '已通过',
        comment: '材料完整',
        actorName: 'PMO',
        actorRole: 'admin',
        decision: 'approve',
        outputs: {},
        createdAt: '2026-07-01T01:00:00.000Z',
      },
    ],
    actions: [
      {
        id: 'action-1',
        instanceId: 'gov-1',
        title: '同步下一阶段计划',
        owner: '项目经理',
        dueDate: '2026-07-06',
        status: 'open',
        createdAt: '2026-07-01T01:00:00.000Z',
        updatedAt: '2026-07-01T01:00:00.000Z',
      },
    ],
    businessImpact: {
      summary: '阶段门已通过，建议同步项目阶段状态。',
      nextAction: 'PMO确认后写回项目台账。',
      writebackMode: 'manual_confirmation_required',
      updates: [{
        targetType: 'project',
        targetName: '项目A',
        field: '阶段门状态',
        suggestedValue: '已通过',
        reason: '阶段门评审通过。',
        requiresConfirmation: true,
      }],
      reportFacts: ['阶段门评审｜项目A｜状态：已通过'],
    },
  });

  assert.match(markdown, /阶段门评审治理流程输出/);
  assert.match(markdown, /业务联动建议/);
  assert.match(markdown, /阶段门状态 → 已通过/);
  assert.match(markdown, /同意进入下一阶段/);
  assert.match(markdown, /同步下一阶段计划/);
  assert.match(markdown, /待评审 → 已通过/);
});

test('governance audit package exports inputs approvals attachments outputs and redacted evidence', () => {
  const secret = `sk-${'x'.repeat(24)}`;
  const instance = {
    id: 'gov-audit-1',
    workflowId: 'stage-gate-review',
    workflowName: '阶段门评审',
    stage: '全生命周期',
    projectName: '项目A',
    title: '项目A阶段门评审',
    triggerSummary: '项目进入下一阶段前，需要确认阶段成果。',
    inputSummary: `阶段成果材料：https://example.com/stage-a；密钥误填 ${secret}`,
    outputSummary: '同意进入下一阶段，但需要关闭整改行动项。',
    owner: '项目经理',
    approver: 'PMO',
    state: '有条件通过',
    priority: 'high',
    deadline: '2026-07-05',
    source: 'ai-pmo',
    createdByName: '管理员',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T01:00:00.000Z',
  } as never;
  const events = [
    {
      id: 'event-1',
      instanceId: 'gov-audit-1',
      eventType: 'conditional_approve',
      fromState: '待评审',
      toState: '有条件通过',
      comment: '材料基本完整，缺陷清单需关闭。',
      actorName: 'PMO',
      actorRole: 'admin',
      decision: 'conditional_approve',
      outputs: { attachment_url: 'https://example.com/evidence-a' },
      createdAt: '2026-07-01T01:00:00.000Z',
    },
  ] as never;
  const actions = [
    {
      id: 'action-1',
      instanceId: 'gov-audit-1',
      title: '关闭缺陷清单',
      owner: '交付负责人',
      dueDate: '2026-07-04',
      status: 'open',
      createdAt: '2026-07-01T01:00:00.000Z',
      updatedAt: '2026-07-01T01:00:00.000Z',
    },
  ] as never;

  const auditPackage = buildGovernanceAuditPackage({ instance, events, actions, generatedAt: '2026-07-03T00:00:00.000Z' });
  const collection = buildGovernanceAuditCollectionMarkdown({ packages: [auditPackage], filter: { projectName: '项目A', dateFrom: '2026-07-01', dateTo: '2026-07-03' } });
  const filtered = filterGovernanceAuditInstances([instance], { projectName: '项目A', dateFrom: '2026-07-01', dateTo: '2026-07-03' });

  assert.match(auditPackage.markdown, /治理流程输出与审计包/);
  assert.match(auditPackage.markdown, /输入材料与附件索引/);
  assert.match(auditPackage.markdown, /审批意见与状态流转/);
  assert.match(auditPackage.markdown, /输出成果与业务联动/);
  assert.match(auditPackage.markdown, /行动项闭环/);
  assert.match(auditPackage.markdown, /已脱敏密钥/);
  assert.equal(auditPackage.markdown.includes(secret), false);
  assert.equal(auditPackage.attachments.some(item => item.status === 'indexed'), true);
  assert.equal(auditPackage.unresolvedActions.length, 1);
  assert.match(collection, /PMO治理审计包汇总/);
  assert.match(collection, /项目A/);
  assert.equal(filtered.length, 1);
  assert.equal(redactGovernanceAuditText(`${'api'}${'key'}=${'a'.repeat(20)}`).includes('已脱敏'), true);
});

test('issue change model derives risk issue change lifecycle', () => {
  assert.equal(deriveIssueNextStatus('open', 'analyze'), 'analyzing');
  assert.equal(deriveIssueNextStatus('analyzing', 'require_change'), 'change-required');
  assert.equal(deriveIssueNextStatus('change-required', 'resolve'), 'resolving');
  assert.equal(deriveIssueNextStatus('resolved', 'close'), 'closed');

  assert.equal(deriveChangeNextStatus('proposed', 'analyze'), 'analyzing');
  assert.equal(deriveChangeNextStatus('analyzing', 'approve'), 'approved');
  assert.equal(deriveChangeNextStatus('approved', 'implement'), 'implementing');
  assert.equal(deriveChangeNextStatus('implementing', 'complete'), 'implemented');
  assert.equal(deriveChangeNextStatus('implemented', 'close'), 'closed');
});

test('risk can be converted into an issue draft with accountable action', () => {
  const risk: Risk = {
    id: 'RISK-001',
    riskCode: 'R-001',
    projectName: '重点项目A',
    description: '客户验收标准反复变化，已经影响交付范围',
    category: '需求',
    stage: '执行',
    source: '风险登记册',
    impactArea: '范围',
    probability: 4,
    impact: 5,
    urgency: 5,
    piScore: 20,
    priorityScore: 100,
    status: 'tracking',
    responseStrategyType: '上报',
    responseStrategy: '提交PMO处理',
    preventiveAction: '冻结需求口径',
    contingencyPlan: '发起变更',
    trigger: '客户新增验收项',
    trackingMethod: '周会跟踪',
    owner: '项目经理',
    dueDate: '2026-07-05',
    nextReviewDate: '2026-07-03',
    closingCriteria: '变更审批完成',
    linkedModule: '监控',
    createdAt: '2026-07-01',
  };

  const issue = riskToIssueDraft(risk);

  assert.equal(issue.projectName, '重点项目A');
  assert.equal(issue.severity, 'high');
  assert.equal(issue.owner, '项目经理');
  assert.match(issue.description || '', /来源风险：R-001/);
  assert.equal(Array.isArray(issue.actionItems), true);
});

test('unified action parser supports rows with owner due date and priority', () => {
  const actions = parseUnifiedActionItems('补充影响分析|项目经理|2026-07-05|P0\n提交审批|PMO|2026-07-06|P1');

  assert.equal(actions.length, 2);
  assert.equal(actions[0].owner, '项目经理');
  assert.equal(actions[0].priority, 'P0');
  assert.equal(actions[1].dueDate, '2026-07-06');
});

test('issue change chain report includes issues changes actions and audit trail', () => {
  const markdown = buildIssueChangeChainReport({
    issues: [
      {
        id: 'issue-1',
        issueCode: 'ISS-1',
        projectName: '项目A',
        title: '核心资源冲突',
        description: '资源冲突导致关键路径延误',
        severity: 'high',
        status: 'change-required',
        owner: '项目经理',
        dueDate: '2026-07-05',
        impactScope: '进度',
        sourceRiskCode: 'R-001',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    changes: [
      {
        id: 'change-1',
        changeCode: 'CHG-1',
        issueId: 'issue-1',
        projectName: '项目A',
        title: '调整资源投入',
        reason: '解决关键路径延误',
        changeType: 'resource',
        impactScope: '关键路径',
        impactCost: 5,
        impactScheduleDays: -3,
        impactRevenue: 0,
        impactCollection: '不影响本月回款',
        status: 'approved',
        owner: '项目经理',
        approver: 'PMO',
        dueDate: '2026-07-06',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    actions: [
      {
        id: 'action-1',
        sourceType: 'change',
        sourceId: 'change-1',
        projectName: '项目A',
        title: '同步资源调整计划',
        owner: '项目经理',
        dueDate: '2026-07-06',
        status: 'open',
        priority: 'P0',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    events: [
      {
        id: 'event-1',
        subjectType: 'issue',
        subjectId: 'issue-1',
        eventType: 'require_change',
        fromStatus: 'analyzing',
        toStatus: 'change-required',
        actorName: 'PMO',
        comment: '需要变更',
        createdAt: '2026-07-01T01:00:00.000Z',
      },
    ],
  });

  assert.match(markdown, /风险-问题-变更-行动项链路报告/);
  assert.match(markdown, /核心资源冲突/);
  assert.match(markdown, /调整资源投入/);
  assert.match(markdown, /同步资源调整计划/);
  assert.match(markdown, /analyzing → change-required/);
});
