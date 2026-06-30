import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import { feishuSetupHint, larkCliHint } from "@/features/feishu/user-config";
import type { FeishuTableKey } from "@/features/feishu/config";

export const runtime = "nodejs";

const tableKeys: FeishuTableKey[] = ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"];

const tableLabels: Record<FeishuTableKey, string> = {
  project: "项目台账表ID",
  milestone: "里程碑表ID",
  task: "任务表ID",
  risk: "风险表ID",
  contract: "合同表ID",
  payment: "回款表ID",
  cost: "成本表ID",
  syncLedger: "同步流水表ID",
};

function normalizeMapping(value: unknown): Partial<Record<FeishuTableKey, string>> {
  const input = typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const output: Partial<Record<FeishuTableKey, string>> = {};
  for (const key of tableKeys) {
    const text = String(input[key] || "").trim();
    if (text) output[key] = text;
  }
  return output;
}

function safeConnection(row: {
  app_id?: string | null;
  app_secret?: string | null;
  base_token?: string | null;
  table_mapping?: Record<string, unknown> | null;
  status?: string | null;
} | null) {
  const tableMapping = normalizeMapping(row?.table_mapping);
  return {
    appId: row?.app_id || "",
    appSecretConfigured: Boolean(row?.app_secret),
    appSecretLast4: row?.app_secret ? row.app_secret.slice(-4) : "",
    baseToken: row?.base_token || "",
    tableMapping,
    status: row?.status || "not_configured",
    configured: Boolean(row?.app_id && row?.app_secret && row?.base_token),
    tableLabels,
    setupHint: feishuSetupHint,
    larkCliHint,
  };
}

export async function GET() {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const supabase = getAuthSupabase();
  const { data, error } = await supabase
    .from("user_feishu_connections")
    .select("app_id,app_secret,base_token,table_mapping,status")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connection: safeConnection(data) });
}

export async function PUT(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json();
  const appId = String(body.appId || "").trim();
  const appSecret = typeof body.appSecret === "string" ? body.appSecret.trim() : "";
  const baseToken = String(body.baseToken || "").trim();
  const tableMapping = normalizeMapping(body.tableMapping);

  if (!appId || !baseToken) {
    return NextResponse.json({ error: "请填写 App ID 和多维表格 App Token" }, { status: 400 });
  }

  const supabase = getAuthSupabase();
  const { data: existing } = await supabase
    .from("user_feishu_connections")
    .select("app_secret")
    .eq("user_id", user.id)
    .maybeSingle();

  const secret = appSecret || existing?.app_secret;
  if (!secret) {
    return NextResponse.json({ error: "首次配置必须填写 App Secret" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_feishu_connections")
    .upsert({
      user_id: user.id,
      app_id: appId,
      app_secret: secret,
      base_token: baseToken,
      table_mapping: tableMapping,
      connection_mode: "web_app",
      status: "configured",
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    .select("app_id,app_secret,base_token,table_mapping,status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connection: safeConnection(data) });
}
