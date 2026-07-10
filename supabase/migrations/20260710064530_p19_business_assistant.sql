-- AI PM System V5.4.0 P19 PM/Operations business assistant.
-- Delta-only update drafts. Draft creation and confirmation never write Feishu directly.

create table if not exists public.business_update_drafts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  subject_scope text not null check (subject_scope in ('project', 'portfolio', 'organization', 'customer', 'contract')),
  subject_id text not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  business_role text not null check (business_role in ('pm', 'operations')),
  source_type text not null check (source_type in ('project', 'milestone', 'risk', 'action', 'contract', 'payment')),
  source_record_id text not null,
  data_class text not null check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')),
  changes jsonb not null,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'confirmed', 'cancelled', 'superseded')),
  writeback_status text not null default 'not_requested'
    check (writeback_status in ('not_requested', 'queued', 'writing', 'succeeded', 'failed')),
  requested_by uuid not null references public.app_users(id) on delete restrict,
  confirmed_by uuid references public.app_users(id) on delete set null,
  confirmed_at timestamptz,
  cancelled_by uuid references public.app_users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  request_id text not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 20),
  check ((status = 'confirmed') = (confirmed_at is not null and confirmed_by is not null) or status in ('cancelled', 'superseded')),
  check ((status = 'cancelled') = (cancelled_at is not null and cancelled_by is not null) or status in ('pending_confirmation', 'confirmed', 'superseded')),
  unique (requested_by, request_id)
);

create index if not exists idx_business_update_drafts_scope
  on public.business_update_drafts(org_id, subject_scope, subject_id, status, created_at desc);
create index if not exists idx_business_update_drafts_project
  on public.business_update_drafts(project_id, source_type, source_record_id, status, created_at desc);
create index if not exists idx_business_update_drafts_requester
  on public.business_update_drafts(requested_by, status, created_at desc);

create or replace function public.enforce_p19_draft_project_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_data_class text;
begin
  select org_id, data_class into v_org_id, v_data_class
  from public.projects where id = new.project_id;
  if v_org_id is null then raise exception 'P19_PROJECT_NOT_FOUND'; end if;
  if v_org_id <> new.org_id then raise exception 'P19_ORG_MISMATCH'; end if;
  if v_data_class <> new.data_class then raise exception 'P19_DATA_CLASS_MISMATCH'; end if;
  return new;
end;
$$;

drop trigger if exists trg_p19_draft_project_consistency on public.business_update_drafts;
create trigger trg_p19_draft_project_consistency
before insert or update of org_id, project_id, data_class on public.business_update_drafts
for each row execute function public.enforce_p19_draft_project_consistency();

alter table public.business_update_drafts enable row level security;
revoke all on table public.business_update_drafts from public;
revoke all on table public.business_update_drafts from anon, authenticated;
grant select, insert, update, delete on table public.business_update_drafts to service_role;
