-- AI PM System V5.3.13 Migration Trial Batches
-- 用途：保存迁移中心试迁移分析批次，用于历史追踪、复盘和正式迁移前评审。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists migration_trial_batches (
  id uuid primary key default uuid_generate_v4(),
  batch_name text not null,
  object_name text not null,
  file_name text,
  total_rows integer not null default 0,
  field_coverage_rate integer not null default 0,
  missing_required_fields integer not null default 0,
  quality_issue_count integer not null default 0,
  high_issue_count integer not null default 0,
  can_trial_import boolean not null default false,
  analysis jsonb not null default '{}'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table migration_trial_batches enable row level security;

-- 当前系统通过 Supabase service role 保存与读取迁移批次；
-- 不开放匿名策略，避免公网用户直接读取迁移历史、字段映射或样本问题。

create index if not exists idx_migration_trial_batches_created_at on migration_trial_batches(created_at desc);
create index if not exists idx_migration_trial_batches_object_name on migration_trial_batches(object_name);
create index if not exists idx_migration_trial_batches_created_by on migration_trial_batches(created_by);
create index if not exists idx_migration_trial_batches_can_trial_import on migration_trial_batches(can_trial_import);
