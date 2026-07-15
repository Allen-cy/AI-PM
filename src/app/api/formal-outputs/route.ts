import { resolveFormalOutputAccess } from "@/features/formal-output/access";
import { canTransitionFormalOutput, parseFormalOutputWriteContract, type FormalOutputType } from "@/features/formal-output/contracts";
import { getFormalBusinessOutput, listFormalBusinessOutputs, saveFormalBusinessOutput, transitionFormalBusinessOutput } from "@/features/formal-output/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function resultStatus(status: string) {
  return status === "succeeded" ? 200 : status === "not_found" ? 404 : status === "conflict" ? 409 : status === "not_configured" ? 503 : 500;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const access = await resolveFormalOutputAccess(request);
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  const types = new URL(request.url).searchParams.getAll("output_type").filter(Boolean) as FormalOutputType[];
  const result = await listFormalBusinessOutputs({
    orgId: access.orgId, subjectScope: access.subjectScope, subjectId: access.subjectId, dataClass: access.dataClass,
    projectId: access.projectId, outputTypes: types.length ? types : undefined,
  });
  return json({ status: result.status, outputs: result.data ?? [], warning: result.warning, request_id: requestId, source: { type: "supabase", fallback_used: false } }, resultStatus(result.status), requestId);
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const action = String(body.action || "create");
  if (!['create','submit','approve','publish','archive'].includes(action)) return json({ error: "FORMAL_OUTPUT_ACTION_INVALID", request_id: requestId }, 400, requestId);

  if (action === "create") {
    const access = await resolveFormalOutputAccess(request, body);
    if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
    let contract;
    try { contract = parseFormalOutputWriteContract(body); }
    catch (error) { return json({ error: "FORMAL_OUTPUT_CONTRACT_INVALID", detail: error instanceof Error ? error.message : String(error), request_id: requestId }, 400, requestId); }
    if (contract.orgId !== access.orgId || contract.subjectScope !== access.subjectScope || contract.subjectId !== access.subjectId || contract.projectId !== access.projectId || contract.businessRole !== access.businessRole || contract.dataClass !== access.dataClass) return json({ error: "FORMAL_OUTPUT_SCOPE_MISMATCH", request_id: requestId }, 409, requestId);
    const result = await saveFormalBusinessOutput({
      ...contract,
      outputType: String(body.output_type || "") as FormalOutputType, outputKey: String(body.output_key || ""), title: String(body.title || ""),
      contentType: String(body.content_type || "text/markdown"), content: String(body.content || ""),
      structuredPayload: body.structured_payload && typeof body.structured_payload === "object" ? body.structured_payload as Record<string, unknown> : {},
      sourceDefinition: body.source_definition && typeof body.source_definition === "object" ? body.source_definition as Record<string, unknown> : {},
      sourceSnapshotAt: String(body.source_snapshot_at || ""), actor: access.user, actorBusinessRole: access.businessRole,
      reportingSnapshotId: body.reporting_snapshot_id ? String(body.reporting_snapshot_id) : null,
      meetingId: body.meeting_id ? String(body.meeting_id) : null, migrationBatchId: body.migration_batch_id ? String(body.migration_batch_id) : null,
      knowledgeItemId: body.knowledge_item_id ? String(body.knowledge_item_id) : null,
    });
    return json({ status: result.status, output: result.data, warning: result.warning, request_id: requestId }, result.status === "succeeded" ? 201 : resultStatus(result.status), requestId);
  }

  const current = await getFormalBusinessOutput(String(body.output_id || ""));
  if (current.status !== "succeeded" || !current.data) return json({ error: "FORMAL_OUTPUT_UNAVAILABLE", detail: current.warning, request_id: requestId }, resultStatus(current.status), requestId);
  const access = await resolveFormalOutputAccess(request, {
    org_id: current.data.orgId, subject_scope: current.data.subjectScope, subject_id: current.data.subjectId,
    project_id: current.data.projectId, data_class: current.data.dataClass, business_role: body.business_role ?? body.role,
  });
  if (!access.ok) return json({ error: access.error, detail: access.detail, request_id: requestId }, access.status, requestId);
  if (!canTransitionFormalOutput(access.businessRole, action)) return json({ error: "FORMAL_OUTPUT_ACTION_FORBIDDEN", request_id: requestId }, 403, requestId);
  const result = await transitionFormalBusinessOutput({
    output: current.data, operation: action as "submit" | "approve" | "publish" | "archive", reason: String(body.reason || ""),
    actor: access.user, actorBusinessRole: access.businessRole, expectedStateVersion: Number(body.expected_version), requestId,
  });
  return json({ status: result.status, output: result.data, warning: result.warning, request_id: requestId }, resultStatus(result.status), requestId);
}
