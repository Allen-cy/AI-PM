import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const defaultFeishuBaseToken = 'BZhHba0BYa8aRLsQdYUcBnbhnqe';
const defaultFeishuTables = {
  project: 'tblLE1Jkopn7qbVK',
  milestone: 'tblKvVmPSfOKd8BJ',
  task: 'tblK3ewUmGdBv7aa',
  risk: 'tblxh8prrF17x3uL',
  contract: 'tbl8nI9WVG9NgIrr',
  payment: 'tblWYUVXatvKzrAJ',
  cost: 'tblGhMvXsQHTUXgT',
  syncLedger: 'tbly6Mqp5gvtWS1V',
};

const tableEnv = {
  project: 'FEISHU_PROJECT_TABLE_ID',
  milestone: 'FEISHU_MILESTONE_TABLE_ID',
  task: 'FEISHU_TASK_TABLE_ID',
  risk: 'FEISHU_RISK_TABLE_ID',
  contract: 'FEISHU_CONTRACT_TABLE_ID',
  payment: 'FEISHU_PAYMENT_TABLE_ID',
  cost: 'FEISHU_COST_TABLE_ID',
  syncLedger: 'FEISHU_SYNC_LEDGER_TABLE_ID',
};

function env(name) {
  return process.env[name]?.trim() || '';
}

function requireRuntimeEnv() {
  const missing = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
}

function buildTableMapping() {
  const mapping = {};
  for (const [key, envName] of Object.entries(tableEnv)) {
    mapping[key] = env(envName) || defaultFeishuTables[key];
  }
  return mapping;
}

async function findAdminUser(supabase) {
  const email = env('ADMIN_EMAIL');
  const phone = env('ADMIN_PHONE');
  if (email || phone) {
    const clauses = [];
    if (email) clauses.push(`email.eq.${email}`);
    if (phone) clauses.push(`phone.eq.${phone}`);
    const { data, error } = await supabase
      .from('app_users')
      .select('id,email,phone,role,status')
      .or(clauses.join(','))
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  const { data, error } = await supabase
    .from('app_users')
    .select('id,email,phone,role,status')
    .eq('role', 'admin')
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function seedAiSettings(supabase, userId) {
  const { data: existing, error: readError } = await supabase
    .from('user_ai_settings')
    .select('api_key')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const apiKey = env('MINIMAX_API_KEY');
  if (!apiKey && !existing?.api_key) {
    return { configured: false, reason: 'missing_MINIMAX_API_KEY' };
  }

  const payload = {
    user_id: userId,
    provider: 'minimax',
    model: env('MINIMAX_MODEL') || 'MiniMax-M3',
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  if (apiKey) payload.api_key = apiKey;

  const { error } = await supabase
    .from('user_ai_settings')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  return { configured: true, provider: payload.provider, model: payload.model, api_key_source: apiKey ? 'env' : 'existing' };
}

async function seedFeishuConnection(supabase, userId) {
  const { data: existing, error: readError } = await supabase
    .from('user_feishu_connections')
    .select('app_id,app_secret,base_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) throw readError;

  const appId = env('FEISHU_APP_ID') || existing?.app_id || '';
  const appSecret = env('FEISHU_APP_SECRET') || existing?.app_secret || '';
  const baseToken = env('FEISHU_BASE_TOKEN') || existing?.base_token || defaultFeishuBaseToken;
  if (!appId || !appSecret || !baseToken) {
    return { configured: false, reason: 'missing_FEISHU_APP_ID_or_FEISHU_APP_SECRET' };
  }

  const tableMapping = buildTableMapping();
  const payload = {
    user_id: userId,
    app_id: appId,
    app_secret: appSecret,
    base_token: baseToken,
    table_mapping: tableMapping,
    connection_mode: 'personal_app',
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_feishu_connections')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw error;
  return { configured: true, table_keys: Object.keys(tableMapping) };
}

requireRuntimeEnv();

const supabase = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const admin = await findAdminUser(supabase);
if (!admin) {
  throw new Error('No active admin user found. Run npm run auth:seed-admin first.');
}

const ai = await seedAiSettings(supabase, admin.id);
const feishu = await seedFeishuConnection(supabase, admin.id);

console.log(JSON.stringify({
  status: 'completed',
  admin_user_id: admin.id,
  ai,
  feishu,
}, null, 2));
