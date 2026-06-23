export type FeishuTableKey =
  | 'project'
  | 'milestone'
  | 'task'
  | 'risk'
  | 'contract'
  | 'payment'
  | 'cost'
  | 'syncLedger';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  baseToken: string;
  verificationToken?: string;
  encryptKey?: string;
  actionApiKey?: string;
  documentParentToken?: string;
  documentGrantOpenId?: string;
  allowedEventTypes: string[];
  tables: Partial<Record<FeishuTableKey, string>>;
  publicSummary: {
    identity: 'bot';
    baseConfigured: boolean;
    configuredTables: FeishuTableKey[];
  };
}

type Environment = Record<string, string | undefined>;

const tableEnvironment: Record<FeishuTableKey, string> = {
  project: 'FEISHU_PROJECT_TABLE_ID',
  milestone: 'FEISHU_MILESTONE_TABLE_ID',
  task: 'FEISHU_TASK_TABLE_ID',
  risk: 'FEISHU_RISK_TABLE_ID',
  contract: 'FEISHU_CONTRACT_TABLE_ID',
  payment: 'FEISHU_PAYMENT_TABLE_ID',
  cost: 'FEISHU_COST_TABLE_ID',
  syncLedger: 'FEISHU_SYNC_LEDGER_TABLE_ID',
};

export function readFeishuConfig(environment: Environment = process.env): FeishuConfig | null {
  const appId = environment.FEISHU_APP_ID?.trim();
  const appSecret = environment.FEISHU_APP_SECRET?.trim();
  const baseToken = environment.FEISHU_BASE_TOKEN?.trim();
  if (!appId || !appSecret || !baseToken) return null;

  const tables: Partial<Record<FeishuTableKey, string>> = {};
  for (const [key, envName] of Object.entries(tableEnvironment) as Array<[FeishuTableKey, string]>) {
    const value = environment[envName]?.trim();
    if (value) tables[key] = value;
  }

  const allowedEventTypes = (environment.FEISHU_EVENT_ALLOWED_TYPES ?? 'im.message.receive_v1')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  return {
    appId,
    appSecret,
    baseToken,
    verificationToken: environment.FEISHU_VERIFICATION_TOKEN?.trim() || undefined,
    encryptKey: environment.FEISHU_ENCRYPT_KEY?.trim() || undefined,
    actionApiKey: environment.AI_PM_INTEGRATION_API_KEY?.trim() || undefined,
    documentParentToken: environment.FEISHU_DOCUMENT_PARENT_TOKEN?.trim() || undefined,
    documentGrantOpenId: environment.FEISHU_DOCUMENT_GRANT_OPEN_ID?.trim() || undefined,
    allowedEventTypes,
    tables,
    publicSummary: {
      identity: 'bot',
      baseConfigured: true,
      configuredTables: Object.keys(tables) as FeishuTableKey[],
    },
  };
}
