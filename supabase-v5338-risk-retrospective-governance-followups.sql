-- AI PM System V5.3.38 Risk Retrospective Governance Followups
-- 用途：持久化风险复盘资产二次治理待办，并支持显式确认后的飞书任务同步状态回填。
-- 前置：请先执行 supabase-v5334-risk-retrospective-governance.sql。
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists public.risk_retrospective_governance_followups (
  id uuid primary key default uuid_generate_v4(),
  action_key text not null unique,
  source_log_id uuid references public.risk_retrospective_asset_governance_logs(id) on delete set null,
  asset_title text not null,
  reason text not null,
  action_required text not null,
  owner_name text not null,
  due_date date not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  status text not null default '待复核' check (status in ('待复核', '处理中', '待验收', '已关闭')),
  closing_criteria text not null,
  reminder_text text not null,
  closure_note text,
  review_result text,
  feishu_sync_status text not null default '未同步'
    check (feishu_sync_status in ('未同步', '待确认', '同步中', '已同步', '同步失败')),
  feishu_task_guid text,
  feishu_task_url text,
  feishu_sync_error text,
  feishu_synced_at timestamptz,
  feishu_sync_request_id text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

alter table public.risk_retrospective_governance_followups enable row level security;

-- 当前系统通过 Supabase service role 保存与读取二次治理待办；
-- 不开放匿名策略，避免公网用户直接读取知识治理审计信息。

create index if not exists idx_risk_retrospective_governance_followups_source_log
  on public.risk_retrospective_governance_followups(source_log_id);
create index if not exists idx_risk_retrospective_governance_followups_status
  on public.risk_retrospective_governance_followups(status);
create index if not exists idx_risk_retrospective_governance_followups_priority
  on public.risk_retrospective_governance_followups(priority);
create index if not exists idx_risk_retrospective_governance_followups_due_date
  on public.risk_retrospective_governance_followups(due_date);
create index if not exists idx_risk_retrospective_governance_followups_feishu_sync_status
  on public.risk_retrospective_governance_followups(feishu_sync_status);
create index if not exists idx_risk_retrospective_governance_followups_created_at
  on public.risk_retrospective_governance_followups(created_at desc);

comment on table public.risk_retrospective_governance_followups is
  '风险复盘资产二次治理待办：由低效果治理动作派生，经用户显式确认后持久化。';
comment on column public.risk_retrospective_governance_followups.action_key is
  '派生待办的稳定业务键，用于避免重复保存同一治理动作的二次治理待办。';
comment on column public.risk_retrospective_governance_followups.feishu_sync_status is
  '飞书任务同步状态：未同步、待确认、同步中、已同步、同步失败。';
