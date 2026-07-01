import { getCurrentUser } from "@/features/auth/server";
import { getEffectiveAiModelSummary } from "@/features/ai/settings";
import { FeishuApiError, FeishuBaseClient } from "@/features/feishu/client";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { getRagService } from "@/features/rag/provider";
import { dataQualityRules, operatingDependencies } from "@/features/pmo-operating-system";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const user = await getCurrentUser();
  const aiModel = await getEffectiveAiModelSummary(user?.id);
  const rag = getRagService().health();
  const effectiveFeishu = await getEffectiveFeishuConfig();

  let feishu:
    | { status: "ok" | "degraded"; source: string; table_count: number; configured_table_count: number; missing_required_tables: string[]; detail?: string }
    | { status: "not_configured" | "error"; source: string; detail?: string; code?: string };

  if (!effectiveFeishu.config) {
    feishu = {
      status: "not_configured",
      source: effectiveFeishu.source,
      detail: effectiveFeishu.setupHint,
    };
  } else {
    try {
      const health = await new FeishuBaseClient(effectiveFeishu.config).health();
      feishu = { ...health, source: effectiveFeishu.source };
    } catch (error) {
      feishu = {
        status: "error",
        source: effectiveFeishu.source,
        code: error instanceof FeishuApiError ? error.code : "FEISHU_UNKNOWN_ERROR",
      };
    }
  }

  return Response.json({
    status: "succeeded",
    request_id: requestId,
    checked_at: checkedAt,
    user: user ? { name: user.name, role: user.role } : null,
    dependencies: operatingDependencies,
    ai_model: aiModel,
    feishu,
    rag,
    data_quality_rules: dataQualityRules,
  }, {
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
