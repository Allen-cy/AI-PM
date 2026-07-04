-- V5.3.34 风险复盘资产编辑、合并与治理动作审计
-- 用途：记录复盘资产补充、合并、撤回、恢复等人工治理动作。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：请先执行 supabase-v5330-risk-retrospective-assets.sql。

create table if not exists risk_retrospective_asset_governance_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references risk_retrospective_assets(id) on delete set null,
  target_asset_id uuid references risk_retrospective_assets(id) on delete set null,
  action text not null check (action in ('edit', 'merge', 'archive', 'review', 'publish')),
  action_summary text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  performed_by uuid references app_users(id),
  performed_by_name text,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_retrospective_asset_governance_logs_asset_id
  on risk_retrospective_asset_governance_logs(asset_id);

create index if not exists idx_risk_retrospective_asset_governance_logs_target_asset_id
  on risk_retrospective_asset_governance_logs(target_asset_id);

create index if not exists idx_risk_retrospective_asset_governance_logs_created_at
  on risk_retrospective_asset_governance_logs(created_at desc);
