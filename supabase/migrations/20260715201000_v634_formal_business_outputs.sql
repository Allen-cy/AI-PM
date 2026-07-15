-- AI-PMO V6.3.4 formal business outputs.
-- Full reports, meeting minutes, migration decisions and knowledge assets are
-- server-only, versioned, scoped and auditable. Browser localStorage is not a
-- business system of record.

create table if not exists public.formal_business_outputs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  output_type text not null check (output_type in ('generated_report','meeting_minutes','migration_review','migration_comparison','migration_cutover','knowledge_asset')),
  output_key text not null,
  title text not null,
  content_type text not null default 'text/markdown',
  content text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  source_definition jsonb not null,
  source_snapshot_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','published','superseded','archived')),
  version bigint not null,
  state_version bigint not null default 1,
  content_hash text not null,
  idempotency_key text not null,
  reporting_snapshot_id uuid references public.reporting_snapshots(id) on delete set null,
  meeting_id uuid references public.governance_meetings(id) on delete set null,
  migration_batch_id uuid,
  knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (nullif(trim(output_key),'') is not null),
  check (nullif(trim(title),'') is not null),
  check (nullif(trim(content),'') is not null),
  check (source_definition <> '{}'::jsonb),
  check (version > 0 and state_version > 0),
  check (subject_scope <> 'project' or project_id::text = subject_id)
);

create unique index if not exists idx_v634_formal_output_revision
  on public.formal_business_outputs(org_id,subject_scope,subject_id,data_class,output_key,version);
create unique index if not exists idx_v634_formal_output_idempotency
  on public.formal_business_outputs(org_id,idempotency_key);
create index if not exists idx_v634_formal_output_history
  on public.formal_business_outputs(org_id,subject_scope,subject_id,data_class,output_type,created_at desc);
create index if not exists idx_v634_formal_output_project
  on public.formal_business_outputs(project_id,data_class,created_at desc) where project_id is not null;

create table if not exists public.formal_business_output_events (
  id uuid primary key default uuid_generate_v4(),
  output_id uuid not null references public.formal_business_outputs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_business_role text,
  reason text,
  request_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_v634_formal_output_events
  on public.formal_business_output_events(output_id,created_at);

create or replace function public.prevent_v634_output_event_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'V634_OUTPUT_EVENTS_APPEND_ONLY';
end;
$$;
drop trigger if exists trg_v634_output_events_append_only on public.formal_business_output_events;
create trigger trg_v634_output_events_append_only
  before update or delete on public.formal_business_output_events
  for each row execute function public.prevent_v634_output_event_mutation();

create or replace function public.save_v634_formal_output_tx(
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_project_id uuid,
  p_data_class text,
  p_output_type text,
  p_output_key text,
  p_title text,
  p_content_type text,
  p_content text,
  p_structured_payload jsonb,
  p_source_definition jsonb,
  p_source_snapshot_at timestamptz,
  p_reporting_snapshot_id uuid,
  p_meeting_id uuid,
  p_migration_batch_id uuid,
  p_knowledge_item_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_idempotency_key text,
  p_expected_version bigint
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_existing public.formal_business_outputs%rowtype;
  v_latest public.formal_business_outputs%rowtype;
  v_output public.formal_business_outputs%rowtype;
  v_hash text;
  v_version bigint;
begin
  if p_subject_scope not in ('project','portfolio','organization','customer','contract') or nullif(trim(p_subject_id),'') is null then raise exception 'V634_SCOPE_REQUIRED'; end if;
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'V634_DATA_CLASS_INVALID'; end if;
  if p_output_type not in ('generated_report','meeting_minutes','migration_review','migration_comparison','migration_cutover','knowledge_asset') then raise exception 'V634_OUTPUT_TYPE_INVALID'; end if;
  if p_actor_business_role not in ('pm','operations','pmo','business_owner','finance','quality') then raise exception 'V634_OUTPUT_ROLE_FORBIDDEN'; end if;
  if p_subject_scope='project' and (p_project_id is null or p_project_id::text<>p_subject_id) then raise exception 'V634_PROJECT_SCOPE_MISMATCH'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects p where p.id=p_project_id and p.org_id=p_org_id and p.data_class=p_data_class) then raise exception 'V634_PROJECT_SCOPE_MISMATCH'; end if;
  if nullif(trim(p_output_key),'') is null or nullif(trim(p_title),'') is null or nullif(trim(p_content),'') is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'V634_OUTPUT_REQUIRED'; end if;
  if p_source_snapshot_at is null or coalesce(p_source_definition,'{}'::jsonb)='{}'::jsonb then raise exception 'V634_SOURCE_REQUIRED'; end if;
  if p_expected_version is null or p_expected_version<0 then raise exception 'V634_VERSION_INVALID'; end if;

  v_hash := public.p21_sha256_hex(trim(p_content)||coalesce(p_structured_payload,'{}'::jsonb)::text||p_source_definition::text||p_source_snapshot_at::text||coalesce(p_reporting_snapshot_id::text,'')||coalesce(p_meeting_id::text,'')||coalesce(p_migration_batch_id::text,'')||coalesce(p_knowledge_item_id::text,''));
  select * into v_existing from public.formal_business_outputs where org_id=p_org_id and idempotency_key=p_idempotency_key;
  if found then
    if v_existing.content_hash is distinct from v_hash or v_existing.subject_scope<>p_subject_scope or v_existing.subject_id<>p_subject_id or v_existing.data_class<>p_data_class or v_existing.output_key<>p_output_key then
      raise exception 'V634_IDEMPOTENCY_PAYLOAD_CONFLICT';
    end if;
    return to_jsonb(v_existing);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_subject_scope||':'||p_subject_id||':'||p_data_class||':'||p_output_key,0));
  select * into v_latest from public.formal_business_outputs
    where org_id=p_org_id and subject_scope=p_subject_scope and subject_id=p_subject_id and data_class=p_data_class and output_key=p_output_key
    order by version desc limit 1 for update;
  v_version := case when found then v_latest.version+1 else 1 end;
  if coalesce(v_latest.version,0)<>p_expected_version then raise exception 'V634_VERSION_CONFLICT'; end if;

  if v_latest.id is not null and v_latest.status not in ('superseded','archived') then
    update public.formal_business_outputs set status='superseded',state_version=state_version+1,updated_by=p_actor_user_id,updated_at=now() where id=v_latest.id;
    insert into public.formal_business_output_events(output_id,org_id,subject_scope,subject_id,data_class,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id,detail)
    values(v_latest.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,'supersede',v_latest.status,'superseded',p_actor_user_id,p_actor_business_role,p_idempotency_key,jsonb_build_object('superseded_by_version',v_version));
  end if;

  insert into public.formal_business_outputs(
    org_id,subject_scope,subject_id,project_id,data_class,output_type,output_key,title,content_type,content,
    structured_payload,source_definition,source_snapshot_at,status,version,state_version,content_hash,idempotency_key,
    reporting_snapshot_id,meeting_id,migration_batch_id,knowledge_item_id,created_by,updated_by
  ) values (
    p_org_id,p_subject_scope,p_subject_id,p_project_id,p_data_class,p_output_type,trim(p_output_key),trim(p_title),coalesce(nullif(trim(p_content_type),''),'text/markdown'),trim(p_content),
    coalesce(p_structured_payload,'{}'::jsonb),p_source_definition,p_source_snapshot_at,'draft',v_version,1,v_hash,trim(p_idempotency_key),
    p_reporting_snapshot_id,p_meeting_id,p_migration_batch_id,p_knowledge_item_id,p_actor_user_id,p_actor_user_id
  ) returning * into v_output;
  insert into public.formal_business_output_events(output_id,org_id,subject_scope,subject_id,data_class,event_type,to_status,actor_user_id,actor_business_role,request_id,detail)
  values(v_output.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,'create','draft',p_actor_user_id,p_actor_business_role,p_idempotency_key,jsonb_build_object('version',v_version,'output_type',p_output_type));
  return to_jsonb(v_output);
end;
$$;

create or replace function public.save_v634_report_output_tx(
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_project_id uuid,
  p_data_class text,
  p_output_type text,
  p_output_key text,
  p_title text,
  p_content_type text,
  p_content text,
  p_structured_payload jsonb,
  p_source_definition jsonb,
  p_source_snapshot_at timestamptz,
  p_reporting_snapshot_id uuid,
  p_meeting_id uuid,
  p_migration_batch_id uuid,
  p_knowledge_item_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_idempotency_key text,
  p_expected_version bigint,
  p_snapshot_type text,
  p_period_start date,
  p_period_end date,
  p_metrics jsonb,
  p_exceptions jsonb,
  p_narrative text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_snapshot jsonb;
  v_output jsonb;
begin
  if p_output_type<>'generated_report' then raise exception 'V634_REPORT_OUTPUT_TYPE_INVALID'; end if;
  v_snapshot := public.create_reporting_snapshot_tx(
    p_org_id=>p_org_id,p_subject_scope=>p_subject_scope,p_subject_id=>p_subject_id,p_data_class=>p_data_class,
    p_snapshot_type=>p_snapshot_type,p_period_start=>p_period_start,p_period_end=>p_period_end,p_metrics=>coalesce(p_metrics,'{}'::jsonb),
    p_exceptions=>coalesce(p_exceptions,'[]'::jsonb),p_narrative=>p_narrative,p_source_snapshot_at=>p_source_snapshot_at,
    p_source_definition=>p_source_definition,p_submitted_to_user_id=>null,p_actor_user_id=>p_actor_user_id,
    p_actor_business_role=>p_actor_business_role,p_request_id=>p_idempotency_key||':snapshot'
  );
  v_output := public.save_v634_formal_output_tx(
    p_org_id=>p_org_id,p_subject_scope=>p_subject_scope,p_subject_id=>p_subject_id,p_project_id=>p_project_id,p_data_class=>p_data_class,
    p_output_type=>p_output_type,p_output_key=>p_output_key,p_title=>p_title,p_content_type=>p_content_type,p_content=>p_content,
    p_structured_payload=>p_structured_payload,p_source_definition=>p_source_definition,p_source_snapshot_at=>p_source_snapshot_at,
    p_reporting_snapshot_id=>(v_snapshot->>'id')::uuid,p_meeting_id=>p_meeting_id,p_migration_batch_id=>p_migration_batch_id,
    p_knowledge_item_id=>p_knowledge_item_id,p_actor_user_id=>p_actor_user_id,p_actor_business_role=>p_actor_business_role,
    p_idempotency_key=>p_idempotency_key,p_expected_version=>p_expected_version
  );
  return jsonb_build_object('snapshot',v_snapshot,'output',v_output);
end;
$$;

create or replace function public.transition_v634_formal_output_tx(
  p_output_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_operation text,
  p_expected_state_version bigint,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_output public.formal_business_outputs%rowtype;
  v_next text;
  v_from text;
begin
  select * into v_output from public.formal_business_outputs where id=p_output_id for update;
  if not found then raise exception 'V634_OUTPUT_NOT_FOUND'; end if;
  if v_output.org_id<>p_org_id or v_output.subject_scope<>p_subject_scope or v_output.subject_id<>p_subject_id or v_output.data_class<>p_data_class then raise exception 'V634_OUTPUT_SCOPE_MISMATCH'; end if;
  if v_output.state_version<>p_expected_state_version then raise exception 'V634_STATE_VERSION_CONFLICT'; end if;
  v_from := v_output.status;
  if p_operation='submit' and v_output.status='draft' and p_actor_business_role in ('pm','operations','pmo','business_owner','finance','quality') then v_next:='submitted';
  elsif p_operation='approve' and v_output.status='submitted' and p_actor_business_role in ('pmo','quality') then v_next:='approved';
  elsif p_operation='publish' and v_output.status in ('approved','draft') and p_actor_business_role in ('pmo','quality') then v_next:='published';
  elsif p_operation='archive' and v_output.status in ('draft','submitted','approved','published') and p_actor_business_role in ('pmo','quality') then v_next:='archived';
  else raise exception 'V634_OUTPUT_TRANSITION_FORBIDDEN'; end if;
  if p_operation='archive' and nullif(trim(p_reason),'') is null then raise exception 'V634_TRANSITION_REASON_REQUIRED'; end if;
  update public.formal_business_outputs set status=v_next,state_version=state_version+1,updated_by=p_actor_user_id,
    reviewed_by=case when v_next in ('approved','published') then p_actor_user_id else reviewed_by end,
    reviewed_at=case when v_next in ('approved','published') then now() else reviewed_at end,updated_at=now()
    where id=p_output_id returning * into v_output;
  insert into public.formal_business_output_events(output_id,org_id,subject_scope,subject_id,data_class,event_type,from_status,to_status,actor_user_id,actor_business_role,reason,request_id)
  values(p_output_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_operation,v_from,v_next,p_actor_user_id,p_actor_business_role,nullif(trim(p_reason),''),p_request_id);
  return to_jsonb(v_output);
end;
$$;

-- Meeting minutes are materialized inside the existing meeting transaction.
create or replace function public.materialize_v634_meeting_minutes_output()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_version bigint; v_result jsonb;
begin
  if nullif(trim(new.minutes),'') is null or new.created_by is null then return new; end if;
  select coalesce(max(version),0) into v_version from public.formal_business_outputs
    where org_id=new.org_id and subject_scope=new.subject_scope and subject_id=new.subject_id and data_class=new.data_class and output_key='meeting:'||new.id::text||':minutes';
  v_result := public.save_v634_formal_output_tx(
    new.org_id,new.subject_scope,new.subject_id,case when new.subject_scope='project' then new.subject_id::uuid else null end,new.data_class,
    'meeting_minutes','meeting:'||new.id::text||':minutes',new.title||'会议纪要','text/markdown',new.minutes,
    jsonb_build_object('conclusions',new.conclusions,'action_item_ids',new.action_item_ids,'decision_brief_ids',new.decision_brief_ids),
    jsonb_build_object('type','governance_meeting','meeting_id',new.id,'status',new.status),new.updated_at,null,new.id,null,null,
    new.created_by,'pmo','meeting:'||new.id::text||':minutes:'||public.p21_sha256_hex(new.minutes),v_version
  );
  return new;
end;
$$;
drop trigger if exists trg_v634_materialize_meeting_minutes on public.governance_meetings;
create trigger trg_v634_materialize_meeting_minutes
  after update of minutes on public.governance_meetings
  for each row when (new.minutes is distinct from old.minutes)
  execute function public.materialize_v634_meeting_minutes_output();

-- Human-approved knowledge publication becomes a recoverable formal asset.
create or replace function public.materialize_v634_knowledge_output()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_org_id uuid; v_project_id uuid; v_actor uuid; v_data_class text; v_version bigint; v_result jsonb; v_content text;
begin
  if new.status<>'published' or old.status='published' then return new; end if;
  if coalesce(new.metadata->>'org_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return new; end if;
  v_org_id := (new.metadata->>'org_id')::uuid;
  v_actor := coalesce(new.updated_by,new.created_by);
  if v_actor is null then return new; end if;
  if coalesce(new.metadata->>'source_project_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_project_id := (new.metadata->>'source_project_id')::uuid; end if;
  v_data_class := coalesce(nullif(new.metadata->>'data_class',''),'production');
  if v_data_class not in ('production','sample','test','diagnostic','unclassified') then return new; end if;
  v_content := coalesce(nullif(new.metadata->>'summary',''),'# '||new.title||E'\n\n'||array_to_string(new.source_refs,E'\n'));
  select coalesce(max(version),0) into v_version from public.formal_business_outputs where org_id=v_org_id and output_key='knowledge:'||new.id::text and data_class=v_data_class;
  v_result := public.save_v634_formal_output_tx(
    v_org_id,case when v_project_id is null then 'organization' else 'project' end,coalesce(v_project_id::text,v_org_id::text),v_project_id,v_data_class,
    'knowledge_asset','knowledge:'||new.id::text,new.title,'text/markdown',v_content,
    jsonb_build_object('page_id',new.page_id,'knowledge_type',new.knowledge_type,'domains',new.domains,'tags',new.tags,'applicable_scenarios',new.applicable_scenarios),
    jsonb_build_object('type','knowledge_item','knowledge_item_id',new.id,'source_refs',new.source_refs),new.updated_at,null,null,null,new.id,
    v_actor,'quality','knowledge:'||new.id::text||':published:'||public.p21_sha256_hex(v_content),v_version
  );
  return new;
end;
$$;
drop trigger if exists trg_v634_materialize_knowledge_output on public.knowledge_items;
create trigger trg_v634_materialize_knowledge_output
  after update of status on public.knowledge_items
  for each row when (new.status='published' and old.status is distinct from new.status)
  execute function public.materialize_v634_knowledge_output();

alter table public.formal_business_outputs enable row level security;
alter table public.formal_business_output_events enable row level security;
revoke all on table public.formal_business_outputs,public.formal_business_output_events from public, anon, authenticated;
grant select,insert,update,delete on table public.formal_business_outputs to service_role;
grant select,insert on table public.formal_business_output_events to service_role;

revoke all on function public.prevent_v634_output_event_mutation() from public,anon,authenticated;
revoke all on function public.save_v634_formal_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamptz,uuid,uuid,uuid,uuid,uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function public.save_v634_report_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamptz,uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,date,date,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.transition_v634_formal_output_tx(uuid,uuid,text,text,text,text,bigint,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.materialize_v634_meeting_minutes_output() from public,anon,authenticated;
revoke all on function public.materialize_v634_knowledge_output() from public,anon,authenticated;
grant execute on function public.save_v634_formal_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamptz,uuid,uuid,uuid,uuid,uuid,text,text,bigint) to service_role;
grant execute on function public.save_v634_report_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamptz,uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,date,date,jsonb,jsonb,text) to service_role;
grant execute on function public.transition_v634_formal_output_tx(uuid,uuid,text,text,text,text,bigint,text,uuid,text,text) to service_role;
