-- AI PM System V5.4.0 P17/S1 operating foundation
-- Stable project identity, scoped business roles, management signals, evidence and service-only access.

create extension if not exists "uuid-ossp";

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  org_code text not null unique,
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.organizations (org_code, name)
values ('DEFAULT', '默认组织')
on conflict (org_code) do nothing;

create table if not exists public.organization_working_days (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_date date not null,
  is_workday boolean not null,
  calendar_version text not null default 'default-weekdays-v1',
  description text,
  created_at timestamptz not null default now(),
  unique (org_id, work_date, calendar_version)
);

alter table public.projects
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified',
  add column if not exists source_system text,
  add column if not exists source_record_id text;

update public.projects
set org_id = (select id from public.organizations where org_code = 'DEFAULT')
where org_id is null;

alter table public.projects alter column org_id set not null;

alter table public.projects drop constraint if exists projects_data_class_check;
alter table public.projects add constraint projects_data_class_check
  check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified'));

create table if not exists public.portfolios (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  portfolio_code text not null,
  name text not null,
  owner_user_id uuid references public.app_users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, portfolio_code)
);

create table if not exists public.portfolio_project_links (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  relationship_type text not null default 'member' check (relationship_type in ('member', 'dependency', 'benefit', 'funding')),
  created_at timestamptz not null default now(),
  unique (portfolio_id, project_id, relationship_type)
);

create table if not exists public.project_identity_mappings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  source_type text not null,
  source_container_id text not null default '',
  source_record_id text not null,
  external_project_code text,
  historical_project_name text,
  data_class text not null default 'unclassified'
    check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')),
  mapping_status text not null default 'active'
    check (mapping_status in ('active', 'conflict', 'orphan', 'merged', 'revoked')),
  conflict_detail jsonb not null default '{}'::jsonb,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, source_type, source_container_id, source_record_id),
  check (mapping_status in ('conflict', 'orphan') or project_id is not null)
);

create unique index if not exists idx_project_identity_org_external_code
  on public.project_identity_mappings(org_id, lower(external_project_code))
  where external_project_code is not null and mapping_status = 'active';

create table if not exists public.user_business_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null
    check (business_role in ('pm', 'operations', 'pmo', 'ceo', 'sponsor', 'business_owner', 'finance', 'quality')),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null
    check (subject_scope in ('project', 'portfolio', 'organization', 'customer', 'contract')),
  subject_id text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'revoked', 'expired')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_reason text,
  delegated_from_user_id uuid references public.app_users(id) on delete set null,
  assigned_by uuid references public.app_users(id) on delete set null,
  assignment_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index if not exists idx_user_business_roles_active_scope
  on public.user_business_roles(user_id, business_role, org_id, subject_scope, subject_id)
  where status = 'active';

create table if not exists public.business_reporting_relationships (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project', 'portfolio', 'organization')),
  subject_id text not null,
  from_user_id uuid not null references public.app_users(id) on delete cascade,
  from_business_role text not null,
  to_user_id uuid not null references public.app_users(id) on delete cascade,
  to_business_role text not null,
  relationship_type text not null default 'reports_to'
    check (relationship_type in ('reports_to', 'escalates_to', 'reviews', 'delegates_to')),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  check (from_business_role in ('pm', 'operations', 'pmo', 'ceo', 'sponsor', 'business_owner', 'finance', 'quality')),
  check (to_business_role in ('pm', 'operations', 'pmo', 'ceo', 'sponsor', 'business_owner', 'finance', 'quality')),
  check (valid_until is null or valid_until >= valid_from),
  check (from_user_id <> to_user_id or from_business_role <> to_business_role),
  unique (org_id, subject_scope, subject_id, from_user_id, from_business_role, to_user_id, to_business_role, relationship_type)
);

create table if not exists public.business_subject_links (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  target_type text not null,
  target_id text not null,
  relationship_type text not null default 'affects',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, source_type, source_id, target_type, target_id, relationship_type)
);

create table if not exists public.management_rule_versions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  scope_key text not null default 'global',
  rule_key text not null,
  version text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  configuration jsonb not null default '{}'::jsonb,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  effective_from timestamptz,
  effective_until timestamptz,
  created_at timestamptz not null default now()
);

-- Create the scoped identity before seeding so concurrent/repeated runners use
-- one atomic conflict path. A nullable org_id represents the global scope.
create unique index if not exists idx_management_rule_version_scope
  on public.management_rule_versions(coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), scope_key, rule_key, version);

insert into public.management_rule_versions (scope_key, rule_key, version, status, configuration)
values (
  'global',
  'milestone_delay',
  'S1-MILESTONE-DELAY-v1',
  'draft',
  '{"warning_workdays":1,"pmo_tolerance_workdays":3,"major_impacts":["criticalPath","stageGate","customerCommitment","acceptance","cash","majorRisk","crossProjectResource"],"over_authority_stop":"pending_decision_brief"}'::jsonb
)
on conflict (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), scope_key, rule_key, version) do nothing;

create table if not exists public.metric_definitions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  metric_key text not null,
  version text not null,
  name text not null,
  definition text not null,
  numerator_definition text,
  denominator_definition text,
  source_definition jsonb not null default '{}'::jsonb,
  freshness_sla_minutes integer,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.management_signals (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  subject_scope text not null
    check (subject_scope in ('project', 'portfolio', 'organization', 'customer', 'contract')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete restrict,
  data_class text not null default 'unclassified'
    check (data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified')),
  signal_type text not null,
  rule_version text not null,
  baseline_version text,
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  route text not null check (route in ('action', 'escalation')),
  status text not null default 'detected'
    check (status in ('detected', 'pending_verification', 'verified', 'rejected', 'under_review', 'action_required', 'action_in_progress', 'evidence_submitted', 'closed', 're_escalated', 'pending_decision_brief')),
  title text not null,
  summary text,
  impact jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  dedup_key text not null,
  owner_user_id uuid references public.app_users(id) on delete set null,
  reviewer_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz,
  source_type text not null,
  source_id text not null,
  snapshot_at timestamptz not null default now(),
  version bigint not null default 1,
  verified_at timestamptz,
  reviewed_at timestamptz,
  closed_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, dedup_key),
  check (subject_scope <> 'project' or (project_id is not null and subject_id = project_id::text))
);

create table if not exists public.management_signal_events (
  id uuid primary key default uuid_generate_v4(),
  signal_id uuid not null references public.management_signals(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_business_role text,
  comment text,
  reason_code text,
  evidence jsonb not null default '[]'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.management_escalations (
  id uuid primary key default uuid_generate_v4(),
  signal_id uuid not null references public.management_signals(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  subject_scope text not null,
  subject_id text not null,
  project_id uuid references public.projects(id) on delete restrict,
  status text not null default 'pending_decision_brief'
    check (status in ('pending_decision_brief', 'brief_created', 'withdrawn', 'resolved')),
  escalation_level text not null default 'pmo'
    check (escalation_level in ('project', 'pmo', 'executive')),
  reason text not null,
  impact jsonb not null default '{}'::jsonb,
  owner_user_id uuid references public.app_users(id) on delete set null,
  from_user_id uuid references public.app_users(id) on delete set null,
  target_business_role text not null default 'pmo'
    check (target_business_role in ('pmo', 'ceo', 'sponsor', 'business_owner')),
  target_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (signal_id, status)
);

create table if not exists public.evidence_links (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_type text not null,
  subject_id text not null,
  evidence_type text not null,
  source_type text not null,
  source_id text not null,
  source_url text,
  title text not null,
  content_hash text,
  version text,
  visibility text not null default 'internal'
    check (visibility in ('public', 'internal', 'restricted', 'confidential')),
  valid_until timestamptz,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, subject_type, subject_id, source_type, source_id, version)
);

alter table public.user_project_access_grants
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

alter table public.project_issues
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

alter table public.project_changes
  add column if not exists project_id uuid references public.projects(id) on delete restrict;

alter table public.governance_process_instances
  add column if not exists canonical_project_id uuid references public.projects(id) on delete restrict;

alter table public.unified_action_items
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists subject_scope text,
  add column if not exists subject_id text,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists owner_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists reviewer_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists acceptance_criteria text,
  add column if not exists evidence jsonb not null default '[]'::jsonb,
  add column if not exists evidence_expires_at timestamptz,
  add column if not exists effect_review jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists reviewer_completed_at timestamptz;

alter table public.unified_action_items
  add column if not exists version bigint not null default 1;

alter table public.unified_action_items drop constraint if exists unified_action_items_source_type_check;
alter table public.unified_action_items add constraint unified_action_items_source_type_check
  check (source_type in ('risk', 'issue', 'change', 'governance', 'signal', 'decision', 'report', 'cadence', 'manual'));

alter table public.unified_action_items drop constraint if exists unified_action_items_status_check;
alter table public.unified_action_items add constraint unified_action_items_status_check
  check (status in ('open', 'assigned', 'accepted', 'rejected', 'in_progress', 'evidence_submitted', 'done', 'closed', 're_escalated', 'cancelled', 'overdue'));

create unique index if not exists idx_unified_action_idempotency
  on public.unified_action_items(idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_management_rule_version_scope
  on public.management_rule_versions(coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), scope_key, rule_key, version);
create unique index if not exists idx_metric_definition_version_scope
  on public.metric_definitions(coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, version);
create unique index if not exists idx_management_signal_event_request
  on public.management_signal_events(signal_id, request_id, event_type)
  where request_id is not null;

create index if not exists idx_project_identity_project on public.project_identity_mappings(project_id, mapping_status);
create index if not exists idx_project_issues_project_id on public.project_issues(project_id, status);
create index if not exists idx_project_changes_project_id on public.project_changes(project_id, status);
create index if not exists idx_governance_canonical_project_id on public.governance_process_instances(canonical_project_id, state);
create index if not exists idx_business_roles_user_scope on public.user_business_roles(user_id, org_id, subject_scope, subject_id, status);
create index if not exists idx_reporting_relationships_from on public.business_reporting_relationships(from_user_id, status);
create index if not exists idx_reporting_relationships_to on public.business_reporting_relationships(to_user_id, status);
create index if not exists idx_management_signals_subject on public.management_signals(org_id, subject_scope, subject_id, status);
create index if not exists idx_management_signals_project on public.management_signals(project_id, status, updated_at desc);
create index if not exists idx_management_signals_owner on public.management_signals(owner_user_id, status, due_at);
create index if not exists idx_management_signal_events_signal on public.management_signal_events(signal_id, created_at);
create index if not exists idx_management_escalations_status on public.management_escalations(status, due_at);
create index if not exists idx_evidence_links_subject on public.evidence_links(subject_type, subject_id, created_at desc);
create index if not exists idx_working_days_org_date on public.organization_working_days(org_id, work_date);

create or replace function public.enforce_p17_project_org_consistency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_org uuid;
  v_project_data_class text;
  v_portfolio_org uuid;
begin
  if tg_table_name = 'portfolio_project_links' then
    select org_id into v_project_org from public.projects where id = new.project_id;
    select org_id into v_portfolio_org from public.portfolios where id = new.portfolio_id;
    if v_project_org is null or v_portfolio_org is null or new.org_id <> v_project_org or new.org_id <> v_portfolio_org then
      raise exception 'P17_ORG_MISMATCH: portfolio/project/organization must match';
    end if;
  elsif tg_table_name = 'project_identity_mappings' and new.project_id is not null then
    select org_id into v_project_org from public.projects where id = new.project_id;
    if v_project_org is null or new.org_id <> v_project_org then raise exception 'P17_ORG_MISMATCH: identity/project'; end if;
  elsif tg_table_name = 'management_signals' and new.project_id is not null then
    select org_id, data_class into v_project_org, v_project_data_class from public.projects where id = new.project_id;
    if v_project_org is null or new.org_id <> v_project_org then raise exception 'P17_ORG_MISMATCH: signal/project'; end if;
    if new.data_class <> v_project_data_class then raise exception 'P17_DATA_CLASS_MISMATCH: signal/project'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_p17_portfolio_project_org on public.portfolio_project_links;
create trigger trg_p17_portfolio_project_org before insert or update on public.portfolio_project_links
for each row execute function public.enforce_p17_project_org_consistency();
drop trigger if exists trg_p17_identity_project_org on public.project_identity_mappings;
create trigger trg_p17_identity_project_org before insert or update on public.project_identity_mappings
for each row execute function public.enforce_p17_project_org_consistency();
drop trigger if exists trg_p17_signal_project_org on public.management_signals;
create trigger trg_p17_signal_project_org before insert or update on public.management_signals
for each row execute function public.enforce_p17_project_org_consistency();

create or replace function public.add_org_workdays(p_org_id uuid, p_start date, p_days integer)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_date date := p_start;
  v_count integer := 0;
  v_is_workday boolean;
begin
  if p_days < 0 then raise exception 'p_days must be non-negative'; end if;
  while v_count < p_days loop
    v_date := v_date + 1;
    select is_workday into v_is_workday
    from public.organization_working_days
    where org_id = p_org_id and work_date = v_date
    order by calendar_version desc limit 1;
    v_is_workday := coalesce(v_is_workday, extract(isodow from v_date) between 1 and 5);
    if v_is_workday then v_count := v_count + 1; end if;
  end loop;
  return v_date;
end;
$$;

create or replace function public.apply_project_identity_backfill_tx(
  p_org_id uuid,
  p_entries jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry jsonb;
  v_project_id uuid;
  v_created integer := 0;
  v_reused integer := 0;
  v_conflicts integer := 0;
begin
  if jsonb_typeof(p_entries) <> 'array' then raise exception 'P17_BACKFILL_ENTRIES_MUST_BE_ARRAY'; end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if v_entry->>'action' = 'conflict' then
      insert into public.project_identity_mappings(org_id,project_id,source_type,source_container_id,source_record_id,external_project_code,historical_project_name,data_class,mapping_status,conflict_detail,updated_at)
      values (p_org_id,null,v_entry->>'source_type',coalesce(v_entry->>'source_container_id',''),v_entry->>'source_record_id',nullif(v_entry->>'external_project_code',''),v_entry->>'project_name',v_entry->>'data_class','conflict',jsonb_build_object('reason',v_entry->>'reason'),now())
      on conflict (org_id,source_type,source_container_id,source_record_id) do update set project_id=null,external_project_code=excluded.external_project_code,historical_project_name=excluded.historical_project_name,data_class=excluded.data_class,mapping_status='conflict',conflict_detail=excluded.conflict_detail,updated_at=now();
      v_conflicts := v_conflicts + 1;
      continue;
    end if;
    v_project_id := nullif(v_entry->>'project_id','')::uuid;
    if v_entry->>'action' = 'create' then
      insert into public.projects(org_id,name,oa_no,status,progress,project_level,is_key_project,contract_amount,collection_amount,receivable,data_class,source_system,source_record_id)
      values (
        p_org_id,v_entry->>'project_name',nullif(v_entry->>'external_project_code',''),coalesce(v_entry#>>'{project,status}','active'),
        coalesce((v_entry#>>'{project,progress}')::integer,0),nullif(v_entry#>>'{project,project_level}',''),coalesce((v_entry#>>'{project,is_key_project}')::boolean,false),
        nullif(v_entry#>>'{project,contract_amount}','')::numeric,coalesce(nullif(v_entry#>>'{project,collection_amount}','')::numeric,0),coalesce(nullif(v_entry#>>'{project,receivable}','')::numeric,0),
        v_entry->>'data_class','feishu',v_entry->>'source_record_id'
      ) returning id into v_project_id;
      v_created := v_created + 1;
    else
      if v_project_id is null or not exists (select 1 from public.projects where id=v_project_id and org_id=p_org_id) then raise exception 'P17_BACKFILL_PROJECT_NOT_FOUND:%',v_entry->>'source_record_id'; end if;
      v_reused := v_reused + 1;
    end if;
    insert into public.project_identity_mappings(org_id,project_id,source_type,source_container_id,source_record_id,external_project_code,historical_project_name,data_class,mapping_status,conflict_detail,verified_by,verified_at,updated_at)
    values (p_org_id,v_project_id,v_entry->>'source_type',coalesce(v_entry->>'source_container_id',''),v_entry->>'source_record_id',nullif(v_entry->>'external_project_code',''),v_entry->>'project_name',v_entry->>'data_class','active','{}'::jsonb,p_actor_user_id,now(),now())
    on conflict (org_id,source_type,source_container_id,source_record_id) do update set project_id=excluded.project_id,external_project_code=excluded.external_project_code,historical_project_name=excluded.historical_project_name,data_class=excluded.data_class,mapping_status='active',conflict_detail='{}'::jsonb,verified_by=excluded.verified_by,verified_at=now(),updated_at=now();
  end loop;
  return jsonb_build_object('create',v_created,'reuse',v_reused,'conflict',v_conflicts);
end;
$$;

create or replace function public.transition_management_signal_tx(
  p_signal_id uuid,
  p_expected_status text,
  p_next_status text,
  p_event_type text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_reason_code text,
  p_evidence jsonb,
  p_request_id text
)
returns public.management_signals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.management_signals;
begin
  select * into v_signal from public.management_signals where id = p_signal_id for update;
  if not found then raise exception 'MANAGEMENT_SIGNAL_NOT_FOUND'; end if;
  if exists (select 1 from public.management_signal_events where signal_id = p_signal_id and request_id = p_request_id and event_type = p_event_type) then
    return v_signal;
  end if;
  if v_signal.status <> p_expected_status then raise exception 'MANAGEMENT_SIGNAL_CONFLICT:%', v_signal.status; end if;
  update public.management_signals set
    status = p_next_status,
    reviewer_user_id = case when p_next_status in ('under_review','action_required','pending_decision_brief') then p_actor_user_id else reviewer_user_id end,
    verified_at = case when p_next_status = 'verified' then now() else verified_at end,
    reviewed_at = case when p_next_status in ('under_review','action_required','pending_decision_brief') then now() else reviewed_at end,
    closed_at = case when p_next_status = 'closed' then now() when p_event_type = 'reopen' then null else closed_at end,
    updated_by = p_actor_user_id,
    updated_at = now(),
    version = version + 1
  where id = p_signal_id
  returning * into v_signal;
  insert into public.management_signal_events(signal_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,reason_code,evidence,request_id)
  values (p_signal_id,p_event_type,p_expected_status,p_next_status,p_actor_user_id,p_actor_business_role,p_comment,p_reason_code,coalesce(p_evidence,'[]'::jsonb),p_request_id);
  return v_signal;
end;
$$;

create or replace function public.route_management_signal_tx(
  p_signal_id uuid,
  p_expected_status text,
  p_next_status text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_request_id text,
  p_action_due_date date,
  p_escalation_target_user_id uuid,
  p_escalation_target_role text,
  p_escalation_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.management_signals;
  v_action_id uuid;
  v_escalation_id uuid;
  v_event_type text;
begin
  select * into v_signal from public.management_signals where id = p_signal_id for update;
  if not found then raise exception 'MANAGEMENT_SIGNAL_NOT_FOUND'; end if;
  v_event_type := case when v_signal.route = 'action' then 'route_action' else 'escalate' end;
  if exists (select 1 from public.management_signal_events where signal_id = p_signal_id and request_id = p_request_id and event_type = v_event_type) then
    select id into v_action_id from public.unified_action_items where idempotency_key = 'signal:' || p_signal_id::text || ':corrective-action';
    select id into v_escalation_id from public.management_escalations where signal_id = p_signal_id and status = 'pending_decision_brief';
    return jsonb_build_object('signal',to_jsonb(v_signal),'action_id',v_action_id,'escalation_id',v_escalation_id);
  end if;
  if v_signal.status <> p_expected_status then raise exception 'MANAGEMENT_SIGNAL_CONFLICT:%', v_signal.status; end if;
  if v_signal.route = 'action' then
    insert into public.unified_action_items(source_type,source_id,org_id,subject_scope,subject_id,project_id,title,owner_user_id,status,priority,due_date,acceptance_criteria,idempotency_key,metadata,created_by,updated_at)
    values ('signal',v_signal.id::text,v_signal.org_id,v_signal.subject_scope,v_signal.subject_id,v_signal.project_id,'纠偏行动：'||v_signal.title,v_signal.owner_user_id,case when v_signal.owner_user_id is null then 'open' else 'assigned' end,'P0',p_action_due_date,'完成纠偏措施、更新业务事实并提交可验证证据，由PMO复核效果。','signal:'||v_signal.id::text||':corrective-action',jsonb_build_object('signal_id',v_signal.id,'impact',v_signal.impact),p_actor_user_id,now())
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning id into v_action_id;
    if v_action_id is null then select id into v_action_id from public.unified_action_items where idempotency_key = 'signal:'||v_signal.id::text||':corrective-action'; end if;
  else
    insert into public.management_escalations(signal_id,org_id,subject_scope,subject_id,project_id,status,escalation_level,reason,impact,owner_user_id,from_user_id,target_business_role,target_user_id,due_at,request_id,updated_at)
    values (v_signal.id,v_signal.org_id,v_signal.subject_scope,v_signal.subject_id,v_signal.project_id,'pending_decision_brief','pmo',coalesce(nullif(p_comment,''),'超出当前授权容差。'),v_signal.impact,p_escalation_target_user_id,v_signal.owner_user_id,coalesce(p_escalation_target_role,'pmo'),p_escalation_target_user_id,p_escalation_due_at,p_request_id,now())
    on conflict (signal_id,status) do update set reason=excluded.reason,target_business_role=excluded.target_business_role,target_user_id=excluded.target_user_id,due_at=excluded.due_at,request_id=excluded.request_id,updated_at=now()
    returning id into v_escalation_id;
  end if;
  update public.management_signals set status=p_next_status,reviewer_user_id=p_actor_user_id,reviewed_at=now(),updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_signal_id returning * into v_signal;
  insert into public.management_signal_events(signal_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,evidence,request_id)
  values (p_signal_id,v_event_type,p_expected_status,p_next_status,p_actor_user_id,p_actor_business_role,p_comment,'[]'::jsonb,p_request_id);
  return jsonb_build_object('signal',to_jsonb(v_signal),'action_id',v_action_id,'escalation_id',v_escalation_id);
end;
$$;

create or replace function public.transition_signal_action_tx(
  p_signal_id uuid,
  p_action_id uuid,
  p_expected_action_status text,
  p_next_action_status text,
  p_expected_signal_status text,
  p_next_signal_status text,
  p_operation text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_evidence jsonb,
  p_effect_review jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_signal public.management_signals;
  v_action public.unified_action_items;
  v_item jsonb;
  v_verified_count integer;
begin
  select * into v_signal from public.management_signals where id=p_signal_id for update;
  if not found then raise exception 'MANAGEMENT_SIGNAL_NOT_FOUND'; end if;
  select * into v_action from public.unified_action_items where id=p_action_id and source_type='signal' and source_id=p_signal_id::text for update;
  if not found then raise exception 'SIGNAL_ACTION_NOT_FOUND'; end if;
  if exists (select 1 from public.management_signal_events where signal_id=p_signal_id and request_id=p_request_id and event_type='action_'||p_operation) then
    return jsonb_build_object('signal',to_jsonb(v_signal),'action',to_jsonb(v_action));
  end if;
  if v_action.status <> p_expected_action_status then raise exception 'SIGNAL_ACTION_CONFLICT:%',v_action.status; end if;
  if p_next_signal_status is not null and v_signal.status <> p_expected_signal_status then raise exception 'MANAGEMENT_SIGNAL_CONFLICT:%',v_signal.status; end if;
  if p_operation='verify_evidence' then
    update public.evidence_links evidence set
      verified_by=p_actor_user_id,
      verified_at=now(),
      metadata=coalesce(evidence.metadata,'{}'::jsonb)||jsonb_build_object('action_id',p_action_id,'verified_business_role',p_actor_business_role)
    where evidence.org_id=v_signal.org_id
      and evidence.subject_type='management_signal'
      and evidence.subject_id=v_signal.id::text
      and evidence.metadata->>'action_id'=p_action_id::text
      and exists (
        select 1 from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) item
        where item->>'sourceType'=evidence.source_type and item->>'sourceId'=evidence.source_id
      );
    get diagnostics v_verified_count = row_count;
    if v_verified_count <> jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) then
      raise exception 'SIGNAL_ACTION_EVIDENCE_NOT_REGISTERED';
    end if;
  end if;
  if p_operation='close' then
    select count(*) into v_verified_count
    from public.evidence_links evidence
    where evidence.org_id=v_signal.org_id
      and evidence.subject_type='management_signal'
      and evidence.subject_id=v_signal.id::text
      and evidence.metadata->>'action_id'=p_action_id::text
      and evidence.verified_by is not null
      and evidence.verified_at is not null
      and exists (
        select 1 from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) item
        where item->>'sourceType'=evidence.source_type and item->>'sourceId'=evidence.source_id
      );
    if v_verified_count <> jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) then
      raise exception 'SIGNAL_ACTION_EVIDENCE_NOT_VERIFIED';
    end if;
  end if;
  update public.unified_action_items set
    status=p_next_action_status,
    accepted_at=case when p_operation='accept' then now() else accepted_at end,
    rejected_at=case when p_operation='reject' then now() else rejected_at end,
    metadata=case when p_operation='reject' then coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rejection_reason',p_comment) else metadata end,
    evidence=case when p_operation='submit_evidence' then coalesce(p_evidence,'[]'::jsonb) else evidence end,
    close_evidence=case when p_operation='submit_evidence' then (select string_agg(coalesce(item->>'title','证据')||'('||coalesce(item->>'sourceType','source')||':'||coalesce(item->>'sourceId','id')||')','；') from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) item) else close_evidence end,
    effect_review=case when p_operation='close' then coalesce(p_effect_review,'{}'::jsonb) else effect_review end,
    reviewer_user_id=case when p_operation='close' then p_actor_user_id else reviewer_user_id end,
    reviewer_completed_at=case when p_operation='close' then now() else reviewer_completed_at end,
    closed_at=case when p_operation='close' then now() when p_operation='reopen' then null else closed_at end,
    updated_at=now(),
    version=version+1
  where id=p_action_id returning * into v_action;
  if p_operation='submit_evidence' then
    for v_item in select value from jsonb_array_elements(coalesce(p_evidence,'[]'::jsonb)) loop
      insert into public.evidence_links(org_id,subject_type,subject_id,evidence_type,source_type,source_id,title,version,valid_until,metadata)
      values (v_signal.org_id,'management_signal',v_signal.id::text,'action_closure',v_item->>'sourceType',v_item->>'sourceId',v_item->>'title','1',nullif(v_item->>'validUntil','')::timestamptz,jsonb_build_object('action_id',p_action_id))
      on conflict (org_id,subject_type,subject_id,source_type,source_id,version) do update set title=excluded.title,valid_until=excluded.valid_until,metadata=excluded.metadata;
    end loop;
  end if;
  if p_next_signal_status is not null then
    update public.management_signals set
      status=p_next_signal_status,
      closed_at=case when p_next_signal_status='closed' then now() when p_operation='reopen' then null else closed_at end,
      updated_by=p_actor_user_id,updated_at=now(),version=version+1
    where id=p_signal_id returning * into v_signal;
  end if;
  insert into public.management_signal_events(signal_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,evidence,request_id)
  values (p_signal_id,'action_'||p_operation,p_expected_signal_status,coalesce(p_next_signal_status,p_expected_signal_status),p_actor_user_id,p_actor_business_role,p_comment,coalesce(p_evidence,'[]'::jsonb),p_request_id);
  return jsonb_build_object('signal',to_jsonb(v_signal),'action',to_jsonb(v_action));
end;
$$;

alter table public.organizations enable row level security;
alter table public.organization_working_days enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_project_links enable row level security;
alter table public.project_identity_mappings enable row level security;
alter table public.user_business_roles enable row level security;
alter table public.business_reporting_relationships enable row level security;
alter table public.business_subject_links enable row level security;
alter table public.management_rule_versions enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.management_signals enable row level security;
alter table public.management_signal_events enable row level security;
alter table public.management_escalations enable row level security;
alter table public.evidence_links enable row level security;

-- Custom app sessions are enforced by server routes. No browser role may bypass them through PostgREST.
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_working_days from anon, authenticated;
revoke all on table public.portfolios from anon, authenticated;
revoke all on table public.portfolio_project_links from anon, authenticated;
revoke all on table public.project_identity_mappings from anon, authenticated;
revoke all on table public.user_business_roles from anon, authenticated;
revoke all on table public.business_reporting_relationships from anon, authenticated;
revoke all on table public.business_subject_links from anon, authenticated;
revoke all on table public.management_rule_versions from anon, authenticated;
revoke all on table public.metric_definitions from anon, authenticated;
revoke all on table public.management_signals from anon, authenticated;
revoke all on table public.management_signal_events from anon, authenticated;
revoke all on table public.management_escalations from anon, authenticated;
revoke all on table public.evidence_links from anon, authenticated;

grant select, insert, update, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.organization_working_days to service_role;
grant select, insert, update, delete on table public.portfolios to service_role;
grant select, insert, update, delete on table public.portfolio_project_links to service_role;
grant select, insert, update, delete on table public.project_identity_mappings to service_role;
grant select, insert, update, delete on table public.user_business_roles to service_role;
grant select, insert, update, delete on table public.business_reporting_relationships to service_role;
grant select, insert, update, delete on table public.business_subject_links to service_role;
grant select, insert, update, delete on table public.management_rule_versions to service_role;
grant select, insert, update, delete on table public.metric_definitions to service_role;
grant select, insert, update, delete on table public.management_signals to service_role;
grant select, insert, update, delete on table public.management_signal_events to service_role;
grant select, insert, update, delete on table public.management_escalations to service_role;
grant select, insert, update, delete on table public.evidence_links to service_role;

revoke all on function public.add_org_workdays(uuid,date,integer) from public, anon, authenticated;
revoke all on function public.apply_project_identity_backfill_tx(uuid,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.transition_management_signal_tx(uuid,text,text,text,uuid,text,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.route_management_signal_tx(uuid,text,text,uuid,text,text,text,date,uuid,text,timestamptz) from public, anon, authenticated;
revoke all on function public.transition_signal_action_tx(uuid,uuid,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.add_org_workdays(uuid,date,integer) to service_role;
grant execute on function public.apply_project_identity_backfill_tx(uuid,jsonb,uuid) to service_role;
grant execute on function public.transition_management_signal_tx(uuid,text,text,text,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.route_management_signal_tx(uuid,text,text,uuid,text,text,text,date,uuid,text,timestamptz) to service_role;
grant execute on function public.transition_signal_action_tx(uuid,uuid,text,text,text,text,text,uuid,text,text,jsonb,jsonb,text) to service_role;

-- Close legacy anonymous access to core business data. Existing application access is server-side service_role.
drop policy if exists "Public read" on public.projects;
drop policy if exists "Public insert" on public.projects;
drop policy if exists "Public update" on public.projects;
drop policy if exists "Public read" on public.risks;
drop policy if exists "Public insert" on public.risks;
drop policy if exists "Public update" on public.risks;
drop policy if exists "Public read" on public.risk_workflow_events;
drop policy if exists "Public insert" on public.risk_workflow_events;
drop policy if exists "Public update" on public.risk_workflow_events;
drop policy if exists "Public read" on public.contracts;
drop policy if exists "Public read" on public.payment_milestones;
drop policy if exists "Public read" on public.stakeholders;

revoke all on table public.projects, public.risks, public.risk_workflow_events,
  public.contracts, public.payment_milestones, public.stakeholders, public.tasks,
  public.project_issues, public.project_changes, public.unified_action_items,
  public.issue_change_events, public.governance_process_instances,
  public.governance_process_events, public.governance_process_actions
from anon, authenticated;

grant select, insert, update, delete on table public.projects, public.risks, public.risk_workflow_events,
  public.contracts, public.payment_milestones, public.stakeholders, public.tasks,
  public.project_issues, public.project_changes, public.unified_action_items,
  public.issue_change_events, public.governance_process_instances,
  public.governance_process_events, public.governance_process_actions
to service_role;
