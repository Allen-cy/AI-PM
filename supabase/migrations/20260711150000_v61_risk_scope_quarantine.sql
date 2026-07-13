-- AI-PMO V6.1.0: risk tenant/project scope and legacy quarantine.
-- Additive migration. Legacy unlinked risks are retained and isolated; no data is deleted.

alter table public.risks add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risks add column if not exists data_class text not null default 'unclassified';
alter table public.risks add column if not exists source_record_id text;
alter table public.risks add column if not exists source_updated_at timestamptz;
alter table public.risks add column if not exists row_hash text;
alter table public.risks add column if not exists version bigint not null default 1;
alter table public.risks add column if not exists quarantine_reason text;
alter table public.risks add column if not exists last_idempotency_key text;
alter table public.risks add column if not exists archived_at timestamptz;
alter table public.risks add column if not exists archived_by uuid references public.app_users(id) on delete set null;
alter table public.risks add column if not exists archive_reason text;

alter table public.risk_workflow_events add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_workflow_events add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.risk_workflow_events add column if not exists data_class text not null default 'unclassified';
alter table public.risk_workflow_events add column if not exists request_id text;

alter table public.risk_retrospective_assets add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_assets add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_assets add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_asset_sync_logs add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_asset_sync_logs add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_asset_sync_logs add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_asset_usage_logs add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_asset_usage_logs add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_asset_usage_logs add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_asset_governance_logs add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_asset_governance_logs add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_asset_governance_logs add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_governance_followups add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_governance_followups add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_governance_followups add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_governance_operation_snapshots add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_governance_operation_snapshots add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_governance_operation_snapshots add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_governance_reminder_logs add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_governance_reminder_logs add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_governance_reminder_logs add column if not exists data_class text not null default 'unclassified';
alter table public.risk_retrospective_governance_evidence_links add column if not exists org_id uuid references public.organizations(id) on delete restrict;
alter table public.risk_retrospective_governance_evidence_links add column if not exists project_id uuid references public.projects(id) on delete restrict;
alter table public.risk_retrospective_governance_evidence_links add column if not exists data_class text not null default 'unclassified';

do $$
declare
  scoped_table text;
  constraint_name text;
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.risks'::regclass
      and conname = 'risks_data_class_check'
  ) then
    alter table public.risks add constraint risks_data_class_check
      check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.risk_workflow_events'::regclass
      and conname = 'risk_workflow_events_data_class_check'
  ) then
    alter table public.risk_workflow_events add constraint risk_workflow_events_data_class_check
      check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')) not valid;
  end if;
  foreach scoped_table in array array[
    'risk_retrospective_assets',
    'risk_retrospective_asset_sync_logs',
    'risk_retrospective_asset_usage_logs',
    'risk_retrospective_asset_governance_logs',
    'risk_retrospective_governance_followups',
    'risk_retrospective_governance_operation_snapshots',
    'risk_retrospective_governance_reminder_logs',
    'risk_retrospective_governance_evidence_links'
  ] loop
    constraint_name := scoped_table || '_v61_data_class_check';
    if not exists (
      select 1 from pg_constraint
      where conrelid = format('public.%I', scoped_table)::regclass
        and conname = constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I check (data_class in (''production'',''sample'',''test'',''diagnostic'',''unclassified'')) not valid',
        scoped_table,
        constraint_name
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.risk_retrospective_assets'::regclass and conname = 'risk_retrospective_assets_org_data_asset_key') then
    alter table public.risk_retrospective_assets add constraint risk_retrospective_assets_org_data_asset_key unique (org_id, data_class, project_id, asset_key);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.risk_retrospective_governance_followups'::regclass and conname = 'risk_retro_followups_org_data_action_key') then
    alter table public.risk_retrospective_governance_followups add constraint risk_retro_followups_org_data_action_key unique (org_id, data_class, project_id, action_key);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.risk_retrospective_governance_operation_snapshots'::regclass and conname = 'risk_retro_snapshots_org_data_date_key') then
    alter table public.risk_retrospective_governance_operation_snapshots add constraint risk_retro_snapshots_org_data_date_key unique (org_id, data_class, project_id, snapshot_date);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.risk_retrospective_governance_reminder_logs'::regclass and conname = 'risk_retro_reminders_org_data_key') then
    alter table public.risk_retrospective_governance_reminder_logs add constraint risk_retro_reminders_org_data_key unique (org_id, data_class, project_id, reminder_key);
  end if;
end
$$;

-- Rows already linked to a governed project inherit the canonical tenant and data class.
update public.risks as risk
set org_id = project.org_id,
    data_class = project.data_class,
    quarantine_reason = null
from public.projects as project
where risk.project_id = project.id
  and (
    risk.org_id is distinct from project.org_id
    or risk.data_class is distinct from project.data_class
    or risk.quarantine_reason is not null
  );

-- Unlinked legacy rows stay intact but cannot appear in any production project scope.
update public.risks
set data_class = 'unclassified',
    quarantine_reason = coalesce(quarantine_reason, 'legacy_unlinked_project')
where project_id is null or org_id is null;

update public.risk_workflow_events as event
set org_id = risk.org_id,
    project_id = risk.project_id,
    data_class = risk.data_class
from public.risks as risk
where event.risk_id = risk.id
  and (
    event.org_id is distinct from risk.org_id
    or event.project_id is distinct from risk.project_id
    or event.data_class is distinct from risk.data_class
  );

-- Conservatively recover retrospective scope only when the existing relationship
-- resolves to one canonical project scope. Ambiguous/unlinked rows are retained as
-- unclassified and remain invisible to formal project queries.
with candidates as (
  select asset.id, risk.org_id, risk.project_id, risk.data_class
  from public.risk_retrospective_assets asset
  join public.risks risk
    on asset.source_risk_id = risk.id::text
    or (asset.source_risk_code is not null and asset.source_risk_code = risk.risk_code)
  where risk.org_id is not null
    and risk.project_id is not null
    and risk.data_class <> 'unclassified'
), resolved as (
  select distinct candidate.id, candidate.org_id, candidate.project_id, candidate.data_class
  from candidates candidate
  where not exists (
    select 1 from candidates other
    where other.id = candidate.id
      and row(other.org_id, other.project_id, other.data_class)
        is distinct from row(candidate.org_id, candidate.project_id, candidate.data_class)
  )
)
update public.risk_retrospective_assets target
set org_id = resolved.org_id,
    project_id = resolved.project_id,
    data_class = resolved.data_class
from resolved
where target.id = resolved.id
  and (target.org_id is null or target.org_id = resolved.org_id)
  and (target.project_id is null or target.project_id = resolved.project_id)
  and (target.data_class = 'unclassified' or target.data_class = resolved.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select usage.id, asset.org_id, asset.project_id, asset.data_class
  from public.risk_retrospective_asset_usage_logs usage
  join public.risk_retrospective_assets asset
    on usage.asset_id = asset.id
    or (usage.asset_id is null and usage.asset_key is not null and usage.asset_key = asset.asset_key)
  where asset.org_id is not null
    and asset.project_id is not null
    and asset.data_class <> 'unclassified'
), resolved as (
  select distinct candidate.id, candidate.org_id, candidate.project_id, candidate.data_class
  from candidates candidate
  where not exists (
    select 1 from candidates other
    where other.id = candidate.id
      and row(other.org_id, other.project_id, other.data_class)
        is distinct from row(candidate.org_id, candidate.project_id, candidate.data_class)
  )
)
update public.risk_retrospective_asset_usage_logs target
set org_id = resolved.org_id,
    project_id = resolved.project_id,
    data_class = resolved.data_class
from resolved
where target.id = resolved.id
  and (target.org_id is null or target.org_id = resolved.org_id)
  and (target.project_id is null or target.project_id = resolved.project_id)
  and (target.data_class = 'unclassified' or target.data_class = resolved.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select governance_log.id, asset.org_id, asset.project_id, asset.data_class
  from public.risk_retrospective_asset_governance_logs governance_log
  join public.risk_retrospective_assets asset
    on governance_log.asset_id = asset.id
    or governance_log.target_asset_id = asset.id
  where asset.org_id is not null
    and asset.project_id is not null
    and asset.data_class <> 'unclassified'
), resolved as (
  select distinct candidate.id, candidate.org_id, candidate.project_id, candidate.data_class
  from candidates candidate
  where not exists (
    select 1 from candidates other
    where other.id = candidate.id
      and row(other.org_id, other.project_id, other.data_class)
        is distinct from row(candidate.org_id, candidate.project_id, candidate.data_class)
  )
)
update public.risk_retrospective_asset_governance_logs target
set org_id = resolved.org_id,
    project_id = resolved.project_id,
    data_class = resolved.data_class
from resolved
where target.id = resolved.id
  and (target.org_id is null or target.org_id = resolved.org_id)
  and (target.project_id is null or target.project_id = resolved.project_id)
  and (target.data_class = 'unclassified' or target.data_class = resolved.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select followup.id, governance_log.org_id, governance_log.project_id, governance_log.data_class
  from public.risk_retrospective_governance_followups followup
  join public.risk_retrospective_asset_governance_logs governance_log
    on followup.source_log_id = governance_log.id
  where governance_log.org_id is not null
    and governance_log.project_id is not null
    and governance_log.data_class <> 'unclassified'
)
update public.risk_retrospective_governance_followups target
set org_id = candidate.org_id,
    project_id = candidate.project_id,
    data_class = candidate.data_class
from candidates candidate
where target.id = candidate.id
  and (target.org_id is null or target.org_id = candidate.org_id)
  and (target.project_id is null or target.project_id = candidate.project_id)
  and (target.data_class = 'unclassified' or target.data_class = candidate.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select sync_log.id, asset.org_id, asset.project_id, asset.data_class
  from public.risk_retrospective_asset_sync_logs sync_log
  join public.risk_retrospective_assets asset
    on asset.id::text = any(sync_log.asset_ids)
  where asset.org_id is not null
    and asset.project_id is not null
    and asset.data_class <> 'unclassified'
), resolved as (
  select distinct candidate.id, candidate.org_id, candidate.project_id, candidate.data_class
  from candidates candidate
  where not exists (
    select 1 from candidates other
    where other.id = candidate.id
      and row(other.org_id, other.project_id, other.data_class)
        is distinct from row(candidate.org_id, candidate.project_id, candidate.data_class)
  )
)
update public.risk_retrospective_asset_sync_logs target
set org_id = resolved.org_id,
    project_id = resolved.project_id,
    data_class = resolved.data_class
from resolved
where target.id = resolved.id
  and (target.org_id is null or target.org_id = resolved.org_id)
  and (target.project_id is null or target.project_id = resolved.project_id)
  and (target.data_class = 'unclassified' or target.data_class = resolved.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

-- Old snapshots had no project column. Only an explicit, valid metadata project id
-- is authoritative enough for automatic recovery; otherwise the snapshot is isolated.
update public.risk_retrospective_governance_operation_snapshots target
set org_id = project.org_id,
    project_id = project.id,
    data_class = project.data_class
from public.projects project
where target.metadata->>'project_id' = project.id::text
  and (target.org_id is null or target.org_id = project.org_id)
  and (target.project_id is null or target.project_id = project.id)
  and (target.data_class = 'unclassified' or target.data_class = project.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select reminder.id, followup.org_id, followup.project_id, followup.data_class
  from public.risk_retrospective_governance_reminder_logs reminder
  join public.risk_retrospective_governance_followups followup
    on regexp_replace(
      coalesce(reminder.metadata->>'original_reminder_id', ''),
      '^(overdue|waiting_acceptance|evidence_gap)-',
      ''
    ) = followup.id::text
  where followup.org_id is not null
    and followup.project_id is not null
    and followup.data_class <> 'unclassified'
)
update public.risk_retrospective_governance_reminder_logs target
set org_id = candidate.org_id,
    project_id = candidate.project_id,
    data_class = candidate.data_class
from candidates candidate
where target.id = candidate.id
  and (target.org_id is null or target.org_id = candidate.org_id)
  and (target.project_id is null or target.project_id = candidate.project_id)
  and (target.data_class = 'unclassified' or target.data_class = candidate.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

with candidates as (
  select evidence.id, followup.org_id, followup.project_id, followup.data_class
  from public.risk_retrospective_governance_evidence_links evidence
  join public.risk_retrospective_governance_followups followup
    on evidence.source_followup_id = followup.id
  where followup.org_id is not null
    and followup.project_id is not null
    and followup.data_class <> 'unclassified'
  union all
  select evidence.id, reminder.org_id, reminder.project_id, reminder.data_class
  from public.risk_retrospective_governance_evidence_links evidence
  join public.risk_retrospective_governance_reminder_logs reminder
    on evidence.reminder_log_id = reminder.id
  where reminder.org_id is not null
    and reminder.project_id is not null
    and reminder.data_class <> 'unclassified'
), resolved as (
  select distinct candidate.id, candidate.org_id, candidate.project_id, candidate.data_class
  from candidates candidate
  where not exists (
    select 1 from candidates other
    where other.id = candidate.id
      and row(other.org_id, other.project_id, other.data_class)
        is distinct from row(candidate.org_id, candidate.project_id, candidate.data_class)
  )
)
update public.risk_retrospective_governance_evidence_links target
set org_id = resolved.org_id,
    project_id = resolved.project_id,
    data_class = resolved.data_class
from resolved
where target.id = resolved.id
  and (target.org_id is null or target.org_id = resolved.org_id)
  and (target.project_id is null or target.project_id = resolved.project_id)
  and (target.data_class = 'unclassified' or target.data_class = resolved.data_class)
  and (target.org_id is null or target.project_id is null or target.data_class = 'unclassified');

-- If a prior partial rollout already populated project_id, use the project itself as
-- the source of truth only when there is no conflicting non-null organization value.
do $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'risk_retrospective_assets',
    'risk_retrospective_asset_sync_logs',
    'risk_retrospective_asset_usage_logs',
    'risk_retrospective_asset_governance_logs',
    'risk_retrospective_governance_followups',
    'risk_retrospective_governance_operation_snapshots',
    'risk_retrospective_governance_reminder_logs',
    'risk_retrospective_governance_evidence_links'
  ] loop
    execute format(
      'update public.%I target
       set org_id = project.org_id, data_class = project.data_class
       from public.projects project
       where target.project_id = project.id
         and (target.org_id is null or target.org_id = project.org_id)
         and (target.org_id is null or target.data_class = ''unclassified'')',
      scoped_table
    );
    execute format(
      'update public.%I
       set data_class = ''unclassified''
       where org_id is null or project_id is null',
      scoped_table
    );
  end loop;
end
$$;

create or replace function public.audit_v61_risk_retrospective_scope()
returns table (
  table_name text,
  total_count bigint,
  scoped_count bigint,
  isolated_count bigint,
  inconsistent_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  scoped_table text;
begin
  foreach scoped_table in array array[
    'risk_retrospective_assets',
    'risk_retrospective_asset_sync_logs',
    'risk_retrospective_asset_usage_logs',
    'risk_retrospective_asset_governance_logs',
    'risk_retrospective_governance_followups',
    'risk_retrospective_governance_operation_snapshots',
    'risk_retrospective_governance_reminder_logs',
    'risk_retrospective_governance_evidence_links'
  ] loop
    return query execute format(
      'select %L::text,
              count(*)::bigint,
              count(*) filter (
                where target.org_id is not null
                  and target.project_id is not null
                  and target.data_class <> ''unclassified''
                  and exists (
                    select 1 from public.projects project
                    where project.id = target.project_id
                      and project.org_id = target.org_id
                      and project.data_class = target.data_class
                  )
              )::bigint,
              count(*) filter (
                where target.org_id is null
                   or target.project_id is null
                   or target.data_class = ''unclassified''
              )::bigint,
              count(*) filter (
                where target.org_id is not null
                  and target.project_id is not null
                  and target.data_class <> ''unclassified''
                  and not exists (
                    select 1 from public.projects project
                    where project.id = target.project_id
                      and project.org_id = target.org_id
                      and project.data_class = target.data_class
                  )
              )::bigint
       from public.%I target',
      scoped_table,
      scoped_table
    );
  end loop;
end
$$;

comment on function public.audit_v61_risk_retrospective_scope() is
  'V6.1 service-only audit: counts formally scoped, isolated and inconsistent rows across the eight risk retrospective tables.';

create table if not exists public.risk_scope_quarantine (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null unique references public.risks(id) on delete cascade,
  quarantine_owner_org_id uuid references public.organizations(id) on delete restrict,
  org_id uuid references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  data_class text not null default 'unclassified'
    check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  original_snapshot jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.risk_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null
    check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')),
  operation text not null check (operation in ('upsert', 'transition', 'archive', 'quarantine_resolve')),
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 160),
  request_hash text not null,
  result jsonb not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, data_class, project_id, idempotency_key)
);

insert into public.risk_scope_quarantine (
  risk_id, quarantine_owner_org_id, org_id, project_id, data_class, reason, status, original_snapshot
)
select
  risk.id,
  coalesce(
    risk.org_id,
    case when (select count(*) from public.organizations) = 1
      then (select id from public.organizations order by id limit 1)
      else null
    end
  ),
  risk.org_id,
  risk.project_id,
  risk.data_class,
  coalesce(risk.quarantine_reason, 'legacy_unlinked_project'),
  'pending',
  to_jsonb(risk)
from public.risks as risk
where risk.project_id is null
   or risk.org_id is null
   or risk.data_class = 'unclassified'
on conflict (risk_id) do update
set quarantine_owner_org_id = coalesce(public.risk_scope_quarantine.quarantine_owner_org_id, excluded.quarantine_owner_org_id),
    org_id = excluded.org_id,
    project_id = excluded.project_id,
    data_class = excluded.data_class,
    reason = excluded.reason,
    original_snapshot = excluded.original_snapshot,
    updated_at = now()
where public.risk_scope_quarantine.status = 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.risks'::regclass
      and conname = 'risks_org_data_project_risk_code_key'
  ) then
    alter table public.risks add constraint risks_org_data_project_risk_code_key
      unique (org_id, data_class, project_id, risk_code);
  end if;
end
$$;

create or replace function public.validate_risk_scope_v61()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  project_org_id uuid;
  project_data_class text;
  project_canonical_name text;
begin
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  if new.project_id is null then
    new.data_class := 'unclassified';
    new.quarantine_reason := coalesce(new.quarantine_reason, 'legacy_unlinked_project');
    return new;
  end if;

  select project.org_id, project.data_class, project.name
  into project_org_id, project_data_class, project_canonical_name
  from public.projects as project
  where project.id = new.project_id;
  if project_org_id is null then raise exception 'RISK_PROJECT_NOT_FOUND'; end if;
  if new.org_id is null then new.org_id := project_org_id; end if;
  if new.data_class is null or new.data_class = 'unclassified' then new.data_class := project_data_class; end if;
  if new.org_id is distinct from project_org_id then raise exception 'RISK_ORG_SCOPE_MISMATCH'; end if;
  if new.data_class is distinct from project_data_class then raise exception 'RISK_DATA_CLASS_MISMATCH'; end if;
  new.project_name := project_canonical_name;
  new.quarantine_reason := null;
  return new;
end
$$;

create or replace function public.validate_risk_event_scope_v61()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  risk_org_id uuid;
  risk_project_id uuid;
  risk_data_class text;
begin
  select risk.org_id, risk.project_id, risk.data_class
  into risk_org_id, risk_project_id, risk_data_class
  from public.risks as risk
  where risk.id = new.risk_id;
  if risk_project_id is null then raise exception 'RISK_EVENT_QUARANTINED'; end if;
  if new.org_id is null then new.org_id := risk_org_id; end if;
  if new.project_id is null then new.project_id := risk_project_id; end if;
  if new.data_class is null or new.data_class = 'unclassified' then new.data_class := risk_data_class; end if;
  if new.org_id is distinct from risk_org_id
     or new.project_id is distinct from risk_project_id
     or new.data_class is distinct from risk_data_class then
    raise exception 'RISK_EVENT_SCOPE_MISMATCH';
  end if;
  return new;
end
$$;

create or replace function public.sync_risk_quarantine_v61()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  owner_org_id uuid;
begin
  if new.project_id is not null and new.org_id is not null and new.data_class <> 'unclassified' then
    return null;
  end if;

  owner_org_id := new.org_id;
  if owner_org_id is null and (select count(*) from public.organizations) = 1 then
    select id into owner_org_id from public.organizations order by id limit 1;
  end if;

  insert into public.risk_scope_quarantine (
    risk_id, quarantine_owner_org_id, org_id, project_id, data_class,
    reason, status, original_snapshot, updated_at
  ) values (
    new.id, owner_org_id, new.org_id, new.project_id, new.data_class,
    coalesce(new.quarantine_reason, 'legacy_unlinked_project'), 'pending', to_jsonb(new), now()
  )
  on conflict (risk_id) do update
  set quarantine_owner_org_id = coalesce(public.risk_scope_quarantine.quarantine_owner_org_id, excluded.quarantine_owner_org_id),
      org_id = excluded.org_id,
      project_id = excluded.project_id,
      data_class = excluded.data_class,
      reason = excluded.reason,
      original_snapshot = excluded.original_snapshot,
      updated_at = now()
  where public.risk_scope_quarantine.status = 'pending';
  return null;
end
$$;

create or replace function public.resolve_risk_quarantine_v61(
  p_risk_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_risk public.risks%rowtype;
  target_project public.projects%rowtype;
  resolved_risk public.risks%rowtype;
  resolved_queue public.risk_scope_quarantine%rowtype;
  existing_receipt public.risk_operation_receipts%rowtype;
  normalized_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_note text := nullif(trim(coalesce(p_resolution_note, '')), '');
  request_hash text;
  result_payload jsonb;
begin
  if normalized_key is null or length(normalized_key) > 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if normalized_note is null then raise exception 'RESOLUTION_NOTE_REQUIRED'; end if;
  request_hash := md5(jsonb_build_object(
    'operation', 'quarantine_resolve', 'risk_id', p_risk_id,
    'project_id', p_project_id, 'expected_version', p_expected_version,
    'resolution_note', normalized_note
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_data_class || ':' || p_project_id::text || ':' || normalized_key, 0));
  select * into existing_receipt
  from public.risk_operation_receipts
  where org_id = p_org_id and data_class = p_data_class
    and project_id = p_project_id and idempotency_key = normalized_key;
  if existing_receipt.id is not null then
    if existing_receipt.operation is distinct from 'quarantine_resolve'
       or existing_receipt.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return existing_receipt.result;
  end if;

  select * into current_risk from public.risks where id = p_risk_id for update;
  if current_risk.id is null then raise exception 'RISK_NOT_FOUND'; end if;
  if current_risk.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into resolved_queue
  from public.risk_scope_quarantine
  where risk_id = p_risk_id and status = 'pending'
  for update;
  if resolved_queue.id is null then
    raise exception 'RISK_QUARANTINE_NOT_PENDING';
  end if;
  if resolved_queue.quarantine_owner_org_id is distinct from p_org_id then raise exception 'RISK_QUARANTINE_OWNER_MISMATCH'; end if;
  if current_risk.org_id is not null and current_risk.org_id is distinct from p_org_id then raise exception 'RISK_ORG_SCOPE_MISMATCH'; end if;

  select * into target_project from public.projects where id = p_project_id;
  if target_project.id is null then raise exception 'RISK_PROJECT_NOT_FOUND'; end if;
  if target_project.org_id is distinct from p_org_id then raise exception 'RISK_ORG_SCOPE_MISMATCH'; end if;
  if target_project.data_class is distinct from p_data_class then raise exception 'RISK_DATA_CLASS_MISMATCH'; end if;

  update public.risks
  set org_id = p_org_id,
      project_id = p_project_id,
      data_class = p_data_class,
      project_name = coalesce(nullif(project_name, ''), target_project.name),
      quarantine_reason = null,
      updated_at = now()
  where id = p_risk_id
  returning * into resolved_risk;

  update public.risk_workflow_events
  set org_id = p_org_id,
      project_id = p_project_id,
      data_class = p_data_class
  where risk_id = p_risk_id;

  insert into public.risk_workflow_events (
    org_id, project_id, data_class, risk_id, risk_code, workflow_step,
    from_status, to_status, input_summary, output_summary, action_required,
    owner, evidence, actor, request_id
  ) values (
    p_org_id, p_project_id, p_data_class, p_risk_id, resolved_risk.risk_code,
    coalesce(resolved_risk.workflow_step, 'identify'), resolved_risk.status, resolved_risk.status,
    '隔离治理队列中的未关联风险', '风险已由平台管理员关联到正式组织和项目',
    '后续按正式项目风险工作流继续跟踪', resolved_risk.owner,
    nullif(trim(coalesce(p_resolution_note, '')), ''), p_actor_user_id::text,
    'risk-quarantine-resolution:' || resolved_queue.id::text
  );

  update public.risk_scope_quarantine
  set org_id = p_org_id,
      project_id = p_project_id,
      data_class = p_data_class,
      status = 'resolved',
      resolved_at = now(),
      resolved_by = p_actor_user_id,
      resolution_note = normalized_note,
      updated_at = now()
  where risk_id = p_risk_id
  returning * into resolved_queue;

  result_payload := jsonb_build_object('risk', to_jsonb(resolved_risk), 'quarantine', to_jsonb(resolved_queue));
  insert into public.risk_operation_receipts (
    org_id, project_id, data_class, operation, idempotency_key,
    request_hash, result, actor_user_id
  ) values (
    p_org_id, p_project_id, p_data_class, 'quarantine_resolve', normalized_key,
    request_hash, result_payload, p_actor_user_id
  );
  return result_payload;
end
$$;

create or replace function public.upsert_risk_v61(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_risk_id uuid,
  p_risk_code text,
  p_payload jsonb,
  p_expected_version bigint,
  p_idempotency_key text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_risk public.risks%rowtype;
  candidate public.risks%rowtype;
  saved_risk public.risks%rowtype;
  existing_receipt public.risk_operation_receipts%rowtype;
  normalized_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_code text := nullif(trim(coalesce(p_risk_code, '')), '');
  safe_payload jsonb;
  request_hash text;
  result_payload jsonb;
begin
  if normalized_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if length(normalized_key) > 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_org_id is null or p_project_id is null or nullif(trim(coalesce(p_data_class, '')), '') is null then
    raise exception 'RISK_SCOPE_REQUIRED';
  end if;

  safe_payload := coalesce(p_payload, '{}'::jsonb)
    - array['id', 'org_id', 'project_id', 'data_class', 'version', 'created_at', 'updated_at', 'closed_at', 'pi_score', 'priority_score', 'archived_at', 'archived_by', 'archive_reason', 'quarantine_reason', 'last_idempotency_key'];
  request_hash := md5(jsonb_build_object(
    'operation', 'upsert',
    'risk_id', p_risk_id,
    'risk_code', normalized_code,
    'payload', safe_payload,
    'expected_version', p_expected_version
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_data_class || ':' || p_project_id::text || ':' || normalized_key, 0));
  select * into existing_receipt
  from public.risk_operation_receipts
  where org_id = p_org_id
    and data_class = p_data_class
    and project_id = p_project_id
    and idempotency_key = normalized_key;
  if existing_receipt.id is not null then
    if existing_receipt.operation is distinct from 'upsert' or existing_receipt.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return existing_receipt.result;
  end if;

  if p_risk_id is not null then
    select * into current_risk
    from public.risks
    where id = p_risk_id
      and org_id = p_org_id
      and project_id = p_project_id
      and data_class = p_data_class
    for update;
    if current_risk.id is null then raise exception 'RISK_NOT_FOUND_OR_OUTSIDE_SCOPE'; end if;
  else
    if normalized_code is null then raise exception 'RISK_CODE_REQUIRED'; end if;
    select * into current_risk
    from public.risks
    where org_id = p_org_id
      and project_id = p_project_id
      and data_class = p_data_class
      and risk_code = normalized_code
    for update;
  end if;

  if current_risk.id is not null then
    if current_risk.archived_at is not null then raise exception 'RISK_ARCHIVED'; end if;
    if current_risk.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    candidate := jsonb_populate_record(current_risk, safe_payload);
    update public.risks
    set risk_code = coalesce(normalized_code, current_risk.risk_code),
        project_name = candidate.project_name,
        description = candidate.description,
        category = candidate.category,
        stage = candidate.stage,
        source = candidate.source,
        impact_area = candidate.impact_area,
        probability = candidate.probability,
        impact = candidate.impact,
        urgency = candidate.urgency,
        status = candidate.status,
        response_strategy_type = candidate.response_strategy_type,
        response_strategy = candidate.response_strategy,
        preventive_action = candidate.preventive_action,
        contingency_plan = candidate.contingency_plan,
        trigger_condition = candidate.trigger_condition,
        tracking_method = candidate.tracking_method,
        owner = candidate.owner,
        due_date = candidate.due_date,
        next_review_date = candidate.next_review_date,
        closing_criteria = candidate.closing_criteria,
        linked_module = candidate.linked_module,
        evidence = candidate.evidence,
        workflow_step = candidate.workflow_step,
        current_input = candidate.current_input,
        current_output = candidate.current_output,
        last_action = candidate.last_action,
        action_owner = candidate.action_owner,
        action_deadline = candidate.action_deadline,
        triggered_at = candidate.triggered_at,
        closed_at = case when candidate.status = 'closed' then coalesce(current_risk.closed_at, now()) else null end,
        source_record_id = candidate.source_record_id,
        source_updated_at = candidate.source_updated_at,
        row_hash = candidate.row_hash,
        last_idempotency_key = normalized_key,
        updated_at = now()
    where id = current_risk.id
      and org_id = p_org_id
      and project_id = p_project_id
      and data_class = p_data_class
      and version = p_expected_version
    returning * into saved_risk;
    if saved_risk.id is null then raise exception 'VERSION_CONFLICT'; end if;
  else
    if p_expected_version <> 0 then raise exception 'VERSION_CONFLICT'; end if;
    candidate := jsonb_populate_record(null::public.risks, safe_payload);
    insert into public.risks (
      org_id, project_id, data_class, risk_code, project_name, description,
      category, stage, source, impact_area, probability, impact, urgency, status,
      response_strategy_type, response_strategy, preventive_action, contingency_plan,
      trigger_condition, tracking_method, owner, due_date, next_review_date,
      closing_criteria, linked_module, evidence, workflow_step, current_input,
      current_output, last_action, action_owner, action_deadline, triggered_at,
      closed_at, source_record_id, source_updated_at, row_hash,
      last_idempotency_key, updated_at
    ) values (
      p_org_id, p_project_id, p_data_class, normalized_code, candidate.project_name,
      coalesce(candidate.description, '未填写风险描述'), candidate.category,
      candidate.stage, candidate.source, candidate.impact_area,
      coalesce(candidate.probability, 3), coalesce(candidate.impact, 3),
      coalesce(candidate.urgency, 3), coalesce(candidate.status, 'identified'),
      candidate.response_strategy_type, candidate.response_strategy,
      candidate.preventive_action, candidate.contingency_plan,
      candidate.trigger_condition, candidate.tracking_method, candidate.owner,
      candidate.due_date, candidate.next_review_date, candidate.closing_criteria,
      candidate.linked_module, candidate.evidence,
      coalesce(candidate.workflow_step, 'identify'), candidate.current_input,
      candidate.current_output, candidate.last_action, candidate.action_owner,
      candidate.action_deadline, candidate.triggered_at,
      case when candidate.status = 'closed' then now() else null end,
      candidate.source_record_id, candidate.source_updated_at, candidate.row_hash,
      normalized_key, now()
    )
    on conflict (org_id, data_class, project_id, risk_code) do nothing
    returning * into saved_risk;
    if saved_risk.id is null then raise exception 'VERSION_CONFLICT'; end if;
  end if;

  result_payload := jsonb_build_object('risk', to_jsonb(saved_risk));
  insert into public.risk_operation_receipts (
    org_id, project_id, data_class, operation, idempotency_key,
    request_hash, result, actor_user_id
  ) values (
    p_org_id, p_project_id, p_data_class, 'upsert', normalized_key,
    request_hash, result_payload, p_actor_user_id
  );
  return result_payload;
end
$$;

create or replace function public.upsert_risk_batch_v61(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_items jsonb,
  p_batch_idempotency_key text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item jsonb;
  item_index integer := 0;
  item_result jsonb;
  saved_risks jsonb := '[]'::jsonb;
  normalized_batch_key text := nullif(trim(coalesce(p_batch_idempotency_key, '')), '');
begin
  if normalized_batch_key is null or length(normalized_batch_key) > 140 then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'RISK_BATCH_ARRAY_REQUIRED'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'BATCH_LIMIT_EXCEEDED'; end if;
  if jsonb_array_length(p_items) = 0 then return jsonb_build_object('risks', saved_risks); end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    select public.upsert_risk_v61(
      p_org_id,
      p_project_id,
      p_data_class,
      nullif(item->>'risk_id', '')::uuid,
      nullif(item->>'risk_code', ''),
      coalesce(item->'payload', '{}'::jsonb),
      (item->>'expected_version')::bigint,
      normalized_batch_key || ':' || item_index::text,
      p_actor_user_id
    ) into item_result;
    saved_risks := saved_risks || jsonb_build_array(item_result->'risk');
    item_index := item_index + 1;
  end loop;
  return jsonb_build_object('risks', saved_risks);
end
$$;

create or replace function public.transition_risk_v61(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_risk_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_risk_payload jsonb,
  p_event_payload jsonb,
  p_request_payload jsonb,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_risk public.risks%rowtype;
  candidate public.risks%rowtype;
  saved_risk public.risks%rowtype;
  event_candidate public.risk_workflow_events%rowtype;
  saved_event public.risk_workflow_events%rowtype;
  existing_receipt public.risk_operation_receipts%rowtype;
  normalized_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  safe_risk_payload jsonb;
  safe_event_payload jsonb;
  request_hash text;
  result_payload jsonb;
begin
  if normalized_key is null or length(normalized_key) > 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_risk_id is null then raise exception 'RISK_ID_REQUIRED'; end if;
  safe_risk_payload := coalesce(p_risk_payload, '{}'::jsonb)
    - array['id', 'org_id', 'project_id', 'data_class', 'version', 'risk_code', 'created_at', 'updated_at', 'closed_at', 'pi_score', 'priority_score', 'archived_at', 'archived_by', 'archive_reason'];
  safe_event_payload := coalesce(p_event_payload, '{}'::jsonb)
    - array['id', 'org_id', 'project_id', 'data_class', 'risk_id', 'risk_code', 'request_id', 'created_at'];
  request_hash := md5(jsonb_build_object(
    'operation', 'transition',
    'risk_id', p_risk_id,
    'request_payload', coalesce(p_request_payload, '{}'::jsonb),
    'expected_version', p_expected_version
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_data_class || ':' || p_project_id::text || ':' || normalized_key, 0));
  select * into existing_receipt
  from public.risk_operation_receipts
  where org_id = p_org_id and data_class = p_data_class
    and project_id = p_project_id and idempotency_key = normalized_key;
  if existing_receipt.id is not null then
    if existing_receipt.operation is distinct from 'transition' or existing_receipt.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return existing_receipt.result;
  end if;

  select * into current_risk
  from public.risks
  where id = p_risk_id
    and org_id = p_org_id
    and project_id = p_project_id
    and data_class = p_data_class
    and archived_at is null
  for update;
  if current_risk.id is null then raise exception 'RISK_NOT_FOUND_OR_OUTSIDE_SCOPE'; end if;
  if current_risk.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;

  candidate := jsonb_populate_record(current_risk, safe_risk_payload);
  update public.risks
  set status = candidate.status,
      workflow_step = candidate.workflow_step,
      current_input = candidate.current_input,
      current_output = candidate.current_output,
      last_action = candidate.last_action,
      action_owner = candidate.action_owner,
      action_deadline = candidate.action_deadline,
      owner = candidate.owner,
      due_date = candidate.due_date,
      evidence = candidate.evidence,
      closed_at = case when candidate.status = 'closed' then coalesce(current_risk.closed_at, now()) else null end,
      last_idempotency_key = normalized_key,
      updated_at = now()
  where id = p_risk_id
    and org_id = p_org_id
    and project_id = p_project_id
    and data_class = p_data_class
    and version = p_expected_version
  returning * into saved_risk;
  if saved_risk.id is null then raise exception 'VERSION_CONFLICT'; end if;

  event_candidate := jsonb_populate_record(null::public.risk_workflow_events, safe_event_payload);
  insert into public.risk_workflow_events (
    org_id, project_id, data_class, risk_id, risk_code, workflow_step,
    from_status, to_status, input_summary, output_summary, action_required,
    owner, deadline, evidence, actor, request_id
  ) values (
    p_org_id, p_project_id, p_data_class, saved_risk.id, saved_risk.risk_code,
    coalesce(event_candidate.workflow_step, saved_risk.workflow_step),
    event_candidate.from_status, saved_risk.status, event_candidate.input_summary,
    event_candidate.output_summary, event_candidate.action_required,
    event_candidate.owner, event_candidate.deadline, event_candidate.evidence,
    coalesce(event_candidate.actor, p_actor_user_id::text), normalized_key
  )
  returning * into saved_event;

  result_payload := jsonb_build_object('risk', to_jsonb(saved_risk), 'event', to_jsonb(saved_event));
  insert into public.risk_operation_receipts (
    org_id, project_id, data_class, operation, idempotency_key,
    request_hash, result, actor_user_id
  ) values (
    p_org_id, p_project_id, p_data_class, 'transition', normalized_key,
    request_hash, result_payload, p_actor_user_id
  );
  return result_payload;
end
$$;

create or replace function public.archive_risk_v61(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_risk_id uuid,
  p_expected_version bigint,
  p_idempotency_key text,
  p_archive_reason text default null,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_risk public.risks%rowtype;
  saved_risk public.risks%rowtype;
  saved_event public.risk_workflow_events%rowtype;
  existing_receipt public.risk_operation_receipts%rowtype;
  normalized_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  normalized_reason text := nullif(trim(coalesce(p_archive_reason, '')), '');
  request_hash text;
  result_payload jsonb;
begin
  if normalized_key is null or length(normalized_key) > 160 then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version < 1 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_risk_id is null then raise exception 'RISK_ID_REQUIRED'; end if;
  request_hash := md5(jsonb_build_object(
    'operation', 'archive', 'risk_id', p_risk_id,
    'reason', normalized_reason, 'expected_version', p_expected_version
  )::text);

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_data_class || ':' || p_project_id::text || ':' || normalized_key, 0));
  select * into existing_receipt
  from public.risk_operation_receipts
  where org_id = p_org_id and data_class = p_data_class
    and project_id = p_project_id and idempotency_key = normalized_key;
  if existing_receipt.id is not null then
    if existing_receipt.operation is distinct from 'archive' or existing_receipt.request_hash is distinct from request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return existing_receipt.result;
  end if;

  select * into current_risk
  from public.risks
  where id = p_risk_id
    and org_id = p_org_id
    and project_id = p_project_id
    and data_class = p_data_class
  for update;
  if current_risk.id is null then raise exception 'RISK_NOT_FOUND_OR_OUTSIDE_SCOPE'; end if;
  if current_risk.archived_at is not null then raise exception 'RISK_ALREADY_ARCHIVED'; end if;
  if current_risk.version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT'; end if;

  update public.risks
  set archived_at = now(),
      archived_by = p_actor_user_id,
      archive_reason = coalesce(normalized_reason, 'user_requested'),
      last_idempotency_key = normalized_key,
      updated_at = now()
  where id = p_risk_id
    and org_id = p_org_id
    and project_id = p_project_id
    and data_class = p_data_class
    and version = p_expected_version
  returning * into saved_risk;
  if saved_risk.id is null then raise exception 'VERSION_CONFLICT'; end if;

  insert into public.risk_workflow_events (
    org_id, project_id, data_class, risk_id, risk_code, workflow_step,
    from_status, to_status, input_summary, output_summary, action_required,
    owner, evidence, actor, request_id
  ) values (
    p_org_id, p_project_id, p_data_class, saved_risk.id, saved_risk.risk_code,
    coalesce(saved_risk.workflow_step, 'track'), saved_risk.status, saved_risk.status,
    '用户提交风险归档请求', '风险已软归档，原始记录与审计链保留',
    '如需恢复，须由治理人员执行受控恢复流程', saved_risk.owner,
    normalized_reason, p_actor_user_id::text, normalized_key
  )
  returning * into saved_event;

  result_payload := jsonb_build_object('risk', to_jsonb(saved_risk), 'event', to_jsonb(saved_event));
  insert into public.risk_operation_receipts (
    org_id, project_id, data_class, operation, idempotency_key,
    request_hash, result, actor_user_id
  ) values (
    p_org_id, p_project_id, p_data_class, 'archive', normalized_key,
    request_hash, result_payload, p_actor_user_id
  );
  return result_payload;
end
$$;

drop trigger if exists trg_validate_risk_scope_v61 on public.risks;
create trigger trg_validate_risk_scope_v61
before insert or update on public.risks
for each row execute function public.validate_risk_scope_v61();

drop trigger if exists trg_validate_risk_event_scope_v61 on public.risk_workflow_events;
create trigger trg_validate_risk_event_scope_v61
before insert or update on public.risk_workflow_events
for each row execute function public.validate_risk_event_scope_v61();

drop trigger if exists trg_sync_risk_quarantine_v61 on public.risks;
create trigger trg_sync_risk_quarantine_v61
after insert or update on public.risks
for each row execute function public.sync_risk_quarantine_v61();

create index if not exists idx_risks_v61_scope
  on public.risks(org_id, data_class, project_id, updated_at desc);
create index if not exists idx_risk_workflow_events_v61_scope
  on public.risk_workflow_events(org_id, data_class, project_id, created_at desc);
create index if not exists idx_risk_scope_quarantine_status
  on public.risk_scope_quarantine(quarantine_owner_org_id, status, detected_at desc);
create unique index if not exists idx_risks_v61_idempotency
  on public.risks(org_id, data_class, project_id, last_idempotency_key)
  where last_idempotency_key is not null;
create unique index if not exists idx_risk_events_v61_request
  on public.risk_workflow_events(org_id, data_class, project_id, request_id)
  where request_id is not null;
create index if not exists idx_risk_retrospective_assets_v61_scope
  on public.risk_retrospective_assets(org_id, data_class, project_id, updated_at desc);
create index if not exists idx_risk_retrospective_sync_logs_v61_scope
  on public.risk_retrospective_asset_sync_logs(org_id, data_class, project_id, created_at desc);
create index if not exists idx_risk_retrospective_usage_logs_v61_scope
  on public.risk_retrospective_asset_usage_logs(org_id, data_class, project_id, created_at desc);
create index if not exists idx_risk_retrospective_governance_logs_v61_scope
  on public.risk_retrospective_asset_governance_logs(org_id, data_class, project_id, created_at desc);
create index if not exists idx_risk_retrospective_followups_v61_scope
  on public.risk_retrospective_governance_followups(org_id, data_class, project_id, updated_at desc);
create index if not exists idx_risk_retrospective_snapshots_v61_scope
  on public.risk_retrospective_governance_operation_snapshots(org_id, data_class, project_id, snapshot_date desc);
create index if not exists idx_risk_retrospective_reminders_v61_scope
  on public.risk_retrospective_governance_reminder_logs(org_id, data_class, project_id, created_at desc);
create index if not exists idx_risk_retrospective_evidence_v61_scope
  on public.risk_retrospective_governance_evidence_links(org_id, data_class, project_id, updated_at desc);

alter table public.risks enable row level security;
alter table public.risk_workflow_events enable row level security;
alter table public.risk_scope_quarantine enable row level security;
alter table public.risk_operation_receipts enable row level security;
alter table public.risk_retrospective_assets enable row level security;
alter table public.risk_retrospective_asset_sync_logs enable row level security;
alter table public.risk_retrospective_asset_usage_logs enable row level security;
alter table public.risk_retrospective_asset_governance_logs enable row level security;
alter table public.risk_retrospective_governance_followups enable row level security;
alter table public.risk_retrospective_governance_operation_snapshots enable row level security;
alter table public.risk_retrospective_governance_reminder_logs enable row level security;
alter table public.risk_retrospective_governance_evidence_links enable row level security;

revoke all on table public.risks, public.risk_workflow_events, public.risk_scope_quarantine, public.risk_operation_receipts,
  public.risk_retrospective_assets, public.risk_retrospective_asset_sync_logs,
  public.risk_retrospective_asset_usage_logs, public.risk_retrospective_asset_governance_logs,
  public.risk_retrospective_governance_followups, public.risk_retrospective_governance_operation_snapshots,
  public.risk_retrospective_governance_reminder_logs, public.risk_retrospective_governance_evidence_links
from public, anon, authenticated;
grant select, insert, update, delete on table public.risks, public.risk_workflow_events, public.risk_scope_quarantine, public.risk_operation_receipts,
  public.risk_retrospective_assets, public.risk_retrospective_asset_sync_logs,
  public.risk_retrospective_asset_usage_logs, public.risk_retrospective_asset_governance_logs,
  public.risk_retrospective_governance_followups, public.risk_retrospective_governance_operation_snapshots,
  public.risk_retrospective_governance_reminder_logs, public.risk_retrospective_governance_evidence_links
to service_role;

revoke all on function public.validate_risk_scope_v61() from public, anon, authenticated;
revoke all on function public.validate_risk_event_scope_v61() from public, anon, authenticated;
revoke all on function public.sync_risk_quarantine_v61() from public, anon, authenticated;
revoke all on function public.audit_v61_risk_retrospective_scope() from public, anon, authenticated;
revoke all on function public.resolve_risk_quarantine_v61(uuid,uuid,uuid,text,uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function public.upsert_risk_v61(uuid,uuid,text,uuid,text,jsonb,bigint,text,uuid) from public, anon, authenticated;
revoke all on function public.upsert_risk_batch_v61(uuid,uuid,text,jsonb,text,uuid) from public, anon, authenticated;
revoke all on function public.transition_risk_v61(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.archive_risk_v61(uuid,uuid,text,uuid,bigint,text,text,uuid) from public, anon, authenticated;
grant execute on function public.validate_risk_scope_v61() to service_role;
grant execute on function public.validate_risk_event_scope_v61() to service_role;
grant execute on function public.sync_risk_quarantine_v61() to service_role;
grant execute on function public.audit_v61_risk_retrospective_scope() to service_role;
grant execute on function public.resolve_risk_quarantine_v61(uuid,uuid,uuid,text,uuid,bigint,text,text) to service_role;
grant execute on function public.upsert_risk_v61(uuid,uuid,text,uuid,text,jsonb,bigint,text,uuid) to service_role;
grant execute on function public.upsert_risk_batch_v61(uuid,uuid,text,jsonb,text,uuid) to service_role;
grant execute on function public.transition_risk_v61(uuid,uuid,text,uuid,bigint,text,jsonb,jsonb,jsonb,uuid) to service_role;
grant execute on function public.archive_risk_v61(uuid,uuid,text,uuid,bigint,text,text,uuid) to service_role;

notify pgrst, 'reload schema';
