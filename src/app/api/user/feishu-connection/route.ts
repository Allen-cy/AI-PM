import { NextResponse } from "next/server";
import { getAuthSupabase, getCurrentUser, isAuthStorageConfigured } from "@/features/auth/server";
import { feishuSetupHint, larkCliHint } from "@/features/feishu/user-config";
import type { FeishuTableKey } from "@/features/feishu/config";
import {
  encryptCredential,
  feishuAppSecretCredentialContext,
  feishuBaseTokenCredentialContext,
  maskedCredential,
  resolveStoredCredential,
} from "@/features/security/credential-encryption";

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

const encryptedConnectionSelect = "app_id,app_secret,app_secret_encrypted,app_secret_last4,base_token,base_token_encrypted,base_token_last4,table_mapping,status";
const legacyConnectionSelect = "app_id,app_secret,base_token,table_mapping,status";
const connectionSelectWithNotification = `${encryptedConnectionSelect},notification_receive_id_type,notification_receive_id`;

function isNotificationColumnMissing(message: string | undefined): boolean {
  return /notification_receive_id|schema cache|Could not find.*column/i.test(message || "");
}

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
  app_secret_encrypted?: string | null;
  app_secret_last4?: string | null;
  base_token?: string | null;
  base_token_encrypted?: string | null;
  base_token_last4?: string | null;
  table_mapping?: Record<string, unknown> | null;
  notification_receive_id_type?: string | null;
  notification_receive_id?: string | null;
  status?: string | null;
} | null, notificationStorageAvailable = true) {
  const tableMapping = normalizeMapping(row?.table_mapping);
  const appSecretLast4 = row?.app_secret_last4 || row?.app_secret?.slice(-4) || "";
  const baseTokenLast4 = row?.base_token_last4 || row?.base_token?.slice(-4) || "";
  const appSecretConfigured = Boolean(row?.app_secret_encrypted || row?.app_secret);
  const baseTokenConfigured = Boolean(row?.base_token_encrypted || row?.base_token);
  return {
    appId: row?.app_id || "",
    appSecretConfigured,
    appSecretLast4,
    appSecretMasked: maskedCredential(appSecretLast4),
    baseToken: "",
    baseTokenConfigured,
    baseTokenLast4,
    baseTokenMasked: maskedCredential(baseTokenLast4),
    tableMapping,
    notificationReceiveIdType: row?.notification_receive_id_type || "",
    notificationReceiveId: row?.notification_receive_id || "",
    notificationStorageAvailable,
    status: row?.status || "not_configured",
    configured: Boolean(row?.app_id && appSecretConfigured && baseTokenConfigured),
    tableLabels,
    setupHint: feishuSetupHint,
    larkCliHint,
  };
}

async function readConnection(supabase: ReturnType<typeof getAuthSupabase>, userId: string) {
  const preferred = await supabase
    .from("user_feishu_connections")
    .select(connectionSelectWithNotification)
    .eq("user_id", userId)
    .maybeSingle();
  if (!preferred.error) return { data: preferred.data, error: null, notificationStorageAvailable: true };
  const encryptedFallback = await supabase
    .from("user_feishu_connections")
    .select(encryptedConnectionSelect)
    .eq("user_id", userId)
    .maybeSingle();
  if (!encryptedFallback.error) return { data: encryptedFallback.data, error: null, notificationStorageAvailable: false };
  const legacyFallback = await supabase
    .from("user_feishu_connections")
    .select(legacyConnectionSelect)
    .eq("user_id", userId)
    .maybeSingle();
  return { data: legacyFallback.data, error: legacyFallback.error, notificationStorageAvailable: false };
}

async function notificationColumnsAvailable(supabase: ReturnType<typeof getAuthSupabase>): Promise<boolean> {
  const { error } = await supabase
    .from("user_feishu_connections")
    .select("notification_receive_id_type,notification_receive_id", { head: true })
    .limit(1);
  return !error;
}

async function encryptedColumnsAvailable(supabase: ReturnType<typeof getAuthSupabase>): Promise<boolean> {
  const { error } = await supabase
    .from("user_feishu_connections")
    .select("app_secret_encrypted,app_secret_last4,app_secret_key_version,base_token_encrypted,base_token_last4,base_token_key_version", { head: true })
    .limit(1);
  return !error;
}

export async function GET() {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const supabase = getAuthSupabase();
  const { data, error, notificationStorageAvailable } = await readConnection(supabase, user.id);

  if (error) return NextResponse.json({ error: "FEISHU_SETTINGS_STORAGE_FAILED" }, { status: 500 });
  return NextResponse.json({ connection: safeConnection(data, notificationStorageAvailable) });
}

export async function PUT(request: Request) {
  if (!isAuthStorageConfigured()) {
    return NextResponse.json({ error: "AUTH_STORAGE_NOT_CONFIGURED" }, { status: 503 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
  }
  const appId = String(body.appId || "").trim();
  const appSecret = typeof body.appSecret === "string" ? body.appSecret.trim() : "";
  const baseToken = String(body.baseToken || "").trim();
  const tableMapping = normalizeMapping(body.tableMapping);
  const notificationReceiveIdType = String(body.notificationReceiveIdType || body.notification_receive_id_type || "").trim();
  const notificationReceiveId = String(body.notificationReceiveId || body.notification_receive_id || "").trim();

  if (!appId) return NextResponse.json({ error: "请填写 App ID" }, { status: 400 });
  if ((notificationReceiveIdType || notificationReceiveId) && !["chat_id", "open_id"].includes(notificationReceiveIdType)) {
    return NextResponse.json({ error: "飞书通知接收对象类型必须是 chat_id 或 open_id" }, { status: 400 });
  }
  if ((notificationReceiveIdType && !notificationReceiveId) || (!notificationReceiveIdType && notificationReceiveId)) {
    return NextResponse.json({ error: "飞书通知接收对象类型和接收ID必须同时填写" }, { status: 400 });
  }

  const supabase = getAuthSupabase();
  const canStoreNotification = await notificationColumnsAvailable(supabase);
  const canStoreEncryptedCredentials = await encryptedColumnsAvailable(supabase);
  if (!canStoreEncryptedCredentials) {
    return NextResponse.json({ error: "FEISHU_ENCRYPTED_STORAGE_NOT_CONFIGURED", detail: "请先执行 P25 用户敏感配置加密迁移，补齐 user_feishu_connections 的加密凭据字段。" }, { status: 503 });
  }
  if (!canStoreNotification && (notificationReceiveIdType || notificationReceiveId)) {
    return NextResponse.json({ error: "FEISHU_NOTIFICATION_STORAGE_NOT_CONFIGURED", detail: "请先执行 P21 决策治理迁移，补齐 user_feishu_connections 的通知接收字段。" }, { status: 503 });
  }
  const { data: existing, error: existingError } = await supabase
    .from("user_feishu_connections")
    .select("app_secret,app_secret_encrypted,base_token,base_token_encrypted")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: "FEISHU_SETTINGS_STORAGE_FAILED" }, { status: 500 });

  let secret: string | null;
  let token: string | null;
  try {
    secret = appSecret || resolveStoredCredential({
      encrypted: existing?.app_secret_encrypted,
      plaintext: existing?.app_secret,
      context: feishuAppSecretCredentialContext(user.id),
    }).value;
    token = baseToken || resolveStoredCredential({
      encrypted: existing?.base_token_encrypted,
      plaintext: existing?.base_token,
      context: feishuBaseTokenCredentialContext(user.id),
    }).value;
  } catch {
    return NextResponse.json({ error: "CREDENTIAL_DECRYPTION_FAILED" }, { status: 503 });
  }
  if (!secret) return NextResponse.json({ error: "首次配置必须填写 App Secret" }, { status: 400 });
  if (!token) return NextResponse.json({ error: "首次配置必须填写多维表格 App Token" }, { status: 400 });

  let encryptedSecret;
  let encryptedToken;
  try {
    encryptedSecret = encryptCredential(secret, feishuAppSecretCredentialContext(user.id));
    encryptedToken = encryptCredential(token, feishuBaseTokenCredentialContext(user.id));
  } catch {
    return NextResponse.json({ error: "CREDENTIAL_ENCRYPTION_UNAVAILABLE" }, { status: 503 });
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    app_id: appId,
    app_secret: null,
    app_secret_encrypted: encryptedSecret.encrypted,
    app_secret_last4: secret.slice(-4),
    app_secret_key_version: encryptedSecret.keyVersion,
    base_token: null,
    base_token_encrypted: encryptedToken.encrypted,
    base_token_last4: token.slice(-4),
    base_token_key_version: encryptedToken.keyVersion,
    table_mapping: tableMapping,
    connection_mode: "web_app",
    status: "configured",
    updated_at: new Date().toISOString(),
  };
  if (canStoreNotification) {
    payload.notification_receive_id_type = notificationReceiveIdType || null;
    payload.notification_receive_id = notificationReceiveId || null;
  }

  const { data, error } = await supabase
    .from("user_feishu_connections")
    .upsert(payload, { onConflict: "user_id" })
    .select(canStoreNotification
      ? "app_id,app_secret_encrypted,app_secret_last4,base_token_encrypted,base_token_last4,table_mapping,notification_receive_id_type,notification_receive_id,status"
      : "app_id,app_secret_encrypted,app_secret_last4,base_token_encrypted,base_token_last4,table_mapping,status")
    .single();

  if (error) return NextResponse.json({ error: "FEISHU_SETTINGS_STORAGE_FAILED" }, { status: 500 });
  return NextResponse.json({ connection: safeConnection(data as Parameters<typeof safeConnection>[0], canStoreNotification) });
}
