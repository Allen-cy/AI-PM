-- Wave0: replace static initiation requirements with scoped, persistent business records.
-- Depends on P17 operating foundation (organizations, projects, app_users).

create table if not exists public.project_requirements (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  requirement_code text not null default ('REQ-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 12))),
  description text not null check (char_length(trim(description)) between 1 and 4000),
  priority text not null default '中' check (priority in ('高','中','低')),
  status text not null default '待确认' check (status in ('待确认','已确认','已实现','已验收')),
  category text not null default '功能需求' check (char_length(trim(category)) between 1 and 100),
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, requirement_code)
);

create index if not exists idx_wave0_requirements_project
  on public.project_requirements(project_id, status, priority, updated_at desc);

create or replace function public.enforce_wave0_requirement_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_data_class text;
begin
  select org_id, data_class into v_org_id, v_data_class from public.projects where id = new.project_id;
  if v_org_id is null then raise exception 'WAVE0_PROJECT_NOT_FOUND'; end if;
  if new.org_id <> v_org_id then raise exception 'WAVE0_REQUIREMENT_ORG_MISMATCH'; end if;
  if new.data_class <> v_data_class then raise exception 'WAVE0_REQUIREMENT_DATA_CLASS_MISMATCH'; end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_wave0_requirement_scope on public.project_requirements;
create trigger trg_wave0_requirement_scope
before insert or update on public.project_requirements
for each row execute function public.enforce_wave0_requirement_scope();

alter table public.project_requirements enable row level security;
revoke all on table public.project_requirements from public, anon, authenticated;
grant select, insert, update, delete on table public.project_requirements to service_role;
revoke all on function public.enforce_wave0_requirement_scope() from public, anon, authenticated;
grant execute on function public.enforce_wave0_requirement_scope() to service_role;

