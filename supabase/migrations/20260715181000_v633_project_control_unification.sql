begin;

alter table public.project_issues
  add column if not exists version bigint not null default 1,
  add column if not exists last_idempotency_key text;

alter table public.project_changes
  add column if not exists version bigint not null default 1,
  add column if not exists last_idempotency_key text;

alter table public.unified_action_items
  add column if not exists version bigint not null default 1,
  add column if not exists last_idempotency_key text;

create table if not exists public.project_control_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  actor_user_id uuid references public.app_users(id) on delete set null,
  request_id text not null,
  status text not null default 'running' check (status in ('running','succeeded','failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id,idempotency_key)
);

alter table public.project_control_operation_receipts enable row level security;
revoke all on table public.project_control_operation_receipts from public, anon, authenticated;
grant all on table public.project_control_operation_receipts to service_role;

create index if not exists idx_project_control_receipts_scope
  on public.project_control_operation_receipts(org_id,project_id,data_class,created_at desc);

create or replace function public.prevent_v633_issue_change_event_mutation()
returns trigger language plpgsql set search_path=public as $$
begin
  raise exception 'ISSUE_CHANGE_EVENTS_APPEND_ONLY';
end;
$$;

drop trigger if exists trg_v633_issue_change_events_append_only on public.issue_change_events;
create trigger trg_v633_issue_change_events_append_only
before update or delete on public.issue_change_events
for each row execute function public.prevent_v633_issue_change_event_mutation();

create or replace function public.begin_v633_project_control_operation(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_operation text,p_idempotency_key text,
  p_request_hash text,p_actor_user_id uuid,p_request_id text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_receipt public.project_control_operation_receipts%rowtype;
begin
  select * into v_receipt from public.project_control_operation_receipts
    where org_id=p_org_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('receipt_id',v_receipt.id,'status',v_receipt.status,'result',v_receipt.result,'replayed',v_receipt.status='succeeded');
  end if;
  insert into public.project_control_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_hash,actor_user_id,request_id)
  values(p_org_id,p_project_id,p_data_class,p_operation,p_idempotency_key,p_request_hash,p_actor_user_id,p_request_id)
  returning * into v_receipt;
  return jsonb_build_object('receipt_id',v_receipt.id,'status','running','replayed',false);
end;
$$;

create or replace function public.finish_v633_project_control_operation(
  p_receipt_id uuid,p_status text,p_result jsonb default null,p_error text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_receipt public.project_control_operation_receipts%rowtype;
begin
  if p_status not in ('succeeded','failed') then raise exception 'RECEIPT_STATUS_INVALID'; end if;
  update public.project_control_operation_receipts set status=p_status,result=p_result,error=left(p_error,500),completed_at=now(),updated_at=now()
    where id=p_receipt_id and status='running' returning * into v_receipt;
  if not found then raise exception 'RECEIPT_NOT_RUNNING'; end if;
  return jsonb_build_object('receipt_id',v_receipt.id,'status',v_receipt.status,'result',v_receipt.result);
end;
$$;

create or replace function public.apply_project_issue_change_action_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_operation text,
  p_idempotency_key text,
  p_expected_version bigint,
  p_request_hash text,
  p_actor_user_id uuid,
  p_actor_name text,
  p_request_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_receipt public.project_control_operation_receipts%rowtype;
  v_issue public.project_issues%rowtype;
  v_change public.project_changes%rowtype;
  v_action public.unified_action_items%rowtype;
  v_id uuid;
  v_from text;
  v_to text;
  v_result jsonb;
  v_item jsonb;
  v_action_ids jsonb := '[]'::jsonb;
begin
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'DATA_CLASS_INVALID'; end if;
  if coalesce(p_idempotency_key,'')='' or coalesce(p_request_hash,'')='' then raise exception 'IDEMPOTENCY_REQUIRED'; end if;
  if p_expected_version < 0 then raise exception 'VERSION_INVALID'; end if;
  if not exists(select 1 from public.projects where id=p_project_id and org_id=p_org_id and data_class=p_data_class and not coalesce(is_source_deleted,false)) then
    raise exception 'PROJECT_SCOPE_MISMATCH';
  end if;

  select * into v_receipt from public.project_control_operation_receipts
  where org_id=p_org_id and idempotency_key=p_idempotency_key for update;
  if found then
    if v_receipt.request_hash<>p_request_hash then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    if v_receipt.status='succeeded' then return v_receipt.result || jsonb_build_object('replayed',true); end if;
    raise exception 'OPERATION_ALREADY_RUNNING';
  end if;

  insert into public.project_control_operation_receipts(org_id,project_id,data_class,operation,idempotency_key,request_hash,actor_user_id,request_id)
  values(p_org_id,p_project_id,p_data_class,p_operation,p_idempotency_key,p_request_hash,p_actor_user_id,p_request_id)
  returning * into v_receipt;

  if p_operation in ('create_issue','escalate_risk') then
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_issues(org_id,project_id,data_class,issue_code,project_name,source_risk_id,source_risk_code,title,description,severity,status,owner,due_date,impact_scope,evidence,created_by,created_by_name,metadata,version,last_idempotency_key)
    values(p_org_id,p_project_id,p_data_class,nullif(p_payload->>'issue_code',''),p_payload->>'project_name',nullif(p_payload->>'source_risk_id','')::uuid,nullif(p_payload->>'source_risk_code',''),p_payload->>'title',nullif(p_payload->>'description',''),coalesce(nullif(p_payload->>'severity',''),'medium'),'open',nullif(p_payload->>'owner',''),nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'impact_scope',''),nullif(p_payload->>'evidence',''),p_actor_user_id,p_actor_name,coalesce(p_payload->'metadata','{}'::jsonb),1,p_idempotency_key)
    returning * into v_issue;
    v_id:=v_issue.id; v_to:=v_issue.status; v_result:=jsonb_build_object('status','succeeded','issue',to_jsonb(v_issue));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,to_status,actor_id,actor_name,comment,evidence,metadata)
    values(p_org_id,p_project_id,p_data_class,'issue',v_id::text,p_operation,v_to,p_actor_user_id,p_actor_name,p_payload->>'comment',p_payload->>'evidence',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'action_items','[]'::jsonb)) loop
      insert into public.unified_action_items(org_id,project_id,data_class,subject_scope,subject_id,source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,version,idempotency_key,last_idempotency_key)
      values(p_org_id,p_project_id,p_data_class,'project',p_project_id::text,'issue',v_issue.id::text,v_issue.project_name,v_item->>'title',nullif(v_item->>'owner',''),nullif(v_item->>'dueDate','')::date,'open',coalesce(nullif(v_item->>'priority',''),'P1'),p_actor_user_id,p_actor_name,jsonb_build_object('parent_operation',p_operation),1,p_idempotency_key||':action:'||gen_random_uuid()::text,p_idempotency_key)
      returning id into v_id;
      v_action_ids:=v_action_ids||to_jsonb(v_id);
      insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,to_status,actor_id,actor_name,metadata)
      values(p_org_id,p_project_id,p_data_class,'action',v_id::text,'action_created','open',p_actor_user_id,p_actor_name,jsonb_build_object('parent_type','issue','parent_id',v_issue.id,'request_id',p_request_id));
    end loop;
    v_result:=v_result||jsonb_build_object('action_ids',v_action_ids);
  elsif p_operation='transition_issue' then
    select * into v_issue from public.project_issues where id=(p_payload->>'id')::uuid and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
    if not found then raise exception 'ISSUE_NOT_FOUND'; end if;
    if v_issue.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    v_from:=v_issue.status; v_to:=p_payload->>'new_status';
    if not ((v_from='open' and v_to='analyzing') or (v_from='analyzing' and v_to in ('change-required','resolved')) or (v_from='change-required' and v_to='resolving') or (v_from='resolving' and v_to='resolved') or (v_from='resolved' and v_to in ('closed','open')) or (v_from='closed' and v_to='open')) then raise exception 'ISSUE_TRANSITION_INVALID'; end if;
    update public.project_issues set status=v_to,evidence=coalesce(nullif(p_payload->>'evidence',''),evidence),metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_payload->'metadata','{}'::jsonb),version=version+1,last_idempotency_key=p_idempotency_key,updated_at=now(),closed_at=case when v_to='closed' then now() else closed_at end where id=v_issue.id returning * into v_issue;
    v_result:=jsonb_build_object('status','succeeded','issue',to_jsonb(v_issue));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_id,actor_name,comment,evidence,metadata)
    values(p_org_id,p_project_id,p_data_class,'issue',v_issue.id::text,'issue_transition',v_from,v_to,p_actor_user_id,p_actor_name,p_payload->>'comment',p_payload->>'evidence',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
  elsif p_operation='create_change' then
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.project_changes(org_id,project_id,data_class,change_code,issue_id,project_name,title,reason,change_type,impact_scope,impact_cost,impact_schedule_days,impact_revenue,impact_collection,status,owner,approver,due_date,decision_summary,created_by,created_by_name,metadata,version,last_idempotency_key)
    values(p_org_id,p_project_id,p_data_class,nullif(p_payload->>'change_code',''),nullif(p_payload->>'issue_id','')::uuid,p_payload->>'project_name',p_payload->>'title',nullif(p_payload->>'reason',''),coalesce(nullif(p_payload->>'change_type',''),'scope'),nullif(p_payload->>'impact_scope',''),nullif(p_payload->>'impact_cost','')::numeric,nullif(p_payload->>'impact_schedule_days','')::integer,nullif(p_payload->>'impact_revenue','')::numeric,nullif(p_payload->>'impact_collection',''),'proposed',nullif(p_payload->>'owner',''),nullif(p_payload->>'approver',''),nullif(p_payload->>'due_date','')::date,nullif(p_payload->>'decision_summary',''),p_actor_user_id,p_actor_name,coalesce(p_payload->'metadata','{}'::jsonb),1,p_idempotency_key)
    returning * into v_change;
    v_result:=jsonb_build_object('status','succeeded','change',to_jsonb(v_change));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,to_status,actor_id,actor_name,comment,metadata)
    values(p_org_id,p_project_id,p_data_class,'change',v_change.id::text,'change_created',v_change.status,p_actor_user_id,p_actor_name,p_payload->>'comment',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
    for v_item in select value from jsonb_array_elements(coalesce(p_payload->'action_items','[]'::jsonb)) loop
      insert into public.unified_action_items(org_id,project_id,data_class,subject_scope,subject_id,source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,version,idempotency_key,last_idempotency_key)
      values(p_org_id,p_project_id,p_data_class,'project',p_project_id::text,'change',v_change.id::text,v_change.project_name,v_item->>'title',nullif(v_item->>'owner',''),nullif(v_item->>'dueDate','')::date,'open',coalesce(nullif(v_item->>'priority',''),'P1'),p_actor_user_id,p_actor_name,jsonb_build_object('parent_operation',p_operation),1,p_idempotency_key||':action:'||gen_random_uuid()::text,p_idempotency_key)
      returning id into v_id;
      v_action_ids:=v_action_ids||to_jsonb(v_id);
      insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,to_status,actor_id,actor_name,metadata)
      values(p_org_id,p_project_id,p_data_class,'action',v_id::text,'action_created','open',p_actor_user_id,p_actor_name,jsonb_build_object('parent_type','change','parent_id',v_change.id,'request_id',p_request_id));
    end loop;
    v_result:=v_result||jsonb_build_object('action_ids',v_action_ids);
  elsif p_operation='transition_change' then
    select * into v_change from public.project_changes where id=(p_payload->>'id')::uuid and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
    if not found then raise exception 'CHANGE_NOT_FOUND'; end if;
    if v_change.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    v_from:=v_change.status; v_to:=p_payload->>'new_status';
    if not ((v_from='proposed' and v_to='analyzing') or (v_from='analyzing' and v_to in ('approved','rejected')) or (v_from='approved' and v_to='implementing') or (v_from='implementing' and v_to='implemented') or (v_from='implemented' and v_to='closed') or (v_from in ('closed','rejected') and v_to='proposed')) then raise exception 'CHANGE_TRANSITION_INVALID'; end if;
    update public.project_changes set status=v_to,decision_summary=coalesce(nullif(p_payload->>'decision_summary',''),decision_summary),metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_payload->'metadata','{}'::jsonb),version=version+1,last_idempotency_key=p_idempotency_key,updated_at=now(),closed_at=case when v_to in ('rejected','closed') then now() else closed_at end where id=v_change.id returning * into v_change;
    v_result:=jsonb_build_object('status','succeeded','change',to_jsonb(v_change));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_id,actor_name,comment,evidence,metadata)
    values(p_org_id,p_project_id,p_data_class,'change',v_change.id::text,'change_transition',v_from,v_to,p_actor_user_id,p_actor_name,p_payload->>'comment',p_payload->>'evidence',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
  elsif p_operation='create_action' then
    if p_expected_version<>0 then raise exception 'VERSION_CONFLICT'; end if;
    insert into public.unified_action_items(org_id,project_id,data_class,subject_scope,subject_id,source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,version,idempotency_key,last_idempotency_key)
    values(p_org_id,p_project_id,p_data_class,'project',p_project_id::text,coalesce(nullif(p_payload->>'source_type',''),'manual'),nullif(p_payload->>'source_id',''),p_payload->>'project_name',p_payload->>'title',nullif(p_payload->>'owner',''),nullif(p_payload->>'due_date','')::date,'open',coalesce(nullif(p_payload->>'priority',''),'P1'),p_actor_user_id,p_actor_name,coalesce(p_payload->'metadata','{}'::jsonb),1,p_idempotency_key,p_idempotency_key)
    returning * into v_action;
    v_result:=jsonb_build_object('status','succeeded','action',to_jsonb(v_action));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,to_status,actor_id,actor_name,comment,metadata)
    values(p_org_id,p_project_id,p_data_class,'action',v_action.id::text,'action_created',v_action.status,p_actor_user_id,p_actor_name,p_payload->>'comment',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
  elsif p_operation='close_action' then
    select * into v_action from public.unified_action_items where id=(p_payload->>'id')::uuid and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
    if not found then raise exception 'ACTION_NOT_FOUND'; end if;
    if v_action.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    v_from:=v_action.status; v_to:=coalesce(nullif(p_payload->>'new_status',''),'done');
    if v_to not in ('done','cancelled','closed') then raise exception 'ACTION_TRANSITION_INVALID'; end if;
    update public.unified_action_items set status=v_to,close_evidence=p_payload->>'close_evidence',version=version+1,last_idempotency_key=p_idempotency_key,updated_at=now(),closed_at=now() where id=v_action.id returning * into v_action;
    v_result:=jsonb_build_object('status','succeeded','action',to_jsonb(v_action));
    insert into public.issue_change_events(org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_id,actor_name,evidence,metadata)
    values(p_org_id,p_project_id,p_data_class,'action',v_action.id::text,'action_closed',v_from,v_to,p_actor_user_id,p_actor_name,p_payload->>'close_evidence',jsonb_build_object('request_id',p_request_id,'idempotency_key',p_idempotency_key));
  else
    raise exception 'PROJECT_CONTROL_OPERATION_INVALID';
  end if;

  update public.project_control_operation_receipts set status='succeeded',result=v_result,completed_at=now(),updated_at=now() where id=v_receipt.id;
  return v_result || jsonb_build_object('replayed',false,'request_id',p_request_id);
end;
$$;

revoke all on function public.apply_project_issue_change_action_tx(uuid,uuid,text,text,text,bigint,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_project_issue_change_action_tx(uuid,uuid,text,text,text,bigint,text,uuid,text,text,jsonb) to service_role;
revoke all on function public.begin_v633_project_control_operation(uuid,uuid,text,text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.finish_v633_project_control_operation(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.begin_v633_project_control_operation(uuid,uuid,text,text,text,text,uuid,text) to service_role;
grant execute on function public.finish_v633_project_control_operation(uuid,text,jsonb,text) to service_role;

commit;
