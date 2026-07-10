-- AI PM System V5.2.2 User Configuration Migration
-- 用途：为每个登录用户保存个人 AI 模型配置和个人飞书接入配置。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：这些表仅通过 service role 访问，不创建 public policy；密钥由服务端 AES-256-GCM 加密，前端只显示末四位掩码。

create extension if not exists "uuid-ossp";

create table if not exists user_ai_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null default 'minimax',
  model text not null default 'MiniMax-M3',
  base_url text,
  api_key text,
  api_key_encrypted text,
  api_key_last4 text,
  credential_key_version smallint,
  enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id),
  check (not (api_key is not null and api_key_encrypted is not null))
);

create table if not exists user_feishu_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  app_id text,
  app_secret text,
  app_secret_encrypted text,
  app_secret_last4 text,
  app_secret_key_version smallint,
  base_token text,
  base_token_encrypted text,
  base_token_last4 text,
  base_token_key_version smallint,
  table_mapping jsonb not null default '{}',
  connection_mode text not null default 'web_app',
  status text not null default 'configured',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id),
  check (not (app_secret is not null and app_secret_encrypted is not null)),
  check (not (base_token is not null and base_token_encrypted is not null))
);

alter table user_ai_settings enable row level security;
alter table user_feishu_connections enable row level security;

-- These tables are intentionally service-role only.
-- Do not add public policies for user_ai_settings or user_feishu_connections.

create index if not exists idx_user_ai_settings_user on user_ai_settings(user_id);
create index if not exists idx_user_feishu_connections_user on user_feishu_connections(user_id);
