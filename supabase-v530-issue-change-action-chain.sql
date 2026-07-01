-- AI PM System V5.3.0 Issue-Change-Action Chain Migration
-- 用途：为 P5「风险-问题-变更-行动项链路」创建问题、变更、统一行动项和审计事件表。
-- 执行位置：Supabase SQL Editor。

create extension if not exists "uuid-ossp";

create table if not exists project_issues (
  id uuid primary key default uuid_generate_v4(),
  issue_code text unique,
  project_name text not null,
  source_risk_id uuid references risks(id) on delete set null,
  source_risk_code text,
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'analyzing', 'change-required', 'resolving', 'resolved', 'closed')),
  owner text,
  due_date date,
  impact_scope text,
  evidence text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists project_changes (
  id uuid primary key default uuid_generate_v4(),
  change_code text unique,
  issue_id uuid references project_issues(id) on delete set null,
  project_name text not null,
  title text not null,
  reason text,
  change_type text not null default 'scope' check (change_type in ('scope', 'schedule', 'cost', 'quality', 'contract', 'collection', 'resource', 'other')),
  impact_scope text,
  impact_cost numeric,
  impact_schedule_days integer,
  impact_revenue numeric,
  impact_collection text,
  status text not null default 'proposed' check (status in ('proposed', 'analyzing', 'approved', 'rejected', 'implementing', 'implemented', 'closed')),
  owner text,
  approver text,
  due_date date,
  decision_summary text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists unified_action_items (
  id uuid primary key default uuid_generate_v4(),
  source_type text not null default 'manual' check (source_type in ('risk', 'issue', 'change', 'governance', 'manual')),
  source_id text,
  project_name text,
  title text not null,
  owner text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled', 'overdue')),
  priority text not null default 'P1' check (priority in ('P0', 'P1', 'P2')),
  close_evidence text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists issue_change_events (
  id uuid primary key default uuid_generate_v4(),
  subject_type text not null check (subject_type in ('issue', 'change', 'action')),
  subject_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_id uuid references app_users(id) on delete set null,
  actor_name text,
  comment text,
  evidence text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table project_issues enable row level security;
alter table project_changes enable row level security;
alter table unified_action_items enable row level security;
alter table issue_change_events enable row level security;

-- 当前应用通过服务端 Supabase service role 读写 P5 链路表；
-- 不开放匿名策略，避免公网用户绕过应用权限读取项目事务数据。

create index if not exists idx_project_issues_project on project_issues(project_name);
create index if not exists idx_project_issues_status on project_issues(status);
create index if not exists idx_project_issues_owner on project_issues(owner);
create index if not exists idx_project_issues_risk on project_issues(source_risk_id, source_risk_code);
create index if not exists idx_project_issues_updated_at on project_issues(updated_at desc);

create index if not exists idx_project_changes_issue on project_changes(issue_id);
create index if not exists idx_project_changes_project on project_changes(project_name);
create index if not exists idx_project_changes_status on project_changes(status);
create index if not exists idx_project_changes_updated_at on project_changes(updated_at desc);

create index if not exists idx_unified_action_source on unified_action_items(source_type, source_id);
create index if not exists idx_unified_action_status on unified_action_items(status);
create index if not exists idx_unified_action_due_date on unified_action_items(due_date);
create index if not exists idx_unified_action_owner on unified_action_items(owner);

create index if not exists idx_issue_change_events_subject on issue_change_events(subject_type, subject_id, created_at);
create index if not exists idx_issue_change_events_created_at on issue_change_events(created_at desc);
