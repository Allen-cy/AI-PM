-- P23 scope hardening for installations that already ran the initial P23 migration.
-- Recommendations and evaluations inherit the complete run context. Execution attempts
-- are auditable and unsupported recommendation types fail closed.

alter table public.ai_recommendations
  add column if not exists actor_user_id uuid references public.app_users(id) on delete cascade,
  add column if not exists business_role text,
  add column if not exists data_class text;

update public.ai_recommendations recommendation
set actor_user_id = run.actor_user_id,
    business_role = run.business_role,
    data_class = run.data_class
from public.ai_assistant_runs run
where recommendation.run_id = run.id
  and (recommendation.actor_user_id is null or recommendation.business_role is null or recommendation.data_class is null);

do $$
begin
  if exists (select 1 from public.ai_recommendations where actor_user_id is null or business_role is null or data_class is null) then
    raise exception 'P23 hardening blocked: ai_recommendations contains rows without a valid parent run';
  end if;
end $$;

alter table public.ai_recommendations
  alter column actor_user_id set not null,
  alter column business_role set not null,
  alter column data_class set not null;

alter table public.ai_recommendations drop constraint if exists ai_recommendations_business_role_check;
alter table public.ai_recommendations add constraint ai_recommendations_business_role_check
  check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality'));
alter table public.ai_recommendations drop constraint if exists ai_recommendations_data_class_check;
alter table public.ai_recommendations add constraint ai_recommendations_data_class_check
  check (data_class in ('production','sample','test','diagnostic','unclassified'));
alter table public.ai_recommendations drop constraint if exists ai_recommendations_status_check;
alter table public.ai_recommendations add constraint ai_recommendations_status_check
  check (status in ('pending_confirmation','accepted','rejected','materialized','executed','expired'));

alter table public.ai_assistant_evaluations
  add column if not exists org_id uuid references public.organizations(id) on delete cascade,
  add column if not exists business_role text,
  add column if not exists subject_scope text,
  add column if not exists subject_id text,
  add column if not exists data_class text;

update public.ai_assistant_evaluations evaluation
set org_id = run.org_id,
    business_role = run.business_role,
    subject_scope = run.subject_scope,
    subject_id = run.subject_id,
    data_class = run.data_class
from public.ai_assistant_runs run
where evaluation.run_id = run.id
  and (evaluation.org_id is null or evaluation.business_role is null or evaluation.subject_scope is null or evaluation.subject_id is null or evaluation.data_class is null);

do $$
begin
  if exists (select 1 from public.ai_assistant_evaluations where org_id is null or business_role is null or subject_scope is null or subject_id is null or data_class is null) then
    raise exception 'P23 hardening blocked: ai_assistant_evaluations contains rows without a valid parent run';
  end if;
end $$;

alter table public.ai_assistant_evaluations
  alter column org_id set not null,
  alter column business_role set not null,
  alter column subject_scope set not null,
  alter column subject_id set not null,
  alter column data_class set not null;
alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_business_role_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_business_role_check
  check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality'));
alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_data_class_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_data_class_check
  check (data_class in ('production','sample','test','diagnostic','unclassified'));

create table if not exists public.ai_recommendation_execution_attempts (
  id uuid primary key default uuid_generate_v4(),
  recommendation_id uuid not null references public.ai_recommendations(id) on delete cascade,
  run_id uuid not null references public.ai_assistant_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  recommendation_type text not null,
  request_id text not null,
  confirmation_received boolean not null default false,
  status text not null check (status in ('requested','materialized','unsupported','failed')),
  resource_type text,
  resource_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (recommendation_id,request_id)
);

create or replace function public.enforce_ai_recommendation_run_context()
returns trigger language plpgsql as $$
declare parent public.ai_assistant_runs;
begin
  select * into parent from public.ai_assistant_runs where id = new.run_id;
  if parent.id is null then raise exception 'AI assistant run not found'; end if;
  if new.org_id is distinct from parent.org_id
    or new.actor_user_id is distinct from parent.actor_user_id
    or new.business_role is distinct from parent.business_role
    or new.subject_scope is distinct from parent.subject_scope
    or new.subject_id is distinct from parent.subject_id
    or new.data_class is distinct from parent.data_class then
    raise exception 'AI recommendation context does not match its run';
  end if;
  return new;
end $$;

drop trigger if exists trg_ai_recommendation_run_context on public.ai_recommendations;
create trigger trg_ai_recommendation_run_context
before insert or update of run_id,org_id,actor_user_id,business_role,subject_scope,subject_id,data_class
on public.ai_recommendations for each row execute function public.enforce_ai_recommendation_run_context();

create or replace function public.enforce_ai_evaluation_run_context()
returns trigger language plpgsql as $$
declare
  parent public.ai_assistant_runs;
  recommendation_run_id uuid;
begin
  select * into parent from public.ai_assistant_runs where id = new.run_id;
  if parent.id is null then raise exception 'AI assistant run not found'; end if;
  if new.evaluator_user_id is distinct from parent.actor_user_id
    or new.org_id is distinct from parent.org_id
    or new.business_role is distinct from parent.business_role
    or new.subject_scope is distinct from parent.subject_scope
    or new.subject_id is distinct from parent.subject_id
    or new.data_class is distinct from parent.data_class then
    raise exception 'AI evaluation context does not match its run';
  end if;
  if new.recommendation_id is not null then
    select run_id into recommendation_run_id from public.ai_recommendations where id = new.recommendation_id;
    if recommendation_run_id is distinct from new.run_id then raise exception 'AI evaluation recommendation does not belong to its run'; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_ai_evaluation_run_context on public.ai_assistant_evaluations;
create trigger trg_ai_evaluation_run_context
before insert or update of run_id,recommendation_id,evaluator_user_id,org_id,business_role,subject_scope,subject_id,data_class
on public.ai_assistant_evaluations for each row execute function public.enforce_ai_evaluation_run_context();

create or replace function public.enforce_ai_execution_attempt_context()
returns trigger language plpgsql as $$
declare parent public.ai_recommendations;
begin
  select * into parent from public.ai_recommendations where id = new.recommendation_id;
  if parent.id is null then raise exception 'AI recommendation not found'; end if;
  if new.run_id is distinct from parent.run_id
    or new.org_id is distinct from parent.org_id
    or new.actor_user_id is distinct from parent.actor_user_id
    or new.business_role is distinct from parent.business_role
    or new.subject_scope is distinct from parent.subject_scope
    or new.subject_id is distinct from parent.subject_id
    or new.data_class is distinct from parent.data_class
    or new.recommendation_type is distinct from parent.recommendation_type then
    raise exception 'AI execution attempt context does not match its recommendation';
  end if;
  return new;
end $$;

drop trigger if exists trg_ai_execution_attempt_context on public.ai_recommendation_execution_attempts;
create trigger trg_ai_execution_attempt_context
before insert or update of recommendation_id,run_id,org_id,actor_user_id,business_role,subject_scope,subject_id,data_class,recommendation_type
on public.ai_recommendation_execution_attempts for each row execute function public.enforce_ai_execution_attempt_context();

drop index if exists public.idx_ai_recommendation_inbox;
create index idx_ai_recommendation_inbox
  on public.ai_recommendations(actor_user_id,business_role,org_id,subject_scope,subject_id,data_class,status,created_at desc);
create index if not exists idx_ai_evaluation_context
  on public.ai_assistant_evaluations(evaluator_user_id,business_role,org_id,subject_scope,subject_id,data_class,created_at desc);
create index if not exists idx_ai_execution_attempt_context
  on public.ai_recommendation_execution_attempts(actor_user_id,business_role,org_id,subject_scope,subject_id,data_class,created_at desc);

alter table public.ai_recommendation_execution_attempts enable row level security;
revoke all on table public.ai_recommendation_execution_attempts from public,anon,authenticated;
grant select,insert,update,delete on table public.ai_recommendation_execution_attempts to service_role;
