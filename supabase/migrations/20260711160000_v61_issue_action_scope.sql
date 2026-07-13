-- V6.1 issue/action scope hardening.
-- Additive only: preserve legacy columns and rows while making new scoped writes explicit.

alter table public.project_issues
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_issues'::regclass
      and conname = 'project_issues_data_class_check'
  ) then
    alter table public.project_issues
      add constraint project_issues_data_class_check
      check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
end
$$;

update public.project_issues issue
set
  org_id = coalesce(issue.org_id, project.org_id),
  data_class = case
    when issue.data_class = 'unclassified' then project.data_class
    else issue.data_class
  end
from public.projects project
where issue.project_id = project.id
  and (
    issue.org_id is null
    or issue.data_class = 'unclassified'
  );

create index if not exists idx_project_issues_scope
  on public.project_issues(org_id, data_class, project_id, status, updated_at desc);

alter table public.project_changes
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.project_changes'::regclass
      and conname = 'project_changes_data_class_check'
  ) then
    alter table public.project_changes
      add constraint project_changes_data_class_check
      check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
end
$$;

update public.project_changes change_record
set
  org_id = coalesce(change_record.org_id, project.org_id),
  data_class = case
    when change_record.data_class = 'unclassified' then project.data_class
    else change_record.data_class
  end
from public.projects project
where change_record.project_id = project.id
  and (
    change_record.org_id is null
    or change_record.data_class = 'unclassified'
  );

create index if not exists idx_project_changes_scope
  on public.project_changes(org_id, data_class, project_id, status, updated_at desc);

alter table public.unified_action_items
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.unified_action_items'::regclass
      and conname = 'unified_action_items_data_class_check'
  ) then
    alter table public.unified_action_items
      add constraint unified_action_items_data_class_check
      check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
end
$$;

update public.unified_action_items action
set
  org_id = coalesce(action.org_id, project.org_id),
  data_class = case
    when action.data_class = 'unclassified' then project.data_class
    else action.data_class
  end
from public.projects project
where action.project_id = project.id
  and (
    action.org_id is null
    or action.data_class = 'unclassified'
  );

create index if not exists idx_unified_action_scope
  on public.unified_action_items(org_id, data_class, project_id, status, updated_at desc);

alter table public.issue_change_events
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.issue_change_events'::regclass
      and conname = 'issue_change_events_data_class_check'
  ) then
    alter table public.issue_change_events
      add constraint issue_change_events_data_class_check
      check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
end
$$;

update public.issue_change_events event_record
set
  org_id = issue.org_id,
  project_id = issue.project_id,
  data_class = issue.data_class
from public.project_issues issue
where event_record.subject_type = 'issue'
  and event_record.subject_id = issue.id::text
  and (event_record.org_id is null or event_record.project_id is null or event_record.data_class = 'unclassified');

update public.issue_change_events event_record
set
  org_id = change_record.org_id,
  project_id = change_record.project_id,
  data_class = change_record.data_class
from public.project_changes change_record
where event_record.subject_type = 'change'
  and event_record.subject_id = change_record.id::text
  and (event_record.org_id is null or event_record.project_id is null or event_record.data_class = 'unclassified');

update public.issue_change_events event_record
set
  org_id = action.org_id,
  project_id = action.project_id,
  data_class = action.data_class
from public.unified_action_items action
where event_record.subject_type = 'action'
  and event_record.subject_id = action.id::text
  and (event_record.org_id is null or event_record.project_id is null or event_record.data_class = 'unclassified');

create or replace function public.validate_issue_change_scope_v61()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  canonical_project public.projects%rowtype;
  canonical_org_id uuid;
  canonical_project_id uuid;
  canonical_data_class text;
begin
  if tg_table_name in ('project_issues', 'project_changes', 'unified_action_items') then
    if tg_table_name in ('project_issues', 'project_changes') and new.project_id is null then
      raise exception 'PROJECT_ID_REQUIRED';
    end if;

    if new.project_id is not null then
      select * into canonical_project
      from public.projects
      where id = new.project_id;
      if not found then raise exception 'PROJECT_OUTSIDE_CONTEXT'; end if;

      if new.org_id is not null and new.org_id <> canonical_project.org_id then
        raise exception 'ORG_PROJECT_SCOPE_MISMATCH';
      end if;
      if new.data_class <> 'unclassified' and new.data_class <> canonical_project.data_class then
        raise exception 'DATA_CLASS_PROJECT_SCOPE_MISMATCH';
      end if;

      new.org_id := canonical_project.org_id;
      new.data_class := canonical_project.data_class;
      new.project_name := canonical_project.name;
    end if;
    return new;
  end if;

  if new.subject_type = 'issue' then
    select org_id, project_id, data_class
      into canonical_org_id, canonical_project_id, canonical_data_class
    from public.project_issues
    where id::text = new.subject_id;
  elsif new.subject_type = 'change' then
    select org_id, project_id, data_class
      into canonical_org_id, canonical_project_id, canonical_data_class
    from public.project_changes
    where id::text = new.subject_id;
  elsif new.subject_type = 'action' then
    select org_id, project_id, data_class
      into canonical_org_id, canonical_project_id, canonical_data_class
    from public.unified_action_items
    where id::text = new.subject_id;
  else
    raise exception 'ISSUE_CHANGE_SUBJECT_TYPE_INVALID';
  end if;

  if not found then raise exception 'ISSUE_CHANGE_SUBJECT_OUTSIDE_CONTEXT'; end if;
  if new.org_id is not null and new.org_id is distinct from canonical_org_id then
    raise exception 'ORG_SUBJECT_SCOPE_MISMATCH';
  end if;
  if new.project_id is not null and new.project_id is distinct from canonical_project_id then
    raise exception 'PROJECT_SUBJECT_SCOPE_MISMATCH';
  end if;
  if new.data_class <> 'unclassified' and new.data_class is distinct from canonical_data_class then
    raise exception 'DATA_CLASS_SUBJECT_SCOPE_MISMATCH';
  end if;

  new.org_id := canonical_org_id;
  new.project_id := canonical_project_id;
  new.data_class := canonical_data_class;
  return new;
end
$$;

drop trigger if exists trg_project_issues_scope_v61 on public.project_issues;
create trigger trg_project_issues_scope_v61
before insert or update on public.project_issues
for each row execute function public.validate_issue_change_scope_v61();

drop trigger if exists trg_project_changes_scope_v61 on public.project_changes;
create trigger trg_project_changes_scope_v61
before insert or update on public.project_changes
for each row execute function public.validate_issue_change_scope_v61();

drop trigger if exists trg_unified_action_items_scope_v61 on public.unified_action_items;
create trigger trg_unified_action_items_scope_v61
before insert or update on public.unified_action_items
for each row execute function public.validate_issue_change_scope_v61();

drop trigger if exists trg_issue_change_events_scope_v61 on public.issue_change_events;
create trigger trg_issue_change_events_scope_v61
before insert or update on public.issue_change_events
for each row execute function public.validate_issue_change_scope_v61();

create index if not exists idx_issue_change_events_scope
  on public.issue_change_events(org_id, data_class, project_id, created_at desc);

alter table public.project_issues enable row level security;
alter table public.project_changes enable row level security;
alter table public.unified_action_items enable row level security;
alter table public.issue_change_events enable row level security;

revoke all on table public.project_issues from public, anon, authenticated;
revoke all on table public.project_changes from public, anon, authenticated;
revoke all on table public.unified_action_items from public, anon, authenticated;
revoke all on table public.issue_change_events from public, anon, authenticated;
grant select, insert, update, delete on table public.project_issues to service_role;
grant select, insert, update, delete on table public.project_changes to service_role;
grant select, insert, update, delete on table public.unified_action_items to service_role;
grant select, insert, update, delete on table public.issue_change_events to service_role;

revoke all on function public.validate_issue_change_scope_v61() from public, anon, authenticated;
grant execute on function public.validate_issue_change_scope_v61() to service_role;

notify pgrst, 'reload schema';
