-- V5.3.30 风险复盘资产持久化与 RAG 发布
-- 用途：将已关闭风险的复盘知识卡保存为组织过程资产，并支持 reviewed/published/archived 状态管理。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：建议先执行 supabase-risk-v521.sql，确保风险登记册和风险工作流事件可用。

create table if not exists risk_retrospective_assets (
  id uuid primary key default gen_random_uuid(),
  asset_key text not null unique,
  source_risk_id text not null,
  source_risk_code text,
  project_name text not null,
  title text not null,
  risk_description text not null,
  category text,
  impact_area text,
  severity text not null default 'medium' check (severity in ('high', 'medium', 'low')),
  trigger text,
  effective_response text,
  closing_evidence text,
  review_opinion text,
  lesson_learned text,
  early_warning_rule text,
  reusable_practice text,
  tags text[] not null default '{}',
  status text not null default 'reviewed' check (status in ('draft', 'reviewed', 'published', 'archived')),
  applicability text,
  version integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id),
  created_by_name text,
  confirmed_by uuid references app_users(id),
  confirmed_by_name text,
  confirmed_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_risk_retrospective_assets_status on risk_retrospective_assets(status);
create index if not exists idx_risk_retrospective_assets_source_risk on risk_retrospective_assets(source_risk_id);
create index if not exists idx_risk_retrospective_assets_project on risk_retrospective_assets(project_name);
create index if not exists idx_risk_retrospective_assets_tags on risk_retrospective_assets using gin(tags);
create index if not exists idx_risk_retrospective_assets_metadata on risk_retrospective_assets using gin(metadata);

create or replace function update_risk_retrospective_assets_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_risk_retrospective_assets_updated_at on risk_retrospective_assets;
create trigger trg_risk_retrospective_assets_updated_at
  before update on risk_retrospective_assets
  for each row
  execute function update_risk_retrospective_assets_updated_at();
