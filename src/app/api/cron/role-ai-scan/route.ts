import { getAuthSupabase } from "@/features/auth/server";
import { resolveBusinessContext } from "@/features/operating-model/context";
import { listBusinessRoleAssignments, loadContextProjectIdentityMappings } from "@/features/operating-model/persistence";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(secret && token && secret === token);
}

function nextRunAt(schedule: string): string {
  const hours = schedule === "hourly" ? 1 : schedule === "weekly" ? 24 * 7 : 24;
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  if (!authorized(request)) return Response.json({ error: "UNAUTHORIZED", request_id: requestId }, { status: 401 });
  const supabase = getAuthSupabase();
  const due = await supabase.from("role_ai_scan_schedules").select("*")
    .eq("status", "active").lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(20);
  if (due.error) return Response.json({ error: "ROLE_AI_SCHEDULE_LOAD_FAILED", detail: due.error.message, request_id: requestId }, { status: 503 });
  const results: Array<Record<string, unknown>> = [];

  for (const schedule of due.data ?? []) {
    try {
      const userResult = await supabase.from("app_users").select("id,role,status").eq("id", schedule.actor_user_id).eq("status", "active").maybeSingle();
      if (userResult.error || !userResult.data) throw new Error("SCHEDULE_ACTOR_INACTIVE");
      const assignments = await listBusinessRoleAssignments(String(schedule.actor_user_id));
      if (assignments.status !== "succeeded") throw new Error(assignments.warning || "ROLE_ASSIGNMENTS_UNAVAILABLE");
      const context = resolveBusinessContext({
        user: { id: String(userResult.data.id), systemRole: userResult.data.role }, assignments: assignments.data ?? [],
        requestedRole: schedule.business_role, requestedOrgId: schedule.org_id,
        requestedSubjectScope: schedule.subject_scope, requestedSubjectId: schedule.subject_id,
      });
      if (!context) throw new Error("SCHEDULE_CONTEXT_FORBIDDEN");
      const mappings = await loadContextProjectIdentityMappings({ context, dataClass: schedule.data_class });
      if (mappings.status !== "succeeded") throw new Error(mappings.warning || "SCHEDULE_PROJECT_SCOPE_UNAVAILABLE");
      const projectIds = [...new Set((mappings.data ?? []).map(item => item.projectId))];
      const [signals, risks, actions] = projectIds.length === 0 ? [null, null, null] : await Promise.all([
        supabase.from("management_signals").select("id,project_id,title,summary,severity,status,due_at,updated_at").eq("org_id", schedule.org_id).eq("data_class", schedule.data_class).in("project_id", projectIds).in("status", ["open", "assigned", "in_progress", "escalated"]),
        supabase.from("risks").select("id,project_id,description,probability,impact,urgency,status,due_date,updated_at").in("project_id", projectIds).not("status", "in", "(closed,archived)"),
        supabase.from("unified_action_items").select("id,project_id,title,priority,status,due_date,owner_user_id,updated_at").eq("org_id", schedule.org_id).in("project_id", projectIds).not("status", "in", "(closed,cancelled)")
      ]);
      const sourceError = signals?.error || risks?.error || actions?.error;
      if (sourceError) throw new Error(sourceError.message);
      const facts = [
        ...((signals?.data ?? []).map(row => ({ evidence_id: `signal:${row.id}`, type: "management_signal", ...row }))),
        ...((risks?.data ?? []).map(row => ({ evidence_id: `risk:${row.id}`, type: "risk", ...row }))),
        ...((actions?.data ?? []).map(row => ({ evidence_id: `action:${row.id}`, type: "action", ...row }))),
      ];
      const allowed_evidence_ids = facts.map(item => item.evidence_id);
      const createdRun = await supabase.from("ai_assistant_runs").insert({
        org_id: schedule.org_id, actor_user_id: schedule.actor_user_id, business_role: schedule.business_role,
        subject_scope: schedule.subject_scope, subject_id: schedule.subject_id, data_class: schedule.data_class,
        scenario: schedule.scenario, prompt_version: "role-ai-scheduled-rule-scan-v1", knowledge_version: "dynamic-published-v1",
        input_snapshot: facts, allowed_evidence_ids, model_provider: "governed-rule-engine", model_name: "role-exception-scanner-v1",
        status: "succeeded", output: { fact_count: facts.length, generated_by: "scheduled_scan", confidence_policy: schedule.confidence_threshold }, completed_at: new Date().toISOString(),
      }).select("id").single();
      if (createdRun.error) throw new Error(createdRun.error.message);
      const candidates = facts.slice(0, 20).map((fact, index) => {
        const severity = String((fact as Record<string, unknown>).severity || (fact as Record<string, unknown>).priority || "medium");
        const confidence = severity === "critical" || severity === "P0" ? 0.92 : severity === "high" || severity === "P1" ? 0.82 : 0.7;
        return {
          run_id: createdRun.data.id, org_id: schedule.org_id, actor_user_id: schedule.actor_user_id, business_role: schedule.business_role,
          subject_scope: schedule.subject_scope, subject_id: schedule.subject_id, data_class: schedule.data_class,
          recommendation_type: schedule.business_role === "ceo" ? "decision_brief" : "action",
          title: `待人工确认：${String((fact as Record<string, unknown>).title || (fact as Record<string, unknown>).description || fact.type)}`,
          reason: `定时扫描发现仍未关闭的${fact.type}，需由${schedule.business_role}确认是否进入业务动作。`,
          proposed_payload: { project_id: fact.project_id, evidence_ids: [fact.evidence_id], confirmation_required: true },
          status: "pending_confirmation", confidence, evidence_refs: [fact.evidence_id],
          idempotency_key: `scheduled:${schedule.id}:${createdRun.data.id}:${index + 1}`,
        };
      }).filter(item => item.confidence >= Number(schedule.confidence_threshold));
      if (candidates.length) {
        const saved = await supabase.from("ai_recommendations").insert(candidates);
        if (saved.error) throw new Error(saved.error.message);
      }
      await supabase.from("role_ai_scan_schedules").update({
        last_run_at: new Date().toISOString(), last_run_id: createdRun.data.id, last_status: "succeeded",
        next_run_at: nextRunAt(String(schedule.schedule)), version: Number(schedule.version) + 1, updated_at: new Date().toISOString(),
      }).eq("id", schedule.id).eq("version", schedule.version);
      results.push({ schedule_id: schedule.id, status: "succeeded", run_id: createdRun.data.id, evidence_count: facts.length, recommendation_count: candidates.length });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 300) : "ROLE_AI_SCAN_FAILED";
      await supabase.from("role_ai_scan_schedules").update({ last_run_at: new Date().toISOString(), last_status: detail, next_run_at: nextRunAt(String(schedule.schedule)), updated_at: new Date().toISOString() }).eq("id", schedule.id);
      results.push({ schedule_id: schedule.id, status: "failed", detail });
    }
  }
  return Response.json({ status: "completed", request_id: requestId, processed: results.length, results }, { headers: { "Cache-Control": "no-store" } });
}
