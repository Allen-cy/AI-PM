import {
  readFeishuConfig,
  type FeishuConfig,
  type FeishuTableKey,
} from "./config.ts";
import {
  feishuAppSecretCredentialContext,
  feishuBaseTokenCredentialContext,
  resolveStoredCredential,
  type CredentialEnvironment,
} from "../security/credential-encryption.ts";

interface AppUser {
  id: string;
  email: string;
  phone: string;
  name: string | null;
  role: "admin" | "user";
  status: "active" | "disabled";
}

export type UserFeishuConnectionRow = {
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

export interface EffectiveFeishuConfig {
  config: FeishuConfig | null;
  source: "user" | "global" | "missing";
  user: AppUser | null;
  setupHint?: string;
  larkCliHint?: string;
}

const tableKeys: FeishuTableKey[] = ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"];

export const feishuSetupHint = "请在用户中心配置个人飞书应用 App ID、App Secret、多维表格 App Token，以及项目/风险/合同/回款等表ID。字段名称请在飞书智能表中使用中文描述。";

export const larkCliHint = "如果在本机通过 Codex 或本地脚本直接操作飞书，需要安装 lark-cli，并完成 lark-cli doctor、登录授权和 Base 权限配置；纯网页端访问使用个人飞书应用配置，不强制依赖 lark-cli。";

export const globalFeishuFallbackHint = "当前账号尚未配置个人飞书接入，系统会先使用管理员全局飞书配置；如需切换到个人飞书，请到用户中心填写个人飞书应用与多维表格映射。";

function tableMappingFrom(value: Record<string, unknown> | null | undefined): Partial<Record<FeishuTableKey, string>> {
  const output: Partial<Record<FeishuTableKey, string>> = {};
  for (const key of tableKeys) {
    const tableId = value?.[key];
    if (typeof tableId === "string" && tableId.trim()) output[key] = tableId.trim();
  }
  return output;
}

export function connectionToFeishuConfig(
  row: UserFeishuConnectionRow,
  environment: CredentialEnvironment = process.env,
): FeishuConfig | null {
  const appId = row.app_id?.trim();
  let appSecret: string | null;
  let baseToken: string | null;
  try {
    appSecret = resolveStoredCredential({
      encrypted: row.app_secret_encrypted,
      plaintext: row.app_secret,
      context: feishuAppSecretCredentialContext(row.user_id),
      environment,
    }).value;
    baseToken = resolveStoredCredential({
      encrypted: row.base_token_encrypted,
      plaintext: row.base_token,
      context: feishuBaseTokenCredentialContext(row.user_id),
      environment,
    }).value;
  } catch {
    return null;
  }
  if (!appId || !appSecret || !baseToken) return null;

  const globalConfig = readFeishuConfig();
  const tables = tableMappingFrom(row.table_mapping);
  return {
    appId,
    appSecret,
    baseToken,
    verificationToken: globalConfig?.verificationToken,
    encryptKey: globalConfig?.encryptKey,
    actionApiKey: globalConfig?.actionApiKey,
    documentParentToken: globalConfig?.documentParentToken,
    documentGrantOpenId: globalConfig?.documentGrantOpenId,
    allowedEventTypes: globalConfig?.allowedEventTypes ?? ["im.message.receive_v1"],
    tables,
    publicSummary: {
      identity: "bot",
      baseConfigured: true,
      configuredTables: Object.keys(tables) as FeishuTableKey[],
    },
  };
}

export function resolvePersonalFeishuConfig(
  row: UserFeishuConnectionRow,
  environment: CredentialEnvironment = process.env,
): FeishuConfig | null {
  if (row.status === "disabled") return null;
  const config = connectionToFeishuConfig(row, environment);
  if (config) return config;
  const configuredRecord = row.status === "configured" || Boolean(
    row.app_id || row.app_secret || row.app_secret_encrypted || row.base_token || row.base_token_encrypted,
  );
  if (configuredRecord) throw new Error("PERSONAL_FEISHU_CREDENTIAL_UNAVAILABLE");
  return null;
}

export async function getUserFeishuConfig(userId: string): Promise<FeishuConfig | null> {
  const auth = await import("../auth/server.ts");
  if (!auth.isAuthStorageConfigured()) return null;
  const supabase = auth.getAuthSupabase();
  const { data, error } = await supabase
    .from("user_feishu_connections")
    .select("user_id,app_id,app_secret,app_secret_encrypted,base_token,base_token_encrypted,table_mapping,connection_mode,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("PERSONAL_FEISHU_CONFIG_STORAGE_UNAVAILABLE");
  if (!data) return null;
  return resolvePersonalFeishuConfig(data as UserFeishuConnectionRow);
}

export async function getEffectiveFeishuConfig(): Promise<EffectiveFeishuConfig> {
  let user: AppUser | null = null;
  try {
    const auth = await import("../auth/server.ts");
    user = await auth.getCurrentUser();
  } catch {
    user = null;
  }

  if (user) {
    const personalConfig = await getUserFeishuConfig(user.id);
    if (personalConfig) {
      return { config: personalConfig, source: "user", user, larkCliHint };
    }
    const globalConfig = readFeishuConfig();
    if (globalConfig) {
      return {
        config: globalConfig,
        source: "global",
        user,
        setupHint: globalFeishuFallbackHint,
        larkCliHint,
      };
    }
    return {
      config: null,
      source: "missing",
      user,
      setupHint: feishuSetupHint,
      larkCliHint,
    };
  }

  if (process.env.AUTH_REQUIRED === "true") {
    return {
      config: null,
      source: "missing",
      user: null,
      setupHint: "当前系统已启用登录访问。请先登录，再到用户中心配置个人飞书接入。",
      larkCliHint,
    };
  }

  const globalConfig = readFeishuConfig();
  if (globalConfig) return { config: globalConfig, source: "global", user: null, larkCliHint };

  return {
    config: null,
    source: "missing",
    user: null,
    setupHint: feishuSetupHint,
    larkCliHint,
  };
}
