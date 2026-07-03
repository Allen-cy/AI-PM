import { getCurrentUser } from "@/features/auth/server";
import {
  listMigrationFieldMappingProfiles,
  saveMigrationFieldMappingProfile,
  type SaveMigrationFieldMappingProfileInput,
} from "@/features/migration/field-mapping-repository";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function jsonResponse(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再查看字段映射方案。" }, 401, requestId);
  }

  const objectName = new URL(request.url).searchParams.get("objectName");
  const result = await listMigrationFieldMappingProfiles(objectName, 30);
  return jsonResponse({ request_id: requestId, ...result }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return jsonResponse({ request_id: requestId, status: "unauthorized", warning: "请先登录后再保存字段映射方案。" }, 401, requestId);
  }

  let body: SaveMigrationFieldMappingProfileInput;
  try {
    body = await request.json() as SaveMigrationFieldMappingProfileInput;
  } catch {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "请求 JSON 格式错误。" }, 400, requestId);
  }
  if (!body.analysis?.objectName || !Array.isArray(body.analysis.mappings) || body.analysis.mappings.length === 0) {
    return jsonResponse({ request_id: requestId, status: "failed", warning: "缺少有效的字段映射分析结果。" }, 400, requestId);
  }

  const result = await saveMigrationFieldMappingProfile(body, user);
  if (result.status === "succeeded") {
    await writeOperationAudit({
      user,
      action: "migration_field_mapping_profile_save",
      resourceType: "migration_field_mapping_profile",
      resourceId: result.profile.id,
      status: "succeeded",
      severity: result.profile.missingFieldCount > 0 ? "medium" : "low",
      summary: `保存迁移字段映射方案：${result.profile.profileName}`,
      detail: {
        object_name: result.profile.objectName,
        field_coverage_rate: result.profile.fieldCoverageRate,
        matched_field_count: result.profile.matchedFieldCount,
        missing_field_count: result.profile.missingFieldCount,
      },
      requestId,
    });
  }

  const status = result.status === "succeeded" ? 201 : result.status === "not_configured" ? 503 : 400;
  return jsonResponse({ request_id: requestId, ...result }, status, requestId);
}
