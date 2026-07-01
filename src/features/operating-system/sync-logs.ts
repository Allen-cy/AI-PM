import { getAuthSupabase, isAuthStorageConfigured } from "../auth/server.ts";

export interface IntegrationSyncLogInput {
  userId?: string | null;
  source: "feishu" | "supabase" | "ai_model" | "rag" | "system";
  eventType: string;
  status: "succeeded" | "warning" | "failed" | "skipped";
  severity: "high" | "medium" | "low";
  summary: string;
  detail?: Record<string, unknown>;
  remediation?: string;
  requestId?: string;
}

export interface IntegrationSyncLogRecord extends IntegrationSyncLogInput {
  id: string;
  createdAt: string;
}

export type SyncLogWriteResult =
  | { status: "succeeded"; id?: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

function isMissingTableError(message?: string): boolean {
  return Boolean(message?.includes("integration_sync_logs") || message?.includes("relation") || message?.includes("does not exist"));
}

export async function writeIntegrationSyncLog(input: IntegrationSyncLogInput): Promise<SyncLogWriteResult> {
  if (!isAuthStorageConfigured()) {
    return { status: "skipped", reason: "Supabase 未配置，无法持久化同步日志。" };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("integration_sync_logs")
      .insert({
        user_id: input.userId ?? null,
        source: input.source,
        event_type: input.eventType,
        status: input.status,
        severity: input.severity,
        summary: input.summary,
        detail: input.detail ?? {},
        remediation: input.remediation ?? null,
        request_id: input.requestId ?? null,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      return {
        status: isMissingTableError(error.message) ? "skipped" : "failed",
        reason: isMissingTableError(error.message)
          ? "Supabase 尚未创建 integration_sync_logs 表。"
          : error.message,
      };
    }

    return { status: "succeeded", id: data?.id };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : "同步日志写入失败。" };
  }
}

export async function listIntegrationSyncLogs(limit = 20): Promise<{
  status: "succeeded" | "not_configured" | "failed";
  logs: IntegrationSyncLogRecord[];
  migration?: string;
  detail?: string;
}> {
  if (!isAuthStorageConfigured()) {
    return {
      status: "not_configured",
      logs: [],
      migration: "请先配置 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY。",
    };
  }

  try {
    const supabase = getAuthSupabase();
    const { data, error } = await supabase
      .from("integration_sync_logs")
      .select("id, user_id, source, event_type, status, severity, summary, detail, remediation, request_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return {
        status: isMissingTableError(error.message) ? "not_configured" : "failed",
        logs: [],
        migration: isMissingTableError(error.message) ? "supabase-v527-integration-sync-logs.sql" : undefined,
        detail: error.message,
      };
    }

    return {
      status: "succeeded",
      logs: (data ?? []).map(item => ({
        id: item.id,
        userId: item.user_id,
        source: item.source,
        eventType: item.event_type,
        status: item.status,
        severity: item.severity,
        summary: item.summary,
        detail: item.detail ?? {},
        remediation: item.remediation ?? undefined,
        requestId: item.request_id ?? undefined,
        createdAt: item.created_at,
      })),
    };
  } catch (error) {
    return {
      status: "failed",
      logs: [],
      detail: error instanceof Error ? error.message : "读取同步日志失败。",
    };
  }
}
