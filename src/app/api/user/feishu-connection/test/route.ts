import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import { FeishuApiError, FeishuBaseClient } from "@/features/feishu/client";
import { connectionToFeishuConfig, feishuSetupHint, larkCliHint } from "@/features/feishu/user-config";
import type { FeishuTableKey } from "@/features/feishu/config";
import {
  buildFeishuConfigCompletenessSteps,
  fieldMappingSteps,
  summarizeFeishuConnectionSteps,
  writeCheckStep,
} from "@/features/feishu/connection-test";
import { evaluateFeishuFieldMappings } from "@/features/operating-system/diagnostics";
import {
  feishuAppSecretCredentialContext,
  feishuBaseTokenCredentialContext,
  resolveStoredCredential,
} from "@/features/security/credential-encryption";

export const runtime = "nodejs";

const tableKeys: FeishuTableKey[] = ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"];

type UserFeishuConnectionRow = {
  user_id: string;
  app_id?: string | null;
  app_secret?: string | null;
  app_secret_encrypted?: string | null;
  base_token?: string | null;
  base_token_encrypted?: string | null;
  table_mapping?: Record<string, unknown> | null;
  connection_mode?: string | null;
  status?: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMapping(value: unknown): Partial<Record<FeishuTableKey, string>> {
  const input = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const output: Partial<Record<FeishuTableKey, string>> = {};
  for (const key of tableKeys) {
    const tableId = text(input[key]);
    if (tableId) output[key] = tableId;
  }
  return output;
}

function mergedConnection(userId: string, body: Record<string, unknown>, existing: UserFeishuConnectionRow | null): UserFeishuConnectionRow {
  const storedSecret = resolveStoredCredential({
    encrypted: existing?.app_secret_encrypted,
    plaintext: existing?.app_secret,
    context: feishuAppSecretCredentialContext(userId),
  }).value;
  const storedBaseToken = resolveStoredCredential({
    encrypted: existing?.base_token_encrypted,
    plaintext: existing?.base_token,
    context: feishuBaseTokenCredentialContext(userId),
  }).value;
  return {
    user_id: userId,
    app_id: text(body.appId) || existing?.app_id || "",
    app_secret: text(body.appSecret) || storedSecret || "",
    base_token: text(body.baseToken) || storedBaseToken || "",
    table_mapping: Object.keys(normalizeMapping(body.tableMapping)).length > 0
      ? normalizeMapping(body.tableMapping)
      : existing?.table_mapping || {},
    connection_mode: "web_app",
    status: "configured",
  };
}

function responseStatus(status: string): number {
  if (status === "ok" || status === "warning") return 200;
  if (status === "not_configured") return 400;
  return 502;
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ request_id: requestId, status: "not_configured", warning: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ request_id: requestId, status: "unauthorized", warning: "请先登录" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const supabase = getAuthSupabase();
  const { data: existing, error } = await supabase
    .from("user_feishu_connections")
    .select("user_id,app_id,app_secret,app_secret_encrypted,base_token,base_token_encrypted,table_mapping,connection_mode,status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ request_id: requestId, status: "failed", warning: "FEISHU_SETTINGS_STORAGE_FAILED" }, { status: 500 });

  let row: UserFeishuConnectionRow;
  try {
    row = mergedConnection(user.id, body, existing as UserFeishuConnectionRow | null);
  } catch {
    return NextResponse.json({ request_id: requestId, status: "failed", warning: "CREDENTIAL_DECRYPTION_FAILED" }, { status: 503 });
  }
  const tableMapping = normalizeMapping(row.table_mapping);
  const steps = buildFeishuConfigCompletenessSteps({
    appId: row.app_id,
    appSecret: row.app_secret,
    baseToken: row.base_token,
    configuredTableCount: Object.keys(tableMapping).length,
  });

  const config = connectionToFeishuConfig(row);
  if (!config) {
    const summary = summarizeFeishuConnectionSteps(steps);
    return NextResponse.json({
      request_id: requestId,
      test: {
        status: "not_configured",
        source: "user",
        checkedAt: new Date().toISOString(),
        baseAccessible: false,
        tableCount: 0,
        configuredTableCount: Object.keys(tableMapping).length,
        missingRequiredTables: [],
        steps,
        fieldMappingChecks: [],
        summary: { ...summary, status: "not_configured", message: "个人飞书配置不完整，无法发起连接测试。" },
        setupHint: feishuSetupHint,
        larkCliHint,
      },
    }, {
      status: 400,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  }

  const client = new FeishuBaseClient(config);
  let baseAccessible = false;
  let tableCount = 0;
  let missingRequiredTables: FeishuTableKey[] = [];
  let fieldMappingChecks = evaluateFeishuFieldMappings({ configuredTables: Object.keys(config.tables) as FeishuTableKey[], fieldNamesByTable: {} });

  try {
    const health = await client.health();
    baseAccessible = health.base_accessible;
    tableCount = health.table_count;
    missingRequiredTables = health.missing_required_tables;
    steps.push({
      id: "base_access",
      label: "Base 访问权限",
      status: "ok",
      detail: `应用可访问该多维表格，共识别 ${health.table_count} 张表。`,
    });
    steps.push({
      id: "table_ids",
      label: "表 ID 有效性",
      status: missingRequiredTables.length === 0 ? "ok" : "warning",
      detail: missingRequiredTables.length === 0
        ? "已配置的表 ID 均存在于当前多维表格。"
        : `以下表 ID 未在当前多维表格中找到：${missingRequiredTables.join("、")}`,
      nextAction: missingRequiredTables.length === 0 ? undefined : "检查用户中心填写的表 ID 是否来自同一个多维表格。",
    });

    const fieldNamesByTable: Partial<Record<FeishuTableKey, string[]>> = {};
    const fieldErrors: Partial<Record<FeishuTableKey, string>> = {};
    await Promise.all((Object.keys(config.tables) as FeishuTableKey[]).map(async tableKey => {
      try {
        fieldNamesByTable[tableKey] = (await client.listFields(tableKey)).map(field => field.name);
      } catch (fieldError) {
        fieldErrors[tableKey] = fieldError instanceof FeishuApiError ? fieldError.code : "FEISHU_FIELD_UNKNOWN_ERROR";
      }
    }));
    fieldMappingChecks = evaluateFeishuFieldMappings({
      configuredTables: Object.keys(config.tables) as FeishuTableKey[],
      fieldNamesByTable,
      fieldErrors,
    });
    steps.push(...fieldMappingSteps(fieldMappingChecks));

    if (body.includeWriteCheck === true) {
      if (!config.tables.syncLedger) {
        steps.push(writeCheckStep({ requested: true, attempted: false, succeeded: false }));
      } else {
        try {
          const result = await client.createRecord("syncLedger", {
            "事件ID": `AI-PMO-CONNECTION-TEST-${Date.now()}`,
            "处理状态": "succeeded",
            "错误信息": "AI-PMO 用户飞书连接写入权限测试记录",
            "尝试次数": 1,
          });
          steps.push(writeCheckStep({ requested: true, attempted: true, succeeded: true, recordId: result.recordId }));
        } catch (writeError) {
          steps.push(writeCheckStep({
            requested: true,
            attempted: true,
            succeeded: false,
            code: writeError instanceof FeishuApiError ? writeError.code : "FEISHU_WRITE_UNKNOWN_ERROR",
            message: writeError instanceof Error ? writeError.message : "飞书写入测试失败。",
          }));
        }
      }
    } else {
      steps.push(writeCheckStep({ requested: false, attempted: false, succeeded: false }));
    }
  } catch (healthError) {
    steps.push({
      id: "base_access",
      label: "Base 访问权限",
      status: "failed",
      detail: "飞书应用认证或多维表格访问失败。",
      nextAction: "检查 App ID、App Secret、App Token 是否匹配，并确认飞书应用已被添加到该多维表格且具备权限。",
      code: healthError instanceof FeishuApiError ? healthError.code : "FEISHU_UNKNOWN_ERROR",
    });
  }

  const summary = summarizeFeishuConnectionSteps(steps);
  return NextResponse.json({
    request_id: requestId,
    test: {
      status: summary.status,
      source: "user",
      checkedAt: new Date().toISOString(),
      baseAccessible,
      tableCount,
      configuredTableCount: Object.keys(config.tables).length,
      missingRequiredTables,
      steps,
      fieldMappingChecks,
      summary,
      setupHint: feishuSetupHint,
      larkCliHint,
    },
  }, {
    status: responseStatus(summary.status),
    headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}
