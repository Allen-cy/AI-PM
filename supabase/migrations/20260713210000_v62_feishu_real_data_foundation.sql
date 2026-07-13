-- AI PM System V6.2.0: Feishu real business facts -> Supabase governed mirror.
-- Feishu remains the business source of truth. Supabase stores stable identity,
-- workflow state, authorization, audit, reconciliation and analytical mirrors.
-- This migration is additive and uses soft tombstones; it never deletes source facts.

create table if not exists public.feishu_reconcile_batches (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  source_scope text not null default 'organization' check (source_scope in ('organization','user')),
  source_user_id uuid references public.app_users(id) on delete set null,
  source_container_id text not null,
  trigger_type text not null check (trigger_type in ('manual','cron','retry','verification')),
  requested_domains jsonb not null check (jsonb_typeof(requested_domains)='array' and jsonb_array_length(requested_domains)>0),
  completed_domains jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_domains)='array'),
  source_checkpoint text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  expected_version bigint not null default 0 check (expected_version=0),
  status text not null default 'running' check (status in ('running','completed','completed_with_warnings','failed','cancelled')),
  total_records integer not null default 0,
  inserted_records integer not null default 0,
  updated_records integer not null default 0,
  unchanged_records integer not null default 0,
  tombstoned_records integer not null default 0,
  quarantined_records integer not null default 0,
  failed_records integer not null default 0,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings)='array'),
  error_code text,
  error_detail text,
  request_id text not null,
  created_by uuid references public.app_users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,data_class,idempotency_key)
);

create table if not exists public.feishu_reconcile_items (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid not null references public.feishu_reconcile_batches(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  domain text not null check (domain in ('project','milestone','task','risk','contract','payment','cost','syncLedger')),
  source_container_id text not null,
  source_record_id text not null,
  project_source_record_id text,
  external_project_code text,
  project_id uuid references public.projects(id) on delete restrict,
  action text not null check (action in ('inserted','updated','unchanged','tombstoned','quarantined','failed')),
  status text not null check (status in ('succeeded','quarantined','failed')),
  target_table text,
  target_id uuid,
  source_updated_at timestamptz,
  row_hash text,
  quality_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(quality_issues)='array'),
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload)='object'),
  error_code text,
  error_detail text,
  request_id text not null,
  processed_at timestamptz not null default now(),
  unique (batch_id,domain,source_record_id)
);

create table if not exists public.feishu_reconcile_quarantine (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  domain text not null check (domain in ('project','milestone','task','risk','contract','payment','cost','syncLedger')),
  source_container_id text not null,
  source_record_id text not null,
  project_source_record_id text,
  external_project_code text,
  reason_code text not null,
  reason_detail text not null,
  quality_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(quality_issues)='array'),
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload)='object'),
  status text not null default 'pending' check (status in ('pending','under_review','resolved','accepted_with_risk','ignored')),
  first_seen_batch_id uuid not null references public.feishu_reconcile_batches(id) on delete restrict,
  last_seen_batch_id uuid not null references public.feishu_reconcile_batches(id) on delete restrict,
  occurrence_count integer not null default 1 check (occurrence_count>0),
  owner_user_id uuid references public.app_users(id) on delete set null,
  resolution_note text,
  resolved_by uuid references public.app_users(id) on delete set null,
  resolved_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,data_class,domain,source_container_id,source_record_id)
);

create table if not exists public.feishu_reconcile_cursors (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  domain text not null check (domain in ('project','milestone','task','risk','contract','payment','cost','syncLedger')),
  source_container_id text not null,
  last_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  source_checkpoint text not null,
  source_page_count integer not null default 0,
  source_record_count integer not null default 0,
  last_source_updated_at timestamptz,
  last_succeeded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (org_id,data_class,domain,source_container_id)
);

create table if not exists public.project_milestones (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  milestone_name text not null,
  baseline_date date,
  forecast_date date,
  actual_date date,
  status text,
  owner text,
  progress numeric(7,2) check (progress is null or progress between 0 and 100),
  source_system text not null default 'feishu',
  source_container_id text not null,
  source_record_id text not null,
  source_updated_at timestamptz,
  row_hash text not null,
  version bigint not null default 1 check (version>0),
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz,
  last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,data_class,source_system,source_container_id,source_record_id)
);

create table if not exists public.feishu_sync_ledger_mirror (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  event_id text not null,
  event_type text,
  processing_status text not null,
  severity text,
  summary text,
  error_message text,
  attempts integer,
  request_id text,
  source_system text not null default 'feishu',
  source_container_id text not null,
  source_record_id text not null,
  source_updated_at timestamptz,
  row_hash text not null,
  version bigint not null default 1 check (version>0),
  is_source_deleted boolean not null default false,
  source_deleted_at timestamptz,
  last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,data_class,source_system,source_container_id,source_record_id)
);

alter table public.projects
  add column if not exists source_container_id text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_hash text,
  add column if not exists version bigint not null default 1,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.tasks
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified',
  add column if not exists task_code text,
  add column if not exists source_system text,
  add column if not exists source_container_id text,
  add column if not exists source_record_id text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_hash text,
  add column if not exists version bigint not null default 1,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.risks
  add column if not exists source_system text,
  add column if not exists source_container_id text,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.contracts
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified',
  add column if not exists contract_code text,
  add column if not exists status text,
  add column if not exists payment_terms text,
  add column if not exists source_system text,
  add column if not exists source_container_id text,
  add column if not exists source_record_id text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_hash text,
  add column if not exists version bigint not null default 1,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.payment_milestones
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified',
  add column if not exists payment_code text,
  add column if not exists collected_amount numeric,
  add column if not exists write_off_amount numeric,
  add column if not exists source_system text,
  add column if not exists source_container_id text,
  add column if not exists source_record_id text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_hash text,
  add column if not exists version bigint not null default 1,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.cost_records
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists data_class text not null default 'unclassified',
  add column if not exists cost_code text,
  add column if not exists status text,
  add column if not exists source_system text,
  add column if not exists source_container_id text,
  add column if not exists source_record_id text,
  add column if not exists source_updated_at timestamptz,
  add column if not exists row_hash text,
  add column if not exists version bigint not null default 1,
  add column if not exists is_source_deleted boolean not null default false,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists last_sync_batch_id uuid references public.feishu_reconcile_batches(id) on delete set null,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.tasks target set org_id=project.org_id,data_class=project.data_class
from public.projects project where target.project_id=project.id and (target.org_id is null or target.data_class='unclassified');
update public.risks target set org_id=project.org_id,data_class=project.data_class
from public.projects project where target.project_id=project.id and (target.org_id is null or target.data_class='unclassified');
update public.contracts target set org_id=project.org_id,data_class=project.data_class
from public.projects project where target.project_id=project.id and (target.org_id is null or target.data_class='unclassified');
update public.payment_milestones target set project_id=contract.project_id,org_id=contract.org_id,data_class=contract.data_class
from public.contracts contract where target.contract_id=contract.id and (target.project_id is null or target.org_id is null or target.data_class='unclassified');
update public.cost_records target set org_id=project.org_id,data_class=project.data_class
from public.projects project where target.project_id=project.id and (target.org_id is null or target.data_class='unclassified');

create unique index if not exists idx_projects_feishu_source
  on public.projects(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;
create unique index if not exists idx_tasks_feishu_source
  on public.tasks(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;
create unique index if not exists idx_risks_feishu_source
  on public.risks(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;
create unique index if not exists idx_contracts_feishu_source
  on public.contracts(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;
create unique index if not exists idx_payments_feishu_source
  on public.payment_milestones(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;
create unique index if not exists idx_costs_feishu_source
  on public.cost_records(org_id,data_class,source_system,source_container_id,source_record_id)
  where source_system is not null and source_container_id is not null and source_record_id is not null;

create index if not exists idx_feishu_reconcile_batch_status on public.feishu_reconcile_batches(org_id,data_class,status,started_at desc);
create index if not exists idx_feishu_reconcile_item_batch on public.feishu_reconcile_items(batch_id,domain,action);
create index if not exists idx_feishu_quarantine_pending on public.feishu_reconcile_quarantine(org_id,data_class,status,last_seen_at desc);
create index if not exists idx_project_milestone_project on public.project_milestones(org_id,data_class,project_id,is_source_deleted);

do $$
begin
  if not exists(select 1 from pg_constraint where conname='tasks_data_class_v62_check') then
    alter table public.tasks add constraint tasks_data_class_v62_check check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
  if not exists(select 1 from pg_constraint where conname='contracts_data_class_v62_check') then
    alter table public.contracts add constraint contracts_data_class_v62_check check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
  if not exists(select 1 from pg_constraint where conname='payments_data_class_v62_check') then
    alter table public.payment_milestones add constraint payments_data_class_v62_check check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
  if not exists(select 1 from pg_constraint where conname='costs_data_class_v62_check') then
    alter table public.cost_records add constraint costs_data_class_v62_check check (data_class in ('production','sample','test','diagnostic','unclassified'));
  end if;
end $$;

create or replace function public.feishu_stable_uuid(
  p_org_id uuid,
  p_data_class text,
  p_source_container_id text,
  p_domain text,
  p_source_record_id text
) returns uuid
language sql immutable strict
set search_path=''
as $$
  select extensions.uuid_generate_v5(
    '00d7a6f4-5f12-4b5b-a14f-122c6f606200'::uuid,
    p_org_id::text||'|'||p_data_class||'|'||p_source_container_id||'|'||p_domain||'|'||p_source_record_id
  );
$$;

create or replace function public.enforce_v62_project_scope()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_org_id uuid;
  v_data_class text;
begin
  if new.project_id is null then return new; end if;
  select org_id,data_class into v_org_id,v_data_class from public.projects where id=new.project_id;
  if not found then raise exception 'V62_PROJECT_NOT_FOUND'; end if;
  if new.org_id is not null and new.org_id<>v_org_id then raise exception 'V62_PROJECT_ORG_MISMATCH'; end if;
  if new.data_class is not null and new.data_class not in ('unclassified',v_data_class) then raise exception 'V62_PROJECT_DATA_CLASS_MISMATCH'; end if;
  new.org_id:=v_org_id;
  new.data_class:=v_data_class;
  return new;
end;
$$;

drop trigger if exists trg_v62_milestone_scope on public.project_milestones;
create trigger trg_v62_milestone_scope before insert or update of project_id,org_id,data_class on public.project_milestones
for each row execute function public.enforce_v62_project_scope();
drop trigger if exists trg_v62_task_scope on public.tasks;
create trigger trg_v62_task_scope before insert or update of project_id,org_id,data_class on public.tasks
for each row execute function public.enforce_v62_project_scope();
drop trigger if exists trg_v62_contract_scope on public.contracts;
create trigger trg_v62_contract_scope before insert or update of project_id,org_id,data_class on public.contracts
for each row execute function public.enforce_v62_project_scope();
drop trigger if exists trg_v62_payment_scope on public.payment_milestones;
create trigger trg_v62_payment_scope before insert or update of project_id,org_id,data_class on public.payment_milestones
for each row execute function public.enforce_v62_project_scope();
drop trigger if exists trg_v62_cost_scope on public.cost_records;
create trigger trg_v62_cost_scope before insert or update of project_id,org_id,data_class on public.cost_records
for each row execute function public.enforce_v62_project_scope();

create or replace function public.begin_feishu_reconcile_batch_tx(
  p_org_id uuid,
  p_data_class text,
  p_source_scope text,
  p_source_user_id uuid,
  p_source_container_id text,
  p_trigger_type text,
  p_requested_domains jsonb,
  p_source_checkpoint text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_expected_version bigint,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.feishu_reconcile_batches%rowtype;
  v_domain text;
begin
  if p_expected_version<>0 then raise exception 'V62_EXPECTED_VERSION_MUST_BE_ZERO'; end if;
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'V62_DATA_CLASS_INVALID'; end if;
  if p_source_scope not in ('organization','user') then raise exception 'V62_SOURCE_SCOPE_INVALID'; end if;
  if p_source_scope='user' and p_source_user_id is null then raise exception 'V62_SOURCE_USER_REQUIRED'; end if;
  if p_trigger_type not in ('manual','cron','retry','verification') then raise exception 'V62_TRIGGER_INVALID'; end if;
  if jsonb_typeof(p_requested_domains)<>'array' or jsonb_array_length(p_requested_domains)=0 then raise exception 'V62_DOMAINS_REQUIRED'; end if;
  for v_domain in select value from jsonb_array_elements_text(p_requested_domains) loop
    if v_domain not in ('project','milestone','task','risk','contract','payment','cost','syncLedger') then raise exception 'V62_DOMAIN_INVALID'; end if;
  end loop;
  if nullif(btrim(p_source_container_id),'') is null or nullif(btrim(p_source_checkpoint),'') is null
    or nullif(btrim(p_idempotency_key),'') is null or nullif(btrim(p_request_fingerprint),'') is null
    or nullif(btrim(p_request_id),'') is null then raise exception 'V62_RECONCILE_FIELDS_REQUIRED'; end if;
  if not exists(select 1 from public.organizations where id=p_org_id and status='active') then raise exception 'V62_ORG_NOT_ACTIVE'; end if;

  insert into public.feishu_reconcile_batches(
    org_id,data_class,source_scope,source_user_id,source_container_id,trigger_type,requested_domains,
    source_checkpoint,idempotency_key,request_fingerprint,expected_version,request_id,created_by
  ) values (
    p_org_id,p_data_class,p_source_scope,p_source_user_id,p_source_container_id,p_trigger_type,p_requested_domains,
    p_source_checkpoint,p_idempotency_key,p_request_fingerprint,p_expected_version,p_request_id,p_actor_user_id
  ) on conflict (org_id,data_class,idempotency_key) do nothing;

  select * into v_batch from public.feishu_reconcile_batches
  where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if v_batch.request_fingerprint<>p_request_fingerprint or v_batch.source_container_id<>p_source_container_id
    or v_batch.requested_domains<>p_requested_domains then raise exception 'V62_IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
  return jsonb_build_object('batch_id',v_batch.id,'status',v_batch.status,'created',v_batch.request_id=p_request_id,
    'completed_domains',v_batch.completed_domains,'counts',jsonb_build_object(
      'total',v_batch.total_records,'inserted',v_batch.inserted_records,'updated',v_batch.updated_records,
      'unchanged',v_batch.unchanged_records,'tombstoned',v_batch.tombstoned_records,
      'quarantined',v_batch.quarantined_records,'failed',v_batch.failed_records));
end;
$$;

create or replace function public.apply_feishu_reconcile_domain_tx(
  p_batch_id uuid,
  p_domain text,
  p_records jsonb,
  p_seen_record_ids jsonb,
  p_source_page_count integer,
  p_full_snapshot boolean,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.feishu_reconcile_batches%rowtype;
  v_record jsonb;
  v_payload jsonb;
  v_source jsonb;
  v_project_ref jsonb;
  v_quality jsonb;
  v_source_record_id text;
  v_project_source_record_id text;
  v_project_code text;
  v_project_id uuid;
  v_target_id uuid;
  v_existing_hash text;
  v_existing_deleted boolean;
  v_action text;
  v_target_table text;
  v_reason_code text;
  v_reason_detail text;
  v_source_updated_at timestamptz;
  v_row_hash text;
  v_data_class text;
  v_count integer;
  v_max_source_updated_at timestamptz;
begin
  select * into v_batch from public.feishu_reconcile_batches where id=p_batch_id for update;
  if not found then raise exception 'V62_BATCH_NOT_FOUND'; end if;
  if v_batch.status<>'running' then
    return jsonb_build_object('batch_id',v_batch.id,'domain',p_domain,'status',v_batch.status,'already_finalized',true);
  end if;
  if p_domain not in ('project','milestone','task','risk','contract','payment','cost','syncLedger') then raise exception 'V62_DOMAIN_INVALID'; end if;
  if not (v_batch.requested_domains ? p_domain) then raise exception 'V62_DOMAIN_NOT_REQUESTED'; end if;
  if jsonb_typeof(p_records)<>'array' or jsonb_typeof(p_seen_record_ids)<>'array' then raise exception 'V62_RECORD_ARRAY_REQUIRED'; end if;
  if p_source_page_count<0 then raise exception 'V62_PAGE_COUNT_INVALID'; end if;

  for v_record in select value from jsonb_array_elements(p_records) loop
    v_payload:=coalesce(v_record->'payload','{}'::jsonb);
    v_source:=coalesce(v_record->'source','{}'::jsonb);
    v_project_ref:=coalesce(v_record->'project_reference','{}'::jsonb);
    v_quality:=coalesce(v_record#>'{quality,issues}','[]'::jsonb);
    v_source_record_id:=nullif(v_source->>'record_id','');
    v_project_source_record_id:=nullif(v_project_ref->>'sourceRecordId','');
    v_project_code:=nullif(v_project_ref->>'projectCode','');
    v_data_class:=coalesce(nullif(v_record->>'data_class',''),'unclassified');
    v_row_hash:=nullif(v_record->>'row_hash','');
    v_source_updated_at:=nullif(v_source->>'updated_at','')::timestamptz;
    v_project_id:=null;
    v_target_id:=null;
    v_existing_hash:=null;
    v_existing_deleted:=false;
    v_reason_code:=null;
    v_reason_detail:=null;

    if v_source_record_id is null or v_row_hash is null then
      v_reason_code:='SOURCE_ID_OR_HASH_REQUIRED';v_reason_detail:='标准化记录缺少飞书记录ID或行哈希。';
    elsif v_data_class<>v_batch.data_class then
      v_reason_code:='DATA_CLASS_MISMATCH';v_reason_detail:='记录数据分类与批次数据空间不一致。';
    elsif coalesce(v_record#>>'{quality,status}','quarantine')<>'ready' then
      v_reason_code:=coalesce(v_quality->0->>'code','DATA_QUALITY_FAILED');
      v_reason_detail:=coalesce(v_quality->0->>'message','飞书记录未通过数据质量门禁。');
    end if;

    if v_reason_code is null and p_domain='project' then
      v_project_id:=public.feishu_stable_uuid(v_batch.org_id,v_batch.data_class,v_batch.source_container_id,'project',v_source_record_id);
      v_project_code:=nullif(v_payload->>'project_code','');
      if exists(select 1 from public.projects where org_id=v_batch.org_id and data_class=v_batch.data_class
        and lower(coalesce(oa_no,''))=lower(coalesce(v_project_code,'')) and id<>v_project_id and is_source_deleted=false) then
        v_reason_code:='PROJECT_CODE_CONFLICT';v_reason_detail:='同一组织和数据空间存在重复项目编号，禁止自动合并。';
      end if;
    elsif v_reason_code is null and p_domain<>'syncLedger' then
      if v_project_source_record_id is not null then
        select mapping.project_id into v_project_id from public.project_identity_mappings mapping
        where mapping.org_id=v_batch.org_id and mapping.data_class=v_batch.data_class and mapping.source_type='feishu'
          and mapping.source_container_id=v_batch.source_container_id and mapping.source_record_id=v_project_source_record_id
          and mapping.mapping_status='active';
      end if;
      if v_project_id is null and v_project_code is not null then
        select case when count(distinct mapping.project_id)=1 then min(mapping.project_id::text)::uuid else null end
          into v_project_id from public.project_identity_mappings mapping
        where mapping.org_id=v_batch.org_id and mapping.data_class=v_batch.data_class and mapping.source_type='feishu'
          and mapping.source_container_id=v_batch.source_container_id and lower(coalesce(mapping.external_project_code,''))=lower(v_project_code)
          and mapping.mapping_status='active';
      end if;
      if v_project_id is null then
        v_reason_code:='PROJECT_REFERENCE_UNRESOLVED';v_reason_detail:='未通过飞书项目记录ID或唯一项目编号解析到稳定项目。';
      end if;
    end if;

    if v_reason_code is not null then
      insert into public.feishu_reconcile_quarantine(
        org_id,data_class,domain,source_container_id,source_record_id,project_source_record_id,external_project_code,
        reason_code,reason_detail,quality_issues,source_payload,first_seen_batch_id,last_seen_batch_id
      ) values (
        v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,coalesce(v_source_record_id,'missing:'||extensions.uuid_generate_v4()::text),
        v_project_source_record_id,v_project_code,v_reason_code,v_reason_detail,v_quality,coalesce(v_record->'raw_fields','{}'::jsonb),v_batch.id,v_batch.id
      ) on conflict (org_id,data_class,domain,source_container_id,source_record_id) do update set
        project_source_record_id=excluded.project_source_record_id,external_project_code=excluded.external_project_code,
        reason_code=excluded.reason_code,reason_detail=excluded.reason_detail,quality_issues=excluded.quality_issues,
        source_payload=excluded.source_payload,status='pending',last_seen_batch_id=excluded.last_seen_batch_id,
        occurrence_count=public.feishu_reconcile_quarantine.occurrence_count+1,resolution_note=null,resolved_by=null,resolved_at=null,
        last_seen_at=now(),updated_at=now();
      insert into public.feishu_reconcile_items(
        batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_source_record_id,external_project_code,
        project_id,action,status,source_updated_at,row_hash,quality_issues,source_payload,error_code,error_detail,request_id
      ) values (
        v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,coalesce(v_source_record_id,'missing'),
        v_project_source_record_id,v_project_code,v_project_id,'quarantined','quarantined',v_source_updated_at,v_row_hash,v_quality,
        coalesce(v_record->'raw_fields','{}'::jsonb),v_reason_code,v_reason_detail,p_request_id
      ) on conflict (batch_id,domain,source_record_id) do update set action='quarantined',status='quarantined',
        quality_issues=excluded.quality_issues,error_code=excluded.error_code,error_detail=excluded.error_detail,processed_at=now();
      continue;
    end if;

    v_target_id:=public.feishu_stable_uuid(v_batch.org_id,v_batch.data_class,v_batch.source_container_id,p_domain,v_source_record_id);
    if p_domain='project' then
      v_target_table:='projects';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.projects where id=v_project_id for update;
      if not found then
        insert into public.projects(
          id,org_id,data_class,name,oa_no,province,product_category,project_type,channel,sales_owner,contract_date,deadline,
          plan_delivery_date,status,progress,project_level,is_key_project,contract_amount,collection_amount,receivable,payment_terms,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,version,is_source_deleted,source_deleted_at,last_sync_batch_id,raw_payload
        ) values (
          v_project_id,v_batch.org_id,v_batch.data_class,v_payload->>'project_name',v_payload->>'project_code',v_payload->>'province',
          v_payload->>'product_category',v_payload->>'project_type',v_payload->>'channel',v_payload->>'sales_owner',
          nullif(v_payload->>'contract_date','')::date,nullif(v_payload->>'deadline','')::date,nullif(v_payload->>'plan_delivery_date','')::date,
          coalesce(nullif(v_payload->>'status',''),'active'),coalesce(round(nullif(v_payload->>'progress','')::numeric)::integer,0),v_payload->>'project_level',
          coalesce((v_payload->>'is_key_project')::boolean,false),nullif(v_payload->>'contract_amount','')::numeric,
          coalesce(nullif(v_payload->>'collection_amount','')::numeric,0),coalesce(nullif(v_payload->>'receivable','')::numeric,0),
          case when v_payload->>'payment_terms' is null then null else jsonb_build_object('description',v_payload->>'payment_terms') end,
          'feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,1,false,null,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb)
        );
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then
        v_action:='unchanged';
        update public.projects set source_updated_at=coalesce(v_source_updated_at,source_updated_at),last_sync_batch_id=v_batch.id,updated_at=now() where id=v_project_id;
      else
        update public.projects set
          name=v_payload->>'project_name',oa_no=v_payload->>'project_code',province=v_payload->>'province',product_category=v_payload->>'product_category',
          project_type=v_payload->>'project_type',channel=v_payload->>'channel',sales_owner=v_payload->>'sales_owner',
          contract_date=nullif(v_payload->>'contract_date','')::date,deadline=nullif(v_payload->>'deadline','')::date,
          plan_delivery_date=nullif(v_payload->>'plan_delivery_date','')::date,status=coalesce(nullif(v_payload->>'status',''),status),
          progress=coalesce(round(nullif(v_payload->>'progress','')::numeric)::integer,progress),project_level=v_payload->>'project_level',
          is_key_project=coalesce((v_payload->>'is_key_project')::boolean,false),contract_amount=nullif(v_payload->>'contract_amount','')::numeric,
          collection_amount=coalesce(nullif(v_payload->>'collection_amount','')::numeric,0),receivable=coalesce(nullif(v_payload->>'receivable','')::numeric,0),
          payment_terms=case when v_payload->>'payment_terms' is null then null else jsonb_build_object('description',v_payload->>'payment_terms') end,
          source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,is_source_deleted=false,source_deleted_at=null,
          last_sync_batch_id=v_batch.id,raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now()
        where id=v_project_id;
        v_action:='updated';
      end if;
      insert into public.project_identity_mappings(
        org_id,project_id,source_type,source_container_id,source_record_id,external_project_code,historical_project_name,data_class,
        mapping_status,conflict_detail,verified_by,verified_at
      ) values (
        v_batch.org_id,v_project_id,'feishu',v_batch.source_container_id,v_source_record_id,v_payload->>'project_code',v_payload->>'project_name',
        v_batch.data_class,'active','{}'::jsonb,p_actor_user_id,now()
      ) on conflict (org_id,source_type,source_container_id,source_record_id) do update set
        project_id=excluded.project_id,external_project_code=excluded.external_project_code,historical_project_name=excluded.historical_project_name,
        data_class=excluded.data_class,mapping_status='active',conflict_detail='{}'::jsonb,verified_by=excluded.verified_by,verified_at=now(),updated_at=now();
      v_target_id:=v_project_id;
    elsif p_domain='milestone' then
      v_target_table:='project_milestones';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.project_milestones where id=v_target_id for update;
      if not found then
        insert into public.project_milestones(id,org_id,project_id,data_class,milestone_name,baseline_date,forecast_date,actual_date,status,owner,progress,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_batch.org_id,v_project_id,v_batch.data_class,v_payload->>'milestone_name',nullif(v_payload->>'baseline_date','')::date,
          nullif(v_payload->>'forecast_date','')::date,nullif(v_payload->>'actual_date','')::date,v_payload->>'status',v_payload->>'owner',
          nullif(v_payload->>'progress','')::numeric,'feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.project_milestones set project_id=v_project_id,milestone_name=v_payload->>'milestone_name',baseline_date=nullif(v_payload->>'baseline_date','')::date,
          forecast_date=nullif(v_payload->>'forecast_date','')::date,actual_date=nullif(v_payload->>'actual_date','')::date,status=v_payload->>'status',owner=v_payload->>'owner',
          progress=nullif(v_payload->>'progress','')::numeric,source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,is_source_deleted=false,
          source_deleted_at=null,last_sync_batch_id=v_batch.id,raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    elsif p_domain='task' then
      v_target_table:='tasks';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.tasks where id=v_target_id for update;
      if not found then
        insert into public.tasks(id,project_id,name,plan_start,plan_end,actual_start,actual_end,percent_complete,status,assignee,predecessors,org_id,data_class,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_project_id,v_payload->>'task_name',nullif(v_payload->>'plan_start','')::date,nullif(v_payload->>'plan_end','')::date,
          nullif(v_payload->>'actual_start','')::date,nullif(v_payload->>'actual_end','')::date,coalesce(round(nullif(v_payload->>'progress','')::numeric)::integer,0),
          coalesce(v_payload->>'status','pending'),v_payload->>'assignee',coalesce(v_payload->'predecessors','[]'::jsonb),v_batch.org_id,v_batch.data_class,
          'feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.tasks set project_id=v_project_id,name=v_payload->>'task_name',plan_start=nullif(v_payload->>'plan_start','')::date,
          plan_end=nullif(v_payload->>'plan_end','')::date,actual_start=nullif(v_payload->>'actual_start','')::date,actual_end=nullif(v_payload->>'actual_end','')::date,
          percent_complete=coalesce(round(nullif(v_payload->>'progress','')::numeric)::integer,0),status=coalesce(v_payload->>'status','pending'),assignee=v_payload->>'assignee',
          predecessors=coalesce(v_payload->'predecessors','[]'::jsonb),source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,
          is_source_deleted=false,source_deleted_at=null,last_sync_batch_id=v_batch.id,raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    elsif p_domain='risk' then
      v_target_table:='risks';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.risks where id=v_target_id for update;
      if not found then
        insert into public.risks(id,project_id,description,category,probability,impact,pi_score,status,response_strategy,preventive_action,owner,trigger_condition,due_date,next_review_date,
          risk_code,org_id,data_class,source,source_system,source_container_id,source_record_id,source_updated_at,row_hash,version,is_source_deleted,last_sync_batch_id,raw_payload)
        values(v_target_id,v_project_id,v_payload->>'description',v_payload->>'category',round(nullif(v_payload->>'probability','')::numeric)::integer,
          round(nullif(v_payload->>'impact','')::numeric)::integer,round(nullif(v_payload->>'risk_score','')::numeric)::integer,coalesce(v_payload->>'status','identified'),
          v_payload->>'response_strategy',v_payload->>'response_action',v_payload->>'owner',v_payload->>'trigger_condition',nullif(v_payload->>'due_date','')::date,
          nullif(v_payload->>'next_review_date','')::date,v_payload->>'risk_code',v_batch.org_id,v_batch.data_class,'feishu','feishu',v_batch.source_container_id,
          v_source_record_id,v_source_updated_at,v_row_hash,1,false,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.risks set project_id=v_project_id,description=v_payload->>'description',category=v_payload->>'category',
          probability=round(nullif(v_payload->>'probability','')::numeric)::integer,impact=round(nullif(v_payload->>'impact','')::numeric)::integer,
          pi_score=round(nullif(v_payload->>'risk_score','')::numeric)::integer,status=coalesce(v_payload->>'status','identified'),
          response_strategy=v_payload->>'response_strategy',preventive_action=v_payload->>'response_action',owner=v_payload->>'owner',
          trigger_condition=v_payload->>'trigger_condition',due_date=nullif(v_payload->>'due_date','')::date,next_review_date=nullif(v_payload->>'next_review_date','')::date,
          risk_code=v_payload->>'risk_code',source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,is_source_deleted=false,
          source_deleted_at=null,last_sync_batch_id=v_batch.id,raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    elsif p_domain='contract' then
      v_target_table:='contracts';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.contracts where id=v_target_id for update;
      if not found then
        insert into public.contracts(id,project_id,name,party_a,party_b,total_amount,signed_date,org_id,data_class,contract_code,status,payment_terms,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_project_id,v_payload->>'contract_name',v_payload->>'party_a',v_payload->>'party_b',coalesce(nullif(v_payload->>'total_amount','')::numeric,0),
          nullif(v_payload->>'signed_date','')::date,v_batch.org_id,v_batch.data_class,v_payload->>'contract_code',v_payload->>'status',v_payload->>'payment_terms',
          'feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.contracts set project_id=v_project_id,name=v_payload->>'contract_name',party_a=v_payload->>'party_a',party_b=v_payload->>'party_b',
          total_amount=coalesce(nullif(v_payload->>'total_amount','')::numeric,0),signed_date=nullif(v_payload->>'signed_date','')::date,
          contract_code=v_payload->>'contract_code',status=v_payload->>'status',payment_terms=v_payload->>'payment_terms',source_updated_at=v_source_updated_at,
          row_hash=v_row_hash,version=version+1,is_source_deleted=false,source_deleted_at=null,last_sync_batch_id=v_batch.id,
          raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    elsif p_domain='payment' then
      v_target_table:='payment_milestones';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.payment_milestones where id=v_target_id for update;
      if not found then
        insert into public.payment_milestones(id,project_id,name,amount,due_date,status,actual_paid_date,org_id,data_class,payment_code,collected_amount,write_off_amount,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_project_id,coalesce(v_payload->>'payment_name',v_payload->>'payment_code'),coalesce(nullif(v_payload->>'receivable_amount','')::numeric,0),
          nullif(v_payload->>'due_date','')::date,coalesce(v_payload->>'status','unpaid'),nullif(v_payload->>'actual_paid_date','')::date,
          v_batch.org_id,v_batch.data_class,v_payload->>'payment_code',nullif(v_payload->>'collected_amount','')::numeric,nullif(v_payload->>'write_off_amount','')::numeric,
          'feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.payment_milestones set project_id=v_project_id,name=coalesce(v_payload->>'payment_name',v_payload->>'payment_code'),
          amount=coalesce(nullif(v_payload->>'receivable_amount','')::numeric,0),due_date=nullif(v_payload->>'due_date','')::date,status=coalesce(v_payload->>'status','unpaid'),
          actual_paid_date=nullif(v_payload->>'actual_paid_date','')::date,payment_code=v_payload->>'payment_code',
          collected_amount=nullif(v_payload->>'collected_amount','')::numeric,write_off_amount=nullif(v_payload->>'write_off_amount','')::numeric,
          source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,is_source_deleted=false,source_deleted_at=null,last_sync_batch_id=v_batch.id,
          raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    elsif p_domain='cost' then
      v_target_table:='cost_records';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.cost_records where id=v_target_id for update;
      if not found then
        insert into public.cost_records(id,project_id,period,planned_value,actual_cost,earned_value,org_id,data_class,cost_code,status,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_project_id,coalesce(v_payload->>'period','未登记'),coalesce(nullif(v_payload->>'planned_value','')::numeric,0),
          coalesce(nullif(v_payload->>'actual_cost','')::numeric,0),coalesce(nullif(v_payload->>'earned_value','')::numeric,0),v_batch.org_id,v_batch.data_class,
          v_payload->>'cost_code',v_payload->>'status','feishu',v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,
          coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.cost_records set project_id=v_project_id,period=coalesce(v_payload->>'period','未登记'),
          planned_value=coalesce(nullif(v_payload->>'planned_value','')::numeric,0),actual_cost=coalesce(nullif(v_payload->>'actual_cost','')::numeric,0),
          earned_value=coalesce(nullif(v_payload->>'earned_value','')::numeric,0),cost_code=v_payload->>'cost_code',status=v_payload->>'status',
          source_updated_at=v_source_updated_at,row_hash=v_row_hash,version=version+1,is_source_deleted=false,source_deleted_at=null,last_sync_batch_id=v_batch.id,
          raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    else
      v_target_table:='feishu_sync_ledger_mirror';
      select row_hash,is_source_deleted into v_existing_hash,v_existing_deleted from public.feishu_sync_ledger_mirror where id=v_target_id for update;
      if not found then
        insert into public.feishu_sync_ledger_mirror(id,org_id,project_id,data_class,event_id,event_type,processing_status,severity,summary,error_message,attempts,request_id,
          source_system,source_container_id,source_record_id,source_updated_at,row_hash,last_sync_batch_id,raw_payload)
        values(v_target_id,v_batch.org_id,null,v_batch.data_class,v_payload->>'event_id',v_payload->>'event_type',v_payload->>'processing_status',v_payload->>'severity',
          v_payload->>'summary',v_payload->>'error_message',round(nullif(v_payload->>'attempts','')::numeric)::integer,v_payload->>'request_id','feishu',
          v_batch.source_container_id,v_source_record_id,v_source_updated_at,v_row_hash,v_batch.id,coalesce(v_record->'raw_fields','{}'::jsonb));
        v_action:='inserted';
      elsif v_existing_hash=v_row_hash and not coalesce(v_existing_deleted,false) then v_action:='unchanged';
      else
        update public.feishu_sync_ledger_mirror set event_id=v_payload->>'event_id',event_type=v_payload->>'event_type',processing_status=v_payload->>'processing_status',
          severity=v_payload->>'severity',summary=v_payload->>'summary',error_message=v_payload->>'error_message',
          attempts=round(nullif(v_payload->>'attempts','')::numeric)::integer,request_id=v_payload->>'request_id',source_updated_at=v_source_updated_at,
          row_hash=v_row_hash,version=version+1,is_source_deleted=false,source_deleted_at=null,last_sync_batch_id=v_batch.id,
          raw_payload=coalesce(v_record->'raw_fields','{}'::jsonb),updated_at=now() where id=v_target_id;
        v_action:='updated';
      end if;
    end if;

    if p_domain not in ('project','syncLedger') and v_action='unchanged' then
      execute format('update public.%I set source_updated_at=coalesce($1,source_updated_at),last_sync_batch_id=$2,updated_at=now() where id=$3',v_target_table)
      using v_source_updated_at,v_batch.id,v_target_id;
    elsif p_domain='syncLedger' and v_action='unchanged' then
      update public.feishu_sync_ledger_mirror set source_updated_at=coalesce(v_source_updated_at,source_updated_at),last_sync_batch_id=v_batch.id,updated_at=now() where id=v_target_id;
    end if;
    update public.feishu_reconcile_quarantine set status='resolved',resolution_note='后续同步已通过数据质量与稳定关联门禁。',
      resolved_by=p_actor_user_id,resolved_at=now(),updated_at=now()
    where org_id=v_batch.org_id and data_class=v_batch.data_class and domain=p_domain and source_container_id=v_batch.source_container_id
      and source_record_id=v_source_record_id and status in ('pending','under_review');
    insert into public.feishu_reconcile_items(
      batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_source_record_id,external_project_code,project_id,
      action,status,target_table,target_id,source_updated_at,row_hash,quality_issues,source_payload,request_id
    ) values (
      v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,v_source_record_id,v_project_source_record_id,v_project_code,
      v_project_id,v_action,'succeeded',v_target_table,v_target_id,v_source_updated_at,v_row_hash,v_quality,coalesce(v_record->'raw_fields','{}'::jsonb),p_request_id
    ) on conflict (batch_id,domain,source_record_id) do update set action=excluded.action,status='succeeded',target_table=excluded.target_table,
      target_id=excluded.target_id,project_id=excluded.project_id,source_updated_at=excluded.source_updated_at,row_hash=excluded.row_hash,
      quality_issues=excluded.quality_issues,source_payload=excluded.source_payload,error_code=null,error_detail=null,processed_at=now();
    v_max_source_updated_at:=greatest(v_max_source_updated_at,v_source_updated_at);
  end loop;

  if p_full_snapshot then
    if p_domain='project' then
      with changed as (
        update public.projects set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id
          and is_source_deleted=false and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,source_record_id,row_hash
      ) insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,id,'tombstoned','succeeded','projects',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
      update public.project_identity_mappings mapping set mapping_status='revoked',updated_at=now()
      where mapping.org_id=v_batch.org_id and mapping.data_class=v_batch.data_class and mapping.source_type='feishu'
        and mapping.source_container_id=v_batch.source_container_id and mapping.source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids));
    elsif p_domain='milestone' then
      with changed as (update public.project_milestones set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','project_milestones',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    elsif p_domain='task' then
      with changed as (update public.tasks set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','tasks',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    elsif p_domain='risk' then
      with changed as (update public.risks set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','risks',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    elsif p_domain='contract' then
      with changed as (update public.contracts set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','contracts',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    elsif p_domain='payment' then
      with changed as (update public.payment_milestones set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','payment_milestones',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    elsif p_domain='cost' then
      with changed as (update public.cost_records set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','cost_records',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    else
      with changed as (update public.feishu_sync_ledger_mirror set is_source_deleted=true,source_deleted_at=coalesce(source_deleted_at,now()),version=version+1,last_sync_batch_id=v_batch.id,updated_at=now()
        where org_id=v_batch.org_id and data_class=v_batch.data_class and source_system='feishu' and source_container_id=v_batch.source_container_id and is_source_deleted=false
          and source_record_id not in (select value from jsonb_array_elements_text(p_seen_record_ids)) returning id,project_id,source_record_id,row_hash)
      insert into public.feishu_reconcile_items(batch_id,org_id,data_class,domain,source_container_id,source_record_id,project_id,action,status,target_table,target_id,row_hash,request_id)
        select v_batch.id,v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,source_record_id,project_id,'tombstoned','succeeded','feishu_sync_ledger_mirror',id,row_hash,p_request_id from changed
        on conflict (batch_id,domain,source_record_id) do update set action='tombstoned',status='succeeded',processed_at=now();
    end if;
  end if;

  update public.feishu_reconcile_batches batch set
    completed_domains=(select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from (
      select distinct value from jsonb_array_elements_text(batch.completed_domains||jsonb_build_array(p_domain))
    ) domains),
    total_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id),
    inserted_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='inserted'),
    updated_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='updated'),
    unchanged_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='unchanged'),
    tombstoned_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='tombstoned'),
    quarantined_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='quarantined'),
    failed_records=(select count(*) from public.feishu_reconcile_items where batch_id=batch.id and action='failed'),
    updated_at=now()
  where batch.id=v_batch.id;

  select max(source_updated_at) into v_max_source_updated_at from public.feishu_reconcile_items where batch_id=v_batch.id and domain=p_domain;
  insert into public.feishu_reconcile_cursors(org_id,data_class,domain,source_container_id,last_batch_id,source_checkpoint,source_page_count,source_record_count,last_source_updated_at,last_succeeded_at)
  values(v_batch.org_id,v_batch.data_class,p_domain,v_batch.source_container_id,v_batch.id,v_batch.source_checkpoint,p_source_page_count,jsonb_array_length(p_seen_record_ids),v_max_source_updated_at,now())
  on conflict(org_id,data_class,domain,source_container_id) do update set last_batch_id=excluded.last_batch_id,source_checkpoint=excluded.source_checkpoint,
    source_page_count=excluded.source_page_count,source_record_count=excluded.source_record_count,last_source_updated_at=excluded.last_source_updated_at,
    last_succeeded_at=excluded.last_succeeded_at,updated_at=now();

  select count(*) into v_count from public.feishu_reconcile_items where batch_id=v_batch.id and domain=p_domain;
  return jsonb_build_object('batch_id',v_batch.id,'domain',p_domain,'processed',v_count,'source_seen',jsonb_array_length(p_seen_record_ids),'page_count',p_source_page_count);
end;
$$;

create or replace function public.finalize_feishu_reconcile_batch_tx(
  p_batch_id uuid,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_batch public.feishu_reconcile_batches%rowtype;
  v_missing jsonb;
  v_status text;
begin
  select * into v_batch from public.feishu_reconcile_batches where id=p_batch_id for update;
  if not found then raise exception 'V62_BATCH_NOT_FOUND'; end if;
  if v_batch.status in ('completed','completed_with_warnings') then return to_jsonb(v_batch); end if;
  if v_batch.status<>'running' then raise exception 'V62_BATCH_NOT_RUNNING'; end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into v_missing from jsonb_array_elements_text(v_batch.requested_domains)
  where not (v_batch.completed_domains ? value);
  if jsonb_array_length(v_missing)>0 then raise exception 'V62_DOMAINS_INCOMPLETE:%',v_missing::text; end if;
  v_status:=case when v_batch.failed_records>0 then 'failed' when v_batch.quarantined_records>0 or v_batch.tombstoned_records>0 then 'completed_with_warnings' else 'completed' end;
  update public.feishu_reconcile_batches set status=v_status,completed_at=now(),updated_at=now(),
    warnings=case when quarantined_records>0 then warnings||jsonb_build_array(jsonb_build_object('code','QUARANTINE_PENDING','count',quarantined_records)) else warnings end
  where id=v_batch.id returning * into v_batch;
  insert into public.integration_sync_logs(user_id,source,event_type,status,severity,summary,detail,remediation,request_id)
  values(p_actor_user_id,'feishu','reconcile',case when v_status='failed' then 'failed' else 'succeeded' end,
    case when v_status='completed' then 'low' when v_status='completed_with_warnings' then 'medium' else 'high' end,
    '飞书八类业务事实对账'||case when v_status='completed' then '完成' else '完成并存在待治理项' end,
    jsonb_build_object('batch_id',v_batch.id,'data_class',v_batch.data_class,'counts',jsonb_build_object(
      'total',v_batch.total_records,'inserted',v_batch.inserted_records,'updated',v_batch.updated_records,'unchanged',v_batch.unchanged_records,
      'tombstoned',v_batch.tombstoned_records,'quarantined',v_batch.quarantined_records,'failed',v_batch.failed_records)),
    case when v_batch.quarantined_records>0 then '请到数据与集成中心处理隔离记录。' else null end,p_request_id);
  return to_jsonb(v_batch);
end;
$$;

create or replace function public.fail_feishu_reconcile_batch_tx(
  p_batch_id uuid,
  p_error_code text,
  p_error_detail text,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_batch public.feishu_reconcile_batches%rowtype;
begin
  update public.feishu_reconcile_batches set status='failed',error_code=p_error_code,error_detail=p_error_detail,completed_at=now(),updated_at=now()
  where id=p_batch_id and status='running' returning * into v_batch;
  if not found then select * into v_batch from public.feishu_reconcile_batches where id=p_batch_id; end if;
  if not found then raise exception 'V62_BATCH_NOT_FOUND'; end if;
  insert into public.integration_sync_logs(user_id,source,event_type,status,severity,summary,detail,remediation,request_id)
  values(p_actor_user_id,'feishu','reconcile','failed','high','飞书真实数据对账失败',jsonb_build_object('batch_id',p_batch_id,'code',p_error_code),
    '检查失败批次和隔离队列后使用新的幂等键重试。',p_request_id);
  return to_jsonb(v_batch);
end;
$$;

insert into public.data_sync_contracts(
  org_id,fact_key,source_system,target_system,direction,refresh_policy,idempotency_definition,deletion_semantics,
  compensation_strategy,reconciliation_owner_role,status,version,approved_at
)
select null,'feishu_'||domain,'feishu_base','supabase','inbound','cron+manual full snapshot',
  'org_id+data_class+source_container_id+source_record_id+row_hash','soft tombstone; never physical delete',
  'retry with a new source checkpoint; quarantine conflicts','pmo','active',1,now()
from unnest(array['project','milestone','task','risk','contract','payment','cost','sync_ledger']) as domain
where not exists(select 1 from public.data_sync_contracts contract where contract.org_id is null and contract.fact_key='feishu_'||domain and contract.version=1);

alter table public.feishu_reconcile_batches enable row level security;
alter table public.feishu_reconcile_items enable row level security;
alter table public.feishu_reconcile_quarantine enable row level security;
alter table public.feishu_reconcile_cursors enable row level security;
alter table public.project_milestones enable row level security;
alter table public.feishu_sync_ledger_mirror enable row level security;

revoke all on table public.feishu_reconcile_batches from public, anon, authenticated;
revoke all on table public.feishu_reconcile_items from public, anon, authenticated;
revoke all on table public.feishu_reconcile_quarantine from public, anon, authenticated;
revoke all on table public.feishu_reconcile_cursors from public, anon, authenticated;
revoke all on table public.project_milestones from public, anon, authenticated;
revoke all on table public.feishu_sync_ledger_mirror from public, anon, authenticated;
grant select,insert,update,delete on table public.feishu_reconcile_batches to service_role;
grant select,insert,update,delete on table public.feishu_reconcile_items to service_role;
grant select,insert,update,delete on table public.feishu_reconcile_quarantine to service_role;
grant select,insert,update,delete on table public.feishu_reconcile_cursors to service_role;
grant select,insert,update,delete on table public.project_milestones to service_role;
grant select,insert,update,delete on table public.feishu_sync_ledger_mirror to service_role;

revoke all on function public.feishu_stable_uuid(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.enforce_v62_project_scope() from public, anon, authenticated;
revoke all on function public.begin_feishu_reconcile_batch_tx(uuid,text,text,uuid,text,text,jsonb,text,text,text,bigint,uuid,text) from public, anon, authenticated;
revoke all on function public.apply_feishu_reconcile_domain_tx(uuid,text,jsonb,jsonb,integer,boolean,uuid,text) from public, anon, authenticated;
revoke all on function public.finalize_feishu_reconcile_batch_tx(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.fail_feishu_reconcile_batch_tx(uuid,text,text,uuid,text) from public, anon, authenticated;
grant execute on function public.feishu_stable_uuid(uuid,text,text,text,text) to service_role;
grant execute on function public.begin_feishu_reconcile_batch_tx(uuid,text,text,uuid,text,text,jsonb,text,text,text,bigint,uuid,text) to service_role;
grant execute on function public.apply_feishu_reconcile_domain_tx(uuid,text,jsonb,jsonb,integer,boolean,uuid,text) to service_role;
grant execute on function public.finalize_feishu_reconcile_batch_tx(uuid,uuid,text) to service_role;
grant execute on function public.fail_feishu_reconcile_batch_tx(uuid,text,text,uuid,text) to service_role;
