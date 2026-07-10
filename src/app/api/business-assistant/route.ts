import { requireAuthenticatedApiUser } from "@/features/auth/server";
import { FeishuBaseClient, type FeishuRecordItem } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { resolveBusinessAssistantAccess } from "@/features/operating-assistant/access";
import {
  loadAssistantActions,
  loadAssistantProjectIdentities,
} from "@/features/operating-assistant/repository";
import {
  buildOperationsAssistantSnapshot,
  buildPmAssistantSnapshot,
} from "@/features/operating-assistant/snapshot";
import { writeOperationAudit } from "@/features/security/repository";

export const runtime = "nodejs";

function json(body: unknown, status = 200, requestId = crypto.randomUUID()) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } });
}

async function optionalRecords(
  client: FeishuBaseClient,
  table: "milestone" | "risk" | "contract" | "payment",
): Promise<{ records: FeishuRecordItem[]; warning?: string }> {
  try {
    return { records: await client.listRecords(table, 500) };
  } catch {
    return { records: [], warning: `${table === "milestone" ? "里程碑" : table === "risk" ? "风险" : table === "contract" ? "合同" : "回款"}表不可用；本次没有用样例数据补位。` };
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const user = await requireAuthenticatedApiUser();
  if (!user) return json({ status: "unauthorized", error: "UNAUTHORIZED", request_id: requestId }, 401, requestId);
  const access = await resolveBusinessAssistantAccess(request, user);
  if (access.status !== "succeeded") {
    const status = access.status === "invalid" ? 400 : access.status === "forbidden" ? 403 : access.status === "not_configured" ? 503 : 500;
    return json({ status: access.status, error: "BUSINESS_ASSISTANT_ACCESS_FAILED", detail: access.warning, request_id: requestId }, status, requestId);
  }
  const { context, dataClass } = access.data;
  const identities = await loadAssistantProjectIdentities({ context, dataClass });
  if (identities.status !== "succeeded") {
    const status = identities.status === "not_configured" ? 503 : 500;
    return json({ status: identities.status, error: "PROJECT_IDENTITY_LOAD_FAILED", detail: identities.warning, request_id: requestId }, status, requestId);
  }
  const effective = await getEffectiveFeishuConfig();
  if (!effective.config?.tables.project) return json({
    status: "not_configured",
    error: "FEISHU_PROJECT_SOURCE_NOT_CONFIGURED",
    detail: effective.setupHint ?? "飞书项目台账尚未配置。",
    lark_cli_hint: effective.larkCliHint,
    request_id: requestId,
  }, 503, requestId);

  const client = new FeishuBaseClient(effective.config);
  let projects: FeishuRecordItem[];
  try {
    projects = await client.listRecords("project", 500);
  } catch {
    return json({
      status: "source_unavailable",
      error: "FEISHU_PROJECT_SOURCE_UNAVAILABLE",
      detail: "飞书项目台账读取失败；系统没有用演示数据替代真实事实。",
      request_id: requestId,
    }, 503, requestId);
  }

  const stableIdentities = identities.data ?? [];
  const noMappingWarning = stableIdentities.length === 0 ? ["当前范围没有已验证的稳定项目映射，未按项目名称猜测关联。"] : [];
  let snapshot;
  if (context.businessRole === "pm") {
    const [milestones, risks, actions] = await Promise.all([
      optionalRecords(client, "milestone"),
      optionalRecords(client, "risk"),
      loadAssistantActions([...new Set(stableIdentities.map(item => item.projectId))]),
    ]);
    if (actions.status !== "succeeded") return json({ status: actions.status, error: "ASSISTANT_ACTION_SOURCE_UNAVAILABLE", detail: actions.warning, request_id: requestId }, actions.status === "not_configured" ? 503 : 500, requestId);
    snapshot = buildPmAssistantSnapshot({
      identities: stableIdentities,
      projects,
      milestones: milestones.records,
      risks: risks.records,
      actions: actions.data ?? [],
      sourceWarnings: [...noMappingWarning, milestones.warning, risks.warning].filter((value): value is string => Boolean(value)),
    });
  } else {
    const [contracts, payments] = await Promise.all([optionalRecords(client, "contract"), optionalRecords(client, "payment")]);
    snapshot = buildOperationsAssistantSnapshot({
      identities: stableIdentities,
      projects,
      contracts: contracts.records,
      payments: payments.records,
      sourceWarnings: [...noMappingWarning, contracts.warning, payments.warning].filter((value): value is string => Boolean(value)),
    });
  }

  await writeOperationAudit({
    user,
    action: "business_assistant_read",
    resourceType: "business_context",
    resourceId: context.assignmentId,
    status: "succeeded",
    summary: `读取${context.businessRole === "pm" ? "项目经理" : "运营"}业务助理`,
    detail: { business_role: context.businessRole, subject_scope: context.subjectScope, subject_id: context.subjectId, data_class: dataClass, feishu_source: effective.source, fallback_used: false },
    requestId,
  });
  return json({
    status: "succeeded",
    request_id: requestId,
    context,
    data_class: dataClass,
    generated_at: new Date().toISOString(),
    source: { feishu: effective.source, fallback_used: false },
    snapshot,
  }, 200, requestId);
}
