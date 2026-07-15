import { getAuthSupabase, requireAuthenticatedApiUser } from "@/features/auth/server";
import { FeishuBaseClient, type FeishuRecordItem } from "@/features/feishu/client";
import { getOrganizationFeishuConfig } from "@/features/feishu/user-config";
import { resolveBusinessAssistantAccess } from "@/features/operating-assistant/access";
import { buildPmOperationsJointChecks } from "@/features/operating-assistant/joint-checks";
import { loadAssistantProjectIdentities } from "@/features/operating-assistant/repository";
import { buildOperationsAssistantSnapshot, buildPmAssistantSnapshot } from "@/features/operating-assistant/snapshot";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";
function json(body: unknown, status: number, requestId: string) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } }); }

async function scopeFor(request: Request) {
  const user = await requireAuthenticatedApiUser(); if (!user) return { ok: false, error: "UNAUTHORIZED", status: 401 } as const;
  const access = await resolveBusinessAssistantAccess(request, user); if (access.status !== "succeeded") return { ok: false, error: "BUSINESS_ASSISTANT_ACCESS_FAILED", detail: access.warning, status: access.status === "invalid" ? 400 : access.status === "forbidden" ? 403 : access.status === "not_configured" ? 503 : 500 } as const;
  const identities = await loadAssistantProjectIdentities({ context: access.data.context, dataClass: access.data.dataClass }); if (identities.status !== "succeeded") return { ok: false, error: "PROJECT_IDENTITY_LOAD_FAILED", detail: identities.warning, status: identities.status === "not_configured" ? 503 : 500 } as const;
  return { ok: true, user, context: access.data.context, dataClass: access.data.dataClass, identities: identities.data ?? [] } as const;
}

async function records(client: FeishuBaseClient, table: "project" | "milestone" | "risk" | "contract" | "payment", required = false): Promise<{ rows: FeishuRecordItem[]; warning?: string }> {
  try { return { rows: await client.listRecords(table, 500) }; }
  catch { if (required) throw new Error("飞书项目台账不可用"); return { rows: [], warning: `${table}表不可用，本次联合检查会明确记录数据缺口。` }; }
}

async function runJointCheck(scope: Extract<Awaited<ReturnType<typeof scopeFor>>, { ok: true }>, requestId: string) {
  const effective = await getOrganizationFeishuConfig(scope.context.orgId); if (!effective.config?.tables.project) throw new Error(effective.setupHint || "飞书项目台账未配置");
  const client = new FeishuBaseClient(effective.config);
  const [projects, milestones, risks, contracts, payments] = await Promise.all([records(client, "project", true), records(client, "milestone"), records(client, "risk"), records(client, "contract"), records(client, "payment")]);
  const warnings = [milestones.warning, risks.warning, contracts.warning, payments.warning].filter((value): value is string => Boolean(value));
  const pm = buildPmAssistantSnapshot({ identities: scope.identities, projects: projects.rows, milestones: milestones.rows, risks: risks.rows, actions: [], sourceWarnings: warnings });
  const operations = buildOperationsAssistantSnapshot({ identities: scope.identities, projects: projects.rows, contracts: contracts.rows, payments: payments.rows, sourceWarnings: warnings });
  const snapshotAt = new Date().toISOString(); const check = buildPmOperationsJointChecks({ evaluatedAt: snapshotAt, pm: { projects: pm.projects, milestones: pm.milestones }, operations: { acceptances: operations.acceptances, invoices: operations.invoices, receivables: operations.receivables } });
  const supabase = getAuthSupabase();
  const run = await supabase.from("business_joint_check_runs").insert({ org_id: scope.context.orgId, subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, data_class: scope.dataClass, snapshot_at: snapshotAt, source_definition: { type: "feishu+supabase", project_table: effective.config.tables.project, fallback_used: false }, data_gaps: [...check.dataGaps, ...warnings], status: "completed", triggered_by: scope.user.id, triggered_business_role: scope.context.businessRole, request_id: requestId }).select("*").single();
  if (run.error) throw run.error;
  if (check.items.length > 0) {
    const inserted = await supabase.from("business_joint_check_items").insert(check.items.map(item => ({ run_id: run.data.id, org_id: scope.context.orgId, project_id: item.projectId, check_type: item.checkType, severity: item.severity, title: item.title, finding: item.finding, fact_references: item.factReferences, suggested_action: item.suggestedAction, owner_business_role: item.ownerBusinessRole, reviewer_business_role: item.reviewerBusinessRole, data_class: scope.dataClass }))).select("*");
    if (inserted.error) throw inserted.error; return { run: run.data, items: inserted.data ?? [], dataGaps: [...check.dataGaps, ...warnings] };
  }
  return { run: run.data, items: [], dataGaps: [...check.dataGaps, ...warnings] };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID(); const scope = await scopeFor(request); if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  const projectIds = [...new Set(scope.identities.map(item => item.projectId))]; const supabase = getAuthSupabase();
  const [runs, items, cadences, occurrences] = await Promise.all([
    supabase.from("business_joint_check_runs").select("*").eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("data_class", scope.dataClass).order("created_at", { ascending: false }).limit(50),
    projectIds.length ? supabase.from("business_joint_check_items").select("*").in("project_id", projectIds).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).order("updated_at", { ascending: false }).limit(200) : Promise.resolve({ data: [], error: null }),
    supabase.from("business_operating_cadences").select("*").eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("business_role", scope.context.businessRole).order("created_at", { ascending: false }),
    supabase.from("business_operating_occurrences").select("*").eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("business_role", scope.context.businessRole).eq("data_class", scope.dataClass).order("scheduled_at", { ascending: false }).limit(200),
  ]);
  const error = runs.error || items.error || cadences.error || occurrences.error; if (error) return json({ error: "OPERATIONS_LOOP_LOAD_FAILED", detail: error.message, request_id: requestId }, /does not exist|schema cache/i.test(error.message) ? 503 : 500, requestId);
  return json({ status: "succeeded", context: scope.context, data_class: scope.dataClass, project_ids: projectIds, runs: runs.data ?? [], joint_check_items: items.data ?? [], cadences: cadences.data ?? [], occurrences: occurrences.data ?? [], source: { type: "supabase+feishu", fallback_used: false }, request_id: requestId }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID(); const scope = await scopeFor(request); if (!scope.ok) return json({ error: scope.error, detail: "detail" in scope ? scope.detail : undefined, request_id: requestId }, scope.status, requestId);
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = String(body.operation || ""); const supabase = getAuthSupabase(); let resourceType = "business_operations_loop"; let resourceId = "";
  try {
    let result: unknown;
    if (operation === "run_joint_check") { const run = await runJointCheck(scope, requestId); result = run; resourceType = "business_joint_check_run"; resourceId = String(run.run.id); }
    else if (operation === "transition_joint_check") {
      const id = String(body.item_id || ""); const current = await supabase.from("business_joint_check_items").select("*").eq("id", id).eq("org_id", scope.context.orgId).eq("data_class", scope.dataClass).in("project_id", scope.identities.map(item => item.projectId)).maybeSingle(); if (current.error) throw current.error; if (!current.data) return json({ error: "JOINT_CHECK_NOT_FOUND", request_id: requestId }, 404, requestId);
      const transitioned = await supabase.rpc("transition_business_joint_check_tx", { p_item_id: id, p_expected_status: current.data.status, p_expected_version: current.data.version, p_action: String(body.action || ""), p_actor_user_id: scope.user.id, p_actor_business_role: scope.context.businessRole, p_owner_user_id: body.owner_user_id || null, p_reviewer_user_id: body.reviewer_user_id || null, p_due_at: body.due_at || null, p_comment: String(body.comment || "") || null, p_evidence: Array.isArray(body.evidence) ? body.evidence : [], p_request_id: requestId }); if (transitioned.error) throw transitioned.error; result = transitioned.data; resourceType = "business_joint_check_item"; resourceId = id;
    } else if (operation === "create_cadence") {
      const name = String(body.name || "").trim(); const cadenceType = String(body.cadence_type || ""); const ownerUserId = String(body.owner_user_id || ""); if (!name || !["daily","weekly","monthly","event"].includes(cadenceType) || !ownerUserId) return json({ error: "CADENCE_NAME_TYPE_AND_OWNER_REQUIRED", request_id: requestId }, 400, requestId);
      const cadence = await supabase.from("business_operating_cadences").insert({ org_id: scope.context.orgId, subject_scope: scope.context.subjectScope, subject_id: scope.context.subjectId, business_role: scope.context.businessRole, name, cadence_type: cadenceType, timezone: "Asia/Shanghai", day_of_week: body.day_of_week ?? null, day_of_month: body.day_of_month ?? null, event_key: body.event_key || null, due_after_minutes: Number(body.due_after_minutes || 480), required_inputs: Array.isArray(body.required_inputs) ? body.required_inputs : [], required_outputs: Array.isArray(body.required_outputs) ? body.required_outputs : [], owner_user_id: ownerUserId, status: "active", approved_by: scope.user.id, approved_at: new Date().toISOString(), created_by: scope.user.id }).select("*").single(); if (cadence.error) throw cadence.error; result = cadence.data; resourceType = "business_operating_cadence"; resourceId = cadence.data.id;
    } else if (operation === "materialize_calendar") {
      const materialized = await supabase.rpc("materialize_business_operating_calendar_tx", { p_org_id: scope.context.orgId, p_business_date: String(body.business_date || new Date().toISOString().slice(0,10)), p_data_class: scope.dataClass, p_event_key: body.event_key || null, p_event_source_id: String(body.event_source_id || "") }); if (materialized.error) throw materialized.error; result = materialized.data; resourceType = "business_operating_calendar"; resourceId = scope.context.subjectId;
    } else if (operation === "transition_occurrence") {
      const id = String(body.occurrence_id || ""); const current = await supabase.from("business_operating_occurrences").select("*").eq("id", id).eq("org_id", scope.context.orgId).eq("subject_scope", scope.context.subjectScope).eq("subject_id", scope.context.subjectId).eq("business_role", scope.context.businessRole).eq("data_class", scope.dataClass).maybeSingle(); if (current.error) throw current.error; if (!current.data) return json({ error: "OCCURRENCE_NOT_FOUND", request_id: requestId }, 404, requestId);
      const transitioned = await supabase.rpc("transition_business_operating_occurrence_tx", { p_occurrence_id: id, p_expected_status: current.data.status, p_action: String(body.action || ""), p_actor_user_id: scope.user.id, p_output_summary: String(body.output_summary || "") || null, p_evidence: Array.isArray(body.evidence) ? body.evidence : [], p_action_item_ids: Array.isArray(body.action_item_ids) ? body.action_item_ids : [] }); if (transitioned.error) throw transitioned.error; result = transitioned.data; resourceType = "business_operating_occurrence"; resourceId = id;
    } else return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);
    await writeOperationAudit({ user: scope.user, action: `business_operations_${operation}`, resourceType, resourceId, status: "succeeded", severity: "medium", summary: `PM/运营运行闭环：${operation}`, detail: { role: scope.context.businessRole, subject: scope.context.subjectId, dataClass: scope.dataClass }, requestId });
    return json({ status: "succeeded", result, source: { type: "supabase+feishu", fallback_used: false }, request_id: requestId }, 200, requestId);
  } catch (error) { const detail = error instanceof Error ? error.message : "unknown"; return json({ error: "OPERATIONS_LOOP_OPERATION_FAILED", detail, request_id: requestId }, /CONFLICT|TRANSITION/.test(detail) ? 409 : /REQUIRED|FORBIDDEN/.test(detail) ? 403 : /does not exist|schema cache/i.test(detail) ? 503 : 500, requestId); }
}
