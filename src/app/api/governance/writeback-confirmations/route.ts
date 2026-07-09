import { getCurrentUser } from "@/features/auth/server";
import { createFeishuActionConfirmation } from "@/features/feishu/action-confirmations";
import { buildGovernanceImpactDashboard } from "@/features/governance/impact";
import { listGovernanceInstances } from "@/features/governance/repository";
import { buildGovernanceWritebackConfirmationPackage } from "@/features/governance/writeback-confirmation";
import { writeOperationAudit } from "@/features/security/repository";

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

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const result = await listGovernanceInstances();
  const impact = buildGovernanceImpactDashboard(result.instances);
  const governance_writeback_confirmation = buildGovernanceWritebackConfirmationPackage(impact);
  return json({ request_id: requestId, status: result.status, warning: result.warning, governance_writeback_confirmation }, 200, requestId);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await getCurrentUser();
  if (!user) return json({ request_id: requestId, status: "unauthorized", warning: "请先登录后再创建治理反写飞书确认。" }, 401, requestId);

  const body = await request.json().catch(() => ({})) as { confirm?: boolean; itemIds?: string[] };
  if (body.confirm !== true) {
    return json({ request_id: requestId, status: "failed", warning: "创建治理反写飞书确认必须显式 confirm=true。" }, 400, requestId);
  }

  const result = await listGovernanceInstances();
  const impact = buildGovernanceImpactDashboard(result.instances);
  const pack = buildGovernanceWritebackConfirmationPackage(impact);
  const selected = new Set(body.itemIds?.filter(Boolean) ?? []);
  const items = pack.items.filter(item => selected.size === 0 ? item.confirmationRequired : selected.has(item.id));
  const confirmations = [];
  for (const item of items) {
    const created = await createFeishuActionConfirmation({
      user,
      source: "system",
      sourcePage: "/governance-workflows",
      payload: {
        ...item.feishuDocumentPayload,
        idempotency_key: `${item.feishuDocumentPayload.idempotency_key}:${Date.now()}`,
      },
      requestId,
    });
    confirmations.push({
      itemId: item.id,
      status: created.status,
      confirmationId: created.status === "succeeded" ? created.confirmation.id : undefined,
      warning: "warning" in created ? created.warning : undefined,
      migration: "migration" in created ? created.migration : undefined,
    });
  }

  const succeeded = confirmations.filter(item => item.status === "succeeded").length;
  await writeOperationAudit({
    user,
    action: "governance_writeback_feishu_confirmation_create",
    resourceType: "governance_writeback_confirmation",
    status: succeeded > 0 ? "succeeded" : "failed",
    severity: confirmations.some(item => item.status !== "succeeded") ? "medium" : "low",
    summary: `治理反写飞书确认已创建 ${succeeded}/${confirmations.length} 条。`,
    detail: { confirmations },
    requestId,
  });

  const firstMigration = confirmations.find(item => item.migration);
  return json({
    request_id: requestId,
    status: succeeded === confirmations.length ? "succeeded" : succeeded > 0 ? "partial" : "failed",
    created: succeeded,
    confirmations,
    warning: succeeded === confirmations.length ? undefined : "部分治理反写确认记录创建失败。",
    migration: firstMigration?.migration,
    governance_writeback_confirmation: pack,
  }, succeeded > 0 ? 200 : firstMigration ? 503 : 500, requestId);
}
