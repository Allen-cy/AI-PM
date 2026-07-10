-- AI PM System V5.7 P23 role-scoped AI assistant, recommendations and evaluation.

create table if not exists public.ai_assistant_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  scenario text not null,
  prompt_version text not null,
  knowledge_version text,
  rule_versions jsonb not null default '[]'::jsonb,
  input_snapshot jsonb not null,
  allowed_evidence_ids jsonb not null,
  model_provider text,
  model_name text,
  status text not null check (status in ('running','succeeded','failed','rejected')),
  output jsonb,
  error_class text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_recommendations (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.ai_assistant_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  recommendation_type text not null check (recommendation_type in ('action','risk','issue','change','governance','decision_brief','report','feishu_draft')),
  title text not null,
  reason text not null,
  proposed_payload jsonb not null,
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','accepted','rejected','materialized','executed','expired')),
  confirmed_by uuid references public.app_users(id) on delete set null,
  confirmed_at timestamptz,
  rejection_reason text,
  executed_resource_type text,
  executed_resource_id text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_assistant_evaluations (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.ai_assistant_runs(id) on delete cascade,
  recommendation_id uuid references public.ai_recommendations(id) on delete cascade,
  evaluator_user_id uuid not null references public.app_users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  rating integer check (rating between 1 and 5),
  verdict text not null check (verdict in ('accurate','partially_accurate','false_positive','missed_issue','unsafe','useful','not_useful')),
  correction text,
  adopted boolean,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_runs_context on public.ai_assistant_runs(actor_user_id,org_id,subject_scope,subject_id,created_at desc);
create index if not exists idx_ai_recommendation_inbox on public.ai_recommendations(actor_user_id,business_role,org_id,subject_scope,subject_id,data_class,status,created_at desc);
create index if not exists idx_ai_evaluation_run on public.ai_assistant_evaluations(run_id,created_at desc);
alter table public.ai_assistant_runs enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_assistant_evaluations enable row level security;
revoke all on table public.ai_assistant_runs,public.ai_recommendations,public.ai_assistant_evaluations from public,anon,authenticated;
grant select,insert,update,delete on table public.ai_assistant_runs,public.ai_recommendations,public.ai_assistant_evaluations to service_role;
