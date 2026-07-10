-- AI PM System V5.8 P25 adoption, reliability and enterprise operations center.
-- Runtime APIs use the service role only after scoped business authorization.
-- No table stores SSO, storage, e-signature, Feishu or AI credentials.

create extension if not exists "uuid-ossp";

create table if not exists public.role_onboarding_states (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  assignment_id uuid not null references public.user_business_roles(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed','reset')),
  acknowledgements jsonb not null default '{}'::jsonb,
  checklist_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id,data_class)
);

create table if not exists public.pilot_programs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  idempotency_key text not null,
  name text not null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  status text not null default 'planned' check (status in ('planned','ready','running','paused','completed','cancelled')),
  target_roles jsonb not null default '[]'::jsonb,
  participant_user_ids jsonb not null default '[]'::jsonb,
  success_criteria jsonb not null default '[]'::jsonb,
  golden_chain_results jsonb not null default '[]'::jsonb,
  training_evidence jsonb not null default '[]'::jsonb,
  runbook_references jsonb not null default '[]'::jsonb,
  release_evidence jsonb not null default '[]'::jsonb,
  rollback_plan text not null,
  start_date date not null,
  target_end_date date not null,
  completed_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_end_date >= start_date)
);

create unique index if not exists idx_pilot_program_idempotency on public.pilot_programs(org_id,idempotency_key);

create table if not exists public.operational_metric_snapshots (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  idempotency_key text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  metrics jsonb not null,
  source_lineage jsonb not null,
  unavailable_metrics jsonb not null default '[]'::jsonb,
  captured_by uuid not null references public.app_users(id) on delete restrict,
  captured_at timestamptz not null default now(),
  check (window_end > window_start),
  unique (org_id,subject_scope,subject_id,data_class,window_end)
);

create table if not exists public.operational_incidents (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  incident_key text not null,
  title text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  source text not null check (source in ('feishu','supabase','ai_model','rag','application','security','other')),
  status text not null default 'detected' check (status in ('detected','triaged','mitigating','monitoring','resolved','closed')),
  impact text not null,
  user_visible_message text not null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  remediation text,
  recovery_action text not null,
  evidence jsonb not null default '[]'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,incident_key)
);

create table if not exists public.enterprise_capability_gates (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  capability_key text not null check (capability_key in ('sso','attachment_storage','electronic_signature','retention_policy','scheduled_archive','online_policy_publish')),
  provider text,
  status text not null default 'not_configured' check (status in ('not_configured','configured','tested','enabled','blocked','disabled')),
  config_summary jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  blocker text,
  last_tested_at timestamptz,
  enabled_at timestamptz,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('tested','enabled') or (jsonb_array_length(evidence) > 0 and last_tested_at is not null)),
  check (status <> 'enabled' or enabled_at is not null),
  unique (org_id,capability_key)
);

create table if not exists public.quarterly_value_reviews (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  pilot_program_id uuid references public.pilot_programs(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  idempotency_key text not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','submitted','accepted','rework')),
  metric_snapshot_id uuid references public.operational_metric_snapshots(id) on delete set null,
  value_evidence jsonb not null default '[]'::jsonb,
  conclusions text not null,
  threshold_changes jsonb not null default '[]'::jsonb,
  function_retirement_decisions jsonb not null default '[]'::jsonb,
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (org_id,data_class,period_start,period_end,pilot_program_id)
);

create index if not exists idx_role_onboarding_user on public.role_onboarding_states(user_id,org_id,data_class,status);
create index if not exists idx_pilot_program_org on public.pilot_programs(org_id,data_class,status,start_date);
create index if not exists idx_metric_snapshot_scope on public.operational_metric_snapshots(org_id,data_class,subject_scope,subject_id,captured_at desc);
create unique index if not exists idx_metric_snapshot_idempotency on public.operational_metric_snapshots(org_id,idempotency_key);
create index if not exists idx_operational_incident_inbox on public.operational_incidents(org_id,data_class,status,severity,detected_at desc);
create index if not exists idx_enterprise_gate_org on public.enterprise_capability_gates(org_id,status,capability_key);
create index if not exists idx_quarterly_value_review_period on public.quarterly_value_reviews(org_id,data_class,period_end desc,status);
create unique index if not exists idx_quarterly_value_review_idempotency on public.quarterly_value_reviews(org_id,idempotency_key);
create unique index if not exists idx_quarterly_value_review_dedup on public.quarterly_value_reviews(
  org_id,data_class,period_start,period_end,coalesce(pilot_program_id,'00000000-0000-0000-0000-000000000000'::uuid)
);

create or replace function public.enforce_p25_pilot_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_data_class text;
begin
  select org_id,data_class into v_org_id,v_data_class from public.projects where id=new.project_id;
  if v_org_id is null or v_org_id <> new.org_id or v_data_class <> new.data_class then
    raise exception 'P25_PILOT_PROJECT_SCOPE_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_p25_pilot_scope on public.pilot_programs;
create trigger trg_p25_pilot_scope before insert or update of org_id,project_id,data_class
on public.pilot_programs for each row execute function public.enforce_p25_pilot_scope();

alter table public.role_onboarding_states enable row level security;
alter table public.pilot_programs enable row level security;
alter table public.operational_metric_snapshots enable row level security;
alter table public.operational_incidents enable row level security;
alter table public.enterprise_capability_gates enable row level security;
alter table public.quarterly_value_reviews enable row level security;

revoke all on table public.role_onboarding_states,public.pilot_programs,public.operational_metric_snapshots,public.operational_incidents,public.enterprise_capability_gates,public.quarterly_value_reviews from public,anon,authenticated;
grant select,insert,update,delete on table public.role_onboarding_states,public.pilot_programs,public.operational_metric_snapshots,public.operational_incidents,public.enterprise_capability_gates,public.quarterly_value_reviews to service_role;
