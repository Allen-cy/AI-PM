import { getAuthSupabase, requireAdmin } from "@/features/auth/server";
import {
  buildProjectIdentityBackfillEntries,
  previewFeishuProjectIdentityBackfill,
} from "@/features/operating-model/project-identity-persistence";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

function text(value: unknown): string { return String(value ?? "").trim(); }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left],[right]) => left.localeCompare(right)).map(([key,nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

async function loadControlPlane() {
  const supabase = getAuthSupabase();
  const [runs, configs] = await Promise.all([
    supabase.from("project_identity_migration_runs").select("*").order("created_at", { ascending: false }).limit(30),
    supabase.from("project_identity_cutover_configs").select("*").order("updated_at", { ascending: false }).limit(30),
  ]);
  if (runs.error || configs.error) throw new Error(runs.error?.message || configs.error?.message);
  return { runs: runs.data ?? [], configs: configs.data ?? [] };
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const admin = await requireAdmin();
  if (!admin) return json({ error: "FORBIDDEN", request_id: requestId }, 403, requestId);
  try {
    const [preview, controlPlane] = await Promise.all([previewFeishuProjectIdentityBackfill(), loadControlPlane()]);
    return json({ status: "succeeded", preview, ...controlPlane, source: { type: "feishu+supabase", fallback_used: false }, request_id: requestId }, 200, requestId);
  } catch (error) {
    return json({ error: "P17_IDENTITY_CUTOVER_STORAGE_UNAVAILABLE", detail: error instanceof Error ? error.message : "unknown", required_migration: "20260710135000_p17_project_identity_cutover.sql", request_id: requestId }, 503, requestId);
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const admin = await requireAdmin();
  if (!admin) return json({ error: "FORBIDDEN", request_id: requestId }, 403, requestId);
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "INVALID_JSON", request_id: requestId }, 400, requestId); }
  const operation = text(body.operation);
  const supabase = getAuthSupabase();
  try {
    let runId = text(body.run_id);
    let result: unknown;
    if (operation === "create_preview") {
      if (body.confirmation !== "CREATE_IDENTITY_PREVIEW") return json({ error: "EXPLICIT_PREVIEW_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const idempotencyKey = text(body.idempotency_key);
      if (!idempotencyKey) return json({ error: "IDEMPOTENCY_KEY_REQUIRED", request_id: requestId }, 400, requestId);
      const previewResult = await previewFeishuProjectIdentityBackfill();
      if (previewResult.status !== "succeeded" || !previewResult.preview) return json({ error: "IDENTITY_PREVIEW_FAILED", detail: previewResult.warning, request_id: requestId }, previewResult.status === "not_configured" ? 503 : 500, requestId);
      const entries = buildProjectIdentityBackfillEntries(previewResult.preview);
      const snapshot = { summary: previewResult.preview.plan.summary, invalid_records: previewResult.preview.invalidRecords, entries, captured_at: new Date().toISOString() };
      const existing = await supabase.from("project_identity_migration_runs").select("id,preview_snapshot,status")
        .eq("org_id", previewResult.preview.orgId).eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const oldSnapshot = existing.data.preview_snapshot as Record<string, unknown>;
        if (canonical(oldSnapshot.entries ?? []) !== canonical(entries)) return json({ error: "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT", request_id: requestId }, 409, requestId);
        runId = existing.data.id; result = { id: runId, status: existing.data.status, reused: true };
      } else {
        const created = await supabase.from("project_identity_migration_runs").insert({
          org_id: previewResult.preview.orgId, source_type: "feishu", source_container_id: previewResult.preview.sourceContainerId,
          status: "previewed", idempotency_key: idempotencyKey, preview_snapshot: snapshot, created_by: admin.id,
        }).select("id,status").single();
        if (created.error) throw created.error; runId = created.data.id; result = created.data;
      }
    } else if (operation === "apply") {
      if (!runId || body.confirmation !== "APPLY_PROJECT_IDENTITY_BACKFILL") return json({ error: "EXPLICIT_APPLY_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const run = await supabase.from("project_identity_migration_runs").select("preview_snapshot").eq("id", runId).maybeSingle();
      if (run.error) throw run.error; if (!run.data) return json({ error: "IDENTITY_RUN_NOT_FOUND", request_id: requestId }, 404, requestId);
      const entries = (run.data.preview_snapshot as Record<string, unknown>).entries;
      const saved = await supabase.rpc("apply_project_identity_backfill_run_tx", { p_run_id: runId, p_entries: entries, p_actor_user_id: admin.id, p_request_id: requestId });
      if (saved.error) throw saved.error; result = saved.data;
    } else if (operation === "verify") {
      if (!runId || body.confirmation !== "VERIFY_DUAL_READ") return json({ error: "EXPLICIT_VERIFY_CONFIRMATION_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.rpc("verify_project_identity_dual_read_tx", { p_run_id: runId, p_actor_user_id: admin.id, p_request_id: requestId });
      if (saved.error) throw saved.error; result = saved.data;
    } else if (operation === "cutover") {
      const mode = text(body.mode); const readPercentage = Number(body.read_percentage);
      if (!runId || !["dual_read", "stable_id"].includes(mode) || !Number.isInteger(readPercentage) || body.confirmation !== "CUTOVER_STABLE_PROJECT_ID") return json({ error: "EXPLICIT_CUTOVER_CONFIGURATION_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.rpc("cutover_project_identity_read_tx", { p_run_id: runId, p_mode: mode, p_read_percentage: readPercentage, p_actor_user_id: admin.id, p_request_id: requestId });
      if (saved.error) throw saved.error; result = saved.data;
    } else if (operation === "rollback") {
      const reason = text(body.reason);
      if (!runId || !reason || body.confirmation !== "ROLLBACK_PROJECT_IDENTITY") return json({ error: "EXPLICIT_ROLLBACK_REASON_REQUIRED", request_id: requestId }, 409, requestId);
      const saved = await supabase.rpc("rollback_project_identity_run_tx", { p_run_id: runId, p_reason: reason, p_actor_user_id: admin.id, p_request_id: requestId });
      if (saved.error) throw saved.error; result = saved.data;
    } else return json({ error: "UNSUPPORTED_OPERATION", request_id: requestId }, 400, requestId);

    await writeOperationAudit({
      user: admin, action: `project_identity_${operation}`, resourceType: "project_identity_migration_run", resourceId: runId,
      status: "succeeded", severity: operation === "cutover" || operation === "rollback" ? "high" : "medium",
      summary: `稳定项目身份迁移动作：${operation}`, detail: { result, destructive: false }, requestId,
    });
    return json({ status: "succeeded", run_id: runId, result, source: { type: "feishu+supabase", fallback_used: false }, request_id: requestId }, operation === "create_preview" ? 201 : 200, requestId);
  } catch (error) {
    return json({ error: "PROJECT_IDENTITY_OPERATION_FAILED", detail: error instanceof Error ? error.message : "unknown", request_id: requestId }, /NOT_FOUND/.test(error instanceof Error ? error.message : "") ? 404 : /REQUIRED|INVALID|MISMATCH|CONFLICT|NOT_/.test(error instanceof Error ? error.message : "") ? 409 : 503, requestId);
  }
}
