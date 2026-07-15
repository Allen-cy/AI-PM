import { createHash } from "node:crypto";
import type { FormalOutputType } from "./contracts.ts";
import { resolveFormalOutputAccess } from "./access.ts";
import { saveFormalBusinessOutput } from "./repository.ts";

export async function persistFormalMigrationOutput(input: {
  request: Request;
  requestId: string;
  outputType: Extract<FormalOutputType, "migration_review" | "migration_comparison" | "migration_cutover">;
  title: string;
  objectName: string;
  markdown: string;
  structuredPayload: Record<string, unknown>;
  migrationBatchId?: string | null;
}) {
  const access = await resolveFormalOutputAccess(input.request);
  if (!access.ok) return { status: "failed" as const, httpStatus: access.status, warning: access.error, detail: access.detail };
  if (!["pmo", "quality"].includes(access.businessRole)) return { status: "failed" as const, httpStatus: 403, warning: "MIGRATION_OUTPUT_ROLE_FORBIDDEN" };
  const digest = createHash("sha256").update(`${input.outputType}:${input.objectName}:${input.markdown}`).digest("hex");
  const result = await saveFormalBusinessOutput({
    orgId: access.orgId, subjectScope: access.subjectScope, subjectId: access.subjectId, projectId: access.projectId,
    dataClass: access.dataClass, outputType: input.outputType, outputKey: `migration:${input.outputType}:${digest}`,
    title: input.title, contentType: "text/markdown", content: input.markdown, structuredPayload: input.structuredPayload,
    sourceDefinition: { type: "migration_center", object_name: input.objectName, generated_by: "human_triggered_report" },
    sourceSnapshotAt: new Date().toISOString(), migrationBatchId: input.migrationBatchId ?? null,
    actor: access.user, actorBusinessRole: access.businessRole, idempotencyKey: `v634:migration:${digest}`, expectedVersion: 0,
  });
  if (result.status !== "succeeded" || !result.data) return { status: "failed" as const, httpStatus: result.status === "conflict" ? 409 : result.status === "not_configured" ? 503 : 500, warning: result.warning || "MIGRATION_OUTPUT_PERSIST_FAILED" };
  return { status: "succeeded" as const, output: result.data };
}
