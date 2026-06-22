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

  return {
    appId,
    appSecret,
    baseToken,
    tables,
    publicSummary: {
      identity: 'bot',
      baseConfigured: true,
      configuredTables: Object.keys(tables) as FeishuTableKey[],
    },
  };
}
