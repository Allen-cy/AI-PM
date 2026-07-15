#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const origin = String(process.argv[2] || "https://pmai.chunyu2026.qzz.io").replace(/\/$/, "");
const projectRef = "nxhvzfsuzelnxbrrglxk";
const organizationId = "64000000-0000-4000-8000-000000000001";
const runId = "64000000-0000-4000-8000-000000000401";
const credentialPath = ".tmp/v640-role-acceptance-credentials.json";
const expectedRoles = new Set(["pm", "operations", "pmo", "ceo"]);

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.label || path}:${response.status}:${payload.error || payload.detail || "REQUEST_FAILED"}`);
  return { response, payload };
}

function sessionCookie(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const cookie = values.map(value => value.split(";", 1)[0]).find(value => value.includes("="));
  assert(cookie, "LOGIN_SESSION_COOKIE_MISSING");
  return cookie;
}

function query(role) {
  return new URLSearchParams({
    role,
    business_role: role,
    org_id: organizationId,
    subject_scope: "organization",
    subject_id: organizationId,
    data_class: "test",
  }).toString();
}

const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
assert(Array.isArray(credentials.accounts) && credentials.accounts.length === 4, "FOUR_LOCAL_ACCEPTANCE_ACCOUNTS_REQUIRED");
assert(new Set(credentials.accounts.map(account => account.role)).size === 4, "ACCEPTANCE_ROLES_MUST_BE_DISTINCT");

const results = [];
for (const account of credentials.accounts) {
  assert(expectedRoles.has(account.role), `UNEXPECTED_ROLE:${account.role}`);
  const login = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: account.email, password: account.password }),
    label: `login:${account.role}`,
  });
  const cookie = sessionCookie(login.response);
  const headers = { Cookie: cookie };
  const scopedQuery = query(account.role);
  const context = (await request(`/api/context/current?${scopedQuery}`, { headers, label: `context:${account.role}` })).payload;
  const workbench = (await request(`/api/role-workbench?${scopedQuery}`, { headers, label: `workbench:${account.role}` })).payload;
  const directory = (await request(`/api/business-directory?${scopedQuery}`, { headers, label: `directory:${account.role}` })).payload;
  const inbox = (await request(`/api/collaboration-inbox?${scopedQuery}`, { headers, label: `inbox:${account.role}` })).payload;
  const projectIds = (context.available_projects || []).map(project => project.id);
  assert(context.user?.id === login.payload.user?.id, `SESSION_USER_MISMATCH:${account.role}`);
  assert(context.active_context?.businessRole === account.role, `CONTEXT_ROLE_MISMATCH:${account.role}`);
  assert(context.active_context?.orgId === organizationId, `CONTEXT_ORG_MISMATCH:${account.role}`);
  assert(projectIds.length === 5 && new Set(projectIds).size === 5, `PROJECT_SCOPE_NOT_FIVE:${account.role}`);
  assert((context.available_projects || []).every(project => project.dataClass === "test"), `NON_TEST_PROJECT_VISIBLE:${account.role}`);
  assert(workbench.workbench?.role === account.role, `WORKBENCH_ROLE_MISMATCH:${account.role}`);
  assert(workbench.data_class === "test", `WORKBENCH_DATA_CLASS_MISMATCH:${account.role}`);
  assert((directory.directory?.projects || []).length === 5, `DIRECTORY_PROJECT_SCOPE_NOT_FIVE:${account.role}`);
  assert(inbox.data_class === "test", `INBOX_DATA_CLASS_MISMATCH:${account.role}`);
  results.push({
    role: account.role,
    userId: context.user.id,
    projectCount: projectIds.length,
    workbenchRole: workbench.workbench.role,
    directoryProjectCount: directory.directory.projects.length,
    inboxCount: Array.isArray(inbox.items) ? inbox.items.length : 0,
    requestIds: [context.request_id, workbench.request_id, directory.request_id, inbox.request_id].filter(Boolean),
  });
}

assert(new Set(results.map(item => item.userId)).size === 4, "ONLINE_USERS_NOT_DISTINCT");
assert(new Set(results.map(item => item.workbenchRole)).size === 4, "ONLINE_WORKBENCH_ROLES_NOT_DISTINCT");

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim()
  || execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const evidence = JSON.stringify({
  type: "online_automated_role_isolation",
  origin,
  verified_at: new Date().toISOString(),
  result: "passed",
  roles: results.map(({ role, projectCount, workbenchRole, directoryProjectCount, inboxCount, requestIds }) => ({ role, projectCount, workbenchRole, directoryProjectCount, inboxCount, requestIds })),
  limitation: "automated accounts verify authentication and isolation; this is not a real-person pilot sign-off",
});
const participantCases = results.map(item => `when ${literal(item.userId)}::uuid then ${literal(JSON.stringify({ automated: true, origin, role: item.role, project_count: item.projectCount, data_class: "test", result: "passed" }))}::jsonb`).join(" ");
const sql = `begin;
update public.role_acceptance_participants
set verified_at=now(), isolation_result=case user_id ${participantCases} else isolation_result end
where run_id=${literal(runId)}::uuid and user_id in (${results.map(item => `${literal(item.userId)}::uuid`).join(",")});
update public.role_acceptance_runs
set status='passed', completed_at=now(), evidence=coalesce(evidence,'[]'::jsonb)||jsonb_build_array(${literal(evidence)}::jsonb)
where id=${literal(runId)}::uuid;
commit;
select public.validate_v640_role_acceptance_run(${literal(runId)}::uuid) as validation;`;
const management = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const managementPayload = await management.json().catch(() => ({}));
if (!management.ok) throw new Error(`ACCEPTANCE_EVIDENCE_WRITE_FAILED:${management.status}:${managementPayload.message || managementPayload.error || "unknown"}`);
const validation = managementPayload.at(-1)?.validation;
assert(validation?.passed === true && validation?.distinct_users === 4 && validation?.distinct_roles === 4, "PERSISTED_ACCEPTANCE_VALIDATION_FAILED");

console.log(JSON.stringify({
  status: "passed",
  origin,
  accountCount: results.length,
  distinctUsers: new Set(results.map(item => item.userId)).size,
  roles: results.map(item => item.role),
  projectCountPerRole: results.map(item => item.projectCount),
  validation,
  limitation: "automated account acceptance is complete; real-person pilot sign-off remains a V6.6 gate",
}));
