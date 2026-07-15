import {
  readFeishuConfig,
  type FeishuConfig,
  type FeishuTableKey,
} from "./config.ts";
import {
  feishuAppSecretCredentialContext,
  feishuBaseTokenCredentialContext,
  organizationFeishuAppSecretCredentialContext,
  organizationFeishuBaseTokenCredentialContext,
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
  source: "user" | "organization" | "missing";
  user: AppUser | null;
  setupHint?: string;
  larkCliHint?: string;
}

const tableKeys: FeishuTableKey[] = ["project", "milestone", "task", "risk", "contract", "payment", "cost", "syncLedger"];

export const feishuSetupHint = "请在用户中心配置个人飞书应用 App ID、App Secret、多维表格 App Token，以及项目/风险/合同/回款等表ID。字段名称请在飞书智能表中使用中文描述。";

export const organizationFeishuSetupHint = "当前组织尚未配置共享飞书项目台账。请由管理员在集成中心配置组织飞书应用与八类中文字段表映射。";

export const larkCliHint = "如果在本机通过 Codex 或本地脚本直接操作飞书，需要安装 lark-cli，并完成 lark-cli doctor、登录授权和 Base 权限配置；纯网页端访问使用个人飞书应用配置，不强制依赖 lark-cli。";

export type OrganizationFeishuConnectionRow = {
  org_id: string;
  app_id?: string | null;
  app_secret_encrypted?: string | null;
  base_token_encrypted?: string | null;
  table_mapping?: Record<string, unknown> | null;
  status?: string | null;
};

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

export function resolveOrganizationFeishuConfig(
  row: OrganizationFeishuConnectionRow,
  environment: CredentialEnvironment = process.env,
): FeishuConfig | null {
  if (row.status === "disabled" || row.status === "invalid") return null;
  const appId = row.app_id?.trim();
  const appSecret = resolveStoredCredential({
    encrypted: row.app_secret_encrypted,
    context: organizationFeishuAppSecretCredentialContext(row.org_id),
    environment,
  }).value;
  const baseToken = resolveStoredCredential({
    encrypted: row.base_token_encrypted,
    context: organizationFeishuBaseTokenCredentialContext(row.org_id),
    environment,
  }).value;
  if (!appId || !appSecret || !baseToken) return null;
  const environmentConfig = readFeishuConfig();
  const tables = tableMappingFrom(row.table_mapping);
  return {
    appId,
    appSecret,
    baseToken,
    verificationToken: environmentConfig?.verificationToken,
    encryptKey: environmentConfig?.encryptKey,
    actionApiKey: environmentConfig?.actionApiKey,
    documentParentToken: environmentConfig?.documentParentToken,
    documentGrantOpenId: environmentConfig?.documentGrantOpenId,
    allowedEventTypes: environmentConfig?.allowedEventTypes ?? ["im.message.receive_v1"],
    tables,
    publicSummary: { identity: "bot", baseConfigured: true, configuredTables: Object.keys(tables) as FeishuTableKey[] },
  };
}

export async function getOrganizationFeishuConfig(orgId?: string): Promise<EffectiveFeishuConfig> {
  let user: AppUser | null = null;
  try {
    const auth = await import("../auth/server.ts");
    user = await auth.getCurrentUser();
    if (orgId && auth.isAuthStorageConfigured()) {
      const { data, error } = await auth.getAuthSupabase().from("organization_feishu_connections")
        .select("org_id,app_id,app_secret_encrypted,base_token_encrypted,table_mapping,status")
        .eq("org_id", orgId).maybeSingle();
      if (error && !/does not exist|schema cache|Could not find/i.test(error.message)) throw new Error("ORGANIZATION_FEISHU_CONFIG_STORAGE_UNAVAILABLE");
      if (data) {
        const config = resolveOrganizationFeishuConfig(data as OrganizationFeishuConnectionRow);
        if (config) return { config, source: "organization", user, larkCliHint };
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_FEISHU_CONFIG_STORAGE_UNAVAILABLE") throw error;
  }
  const environmentConfig = readFeishuConfig();
  if (environmentConfig) return { config: environmentConfig, source: "organization", user, larkCliHint };
  return { config: null, source: "missing", user, setupHint: organizationFeishuSetupHint, larkCliHint };
}

export async function getPersonalFeishuConfigForCurrentUser(): Promise<EffectiveFeishuConfig> {
  const auth = await import("../auth/server.ts");
  const user = await auth.getCurrentUser();
  if (!user) return { config: null, source: "missing", user: null, setupHint: "请先登录，再到用户中心配置个人飞书接入。", larkCliHint };
  const config = await getUserFeishuConfig(user.id);
  return config
    ? { config, source: "user", user, larkCliHint }
    : { config: null, source: "missing", user, setupHint: feishuSetupHint, larkCliHint };
}

export async function getEffectiveFeishuConfig(): Promise<EffectiveFeishuConfig> {
  // Compatibility alias for shared Base read paths. It intentionally never selects a user's
  // personal credentials; personal messages, tasks, documents and writeback must call the explicit helper.
  return getOrganizationFeishuConfig();
}
