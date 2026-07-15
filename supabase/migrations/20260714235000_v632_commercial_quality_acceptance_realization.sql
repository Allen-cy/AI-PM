begin;

create table if not exists public.project_contract_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  contract_code text not null,
  name text not null,
  customer_name text,
  supplier_name text,
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  currency text not null default 'CNY',
  signed_date date,
  effective_date date,
  expiry_date date,
  payment_terms text,
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','active','suspended','closed','terminated')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  source_updated_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, contract_code)
);

create table if not exists public.project_receivable_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  contract_record_id uuid not null references public.project_contract_records(id) on delete cascade,
  receivable_code text not null,
  title text not null,
  amount numeric(18,2) not null check (amount >= 0),
  due_date date,
  trigger_type text,
  trigger_reference text,
  invoice_no text,
  invoice_amount numeric(18,2) not null default 0 check (invoice_amount >= 0),
  invoice_date date,
  status text not null default 'planned' check (status in ('planned','due','invoiced','partially_collected','collected','overdue','waived')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  source_updated_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, receivable_code)
);

create table if not exists public.project_collection_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  receivable_record_id uuid not null references public.project_receivable_records(id) on delete cascade,
  collection_code text not null,
  amount numeric(18,2) not null check (amount > 0),
  collected_date date not null,
  payment_reference text,
  writeoff_amount numeric(18,2) not null default 0 check (writeoff_amount >= 0),
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'confirmed' check (status in ('confirmed','reversed')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, collection_code)
);

create table if not exists public.project_stakeholder_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  stakeholder_code text not null,
  name text not null,
  role_title text,
  organization_name text,
  power integer not null default 3 check (power between 1 and 5),
  interest integer not null default 3 check (interest between 1 and 5),
  current_engagement text not null default '中立' check (current_engagement in ('不知情','抵制','中立','支持','领导')),
  desired_engagement text not null default '支持' check (desired_engagement in ('不知情','抵制','中立','支持','领导')),
  communication_frequency text,
  communication_method text,
  management_strategy text,
  contact_preference text,
  status text not null default 'active' check (status in ('active','inactive')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, stakeholder_code)
);

create table if not exists public.project_stakeholder_engagement_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  stakeholder_record_id uuid not null references public.project_stakeholder_records(id) on delete cascade,
  action_type text not null,
  subject text not null,
  planned_at timestamptz,
  due_at timestamptz,
  owner_user_id uuid references public.app_users(id) on delete set null,
  owner_name text,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled','overdue')),
  outcome text,
  feedback text,
  evidence jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_quality_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  title text not null,
  phase text not null,
  standards jsonb not null default '[]'::jsonb,
  acceptance_strategy text,
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','approved','superseded')),
  revision_no integer not null default 1 check (revision_no > 0),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_quality_check_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  quality_plan_id uuid not null references public.project_quality_plans(id) on delete cascade,
  item_code text not null,
  category text,
  item_text text not null,
  required boolean not null default true,
  owner_user_id uuid references public.app_users(id) on delete set null,
  owner_name text,
  due_date date,
  result text not null default 'pending' check (result in ('pending','passed','failed','waived')),
  checked_by uuid references public.app_users(id) on delete set null,
  checked_at timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quality_plan_id, item_code)
);

create table if not exists public.project_defect_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  defect_code text not null,
  title text not null,
  description text not null,
  severity text not null check (severity in ('critical','major','minor','cosmetic')),
  owner_user_id uuid references public.app_users(id) on delete set null,
  owner_name text,
  due_at timestamptz,
  root_cause text,
  corrective_action text,
  verification_result text,
  status text not null default 'open' check (status in ('open','in_progress','ready_for_verification','closed','rejected')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, defect_code)
);

create table if not exists public.project_acceptance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  acceptance_code text not null,
  title text not null,
  scope text not null,
  planned_date date,
  submitted_at timestamptz,
  decision text,
  decision_comment text,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','changes_requested','approved','rejected','closed')),
  version bigint not null default 1 check (version > 0),
  source_type text not null default 'human_input',
  source_record_id text,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, data_class, acceptance_code)
);

create table if not exists public.project_acceptance_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  acceptance_record_id uuid not null references public.project_acceptance_records(id) on delete cascade,
  item_code text not null,
  description text not null,
  target text not null,
  actual text,
  result text not null default 'pending' check (result in ('pending','passed','failed','waived')),
  evidence jsonb not null default '[]'::jsonb,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (acceptance_record_id, item_code)
);

create table if not exists public.project_signoff_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  acceptance_record_id uuid not null references public.project_acceptance_records(id) on delete cascade,
  signoff_role text not null,
  signer_user_id uuid references public.app_users(id) on delete set null,
  signer_name text,
  decision text not null default 'pending' check (decision in ('pending','signed','rejected')),
  comments text,
  signed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (acceptance_record_id, signoff_role)
);

create table if not exists public.project_commercial_quality_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  idempotency_key text not null,
  operation_type text not null,
  payload_hash text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  result jsonb,
  actor_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id, idempotency_key)
);

create table if not exists public.project_commercial_quality_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  aggregate_version bigint not null,
  business_role text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_v632_business_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org_id uuid; v_data_class text;
begin
  select org_id, data_class into v_org_id, v_data_class from public.projects where id = new.project_id;
  if v_org_id is null then raise exception 'PROJECT_NOT_FOUND'; end if;
  if new.org_id <> v_org_id then raise exception 'ORG_SCOPE_MISMATCH'; end if;
  if new.data_class <> v_data_class then raise exception 'DATA_CLASS_MISMATCH'; end if;
  return new;
end $$;

create or replace function public.prevent_v632_event_mutation()
returns trigger language plpgsql as $$
begin raise exception 'APPEND_ONLY_EVENT'; end $$;

create or replace function public.begin_v632_operation(
  p_org_id uuid, p_project_id uuid, p_data_class text, p_idempotency_key text,
  p_operation_type text, p_payload jsonb, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_receipt public.project_commercial_quality_operation_receipts%rowtype; v_hash text := md5(coalesce(p_payload,'{}'::jsonb)::text);
begin
  select * into v_receipt from public.project_commercial_quality_operation_receipts
   where org_id=p_org_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_receipt.payload_hash <> v_hash then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    if v_receipt.status='succeeded' then return jsonb_build_object('replayed',true,'result',v_receipt.result); end if;
    raise exception 'IDEMPOTENCY_OPERATION_IN_PROGRESS';
  end if;
  insert into public.project_commercial_quality_operation_receipts(org_id,project_id,data_class,idempotency_key,operation_type,payload_hash,actor_user_id)
  values(p_org_id,p_project_id,p_data_class,p_idempotency_key,p_operation_type,v_hash,p_actor_user_id);
  return null;
end $$;

create or replace function public.finish_v632_operation(p_org_id uuid, p_idempotency_key text, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.project_commercial_quality_operation_receipts set status='succeeded',result=p_result,completed_at=now()
   where org_id=p_org_id and idempotency_key=p_idempotency_key;
  return p_result;
end $$;

create or replace function public.save_project_commercial_record_tx(
  p_org_id uuid, p_project_id uuid, p_data_class text, p_business_role text, p_actor_user_id uuid,
  p_idempotency_key text, p_expected_version bigint, p_record_type text, p_record_id uuid, p_payload jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_replay jsonb; v_id uuid; v_version bigint; v_status text; v_result jsonb; v_total_collected numeric;
begin
  if p_business_role not in ('pm','operations','finance','business_owner','pmo') then raise exception 'ROLE_FORBIDDEN'; end if;
  v_replay := public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_'||p_record_type,p_payload,p_actor_user_id);
  if v_replay is not null then return v_replay->'result'; end if;
  if p_record_type='contract' then
    if p_record_id is null then
      if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
      insert into public.project_contract_records(org_id,project_id,data_class,contract_code,name,customer_name,supplier_name,total_amount,currency,signed_date,effective_date,expiry_date,payment_terms,source_type,source_record_id,source_updated_at,created_by,updated_by)
      values(p_org_id,p_project_id,p_data_class,p_payload->>'contract_code',p_payload->>'name',nullif(p_payload->>'customer_name',''),nullif(p_payload->>'supplier_name',''),coalesce((p_payload->>'total_amount')::numeric,0),coalesce(nullif(p_payload->>'currency',''),'CNY'),nullif(p_payload->>'signed_date','')::date,nullif(p_payload->>'effective_date','')::date,nullif(p_payload->>'expiry_date','')::date,nullif(p_payload->>'payment_terms',''),coalesce(nullif(p_payload->>'source_type',''),'human_input'),nullif(p_payload->>'source_record_id',''),nullif(p_payload->>'source_updated_at','')::timestamptz,p_actor_user_id,p_actor_user_id)
      returning id,version,status into v_id,v_version,v_status;
    else
      select version,status into v_version,v_status from public.project_contract_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
      if not found then raise exception 'CONTRACT_NOT_FOUND'; end if;
      if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
      if v_status not in ('draft','changes_requested') then raise exception 'STATUS_CONFLICT'; end if;
      update public.project_contract_records set contract_code=p_payload->>'contract_code',name=p_payload->>'name',customer_name=nullif(p_payload->>'customer_name',''),supplier_name=nullif(p_payload->>'supplier_name',''),total_amount=coalesce((p_payload->>'total_amount')::numeric,0),currency=coalesce(nullif(p_payload->>'currency',''),'CNY'),signed_date=nullif(p_payload->>'signed_date','')::date,effective_date=nullif(p_payload->>'effective_date','')::date,expiry_date=nullif(p_payload->>'expiry_date','')::date,payment_terms=nullif(p_payload->>'payment_terms',''),version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_record_id returning id,version,status into v_id,v_version,v_status;
    end if;
  elsif p_record_type='receivable' then
    if p_record_id is null then
      if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
      insert into public.project_receivable_records(org_id,project_id,data_class,contract_record_id,receivable_code,title,amount,due_date,trigger_type,trigger_reference,invoice_no,invoice_amount,invoice_date,status,source_type,source_record_id,source_updated_at,created_by,updated_by)
      values(p_org_id,p_project_id,p_data_class,(p_payload->>'contract_record_id')::uuid,p_payload->>'receivable_code',p_payload->>'title',(p_payload->>'amount')::numeric,nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'trigger_type',''),nullif(p_payload->>'trigger_reference',''),nullif(p_payload->>'invoice_no',''),coalesce((p_payload->>'invoice_amount')::numeric,0),nullif(p_payload->>'invoice_date','')::date,coalesce(nullif(p_payload->>'status',''),'planned'),coalesce(nullif(p_payload->>'source_type',''),'human_input'),nullif(p_payload->>'source_record_id',''),nullif(p_payload->>'source_updated_at','')::timestamptz,p_actor_user_id,p_actor_user_id)
      returning id,version,status into v_id,v_version,v_status;
    else
      select version,status into v_version,v_status from public.project_receivable_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
      if not found then raise exception 'RECEIVABLE_NOT_FOUND'; end if;
      if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
      update public.project_receivable_records set title=p_payload->>'title',amount=(p_payload->>'amount')::numeric,due_date=nullif(p_payload->>'due_date','')::date,trigger_type=nullif(p_payload->>'trigger_type',''),trigger_reference=nullif(p_payload->>'trigger_reference',''),invoice_no=nullif(p_payload->>'invoice_no',''),invoice_amount=coalesce((p_payload->>'invoice_amount')::numeric,0),invoice_date=nullif(p_payload->>'invoice_date','')::date,status=coalesce(nullif(p_payload->>'status',''),status),version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_record_id returning id,version,status into v_id,v_version,v_status;
    end if;
  elsif p_record_type='collection' then
    if p_record_id is not null or p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_collection_records(org_id,project_id,data_class,receivable_record_id,collection_code,amount,collected_date,payment_reference,writeoff_amount,evidence,source_type,source_record_id,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,(p_payload->>'receivable_record_id')::uuid,p_payload->>'collection_code',(p_payload->>'amount')::numeric,(p_payload->>'collected_date')::date,nullif(p_payload->>'payment_reference',''),coalesce((p_payload->>'writeoff_amount')::numeric,0),coalesce(p_payload->'evidence','[]'::jsonb),coalesce(nullif(p_payload->>'source_type',''),'human_input'),nullif(p_payload->>'source_record_id',''),p_actor_user_id,p_actor_user_id)
    returning id,version,status into v_id,v_version,v_status;
    select coalesce(sum(amount+writeoff_amount),0) into v_total_collected from public.project_collection_records where receivable_record_id=(p_payload->>'receivable_record_id')::uuid and status='confirmed';
    update public.project_receivable_records set status=case when v_total_collected>=amount then 'collected' when v_total_collected>0 then 'partially_collected' else status end,version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=(p_payload->>'receivable_record_id')::uuid;
  else raise exception 'RECORD_TYPE_INVALID'; end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)
  values(p_org_id,p_project_id,p_data_class,p_record_type,v_id,p_record_type||'_saved',v_version,p_business_role,p_actor_user_id,p_payload);
  v_result:=jsonb_build_object('id',v_id,'record_type',p_record_type,'status',v_status,'version',v_version,'updated_at',now());
  return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_stakeholder_record_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_record_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_replay jsonb; v_id uuid; v_version bigint; v_result jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_stakeholder',p_payload,p_actor_user_id); if v_replay is not null then return v_replay->'result'; end if;
  if p_record_id is null then
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_stakeholder_records(org_id,project_id,data_class,stakeholder_code,name,role_title,organization_name,power,interest,current_engagement,desired_engagement,communication_frequency,communication_method,management_strategy,contact_preference,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,p_payload->>'stakeholder_code',p_payload->>'name',nullif(p_payload->>'role_title',''),nullif(p_payload->>'organization_name',''),coalesce((p_payload->>'power')::integer,3),coalesce((p_payload->>'interest')::integer,3),coalesce(nullif(p_payload->>'current_engagement',''),'中立'),coalesce(nullif(p_payload->>'desired_engagement',''),'支持'),nullif(p_payload->>'communication_frequency',''),nullif(p_payload->>'communication_method',''),nullif(p_payload->>'management_strategy',''),nullif(p_payload->>'contact_preference',''),p_actor_user_id,p_actor_user_id) returning id,version into v_id,v_version;
  else
    select version into v_version from public.project_stakeholder_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update; if not found then raise exception 'STAKEHOLDER_NOT_FOUND'; end if; if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.project_stakeholder_records set name=p_payload->>'name',role_title=nullif(p_payload->>'role_title',''),organization_name=nullif(p_payload->>'organization_name',''),power=(p_payload->>'power')::integer,interest=(p_payload->>'interest')::integer,current_engagement=p_payload->>'current_engagement',desired_engagement=p_payload->>'desired_engagement',communication_frequency=nullif(p_payload->>'communication_frequency',''),communication_method=nullif(p_payload->>'communication_method',''),management_strategy=nullif(p_payload->>'management_strategy',''),contact_preference=nullif(p_payload->>'contact_preference',''),version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_record_id returning id,version into v_id,v_version;
  end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload) values(p_org_id,p_project_id,p_data_class,'stakeholder',v_id,'stakeholder_saved',v_version,p_business_role,p_actor_user_id,p_payload);
  v_result:=jsonb_build_object('id',v_id,'status','active','version',v_version,'updated_at',now()); return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_stakeholder_action_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_record_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_replay jsonb; v_id uuid; v_version bigint; v_status text; v_result jsonb;
begin
  if p_business_role not in ('pm','operations','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN'; end if;
  v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_stakeholder_action',p_payload,p_actor_user_id); if v_replay is not null then return v_replay->'result'; end if;
  if p_record_id is null then if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_stakeholder_engagement_actions(org_id,project_id,data_class,stakeholder_record_id,action_type,subject,planned_at,due_at,owner_user_id,owner_name,status,outcome,feedback,evidence,created_by,updated_by)
    values(p_org_id,p_project_id,p_data_class,(p_payload->>'stakeholder_record_id')::uuid,p_payload->>'action_type',p_payload->>'subject',nullif(p_payload->>'planned_at','')::timestamptz,nullif(p_payload->>'due_at','')::timestamptz,nullif(p_payload->>'owner_user_id','')::uuid,nullif(p_payload->>'owner_name',''),coalesce(nullif(p_payload->>'status',''),'planned'),nullif(p_payload->>'outcome',''),nullif(p_payload->>'feedback',''),coalesce(p_payload->'evidence','[]'::jsonb),p_actor_user_id,p_actor_user_id) returning id,version,status into v_id,v_version,v_status;
  else select version into v_version from public.project_stakeholder_engagement_actions where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update; if not found then raise exception 'STAKEHOLDER_ACTION_NOT_FOUND'; end if; if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.project_stakeholder_engagement_actions set action_type=p_payload->>'action_type',subject=p_payload->>'subject',planned_at=nullif(p_payload->>'planned_at','')::timestamptz,due_at=nullif(p_payload->>'due_at','')::timestamptz,owner_user_id=nullif(p_payload->>'owner_user_id','')::uuid,owner_name=nullif(p_payload->>'owner_name',''),status=coalesce(nullif(p_payload->>'status',''),status),outcome=nullif(p_payload->>'outcome',''),feedback=nullif(p_payload->>'feedback',''),evidence=coalesce(p_payload->'evidence',evidence),version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_record_id returning id,version,status into v_id,v_version,v_status; end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload) values(p_org_id,p_project_id,p_data_class,'stakeholder_action',v_id,'stakeholder_action_saved',v_version,p_business_role,p_actor_user_id,p_payload);
  v_result:=jsonb_build_object('id',v_id,'status',v_status,'version',v_version,'updated_at',now()); return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_quality_plan_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_plan_id uuid,p_title text,p_phase text,p_standards jsonb,p_acceptance_strategy text,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payload jsonb:=jsonb_build_object('title',p_title,'phase',p_phase,'standards',p_standards,'acceptance_strategy',p_acceptance_strategy,'items',p_items); v_replay jsonb; v_id uuid; v_version bigint; v_status text; v_result jsonb;
begin
  if p_business_role not in ('pm','quality','pmo') then raise exception 'ROLE_FORBIDDEN'; end if;
  v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_quality_plan',v_payload,p_actor_user_id); if v_replay is not null then return v_replay->'result'; end if;
  if p_plan_id is null then if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if; insert into public.project_quality_plans(org_id,project_id,data_class,title,phase,standards,acceptance_strategy,created_by,updated_by) values(p_org_id,p_project_id,p_data_class,p_title,p_phase,coalesce(p_standards,'[]'::jsonb),p_acceptance_strategy,p_actor_user_id,p_actor_user_id) returning id,version,status into v_id,v_version,v_status;
  else select version,status into v_version,v_status from public.project_quality_plans where id=p_plan_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update; if not found then raise exception 'QUALITY_PLAN_NOT_FOUND'; end if; if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if; if v_status not in ('draft','changes_requested') then raise exception 'STATUS_CONFLICT'; end if; update public.project_quality_plans set title=p_title,phase=p_phase,standards=coalesce(p_standards,'[]'::jsonb),acceptance_strategy=p_acceptance_strategy,version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_plan_id returning id,version,status into v_id,v_version,v_status; delete from public.project_quality_check_items where quality_plan_id=v_id; end if;
  insert into public.project_quality_check_items(org_id,project_id,data_class,quality_plan_id,item_code,category,item_text,required,owner_user_id,owner_name,due_date,result,evidence)
  select p_org_id,p_project_id,p_data_class,v_id,item->>'item_code',nullif(item->>'category',''),item->>'item_text',coalesce((item->>'required')::boolean,true),nullif(item->>'owner_user_id','')::uuid,nullif(item->>'owner_name',''),nullif(item->>'due_date','')::date,coalesce(nullif(item->>'result',''),'pending'),coalesce(item->'evidence','[]'::jsonb) from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) item;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload) values(p_org_id,p_project_id,p_data_class,'quality_plan',v_id,'quality_plan_saved',v_version,p_business_role,p_actor_user_id,v_payload);
  v_result:=jsonb_build_object('id',v_id,'status',v_status,'version',v_version,'updated_at',now()); return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_quality_check_result_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_item_id uuid,p_result text,p_evidence jsonb,p_comment text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payload jsonb:=jsonb_build_object('item_id',p_item_id,'result',p_result,'evidence',p_evidence,'comment',p_comment);v_replay jsonb;v_version bigint;v_plan_status text;v_result jsonb;
begin
  if p_business_role not in ('pm','quality','pmo','business_owner') then raise exception 'ROLE_FORBIDDEN';end if;
  if p_result not in ('pending','passed','failed','waived') then raise exception 'RESULT_INVALID';end if;
  v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_quality_check_result',v_payload,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  select item.version,plan.status into v_version,v_plan_status from public.project_quality_check_items item join public.project_quality_plans plan on plan.id=item.quality_plan_id where item.id=p_item_id and item.org_id=p_org_id and item.project_id=p_project_id and item.data_class=p_data_class for update of item;
  if not found then raise exception 'QUALITY_CHECK_ITEM_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;if v_plan_status not in ('submitted','approved') then raise exception 'STATUS_CONFLICT';end if;
  update public.project_quality_check_items set result=p_result,evidence=coalesce(p_evidence,'[]'::jsonb),checked_by=p_actor_user_id,checked_at=now(),version=version+1,updated_at=now()where id=p_item_id returning version into v_version;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,'quality_check',p_item_id,'quality_check_'||p_result,v_version,p_business_role,p_actor_user_id,v_payload);
  v_result:=jsonb_build_object('id',p_item_id,'status',p_result,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_defect_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_defect_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_replay jsonb;v_id uuid;v_version bigint;v_status text;v_result jsonb;
begin if p_business_role not in ('pm','operations','quality','pmo') then raise exception 'ROLE_FORBIDDEN'; end if; v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_defect',p_payload,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  if p_defect_id is null then if p_expected_version<>0 then raise exception 'VERSION_CONFLICT';end if; insert into public.project_defect_records(org_id,project_id,data_class,defect_code,title,description,severity,owner_user_id,owner_name,due_at,root_cause,corrective_action,verification_result,source_type,source_record_id,created_by,updated_by) values(p_org_id,p_project_id,p_data_class,p_payload->>'defect_code',p_payload->>'title',p_payload->>'description',p_payload->>'severity',nullif(p_payload->>'owner_user_id','')::uuid,nullif(p_payload->>'owner_name',''),nullif(p_payload->>'due_at','')::timestamptz,nullif(p_payload->>'root_cause',''),nullif(p_payload->>'corrective_action',''),nullif(p_payload->>'verification_result',''),coalesce(nullif(p_payload->>'source_type',''),'human_input'),nullif(p_payload->>'source_record_id',''),p_actor_user_id,p_actor_user_id) returning id,version,status into v_id,v_version,v_status;
  else select version,status into v_version,v_status from public.project_defect_records where id=p_defect_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;if not found then raise exception 'DEFECT_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;if v_status in ('closed','rejected') then raise exception 'STATUS_CONFLICT';end if; update public.project_defect_records set title=p_payload->>'title',description=p_payload->>'description',severity=p_payload->>'severity',owner_user_id=nullif(p_payload->>'owner_user_id','')::uuid,owner_name=nullif(p_payload->>'owner_name',''),due_at=nullif(p_payload->>'due_at','')::timestamptz,root_cause=nullif(p_payload->>'root_cause',''),corrective_action=nullif(p_payload->>'corrective_action',''),verification_result=nullif(p_payload->>'verification_result',''),version=version+1,updated_by=p_actor_user_id,updated_at=now() where id=p_defect_id returning id,version,status into v_id,v_version,v_status;end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,'defect',v_id,'defect_saved',v_version,p_business_role,p_actor_user_id,p_payload);v_result:=jsonb_build_object('id',v_id,'status',v_status,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);end $$;

create or replace function public.save_project_acceptance_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_acceptance_id uuid,p_payload jsonb,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_full jsonb:=p_payload||jsonb_build_object('items',p_items);v_replay jsonb;v_id uuid;v_version bigint;v_status text;v_result jsonb;
begin if p_business_role not in ('pm','operations','quality','business_owner','sponsor') then raise exception 'ROLE_FORBIDDEN';end if;v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_acceptance',v_full,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  if p_acceptance_id is null then if p_expected_version<>0 then raise exception 'VERSION_CONFLICT';end if;insert into public.project_acceptance_records(org_id,project_id,data_class,acceptance_code,title,scope,planned_date,source_type,source_record_id,created_by,updated_by)values(p_org_id,p_project_id,p_data_class,p_payload->>'acceptance_code',p_payload->>'title',p_payload->>'scope',nullif(p_payload->>'planned_date','')::date,coalesce(nullif(p_payload->>'source_type',''),'human_input'),nullif(p_payload->>'source_record_id',''),p_actor_user_id,p_actor_user_id)returning id,version,status into v_id,v_version,v_status;
  else select version,status into v_version,v_status from public.project_acceptance_records where id=p_acceptance_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;if not found then raise exception 'ACCEPTANCE_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;if v_status not in ('draft','changes_requested') then raise exception 'STATUS_CONFLICT';end if;update public.project_acceptance_records set title=p_payload->>'title',scope=p_payload->>'scope',planned_date=nullif(p_payload->>'planned_date','')::date,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_acceptance_id returning id,version,status into v_id,v_version,v_status;delete from public.project_acceptance_items where acceptance_record_id=v_id;end if;
  insert into public.project_acceptance_items(org_id,project_id,data_class,acceptance_record_id,item_code,description,target,actual,result,evidence)select p_org_id,p_project_id,p_data_class,v_id,item->>'item_code',item->>'description',item->>'target',nullif(item->>'actual',''),coalesce(nullif(item->>'result',''),'pending'),coalesce(item->'evidence','[]'::jsonb)from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))item;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,'acceptance',v_id,'acceptance_saved',v_version,p_business_role,p_actor_user_id,v_full);v_result:=jsonb_build_object('id',v_id,'status',v_status,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);end $$;

create or replace function public.save_project_signoff_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_signoff_id uuid,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_replay jsonb;v_id uuid;v_version bigint;v_decision text;v_result jsonb;
begin if p_business_role not in ('quality','business_owner','sponsor','pmo') then raise exception 'ROLE_FORBIDDEN';end if;v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_signoff',p_payload,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  if p_signoff_id is null then if p_expected_version<>0 then raise exception 'VERSION_CONFLICT';end if;insert into public.project_signoff_records(org_id,project_id,data_class,acceptance_record_id,signoff_role,signer_user_id,signer_name,decision,comments,signed_at,created_by,updated_by)values(p_org_id,p_project_id,p_data_class,(p_payload->>'acceptance_record_id')::uuid,p_payload->>'signoff_role',p_actor_user_id,nullif(p_payload->>'signer_name',''),coalesce(nullif(p_payload->>'decision',''),'pending'),nullif(p_payload->>'comments',''),case when p_payload->>'decision' in ('signed','rejected') then now() else null end,p_actor_user_id,p_actor_user_id)returning id,version,decision into v_id,v_version,v_decision;
  else select version into v_version from public.project_signoff_records where id=p_signoff_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;if not found then raise exception 'SIGNOFF_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;update public.project_signoff_records set signer_user_id=p_actor_user_id,signer_name=nullif(p_payload->>'signer_name',''),decision=p_payload->>'decision',comments=nullif(p_payload->>'comments',''),signed_at=case when p_payload->>'decision' in ('signed','rejected') then now() else null end,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_signoff_id returning id,version,decision into v_id,v_version,v_decision;end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,'signoff',v_id,'signoff_'||v_decision,v_version,p_business_role,p_actor_user_id,p_payload);v_result:=jsonb_build_object('id',v_id,'status',v_decision,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);end $$;

create or replace function public.transition_project_commercial_quality_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_record_type text,p_record_id uuid,p_operation text,p_comment text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payload jsonb:=jsonb_build_object('record_type',p_record_type,'record_id',p_record_id,'operation',p_operation,'comment',p_comment);v_replay jsonb;v_status text;v_next text;v_version bigint;v_result jsonb;
begin v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'transition_'||p_record_type,v_payload,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  if p_record_type='contract' then select status,version into v_status,v_version from public.project_contract_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  elsif p_record_type='quality_plan' then select status,version into v_status,v_version from public.project_quality_plans where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  elsif p_record_type='defect' then select status,version into v_status,v_version from public.project_defect_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  elsif p_record_type='acceptance' then select status,version into v_status,v_version from public.project_acceptance_records where id=p_record_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;else raise exception 'RECORD_TYPE_INVALID';end if;
  if not found then raise exception 'RECORD_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;
  if p_record_type='contract' then
    if v_status='draft' and p_operation='submit' and p_business_role in ('pm','operations') then v_next:='submitted';
    elsif v_status='submitted' and p_operation='activate' and p_business_role in ('finance','business_owner','sponsor') then v_next:='active';
    elsif v_status='submitted' and p_operation='request_changes' and p_business_role in ('finance','business_owner','sponsor','pmo') then v_next:='changes_requested';
    elsif v_status='changes_requested' and p_operation='revise' and p_business_role in ('pm','operations') then v_next:='draft';
    elsif v_status='active' and p_operation='close' and p_business_role in ('finance','business_owner','pmo') then v_next:='closed';else raise exception 'ROLE_FORBIDDEN_OR_STATUS_CONFLICT';end if;
  elsif p_record_type='quality_plan' then
    if v_status='draft' and p_operation='submit' and p_business_role in ('pm','quality') then v_next:='submitted';elsif v_status='submitted' and p_operation='approve' and p_business_role in ('quality','pmo','business_owner') then v_next:='approved';elsif v_status='submitted' and p_operation='request_changes' and p_business_role in ('quality','pmo','business_owner') then v_next:='changes_requested';elsif v_status='changes_requested' and p_operation='revise' and p_business_role in ('pm','quality') then v_next:='draft';elsif v_status='approved' and p_operation='supersede' and p_business_role in ('quality','pmo') then v_next:='superseded';else raise exception 'ROLE_FORBIDDEN_OR_STATUS_CONFLICT';end if;
  elsif p_record_type='defect' then
    if v_status='open' and p_operation='start' and p_business_role in ('pm','operations','quality') then v_next:='in_progress';elsif v_status='in_progress' and p_operation='submit_verification' and p_business_role in ('pm','operations','quality') then v_next:='ready_for_verification';elsif v_status='ready_for_verification' and p_operation='verify' and p_business_role='quality' then v_next:='closed';elsif v_status='ready_for_verification' and p_operation='reject_verification' and p_business_role='quality' then v_next:='in_progress';elsif v_status='open' and p_operation='reject' and p_business_role='quality' then v_next:='rejected';else raise exception 'ROLE_FORBIDDEN_OR_STATUS_CONFLICT';end if;
  else
    if v_status='draft' and p_operation='submit' and p_business_role in ('pm','operations') then v_next:='submitted';elsif v_status='submitted' and p_operation='start_review' and p_business_role in ('quality','business_owner','sponsor') then v_next:='in_review';elsif v_status='in_review' and p_operation='approve' and p_business_role in ('business_owner','sponsor') then v_next:='approved';elsif v_status='in_review' and p_operation='request_changes' and p_business_role in ('quality','business_owner','sponsor') then v_next:='changes_requested';elsif v_status='in_review' and p_operation='reject' and p_business_role in ('business_owner','sponsor') then v_next:='rejected';elsif v_status='changes_requested' and p_operation='revise' and p_business_role in ('pm','operations') then v_next:='draft';elsif v_status='approved' and p_operation='close' and p_business_role in ('pmo','business_owner','sponsor') then v_next:='closed';else raise exception 'ROLE_FORBIDDEN_OR_STATUS_CONFLICT';end if;
  end if;
  if p_record_type='contract' then update public.project_contract_records set status=v_next,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_record_id returning version into v_version;
  elsif p_record_type='quality_plan' then update public.project_quality_plans set status=v_next,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_record_id returning version into v_version;
  elsif p_record_type='defect' then update public.project_defect_records set status=v_next,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_record_id returning version into v_version;
  else update public.project_acceptance_records set status=v_next,submitted_at=case when v_next='submitted' then now() else submitted_at end,decision=case when v_next in ('approved','rejected') then v_next else decision end,decision_comment=case when v_next in ('approved','rejected','changes_requested') then p_comment else decision_comment end,version=version+1,updated_by=p_actor_user_id,updated_at=now()where id=p_record_id returning version into v_version;end if;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,p_record_type,p_record_id,p_operation,v_version,p_business_role,p_actor_user_id,v_payload);
  v_result:=jsonb_build_object('id',p_record_id,'record_type',p_record_type,'status',v_next,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

create or replace function public.save_project_acceptance_item_result_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_business_role text,p_actor_user_id uuid,p_idempotency_key text,p_expected_version bigint,p_item_id uuid,p_actual text,p_result text,p_evidence jsonb,p_comment text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_payload jsonb:=jsonb_build_object('item_id',p_item_id,'actual',p_actual,'result',p_result,'evidence',p_evidence,'comment',p_comment);v_replay jsonb;v_version bigint;v_acceptance_status text;v_result jsonb;
begin
  if p_business_role not in ('quality','business_owner','sponsor') then raise exception 'ROLE_FORBIDDEN';end if;
  if p_result not in ('pending','passed','failed','waived') then raise exception 'RESULT_INVALID';end if;
  v_replay:=public.begin_v632_operation(p_org_id,p_project_id,p_data_class,p_idempotency_key,'save_acceptance_item_result',v_payload,p_actor_user_id);if v_replay is not null then return v_replay->'result';end if;
  select item.version,acceptance.status into v_version,v_acceptance_status from public.project_acceptance_items item join public.project_acceptance_records acceptance on acceptance.id=item.acceptance_record_id where item.id=p_item_id and item.org_id=p_org_id and item.project_id=p_project_id and item.data_class=p_data_class for update of item;
  if not found then raise exception 'ACCEPTANCE_ITEM_NOT_FOUND';end if;if v_version<>p_expected_version then raise exception 'VERSION_CONFLICT';end if;if v_acceptance_status not in ('submitted','in_review') then raise exception 'STATUS_CONFLICT';end if;
  update public.project_acceptance_items set actual=p_actual,result=p_result,evidence=coalesce(p_evidence,'[]'::jsonb),version=version+1,updated_at=now()where id=p_item_id returning version into v_version;
  insert into public.project_commercial_quality_events(org_id,project_id,data_class,aggregate_type,aggregate_id,event_type,aggregate_version,business_role,actor_user_id,payload)values(p_org_id,p_project_id,p_data_class,'acceptance_item',p_item_id,'acceptance_item_'||p_result,v_version,p_business_role,p_actor_user_id,v_payload);
  v_result:=jsonb_build_object('id',p_item_id,'status',p_result,'version',v_version,'updated_at',now());return public.finish_v632_operation(p_org_id,p_idempotency_key,v_result);
end $$;

alter table public.project_contract_records enable row level security;
alter table public.project_receivable_records enable row level security;
alter table public.project_collection_records enable row level security;
alter table public.project_stakeholder_records enable row level security;
alter table public.project_stakeholder_engagement_actions enable row level security;
alter table public.project_quality_plans enable row level security;
alter table public.project_quality_check_items enable row level security;
alter table public.project_defect_records enable row level security;
alter table public.project_acceptance_records enable row level security;
alter table public.project_acceptance_items enable row level security;
alter table public.project_signoff_records enable row level security;
alter table public.project_commercial_quality_operation_receipts enable row level security;
alter table public.project_commercial_quality_events enable row level security;

revoke all on table public.project_contract_records from public, anon, authenticated;
revoke all on table public.project_receivable_records from public, anon, authenticated;
revoke all on table public.project_collection_records from public, anon, authenticated;
revoke all on table public.project_stakeholder_records from public, anon, authenticated;
revoke all on table public.project_stakeholder_engagement_actions from public, anon, authenticated;
revoke all on table public.project_quality_plans from public, anon, authenticated;
revoke all on table public.project_quality_check_items from public, anon, authenticated;
revoke all on table public.project_defect_records from public, anon, authenticated;
revoke all on table public.project_acceptance_records from public, anon, authenticated;
revoke all on table public.project_acceptance_items from public, anon, authenticated;
revoke all on table public.project_signoff_records from public, anon, authenticated;
revoke all on table public.project_commercial_quality_operation_receipts from public, anon, authenticated;
revoke all on table public.project_commercial_quality_events from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['project_contract_records','project_receivable_records','project_collection_records','project_stakeholder_records','project_stakeholder_engagement_actions','project_quality_plans','project_quality_check_items','project_defect_records','project_acceptance_records','project_acceptance_items','project_signoff_records','project_commercial_quality_operation_receipts','project_commercial_quality_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
    execute format('drop trigger if exists %I on public.%I','trg_v632_scope_'||t,t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.enforce_v632_business_scope()','trg_v632_scope_'||t,t);
  end loop;
end $$;

drop trigger if exists trg_v632_events_append_only on public.project_commercial_quality_events;
create trigger trg_v632_events_append_only before update or delete on public.project_commercial_quality_events for each row execute function public.prevent_v632_event_mutation();

create index if not exists idx_v632_contract_project on public.project_contract_records(org_id,project_id,data_class,status);
create index if not exists idx_v632_receivable_due on public.project_receivable_records(org_id,project_id,data_class,status,due_date);
create index if not exists idx_v632_collection_receivable on public.project_collection_records(receivable_record_id,collected_date);
create index if not exists idx_v632_stakeholder_project on public.project_stakeholder_records(org_id,project_id,data_class,status);
create index if not exists idx_v632_stakeholder_actions_due on public.project_stakeholder_engagement_actions(org_id,project_id,data_class,status,due_at);
create index if not exists idx_v632_quality_plan_project on public.project_quality_plans(org_id,project_id,data_class,status);
create index if not exists idx_v632_defect_project on public.project_defect_records(org_id,project_id,data_class,status,severity);
create index if not exists idx_v632_acceptance_project on public.project_acceptance_records(org_id,project_id,data_class,status);
create index if not exists idx_v632_events_project on public.project_commercial_quality_events(org_id,project_id,data_class,created_at desc);

revoke all on function public.enforce_v632_business_scope() from public, anon, authenticated;
revoke all on function public.prevent_v632_event_mutation() from public, anon, authenticated;
revoke all on function public.begin_v632_operation(uuid,uuid,text,text,text,jsonb,uuid) from public, anon, authenticated;
revoke all on function public.finish_v632_operation(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_commercial_record_tx(uuid,uuid,text,text,uuid,text,bigint,text,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_stakeholder_record_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_stakeholder_action_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_quality_plan_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,text,jsonb,text,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_quality_check_result_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.save_project_defect_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_acceptance_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.save_project_acceptance_item_result_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.save_project_signoff_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.transition_project_commercial_quality_tx(uuid,uuid,text,text,uuid,text,bigint,text,uuid,text,text) from public, anon, authenticated;

grant execute on function public.enforce_v632_business_scope() to service_role;
grant execute on function public.prevent_v632_event_mutation() to service_role;
grant execute on function public.begin_v632_operation(uuid,uuid,text,text,text,jsonb,uuid) to service_role;
grant execute on function public.finish_v632_operation(uuid,text,jsonb) to service_role;
grant execute on function public.save_project_commercial_record_tx(uuid,uuid,text,text,uuid,text,bigint,text,uuid,jsonb) to service_role;
grant execute on function public.save_project_stakeholder_record_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) to service_role;
grant execute on function public.save_project_stakeholder_action_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) to service_role;
grant execute on function public.save_project_quality_plan_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,text,jsonb,text,jsonb) to service_role;
grant execute on function public.save_project_quality_check_result_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,jsonb,text) to service_role;
grant execute on function public.save_project_defect_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) to service_role;
grant execute on function public.save_project_acceptance_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb,jsonb) to service_role;
grant execute on function public.save_project_acceptance_item_result_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,text,text,jsonb,text) to service_role;
grant execute on function public.save_project_signoff_tx(uuid,uuid,text,text,uuid,text,bigint,uuid,jsonb) to service_role;
grant execute on function public.transition_project_commercial_quality_tx(uuid,uuid,text,text,uuid,text,bigint,text,uuid,text,text) to service_role;

commit;
