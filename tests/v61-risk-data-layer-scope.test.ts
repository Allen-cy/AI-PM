import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

const FEATURES = {
  assets: "src/features/risk/retrospective-assets.ts",
  governance: "src/features/risk/retrospective-governance.ts",
  followups: "src/features/risk/retrospective-governance-followups.ts",
  operations: "src/features/risk/retrospective-governance-operations.ts",
  evidence: "src/features/risk/retrospective-governance-evidence-chain.ts",
  sync: "src/features/risk/retrospective-knowledge-sync.ts",
} as const;

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

test("五个风险复盘仓储统一使用 RiskDataScope", () => {
  for (const path of Object.values(FEATURES)) {
    assert.match(read(path), /import[^;]*RiskDataScope[\s\S]*?from\s*"\.\/scope\.ts"/, `${path} 未使用 RiskDataScope`);
  }

  const signatures: Array<[string, RegExp]> = [
    [FEATURES.governance, /listRiskRetrospectiveGovernanceLogs\(input:\s*\{[\s\S]*?scope:\s*RiskDataScope/],
    [FEATURES.followups, /listRiskRetrospectiveGovernanceFollowups\([\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.followups, /saveRiskRetrospectiveGovernanceFollowups\([\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.followups, /getRiskRetrospectiveGovernanceFollowup\(id:\s*string,\s*scope\??:\s*RiskDataScope/],
    [FEATURES.followups, /transitionRiskRetrospectiveGovernanceFollowup\([\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.followups, /updateRiskRetrospectiveGovernanceFollowupFromReminder\([\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.followups, /updateRiskRetrospectiveGovernanceFollowupFeishuSync\([\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.operations, /persistRiskRetrospectiveGovernanceOperationSnapshot\(input:\s*\{[\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.operations, /persistRiskRetrospectiveGovernanceReminderLogs\(input:\s*\{[\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.operations, /listRiskRetrospectiveGovernanceOperationHistory\(input:\s*\{[\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.operations, /getRiskRetrospectiveGovernanceReminderLog\(id:\s*string,\s*scope\??:\s*RiskDataScope/],
    [FEATURES.operations, /updateRiskRetrospectiveGovernanceReminderLogStatus\(input:\s*\{[\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.evidence, /getKnowledgeGovernanceEvidenceChain\(input:\s*\{[\s\S]*?scope:\s*RiskDataScope/],
    [FEATURES.evidence, /saveKnowledgeGovernanceEvidenceRecommendation\(input:\s*\{[\s\S]*?scope:\s*RiskDataScope/],
    [FEATURES.evidence, /applyKnowledgeGovernanceEvidenceRecommendation\(input:\s*\{[\s\S]*?scope:\s*RiskDataScope/],
    [FEATURES.sync, /persistRiskRetrospectiveSyncLog\(input:\s*\{[\s\S]*?scope\??:\s*RiskDataScope/],
    [FEATURES.sync, /listRiskRetrospectiveSyncLogs\([\s\S]*?scope\??:\s*RiskDataScope/],
  ];
  for (const [path, pattern] of signatures) assert.match(read(path), pattern, `${path} 仍有不带 scope 的入口`);
});

test("项目级仓储强制 org_id data_class 和允许的 project_id", () => {
  for (const path of [FEATURES.governance, FEATURES.followups, FEATURES.evidence]) {
    const source = read(path);
    assert.match(source, /resolveRequestedRiskProjectIds\(/, `${path} 未解析项目范围`);
    assert.match(source, /\.eq\("org_id",\s*[^)]+\.orgId\)/, `${path} 未过滤 org_id`);
    assert.match(source, /\.eq\("data_class",\s*[^)]+\.dataClass\)/, `${path} 未过滤 data_class`);
    assert.match(source, /\.in\("project_id",\s*projectIds\)/, `${path} 未限制 project_id`);
  }

  const followups = read(FEATURES.followups);
  assert.match(followups, /if\s*\(!scope\)[\s\S]{0,160}RISK_DATA_SCOPE_REQUIRED/);
  assert.match(followups, /if\s*\(projectIds\.length\s*===\s*0\)[\s\S]{0,140}followups:\s*\[\]/);
  assert.match(followups, /org_id:\s*scope\.orgId/);
  assert.match(followups, /data_class:\s*scope\.dataClass/);
  assert.match(followups, /project_id:\s*projectId/);
  assert.match(followups, /onConflict:\s*"org_id,data_class,project_id,action_key"/);
});

test("快照提醒、资产与导出审计强制组织、数据分类和项目", () => {
  for (const path of [FEATURES.operations, FEATURES.sync]) {
    const source = read(path);
    assert.match(source, /\.eq\("org_id",\s*[^)]+\.orgId\)/, `${path} 未过滤 org_id`);
    assert.match(source, /\.eq\("data_class",\s*[^)]+\.dataClass\)/, `${path} 未过滤 data_class`);
    assert.match(source, /org_id:\s*[^,]+\.orgId/);
    assert.match(source, /data_class:\s*[^,]+\.dataClass/);
    assert.match(source, /project_id:\s*[^,\n]+/);
  }

  const assets = read(FEATURES.assets);
  const operations = read(FEATURES.operations);
  assert.match(assets, /onConflict:\s*"org_id,data_class,project_id,asset_key"/);
  assert.match(operations, /onConflict:\s*"org_id,data_class,project_id,snapshot_date"/);
  assert.match(operations, /onConflict:\s*"org_id,data_class,project_id,reminder_key"/);
});

test("运营快照和提醒只按具体授权项目持久化与读取", () => {
  const operations = read(FEATURES.operations);
  const weeklyReminderRoute = read("src/app/api/risk/retrospective/assets/governance/followups/weekly-reminder/route.ts");

  assert.match(
    operations,
    /function\s+requiredOperationProjectId\(scope:\s*RiskDataScope\):\s*string[\s\S]*?projectIds\.length\s*!==\s*1[\s\S]*?PROJECT_ID_REQUIRED/,
  );
  assert.match(operations, /persistRiskRetrospectiveGovernanceOperationSnapshot[\s\S]*?const projectId\s*=\s*requiredOperationProjectId\(input\.scope\)/);
  assert.match(operations, /persistRiskRetrospectiveGovernanceReminderLogs[\s\S]*?const projectId\s*=\s*requiredOperationProjectId\(input\.scope\)/);
  assert.match(operations, /listRiskRetrospectiveGovernanceOperationHistory[\s\S]*?\.in\("project_id",\s*projectIds\)/);
  assert.match(operations, /interface RiskRetrospectiveGovernanceOperationSnapshot[\s\S]*?projectId:\s*string/);
  assert.match(operations, /projectId:\s*String\(row\.project_id/);
  assert.doesNotMatch(operations, /const projectId\s*=\s*null/);
  assert.doesNotMatch(operations, /\.is\("project_id",\s*null\)/);
  assert.match(weeklyReminderRoute, /resolveRequestedRiskProjectIds\(access\.scope,\s*access\.scope\.requestedProjectId\)/);
  assert.match(weeklyReminderRoute, /projectIds\.length\s*!==\s*1[\s\S]{0,220}PROJECT_ID_REQUIRED/);
  assert.ok(
    weeklyReminderRoute.indexOf("PROJECT_ID_REQUIRED") < weeklyReminderRoute.indexOf("new FeishuActionClient"),
    "必须在任何飞书外部写入前拒绝无唯一项目上下文",
  );
});

test("V6.1 对八张风险复盘表做保守回填并提供隔离计数审计", () => {
  const migration = read("supabase/migrations/20260711150000_v61_risk_scope_quarantine.sql");
  const scopedTables = [
    "risk_retrospective_assets",
    "risk_retrospective_asset_sync_logs",
    "risk_retrospective_asset_usage_logs",
    "risk_retrospective_asset_governance_logs",
    "risk_retrospective_governance_followups",
    "risk_retrospective_governance_operation_snapshots",
    "risk_retrospective_governance_reminder_logs",
    "risk_retrospective_governance_evidence_links",
  ];

  for (const table of scopedTables) {
    assert.match(migration, new RegExp(`update\\s+public\\.${table}\\b`, "i"), `${table} 缺保守范围回填`);
    assert.match(
      migration,
      new RegExp(`audit_v61_risk_retrospective_scope[\\s\\S]*?'${table}'`, "i"),
      `${table} 缺隔离计数审计`,
    );
  }
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.audit_v61_risk_retrospective_scope\(\)/i);
  assert.match(migration, /isolated_count\s+bigint/i);
  assert.match(migration, /inconsistent_count\s+bigint/i);
  assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.audit_v61_risk_retrospective_scope\(\)/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.risk_retrospective/i);
  assert.doesNotMatch(migration, /truncate\s+(?:table\s+)?public\.risk_retrospective/i);
});

test("V6.1 风险范围迁移保留滚动兼容且在最终 DDL 后刷新 PostgREST", () => {
  const migration = read("supabase/migrations/20260711150000_v61_risk_scope_quarantine.sql");

  assert.match(migration, /unique\s*\(org_id,\s*data_class,\s*project_id,\s*snapshot_date\)/i);
  assert.match(migration, /unique\s*\(org_id,\s*data_class,\s*project_id,\s*reminder_key\)/i);
  assert.doesNotMatch(migration, /drop\s+constraint\s+(?:if\s+exists\s+)?(?:risk_retrospective_governance_operation_snapshots_snapshot_date_key|risk_retrospective_governance_reminder_logs_reminder_key_key)/i);
  assert.match(migration.trimEnd(), /notify\s+pgrst\s*,\s*'reload schema'\s*;$/i);
});

test("按 ID 更新仍附加范围条件，不会仅凭 ID 跨项目操作", () => {
  for (const path of [FEATURES.followups, FEATURES.operations, FEATURES.evidence]) {
    const source = read(path);
    const idQueries = [...source.matchAll(/\.eq\("id",[^\n]+\)[\s\S]{0,260}/g)].map(match => match[0]);
    assert.ok(idQueries.length > 0, `${path} 没有按ID查询或更新`);
    for (const block of idQueries) {
      assert.match(block, /\.eq\("org_id",\s*[^)]+\.orgId\)/, `${path} 按ID操作缺 org_id`);
      assert.match(block, /\.eq\("data_class",\s*[^)]+\.dataClass\)/, `${path} 按ID操作缺 data_class`);
    }
  }
});

test("动态风险知识只在当前授权项目范围内进入 RAG", () => {
  const ragRoute = read("src/app/api/rag/query/route.ts");
  const knowledgePage = read("src/app/knowledge/page.tsx");
  assert.match(ragRoute, /authorizeRiskRequest\(request,\s*'read'\)/);
  assert.match(ragRoute, /listPublishedRiskRetrospectiveRagDocuments\(riskScope\)/);
  assert.match(ragRoute, /scope:\s*riskScope/);
  assert.match(knowledgePage, /loadCurrentBusinessContextSearchParams/);
  assert.match(knowledgePage, /\/api\/rag\/query\?\$\{contextParams\.toString\(\)\}/);
});
