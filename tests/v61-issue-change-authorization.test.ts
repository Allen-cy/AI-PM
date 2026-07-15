import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  issueChangeRecordBelongsToScope,
  resolveIssueChangeProjectIds,
} from "../src/features/issue-change/scope.ts";

const ROOT = new URL("../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, ROOT), "utf8");
}

test("issue change API authorizes every read and mutation with one governed business scope", () => {
  const route = read("src/app/api/issue-change/route.ts");
  const report = read("src/app/api/issue-change/report/route.ts");

  assert.match(route, /export async function GET\(request:\s*Request\)/);
  assert.match(route, /authorizeRiskRequest\(request,\s*"read"\)/);
  assert.match(route, /listIssueChangeChain\(access\.scope/);
  assert.match(route, /operationAccessOperation\(body\.operation\)/);
  assert.match(route, /authorizeRiskRequest\(request,\s*accessOperation\)/);
  assert.match(route, /parseProjectControlWriteContract\(body\)/);
  assert.match(route, /apply_project_issue_change_action_tx/);
  assert.match(route, /access\.scope\.orgId[\s\S]+contract\.projectId[\s\S]+contract\.dataClass/);

  assert.match(report, /authorizeRiskRequest\(request,\s*"read"\)/);
  assert.match(report, /issueChangeReportMarkdown\(access\.scope\)/);
});

test("issue change repository scopes list and every ID lookup or mutation by org data class and allowed projects", () => {
  const repository = read("src/features/issue-change/repository.ts");
  const scopeSource = read("src/features/issue-change/scope.ts");

  assert.match(scopeSource, /export function resolveIssueChangeProjectIds/);
  assert.match(scopeSource, /if\s*\(!allowed\.includes\(requested\)\)\s*throw new Error\("PROJECT_OUTSIDE_CONTEXT"\)/);
  assert.match(scopeSource, /export function issueChangeRecordBelongsToScope/);

  assert.match(repository, /listIssueChangeChain\([\s\S]*?scope:\s*RiskRepositoryScope/);
  for (const table of ["project_issues", "project_changes", "unified_action_items", "issue_change_events"]) {
    const tablePattern = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      repository,
      new RegExp(`from\\("${tablePattern}"\\)[\\s\\S]*?\\.eq\\("org_id",\\s*scope\\.orgId\\)[\\s\\S]*?\\.eq\\("data_class",\\s*scope\\.dataClass\\)[\\s\\S]*?\\.in\\("project_id",\\s*projectIds\\)`),
      `${table} list must be scoped`,
    );
  }

  for (const operation of ["getIssue", "transitionIssue", "createChange", "transitionChange", "closeUnifiedAction", "createUnifiedAction"]) {
    assert.match(repository, new RegExp(`${operation}\\([\\s\\S]*?scope:\\s*RiskRepositoryScope`), `${operation} must require a scope`);
  }

  assert.doesNotMatch(repository, /org_id:\s*input\.orgId/);
  assert.doesNotMatch(repository, /data_class:\s*input\.dataClass/);
  assert.match(repository, /project_id:\s*input\.scopedProjectId/);
});

test("cross-organization and cross-project records are rejected by the executable scope contract", () => {
  const scope = {
    orgId: "org-a",
    dataClass: "production" as const,
    projectIds: ["project-a", "project-b"],
    requestedProjectId: "project-a",
  };

  assert.deepEqual(resolveIssueChangeProjectIds(scope), ["project-a"]);
  assert.equal(issueChangeRecordBelongsToScope({ orgId: "org-a", projectId: "project-a", dataClass: "production" }, scope), true);
  assert.equal(issueChangeRecordBelongsToScope({ orgId: "org-b", projectId: "project-a", dataClass: "production" }, scope), false);
  assert.equal(issueChangeRecordBelongsToScope({ orgId: "org-a", projectId: "project-b", dataClass: "production" }, scope), false);
  assert.equal(issueChangeRecordBelongsToScope({ orgId: "org-a", projectId: "project-a", dataClass: "test" }, scope), false);
  assert.throws(
    () => resolveIssueChangeProjectIds({ ...scope, requestedProjectId: "project-outside" }),
    /PROJECT_OUTSIDE_CONTEXT/,
  );
});

test("V6.1 issue change migration scopes changes and events as well as issues and actions", () => {
  const sql = read("supabase/migrations/20260711160000_v61_issue_action_scope.sql");

  for (const table of ["project_changes", "issue_change_events"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists org_id uuid`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists project_id uuid`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists data_class text`, "i"));
    assert.match(sql, new RegExp(`create index if not exists idx_${table}_scope[\\s\\S]*?org_id[\\s\\S]*?data_class[\\s\\S]*?project_id`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }

  assert.match(sql, /update public\.project_changes[\s\S]*?from public\.projects/i);
  assert.match(sql, /update public\.issue_change_events[\s\S]*?from public\.project_issues/i);
  assert.match(sql, /update public\.issue_change_events[\s\S]*?from public\.project_changes/i);
  assert.match(sql, /update public\.issue_change_events[\s\S]*?from public\.unified_action_items/i);

  assert.match(sql, /create or replace function public\.validate_issue_change_scope_v61\(\)/i);
  for (const table of ["project_issues", "project_changes", "unified_action_items", "issue_change_events"]) {
    assert.match(
      sql,
      new RegExp(`create trigger trg_${table}_scope_v61[\\s\\S]*?on public\\.${table}[\\s\\S]*?validate_issue_change_scope_v61`, "i"),
      `${table} must be protected by the canonical scope trigger`,
    );
  }
  assert.match(sql, /new\.project_name\s*:=\s*canonical_project\.name/i);
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
