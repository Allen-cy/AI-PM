import { getCurrentUser } from "@/features/auth/server";
import { buildMigrationBatchComparison } from "@/features/migration/batch-comparison";
import { buildMigrationCutoverDecision, defaultMigrationCutoverManualChecks } from "@/features/migration/cutover-decision";
import { listMigrationFieldMappingProfiles } from "@/features/migration/field-mapping-repository";
import { listMigrationRemediationActions } from "@/features/migration/remediation-repository";
import { listMigrationBatches } from "@/features/migration/repository";
import { assessMigrationReadiness, migrationReadinessAreas, type MigrationAreaId } from "@/features/migration/readiness";
import { buildMigrationScaleReadinessDashboard } from "@/features/migration/scale-readiness";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Request-Id": requestId,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (process.env.AUTH_REQUIRED === "true" && !user) {
    return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后再查看迁移规模化准备度。" }, 401, requestId);
  }

  const url = new URL(request.url);
  const objectName = url.searchParams.get("objectName") || "项目台账";
  const [batchResult, actionResult, profileResult] = await Promise.all([
    listMigrationBatches(100),
    listMigrationRemediationActions(200),
    listMigrationFieldMappingProfiles(objectName, 100),
  ]);
  const selectedAreaIds = migrationReadinessAreas.map(area => area.id) as MigrationAreaId[];
  const batchComparison = buildMigrationBatchComparison({
    objectName,
    batches: "batches" in batchResult ? batchResult.batches : [],
    remediationActions: "actions" in actionResult ? actionResult.actions : [],
  });
  const selectedProfile = ("profiles" in profileResult ? profileResult.profiles : [])[0] ?? null;
  const cutoverDecisionPackage = buildMigrationCutoverDecision({
    objectName,
    readinessResult: assessMigrationReadiness(selectedAreaIds),
    selectedAreaIds,
    batchComparison,
    fieldMappingProfile: selectedProfile,
    remediationActions: "actions" in actionResult ? actionResult.actions : [],
    manualChecks: defaultMigrationCutoverManualChecks,
  });
  const migration_scale_readiness = buildMigrationScaleReadinessDashboard({
    objectName,
    batchComparison,
    cutoverDecisionPackage,
    fieldMappingProfiles: "profiles" in profileResult ? profileResult.profiles : [],
    remediationActions: "actions" in actionResult ? actionResult.actions : [],
  });

  return json({
    request_id: requestId,
    status: [batchResult.status, actionResult.status, profileResult.status].includes("failed") ? "failed" : "succeeded",
    migration_scale_readiness,
    warnings: [batchResult, actionResult, profileResult].map(item => "warning" in item ? item.warning : "").filter(Boolean),
  }, 200, requestId);
}
