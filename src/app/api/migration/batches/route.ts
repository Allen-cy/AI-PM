import { getCurrentUser } from "@/features/auth/server";
import { listMigrationBatches, saveMigrationBatch, type MigrationBatchSaveInput } from "@/features/migration/repository";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再查看迁移批次。" }, 401, requestId);
  }

  const result = await listMigrationBatches(20);
  return jsonResponse({ request_id: requestId, ...result }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存迁移批次。" }, 401, requestId);
  }

  let body: MigrationBatchSaveInput;
  try {
    body = await request.json() as MigrationBatchSaveInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }

  if (!body.analysis?.objectName || !Array.isArray(body.analysis.mappings)) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少有效的试迁移分析结果。" }, 400, requestId);
  }

  const result = await saveMigrationBatch(body, user);
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "migration_batch_save",
      resourceType: "migration_batch",
      resourceId: result.batch.id,
      status: "succeeded",
      severity: result.batch.highIssueCount > 0 ? "medium" : "low",
      summary: `保存迁移试跑批次：${result.batch.batchName}`,
      detail: {
        object_name: result.batch.objectName,
        total_rows: result.batch.totalRows,
        field_coverage_rate: result.batch.fieldCoverageRate,
        quality_issue_count: result.batch.qualityIssueCount,
      },
      requestId,
    });
  }

  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 400;
  return jsonResponse({ request_id: requestId, ...result }, status, requestId);
}
