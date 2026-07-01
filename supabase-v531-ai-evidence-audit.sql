-- AI PM System V5.3.1 AI Evidence Audit Migration
-- 用途：为 P6「AI 依据与审计」保存 AI 输出依据、输入摘要、输出摘要、建议动作和审计记录。
-- 执行位置：Supabase SQL Editor。

create extension if not exists "uuid-ossp";

create table if not exists ai_evidence_audits (
  id uuid primary key default uuid_generate_v4(),
  scene text not null,
  title text not null,
  model text not null,
  status text not null default 'generated' check (status in ('generated', 'fallback', 'failed')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  input_summary text,
  output_summary text,
  basis jsonb default '[]'::jsonb,
  citations jsonb default '[]'::jsonb,
  source_refs jsonb default '[]'::jsonb,
  suggested_actions jsonb default '[]'::jsonb,
  request_id text,
  created_by uuid references app_users(id) on delete set null,
  created_by_name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table ai_evidence_audits enable row level security;

-- 当前应用通过服务端 Supabase service role 读写 AI 证据审计；
-- 不开放匿名策略，避免外部用户直接读取项目输入、模型输出和建议动作。

create index if not exists idx_ai_evidence_audits_scene on ai_evidence_audits(scene, created_at desc);
create index if not exists idx_ai_evidence_audits_created_by on ai_evidence_audits(created_by);
create index if not exists idx_ai_evidence_audits_request_id on ai_evidence_audits(request_id);
create index if not exists idx_ai_evidence_audits_created_at on ai_evidence_audits(created_at desc);
