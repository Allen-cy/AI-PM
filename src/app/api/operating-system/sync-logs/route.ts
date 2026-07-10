import { listIntegrationSyncLogs } from "@/features/operating-system/sync-logs";
import { requireAuthenticatedApiUser } from "@/features/auth/server";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED", request_id: requestId }, { status: 401, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
  const result = await listIntegrationSyncLogs(30);
  return Response.json({
    request_id: requestId,
    ...result,
  }, {
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
