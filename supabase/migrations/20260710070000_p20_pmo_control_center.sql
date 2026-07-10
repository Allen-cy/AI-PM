-- AI PM System V5.5 P20 PMO portfolio governance and operating cadence.

create table if not exists public.operating_cadences (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  cadence_type text not null check (cadence_type in ('daily_exception','weekly_portfolio','monthly_operating','quarterly_portfolio')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','preparing','ready','in_meeting','minutes_pending','actions_pending','effect_review','closed','cancelled')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  facilitator_user_id uuid references public.app_users(id) on delete set null,
  agenda jsonb not null default '[]'::jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  conclusions jsonb not null default '[]'::jsonb,
  meeting_reference text,
  due_at timestamptz not null,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (org_id, portfolio_id, cadence_type, period_start, data_class)
);

create table if not exists public.project_dependencies (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  from_project_id uuid not null references public.projects(id) on delete cascade,
  to_project_id uuid not null references public.projects(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('schedule','deliverable','resource','technical','commercial','customer','cash')),
  description text not null,
  status text not null default 'identified' check (status in ('identified','confirmed','monitoring','blocked','evidence_submitted','verified','resolved','reopened','cancelled')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  due_date date not null,
  resolution_criteria text not null,
  evidence jsonb not null default '[]'::jsonb,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_project_id <> to_project_id),
  unique (org_id, from_project_id, to_project_id, dependency_type, data_class)
);

create table if not exists public.resource_capacity_snapshots (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  owner_name text not null,
  role_name text not null,
  period_start date not null,
  period_end date not null,
  capacity_hours numeric(12,2) not null check (capacity_hours >= 0),
  demand_hours numeric(12,2) not null check (demand_hours >= 0),
  allocation_detail jsonb not null default '[]'::jsonb,
  source_snapshot_at timestamptz not null,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (nullif(trim(owner_name),'') is not null and nullif(trim(role_name),'') is not null)
);

create table if not exists public.data_quality_issues (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  subject_type text not null,
  subject_id text not null,
  rule_key text not null,
  field_name text,
  severity text not null check (severity in ('low','medium','high','critical')),
  description text not null,
  status text not null default 'open' check (status in ('open','assigned','in_progress','evidence_submitted','closed','waived','reopened')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz not null,
  closure_evidence jsonb not null default '[]'::jsonb,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  dedup_key text not null,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (org_id, data_class, dedup_key)
);

create index if not exists idx_operating_cadences_status on public.operating_cadences(org_id,data_class,status,period_start);
create index if not exists idx_project_dependencies_scope on public.project_dependencies(org_id,data_class,status,from_project_id,to_project_id);
create index if not exists idx_capacity_conflicts on public.resource_capacity_snapshots(org_id,data_class,period_start,demand_hours,capacity_hours);
create index if not exists idx_data_quality_inbox on public.data_quality_issues(org_id,data_class,status,severity,due_at);
create unique index if not exists idx_capacity_snapshot_scope
  on public.resource_capacity_snapshots(org_id,coalesce(portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid),owner_name,role_name,period_start,data_class);
create unique index if not exists idx_operating_cadence_scope
  on public.operating_cadences(org_id,coalesce(portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid),cadence_type,period_start,data_class);

alter table public.operating_cadences enable row level security;
alter table public.project_dependencies enable row level security;
alter table public.resource_capacity_snapshots enable row level security;
alter table public.data_quality_issues enable row level security;

revoke all on table public.operating_cadences,public.project_dependencies,public.resource_capacity_snapshots,public.data_quality_issues from public,anon,authenticated;
grant select,insert,update,delete on table public.operating_cadences,public.project_dependencies,public.resource_capacity_snapshots,public.data_quality_issues to service_role;

-- P20 completion: executable data-quality, cadence, capacity and S/A/B/C rule loops.

alter table public.operating_cadences add column if not exists frozen_at timestamptz;
alter table public.operating_cadences add column if not exists frozen_snapshot jsonb not null default '{}'::jsonb;
alter table public.operating_cadences add column if not exists effect_review jsonb not null default '{}'::jsonb;
alter table public.operating_cadences add column if not exists review_comment text;
alter table public.operating_cadences add column if not exists closed_at timestamptz;
alter table public.operating_cadences add column if not exists cancelled_at timestamptz;
alter table public.operating_cadences add column if not exists cancellation_reason text;

alter table public.data_quality_issues add column if not exists correction_summary text;
alter table public.data_quality_issues add column if not exists review_comment text;
alter table public.data_quality_issues add column if not exists evidence_submitted_at timestamptz;
alter table public.data_quality_issues add column if not exists reopened_at timestamptz;

alter table public.resource_capacity_snapshots add column if not exists plan_id uuid;
alter table public.resource_capacity_snapshots add column if not exists plan_version integer not null default 1;
alter table public.project_dependencies add column if not exists review_comment text;
alter table public.project_dependencies add column if not exists evidence_submitted_at timestamptz;
alter table public.project_dependencies add column if not exists verified_at timestamptz;
alter table public.project_dependencies add column if not exists resolved_at timestamptz;
alter table public.project_dependencies add column if not exists reopened_at timestamptz;
alter table public.project_dependencies drop constraint if exists project_dependencies_status_check;
alter table public.project_dependencies add constraint project_dependencies_status_check
  check (status in ('identified','confirmed','monitoring','blocked','evidence_submitted','verified','resolved','reopened','cancelled'));
alter table public.resource_capacity_snapshots drop constraint if exists resource_capacity_snapshots_org_id_owner_name_role_name_period_start_data_class_key;
alter table public.data_quality_issues drop constraint if exists data_quality_issues_org_id_dedup_key_key;
create unique index if not exists idx_data_quality_scope_dedup on public.data_quality_issues(org_id,data_class,dedup_key);

create table if not exists public.governance_cadence_actions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  cadence_id uuid not null references public.operating_cadences(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  description text not null default '',
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  due_at timestamptz not null,
  status text not null default 'assigned' check (status in ('assigned','accepted','in_progress','evidence_submitted','effect_review','closed','reopened','cancelled')),
  completion_evidence jsonb not null default '[]'::jsonb,
  effect_review jsonb not null default '{}'::jsonb,
  review_comment text,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.resource_capacity_allocations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  capacity_snapshot_id uuid not null references public.resource_capacity_snapshots(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  allocated_hours numeric(12,2) not null check (allocated_hours >= 0),
  allocation_note text,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (capacity_snapshot_id, project_id)
);

create table if not exists public.capacity_conflict_actions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  capacity_snapshot_id uuid not null references public.resource_capacity_snapshots(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  overload_hours numeric(12,2) not null check (overload_hours > 0),
  action_title text not null,
  action_plan text,
  due_at timestamptz not null,
  status text not null default 'assigned' check (status in ('assigned','accepted','in_progress','evidence_submitted','verified','closed','reopened','cancelled')),
  resolution_evidence jsonb not null default '[]'::jsonb,
  review_comment text,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (capacity_snapshot_id)
);

create table if not exists public.data_quality_issue_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  issue_id uuid not null references public.data_quality_issues(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  idempotency_key text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create table if not exists public.project_dependency_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  dependency_id uuid not null references public.project_dependencies(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  idempotency_key text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  unique (org_id,data_class,idempotency_key)
);

create table if not exists public.project_level_rule_matrices (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  rules jsonb not null,
  change_reason text not null,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  effective_from timestamptz,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rules ?& array['S','A','B','C'])
);

create table if not exists public.pmo_control_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  idempotency_key text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create table if not exists public.pmo_control_operation_receipts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  result jsonb not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create unique index if not exists idx_project_level_rule_matrix_version
  on public.project_level_rule_matrices(org_id,coalesce(portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid),version,data_class);
create unique index if not exists idx_project_level_rule_matrix_active
  on public.project_level_rule_matrices(org_id,coalesce(portfolio_id,'00000000-0000-0000-0000-000000000000'::uuid),data_class) where status='active';
create index if not exists idx_governance_actions_inbox on public.governance_cadence_actions(org_id,data_class,owner_user_id,status,due_at);
create index if not exists idx_capacity_allocations_project on public.resource_capacity_allocations(org_id,data_class,project_id);
create index if not exists idx_capacity_conflict_inbox on public.capacity_conflict_actions(org_id,data_class,owner_user_id,status,due_at);

alter table public.governance_cadence_actions enable row level security;
alter table public.resource_capacity_allocations enable row level security;
alter table public.capacity_conflict_actions enable row level security;
alter table public.data_quality_issue_events enable row level security;
alter table public.project_dependency_events enable row level security;
alter table public.project_level_rule_matrices enable row level security;
alter table public.pmo_control_events enable row level security;
alter table public.pmo_control_operation_receipts enable row level security;

revoke all on table public.governance_cadence_actions,public.resource_capacity_allocations,public.capacity_conflict_actions,public.data_quality_issue_events,public.project_dependency_events,public.project_level_rule_matrices,public.pmo_control_events,public.pmo_control_operation_receipts from public,anon,authenticated;
grant select,insert,update,delete on table public.governance_cadence_actions,public.resource_capacity_allocations,public.capacity_conflict_actions,public.data_quality_issue_events,public.project_dependency_events,public.project_level_rule_matrices,public.pmo_control_events,public.pmo_control_operation_receipts to service_role;

create or replace function public.enforce_p20_scope_integrity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_org uuid; v_data_class text; v_other_org uuid; v_other_data_class text;
begin
  if tg_table_name='operating_cadences' and new.portfolio_id is not null then
    select org_id into v_org from public.portfolios where id=new.portfolio_id;
    if v_org is distinct from new.org_id then raise exception 'P20_CADENCE_PORTFOLIO_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='project_dependencies' then
    select org_id,data_class into v_org,v_data_class from public.projects where id=new.from_project_id;
    select org_id,data_class into v_other_org,v_other_data_class from public.projects where id=new.to_project_id;
    if v_org is distinct from new.org_id or v_other_org is distinct from new.org_id or v_data_class is distinct from new.data_class or v_other_data_class is distinct from new.data_class then raise exception 'P20_DEPENDENCY_PROJECT_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='resource_capacity_snapshots' and new.portfolio_id is not null then
    select org_id into v_org from public.portfolios where id=new.portfolio_id;
    if v_org is distinct from new.org_id then raise exception 'P20_CAPACITY_PORTFOLIO_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='resource_capacity_allocations' then
    select org_id,data_class into v_org,v_data_class from public.resource_capacity_snapshots where id=new.capacity_snapshot_id;
    select org_id,data_class into v_other_org,v_other_data_class from public.projects where id=new.project_id;
    if v_org is distinct from new.org_id or v_other_org is distinct from new.org_id or v_data_class is distinct from new.data_class or v_other_data_class is distinct from new.data_class then raise exception 'P20_CAPACITY_ALLOCATION_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='capacity_conflict_actions' then
    select org_id,data_class into v_org,v_data_class from public.resource_capacity_snapshots where id=new.capacity_snapshot_id;
    if v_org is distinct from new.org_id or v_data_class is distinct from new.data_class then raise exception 'P20_CAPACITY_ACTION_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='governance_cadence_actions' then
    select org_id,data_class into v_org,v_data_class from public.operating_cadences where id=new.cadence_id;
    if v_org is distinct from new.org_id or v_data_class is distinct from new.data_class then raise exception 'P20_GOVERNANCE_ACTION_CADENCE_SCOPE_MISMATCH'; end if;
    if new.project_id is not null then
      select org_id,data_class into v_other_org,v_other_data_class from public.projects where id=new.project_id;
      if v_other_org is distinct from new.org_id or v_other_data_class is distinct from new.data_class then raise exception 'P20_GOVERNANCE_ACTION_PROJECT_SCOPE_MISMATCH'; end if;
    end if;
  elsif tg_table_name='data_quality_issues' and new.project_id is not null then
    select org_id,data_class into v_org,v_data_class from public.projects where id=new.project_id;
    if v_org is distinct from new.org_id or v_data_class is distinct from new.data_class then raise exception 'P20_DATA_QUALITY_PROJECT_SCOPE_MISMATCH'; end if;
  elsif tg_table_name='project_level_rule_matrices' and new.portfolio_id is not null then
    select org_id into v_org from public.portfolios where id=new.portfolio_id;
    if v_org is distinct from new.org_id then raise exception 'P20_RULE_PORTFOLIO_SCOPE_MISMATCH'; end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_p20_cadence_scope on public.operating_cadences;
create trigger trg_p20_cadence_scope before insert or update on public.operating_cadences for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_dependency_scope on public.project_dependencies;
create trigger trg_p20_dependency_scope before insert or update on public.project_dependencies for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_capacity_scope on public.resource_capacity_snapshots;
create trigger trg_p20_capacity_scope before insert or update on public.resource_capacity_snapshots for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_capacity_allocation_scope on public.resource_capacity_allocations;
create trigger trg_p20_capacity_allocation_scope before insert or update on public.resource_capacity_allocations for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_capacity_action_scope on public.capacity_conflict_actions;
create trigger trg_p20_capacity_action_scope before insert or update on public.capacity_conflict_actions for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_governance_action_scope on public.governance_cadence_actions;
create trigger trg_p20_governance_action_scope before insert or update on public.governance_cadence_actions for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_quality_scope on public.data_quality_issues;
create trigger trg_p20_quality_scope before insert or update on public.data_quality_issues for each row execute function public.enforce_p20_scope_integrity();
drop trigger if exists trg_p20_rule_scope on public.project_level_rule_matrices;
create trigger trg_p20_rule_scope before insert or update on public.project_level_rule_matrices for each row execute function public.enforce_p20_scope_integrity();

revoke all on function public.enforce_p20_scope_integrity() from public,anon,authenticated;
grant execute on function public.enforce_p20_scope_integrity() to service_role;

create or replace function public.transition_data_quality_issue_tx(
  p_issue_id uuid, p_org_id uuid, p_data_class text, p_actor_id uuid, p_actor_role text,
  p_to_status text, p_correction_summary text, p_evidence jsonb, p_review_comment text,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_issue public.data_quality_issues%rowtype; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  v_hash := md5(jsonb_build_object('issue',p_issue_id,'to',p_to_status,'summary',p_correction_summary,'evidence',coalesce(p_evidence,'[]'::jsonb),'review',p_review_comment)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  select * into v_issue from public.data_quality_issues where id=p_issue_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'DATA_QUALITY_ISSUE_OUTSIDE_SCOPE'; end if;
  if p_to_status in ('in_progress','evidence_submitted') and v_issue.owner_user_id is distinct from p_actor_id and p_actor_role<>'pmo' then raise exception 'ISSUE_OWNER_REQUIRED'; end if;
  if p_to_status in ('closed','reopened','waived') and p_actor_role<>'pmo' then raise exception 'PMO_REVIEW_REQUIRED'; end if;
  if not ((v_issue.status='open' and p_to_status in ('assigned','waived')) or (v_issue.status='assigned' and p_to_status in ('in_progress','waived')) or (v_issue.status='in_progress' and p_to_status='evidence_submitted') or (v_issue.status='evidence_submitted' and p_to_status in ('closed','reopened')) or (v_issue.status in ('closed','waived') and p_to_status='reopened') or (v_issue.status='reopened' and p_to_status in ('in_progress','waived'))) then raise exception 'INVALID_DATA_QUALITY_TRANSITION:%->%',v_issue.status,p_to_status; end if;
  if p_to_status='evidence_submitted' and (nullif(trim(p_correction_summary),'') is null or jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'CORRECTION_AND_EVIDENCE_REQUIRED'; end if;
  if p_to_status in ('closed','reopened','waived') and nullif(trim(p_review_comment),'') is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.data_quality_issues set status=p_to_status,correction_summary=coalesce(nullif(trim(p_correction_summary),''),correction_summary),closure_evidence=case when p_to_status='evidence_submitted' then p_evidence else closure_evidence end,reviewer_user_id=case when p_to_status in ('closed','reopened','waived') then p_actor_id else reviewer_user_id end,review_comment=case when p_to_status in ('closed','reopened','waived') then p_review_comment else review_comment end,evidence_submitted_at=case when p_to_status='evidence_submitted' then now() else evidence_submitted_at end,reopened_at=case when p_to_status='reopened' then now() else reopened_at end,closed_at=case when p_to_status in ('closed','waived') then now() else null end,updated_at=now() where id=p_issue_id;
  insert into public.data_quality_issue_events(org_id,issue_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,p_issue_id,'status_transition',v_issue.status,p_to_status,jsonb_build_object('correction_summary',p_correction_summary,'evidence',coalesce(p_evidence,'[]'::jsonb),'review_comment',p_review_comment),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',p_issue_id,'from_status',v_issue.status,'to_status',p_to_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'transition_data_quality_issue',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.transition_operating_cadence_tx(
  p_cadence_id uuid, p_org_id uuid, p_data_class text, p_actor_id uuid,
  p_to_status text, p_conclusions jsonb, p_actions jsonb, p_effect_review jsonb,
  p_comment text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.operating_cadences%rowtype; v_result jsonb; v_hash text; v_existing record; v_action jsonb; v_conclusion jsonb; v_open integer;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  v_hash:=md5(jsonb_build_object('cadence',p_cadence_id,'to',p_to_status,'conclusions',coalesce(p_conclusions,'[]'::jsonb),'actions',coalesce(p_actions,'[]'::jsonb),'effect',coalesce(p_effect_review,'{}'::jsonb),'comment',p_comment)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  select * into v_row from public.operating_cadences where id=p_cadence_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'CADENCE_OUTSIDE_SCOPE'; end if;
  if not ((v_row.status='draft' and p_to_status in ('preparing','cancelled')) or (v_row.status='preparing' and p_to_status in ('ready','cancelled')) or (v_row.status='ready' and p_to_status in ('in_meeting','cancelled')) or (v_row.status='in_meeting' and p_to_status in ('minutes_pending','cancelled')) or (v_row.status='minutes_pending' and p_to_status in ('actions_pending','effect_review','cancelled')) or (v_row.status='actions_pending' and p_to_status in ('effect_review','cancelled')) or (v_row.status='effect_review' and p_to_status in ('closed','actions_pending','cancelled'))) then raise exception 'INVALID_CADENCE_TRANSITION:%->%',v_row.status,p_to_status; end if;
  if p_to_status='ready' and coalesce(v_row.input_snapshot,'{}'::jsonb)='{}'::jsonb then raise exception 'INPUT_SNAPSHOT_REQUIRED'; end if;
  if p_to_status='minutes_pending' and (jsonb_typeof(coalesce(p_conclusions,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_conclusions,'[]'::jsonb))=0) then raise exception 'MEETING_CONCLUSIONS_REQUIRED'; end if;
  if p_to_status='actions_pending' and v_row.status='minutes_pending' and (jsonb_typeof(coalesce(p_actions,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_actions,'[]'::jsonb))=0) then raise exception 'GOVERNANCE_ACTIONS_REQUIRED'; end if;
  if p_to_status='effect_review' and v_row.status='minutes_pending' and not exists(select 1 from jsonb_array_elements(coalesce(p_conclusions,'[]'::jsonb)) conclusion where conclusion->>'type' in ('no_action','decision')) then raise exception 'MEETING_DISPOSITION_REQUIRED'; end if;
  if p_to_status='effect_review' and v_row.status='minutes_pending' then
    for v_conclusion in select * from jsonb_array_elements(coalesce(p_conclusions,'[]'::jsonb)) where value->>'type'='decision' loop
      if nullif(v_conclusion->>'decision_brief_id','') is null or not exists(select 1 from public.decision_briefs where id=(v_conclusion->>'decision_brief_id')::uuid and org_id=p_org_id and data_class=p_data_class and status in ('submitted','decided','distributed','effect_review_pending','effect_reviewed','closed')) then raise exception 'DECISION_BRIEF_REQUIRED'; end if;
    end loop;
  end if;
  if p_to_status='cancelled' and nullif(trim(p_comment),'') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  if p_to_status='effect_review' then select count(*) into v_open from public.governance_cadence_actions where cadence_id=p_cadence_id and status not in ('evidence_submitted','effect_review','closed','cancelled'); if v_open>0 then raise exception 'GOVERNANCE_ACTIONS_NOT_READY_FOR_EFFECT_REVIEW'; end if; end if;
  if p_to_status='closed' then select count(*) into v_open from public.governance_cadence_actions where cadence_id=p_cadence_id and status not in ('closed','cancelled'); if v_open>0 then raise exception 'GOVERNANCE_ACTIONS_NOT_CLOSED'; end if; if coalesce(p_effect_review,'{}'::jsonb)='{}'::jsonb then raise exception 'EFFECT_REVIEW_REQUIRED'; end if; end if;
  if p_to_status='actions_pending' and v_row.status='minutes_pending' then
    for v_action in select * from jsonb_array_elements(p_actions) loop
      if nullif(trim(v_action->>'title'),'') is null or nullif(v_action->>'owner_user_id','') is null or nullif(v_action->>'due_at','') is null then raise exception 'ACTION_OWNER_DEADLINE_REQUIRED'; end if;
      if nullif(v_action->>'project_id','') is not null and not exists(select 1 from public.projects where id=(v_action->>'project_id')::uuid and org_id=p_org_id and data_class=p_data_class) then raise exception 'ACTION_PROJECT_OUTSIDE_SCOPE'; end if;
      if not exists(select 1 from public.user_business_roles where user_id=(v_action->>'owner_user_id')::uuid and org_id=p_org_id and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now())) then raise exception 'ACTION_OWNER_OUTSIDE_ORGANIZATION'; end if;
      insert into public.governance_cadence_actions(org_id,cadence_id,project_id,title,description,owner_user_id,due_at,data_class,created_by) values(p_org_id,p_cadence_id,nullif(v_action->>'project_id','')::uuid,trim(v_action->>'title'),coalesce(v_action->>'description',''),(v_action->>'owner_user_id')::uuid,(v_action->>'due_at')::timestamptz,p_data_class,p_actor_id);
    end loop;
  end if;
  update public.operating_cadences set status=p_to_status,frozen_at=case when p_to_status='ready' then now() else frozen_at end,frozen_snapshot=case when p_to_status='ready' then input_snapshot else frozen_snapshot end,conclusions=case when p_to_status='minutes_pending' or (p_to_status='effect_review' and v_row.status='minutes_pending') then p_conclusions else conclusions end,effect_review=case when p_to_status='closed' then p_effect_review else effect_review end,review_comment=coalesce(nullif(trim(p_comment),''),review_comment),closed_at=case when p_to_status='closed' then now() else null end,cancelled_at=case when p_to_status='cancelled' then now() else cancelled_at end,cancellation_reason=case when p_to_status='cancelled' then p_comment else cancellation_reason end,updated_at=now() where id=p_cadence_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'operating_cadence',p_cadence_id::text,'status_transition',v_row.status,p_to_status,jsonb_build_object('conclusions',coalesce(p_conclusions,'[]'::jsonb),'actions',coalesce(p_actions,'[]'::jsonb),'effect_review',coalesce(p_effect_review,'{}'::jsonb),'comment',p_comment),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',p_cadence_id,'from_status',v_row.status,'to_status',p_to_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'transition_operating_cadence',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.transition_governance_action_tx(
  p_action_id uuid, p_org_id uuid, p_data_class text, p_actor_id uuid, p_actor_role text,
  p_to_status text, p_evidence jsonb, p_effect_review jsonb, p_comment text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.governance_cadence_actions%rowtype; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  v_hash:=md5(jsonb_build_object('action',p_action_id,'to',p_to_status,'evidence',coalesce(p_evidence,'[]'::jsonb),'effect',coalesce(p_effect_review,'{}'::jsonb),'comment',p_comment)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  select * into v_row from public.governance_cadence_actions where id=p_action_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'GOVERNANCE_ACTION_OUTSIDE_SCOPE'; end if;
  if p_to_status in ('accepted','in_progress','evidence_submitted') and v_row.owner_user_id<>p_actor_id and p_actor_role<>'pmo' then raise exception 'ACTION_OWNER_REQUIRED'; end if;
  if p_to_status in ('effect_review','closed','reopened','cancelled') and p_actor_role<>'pmo' then raise exception 'PMO_REVIEW_REQUIRED'; end if;
  if not ((v_row.status='assigned' and p_to_status in ('accepted','cancelled')) or (v_row.status='accepted' and p_to_status in ('in_progress','cancelled')) or (v_row.status in ('in_progress','reopened') and p_to_status='evidence_submitted') or (v_row.status='evidence_submitted' and p_to_status in ('effect_review','reopened')) or (v_row.status='effect_review' and p_to_status in ('closed','reopened')) or (v_row.status='closed' and p_to_status='reopened')) then raise exception 'INVALID_GOVERNANCE_ACTION_TRANSITION:%->%',v_row.status,p_to_status; end if;
  if p_to_status='evidence_submitted' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'ACTION_EVIDENCE_REQUIRED'; end if;
  if p_to_status='effect_review' and coalesce(p_effect_review,'{}'::jsonb)='{}'::jsonb then raise exception 'ACTION_EFFECT_REVIEW_REQUIRED'; end if;
  if p_to_status='closed' and coalesce(v_row.effect_review,'{}'::jsonb)->>'outcome'<>'effective' then raise exception 'EFFECTIVE_OUTCOME_REQUIRED'; end if;
  if p_to_status in ('reopened','cancelled') and nullif(trim(p_comment),'') is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.governance_cadence_actions set status=p_to_status,completion_evidence=case when p_to_status='evidence_submitted' then p_evidence else completion_evidence end,effect_review=case when p_to_status='effect_review' then p_effect_review else effect_review end,review_comment=coalesce(nullif(trim(p_comment),''),review_comment),closed_at=case when p_to_status='closed' then now() else null end,updated_at=now() where id=p_action_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'governance_action',p_action_id::text,'status_transition',v_row.status,p_to_status,jsonb_build_object('evidence',coalesce(p_evidence,'[]'::jsonb),'effect_review',coalesce(p_effect_review,'{}'::jsonb),'comment',p_comment),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',p_action_id,'from_status',v_row.status,'to_status',p_to_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'transition_governance_action',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.save_capacity_plan_tx(
  p_org_id uuid, p_portfolio_id uuid, p_data_class text, p_actor_id uuid,
  p_owner_user_id uuid, p_owner_name text, p_role_name text, p_plan jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_hash text; v_existing record; v_week jsonb; v_allocation jsonb; v_snapshot_id uuid; v_plan_id uuid:=public.uuid_generate_v4(); v_count integer; v_demand numeric; v_capacity numeric; v_conflicts integer:=0; v_index integer:=0;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if nullif(trim(p_owner_name),'') is null or nullif(trim(p_role_name),'') is null then raise exception 'RESOURCE_OWNER_AND_ROLE_REQUIRED'; end if;
  if p_owner_user_id is null then raise exception 'RESOURCE_RESPONSIBLE_USER_REQUIRED'; end if;
  if not exists(select 1 from public.user_business_roles where user_id=p_owner_user_id and org_id=p_org_id and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now())) then raise exception 'RESOURCE_OWNER_OUTSIDE_ORGANIZATION'; end if;
  if p_portfolio_id is not null and not exists(select 1 from public.portfolios where id=p_portfolio_id and org_id=p_org_id) then raise exception 'PORTFOLIO_OUTSIDE_SCOPE'; end if;
  v_count:=jsonb_array_length(coalesce(p_plan->'weeks','[]'::jsonb)); if v_count<8 or v_count>12 then raise exception 'CAPACITY_PLAN_REQUIRES_8_TO_12_WEEKS'; end if;
  v_hash:=md5(jsonb_build_object('portfolio',p_portfolio_id,'owner',p_owner_user_id,'name',p_owner_name,'role',p_role_name,'plan',p_plan)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  for v_week in select * from jsonb_array_elements(p_plan->'weeks') loop
    v_index:=v_index+1; v_capacity:=(v_week->>'capacity_hours')::numeric;
    if v_capacity<0 then raise exception 'INVALID_CAPACITY_HOURS'; end if;
    select coalesce(sum((item->>'hours')::numeric),0) into v_demand from jsonb_array_elements(coalesce(v_week->'allocations','[]'::jsonb)) item;
    for v_allocation in select * from jsonb_array_elements(coalesce(v_week->'allocations','[]'::jsonb)) loop
      if not exists(select 1 from public.projects where id=(v_allocation->>'project_id')::uuid and org_id=p_org_id and data_class=p_data_class) then raise exception 'ALLOCATION_PROJECT_OUTSIDE_SCOPE'; end if;
      if (v_allocation->>'hours')::numeric<0 then raise exception 'INVALID_ALLOCATION_HOURS'; end if;
    end loop;
    select id into v_snapshot_id from public.resource_capacity_snapshots where org_id=p_org_id and portfolio_id is not distinct from p_portfolio_id and owner_name=trim(p_owner_name) and role_name=trim(p_role_name) and period_start=(v_week->>'period_start')::date and data_class=p_data_class for update;
    if found then
      update public.resource_capacity_snapshots set owner_user_id=p_owner_user_id,period_end=(v_week->>'period_end')::date,capacity_hours=v_capacity,demand_hours=v_demand,allocation_detail=coalesce(v_week->'allocations','[]'::jsonb),source_snapshot_at=now(),plan_id=v_plan_id,plan_version=plan_version+1,updated_at=now() where id=v_snapshot_id;
      delete from public.resource_capacity_allocations where capacity_snapshot_id=v_snapshot_id;
    else
      insert into public.resource_capacity_snapshots(org_id,portfolio_id,owner_user_id,owner_name,role_name,period_start,period_end,capacity_hours,demand_hours,allocation_detail,source_snapshot_at,data_class,created_by,plan_id) values(p_org_id,p_portfolio_id,p_owner_user_id,trim(p_owner_name),trim(p_role_name),(v_week->>'period_start')::date,(v_week->>'period_end')::date,v_capacity,v_demand,coalesce(v_week->'allocations','[]'::jsonb),now(),p_data_class,p_actor_id,v_plan_id) returning id into v_snapshot_id;
    end if;
    for v_allocation in select * from jsonb_array_elements(coalesce(v_week->'allocations','[]'::jsonb)) loop insert into public.resource_capacity_allocations(org_id,capacity_snapshot_id,project_id,allocated_hours,allocation_note,data_class,created_by) values(p_org_id,v_snapshot_id,(v_allocation->>'project_id')::uuid,(v_allocation->>'hours')::numeric,v_allocation->>'note',p_data_class,p_actor_id); end loop;
    if v_demand>v_capacity then
      v_conflicts:=v_conflicts+1;
      insert into public.capacity_conflict_actions(org_id,capacity_snapshot_id,owner_user_id,overload_hours,action_title,due_at,status,data_class,created_by) values(p_org_id,v_snapshot_id,p_owner_user_id,v_demand-v_capacity,format('%s %s 周资源超载处置',trim(p_owner_name),v_week->>'period_start'),((v_week->>'period_start')::date+3)::timestamptz,'assigned',p_data_class,p_actor_id) on conflict(capacity_snapshot_id) do update set owner_user_id=excluded.owner_user_id,overload_hours=excluded.overload_hours,action_title=excluded.action_title,due_at=excluded.due_at,status=case when public.capacity_conflict_actions.status in ('verified','closed') then 'reopened' when public.capacity_conflict_actions.status='cancelled' then 'assigned' else public.capacity_conflict_actions.status end,closed_at=null,updated_at=now();
    else
      update public.capacity_conflict_actions set status='verified',resolution_evidence=jsonb_build_array(jsonb_build_object('sourceType','supabase_record','sourceId',v_snapshot_id::text,'title','最新资源容量快照显示冲突已消除')),review_comment='容量计划复算通过，等待PMO确认关闭',closed_at=null,updated_at=now() where capacity_snapshot_id=v_snapshot_id and status not in ('verified','closed','cancelled');
    end if;
    insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'resource_capacity_snapshot',v_snapshot_id::text,'capacity_week_saved',jsonb_build_object('plan_id',v_plan_id,'week',v_week,'demand_hours',v_demand,'conflict',v_demand>v_capacity),p_actor_id,p_idempotency_key||':'||v_index,p_data_class);
  end loop;
  v_result:=jsonb_build_object('plan_id',v_plan_id,'weeks',v_count,'conflicts',v_conflicts);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'save_capacity_plan',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.save_project_level_rule_matrix_tx(
  p_org_id uuid, p_portfolio_id uuid, p_data_class text, p_actor_id uuid,
  p_version text, p_rules jsonb, p_change_reason text, p_activate boolean, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_hash text; v_existing record; v_id uuid; v_level text; v_rule jsonb; v_signal jsonb;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if nullif(trim(p_version),'') is null or nullif(trim(p_change_reason),'') is null then raise exception 'VERSION_AND_CHANGE_REASON_REQUIRED'; end if;
  if p_portfolio_id is not null and not exists(select 1 from public.portfolios where id=p_portfolio_id and org_id=p_org_id) then raise exception 'PORTFOLIO_OUTSIDE_SCOPE'; end if;
  foreach v_level in array array['S','A','B','C'] loop
    if not (p_rules ? v_level) then raise exception 'RULE_LEVEL_REQUIRED:%',v_level; end if; v_rule:=p_rules->v_level;
    if nullif(v_rule->>'cadence','') is null or coalesce((v_rule->>'escalationHours')::numeric,0)<=0 or coalesce((v_rule->>'maxOpenCriticalSignals')::numeric,-1)<0 or jsonb_typeof(v_rule->'evidenceRequired')<>'boolean' then raise exception 'INVALID_LEVEL_RULE:%',v_level; end if;
    if jsonb_typeof(coalesce(v_rule->'signalRules','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_rule->'signalRules','[]'::jsonb))=0 then raise exception 'SIGNAL_RULE_REQUIRED:%',v_level; end if;
    for v_signal in select * from jsonb_array_elements(v_rule->'signalRules') loop
      if nullif(trim(v_signal->>'signalType'),'') is null or nullif(trim(v_signal->>'metricKey'),'') is null or nullif(trim(v_signal->>'metricVersion'),'') is null then raise exception 'SIGNAL_METRIC_VERSION_REQUIRED:%',v_level; end if;
      if jsonb_typeof(v_signal->'yellowThreshold')<>'number' or jsonb_typeof(v_signal->'redThreshold')<>'number'
        or coalesce(v_signal->>'comparison','greater_than') not in ('greater_than','less_than','variance_percent_above')
        or (coalesce(v_signal->>'comparison','greater_than')='less_than' and (v_signal->>'redThreshold')::numeric>(v_signal->>'yellowThreshold')::numeric)
        or (coalesce(v_signal->>'comparison','greater_than')<>'less_than' and (v_signal->>'yellowThreshold')::numeric>(v_signal->>'redThreshold')::numeric)
      then raise exception 'SIGNAL_THRESHOLD_INVALID:%',v_level; end if;
      if nullif(trim(v_signal->>'unit'),'') is null or coalesce((v_signal->>'dataFreshnessHours')::numeric,0)<=0 then raise exception 'SIGNAL_UNIT_OR_FRESHNESS_INVALID:%',v_level; end if;
      if jsonb_typeof(coalesce(v_signal->'impactDimensions','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_signal->'impactDimensions','[]'::jsonb))=0 then raise exception 'SIGNAL_IMPACT_REQUIRED:%',v_level; end if;
      if nullif(trim(v_signal->>'handlingRole'),'') is null or nullif(trim(v_signal->>'slaStartEvent'),'') is null or nullif(trim(v_signal->>'slaEndEvent'),'') is null or nullif(trim(v_signal->>'escalationLevel'),'') is null or nullif(trim(v_signal->>'decisionAuthority'),'') is null then raise exception 'SIGNAL_ROUTING_REQUIRED:%',v_level; end if;
      if jsonb_typeof(coalesce(v_signal->'closureEvidence','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(v_signal->'closureEvidence','[]'::jsonb))=0 then raise exception 'SIGNAL_CLOSURE_EVIDENCE_REQUIRED:%',v_level; end if;
      if not exists(select 1 from public.metric_definitions where metric_key=v_signal->>'metricKey' and version=v_signal->>'metricVersion' and status='active' and (org_id=p_org_id or org_id is null)) then raise exception 'ACTIVE_METRIC_DEFINITION_REQUIRED:%:%',v_signal->>'metricKey',v_signal->>'metricVersion'; end if;
    end loop;
  end loop;
  v_hash:=md5(jsonb_build_object('portfolio',p_portfolio_id,'version',p_version,'rules',p_rules,'reason',p_change_reason,'activate',p_activate)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  if p_activate and exists(
    select 1 from public.projects p
    where p.org_id=p_org_id and p.data_class=p_data_class and p.status not in ('closed','completed','cancelled') and p.project_level is null
      and (p_portfolio_id is null or exists(select 1 from public.portfolio_project_links l where l.org_id=p_org_id and l.portfolio_id=p_portfolio_id and l.project_id=p.id))
  ) then raise exception 'ACTIVE_PROJECT_LEVEL_COVERAGE_INCOMPLETE'; end if;
  if p_activate then update public.project_level_rule_matrices set status='retired',updated_at=now() where org_id=p_org_id and portfolio_id is not distinct from p_portfolio_id and data_class=p_data_class and status='active'; end if;
  insert into public.project_level_rule_matrices(org_id,portfolio_id,version,status,rules,change_reason,approved_by,approved_at,effective_from,data_class,created_by) values(p_org_id,p_portfolio_id,trim(p_version),case when p_activate then 'active' else 'draft' end,p_rules,trim(p_change_reason),case when p_activate then p_actor_id else null end,case when p_activate then now() else null end,case when p_activate then now() else null end,p_data_class,p_actor_id) returning id into v_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'project_level_rule_matrix',v_id::text,case when p_activate then 'matrix_activated' else 'matrix_drafted' end,case when p_activate then 'active' else 'draft' end,jsonb_build_object('version',p_version,'rules',p_rules,'change_reason',p_change_reason),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',v_id,'version',p_version,'status',case when p_activate then 'active' else 'draft' end);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'save_project_level_rule_matrix',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.save_metric_definition_tx(
  p_org_id uuid, p_data_class text, p_actor_id uuid, p_metric_key text, p_version text,
  p_name text, p_definition text, p_numerator_definition text, p_denominator_definition text,
  p_source_definition jsonb, p_freshness_sla_minutes integer, p_activate boolean, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_hash text; v_result jsonb; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if nullif(trim(p_metric_key),'') is null or nullif(trim(p_version),'') is null or nullif(trim(p_name),'') is null or nullif(trim(p_definition),'') is null then raise exception 'METRIC_IDENTITY_AND_DEFINITION_REQUIRED'; end if;
  if p_freshness_sla_minutes is null or p_freshness_sla_minutes<=0 then raise exception 'METRIC_FRESHNESS_SLA_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_source_definition,'{}'::jsonb))<>'object' or nullif(trim(p_source_definition->>'source_type'),'') is null or nullif(trim(p_source_definition->>'field_or_formula'),'') is null then raise exception 'METRIC_SOURCE_DEFINITION_REQUIRED'; end if;
  v_hash:=md5(jsonb_build_object('key',p_metric_key,'version',p_version,'name',p_name,'definition',p_definition,'numerator',p_numerator_definition,'denominator',p_denominator_definition,'source',p_source_definition,'freshness',p_freshness_sla_minutes,'activate',p_activate)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  if p_activate then update public.metric_definitions set status='retired' where org_id=p_org_id and metric_key=trim(p_metric_key) and status='active'; end if;
  insert into public.metric_definitions(org_id,metric_key,version,name,definition,numerator_definition,denominator_definition,source_definition,freshness_sla_minutes,status,approved_by,approved_at)
  values(p_org_id,trim(p_metric_key),trim(p_version),trim(p_name),trim(p_definition),nullif(trim(p_numerator_definition),''),nullif(trim(p_denominator_definition),''),p_source_definition,p_freshness_sla_minutes,case when p_activate then 'active' else 'draft' end,case when p_activate then p_actor_id else null end,case when p_activate then now() else null end)
  returning id into v_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'metric_definition',v_id::text,case when p_activate then 'metric_activated' else 'metric_drafted' end,case when p_activate then 'active' else 'draft' end,jsonb_build_object('metric_key',p_metric_key,'version',p_version,'source_definition',p_source_definition,'freshness_sla_minutes',p_freshness_sla_minutes),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',v_id,'metric_key',p_metric_key,'version',p_version,'status',case when p_activate then 'active' else 'draft' end);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'save_metric_definition',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

revoke all on function public.transition_data_quality_issue_tx(uuid,uuid,text,uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.transition_operating_cadence_tx(uuid,uuid,text,uuid,text,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.transition_governance_action_tx(uuid,uuid,text,uuid,text,text,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.save_capacity_plan_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_project_level_rule_matrix_tx(uuid,uuid,text,uuid,text,jsonb,text,boolean,text) from public,anon,authenticated;
revoke all on function public.save_metric_definition_tx(uuid,text,uuid,text,text,text,text,text,text,jsonb,integer,boolean,text) from public,anon,authenticated;
grant execute on function public.transition_data_quality_issue_tx(uuid,uuid,text,uuid,text,text,text,jsonb,text,text) to service_role;
grant execute on function public.transition_operating_cadence_tx(uuid,uuid,text,uuid,text,jsonb,jsonb,jsonb,text,text) to service_role;
grant execute on function public.transition_governance_action_tx(uuid,uuid,text,uuid,text,text,jsonb,jsonb,text,text) to service_role;
grant execute on function public.save_capacity_plan_tx(uuid,uuid,text,uuid,uuid,text,text,jsonb,text) to service_role;
grant execute on function public.save_project_level_rule_matrix_tx(uuid,uuid,text,uuid,text,jsonb,text,boolean,text) to service_role;
grant execute on function public.save_metric_definition_tx(uuid,text,uuid,text,text,text,text,text,text,jsonb,integer,boolean,text) to service_role;

create or replace function public.create_operating_cadence_tx(
  p_org_id uuid, p_portfolio_id uuid, p_data_class text, p_actor_id uuid,
  p_cadence_type text, p_period_start date, p_period_end date, p_input_snapshot jsonb,
  p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_period_end<p_period_start then raise exception 'INVALID_CADENCE_PERIOD'; end if;
  if p_cadence_type not in ('daily_exception','weekly_portfolio','monthly_operating','quarterly_portfolio') then raise exception 'INVALID_CADENCE_TYPE'; end if;
  if p_portfolio_id is not null and not exists(select 1 from public.portfolios where id=p_portfolio_id and org_id=p_org_id) then raise exception 'PORTFOLIO_OUTSIDE_SCOPE'; end if;
  v_hash:=md5(jsonb_build_object('portfolio',p_portfolio_id,'type',p_cadence_type,'start',p_period_start,'end',p_period_end,'snapshot',p_input_snapshot)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  insert into public.operating_cadences(org_id,portfolio_id,cadence_type,period_start,period_end,status,owner_user_id,agenda,input_snapshot,due_at,data_class,created_by) values(p_org_id,p_portfolio_id,p_cadence_type,p_period_start,p_period_end,'preparing',p_actor_id,'["异常信号复核","跨项目依赖","资源冲突","数据质量","需升级决策"]'::jsonb,coalesce(p_input_snapshot,'{}'::jsonb),(p_period_end::text||'T18:00:00+08:00')::timestamptz,p_data_class,p_actor_id) returning id into v_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'operating_cadence',v_id::text,'cadence_created','preparing',jsonb_build_object('period_start',p_period_start,'period_end',p_period_end,'cadence_type',p_cadence_type),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',v_id,'status','preparing');
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'create_operating_cadence',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.create_project_dependency_tx(
  p_org_id uuid, p_data_class text, p_actor_id uuid, p_from_project_id uuid, p_to_project_id uuid,
  p_dependency_type text, p_description text, p_owner_user_id uuid, p_due_date date,
  p_resolution_criteria text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_status text; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if p_from_project_id=p_to_project_id then raise exception 'DEPENDENCY_PROJECTS_MUST_DIFFER'; end if;
  if nullif(trim(p_description),'') is null or nullif(trim(p_resolution_criteria),'') is null then raise exception 'DEPENDENCY_DESCRIPTION_AND_CRITERIA_REQUIRED'; end if;
  if p_owner_user_id is null or p_due_date is null then raise exception 'DEPENDENCY_OWNER_AND_DEADLINE_REQUIRED'; end if;
  if not exists(select 1 from public.user_business_roles where user_id=p_owner_user_id and org_id=p_org_id and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now())) then raise exception 'DEPENDENCY_OWNER_OUTSIDE_ORGANIZATION'; end if;
  if not exists(select 1 from public.projects where id=p_from_project_id and org_id=p_org_id and data_class=p_data_class) or not exists(select 1 from public.projects where id=p_to_project_id and org_id=p_org_id and data_class=p_data_class) then raise exception 'DEPENDENCY_PROJECT_OUTSIDE_SCOPE'; end if;
  v_hash:=md5(jsonb_build_object('from',p_from_project_id,'to',p_to_project_id,'type',p_dependency_type,'description',p_description,'owner',p_owner_user_id,'due',p_due_date,'criteria',p_resolution_criteria)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  insert into public.project_dependencies(org_id,from_project_id,to_project_id,dependency_type,description,status,owner_user_id,due_date,resolution_criteria,data_class,created_by) values(p_org_id,p_from_project_id,p_to_project_id,p_dependency_type,trim(p_description),'identified',p_owner_user_id,p_due_date,trim(p_resolution_criteria),p_data_class,p_actor_id) on conflict(org_id,from_project_id,to_project_id,dependency_type,data_class) do update set description=excluded.description,owner_user_id=excluded.owner_user_id,due_date=excluded.due_date,resolution_criteria=excluded.resolution_criteria,status=case when public.project_dependencies.status in ('resolved','cancelled') then 'reopened' else public.project_dependencies.status end,reopened_at=case when public.project_dependencies.status in ('resolved','cancelled') then now() else public.project_dependencies.reopened_at end,updated_at=now() returning id,status into v_id,v_status;
  insert into public.project_dependency_events(org_id,dependency_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,v_id,'dependency_saved',v_status,jsonb_build_object('from_project_id',p_from_project_id,'to_project_id',p_to_project_id,'resolution_criteria',p_resolution_criteria),p_actor_id,p_idempotency_key,p_data_class);
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'project_dependency',v_id::text,'dependency_saved',v_status,jsonb_build_object('from_project_id',p_from_project_id,'to_project_id',p_to_project_id,'resolution_criteria',p_resolution_criteria),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',v_id,'status',v_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'create_project_dependency',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.transition_project_dependency_tx(
  p_dependency_id uuid, p_org_id uuid, p_data_class text, p_actor_id uuid, p_actor_role text,
  p_to_status text, p_evidence jsonb, p_comment text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.project_dependencies%rowtype; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  v_hash:=md5(jsonb_build_object('dependency',p_dependency_id,'to',p_to_status,'evidence',coalesce(p_evidence,'[]'::jsonb),'comment',p_comment)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  select * into v_row from public.project_dependencies where id=p_dependency_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'DEPENDENCY_OUTSIDE_SCOPE'; end if;
  if p_to_status in ('confirmed','monitoring','blocked','evidence_submitted') and v_row.owner_user_id<>p_actor_id and p_actor_role<>'pmo' then raise exception 'DEPENDENCY_OWNER_REQUIRED'; end if;
  if p_to_status in ('verified','resolved','reopened','cancelled') and p_actor_role<>'pmo' then raise exception 'PMO_REVIEW_REQUIRED'; end if;
  if not ((v_row.status='identified' and p_to_status in ('confirmed','cancelled')) or (v_row.status='confirmed' and p_to_status in ('monitoring','blocked','cancelled')) or (v_row.status='monitoring' and p_to_status in ('blocked','evidence_submitted','cancelled')) or (v_row.status='blocked' and p_to_status in ('monitoring','evidence_submitted','cancelled')) or (v_row.status='evidence_submitted' and p_to_status in ('verified','reopened')) or (v_row.status='verified' and p_to_status in ('resolved','reopened')) or (v_row.status='resolved' and p_to_status='reopened') or (v_row.status='reopened' and p_to_status in ('monitoring','blocked','evidence_submitted','cancelled'))) then raise exception 'INVALID_DEPENDENCY_TRANSITION:%->%',v_row.status,p_to_status; end if;
  if p_to_status='evidence_submitted' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'DEPENDENCY_EVIDENCE_REQUIRED'; end if;
  if p_to_status in ('verified','resolved','reopened','cancelled') and nullif(trim(p_comment),'') is null then raise exception 'DEPENDENCY_REVIEW_COMMENT_REQUIRED'; end if;
  update public.project_dependencies set status=p_to_status,evidence=case when p_to_status='evidence_submitted' then p_evidence else evidence end,review_comment=coalesce(nullif(trim(p_comment),''),review_comment),evidence_submitted_at=case when p_to_status='evidence_submitted' then now() else evidence_submitted_at end,verified_at=case when p_to_status='verified' then now() when p_to_status='reopened' then null else verified_at end,resolved_at=case when p_to_status='resolved' then now() when p_to_status='reopened' then null else resolved_at end,reopened_at=case when p_to_status='reopened' then now() else reopened_at end,updated_at=now() where id=p_dependency_id;
  insert into public.project_dependency_events(org_id,dependency_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,p_dependency_id,'status_transition',v_row.status,p_to_status,jsonb_build_object('evidence',coalesce(p_evidence,'[]'::jsonb),'comment',p_comment),p_actor_id,p_idempotency_key,p_data_class);
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'project_dependency',p_dependency_id::text,'status_transition',v_row.status,p_to_status,jsonb_build_object('evidence',coalesce(p_evidence,'[]'::jsonb),'comment',p_comment),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',p_dependency_id,'from_status',v_row.status,'to_status',p_to_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'transition_project_dependency',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.save_data_quality_scan_tx(
  p_org_id uuid, p_data_class text, p_actor_id uuid, p_issues jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_issue jsonb; v_id uuid; v_result jsonb; v_hash text; v_existing record; v_count integer:=0;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_issues,'[]'::jsonb))<>'array' then raise exception 'ISSUES_ARRAY_REQUIRED'; end if;
  v_hash:=md5(coalesce(p_issues,'[]'::jsonb)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  for v_issue in select * from jsonb_array_elements(p_issues) loop
    if not exists(select 1 from public.projects where id=(v_issue->>'project_id')::uuid and org_id=p_org_id and data_class=p_data_class) then raise exception 'QUALITY_PROJECT_OUTSIDE_SCOPE'; end if;
    if nullif(v_issue->>'due_at','') is null then raise exception 'QUALITY_DEADLINE_REQUIRED'; end if;
    if not exists(select 1 from public.user_business_roles where user_id=coalesce(nullif(v_issue->>'owner_user_id','')::uuid,p_actor_id) and org_id=p_org_id and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now())) then raise exception 'QUALITY_OWNER_OUTSIDE_ORGANIZATION'; end if;
    insert into public.data_quality_issues(org_id,project_id,subject_type,subject_id,rule_key,field_name,severity,description,status,owner_user_id,due_at,data_class,dedup_key,created_by,updated_at) values(p_org_id,(v_issue->>'project_id')::uuid,'project',v_issue->>'project_id',v_issue->>'rule_key',v_issue->>'field_name',v_issue->>'severity',v_issue->>'description','assigned',coalesce(nullif(v_issue->>'owner_user_id','')::uuid,p_actor_id),(v_issue->>'due_at')::timestamptz,p_data_class,v_issue->>'dedup_key',p_actor_id,now()) on conflict(org_id,data_class,dedup_key) do update set severity=excluded.severity,description=excluded.description,owner_user_id=case when public.data_quality_issues.status in ('closed','waived') then excluded.owner_user_id else public.data_quality_issues.owner_user_id end,due_at=case when public.data_quality_issues.status in ('closed','waived') then excluded.due_at else public.data_quality_issues.due_at end,status=case when public.data_quality_issues.status in ('closed','waived') then 'reopened' else public.data_quality_issues.status end,reopened_at=case when public.data_quality_issues.status in ('closed','waived') then now() else public.data_quality_issues.reopened_at end,updated_at=now() returning id into v_id;
    v_count:=v_count+1;
    insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'data_quality_issue',v_id::text,'quality_scan_upserted','assigned',v_issue,p_actor_id,p_idempotency_key||':'||v_count,p_data_class);
  end loop;
  v_result:=jsonb_build_object('saved',v_count);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'save_data_quality_scan',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

create or replace function public.transition_capacity_conflict_action_tx(
  p_action_id uuid, p_org_id uuid, p_data_class text, p_actor_id uuid, p_actor_role text,
  p_to_status text, p_action_plan text, p_evidence jsonb, p_comment text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.capacity_conflict_actions%rowtype; v_result jsonb; v_hash text; v_existing record;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  v_hash:=md5(jsonb_build_object('action',p_action_id,'to',p_to_status,'plan',p_action_plan,'evidence',coalesce(p_evidence,'[]'::jsonb),'comment',p_comment)::text);
  select request_hash,result into v_existing from public.pmo_control_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_existing.request_hash<>v_hash then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if; return v_existing.result; end if;
  select * into v_row from public.capacity_conflict_actions where id=p_action_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'CAPACITY_ACTION_OUTSIDE_SCOPE'; end if;
  if p_to_status in ('accepted','in_progress','evidence_submitted') and v_row.owner_user_id<>p_actor_id and p_actor_role<>'pmo' then raise exception 'CAPACITY_ACTION_OWNER_REQUIRED'; end if;
  if p_to_status in ('verified','closed','reopened','cancelled') and p_actor_role<>'pmo' then raise exception 'PMO_REVIEW_REQUIRED'; end if;
  if not ((v_row.status='assigned' and p_to_status in ('accepted','cancelled')) or (v_row.status='accepted' and p_to_status in ('in_progress','cancelled')) or (v_row.status in ('in_progress','reopened') and p_to_status='evidence_submitted') or (v_row.status='evidence_submitted' and p_to_status in ('verified','reopened')) or (v_row.status='verified' and p_to_status in ('closed','reopened')) or (v_row.status='closed' and p_to_status='reopened')) then raise exception 'INVALID_CAPACITY_ACTION_TRANSITION:%->%',v_row.status,p_to_status; end if;
  if p_to_status='evidence_submitted' and (nullif(trim(p_action_plan),'') is null or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'ACTION_PLAN_AND_EVIDENCE_REQUIRED'; end if;
  if p_to_status in ('verified','reopened','cancelled') and nullif(trim(p_comment),'') is null then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.capacity_conflict_actions set status=p_to_status,action_plan=coalesce(nullif(trim(p_action_plan),''),action_plan),resolution_evidence=case when p_to_status='evidence_submitted' then p_evidence else resolution_evidence end,review_comment=coalesce(nullif(trim(p_comment),''),review_comment),closed_at=case when p_to_status='closed' then now() else null end,updated_at=now() where id=p_action_id;
  insert into public.pmo_control_events(org_id,entity_type,entity_id,event_type,from_status,to_status,payload,actor_user_id,idempotency_key,data_class) values(p_org_id,'capacity_conflict_action',p_action_id::text,'status_transition',v_row.status,p_to_status,jsonb_build_object('action_plan',p_action_plan,'evidence',coalesce(p_evidence,'[]'::jsonb),'comment',p_comment),p_actor_id,p_idempotency_key,p_data_class);
  v_result:=jsonb_build_object('id',p_action_id,'from_status',v_row.status,'to_status',p_to_status);
  insert into public.pmo_control_operation_receipts(org_id,operation,idempotency_key,request_hash,result,actor_user_id,data_class) values(p_org_id,'transition_capacity_conflict_action',p_idempotency_key,v_hash,v_result,p_actor_id,p_data_class);
  return v_result;
end $$;

revoke all on function public.create_operating_cadence_tx(uuid,uuid,text,uuid,text,date,date,jsonb,text) from public,anon,authenticated;
revoke all on function public.create_project_dependency_tx(uuid,text,uuid,uuid,uuid,text,text,uuid,date,text,text) from public,anon,authenticated;
revoke all on function public.transition_project_dependency_tx(uuid,uuid,text,uuid,text,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.save_data_quality_scan_tx(uuid,text,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.transition_capacity_conflict_action_tx(uuid,uuid,text,uuid,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_operating_cadence_tx(uuid,uuid,text,uuid,text,date,date,jsonb,text) to service_role;
grant execute on function public.create_project_dependency_tx(uuid,text,uuid,uuid,uuid,text,text,uuid,date,text,text) to service_role;
grant execute on function public.transition_project_dependency_tx(uuid,uuid,text,uuid,text,text,jsonb,text,text) to service_role;
grant execute on function public.save_data_quality_scan_tx(uuid,text,uuid,jsonb,text) to service_role;
grant execute on function public.transition_capacity_conflict_action_tx(uuid,uuid,text,uuid,text,text,text,jsonb,text,text) to service_role;
