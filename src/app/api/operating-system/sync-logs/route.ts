import { listIntegrationSyncLogs } from "@/features/operating-system/sync-logs";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const result = await listIntegrationSyncLogs(30);
  return Response.json({
    request_id: requestId,
    ...result,
  }, {
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
