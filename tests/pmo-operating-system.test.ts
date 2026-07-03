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
import { buildOperationalWorkbench } from '../src/features/operating-system/workbench.ts';
import {
  buildGovernanceReport,
  deriveGovernanceNextState,
  initialGovernanceState,
  parseGovernanceActionItems,
} from '../src/features/governance/model.ts';
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
import {
  buildReportEvidence,
  buildReportFactoryPackage,
  extractMeetingActionItems,
  fallbackReportContent,
} from '../src/features/reports/factory.ts';
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
import { POST as analyzeMigrationPackage } from '../src/app/api/migration/analyze/route.ts';
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
  assert.equal(governanceWorkflows.length >= 5, true);
  for (const workflow of governanceWorkflows) {
    assert.ok(workflow.owner);
    assert.ok(workflow.approver);
    assert.equal(workflow.inputs.length > 0, true);
    assert.equal(workflow.outputs.length > 0, true);
    assert.equal(workflow.states.length > 0, true);
    assert.ok(workflow.auditTrail);
  }
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
  const migrationPageSource = readFileSync(new URL('../src/app/migration-center/page.tsx', import.meta.url), 'utf8');

  assert.match(homeSource, /href: "\/migration-center"/);
  assert.match(integrationSource, /href="\/migration-center"/);
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
  });

  assert.equal(workbench.evidence.userScope, 'matched-owner');
  assert.equal(workbench.myProjects.length, 1);
  assert.equal(workbench.myProjects[0].name, '张三负责项目');
  assert.equal(workbench.myRisks.length, 1);
  assert.equal(workbench.todayTodos.some(item => item.id === 'T-1'), true);
  assert.equal(workbench.todayTodos.some(item => item.id === 'M-1'), false);
  assert.equal(workbench.businessReminders.length >= 1, true);
  assert.match(workbench.aiSuggestions[0].basis, /任务1条/);
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
  };

  const dataPackage = buildReportFactoryPackage(request, context);
  const actionItems = extractMeetingActionItems(request.completedWork, request.projectName);
  const evidence = buildReportEvidence({ request, context, dataPackage, actionItems, status: 'generated' });
  const markdown = fallbackReportContent(request, dataPackage, actionItems);

  assert.equal(dataPackage.dataSources.some(source => source.source === 'feishu'), true);
  assert.equal(dataPackage.financeFacts.some(item => item.includes('验收阻塞回款')), true);
  assert.equal(actionItems.length, 2);
  assert.equal(actionItems[1].priority, 'P0');
  assert.equal(evidence.scene, 'report');
  assert.equal(evidence.citations.includes('飞书项目台账'), true);
  assert.equal(evidence.suggestedActions.length, 2);
  assert.match(markdown, /数据来源与生成边界/);
  assert.match(markdown, /补齐客户付款条件清单/);
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
  });

  assert.match(markdown, /阶段门评审治理流程输出/);
  assert.match(markdown, /同意进入下一阶段/);
  assert.match(markdown, /同步下一阶段计划/);
  assert.match(markdown, /待评审 → 已通过/);
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
