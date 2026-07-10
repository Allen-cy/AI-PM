-- P17-T0 stable project identity migration control plane.
-- Every phase is persistent and reversible without deleting projects, Feishu records or audit history.

create table if not exists public.project_identity_migration_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  source_type text not null default 'feishu',
  source_container_id text not null,
  status text not null default 'previewed' check (status in ('previewed','applied','verified','blocked','cutover','rolled_back','cancelled')),
  idempotency_key text not null,
  preview_snapshot jsonb not null,
  applied_summary jsonb,
  verification_snapshot jsonb,
  cutover_mode text check (cutover_mode is null or cutover_mode in ('dual_read','stable_id')),
  read_percentage integer check (read_percentage is null or read_percentage between 0 and 100),
  rollback_reason text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  applied_by uuid references public.app_users(id) on delete set null,
  verified_by uuid references public.app_users(id) on delete set null,
  cutover_by uuid references public.app_users(id) on delete set null,
  rolled_back_by uuid references public.app_users(id) on delete set null,
  applied_at timestamptz,
  verified_at timestamptz,
  cutover_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,idempotency_key)
);

create table if not exists public.project_identity_migration_entries (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.project_identity_migration_runs(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  source_type text not null,
  source_container_id text not null,
  source_record_id text not null,
  planned_action text not null check (planned_action in ('create','reuse','conflict')),
  original_project_id uuid references public.projects(id) on delete set null,
  applied_project_id uuid references public.projects(id) on delete set null,
  mapping_id uuid references public.project_identity_mappings(id) on delete set null,
  previous_mapping jsonb,
  created_project boolean not null default false,
  verification_status text not null default 'pending' check (verification_status in ('pending','matched','mismatch','conflict_quarantined','rolled_back')),
  verification_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,source_type,source_container_id,source_record_id)
);

create table if not exists public.project_identity_cutover_configs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  source_type text not null,
  source_container_id text not null,
  mode text not null default 'legacy' check (mode in ('legacy','dual_read','stable_id')),
  read_percentage integer not null default 0 check (read_percentage between 0 and 100),
  active_run_id uuid references public.project_identity_migration_runs(id) on delete set null,
  previous_config jsonb not null default '{}'::jsonb,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (org_id,source_type,source_container_id),
  check ((mode='legacy' and read_percentage=0) or (mode='dual_read' and read_percentage between 1 and 99) or (mode='stable_id' and read_percentage=100))
);

create table if not exists public.project_identity_migration_events (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.project_identity_migration_runs(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (run_id,request_id,event_type)
);

create index if not exists idx_project_identity_migration_runs_status on public.project_identity_migration_runs(org_id,status,created_at desc);
create index if not exists idx_project_identity_migration_entries_run on public.project_identity_migration_entries(run_id,verification_status);
create index if not exists idx_project_identity_migration_events_run on public.project_identity_migration_events(run_id,created_at);

create or replace function public.apply_project_identity_backfill_run_tx(
  p_run_id uuid,
  p_entries jsonb,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.project_identity_migration_runs%rowtype;
  v_entry jsonb;
  v_previous jsonb;
  v_summary jsonb;
  v_mapping public.project_identity_mappings%rowtype;
begin
  if nullif(btrim(p_request_id),'') is null then raise exception 'P17_REQUEST_ID_REQUIRED'; end if;
  select * into v_run from public.project_identity_migration_runs where id=p_run_id for update;
  if not found then raise exception 'P17_IDENTITY_RUN_NOT_FOUND'; end if;
  if v_run.status in ('applied','verified','blocked','cutover') then return coalesce(v_run.applied_summary,'{}'::jsonb); end if;
  if v_run.status <> 'previewed' then raise exception 'P17_IDENTITY_RUN_NOT_PREVIEWED'; end if;
  if jsonb_typeof(p_entries)<>'array' or p_entries is distinct from v_run.preview_snapshot->'entries' then raise exception 'P17_PREVIEW_ENTRIES_CHANGED'; end if;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    select to_jsonb(mapping) into v_previous
    from public.project_identity_mappings mapping
    where mapping.org_id=v_run.org_id
      and mapping.source_type=v_entry->>'source_type'
      and mapping.source_container_id=coalesce(v_entry->>'source_container_id','')
      and mapping.source_record_id=v_entry->>'source_record_id';
    insert into public.project_identity_migration_entries(
      run_id,org_id,source_type,source_container_id,source_record_id,planned_action,original_project_id,previous_mapping,created_project
    ) values (
      v_run.id,v_run.org_id,v_entry->>'source_type',coalesce(v_entry->>'source_container_id',''),v_entry->>'source_record_id',v_entry->>'action',
      nullif(v_entry->>'project_id','')::uuid,v_previous,(v_entry->>'action'='create')
    ) on conflict (run_id,source_type,source_container_id,source_record_id) do nothing;
  end loop;

  select public.apply_project_identity_backfill_tx(v_run.org_id,p_entries,p_actor_user_id) into v_summary;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    select * into v_mapping from public.project_identity_mappings
    where org_id=v_run.org_id
      and source_type=v_entry->>'source_type'
      and source_container_id=coalesce(v_entry->>'source_container_id','')
      and source_record_id=v_entry->>'source_record_id';
    update public.project_identity_migration_entries
      set mapping_id=v_mapping.id,applied_project_id=v_mapping.project_id,updated_at=now()
    where run_id=v_run.id and source_type=v_entry->>'source_type'
      and source_container_id=coalesce(v_entry->>'source_container_id','') and source_record_id=v_entry->>'source_record_id';
  end loop;

  update public.project_identity_migration_runs set status='applied',applied_summary=v_summary,applied_by=p_actor_user_id,applied_at=now(),updated_at=now() where id=v_run.id;
  insert into public.project_identity_migration_events(run_id,event_type,from_status,to_status,detail,actor_user_id,request_id)
  values(v_run.id,'applied','previewed','applied',v_summary,p_actor_user_id,p_request_id);
  return v_summary;
end;
$$;

create or replace function public.verify_project_identity_dual_read_tx(
  p_run_id uuid,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.project_identity_migration_runs%rowtype;
  v_entry record;
  v_mapping public.project_identity_mappings%rowtype;
  v_project public.projects%rowtype;
  v_matched integer:=0;
  v_mismatched integer:=0;
  v_conflicts integer:=0;
  v_ok boolean;
  v_detail jsonb;
  v_mismatches jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  select * into v_run from public.project_identity_migration_runs where id=p_run_id for update;
  if not found then raise exception 'P17_IDENTITY_RUN_NOT_FOUND'; end if;
  if v_run.status not in ('applied','blocked','verified') then raise exception 'P17_IDENTITY_RUN_NOT_APPLIED'; end if;
  for v_entry in select * from public.project_identity_migration_entries where run_id=v_run.id order by created_at loop
    select * into v_mapping from public.project_identity_mappings where id=v_entry.mapping_id;
    if v_entry.planned_action='conflict' then
      v_ok:=v_mapping.id is not null and v_mapping.mapping_status='conflict' and v_mapping.project_id is null;
      v_detail:=jsonb_build_object('expected','conflict_quarantined','mapping_status',v_mapping.mapping_status,'project_id',v_mapping.project_id);
      if v_ok then
        v_conflicts:=v_conflicts+1;
        update public.project_identity_migration_entries set verification_status='conflict_quarantined',verification_detail=v_detail,updated_at=now() where id=v_entry.id;
      else
        v_mismatched:=v_mismatched+1;v_mismatches:=v_mismatches||jsonb_build_array(jsonb_build_object('source_record_id',v_entry.source_record_id,'reason','CONFLICT_NOT_QUARANTINED'));
        update public.project_identity_migration_entries set verification_status='mismatch',verification_detail=v_detail,updated_at=now() where id=v_entry.id;
      end if;
      continue;
    end if;
    select * into v_project from public.projects where id=v_mapping.project_id and org_id=v_run.org_id;
    v_ok:=v_mapping.id is not null and v_mapping.mapping_status='active' and v_project.id is not null
      and v_mapping.project_id=v_entry.applied_project_id
      and v_mapping.source_record_id=v_entry.source_record_id
      and v_mapping.data_class=v_project.data_class
      and (v_project.source_record_id=v_entry.source_record_id or (v_mapping.external_project_code is not null and lower(v_project.oa_no)=lower(v_mapping.external_project_code)));
    v_detail:=jsonb_build_object(
      'mapping_id',v_mapping.id,'stable_project_id',v_mapping.project_id,'mapping_status',v_mapping.mapping_status,
      'mapping_data_class',v_mapping.data_class,'project_data_class',v_project.data_class,
      'legacy_source_record_id',v_project.source_record_id,'external_project_code',v_mapping.external_project_code,'legacy_project_code',v_project.oa_no
    );
    if v_ok then
      v_matched:=v_matched+1;
      update public.project_identity_migration_entries set verification_status='matched',verification_detail=v_detail,updated_at=now() where id=v_entry.id;
    else
      v_mismatched:=v_mismatched+1;v_mismatches:=v_mismatches||jsonb_build_array(jsonb_build_object('source_record_id',v_entry.source_record_id,'reason','DUAL_READ_MISMATCH','detail',v_detail));
      update public.project_identity_migration_entries set verification_status='mismatch',verification_detail=v_detail,updated_at=now() where id=v_entry.id;
    end if;
  end loop;
  v_result:=jsonb_build_object('matched',v_matched,'mismatched',v_mismatched,'conflicts_quarantined',v_conflicts,'mismatches',v_mismatches,'verified_at',now());
  update public.project_identity_migration_runs set status=case when v_mismatched=0 then 'verified' else 'blocked' end,
    verification_snapshot=v_result,verified_by=p_actor_user_id,verified_at=now(),updated_at=now() where id=v_run.id;
  insert into public.project_identity_migration_events(run_id,event_type,from_status,to_status,detail,actor_user_id,request_id)
  values(v_run.id,'dual_read_verified',v_run.status,case when v_mismatched=0 then 'verified' else 'blocked' end,v_result,p_actor_user_id,p_request_id)
  on conflict(run_id,request_id,event_type) do nothing;
  return v_result;
end;
$$;

create or replace function public.cutover_project_identity_read_tx(
  p_run_id uuid,
  p_mode text,
  p_read_percentage integer,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.project_identity_migration_runs%rowtype;
  v_previous jsonb;
  v_config_id uuid;
begin
  select * into v_run from public.project_identity_migration_runs where id=p_run_id for update;
  if not found then raise exception 'P17_IDENTITY_RUN_NOT_FOUND'; end if;
  if v_run.status not in ('verified','cutover') then raise exception 'P17_DUAL_READ_VERIFICATION_REQUIRED'; end if;
  if p_mode not in ('dual_read','stable_id') or (p_mode='dual_read' and (p_read_percentage<1 or p_read_percentage>99)) or (p_mode='stable_id' and p_read_percentage<>100) then raise exception 'P17_CUTOVER_CONFIGURATION_INVALID'; end if;
  if p_mode='stable_id' and coalesce((v_run.applied_summary->>'conflict')::integer,0)>0 then raise exception 'P17_IDENTITY_CONFLICTS_BLOCK_STABLE_CUTOVER'; end if;
  select to_jsonb(config) into v_previous from public.project_identity_cutover_configs config
    where org_id=v_run.org_id and source_type=v_run.source_type and source_container_id=v_run.source_container_id;
  insert into public.project_identity_cutover_configs(org_id,source_type,source_container_id,mode,read_percentage,active_run_id,previous_config,updated_by,updated_at)
  values(v_run.org_id,v_run.source_type,v_run.source_container_id,p_mode,p_read_percentage,v_run.id,coalesce(v_previous,'{}'::jsonb),p_actor_user_id,now())
  on conflict(org_id,source_type,source_container_id) do update set
    previous_config=jsonb_build_object('id',public.project_identity_cutover_configs.id,'mode',public.project_identity_cutover_configs.mode,'read_percentage',public.project_identity_cutover_configs.read_percentage,'active_run_id',public.project_identity_cutover_configs.active_run_id,'updated_at',public.project_identity_cutover_configs.updated_at),
    mode=excluded.mode,read_percentage=excluded.read_percentage,
    active_run_id=excluded.active_run_id,updated_by=excluded.updated_by,updated_at=now()
  returning id into v_config_id;
  update public.project_identity_migration_runs set status='cutover',cutover_mode=p_mode,read_percentage=p_read_percentage,cutover_by=p_actor_user_id,cutover_at=now(),updated_at=now() where id=v_run.id;
  insert into public.project_identity_migration_events(run_id,event_type,from_status,to_status,detail,actor_user_id,request_id)
  values(v_run.id,'cutover',v_run.status,'cutover',jsonb_build_object('mode',p_mode,'read_percentage',p_read_percentage,'config_id',v_config_id),p_actor_user_id,p_request_id)
  on conflict(run_id,request_id,event_type) do nothing;
  return jsonb_build_object('run_id',v_run.id,'mode',p_mode,'read_percentage',p_read_percentage,'config_id',v_config_id);
end;
$$;

create or replace function public.rollback_project_identity_run_tx(
  p_run_id uuid,
  p_reason text,
  p_actor_user_id uuid,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.project_identity_migration_runs%rowtype;
  v_entry record;
  v_previous jsonb;
  v_restored integer:=0;
  v_revoked integer:=0;
begin
  if nullif(btrim(p_reason),'') is null then raise exception 'P17_ROLLBACK_REASON_REQUIRED'; end if;
  select * into v_run from public.project_identity_migration_runs where id=p_run_id for update;
  if not found then raise exception 'P17_IDENTITY_RUN_NOT_FOUND'; end if;
  if v_run.status='rolled_back' then return jsonb_build_object('run_id',v_run.id,'restored',0,'revoked',0,'already_rolled_back',true); end if;
  if v_run.status not in ('applied','verified','blocked','cutover') then raise exception 'P17_IDENTITY_RUN_NOT_ROLLBACKABLE'; end if;
  for v_entry in select * from public.project_identity_migration_entries where run_id=v_run.id order by created_at desc loop
    v_previous:=v_entry.previous_mapping;
    if v_previous is null or v_previous='null'::jsonb then
      update public.project_identity_mappings set mapping_status='revoked',conflict_detail=conflict_detail||jsonb_build_object('rollback_run_id',v_run.id,'rollback_reason',p_reason),updated_at=now()
      where id=v_entry.mapping_id;
      v_revoked:=v_revoked+1;
    else
      update public.project_identity_mappings set
        project_id=nullif(v_previous->>'project_id','')::uuid,
        external_project_code=nullif(v_previous->>'external_project_code',''),historical_project_name=v_previous->>'historical_project_name',
        data_class=coalesce(v_previous->>'data_class',data_class),mapping_status=coalesce(v_previous->>'mapping_status','revoked'),
        conflict_detail=coalesce(v_previous->'conflict_detail','{}'::jsonb),verified_by=nullif(v_previous->>'verified_by','')::uuid,
        verified_at=nullif(v_previous->>'verified_at','')::timestamptz,updated_at=now()
      where id=v_entry.mapping_id;
      v_restored:=v_restored+1;
    end if;
    update public.project_identity_migration_entries set verification_status='rolled_back',updated_at=now() where id=v_entry.id;
  end loop;
  update public.project_identity_cutover_configs set mode='legacy',read_percentage=0,active_run_id=null,
    previous_config=previous_config||jsonb_build_object('rolled_back_run_id',v_run.id,'reason',p_reason),updated_by=p_actor_user_id,updated_at=now()
  where org_id=v_run.org_id and source_type=v_run.source_type and source_container_id=v_run.source_container_id and active_run_id=v_run.id;
  update public.project_identity_migration_runs set status='rolled_back',rollback_reason=p_reason,rolled_back_by=p_actor_user_id,rolled_back_at=now(),updated_at=now() where id=v_run.id;
  insert into public.project_identity_migration_events(run_id,event_type,from_status,to_status,detail,actor_user_id,request_id)
  values(v_run.id,'rolled_back',v_run.status,'rolled_back',jsonb_build_object('restored',v_restored,'revoked',v_revoked,'reason',p_reason,'projects_deleted',false),p_actor_user_id,p_request_id)
  on conflict(run_id,request_id,event_type) do nothing;
  return jsonb_build_object('run_id',v_run.id,'restored',v_restored,'revoked',v_revoked,'projects_deleted',false);
end;
$$;

alter table public.project_identity_migration_runs enable row level security;
alter table public.project_identity_migration_entries enable row level security;
alter table public.project_identity_cutover_configs enable row level security;
alter table public.project_identity_migration_events enable row level security;

revoke all on table public.project_identity_migration_runs,public.project_identity_migration_entries,public.project_identity_cutover_configs,public.project_identity_migration_events from public,anon,authenticated;
grant select,insert,update,delete on table public.project_identity_migration_runs,public.project_identity_migration_entries,public.project_identity_cutover_configs,public.project_identity_migration_events to service_role;

revoke all on function public.apply_project_identity_backfill_run_tx(uuid,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.verify_project_identity_dual_read_tx(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.cutover_project_identity_read_tx(uuid,text,integer,uuid,text) from public,anon,authenticated;
revoke all on function public.rollback_project_identity_run_tx(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_project_identity_backfill_run_tx(uuid,jsonb,uuid,text) to service_role;
grant execute on function public.verify_project_identity_dual_read_tx(uuid,uuid,text) to service_role;
grant execute on function public.cutover_project_identity_read_tx(uuid,text,integer,uuid,text) to service_role;
grant execute on function public.rollback_project_identity_run_tx(uuid,text,uuid,text) to service_role;
