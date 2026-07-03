-- AI PM System V5.3.18 Migration Field Mapping Profiles
-- 用途：保存迁移中心字段映射方案，支持同类迁移包复用和差异提示。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists migration_field_mapping_profiles (
  id uuid primary key default uuid_generate_v4(),
  profile_name text not null,
  object_name text not null,
  mappings jsonb not null default '[]'::jsonb,
  source_fields jsonb not null default '[]'::jsonb,
  required_fields jsonb not null default '[]'::jsonb,
  field_coverage_rate integer not null default 0,
  matched_field_count integer not null default 0,
  missing_field_count integer not null default 0,
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table migration_field_mapping_profiles enable row level security;

-- 当前系统通过 Supabase service role 保存与读取字段映射方案；
-- 不开放匿名策略，避免公网用户直接读取迁移口径、字段结构或历史来源字段。

create index if not exists idx_migration_field_mapping_profiles_object
  on migration_field_mapping_profiles(object_name);

create index if not exists idx_migration_field_mapping_profiles_created_at
  on migration_field_mapping_profiles(created_at desc);

create index if not exists idx_migration_field_mapping_profiles_created_by
  on migration_field_mapping_profiles(created_by);

create index if not exists idx_migration_field_mapping_profiles_coverage
  on migration_field_mapping_profiles(field_coverage_rate desc);

comment on table migration_field_mapping_profiles is
  'AI-PMO 迁移中心字段映射方案库，用于保存、复用和审计字段口径。';
comment on column migration_field_mapping_profiles.mappings is
  '字段映射明细：目标中文字段、来源字段、匹配状态和说明。';
comment on column migration_field_mapping_profiles.source_fields is
  '当前迁移文件中的原始来源字段清单，用于后续复用差异检查。';
