-- AI PM System V5.3.4 Enterprise Security Migration
-- 用途：P9 权限、项目级授权、操作审计与管理员配置中心。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：这些表仅由服务端 service role 访问；前端不直接访问，也不存储明文密码/API Key。

create extension if not exists "uuid-ossp";

create table if not exists user_project_access_grants (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references app_users(id) on delete cascade,
  project_name text,
  project_code text,
  access_level text not null default 'viewer' check (access_level in ('viewer', 'editor', 'owner')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  grant_reason text,
  granted_by uuid references app_users(id),
  granted_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (coalesce(project_name, project_code) is not null)
);

create table if not exists operation_audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_id uuid references app_users(id) on delete set null,
  actor_name text not null,
  actor_role text not null default 'anonymous',
  action text not null,
  resource_type text not null,
  resource_id text,
  status text not null default 'succeeded' check (status in ('succeeded', 'failed', 'rejected', 'skipped')),
  severity text not null default 'low' check (severity in ('low', 'medium', 'high')),
  summary text not null,
  detail jsonb not null default '{}',
  request_id text,
  created_at timestamptz default now()
);

create table if not exists system_configurations (
  id uuid primary key default uuid_generate_v4(),
  config_key text not null unique,
  config_value jsonb not null default '{}',
  category text not null default 'security',
  description text,
  updated_by uuid references app_users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table user_project_access_grants enable row level security;
alter table operation_audit_logs enable row level security;
alter table system_configurations enable row level security;

-- These tables are intentionally service-role only.
-- Do not add public policies for these enterprise security tables.

create index if not exists idx_project_access_user on user_project_access_grants(user_id, status);
create index if not exists idx_project_access_project_name on user_project_access_grants(project_name);
create index if not exists idx_project_access_project_code on user_project_access_grants(project_code);
create index if not exists idx_operation_audit_actor on operation_audit_logs(actor_id, created_at desc);
create index if not exists idx_operation_audit_action on operation_audit_logs(action, created_at desc);
create index if not exists idx_operation_audit_request on operation_audit_logs(request_id);
create index if not exists idx_system_configurations_key on system_configurations(config_key);

insert into system_configurations (config_key, config_value, category, description)
values
  (
    'enterprise_security_policy',
    '{"auth_required":true,"default_user_project_scope":"owner_or_explicit_grant","audit_required_for_admin_actions":true,"secret_redaction":true}'::jsonb,
    'security',
    'P9 企业化安全策略：公网默认登录访问、普通用户按本人负责或显式授权查看项目、管理员动作写入审计。'
  )
on conflict (config_key) do nothing;
