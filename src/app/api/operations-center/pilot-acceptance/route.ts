import { getAuthSupabase, getCurrentUser } from "@/features/auth/server";
import { CONTROLLED_PILOT_MODULES } from "@/features/pilot-acceptance/domain";
import { resolveBusinessContext, type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

const ROLES = new Set<BusinessRole>(["pm", "operations", "pmo", "ceo"]);
const SCOPES = new Set<SubjectScope>(["project", "portfolio", "organization"]);
const DATA_CLASSES = new Set(["production", "test"]);

function text(value: unknown): string { return String(value ?? "").trim(); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function hasSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => /secret|token|password|api.?key|credential/i.test(key) || hasSecret(nested));
}
function json(body: unknown, status: number, requestId: string) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

async function authorize(request: Request) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "UNAUTHORIZED", status: 401 };
  const url = new URL(request.url);
  const role = text(url.searchParams.get("role")) as BusinessRole;
  const orgId = text(url.searchParams.get("org_id"));
  const subjectScope = text(url.searchParams.get("subject_scope")) as SubjectScope;
  const subjectId = text(url.searchParams.get("subject_id"));
  const dataClass = text(url.searchParams.get("data_class") || "production");
  if (!ROLES.has(role) || !orgId || !SCOPES.has(subjectScope) || !subjectId || !DATA_CLASSES.has(dataClass)) return { ok: false as const, error: "PILOT_BUSINESS_CONTEXT_REQUIRED", status: 400 };
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return { ok: false as const, error: "ROLE_STORAGE_UNAVAILABLE", detail: assignments.warning, status: 503 };
  const context = resolveBusinessContext({ user: { id: user.id, systemRole: user.role }, assignments: assignments.data ?? [], requestedRole: role, requestedOrgId: orgId, requestedSubjectScope: subjectScope, requestedSubjectId: subjectId });
  if (!context) return { ok: false as const, error: "BUSINESS_CONTEXT_FORBIDDEN", status: 403 };
  const mappings = await loadContextProjectIdentityMappings({ context, dataClass: dataClass as "production" | "test" });
  if (mappings.status !== "succeeded") return { ok: false as const, error: "PROJECT_SCOPE_UNAVAILABLE", detail: mappings.warning, status: mappings.status === "not_configured" ? 503 : 500 };
  return { ok: true as const, user, role, orgId, subjectScope, subjectId, dataClass, context, projectIds: [...new Set((mappings.data ?? []).map(item => item.projectId))] };
}

type Access = Extract<Awaited<ReturnType<typeof authorize>>, { ok: true }>;

async function loadBundle(access: Access, runId: string) {
  const supabase = getAuthSupabase();
  const run = await supabase.from("controlled_pilot_runs").select("*").eq("id", runId).eq("org_id", access.orgId).eq("data_class", access.dataClass).maybeSingle();
  if (run.error) throw run.error;
  if (!run.data) return null;
  const [projects, participants, modules, chains, feishu, events, evaluation] = await Promise.all([
    supabase.from("controlled_pilot_projects").select("*").eq("run_id", runId).order("created_at"),
    supabase.from("controlled_pilot_participants").select("*").eq("run_id", runId).order("business_role"),
    supabase.from("controlled_pilot_module_checks").select("*").eq("run_id", runId).order("module_key"),
    supabase.from("controlled_pilot_golden_chains").select("*").eq("run_id", runId).order("chain_key"),
    supabase.from("controlled_pilot_feishu_evidence").select("*").eq("run_id", runId).order("linked_at"),
    supabase.from("controlled_pilot_events").select("id,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id,payload,occurred_at").eq("run_id", runId).order("occurred_at", { ascending: false }).limit(300),
    supabase.rpc("evaluate_v660_controlled_pilot", { p_run_id: runId }),
  ]);
  const failed = [projects, participants, modules, chains, feishu, events, evaluation].find(result => result.error);
  if (failed?.error) throw failed.error;
  const projectIds = (projects.data ?? []).map(item => String(item.project_id));
  const participantUserIds = (participants.data ?? []).map(item => String(item.user_id));
  const [projectNames, userNames] = await Promise.all([
    projectIds.length ? supabase.from("projects").select("id,name,oa_no,data_class,status").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
    participantUserIds.length ? supabase.from("app_users").select("id,name,status").in("id", participantUserIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (projectNames.error || userNames.error) throw projectNames.error || userNames.error;
  const projectById = new Map((projectNames.data ?? []).map(item => [String(item.id), item]));
  const userById = new Map((userNames.data ?? []).map(item => [String(item.id), item]));
  return {
    run: run.data,
    projects: (projects.data ?? []).map(item => ({ ...item, project: projectById.get(String(item.project_id)) ?? null })),
    participants: (participants.data ?? []).map(item => ({ ...item, user: userById.get(String(item.user_id)) ?? null })),
    module_checks: modules.data ?? [], golden_chains: chains.data ?? [], feishu_evidence: feishu.data ?? [], events: events.data ?? [], evaluation: evaluation.data,
  };
}

async function loadDataset(access: Access, requestedRunId = "") {
  const supabase = getAuthSupabase();
  const [runs, allProjects, assignments, goldenRuns, confirmations] = await Promise.all([
    supabase.from("controlled_pilot_runs").select("*").eq("org_id", access.orgId).eq("data_class", access.dataClass).order("updated_at", { ascending: false }).limit(100),
    access.projectIds.length ? supabase.from("projects").select("id,name,oa_no,data_class,status").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("id", access.projectIds).order("name") : Promise.resolve({ data: [], error: null }),
    supabase.from("user_business_roles").select("id,user_id,business_role,subject_scope,subject_id,status,valid_from,valid_until").eq("org_id", access.orgId).eq("status", "active").in("business_role", ["pm", "operations", "pmo", "ceo"]),
    access.projectIds.length ? supabase.from("golden_chain_runs").select("id,project_id,chain_key,status,data_class,updated_at").eq("org_id", access.orgId).eq("data_class", access.dataClass).in("project_id", access.projectIds).in("chain_key", ["A", "E"]).in("status", ["verification", "passed"]).order("updated_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    supabase.from("feishu_action_confirmations").select("id,project_id,action_type,status,target_summary,writeback_attempt_count,executed_at,updated_at").eq("org_id", access.orgId).eq("data_class", access.dataClass).eq("status", "succeeded").in("action_type", ["message", "task", "base_record_update"]).order("updated_at", { ascending: false }).limit(200),
  ]);
  const failed = [runs, allProjects, assignments, goldenRuns, confirmations].find(result => result.error);
  if (failed?.error) throw failed.error;
  const assignmentRows = (assignments.data ?? []).filter(item => {
    const now = Date.now(); const starts = Date.parse(String(item.valid_from)); const ends = item.valid_until ? Date.parse(String(item.valid_until)) : null;
    const subjectAllowed = item.subject_scope === "organization" || (item.subject_scope === "project" && access.projectIds.includes(String(item.subject_id))) || (item.subject_scope === access.subjectScope && item.subject_id === access.subjectId);
    return subjectAllowed && Number.isFinite(starts) && starts <= now && (ends === null || (Number.isFinite(ends) && ends >= now));
  });
  const userIds = [...new Set(assignmentRows.map(item => String(item.user_id)))];
  const users = userIds.length ? await supabase.from("app_users").select("id,name,status").in("id", userIds).eq("status", "active") : { data: [], error: null };
  if (users.error) throw users.error;
  const userById = new Map((users.data ?? []).map(item => [String(item.id), item]));
  const projectById = new Map((allProjects.data ?? []).map(item => [String(item.id), item]));
  const runProjects = await supabase.from("controlled_pilot_projects").select("run_id,project_id").in("run_id", (runs.data ?? []).map(item => item.id).length ? (runs.data ?? []).map(item => item.id) : ["00000000-0000-0000-0000-000000000000"]);
  const runParticipants = await supabase.from("controlled_pilot_participants").select("run_id,user_id").in("run_id", (runs.data ?? []).map(item => item.id).length ? (runs.data ?? []).map(item => item.id) : ["00000000-0000-0000-0000-000000000000"]);
  if (runProjects.error || runParticipants.error) throw runProjects.error || runParticipants.error;
  const visibleRuns = (runs.data ?? []).filter(run => {
    const projectIds = (runProjects.data ?? []).filter(item => item.run_id === run.id).map(item => String(item.project_id));
    const participant = (runParticipants.data ?? []).some(item => item.run_id === run.id && item.user_id === access.user.id);
    if (["pmo", "ceo"].includes(access.role)) return projectIds.length === 0 || projectIds.every(id => access.projectIds.includes(id));
    return participant && projectIds.some(id => access.projectIds.includes(id));
  });
  const runId = requestedRunId || text(visibleRuns[0]?.id);
  const selected = runId && visibleRuns.some(run => run.id === runId) ? await loadBundle(access, runId) : null;
  return {
    modules: CONTROLLED_PILOT_MODULES,
    runs: visibleRuns,
    selected,
    candidates: {
      projects: allProjects.data ?? [],
      participants: assignmentRows.map(item => ({ ...item, user_name: text(userById.get(String(item.user_id))?.name) || "未命名成员" })),
      golden_chains: (goldenRuns.data ?? []).map(item => ({ ...item, project_name: text(projectById.get(String(item.project_id))?.name) || "未命名项目" })),
      feishu_confirmations: (confirmations.data ?? []).filter(item => !item.project_id || access.projectIds.includes(String(item.project_id))),
    },
  };
}

function markdownReport(bundle: NonNullable<Awaited<ReturnType<typeof loadBundle>>>) {
  const evaluation = object(bundle.evaluation);
  const metrics = object(evaluation.metrics);
  const blockers = Array.isArray(evaluation.blockers) ? evaluation.blockers.map(object) : [];
  return [
    `# ${text(bundle.run.name)} · 受控试点验收报告`, "",
    `- 模式：${bundle.run.mode === "formal_pilot" ? "正式试点" : "技术演练"}`,
    `- 数据空间：${bundle.run.data_class}`,
    `- 状态：${bundle.run.status}`,
    `- 版本：${bundle.run.version}`,
    `- 生成时间：${new Date().toISOString()}`, "",
    "## 验收计数", "",
    `- 项目：${metrics.projects ?? 0}/5`, `- 不同用户：${metrics.distinct_users ?? 0}/4`, `- 本人签署：${metrics.self_signoffs ?? 0}/4`,
    `- 模块：${metrics.modules_passed ?? 0}/16`, `- 黄金链：${metrics.golden_chains ?? 0}/2`, `- 飞书写入类型：${metrics.feishu_types ?? 0}/3`, `- 失败恢复：${metrics.recovered_failures ?? 0}/1`, "",
    "## 当前结论", "",
    `- 技术就绪：${evaluation.technical_ready === true ? "是" : "否"}`,
    `- 正式通过：${evaluation.formal_passed === true ? "是" : "否"}`, "",
    "## 阻断项", "",
    ...(blockers.length ? blockers.map(item => `- ${text(item.code)}：${text(item.detail)}`) : ["- 无"]), "",
    "## 边界声明", "", "技术演练结果不得替代正式试点。正式通过只接受 production 数据、五个真实项目、四位真实人员本人签署、黄金链 A/E 正式通过和三类飞书真实回执。", "",
  ].join("\n");
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID(); const access = await authorize(request);
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  try {
    const url = new URL(request.url); const runId = text(url.searchParams.get("run_id"));
    if (url.searchParams.get("format") === "markdown") {
      if (!runId) return json({ error: "PILOT_RUN_ID_REQUIRED", request_id: requestId }, 400, requestId);
      const bundle = await loadBundle(access, runId);
      if (!bundle) return json({ error: "PILOT_RUN_NOT_FOUND", request_id: requestId }, 404, requestId);
      return new Response(markdownReport(bundle), { status: 200, headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="controlled-pilot-${runId}.md"`, "Cache-Control": "no-store", "X-Request-Id": requestId } });
    }
    const data = await loadDataset(access, runId);
    return json({ status: "succeeded", request_id: requestId, context: access.context, source: { type: "supabase", fallback_used: false }, data_class: access.dataClass, generated_at: new Date().toISOString(), warnings: [], data }, 200, requestId);
  } catch (error) {
    return json({ error: "PILOT_ACCEPTANCE_STORAGE_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", required_migration: "20260716040000_v660_controlled_pilot_acceptance.sql", request_id: requestId }, 503, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID(); const access = await authorize(request);
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId);
  if (hasSecret(body)) return json({ error: "SECRET_INPUT_FORBIDDEN", request_id: requestId }, 400, requestId);
  const operation = text(body.operation); const idempotencyKey = text(body.idempotency_key);
  if (!idempotencyKey) return json({ error: "IDEMPOTENCY_KEY_REQUIRED", request_id: requestId }, 400, requestId);
  const supabase = getAuthSupabase();
  try {
    let result;
    if (operation === "create") {
      if (access.role !== "pmo") return json({ error: "PILOT_CREATE_ROLE_FORBIDDEN", request_id: requestId }, 403, requestId);
      result = await supabase.rpc("create_v660_controlled_pilot_tx", {
        p_org_id: access.orgId, p_mode: text(body.mode), p_data_class: access.dataClass, p_name: text(body.name), p_objective: text(body.objective),
        p_actor_user_id: access.user.id, p_actor_business_role: access.role, p_idempotency_key: idempotencyKey, p_request_id: text(body.request_id) || requestId,
      });
    } else {
      const runId = text(body.run_id); const expectedVersion = Number(body.expected_version);
      if (!runId || !Number.isInteger(expectedVersion) || expectedVersion < 1) return json({ error: "RUN_AND_EXPECTED_VERSION_REQUIRED", request_id: requestId }, 400, requestId);
      const dataset = await loadDataset(access, runId);
      if (!dataset.selected) return json({ error: "PILOT_RUN_NOT_FOUND_IN_CONTEXT", request_id: requestId }, 404, requestId);
      const payload = object(body.payload);
      if (operation === "add_project" && !access.projectIds.includes(text(payload.project_id))) return json({ error: "PILOT_PROJECT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      if (operation === "bind_participant" && !dataset.candidates.participants.some(item => item.id === text(payload.assignment_id))) return json({ error: "PILOT_PARTICIPANT_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      if (operation === "record_module_check" && !CONTROLLED_PILOT_MODULES.some(item => item.key === text(payload.module_key))) return json({ error: "PILOT_MODULE_INVALID", request_id: requestId }, 400, requestId);
      if (operation === "link_golden_chain" && !dataset.candidates.golden_chains.some(item => item.id === text(payload.golden_chain_run_id))) return json({ error: "PILOT_GOLDEN_CHAIN_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      if (operation === "link_feishu_confirmation" && !dataset.candidates.feishu_confirmations.some(item => item.id === text(payload.confirmation_id))) return json({ error: "PILOT_FEISHU_CONFIRMATION_OUTSIDE_CONTEXT", request_id: requestId }, 403, requestId);
      if (operation === "self_signoff") { payload.confirm = body.confirm === true; payload.statement = text(body.statement); }
      if (operation === "transition") payload.action = text(body.action);
      if (operation === "transition" && payload.action === "pass" && !dataset.selected.participants.some(item => item.user_id === access.user.id && item.business_role === "ceo" && item.self_signed_at)) return json({ error: "PILOT_SIGNED_CEO_REQUIRED", request_id: requestId }, 403, requestId);
      result = await supabase.rpc("mutate_v660_controlled_pilot_tx", {
        p_run_id: runId, p_org_id: access.orgId, p_data_class: access.dataClass, p_operation: operation, p_payload: payload,
        p_actor_user_id: access.user.id, p_actor_business_role: access.role, p_expected_version: expectedVersion,
        p_idempotency_key: idempotencyKey, p_request_id: text(body.request_id) || requestId,
      });
    }
    if (result.error) throw result.error;
    const runId = text(object(object(result.data).run).id);
    const data = await loadDataset(access, runId);
    await writeOperationAudit({ user: access.user, action: `controlled_pilot_${operation}`, resourceType: "controlled_pilot_run", resourceId: runId, status: "succeeded", severity: "high", summary: `受控试点动作已保存：${operation}`, detail: { data_class: access.dataClass, role: access.role }, requestId });
    return json({ status: "succeeded", request_id: requestId, context: access.context, source: { type: "supabase", fallback_used: false }, data_class: access.dataClass, generated_at: new Date().toISOString(), warnings: [], data }, operation === "create" ? 201 : 200, requestId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown";
    const status = /VERSION_CONFLICT/.test(detail) ? 409 : /FORBIDDEN|PMO_REQUIRED|ACTOR_REQUIRED|OUTSIDE_SCOPE/.test(detail) ? 403 : /NOT_FOUND/.test(detail) ? 404 : /does not exist|schema cache/i.test(detail) ? 503 : 422;
    return json({ error: "PILOT_ACCEPTANCE_OPERATION_FAILED", detail, required_migration: status === 503 ? "20260716040000_v660_controlled_pilot_acceptance.sql" : undefined, request_id: requestId }, status, requestId);
  }
}
