-- V6.3.0: persist project initiation, governance artifacts and approved baselines.
-- Feishu remains the external business fact source. Supabase owns workflow state,
-- optimistic concurrency, idempotency and append-only audit evidence.

create table if not exists public.project_initiation_records (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  project_type text not null default '信息化',
  project_level text not null default 'B',
  sponsor text not null default '',
  business_justification text not null default '',
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','changes_requested','superseded')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class)
);

create table if not exists public.project_governance_artifacts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  artifact_type text not null check (artifact_type in ('business_case','project_charter','management_plan')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  source_type text not null default 'human_input' check (source_type in ('human_input','ai_assisted','imported','feishu')),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','changes_requested','superseded')),
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, artifact_type)
);

create table if not exists public.project_plan_baselines (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  baseline_type text not null check (baseline_type in ('scope','schedule','cost')),
  title text not null,
  content jsonb not null default '{}'::jsonb,
  baseline_value numeric,
  currency text,
  effective_date date,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','changes_requested','superseded')),
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, baseline_type)
);

create table if not exists public.project_governance_decisions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  subject_type text not null check (subject_type in ('governance_artifact','plan_baseline')),
  subject_id uuid not null,
  operation text not null check (operation in ('submit','approve','reject','request_changes','revise','supersede')),
  from_status text not null,
  to_status text not null,
  decision_comment text,
  business_role text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create table if not exists public.project_governance_events (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  aggregate_type text not null check (aggregate_type in ('initiation','governance_artifact','plan_baseline')),
  aggregate_id uuid not null,
  event_type text not null,
  aggregate_version integer not null,
  business_role text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create table if not exists public.project_governance_operation_receipts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  operation text not null,
  idempotency_key text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, data_class, idempotency_key)
);

create index if not exists idx_v63_initiation_project on public.project_initiation_records(project_id, updated_at desc);
create index if not exists idx_v63_artifacts_project on public.project_governance_artifacts(project_id, artifact_type, updated_at desc);
create index if not exists idx_v63_baselines_project on public.project_plan_baselines(project_id, baseline_type, updated_at desc);
create index if not exists idx_v63_decisions_project on public.project_governance_decisions(project_id, created_at desc);
create index if not exists idx_v63_events_project on public.project_governance_events(project_id, created_at desc);

create or replace function public.enforce_v63_governance_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org_id uuid;
  v_data_class text;
begin
  select org_id, data_class into v_org_id, v_data_class from public.projects where id = new.project_id;
  if v_org_id is null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if new.org_id <> v_org_id then raise exception 'ORG_SCOPE_MISMATCH'; end if;
  if new.data_class <> v_data_class then raise exception 'DATA_CLASS_MISMATCH'; end if;
  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'project_initiation_records','project_governance_artifacts','project_plan_baselines',
    'project_governance_decisions','project_governance_events','project_governance_operation_receipts'
  ] loop
    execute format('drop trigger if exists trg_v63_scope on public.%I', v_table);
    execute format('create trigger trg_v63_scope before insert or update on public.%I for each row execute function public.enforce_v63_governance_scope()', v_table);
  end loop;
end $$;

create or replace function public.prevent_v63_governance_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'APPEND_ONLY_EVENT';
end;
$$;

drop trigger if exists trg_v63_event_append_only on public.project_governance_events;
create trigger trg_v63_event_append_only
before update or delete on public.project_governance_events
for each row execute function public.prevent_v63_governance_event_mutation();

create or replace function public.save_project_initiation_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_business_role text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_content jsonb
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.project_initiation_records%rowtype;
  v_receipt public.project_governance_operation_receipts%rowtype;
  v_result public.project_initiation_records%rowtype;
  v_request jsonb;
  v_project_type text;
  v_project_level text;
  v_sponsor text;
  v_justification text;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  if p_expected_version is null or p_expected_version < 0 or trim(coalesce(p_idempotency_key,'')) = '' then raise exception 'WRITE_CONTRACT_INVALID'; end if;
  v_request := jsonb_build_object('project_id',p_project_id,'content',coalesce(p_content,'{}'::jsonb),'expected_version',p_expected_version);
  select * into v_receipt from public.project_governance_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation <> 'save_initiation' or v_receipt.request_payload <> v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_existing from public.project_initiation_records where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if found and v_existing.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if not found and p_expected_version <> 0 then raise exception 'VERSION_CONFLICT'; end if;
  if found and v_existing.status not in ('draft','changes_requested','rejected') then raise exception 'STATUS_CONFLICT'; end if;
  v_project_type := trim(coalesce(p_content->>'project_type',''));
  v_project_level := trim(coalesce(p_content->>'project_level',''));
  v_sponsor := trim(coalesce(p_content->>'sponsor',''));
  v_justification := trim(coalesce(p_content->>'business_justification',''));
  if v_project_type='' or v_project_level='' or v_sponsor='' or v_justification='' then raise exception 'INITIATION_INPUT_REQUIRED'; end if;
  if found then
    update public.project_initiation_records set
      project_type=v_project_type, project_level=v_project_level, sponsor=v_sponsor,
      business_justification=v_justification, content=p_content, status='draft',
      version=version+1, updated_by=p_actor_user_id, updated_at=now()
    where id=v_existing.id returning * into v_result;
  else
    insert into public.project_initiation_records(org_id,project_id,data_class,project_type,project_level,sponsor,business_justification,content,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,v_project_type,v_project_level,v_sponsor,v_justification,p_content,p_actor_user_id,p_actor_user_id)
    returning * into v_result;
  end if;
  insert into public.project_governance_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'initiation',v_result.id,'initiation_saved',v_result.version,p_business_role,p_actor_user_id,p_idempotency_key,to_jsonb(v_result));
  insert into public.project_governance_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'save_initiation',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_governance_artifact_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_business_role text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_artifact_type text,
  p_title text,
  p_content jsonb,
  p_source_type text default 'human_input'
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.project_governance_artifacts%rowtype;
  v_receipt public.project_governance_operation_receipts%rowtype;
  v_result public.project_governance_artifacts%rowtype;
  v_request jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  if p_artifact_type not in ('business_case','project_charter','management_plan') or p_source_type not in ('human_input','ai_assisted','imported','feishu') then raise exception 'ARTIFACT_INPUT_INVALID'; end if;
  if trim(coalesce(p_title,''))='' or coalesce(p_content,'{}'::jsonb)='{}'::jsonb or trim(coalesce(p_idempotency_key,''))='' or p_expected_version is null or p_expected_version<0 then raise exception 'ARTIFACT_INPUT_REQUIRED'; end if;
  v_request := jsonb_build_object('project_id',p_project_id,'artifact_type',p_artifact_type,'title',p_title,'content',p_content,'source_type',p_source_type,'expected_version',p_expected_version);
  select * into v_receipt from public.project_governance_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation <> 'save_artifact' or v_receipt.request_payload <> v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_existing from public.project_governance_artifacts where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class and artifact_type=p_artifact_type for update;
  if found and v_existing.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if not found and p_expected_version <> 0 then raise exception 'VERSION_CONFLICT'; end if;
  if found and v_existing.status not in ('draft','changes_requested','rejected') then raise exception 'STATUS_CONFLICT'; end if;
  if found then
    update public.project_governance_artifacts set title=trim(p_title),content=p_content,source_type=p_source_type,status='draft',version=version+1,updated_by=p_actor_user_id,updated_at=now()
    where id=v_existing.id returning * into v_result;
  else
    insert into public.project_governance_artifacts(org_id,project_id,data_class,artifact_type,title,content,source_type,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,p_artifact_type,trim(p_title),p_content,p_source_type,p_actor_user_id,p_actor_user_id)
    returning * into v_result;
  end if;
  insert into public.project_governance_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'governance_artifact',v_result.id,'artifact_saved',v_result.version,p_business_role,p_actor_user_id,p_idempotency_key,to_jsonb(v_result));
  insert into public.project_governance_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'save_artifact',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.transition_project_governance_artifact_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_business_role text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_artifact_id uuid,
  p_operation text,
  p_comment text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.project_governance_artifacts%rowtype;
  v_receipt public.project_governance_operation_receipts%rowtype;
  v_result public.project_governance_artifacts%rowtype;
  v_target text;
  v_request jsonb;
begin
  if trim(coalesce(p_idempotency_key,''))='' or p_expected_version is null or p_expected_version<0 then raise exception 'WRITE_CONTRACT_INVALID'; end if;
  v_request := jsonb_build_object('artifact_id',p_artifact_id,'operation',p_operation,'comment',coalesce(p_comment,''),'expected_version',p_expected_version);
  select * into v_receipt from public.project_governance_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation <> 'transition_artifact' or v_receipt.request_payload <> v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_existing from public.project_governance_artifacts where id=p_artifact_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'ARTIFACT_NOT_FOUND'; end if;
  if v_existing.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_operation='submit' and v_existing.status='draft' and p_business_role in ('pm','operations','pmo','business_owner') then v_target:='submitted';
  elsif p_operation in ('approve','reject','request_changes') and v_existing.status='submitted' and p_business_role in ('pmo','sponsor','business_owner') then
    v_target:=case p_operation when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
  elsif p_operation='revise' and v_existing.status in ('changes_requested','rejected') and p_business_role in ('pm','operations','pmo','business_owner') then v_target:='draft';
  elsif p_operation='supersede' and v_existing.status='approved' and p_business_role in ('pmo','sponsor','business_owner') then v_target:='superseded';
  else
    if p_operation in ('approve','reject','request_changes','supersede') and p_business_role not in ('pmo','sponsor','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
    if p_operation in ('submit','revise') and p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
    raise exception 'STATUS_CONFLICT';
  end if;
  if p_operation in ('approve','reject','request_changes') and trim(coalesce(p_comment,''))='' then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.project_governance_artifacts set status=v_target,version=version+1,updated_by=p_actor_user_id,updated_at=now(),
    submitted_at=case when p_operation='submit' then now() else submitted_at end,
    approved_at=case when p_operation='approve' then now() else approved_at end
  where id=v_existing.id returning * into v_result;
  insert into public.project_governance_decisions(org_id,project_id,data_class,subject_type,subject_id,operation,from_status,to_status,decision_comment,business_role,actor_user_id,idempotency_key)
  values(p_org_id,p_project_id,p_data_class,'governance_artifact',v_existing.id,p_operation,v_existing.status,v_target,nullif(trim(coalesce(p_comment,'')),''),p_business_role,p_actor_user_id,p_idempotency_key);
  insert into public.project_governance_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'governance_artifact',v_result.id,'artifact_'||p_operation,v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',jsonb_build_object('from_status',v_existing.status,'to_status',v_target,'comment',p_comment));
  insert into public.project_governance_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'transition_artifact',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_plan_baseline_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_business_role text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_baseline_type text,
  p_title text,
  p_content jsonb,
  p_baseline_value numeric default null,
  p_currency text default null,
  p_effective_date date default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.project_plan_baselines%rowtype;
  v_receipt public.project_governance_operation_receipts%rowtype;
  v_result public.project_plan_baselines%rowtype;
  v_request jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner','finance') then raise exception 'ROLE_FORBIDDEN'; end if;
  if p_baseline_type not in ('scope','schedule','cost') or trim(coalesce(p_title,''))='' or coalesce(p_content,'{}'::jsonb)='{}'::jsonb or trim(coalesce(p_idempotency_key,''))='' or p_expected_version is null or p_expected_version<0 then raise exception 'BASELINE_INPUT_REQUIRED'; end if;
  if p_baseline_type='cost' and (p_baseline_value is null or trim(coalesce(p_currency,''))='') then raise exception 'COST_BASELINE_VALUE_REQUIRED'; end if;
  v_request := jsonb_build_object('project_id',p_project_id,'baseline_type',p_baseline_type,'title',p_title,'content',p_content,'baseline_value',p_baseline_value,'currency',p_currency,'effective_date',p_effective_date,'expected_version',p_expected_version);
  select * into v_receipt from public.project_governance_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation <> 'save_baseline' or v_receipt.request_payload <> v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_existing from public.project_plan_baselines where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class and baseline_type=p_baseline_type for update;
  if found and v_existing.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if not found and p_expected_version <> 0 then raise exception 'VERSION_CONFLICT'; end if;
  if found and v_existing.status not in ('draft','changes_requested','rejected') then raise exception 'STATUS_CONFLICT'; end if;
  if found then
    update public.project_plan_baselines set title=trim(p_title),content=p_content,baseline_value=p_baseline_value,currency=nullif(trim(coalesce(p_currency,'')),''),effective_date=p_effective_date,status='draft',version=version+1,updated_by=p_actor_user_id,updated_at=now()
    where id=v_existing.id returning * into v_result;
  else
    insert into public.project_plan_baselines(org_id,project_id,data_class,baseline_type,title,content,baseline_value,currency,effective_date,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,p_baseline_type,trim(p_title),p_content,p_baseline_value,nullif(trim(coalesce(p_currency,'')),''),p_effective_date,p_actor_user_id,p_actor_user_id)
    returning * into v_result;
  end if;
  insert into public.project_governance_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'plan_baseline',v_result.id,'baseline_saved',v_result.version,p_business_role,p_actor_user_id,p_idempotency_key,to_jsonb(v_result));
  insert into public.project_governance_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'save_baseline',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.transition_project_plan_baseline_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_business_role text,
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_expected_version integer,
  p_baseline_id uuid,
  p_operation text,
  p_comment text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_existing public.project_plan_baselines%rowtype;
  v_receipt public.project_governance_operation_receipts%rowtype;
  v_result public.project_plan_baselines%rowtype;
  v_target text;
  v_request jsonb;
begin
  if trim(coalesce(p_idempotency_key,''))='' or p_expected_version is null or p_expected_version<0 then raise exception 'WRITE_CONTRACT_INVALID'; end if;
  v_request := jsonb_build_object('baseline_id',p_baseline_id,'operation',p_operation,'comment',coalesce(p_comment,''),'expected_version',p_expected_version);
  select * into v_receipt from public.project_governance_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation <> 'transition_baseline' or v_receipt.request_payload <> v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_existing from public.project_plan_baselines where id=p_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BASELINE_NOT_FOUND'; end if;
  if v_existing.version <> p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_operation='submit' and v_existing.status='draft' and p_business_role in ('pm','operations','pmo','business_owner','finance') then v_target:='submitted';
  elsif p_operation in ('approve','reject','request_changes') and v_existing.status='submitted'
    and (p_business_role in ('pmo','sponsor','business_owner') or (v_existing.baseline_type='cost' and p_business_role='finance')) then
    v_target:=case p_operation when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
  elsif p_operation='revise' and v_existing.status in ('changes_requested','rejected') and p_business_role in ('pm','operations','pmo','business_owner','finance') then v_target:='draft';
  elsif p_operation='supersede' and v_existing.status='approved' and p_business_role in ('pmo','sponsor','business_owner') then v_target:='superseded';
  else
    raise exception 'STATUS_CONFLICT';
  end if;
  if p_operation in ('approve','reject','request_changes') and trim(coalesce(p_comment,''))='' then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.project_plan_baselines set status=v_target,version=version+1,updated_by=p_actor_user_id,updated_at=now(),
    submitted_at=case when p_operation='submit' then now() else submitted_at end,
    approved_at=case when p_operation='approve' then now() else approved_at end
  where id=v_existing.id returning * into v_result;
  insert into public.project_governance_decisions(org_id,project_id,data_class,subject_type,subject_id,operation,from_status,to_status,decision_comment,business_role,actor_user_id,idempotency_key)
  values(p_org_id,p_project_id,p_data_class,'plan_baseline',v_existing.id,p_operation,v_existing.status,v_target,nullif(trim(coalesce(p_comment,'')),''),p_business_role,p_actor_user_id,p_idempotency_key);
  insert into public.project_governance_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'plan_baseline',v_result.id,'baseline_'||p_operation,v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',jsonb_build_object('from_status',v_existing.status,'to_status',v_target,'comment',p_comment));
  insert into public.project_governance_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'transition_baseline',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

alter table public.project_initiation_records enable row level security;
alter table public.project_governance_artifacts enable row level security;
alter table public.project_plan_baselines enable row level security;
alter table public.project_governance_decisions enable row level security;
alter table public.project_governance_events enable row level security;
alter table public.project_governance_operation_receipts enable row level security;

revoke all on table public.project_initiation_records from public, anon, authenticated;
revoke all on table public.project_governance_artifacts from public, anon, authenticated;
revoke all on table public.project_plan_baselines from public, anon, authenticated;
revoke all on table public.project_governance_decisions from public, anon, authenticated;
revoke all on table public.project_governance_events from public, anon, authenticated;
revoke all on table public.project_governance_operation_receipts from public, anon, authenticated;
grant select,insert,update on table public.project_initiation_records,public.project_governance_artifacts,public.project_plan_baselines to service_role;
grant select,insert on table public.project_governance_decisions,public.project_governance_events,public.project_governance_operation_receipts to service_role;
grant usage,select on sequence public.project_governance_events_id_seq to service_role;

revoke all on function public.enforce_v63_governance_scope() from public, anon, authenticated;
revoke all on function public.prevent_v63_governance_event_mutation() from public, anon, authenticated;
revoke all on function public.save_project_initiation_tx(uuid,uuid,text,text,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_governance_artifact_tx(uuid,uuid,text,text,uuid,text,integer,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.transition_project_governance_artifact_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) from public, anon, authenticated;
revoke all on function public.save_project_plan_baseline_tx(uuid,uuid,text,text,uuid,text,integer,text,text,jsonb,numeric,text,date) from public, anon, authenticated;
revoke all on function public.transition_project_plan_baseline_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) from public, anon, authenticated;

grant execute on function public.enforce_v63_governance_scope() to service_role;
grant execute on function public.prevent_v63_governance_event_mutation() to service_role;
grant execute on function public.save_project_initiation_tx(uuid,uuid,text,text,uuid,text,integer,jsonb) to service_role;
grant execute on function public.save_project_governance_artifact_tx(uuid,uuid,text,text,uuid,text,integer,text,text,jsonb,text) to service_role;
grant execute on function public.transition_project_governance_artifact_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) to service_role;
grant execute on function public.save_project_plan_baseline_tx(uuid,uuid,text,text,uuid,text,integer,text,text,jsonb,numeric,text,date) to service_role;
grant execute on function public.transition_project_plan_baseline_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) to service_role;

notify pgrst, 'reload schema';
