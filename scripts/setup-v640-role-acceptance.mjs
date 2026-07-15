import { pbkdf2Sync, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) config({ path: ".tmp/v640-vercel.env", quiet: true, override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = url && serviceRoleKey ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const credentialPath = ".tmp/v640-role-acceptance-credentials.json";
const orgCode = "AI_PMO_V640_ACCEPTANCE";
const runName = "V6.4四角色隔离验收";
const roleSpecs = [
  { role: "pm", name: "V6.4验收-项目经理", email: "ai-pmo-v640-pm@example.com", phone: "19900006401" },
  { role: "operations", name: "V6.4验收-运营", email: "ai-pmo-v640-operations@example.com", phone: "19900006402" },
  { role: "pmo", name: "V6.4验收-PMO", email: "ai-pmo-v640-pmo@example.com", phone: "19900006403" },
  { role: "ceo", name: "V6.4验收-CEO", email: "ai-pmo-v640-ceo@example.com", phone: "19900006404" },
];
const projectSpecs = Array.from({ length: 5 }, (_, index) => ({
  code: `V640-PILOT-${String(index + 1).padStart(2, "0")}`,
  name: `V6.4四角色闭环试点项目${index + 1}`,
  level: index === 0 ? "S" : index < 3 ? "A" : "B",
  progress: 10 + index * 12,
}));

function hashPassword(password) {
  const iterations = 120_000;
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${iterations}$${salt}$${hash}`;
}

async function loadCredentials() {
  try {
    const existing = JSON.parse(await readFile(credentialPath, "utf8"));
    if (Array.isArray(existing.accounts) && existing.accounts.length === 4) return existing;
  } catch {}
  const credentials = {
    generatedAt: new Date().toISOString(),
    purpose: "V6.4 role separation acceptance only",
    accounts: roleSpecs.map(spec => ({ ...spec, password: `T6${randomBytes(8).toString("hex")}` })),
  };
  await mkdir(".tmp", { recursive: true });
  await writeFile(credentialPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
  await chmod(credentialPath, 0o600);
  return credentials;
}

async function one(table, query, message) {
  const result = await query;
  if (result.error) throw new Error(`${message}:${result.error.message}`);
  return result.data;
}

const credentials = await loadCredentials();
if (!supabase) {
  const ids = {
    org: "64000000-0000-4000-8000-000000000001",
    users: roleSpecs.map((_, index) => `64000000-0000-4000-8000-${String(101 + index).padStart(12, "0")}`),
    projects: projectSpecs.map((_, index) => `64000000-0000-4000-8000-${String(201 + index).padStart(12, "0")}`),
    assignments: roleSpecs.map((_, index) => `64000000-0000-4000-8000-${String(301 + index).padStart(12, "0")}`),
    run: "64000000-0000-4000-8000-000000000401",
    participants: roleSpecs.map((_, index) => `64000000-0000-4000-8000-${String(501 + index).padStart(12, "0")}`),
  };
  const literal = value => `'${String(value).replaceAll("'", "''")}'`;
  const userRows = credentials.accounts.map((account, index) => `(${literal(ids.users[index])}::uuid,${literal(account.email)},${literal(account.phone)},${literal(account.name)},${literal(hashPassword(account.password))},'user','active')`).join(",\n");
  const projectRows = projectSpecs.map((spec, index) => `(${literal(ids.projects[index])}::uuid,${literal(ids.org)}::uuid,'test',${literal(spec.name)},${literal(spec.code)},'active',${spec.progress},${literal(spec.level)},${spec.level === "S"},'v640_acceptance',${literal(spec.code)})`).join(",\n");
  const mappingRows = projectSpecs.map((spec, index) => `(gen_random_uuid(),${literal(ids.org)}::uuid,${literal(ids.projects[index])}::uuid,'v640_acceptance',${literal(orgCode)},${literal(spec.code)},${literal(spec.code)},${literal(spec.name)},'test','active',(select id from public.app_users where role='admin' and status='active' order by created_at limit 1),now())`).join(",\n");
  const assignmentRows = roleSpecs.map((spec, index) => `(${literal(ids.assignments[index])}::uuid,${literal(ids.users[index])}::uuid,${literal(spec.role)},${literal(ids.org)}::uuid,'organization',${literal(ids.org)},'active',(select id from public.app_users where role='admin' and status='active' order by created_at limit 1),${literal(runName)})`).join(",\n");
  const byRoleIndex = new Map(roleSpecs.map((spec, index) => [spec.role, index]));
  const relationships = [["pm", "pmo", "reports_to"], ["operations", "pmo", "reports_to"], ["pmo", "ceo", "reports_to"], ["pm", "pmo", "escalates_to"], ["operations", "pmo", "escalates_to"], ["pmo", "ceo", "escalates_to"]];
  const relationshipRows = relationships.map(([fromRole, toRole, type], index) => `(${literal(`64000000-0000-4000-8000-${String(601 + index).padStart(12, "0")}`)}::uuid,${literal(ids.org)}::uuid,'organization',${literal(ids.org)},${literal(ids.users[byRoleIndex.get(fromRole)])}::uuid,${literal(fromRole)},${literal(ids.users[byRoleIndex.get(toRole)])}::uuid,${literal(toRole)},${literal(type)},'active')`).join(",\n");
  const participantRows = roleSpecs.map((spec, index) => `(${literal(ids.participants[index])}::uuid,${literal(ids.run)}::uuid,${literal(ids.users[index])}::uuid,${literal(spec.role)},${literal(ids.assignments[index])}::uuid,${literal(JSON.stringify({ org_id: ids.org, data_class: "test", expected_project_count: 5, status: "pending_browser_verification" }))}::jsonb)`).join(",\n");
  const sql = `begin;
insert into public.organizations(id,org_code,name,status) values(${literal(ids.org)}::uuid,${literal(orgCode)},'AI-PMO V6.4 隔离验收组织','active') on conflict(id) do update set name=excluded.name,status='active',updated_at=now();
insert into public.app_users(id,email,phone,name,password_hash,role,status) values ${userRows} on conflict(id) do update set email=excluded.email,phone=excluded.phone,name=excluded.name,password_hash=excluded.password_hash,status='active',updated_at=now();
insert into public.projects(id,org_id,data_class,name,oa_no,status,progress,project_level,is_key_project,source_system,source_record_id) values ${projectRows} on conflict(id) do update set name=excluded.name,oa_no=excluded.oa_no,status='active',progress=excluded.progress,project_level=excluded.project_level,is_key_project=excluded.is_key_project,updated_at=now();
insert into public.project_identity_mappings(id,org_id,project_id,source_type,source_container_id,source_record_id,external_project_code,historical_project_name,data_class,mapping_status,verified_by,verified_at) values ${mappingRows} on conflict(org_id,source_type,source_container_id,source_record_id) do update set project_id=excluded.project_id,external_project_code=excluded.external_project_code,historical_project_name=excluded.historical_project_name,mapping_status='active',verified_by=excluded.verified_by,verified_at=now(),updated_at=now();
insert into public.user_business_roles(id,user_id,business_role,org_id,subject_scope,subject_id,status,assigned_by,assignment_reason) values ${assignmentRows} on conflict(id) do update set status='active',assigned_by=excluded.assigned_by,assignment_reason=excluded.assignment_reason,updated_at=now();
insert into public.business_reporting_relationships(id,org_id,subject_scope,subject_id,from_user_id,from_business_role,to_user_id,to_business_role,relationship_type,status) values ${relationshipRows} on conflict(id) do update set status='active';
insert into public.role_acceptance_runs(id,org_id,data_class,name,status,evidence,created_by) values(${literal(ids.run)}::uuid,${literal(ids.org)}::uuid,'test',${literal(runName)},'ready','[{"type":"setup","detail":"4 distinct accounts, 4 roles, isolated test organization and 5 test projects"}]'::jsonb,(select id from public.app_users where role='admin' and status='active' order by created_at limit 1)) on conflict(id) do update set status=case when public.role_acceptance_runs.status in ('passed','running') then public.role_acceptance_runs.status else 'ready' end,updated_at=now();
insert into public.role_acceptance_participants(id,run_id,user_id,business_role,assignment_id,isolation_result) values ${participantRows} on conflict(id) do update set assignment_id=excluded.assignment_id,isolation_result=excluded.isolation_result;
commit;`;
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim() || execFileSync("security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8" }).trim();
  const execute = async query => {
    const response = await fetch("https://api.supabase.com/v1/projects/nxhvzfsuzelnxbrrglxk/database/query", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SUPABASE_MANAGEMENT_QUERY_FAILED:${response.status}:${payload.message || payload.error || "unknown"}`);
    return payload;
  };
  await execute(sql);
  const validationRows = await execute(`select public.validate_v640_role_acceptance_run(${literal(ids.run)}::uuid) as validation`);
  console.log(JSON.stringify({ status: "ready", organizationId: ids.org, projectCount: 5, accountCount: 4, acceptanceRunId: ids.run, validation: validationRows?.[0]?.validation, credentialsFile: credentialPath, connectionMode: "supabase_management_api" }));
  process.exit(0);
}
const admin = await one("app_users", supabase.from("app_users").select("id").eq("role", "admin").eq("status", "active").order("created_at").limit(1).maybeSingle(), "ADMIN_LOOKUP_FAILED");
if (!admin?.id) throw new Error("ACTIVE_ADMIN_REQUIRED");

const org = await one("organizations", supabase.from("organizations").upsert({ org_code: orgCode, name: "AI-PMO V6.4 隔离验收组织", status: "active" }, { onConflict: "org_code" }).select("id").single(), "ORG_UPSERT_FAILED");

const users = [];
for (const account of credentials.accounts) {
  const user = await one("app_users", supabase.from("app_users").upsert({ email: account.email, phone: account.phone, name: account.name, password_hash: hashPassword(account.password), role: "user", status: "active", updated_at: new Date().toISOString() }, { onConflict: "email" }).select("id,email,phone,name").single(), `USER_UPSERT_FAILED:${account.role}`);
  users.push({ ...user, role: account.role });
}

const projects = [];
for (const spec of projectSpecs) {
  const existing = await one("projects", supabase.from("projects").select("id").eq("org_id", org.id).eq("data_class", "test").eq("oa_no", spec.code).maybeSingle(), `PROJECT_LOOKUP_FAILED:${spec.code}`);
  const payload = { org_id: org.id, data_class: "test", name: spec.name, oa_no: spec.code, status: "active", progress: spec.progress, project_level: spec.level, is_key_project: spec.level === "S", source_system: "v640_acceptance", source_record_id: spec.code, updated_at: new Date().toISOString() };
  const project = existing?.id
    ? await one("projects", supabase.from("projects").update(payload).eq("id", existing.id).select("id,name,oa_no").single(), `PROJECT_UPDATE_FAILED:${spec.code}`)
    : await one("projects", supabase.from("projects").insert(payload).select("id,name,oa_no").single(), `PROJECT_INSERT_FAILED:${spec.code}`);
  projects.push(project);
  await one("project_identity_mappings", supabase.from("project_identity_mappings").upsert({ org_id: org.id, project_id: project.id, source_type: "v640_acceptance", source_container_id: orgCode, source_record_id: spec.code, external_project_code: spec.code, historical_project_name: spec.name, data_class: "test", mapping_status: "active", verified_by: admin.id, verified_at: new Date().toISOString() }, { onConflict: "org_id,source_type,source_container_id,source_record_id" }), `PROJECT_MAPPING_FAILED:${spec.code}`);
}

const assignments = [];
for (const user of users) {
  const current = await one("user_business_roles", supabase.from("user_business_roles").select("id").eq("user_id", user.id).eq("business_role", user.role).eq("org_id", org.id).eq("subject_scope", "organization").eq("subject_id", org.id).eq("status", "active").maybeSingle(), `ASSIGNMENT_LOOKUP_FAILED:${user.role}`);
  const assignment = current?.id
    ? await one("user_business_roles", supabase.from("user_business_roles").update({ assigned_by: admin.id, assignment_reason: runName, updated_at: new Date().toISOString() }).eq("id", current.id).select("id").single(), `ASSIGNMENT_UPDATE_FAILED:${user.role}`)
    : await one("user_business_roles", supabase.from("user_business_roles").insert({ user_id: user.id, business_role: user.role, org_id: org.id, subject_scope: "organization", subject_id: org.id, status: "active", assigned_by: admin.id, assignment_reason: runName }).select("id").single(), `ASSIGNMENT_INSERT_FAILED:${user.role}`);
  assignments.push({ ...assignment, userId: user.id, role: user.role });
}

const byRole = new Map(users.map(user => [user.role, user]));
const relationships = [
  ["pm", "pmo", "reports_to"], ["operations", "pmo", "reports_to"], ["pmo", "ceo", "reports_to"],
  ["pm", "pmo", "escalates_to"], ["operations", "pmo", "escalates_to"], ["pmo", "ceo", "escalates_to"],
];
for (const [fromRole, toRole, relationshipType] of relationships) {
  await one("business_reporting_relationships", supabase.from("business_reporting_relationships").upsert({ org_id: org.id, subject_scope: "organization", subject_id: org.id, from_user_id: byRole.get(fromRole).id, from_business_role: fromRole, to_user_id: byRole.get(toRole).id, to_business_role: toRole, relationship_type: relationshipType, status: "active" }, { onConflict: "org_id,subject_scope,subject_id,from_user_id,from_business_role,to_user_id,to_business_role,relationship_type" }), `REPORTING_RELATIONSHIP_FAILED:${fromRole}:${toRole}:${relationshipType}`);
}

let run = await one("role_acceptance_runs", supabase.from("role_acceptance_runs").select("id,status").eq("org_id", org.id).eq("data_class", "test").eq("name", runName).in("status", ["draft", "ready", "running"]).order("created_at", { ascending: false }).limit(1).maybeSingle(), "ACCEPTANCE_RUN_LOOKUP_FAILED");
if (!run) run = await one("role_acceptance_runs", supabase.from("role_acceptance_runs").insert({ org_id: org.id, data_class: "test", name: runName, status: "ready", evidence: [{ type: "setup", detail: "4 distinct accounts, 4 roles, isolated test organization and 5 test projects", created_at: new Date().toISOString() }], created_by: admin.id }).select("id,status").single(), "ACCEPTANCE_RUN_INSERT_FAILED");
for (const assignment of assignments) {
  await one("role_acceptance_participants", supabase.from("role_acceptance_participants").upsert({ run_id: run.id, user_id: assignment.userId, business_role: assignment.role, assignment_id: assignment.id, isolation_result: { org_id: org.id, data_class: "test", expected_project_count: 5, status: "pending_browser_verification" }, verified_at: null }, { onConflict: "run_id,user_id" }), `ACCEPTANCE_PARTICIPANT_FAILED:${assignment.role}`);
}

const validation = await one("validate_v640_role_acceptance_run", supabase.rpc("validate_v640_role_acceptance_run", { p_run_id: run.id }), "ACCEPTANCE_VALIDATION_FAILED");
console.log(JSON.stringify({ status: "ready", organizationId: org.id, projectCount: projects.length, accountCount: users.length, acceptanceRunId: run.id, validation, credentialsFile: credentialPath }));
