-- AI PM System V5.3.49 Feishu Action Confirmation Queue
-- 用途：把通用飞书写入动作从 token 直写升级为“先预览、入队、用户确认、再执行”的可审计队列。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：payload/preview 只保存动作参数和预览，不保存飞书 App Secret、API Key 或用户密码。

create extension if not exists "uuid-ossp";

create table if not exists feishu_action_confirmations (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid references app_users(id) on delete set null,
  requester_name text,
  requester_email text,
  source text not null default 'system' check (source in ('api_token', 'user_center', 'integration_center', 'system')),
  source_page text,
  action_type text not null check (action_type in ('message', 'task', 'calendar', 'document')),
  idempotency_key text not null,
  target_summary text not null,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'writing', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  resource jsonb,
  error_code text,
  cancel_reason text,
  request_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz
);

alter table feishu_action_confirmations enable row level security;

-- 当前系统通过服务端 service role 访问该表；不开放匿名策略。
-- 普通用户访问由服务端接口按 requester_id 和角色过滤。

create index if not exists idx_feishu_action_confirmations_requester
  on feishu_action_confirmations(requester_id, created_at desc);

create index if not exists idx_feishu_action_confirmations_status
  on feishu_action_confirmations(status, created_at desc);

create index if not exists idx_feishu_action_confirmations_action_type
  on feishu_action_confirmations(action_type, created_at desc);

create index if not exists idx_feishu_action_confirmations_idempotency
  on feishu_action_confirmations(idempotency_key);

create index if not exists idx_feishu_action_confirmations_request_id
  on feishu_action_confirmations(request_id);
