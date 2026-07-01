-- AI PM System V5.2.7 Integration Sync Logs Migration
-- 用途：为 P2「数据与集成中心」保存飞书、RAG、AI模型、数据质量检查等诊断日志。
-- 执行位置：Supabase SQL Editor。

create extension if not exists "uuid-ossp";

create table if not exists integration_sync_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references app_users(id) on delete set null,
  source text not null check (source in ('feishu', 'supabase', 'ai_model', 'rag', 'system')),
  event_type text not null,
  status text not null check (status in ('succeeded', 'warning', 'failed', 'skipped')),
  severity text not null check (severity in ('high', 'medium', 'low')),
  summary text not null,
  detail jsonb default '{}'::jsonb,
  remediation text,
  request_id text,
  created_at timestamptz default now()
);

alter table integration_sync_logs enable row level security;

-- 当前系统通过 Supabase service role 写入与读取该审计表；
-- 不开放匿名策略，避免外部用户直接读取集成诊断历史。

create index if not exists idx_integration_sync_logs_created_at on integration_sync_logs(created_at desc);
create index if not exists idx_integration_sync_logs_user_id on integration_sync_logs(user_id);
create index if not exists idx_integration_sync_logs_source on integration_sync_logs(source);
create index if not exists idx_integration_sync_logs_status on integration_sync_logs(status);
create index if not exists idx_integration_sync_logs_request_id on integration_sync_logs(request_id);
