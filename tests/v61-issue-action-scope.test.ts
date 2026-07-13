import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

function issueActionScopeMigration(): string {
  const filenames = readdirSync(new URL("supabase/migrations/", ROOT));
  const filename = filenames.find(item => item.endsWith("_v61_issue_action_scope.sql"));
  assert.ok(filename, "缺少通过 Supabase CLI 创建的 v61_issue_action_scope migration");
  return read(`supabase/migrations/${filename}`);
}

test("V6.1 问题与统一行动项补齐组织项目数据分类契约", () => {
  const sql = issueActionScopeMigration();
  assert.match(sql, /alter table public\.project_issues[\s\S]*add column if not exists org_id uuid/i);
  assert.match(sql, /alter table public\.project_issues[\s\S]*add column if not exists project_id uuid/i);
  assert.match(sql, /alter table public\.project_issues[\s\S]*add column if not exists data_class text/i);
  assert.match(sql, /project_issues_data_class_check[\s\S]*production[\s\S]*sample[\s\S]*test[\s\S]*diagnostic[\s\S]*unclassified/i);
  assert.match(sql, /update public\.project_issues[\s\S]*from public\.projects/i);
  assert.match(sql, /create index if not exists idx_project_issues_scope[\s\S]*org_id[\s\S]*data_class[\s\S]*project_id/i);

  assert.match(sql, /alter table public\.unified_action_items[\s\S]*add column if not exists org_id uuid/i);
  assert.match(sql, /alter table public\.unified_action_items[\s\S]*add column if not exists project_id uuid/i);
  assert.match(sql, /alter table public\.unified_action_items[\s\S]*add column if not exists data_class text/i);
  assert.match(sql, /update public\.unified_action_items[\s\S]*from public\.projects/i);
  assert.match(sql, /create index if not exists idx_unified_action_scope[\s\S]*org_id[\s\S]*data_class[\s\S]*project_id/i);
  assert.doesNotMatch(sql, /drop\s+(?:table|column|constraint|index)/i, "该迁移必须仅做 additive 兼容变更");
  assert.doesNotMatch(sql, /grant\s+all/i, "service_role 仅授予明确的表级 DML 权限");
  assert.match(sql, /grant select, insert, update, delete on table public\.project_issues to service_role/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.unified_action_items to service_role/i);
});

test("问题与行动项仓储映射并写入 org_id project_id data_class", () => {
  const model = read("src/features/issue-change/model.ts");
  const repository = read("src/features/issue-change/repository.ts");

  assert.match(model, /interface IssueRecord[\s\S]*orgId\??:\s*string\s*\|\s*null[\s\S]*projectId\??:\s*string\s*\|\s*null[\s\S]*dataClass\??:/);
  assert.match(repository, /function mapIssue[\s\S]*orgId:\s*row\.org_id[\s\S]*projectId:\s*row\.project_id[\s\S]*dataClass:/);
  assert.match(repository, /from\("project_issues"\)[\s\S]*\.insert\(\{[\s\S]*org_id:\s*scope\.orgId[\s\S]*project_id:\s*projectId[\s\S]*data_class:\s*scope\.dataClass/);
  assert.match(repository, /from\("unified_action_items"\)[\s\S]*org_id:\s*input\.scope\.orgId[\s\S]*project_id:\s*input\.scopedProjectId[\s\S]*data_class:\s*input\.scope\.dataClass/);
  assert.match(repository, /transitionIssue[\s\S]*createActionItems\(\{[\s\S]*scope,[\s\S]*scopedProjectId:\s*projectId/);
  assert.doesNotMatch(repository, /const risk\s*=\s*input\.risk\s*\|\|/, "不得把客户端传入的风险对象当作已授权真实记录");
  assert.match(repository, /findRiskByIdOrCode\([^,]+,\s*scope\)/);
});

test("风险升级行动与知识治理行动继承当前 scope", () => {
  const escalation = read("src/app/api/risk/escalation-drafts/route.ts");
  const operation = read("src/app/api/risk/retrospective/assets/governance/followups/operation-history/route.ts");

  for (const source of [escalation, operation]) {
    assert.match(source, /createUnifiedAction\(\{[\s\S]*?\},\s*user,\s*\{[\s\S]*?\.\.\.[^}]*scope[\s\S]*?requestedProjectId:/);
  }
});

test("治理工作流写入 canonical_project_id 而不只是历史 project_id", () => {
  const repository = read("src/features/governance/repository.ts");
  const operationWorkflow = read("src/app/api/risk/retrospective/assets/governance/followups/operation-history/governance-workflow/route.ts");
  const escalation = read("src/app/api/risk/escalation-drafts/route.ts");

  assert.match(repository, /interface GovernanceCreateInput[\s\S]*canonicalProjectId\??:\s*string/);
  assert.match(repository, /canonical_project_id:\s*input\.canonicalProjectId/);
  assert.match(operationWorkflow, /canonicalProjectId:\s*projectId/);
  assert.match(escalation, /canonicalProjectId:\s*scopedProjectId/);
});

test("内部授权项目不因缺少飞书标识被丢弃", () => {
  const persistence = read("src/features/operating-model/persistence.ts");
  assert.doesNotMatch(persistence, /if\s*\(!row\.source_record_id\s*&&\s*!row\.oa_no\)\s*continue/);
  assert.match(persistence, /sourceRecordId:\s*row\.source_record_id\s*\|\|\s*""/);
});
