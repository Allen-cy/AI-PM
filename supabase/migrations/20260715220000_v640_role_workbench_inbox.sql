begin;

create table if not exists public.role_workbench_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo')),
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  layout jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id, business_role, data_class)
);

create table if not exists public.collaboration_inbox_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  item_type text not null,
  source_type text not null,
  source_id text not null,
  project_id uuid references public.projects(id) on delete cascade,
  status text not null default 'unread' check (status in ('unread','read','snoozed','acknowledged')),
  snoozed_until timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  version integer not null default 1 check (version > 0),
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, org_id, business_role, data_class, item_type, source_type, source_id),
  unique (user_id, idempotency_key)
);

create table if not exists public.role_acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  data_class text not null default 'test' check (data_class = 'test'),
  name text not null,
  status text not null default 'draft' check (status in ('draft','ready','running','passed','failed','cancelled')),
  evidence jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.role_acceptance_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.role_acceptance_runs(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo')),
  assignment_id uuid references public.user_business_roles(id) on delete set null,
  isolation_result jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, user_id),
  unique (run_id, business_role)
);

create index if not exists idx_v640_workbench_preferences_scope on public.role_workbench_preferences (org_id, business_role, data_class, user_id);
create index if not exists idx_v640_inbox_receipts_scope on public.collaboration_inbox_receipts (org_id, business_role, data_class, user_id, status, last_seen_at desc);
create index if not exists idx_v640_acceptance_runs_scope on public.role_acceptance_runs (org_id, data_class, status, created_at desc);
create index if not exists idx_v640_acceptance_participants_run on public.role_acceptance_participants (run_id, business_role, user_id);

create or replace function public.set_v640_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_v640_workbench_preferences_updated_at on public.role_workbench_preferences;
create trigger trg_v640_workbench_preferences_updated_at before update on public.role_workbench_preferences for each row execute function public.set_v640_updated_at();
drop trigger if exists trg_v640_inbox_receipts_updated_at on public.collaboration_inbox_receipts;
create trigger trg_v640_inbox_receipts_updated_at before update on public.collaboration_inbox_receipts for each row execute function public.set_v640_updated_at();
drop trigger if exists trg_v640_acceptance_runs_updated_at on public.role_acceptance_runs;
create trigger trg_v640_acceptance_runs_updated_at before update on public.role_acceptance_runs for each row execute function public.set_v640_updated_at();

create or replace function public.prevent_v640_inbox_receipt_scope_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.user_id is distinct from new.user_id
    or old.org_id is distinct from new.org_id
    or old.business_role is distinct from new.business_role
    or old.data_class is distinct from new.data_class
    or old.item_type is distinct from new.item_type
    or old.source_type is distinct from new.source_type
    or old.source_id is distinct from new.source_id
    or old.project_id is distinct from new.project_id then
    raise exception 'V640_INBOX_RECEIPT_SCOPE_IMMUTABLE';
  end if;
  new.version := old.version + 1;
  if new.status = 'acknowledged' and old.status is distinct from 'acknowledged' then new.acknowledged_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists trg_v640_inbox_receipt_scope_change on public.collaboration_inbox_receipts;
create trigger trg_v640_inbox_receipt_scope_change before update on public.collaboration_inbox_receipts for each row execute function public.prevent_v640_inbox_receipt_scope_change();

create or replace function public.validate_v640_role_acceptance_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_count integer;
  v_role_count integer;
  v_verified_count integer;
begin
  select count(distinct user_id), count(distinct business_role), count(*) filter (where verified_at is not null)
  into v_user_count, v_role_count, v_verified_count
  from public.role_acceptance_participants
  where run_id = p_run_id;
  return jsonb_build_object(
    'distinct_users', v_user_count,
    'distinct_roles', v_role_count,
    'verified_participants', v_verified_count,
    'ready', v_user_count = 4 and v_role_count = 4,
    'passed', v_user_count = 4 and v_role_count = 4 and v_verified_count = 4
  );
end;
$$;

alter table public.role_workbench_preferences enable row level security;
alter table public.collaboration_inbox_receipts enable row level security;
alter table public.role_acceptance_runs enable row level security;
alter table public.role_acceptance_participants enable row level security;

revoke all on table public.role_workbench_preferences, public.collaboration_inbox_receipts, public.role_acceptance_runs, public.role_acceptance_participants from public, anon, authenticated;
grant select, insert, update, delete on table public.role_workbench_preferences, public.collaboration_inbox_receipts, public.role_acceptance_runs, public.role_acceptance_participants to service_role;
revoke all on function public.set_v640_updated_at(), public.prevent_v640_inbox_receipt_scope_change(), public.validate_v640_role_acceptance_run(uuid) from public, anon, authenticated;
grant execute on function public.set_v640_updated_at(), public.prevent_v640_inbox_receipt_scope_change(), public.validate_v640_role_acceptance_run(uuid) to service_role;

commit;
