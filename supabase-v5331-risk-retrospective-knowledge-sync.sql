-- V5.3.31 风险复盘资产知识库导出审计
-- 用途：记录已发布风险复盘资产导出为 AI-PMO-SYS Markdown 知识页的操作日志。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：请先执行 supabase-v5330-risk-retrospective-assets.sql。

create table if not exists risk_retrospective_asset_sync_logs (
  id uuid primary key default gen_random_uuid(),
  asset_ids text[] not null default '{}',
  asset_count integer not null default 0,
  target_space text not null default 'AI-PMO-SYS',
  target_path text not null,
  export_status text not null default 'exported' check (export_status in ('exported', 'failed')),
  markdown_title text not null,
  markdown_sha256 text,
  warning text,
  exported_by uuid references app_users(id),
  exported_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_retrospective_asset_sync_logs_created_at
  on risk_retrospective_asset_sync_logs(created_at desc);

create index if not exists idx_risk_retrospective_asset_sync_logs_asset_ids
  on risk_retrospective_asset_sync_logs using gin(asset_ids);
