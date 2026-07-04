-- V5.3.32 风险复盘资产知识价值度量与去重发布
-- 用途：记录风险复盘资产被 RAG 真正引用的次数、最后引用时间、最近导出哈希，并为重复发布/导出检测提供审计依据。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：请先执行 supabase-v5330-risk-retrospective-assets.sql 和 supabase-v5331-risk-retrospective-knowledge-sync.sql。

alter table risk_retrospective_assets
  add column if not exists rag_reference_count integer not null default 0,
  add column if not exists last_rag_referenced_at timestamptz,
  add column if not exists last_exported_at timestamptz,
  add column if not exists last_export_sha256 text;

create table if not exists risk_retrospective_asset_usage_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references risk_retrospective_assets(id) on delete set null,
  asset_key text,
  page_id text not null,
  title text not null,
  query text not null,
  trace_id text,
  relevance numeric,
  excerpt text,
  referenced_by uuid references app_users(id),
  referenced_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_retrospective_asset_usage_logs_asset_id
  on risk_retrospective_asset_usage_logs(asset_id);

create index if not exists idx_risk_retrospective_asset_usage_logs_created_at
  on risk_retrospective_asset_usage_logs(created_at desc);

create index if not exists idx_risk_retrospective_assets_rag_reference_count
  on risk_retrospective_assets(rag_reference_count desc);

create index if not exists idx_risk_retrospective_assets_last_export_sha256
  on risk_retrospective_assets(last_export_sha256);
