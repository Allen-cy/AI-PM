-- AI PM System V5.3.16 Migration Remediation Actions
-- 用途：保存迁移中心质量问题整改行动项，支持责任、截止日期、状态流转和关闭复检。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists migration_remediation_actions (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid references migration_trial_batches(id) on delete set null,
  batch_name text,
  object_name text not null,
  action_key text not null,
  title text not null,
  priority text not null check (priority in ('P0', 'P1', 'P2')),
  owner_role text not null,
  owner_name text,
  due_date date,
  status text not null default '待处理' check (status in ('待处理', '处理中', '待复检', '已关闭')),
  source_issue text not null,
  sample_refs jsonb not null default '[]'::jsonb,
  recommendation text not null,
  acceptance_criteria text not null,
  closure_note text,
  review_result text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  closed_at timestamptz
);

alter table migration_remediation_actions enable row level security;

-- 当前系统通过 Supabase service role 保存与读取迁移整改行动项；
-- 不开放匿名策略，避免公网用户直接读取迁移问题和整改记录。

create index if not exists idx_migration_remediation_actions_batch on migration_remediation_actions(batch_id);
create index if not exists idx_migration_remediation_actions_object on migration_remediation_actions(object_name);
create index if not exists idx_migration_remediation_actions_status on migration_remediation_actions(status);
create index if not exists idx_migration_remediation_actions_priority on migration_remediation_actions(priority);
create index if not exists idx_migration_remediation_actions_due_date on migration_remediation_actions(due_date);
create index if not exists idx_migration_remediation_actions_created_at on migration_remediation_actions(created_at desc);
