-- AI PM System V5.2.1 Risk Management Migration
-- 用途：把旧版 risks 表升级为“风险登记册 + 工作流状态 + 责任人/deadline + 状态变更审计”。
-- 执行位置：Supabase SQL Editor。

create extension if not exists "uuid-ossp";

alter table risks drop constraint if exists risks_category_check;
alter table risks drop constraint if exists risks_status_check;
alter table risks drop constraint if exists risks_urgency_check;

alter table risks add column if not exists risk_code text;
alter table risks add column if not exists project_name text;
alter table risks add column if not exists stage text;
alter table risks add column if not exists source text;
alter table risks add column if not exists impact_area text;
alter table risks add column if not exists urgency integer default 3;
alter table risks add column if not exists priority_score integer generated always as (probability * impact * urgency) stored;
alter table risks add column if not exists response_strategy_type text;
alter table risks add column if not exists preventive_action text;
alter table risks add column if not exists contingency_plan text;
alter table risks add column if not exists trigger_condition text;
alter table risks add column if not exists tracking_method text;
alter table risks add column if not exists due_date date;
alter table risks add column if not exists next_review_date date;
alter table risks add column if not exists closing_criteria text;
alter table risks add column if not exists linked_module text;
alter table risks add column if not exists evidence text;
alter table risks add column if not exists workflow_step text;
alter table risks add column if not exists current_input text;
alter table risks add column if not exists current_output text;
alter table risks add column if not exists last_action text;
alter table risks add column if not exists action_owner text;
alter table risks add column if not exists action_deadline date;

alter table risks
  add constraint risks_urgency_check check (urgency between 1 and 5) not valid;
alter table risks
  add constraint risks_status_check check (
    status in (
      'identified',
      'analyzing',
      'response-planned',
      'response-implementing',
      'monitoring',
      'tracking',
      'resolved',
      'closed'
    )
  ) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'risks_risk_code_key'
      and conrelid = 'risks'::regclass
  ) then
    alter table risks add constraint risks_risk_code_key unique (risk_code);
  end if;
end $$;

create table if not exists risk_workflow_events (
  id uuid primary key default uuid_generate_v4(),
  risk_id uuid references risks(id) on delete cascade,
  risk_code text,
  workflow_step text not null,
  from_status text,
  to_status text not null,
  input_summary text,
  output_summary text,
  action_required text,
  owner text,
  deadline date,
  evidence text,
  actor text,
  created_at timestamptz default now()
);

alter table risk_workflow_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'risk_workflow_events'
      and policyname = 'Public read'
  ) then
    create policy "Public read" on risk_workflow_events for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'risk_workflow_events'
      and policyname = 'Public insert'
  ) then
    create policy "Public insert" on risk_workflow_events for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'risk_workflow_events'
      and policyname = 'Public update'
  ) then
    create policy "Public update" on risk_workflow_events for update using (true);
  end if;
end $$;

create index if not exists idx_risks_code on risks(risk_code);
create index if not exists idx_risks_due_date on risks(due_date);
create index if not exists idx_risks_next_review on risks(next_review_date);
create index if not exists idx_risk_workflow_events_risk on risk_workflow_events(risk_id);
create index if not exists idx_risk_workflow_events_created on risk_workflow_events(created_at);
