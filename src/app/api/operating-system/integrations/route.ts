import { getCurrentUser } from "@/features/auth/server";
import { getEffectiveAiModelSummary } from "@/features/ai/settings";
import { FeishuApiError, FeishuBaseClient } from "@/features/feishu/client";
import type { FeishuTableKey } from "@/features/feishu/config";
import { getEffectiveFeishuConfig } from "@/features/feishu/user-config";
import { loadDashboardFromFeishu } from "@/features/dashboard/feishu";
import {
  diagnoseIntegrationState,
  evaluateDataQuality,
  evaluateFeishuFieldMappings,
} from "@/features/operating-system/diagnostics";
import { writeIntegrationSyncLog } from "@/features/operating-system/sync-logs";
import { getRagService } from "@/features/rag/provider";
import { dataQualityRules, operatingDependencies } from "@/features/pmo-operating-system";

export const runtime = "nodejs";

function configuredTables(configured: Partial<Record<FeishuTableKey, string>> | undefined): FeishuTableKey[] {
  return Object.keys(configured ?? {}) as FeishuTableKey[];
}

function normalizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => {
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === "object" && first !== null && "text" in first) return [key, (first as { text: unknown }).text];
      if (typeof first === "object" && first !== null && "name" in first) return [key, (first as { name: unknown }).name];
      return [key, first];
    }
    return [key, value];
  }));
}

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
  let fieldMappingChecks = evaluateFeishuFieldMappings({ configuredTables: [], fieldNamesByTable: {} });
  let dataQualityChecks = evaluateDataQuality({ rules: dataQualityRules, dashboard: null });

  if (!effectiveFeishu.config) {
    feishu = {
      status: "not_configured",
      source: effectiveFeishu.source,
      detail: effectiveFeishu.setupHint,
    };
  } else {
    const client = new FeishuBaseClient(effectiveFeishu.config);
    const tables = configuredTables(effectiveFeishu.config.tables);
    try {
      const health = await client.health();
      feishu = { ...health, source: effectiveFeishu.source };

      const fieldNamesByTable: Partial<Record<FeishuTableKey, string[]>> = {};
      const fieldErrors: Partial<Record<FeishuTableKey, string>> = {};
      await Promise.all(tables.map(async tableKey => {
        try {
          fieldNamesByTable[tableKey] = (await client.listFields(tableKey)).map(field => field.name);
        } catch (error) {
          fieldErrors[tableKey] = error instanceof FeishuApiError ? error.code : "FEISHU_FIELD_UNKNOWN_ERROR";
        }
      }));
      fieldMappingChecks = evaluateFeishuFieldMappings({
        configuredTables: tables,
        fieldNamesByTable,
        fieldErrors,
      });

      const [dashboard, projectRecords, riskRecords, taskRecords, paymentRecords] = await Promise.all([
        effectiveFeishu.config.tables.project ? loadDashboardFromFeishu(effectiveFeishu.config).catch(() => null) : Promise.resolve(null),
        effectiveFeishu.config.tables.project ? client.listRecords("project", 200).catch(() => []) : Promise.resolve([]),
        effectiveFeishu.config.tables.risk ? client.listRecords("risk", 200).catch(() => []) : Promise.resolve([]),
        effectiveFeishu.config.tables.task ? client.listRecords("task", 200).catch(() => []) : Promise.resolve([]),
        effectiveFeishu.config.tables.payment ? client.listRecords("payment", 200).catch(() => []) : Promise.resolve([]),
      ]);
      dataQualityChecks = evaluateDataQuality({
        rules: dataQualityRules,
        dashboard,
        projectRecords: projectRecords.map(item => normalizeFields(item.fields)),
        riskRecords: riskRecords.map(item => normalizeFields(item.fields)),
        taskRecords: taskRecords.map(item => normalizeFields(item.fields)),
        paymentRecords: paymentRecords.map(item => normalizeFields(item.fields)),
      });
    } catch (error) {
      feishu = {
        status: "error",
        source: effectiveFeishu.source,
        code: error instanceof FeishuApiError ? error.code : "FEISHU_UNKNOWN_ERROR",
      };
      fieldMappingChecks = evaluateFeishuFieldMappings({
        configuredTables: tables,
        fieldNamesByTable: {},
        fieldErrors: Object.fromEntries(tables.map(tableKey => [tableKey, error instanceof FeishuApiError ? error.code : "FEISHU_UNKNOWN_ERROR"])) as Partial<Record<FeishuTableKey, string>>,
      });
    }
  }

  const failedChecks = [
    ...fieldMappingChecks.filter(item => item.status === "warning" || item.status === "error"),
    ...dataQualityChecks.filter(item => item.status === "warning" || item.status === "error"),
  ];
  const syncLogWrite = await writeIntegrationSyncLog({
    userId: user?.id,
    source: "feishu",
    eventType: "operating_system_health_check",
    status: feishu.status === "error" ? "failed" : failedChecks.length > 0 ? "warning" : "succeeded",
    severity: feishu.status === "error" || dataQualityChecks.some(item => item.status === "error") ? "high" : failedChecks.length > 0 ? "medium" : "low",
    summary: `数据与集成中心检查完成：飞书${feishu.status}，字段问题${fieldMappingChecks.filter(item => item.status === "warning" || item.status === "error").length}项，数据质量问题${dataQualityChecks.filter(item => item.status === "warning" || item.status === "error").length}项。`,
    detail: {
      feishu_status: feishu.status,
      feishu_source: feishu.source,
      field_mapping_checks: fieldMappingChecks.map(item => ({
        table: item.tableName,
        status: item.status,
        missing_fields: item.missingFields,
      })),
      data_quality_checks: dataQualityChecks.map(item => ({
        id: item.id,
        status: item.status,
        affected_count: item.affectedCount,
      })),
    },
    remediation: failedChecks.length > 0 ? "请按字段映射检查和数据质量扫描结果修正飞书台账。" : undefined,
    requestId,
  });

  const diagnostics = diagnoseIntegrationState({
    feishuStatus: feishu.status,
    feishuCode: "code" in feishu ? feishu.code : undefined,
    feishuDetail: feishu.detail,
    aiConfigured: aiModel.configured,
    ragStatus: rag.status,
    fieldMappingChecks,
    dataQualityChecks,
    syncLogStatus: syncLogWrite.status,
  });

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
    field_mapping_checks: fieldMappingChecks,
    data_quality_checks: dataQualityChecks,
    diagnostics,
    sync_log_write: syncLogWrite,
  }, {
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
