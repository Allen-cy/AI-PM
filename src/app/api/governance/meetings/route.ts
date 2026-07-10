import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { resolveRequestedDecisionContext } from "@/features/decisions/access";
import { canPerformDecisionOperation } from "@/features/decisions/domain";
import { assignGovernanceMeetingDelegate, createGovernanceMeeting, getGovernanceMeeting, listGovernanceMeetings, recordGovernanceMeetingOutcome, reviewGovernanceMeetingOutput, transitionGovernanceMeetingState, type DecisionBriefRecord, type GovernanceMeetingInput } from "@/features/decisions/persistence";
import { type BusinessRole, type SubjectScope } from "@/features/operating-model/context";
import { listBusinessRoleAssignments } from "@/features/operating-model/persistence";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function statusCode(status: string) {
  return status === "succeeded" ? 200 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "not_configured" ? 503 : 500;
}

function requestedContext(record: Record<string, unknown>) {
  const orgId = String(record.org_id ?? "").trim();
  const subjectScope = String(record.subject_scope ?? "") as SubjectScope;
  const subjectId = String(record.subject_id ?? "").trim();
  const role = String(record.business_role ?? record.role ?? "") as BusinessRole;
  const dataClass = String(record.data_class ?? "production") as DecisionBriefRecord["dataClass"];
  if (!orgId || !subjectId || !["project", "portfolio", "organization"].includes(subjectScope) || !["production", "sample", "test", "diagnostic", "unclassified"].includes(dataClass)) return null;
  return { orgId, subjectScope, subjectId, role, dataClass };
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const requested = requestedContext(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!requested) return json({ error: "MEETING_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  if (!context || !canPerformDecisionOperation(requested.role, "view")) return json({ error: "MEETING_SCOPE_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await listGovernanceMeetings(requested);
  return json({ request_id: requestId, status: result.status, meetings: result.data ?? [], warning: result.warning, source: { type: "supabase", fallback_used: false } }, statusCode(result.status), requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const action = String(body.action || "schedule");
  if (!["schedule", "freeze_agenda", "start", "record", "cancel", "postpone", "reschedule", "delegate", "start_effect_review", "review_output", "close"].includes(action)) return json({ error: "MEETING_ACTION_INVALID", request_id: requestId }, 400, requestId);
  let requested = requestedContext(body);
  let meeting: Record<string, unknown> | null = null;
  if (action !== "schedule") {
    const meetingResult = await getGovernanceMeeting(String(body.meeting_id || ""));
    if (meetingResult.status !== "succeeded" || !meetingResult.data) return json({ error: "MEETING_UNAVAILABLE", detail: meetingResult.warning, request_id: requestId }, statusCode(meetingResult.status), requestId);
    meeting = meetingResult.data;
    requested = requestedContext({ org_id: meeting.org_id, subject_scope: meeting.subject_scope, subject_id: meeting.subject_id, business_role: body.business_role, data_class: meeting.data_class });
  }
  if (!requested) return json({ error: "MEETING_CONTEXT_REQUIRED", request_id: requestId }, 400, requestId);
  const assignments = await listBusinessRoleAssignments(user.id);
  if (assignments.status !== "succeeded") return json({ error: "P17_STORAGE_NOT_CONFIGURED", detail: assignments.warning, request_id: requestId }, 503, requestId);
  const context = await resolveRequestedDecisionContext({ user, assignments: assignments.data ?? [], ...requested });
  const operation = action === "schedule" ? "schedule_meeting" : action === "record" ? "record_meeting" : action === "freeze_agenda" ? "freeze_agenda" : action === "start" ? "start_meeting" : action === "cancel" ? "cancel_meeting" : action === "postpone" ? "postpone_meeting" : action === "reschedule" ? "reschedule_meeting" : action === "delegate" ? "assign_meeting_delegate" : action === "close" ? "close_meeting" : "record_meeting";
  if (!context || !canPerformDecisionOperation(requested.role, operation)) return json({ error: "MEETING_ACTION_FORBIDDEN", request_id: requestId }, 403, requestId);
  let result;
  if (action === "record") result = await recordGovernanceMeetingOutcome({ meeting: meeting ?? {}, minutes: String(body.minutes || ""), conclusions: Array.isArray(body.conclusions) ? body.conclusions.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [], actor: user, actorBusinessRole: requested.role, requestId });
  else if (action === "review_output") result = await reviewGovernanceMeetingOutput({ meeting: meeting ?? {}, reviewPlanId: String(body.review_plan_id || ""), result: String(body.result || ""), approved: body.approved !== false, actor: user, actorBusinessRole: requested.role, requestId });
  else if (action === "delegate") result = await assignGovernanceMeetingDelegate({ meeting: meeting ?? {}, absentUserId: String(body.absent_user_id || ""), absentBusinessRole: String(body.absent_business_role || "") as BusinessRole, proxyUserId: String(body.proxy_user_id || ""), proxyBusinessRole: String(body.proxy_business_role || "") as BusinessRole, reason: String(body.reason || ""), validFrom: String(body.valid_from || ""), validUntil: String(body.valid_until || ""), actor: user });
  else if (action !== "schedule") result = await transitionGovernanceMeetingState({ meeting: meeting ?? {}, operation: action, reason: String(body.reason || ""), rescheduledAt: body.rescheduled_at ? String(body.rescheduled_at) : null, impactedDecisionIds: Array.isArray(body.impacted_decision_ids) ? body.impacted_decision_ids.map(String) : [], actor: user, actorBusinessRole: requested.role, requestId });
  else result = await createGovernanceMeeting({ meeting: {
      ...requested,
      subjectScope: requested.subjectScope as GovernanceMeetingInput["subjectScope"],
      meetingType: String(body.meeting_type || "") as GovernanceMeetingInput["meetingType"], title: String(body.title || ""), scheduledAt: String(body.scheduled_at || ""),
      attendeeUserIds: Array.isArray(body.attendee_user_ids) ? body.attendee_user_ids.map(String).filter(Boolean) : [],
      agenda: Array.isArray(body.agenda) ? body.agenda.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [],
      reportingSnapshotIds: Array.isArray(body.reporting_snapshot_ids) ? body.reporting_snapshot_ids.map(String).filter(Boolean) : [],
      dataClass: requested.dataClass, timezone: String(body.timezone || "Asia/Shanghai"), workingCalendarKey: String(body.working_calendar_key || "CN-standard"),
    }, actor: user, actorBusinessRole: requested.role });
  return json({ request_id: requestId, action, status: result.status, meeting: result.data, warning: result.warning }, action === "schedule" && result.status === "succeeded" ? 201 : statusCode(result.status), requestId);
}
