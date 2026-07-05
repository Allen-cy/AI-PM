-- AI PM System V5.3.44 Risk Retrospective Governance Operations
-- 用途：持久化知识治理运营快照与运营提醒日志，支持趋势历史和提醒闭环。
-- 前置：请先执行 supabase-v5338-risk-retrospective-governance-followups.sql。
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists public.risk_retrospective_governance_operation_snapshots (
  id uuid primary key default uuid_generate_v4(),
  snapshot_date date not null unique,
  snapshot_week_start date not null,
  total_count integer not null default 0,
  open_count integer not null default 0,
  closed_count integer not null default 0,
  overdue_open_count integer not null default 0,
  due_soon_open_count integer not null default 0,
  waiting_acceptance_count integer not null default 0,
  evidence_gap_count integer not null default 0,
  reminder_count integer not null default 0,
  p0_reminder_count integer not null default 0,
  evidence_completeness_rate numeric(6,2) not null default 0,
  report_facts text[] not null default '{}',
  report_markdown_sha256 text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.risk_retrospective_governance_reminder_logs (
  id uuid primary key default uuid_generate_v4(),
  reminder_key text not null unique,
  reminder_type text not null check (reminder_type in ('overdue', 'waiting_acceptance', 'evidence_gap', 'weekly_summary')),
  priority text not null check (priority in ('P0', 'P1', 'P2')),
  title text not null,
  asset_title text,
  owner_name text,
  due_date date,
  action_required text,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'processed', 'ignored', 'escalated', 'failed')),
  feishu_message_id text,
  feishu_receive_id_type text check (feishu_receive_id_type in ('chat_id', 'open_id')),
  feishu_receive_id_masked text,
  sent_at timestamptz,
  closed_at timestamptz,
  closure_note text,
  error text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.risk_retrospective_governance_operation_snapshots enable row level security;
alter table public.risk_retrospective_governance_reminder_logs enable row level security;

-- 当前系统通过 Supabase service role 保存与读取运营快照和提醒日志；
-- 不开放匿名策略，避免公网用户直接读取知识治理运营信息。

create index if not exists idx_risk_retro_gov_ops_snapshots_date
  on public.risk_retrospective_governance_operation_snapshots(snapshot_date desc);
create index if not exists idx_risk_retro_gov_ops_snapshots_week
  on public.risk_retrospective_governance_operation_snapshots(snapshot_week_start desc);

create index if not exists idx_risk_retro_gov_reminder_logs_status
  on public.risk_retrospective_governance_reminder_logs(status);
create index if not exists idx_risk_retro_gov_reminder_logs_type
  on public.risk_retrospective_governance_reminder_logs(reminder_type);
create index if not exists idx_risk_retro_gov_reminder_logs_owner
  on public.risk_retrospective_governance_reminder_logs(owner_name);
create index if not exists idx_risk_retro_gov_reminder_logs_created_at
  on public.risk_retrospective_governance_reminder_logs(created_at desc);

comment on table public.risk_retrospective_governance_operation_snapshots is
  '知识治理运营快照：保存每日/每周知识治理待办运营口径，避免趋势只依赖当前状态回算。';
comment on table public.risk_retrospective_governance_reminder_logs is
  '知识治理运营提醒日志：保存飞书提醒发送结果与后续处理状态，支持提醒闭环。';
