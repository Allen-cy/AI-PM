-- AI PM System V5.3.47 Knowledge Governance Evidence Chain
-- 用途：串联风险复盘二次治理待办、知识治理运营提醒、统一行动项、治理流程实例和关闭反写证据。
-- 前置：
--   1. supabase-v529-governance-workflows.sql
--   2. supabase-v530-issue-change-action-chain.sql
--   3. supabase-v5338-risk-retrospective-governance-followups.sql
--   4. supabase-v5344-risk-retrospective-governance-operations.sql
-- 安全说明：该表仅通过服务端 service role 读写；前端接口不会直接暴露 Supabase Key。

create extension if not exists "uuid-ossp";

create table if not exists public.risk_retrospective_governance_evidence_links (
  id uuid primary key default uuid_generate_v4(),
  source_followup_id uuid references public.risk_retrospective_governance_followups(id) on delete set null,
  reminder_log_id uuid references public.risk_retrospective_governance_reminder_logs(id) on delete set null,
  unified_action_id uuid references public.unified_action_items(id) on delete set null,
  governance_instance_id uuid not null references public.governance_process_instances(id) on delete cascade,
  link_type text not null default 'knowledge_governance_escalation'
    check (link_type in ('knowledge_governance_escalation')),
  status text not null default 'active'
    check (status in ('active', 'pending_review', 'applied', 'rejected')),
  closure_recommendation text,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewer_name text,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  review_note text,
  applied_at timestamptz,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (governance_instance_id, source_followup_id)
);

alter table public.risk_retrospective_governance_evidence_links enable row level security;

-- 当前系统通过 Supabase service role 保存与读取证据链；
-- 不开放匿名策略，避免公网用户直接读取治理证据链。

create index if not exists idx_risk_retro_gov_evidence_links_followup
  on public.risk_retrospective_governance_evidence_links(source_followup_id);
create index if not exists idx_risk_retro_gov_evidence_links_reminder
  on public.risk_retrospective_governance_evidence_links(reminder_log_id);
create index if not exists idx_risk_retro_gov_evidence_links_instance
  on public.risk_retrospective_governance_evidence_links(governance_instance_id);
create index if not exists idx_risk_retro_gov_evidence_links_status
  on public.risk_retrospective_governance_evidence_links(status, review_status);
create index if not exists idx_risk_retro_gov_evidence_links_updated_at
  on public.risk_retrospective_governance_evidence_links(updated_at desc);

comment on table public.risk_retrospective_governance_evidence_links is
  '知识治理证据链：连接二次治理待办、运营提醒、统一行动项、治理流程实例与关闭反写证据。';
