-- V6.3.1: versioned WBS, governed CPM/EVM snapshots and 8-12 week resource plans.
-- Feishu and approved project baselines remain business fact sources. Supabase owns
-- workflow state, calculation lineage, optimistic concurrency and append-only evidence.

create table if not exists public.project_wbs_versions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  revision_no integer not null check (revision_no > 0),
  title text not null,
  scope_source jsonb not null default '{}'::jsonb,
  source_type text not null default 'human_input' check (source_type in ('human_input','ai_assisted','imported','feishu')),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','changes_requested','superseded')),
  version integer not null default 1 check (version > 0),
  submitted_at timestamptz,
  approved_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,project_id,data_class,revision_no)
);

create table if not exists public.project_wbs_items (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  wbs_version_id uuid not null references public.project_wbs_versions(id) on delete cascade,
  item_code text not null,
  parent_item_code text,
  level integer not null check (level between 1 and 12),
  name text not null,
  description text not null default '',
  duration_days numeric(10,2) not null check (duration_days > 0),
  predecessors jsonb not null default '[]'::jsonb check (jsonb_typeof(predecessors)='array'),
  planned_start date,
  planned_end date,
  planned_value numeric(16,2) not null default 0 check (planned_value >= 0),
  weight numeric(8,4) check (weight is null or weight between 0 and 1),
  assignee_user_id uuid references public.app_users(id) on delete set null,
  assignee_name text,
  acceptance_criteria text not null default '',
  created_at timestamptz not null default now(),
  unique (wbs_version_id,item_code),
  check (parent_item_code is null or parent_item_code <> item_code),
  check (planned_end is null or planned_start is null or planned_end >= planned_start)
);

create table if not exists public.project_delivery_actuals (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  wbs_version_id uuid not null references public.project_wbs_versions(id) on delete restrict,
  wbs_item_id uuid not null references public.project_wbs_items(id) on delete restrict,
  actual_start date,
  actual_end date,
  percent_complete numeric(7,4) not null default 0 check (percent_complete between 0 and 100),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','blocked','cancelled')),
  actual_cost numeric(16,2) not null default 0 check (actual_cost >= 0),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence)='array'),
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,project_id,data_class,wbs_item_id),
  check (actual_end is null or actual_start is null or actual_end >= actual_start)
);

create table if not exists public.project_schedule_snapshots (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  wbs_version_id uuid not null references public.project_wbs_versions(id) on delete restrict,
  calculation_version integer not null check (calculation_version > 0),
  input_hash text not null,
  project_duration numeric(12,2) not null check (project_duration >= 0),
  critical_path jsonb not null default '[]'::jsonb check (jsonb_typeof(critical_path)='array'),
  result jsonb not null,
  source_updated_at timestamptz,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id,project_id,data_class,calculation_version),
  unique (org_id,project_id,data_class,input_hash)
);

create table if not exists public.project_evm_snapshots (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  wbs_version_id uuid not null references public.project_wbs_versions(id) on delete restrict,
  cost_baseline_id uuid not null references public.project_plan_baselines(id) on delete restrict,
  snapshot_version integer not null check (snapshot_version > 0),
  as_of_date date not null,
  input_hash text not null,
  bac numeric(16,2) not null check (bac > 0),
  pv numeric(16,2) not null check (pv >= 0),
  ev numeric(16,2) not null check (ev >= 0),
  ac numeric(16,2) not null check (ac >= 0),
  sv numeric(16,2) not null,
  cv numeric(16,2) not null,
  spi numeric(16,6) not null,
  cpi numeric(16,6) not null,
  eac numeric(16,2) not null,
  etc numeric(16,2) not null,
  vac numeric(16,2) not null,
  periods jsonb not null check (jsonb_typeof(periods)='array'),
  result jsonb not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id,project_id,data_class,snapshot_version),
  unique (org_id,project_id,data_class,input_hash)
);

create table if not exists public.project_resource_plans (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  title text not null,
  horizon_start date not null,
  horizon_end date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','changes_requested','superseded')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,project_id,data_class),
  check (horizon_end >= horizon_start + 55 and horizon_end <= horizon_start + 83)
);

create table if not exists public.project_resource_capacity_periods (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  resource_plan_id uuid not null references public.project_resource_plans(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  owner_name text not null,
  role_name text not null,
  period_start date not null,
  period_end date not null,
  capacity_hours numeric(12,2) not null check (capacity_hours >= 0),
  created_at timestamptz not null default now(),
  unique (resource_plan_id,owner_user_id,period_start),
  check (period_end >= period_start)
);

create table if not exists public.project_resource_assignments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  resource_plan_id uuid not null references public.project_resource_plans(id) on delete cascade,
  capacity_period_id uuid not null references public.project_resource_capacity_periods(id) on delete cascade,
  wbs_item_id uuid references public.project_wbs_items(id) on delete set null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  allocated_hours numeric(12,2) not null check (allocated_hours >= 0),
  allocation_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.project_resource_conflict_actions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  resource_plan_id uuid not null references public.project_resource_plans(id) on delete cascade,
  capacity_period_id uuid not null references public.project_resource_capacity_periods(id) on delete cascade,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  overload_hours numeric(12,2) not null check (overload_hours > 0),
  action_title text not null,
  action_plan text not null default '',
  due_at timestamptz not null,
  status text not null default 'assigned' check (status in ('assigned','accepted','in_progress','evidence_submitted','verified','closed','reopened','cancelled')),
  resolution_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(resolution_evidence)='array'),
  review_comment text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resource_plan_id,capacity_period_id,owner_user_id)
);

create table if not exists public.project_delivery_operation_receipts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  operation text not null,
  idempotency_key text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id,data_class,idempotency_key)
);

create table if not exists public.project_delivery_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  aggregate_version integer not null,
  business_role text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id,data_class,idempotency_key)
);

create index if not exists idx_v631_wbs_project on public.project_wbs_versions(project_id,data_class,revision_no desc);
create index if not exists idx_v631_wbs_items on public.project_wbs_items(wbs_version_id,item_code);
create index if not exists idx_v631_actuals_project on public.project_delivery_actuals(project_id,data_class,updated_at desc);
create index if not exists idx_v631_schedule_project on public.project_schedule_snapshots(project_id,data_class,created_at desc);
create index if not exists idx_v631_evm_project on public.project_evm_snapshots(project_id,data_class,as_of_date desc);
create index if not exists idx_v631_resource_project on public.project_resource_plans(project_id,data_class,updated_at desc);
create index if not exists idx_v631_resource_conflicts on public.project_resource_conflict_actions(project_id,data_class,status,due_at);
create index if not exists idx_v631_delivery_events on public.project_delivery_events(project_id,data_class,created_at desc);
create unique index if not exists uq_v631_resource_assignment_scope
  on public.project_resource_assignments(
    resource_plan_id,
    capacity_period_id,
    coalesce(wbs_item_id,'00000000-0000-0000-0000-000000000000'::uuid),
    owner_user_id
  );

create or replace function public.enforce_v631_delivery_scope()
returns trigger language plpgsql set search_path = public,pg_temp as $$
declare v_project record;
begin
  select org_id,data_class into v_project from public.projects where id=new.project_id;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.org_id is distinct from new.org_id then raise exception 'ORG_SCOPE_MISMATCH'; end if;
  if v_project.data_class is distinct from new.data_class then raise exception 'DATA_CLASS_MISMATCH'; end if;
  return new;
end;
$$;

create or replace function public.prevent_v631_delivery_event_mutation()
returns trigger language plpgsql set search_path = public,pg_temp as $$
begin
  raise exception 'DELIVERY_EVENTS_APPEND_ONLY';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'project_wbs_versions','project_wbs_items','project_delivery_actuals','project_schedule_snapshots',
    'project_evm_snapshots','project_resource_plans','project_resource_capacity_periods',
    'project_resource_assignments','project_resource_conflict_actions','project_delivery_operation_receipts',
    'project_delivery_events'
  ] loop
    execute format('drop trigger if exists trg_v631_scope on public.%I',t);
    execute format('create trigger trg_v631_scope before insert or update on public.%I for each row execute function public.enforce_v631_delivery_scope()',t);
  end loop;
end;
$$;

drop trigger if exists trg_v631_delivery_events_append_only on public.project_delivery_events;
create trigger trg_v631_delivery_events_append_only before update or delete on public.project_delivery_events
for each row execute function public.prevent_v631_delivery_event_mutation();

create or replace function public.save_project_wbs_version_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_title text,p_scope_source jsonb,p_items jsonb,p_source_type text
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_current public.project_wbs_versions%rowtype; v_result public.project_wbs_versions%rowtype;
  v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb; v_revision integer; v_item jsonb;
begin
  if trim(coalesce(p_idempotency_key,''))='' or p_expected_version<0 then raise exception 'WRITE_CONTRACT_INVALID'; end if;
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>1000 then raise exception 'WBS_ITEMS_INVALID'; end if;
  v_request:=jsonb_build_object('title',p_title,'scope_source',p_scope_source,'items',p_items,'expected_version',p_expected_version,'source_type',p_source_type);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then
    if v_receipt.operation<>'save_wbs' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return v_receipt.response_payload;
  end if;
  select * into v_current from public.project_wbs_versions where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class order by revision_no desc limit 1 for update;
  if found then
    if v_current.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    if v_current.status='superseded' then
      v_revision:=v_current.revision_no+1;
      insert into public.project_wbs_versions(org_id,project_id,data_class,revision_no,title,scope_source,source_type,created_by,updated_by)
      values(p_org_id,p_project_id,p_data_class,v_revision,trim(p_title),p_scope_source,p_source_type,p_actor_user_id,p_actor_user_id) returning * into v_result;
    elsif v_current.status in ('draft','rejected','changes_requested') then
      update public.project_wbs_versions set title=trim(p_title),scope_source=p_scope_source,source_type=p_source_type,status='draft',version=version+1,updated_by=p_actor_user_id,updated_at=now()
      where id=v_current.id returning * into v_result;
      delete from public.project_wbs_items where wbs_version_id=v_result.id;
    else raise exception 'STATUS_CONFLICT'; end if;
  else
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_wbs_versions(org_id,project_id,data_class,revision_no,title,scope_source,source_type,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,1,trim(p_title),p_scope_source,p_source_type,p_actor_user_id,p_actor_user_id) returning * into v_result;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.project_wbs_items(org_id,project_id,data_class,wbs_version_id,item_code,parent_item_code,level,name,description,duration_days,predecessors,planned_start,planned_end,planned_value,weight,assignee_user_id,assignee_name,acceptance_criteria)
    values(p_org_id,p_project_id,p_data_class,v_result.id,trim(v_item->>'item_code'),nullif(trim(coalesce(v_item->>'parent_item_code','')),''),coalesce((v_item->>'level')::integer,1),trim(v_item->>'name'),coalesce(v_item->>'description',''),(v_item->>'duration_days')::numeric,coalesce(v_item->'predecessors','[]'::jsonb),nullif(v_item->>'planned_start','')::date,nullif(v_item->>'planned_end','')::date,coalesce((v_item->>'planned_value')::numeric,0),nullif(v_item->>'weight','')::numeric,nullif(v_item->>'assignee_user_id','')::uuid,nullif(trim(coalesce(v_item->>'assignee_name','')),''),coalesce(v_item->>'acceptance_criteria',''));
  end loop;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'wbs_version',v_result.id,'wbs_saved',v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',jsonb_build_object('revision_no',v_result.revision_no,'items',p_items));
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload)
  values(p_org_id,p_project_id,p_data_class,'save_wbs',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.transition_project_wbs_version_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_wbs_version_id uuid,p_operation text,p_comment text
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_current public.project_wbs_versions%rowtype; v_result public.project_wbs_versions%rowtype;
  v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb; v_target text;
begin
  v_request:=jsonb_build_object('wbs_version_id',p_wbs_version_id,'operation',p_operation,'comment',coalesce(p_comment,''),'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'transition_wbs' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select * into v_current from public.project_wbs_versions where id=p_wbs_version_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'WBS_NOT_FOUND'; end if;
  if v_current.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_operation='submit' and v_current.status='draft' and p_business_role in ('pm','operations','pmo','business_owner') then v_target:='submitted';
  elsif p_operation in ('approve','reject','request_changes') and v_current.status='submitted' and p_business_role in ('pmo','sponsor','business_owner') then v_target:=case p_operation when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end;
  elsif p_operation='revise' and v_current.status in ('rejected','changes_requested') and p_business_role in ('pm','operations','pmo','business_owner') then v_target:='draft';
  elsif p_operation='supersede' and v_current.status='approved' and p_business_role in ('pmo','sponsor','business_owner') then v_target:='superseded';
  else raise exception 'STATUS_CONFLICT'; end if;
  if p_operation in ('approve','reject','request_changes') and trim(coalesce(p_comment,''))='' then raise exception 'REVIEW_COMMENT_REQUIRED'; end if;
  update public.project_wbs_versions set status=v_target,version=version+1,submitted_at=case when p_operation='submit' then now() else submitted_at end,approved_at=case when p_operation='approve' then now() else approved_at end,updated_by=p_actor_user_id,updated_at=now() where id=v_current.id returning * into v_result;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'wbs_version',v_result.id,'wbs_'||p_operation,v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',jsonb_build_object('from_status',v_current.status,'to_status',v_target,'comment',p_comment));
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'transition_wbs',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_delivery_actual_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_wbs_item_id uuid,p_actual_start date,p_actual_end date,
  p_percent_complete numeric,p_status text,p_actual_cost numeric,p_evidence jsonb
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_item public.project_wbs_items%rowtype; v_existing public.project_delivery_actuals%rowtype; v_result public.project_delivery_actuals%rowtype;
  v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner','finance') then raise exception 'ROLE_FORBIDDEN'; end if;
  if p_percent_complete<0 or p_percent_complete>100 or p_actual_cost<0 then raise exception 'ACTUAL_INPUT_INVALID'; end if;
  v_request:=jsonb_build_object('wbs_item_id',p_wbs_item_id,'actual_start',p_actual_start,'actual_end',p_actual_end,'percent_complete',p_percent_complete,'status',p_status,'actual_cost',p_actual_cost,'evidence',p_evidence,'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'save_actual' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select * into v_item from public.project_wbs_items where id=p_wbs_item_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class;
  if not found then raise exception 'WBS_ITEM_NOT_FOUND'; end if;
  select * into v_existing from public.project_delivery_actuals where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class and wbs_item_id=p_wbs_item_id for update;
  if found then
    if v_existing.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.project_delivery_actuals set actual_start=p_actual_start,actual_end=p_actual_end,percent_complete=p_percent_complete,status=p_status,actual_cost=p_actual_cost,evidence=p_evidence,version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=v_existing.id returning * into v_result;
  else
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_delivery_actuals(org_id,project_id,data_class,wbs_version_id,wbs_item_id,actual_start,actual_end,percent_complete,status,actual_cost,evidence,updated_by)
    values(p_org_id,p_project_id,p_data_class,v_item.wbs_version_id,p_wbs_item_id,p_actual_start,p_actual_end,p_percent_complete,p_status,p_actual_cost,p_evidence,p_actor_user_id) returning * into v_result;
  end if;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload)
  values(p_org_id,p_project_id,p_data_class,'delivery_actual',v_result.id,'delivery_actual_saved',v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',to_jsonb(v_result));
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'save_actual',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_schedule_snapshot_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_wbs_version_id uuid,p_input_hash text,p_result jsonb
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_wbs public.project_wbs_versions%rowtype; v_result public.project_schedule_snapshots%rowtype; v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb; v_next integer;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  select * into v_wbs from public.project_wbs_versions where id=p_wbs_version_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class;
  if not found then raise exception 'WBS_NOT_FOUND'; end if;
  if v_wbs.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  v_request:=jsonb_build_object('wbs_version_id',p_wbs_version_id,'input_hash',p_input_hash,'result',p_result,'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'save_cpm' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select coalesce(max(calculation_version),0)+1 into v_next from public.project_schedule_snapshots where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class;
  insert into public.project_schedule_snapshots(org_id,project_id,data_class,wbs_version_id,calculation_version,input_hash,project_duration,critical_path,result,source_updated_at,created_by)
  values(p_org_id,p_project_id,p_data_class,p_wbs_version_id,v_next,p_input_hash,coalesce((p_result->>'projectDuration')::numeric,0),coalesce(p_result->'criticalPath','[]'::jsonb),p_result,v_wbs.updated_at,p_actor_user_id)
  on conflict(org_id,project_id,data_class,input_hash) do update set input_hash=excluded.input_hash returning * into v_result;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload) values(p_org_id,p_project_id,p_data_class,'schedule_snapshot',v_result.id,'cpm_calculated',v_result.calculation_version,p_business_role,p_actor_user_id,p_idempotency_key||':event',p_result);
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'save_cpm',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_evm_snapshot_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_wbs_version_id uuid,p_cost_baseline_id uuid,p_as_of_date date,
  p_input_hash text,p_periods jsonb,p_result jsonb
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_wbs public.project_wbs_versions%rowtype; v_baseline public.project_plan_baselines%rowtype; v_result public.project_evm_snapshots%rowtype;
  v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb; v_next integer;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner','finance') then raise exception 'ROLE_FORBIDDEN'; end if;
  select * into v_wbs from public.project_wbs_versions where id=p_wbs_version_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class and status='approved';
  if not found then raise exception 'APPROVED_WBS_REQUIRED'; end if;
  if v_wbs.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  select * into v_baseline from public.project_plan_baselines where id=p_cost_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class and baseline_type='cost' and status='approved';
  if not found or v_baseline.baseline_value is null or v_baseline.baseline_value<=0 then raise exception 'APPROVED_COST_BASELINE_REQUIRED'; end if;
  v_request:=jsonb_build_object('wbs_version_id',p_wbs_version_id,'cost_baseline_id',p_cost_baseline_id,'as_of_date',p_as_of_date,'input_hash',p_input_hash,'periods',p_periods,'result',p_result,'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'save_evm' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select coalesce(max(snapshot_version),0)+1 into v_next from public.project_evm_snapshots where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class;
  insert into public.project_evm_snapshots(org_id,project_id,data_class,wbs_version_id,cost_baseline_id,snapshot_version,as_of_date,input_hash,bac,pv,ev,ac,sv,cv,spi,cpi,eac,etc,vac,periods,result,created_by)
  values(p_org_id,p_project_id,p_data_class,p_wbs_version_id,p_cost_baseline_id,v_next,p_as_of_date,p_input_hash,(p_result->>'bac')::numeric,(p_result->>'pv')::numeric,(p_result->>'ev')::numeric,(p_result->>'ac')::numeric,(p_result->>'sv')::numeric,(p_result->>'cv')::numeric,(p_result->>'spi')::numeric,(p_result->>'cpi')::numeric,(p_result->>'eac')::numeric,(p_result->>'etc')::numeric,(p_result->>'vac')::numeric,p_periods,p_result,p_actor_user_id)
  on conflict(org_id,project_id,data_class,input_hash) do update set input_hash=excluded.input_hash returning * into v_result;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload) values(p_org_id,p_project_id,p_data_class,'evm_snapshot',v_result.id,'evm_calculated',v_result.snapshot_version,p_business_role,p_actor_user_id,p_idempotency_key||':event',p_result);
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'save_evm',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

create or replace function public.save_project_resource_plan_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_title text,p_horizon_start date,p_horizon_end date,p_periods jsonb,p_assignments jsonb
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_plan public.project_resource_plans%rowtype; v_receipt public.project_delivery_operation_receipts%rowtype; v_request jsonb; v_period jsonb; v_assignment jsonb; v_period_row public.project_resource_capacity_periods%rowtype; v_payload jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  if p_horizon_end<p_horizon_start+55 or p_horizon_end>p_horizon_start+83 then raise exception 'RESOURCE_HORIZON_MUST_BE_8_TO_12_WEEKS'; end if;
  if jsonb_typeof(p_periods)<>'array' or jsonb_array_length(p_periods)=0 or jsonb_typeof(p_assignments)<>'array' then raise exception 'RESOURCE_INPUT_INVALID'; end if;
  v_request:=jsonb_build_object('title',p_title,'horizon_start',p_horizon_start,'horizon_end',p_horizon_end,'periods',p_periods,'assignments',p_assignments,'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'save_resource_plan' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select * into v_plan from public.project_resource_plans where org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if found then
    if v_plan.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    if v_plan.status not in ('draft','changes_requested') then raise exception 'STATUS_CONFLICT'; end if;
    update public.project_resource_plans set title=trim(p_title),horizon_start=p_horizon_start,horizon_end=p_horizon_end,status='draft',version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=v_plan.id returning * into v_plan;
    delete from public.project_resource_capacity_periods where resource_plan_id=v_plan.id;
  else
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_resource_plans(org_id,project_id,data_class,title,horizon_start,horizon_end,created_by,updated_by) values(p_org_id,p_project_id,p_data_class,trim(p_title),p_horizon_start,p_horizon_end,p_actor_user_id,p_actor_user_id) returning * into v_plan;
  end if;
  for v_period in select value from jsonb_array_elements(p_periods) loop
    insert into public.project_resource_capacity_periods(org_id,project_id,data_class,resource_plan_id,owner_user_id,owner_name,role_name,period_start,period_end,capacity_hours)
    values(p_org_id,p_project_id,p_data_class,v_plan.id,(v_period->>'owner_user_id')::uuid,trim(v_period->>'owner_name'),trim(v_period->>'role_name'),(v_period->>'period_start')::date,(v_period->>'period_end')::date,(v_period->>'capacity_hours')::numeric) returning * into v_period_row;
    for v_assignment in select value from jsonb_array_elements(p_assignments) where value->>'owner_user_id'=v_period->>'owner_user_id' and value->>'period_start'=v_period->>'period_start' loop
      insert into public.project_resource_assignments(org_id,project_id,data_class,resource_plan_id,capacity_period_id,wbs_item_id,owner_user_id,allocated_hours,allocation_note)
      values(p_org_id,p_project_id,p_data_class,v_plan.id,v_period_row.id,nullif(v_assignment->>'wbs_item_id','')::uuid,(v_assignment->>'owner_user_id')::uuid,(v_assignment->>'allocated_hours')::numeric,coalesce(v_assignment->>'allocation_note',''));
    end loop;
    if (select coalesce(sum((value->>'allocated_hours')::numeric),0) from jsonb_array_elements(p_assignments) where value->>'owner_user_id'=v_period->>'owner_user_id' and value->>'period_start'=v_period->>'period_start') > (v_period->>'capacity_hours')::numeric then
      insert into public.project_resource_conflict_actions(org_id,project_id,data_class,resource_plan_id,capacity_period_id,owner_user_id,overload_hours,action_title,due_at,created_by,updated_by)
      values(p_org_id,p_project_id,p_data_class,v_plan.id,v_period_row.id,(v_period->>'owner_user_id')::uuid,(select sum((value->>'allocated_hours')::numeric) from jsonb_array_elements(p_assignments) where value->>'owner_user_id'=v_period->>'owner_user_id' and value->>'period_start'=v_period->>'period_start')-(v_period->>'capacity_hours')::numeric,'解决'||trim(v_period->>'owner_name')||'资源超配',((v_period->>'period_start')::date+3)::timestamptz,p_actor_user_id,p_actor_user_id);
    end if;
  end loop;
  v_payload:=jsonb_build_object('plan',to_jsonb(v_plan),'conflicts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.project_resource_conflict_actions c where c.resource_plan_id=v_plan.id));
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload) values(p_org_id,p_project_id,p_data_class,'resource_plan',v_plan.id,'resource_plan_saved',v_plan.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',v_payload);
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'save_resource_plan',p_idempotency_key,v_request,v_payload);
  return v_payload;
end;
$$;

create or replace function public.transition_project_resource_conflict_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,
  p_idempotency_key text,p_expected_version integer,p_conflict_id uuid,p_operation text,p_comment text,p_evidence jsonb
) returns jsonb language plpgsql set search_path = public,pg_temp as $$
declare v_current public.project_resource_conflict_actions%rowtype; v_result public.project_resource_conflict_actions%rowtype; v_target text; v_request jsonb; v_receipt public.project_delivery_operation_receipts%rowtype;
begin
  v_request:=jsonb_build_object('conflict_id',p_conflict_id,'operation',p_operation,'comment',coalesce(p_comment,''),'evidence',p_evidence,'expected_version',p_expected_version);
  select * into v_receipt from public.project_delivery_operation_receipts where org_id=p_org_id and data_class=p_data_class and idempotency_key=p_idempotency_key;
  if found then if v_receipt.operation<>'transition_resource_conflict' or v_receipt.request_payload<>v_request then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if; return v_receipt.response_payload; end if;
  select * into v_current from public.project_resource_conflict_actions where id=p_conflict_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'RESOURCE_CONFLICT_NOT_FOUND'; end if;
  if v_current.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
  if p_operation='accept' and v_current.status='assigned' and (v_current.owner_user_id=p_actor_user_id or p_business_role='pmo') then v_target:='accepted';
  elsif p_operation='start' and v_current.status in ('assigned','accepted','reopened') and (v_current.owner_user_id=p_actor_user_id or p_business_role='pmo') then v_target:='in_progress';
  elsif p_operation='submit_evidence' and v_current.status='in_progress' and v_current.owner_user_id=p_actor_user_id and jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))>0 then v_target:='evidence_submitted';
  elsif p_operation='verify' and v_current.status='evidence_submitted' and p_business_role='pmo' and trim(coalesce(p_comment,''))<>'' then v_target:='verified';
  elsif p_operation='close' and v_current.status='verified' and p_business_role='pmo' then v_target:='closed';
  elsif p_operation='reopen' and v_current.status in ('verified','closed') and p_business_role='pmo' and trim(coalesce(p_comment,''))<>'' then v_target:='reopened';
  else raise exception 'STATUS_CONFLICT'; end if;
  update public.project_resource_conflict_actions set status=v_target,action_plan=case when p_operation in ('accept','start') and trim(coalesce(p_comment,''))<>'' then p_comment else action_plan end,resolution_evidence=case when p_operation='submit_evidence' then p_evidence else resolution_evidence end,review_comment=case when p_operation in ('verify','reopen','close') then p_comment else review_comment end,version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=v_current.id returning * into v_result;
  insert into public.project_delivery_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,idempotency_key,payload) values(p_org_id,p_project_id,p_data_class,'resource_conflict',v_result.id,'resource_conflict_'||p_operation,v_result.version,p_business_role,p_actor_user_id,p_idempotency_key||':event',jsonb_build_object('from_status',v_current.status,'to_status',v_target,'comment',p_comment,'evidence',p_evidence));
  insert into public.project_delivery_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_payload,response_payload) values(p_org_id,p_project_id,p_data_class,'transition_resource_conflict',p_idempotency_key,v_request,to_jsonb(v_result));
  return to_jsonb(v_result);
end;
$$;

alter table public.project_wbs_versions enable row level security;
alter table public.project_wbs_items enable row level security;
alter table public.project_delivery_actuals enable row level security;
alter table public.project_schedule_snapshots enable row level security;
alter table public.project_evm_snapshots enable row level security;
alter table public.project_resource_plans enable row level security;
alter table public.project_resource_capacity_periods enable row level security;
alter table public.project_resource_assignments enable row level security;
alter table public.project_resource_conflict_actions enable row level security;
alter table public.project_delivery_operation_receipts enable row level security;
alter table public.project_delivery_events enable row level security;

revoke all on table public.project_wbs_versions,public.project_wbs_items,public.project_delivery_actuals,public.project_schedule_snapshots,public.project_evm_snapshots,public.project_resource_plans,public.project_resource_capacity_periods,public.project_resource_assignments,public.project_resource_conflict_actions,public.project_delivery_operation_receipts,public.project_delivery_events from public, anon, authenticated;
grant select,insert,update,delete on table public.project_wbs_versions,public.project_wbs_items,public.project_delivery_actuals,public.project_resource_plans,public.project_resource_capacity_periods,public.project_resource_assignments,public.project_resource_conflict_actions to service_role;
grant select,insert on table public.project_schedule_snapshots,public.project_evm_snapshots,public.project_delivery_operation_receipts,public.project_delivery_events to service_role;
grant usage,select on sequence public.project_delivery_events_id_seq to service_role;

revoke all on function public.enforce_v631_delivery_scope() from public,anon,authenticated;
revoke all on function public.prevent_v631_delivery_event_mutation() from public,anon,authenticated;
revoke all on function public.save_project_wbs_version_tx(uuid,uuid,text,text,uuid,text,integer,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.transition_project_wbs_version_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) from public,anon,authenticated;
revoke all on function public.save_project_delivery_actual_tx(uuid,uuid,text,text,uuid,text,integer,uuid,date,date,numeric,text,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.save_project_schedule_snapshot_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.save_project_evm_snapshot_tx(uuid,uuid,text,text,uuid,text,integer,uuid,uuid,date,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.save_project_resource_plan_tx(uuid,uuid,text,text,uuid,text,integer,text,date,date,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.transition_project_resource_conflict_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.enforce_v631_delivery_scope() to service_role;
grant execute on function public.prevent_v631_delivery_event_mutation() to service_role;
grant execute on function public.save_project_wbs_version_tx(uuid,uuid,text,text,uuid,text,integer,text,jsonb,jsonb,text) to service_role;
grant execute on function public.transition_project_wbs_version_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text) to service_role;
grant execute on function public.save_project_delivery_actual_tx(uuid,uuid,text,text,uuid,text,integer,uuid,date,date,numeric,text,numeric,jsonb) to service_role;
grant execute on function public.save_project_schedule_snapshot_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,jsonb) to service_role;
grant execute on function public.save_project_evm_snapshot_tx(uuid,uuid,text,text,uuid,text,integer,uuid,uuid,date,text,jsonb,jsonb) to service_role;
grant execute on function public.save_project_resource_plan_tx(uuid,uuid,text,text,uuid,text,integer,text,date,date,jsonb,jsonb) to service_role;
grant execute on function public.transition_project_resource_conflict_tx(uuid,uuid,text,text,uuid,text,integer,uuid,text,text,jsonb) to service_role;

notify pgrst, 'reload schema';
