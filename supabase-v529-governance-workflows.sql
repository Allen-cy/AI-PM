-- AI PM System V5.2.9 Governance Workflows Migration
-- 用途：为 P4「治理流程持久化」创建流程实例、状态流转审计和行动项表。
-- 执行位置：Supabase SQL Editor。

create extension if not exists "uuid-ossp";

create table if not exists governance_process_instances (
  id uuid primary key default uuid_generate_v4(),
  workflow_id text not null,
  workflow_name text not null,
  stage text not null,
  project_id text,
  project_name text not null,
  title text not null,
  trigger_summary text,
  input_summary text,
  output_summary text,
  owner text not null,
  approver text not null,
  state text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  deadline date,
  source text not null default 'ai-pmo',
  feishu_record_id text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists governance_process_events (
  id uuid primary key default uuid_generate_v4(),
  instance_id uuid references governance_process_instances(id) on delete cascade,
  event_type text not null,
  from_state text,
  to_state text not null,
  comment text,
  actor_id uuid references app_users(id) on delete set null,
  actor_name text,
  actor_role text,
  decision text,
  outputs jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists governance_process_actions (
  id uuid primary key default uuid_generate_v4(),
  instance_id uuid references governance_process_instances(id) on delete cascade,
  title text not null,
  owner text,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled', 'overdue')),
  source_event_id uuid references governance_process_events(id) on delete set null,
  close_evidence text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table governance_process_instances enable row level security;
alter table governance_process_events enable row level security;
alter table governance_process_actions enable row level security;

-- 当前应用通过服务端 Supabase service role 读写治理表；
-- 不开放匿名策略，避免公网用户绕过应用权限读取治理流程。

create index if not exists idx_governance_instances_updated_at on governance_process_instances(updated_at desc);
create index if not exists idx_governance_instances_state on governance_process_instances(state);
create index if not exists idx_governance_instances_workflow on governance_process_instances(workflow_id);
create index if not exists idx_governance_instances_created_by on governance_process_instances(created_by);
create index if not exists idx_governance_events_instance on governance_process_events(instance_id, created_at);
create index if not exists idx_governance_actions_instance on governance_process_actions(instance_id, status);
