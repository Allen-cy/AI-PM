-- AI-PMO V6.5.0 cross-role execution, Feishu identity boundary, role AI schedules and dynamic knowledge.
-- All objects are service-side only. Domain state and append-only event are written in one transaction.

create table if not exists public.business_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  from_state text,
  to_state text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_business_role text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (org_id,idempotency_key)
);
create index if not exists idx_v650_business_events_scope on public.business_events(org_id,subject_scope,subject_id,data_class,occurred_at desc);
create index if not exists idx_v650_business_events_aggregate on public.business_events(aggregate_type,aggregate_id,occurred_at);

create table if not exists public.cross_role_flows (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  flow_type text not null default 'exception_to_decision' check (flow_type in ('exception_to_decision','cash_exception_to_decision','benefit_exception_to_decision','delivery_exception_to_decision')),
  title text not null,
  summary text not null,
  business_impact text not null,
  source_type text not null,
  source_id text not null,
  status text not null default 'submitted_to_pmo' check (status in ('submitted_to_pmo','pmo_reviewed','report_frozen','decision_submitted','decision_made','action_dispatched','receipt_acknowledged','effect_reviewed','closed','cancelled')),
  pmo_owner_user_id uuid references public.app_users(id) on delete set null,
  decision_owner_user_id uuid references public.app_users(id) on delete set null,
  execution_owner_user_id uuid references public.app_users(id) on delete set null,
  deadline timestamptz not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  reporting_snapshot_id uuid references public.reporting_snapshots(id) on delete set null,
  decision_brief_id uuid references public.decision_briefs(id) on delete set null,
  decision_id uuid references public.decisions(id) on delete set null,
  outcome_summary text,
  version bigint not null default 1,
  idempotency_key text not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,idempotency_key),
  check (jsonb_typeof(evidence_refs)='array')
);
create index if not exists idx_v650_cross_role_flow_inbox on public.cross_role_flows(org_id,data_class,status,deadline);
create index if not exists idx_v650_cross_role_flow_project on public.cross_role_flows(project_id,status,updated_at desc);

create table if not exists public.cross_role_flow_actions (
  id uuid primary key default uuid_generate_v4(),
  flow_id uuid not null references public.cross_role_flows(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  title text not null,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_user_id uuid references public.app_users(id) on delete set null,
  deadline timestamptz not null,
  status text not null default 'dispatched' check (status in ('dispatched','acknowledged','completed','effect_verified','cancelled')),
  acceptance_criteria text not null,
  receipt_summary text,
  effect_summary text,
  evidence_refs jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(evidence_refs)='array')
);
create index if not exists idx_v650_cross_role_actions_owner on public.cross_role_flow_actions(owner_user_id,status,deadline);

create table if not exists public.role_ai_scan_schedules (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo')),
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  scenario text not null default 'daily_exception_scan',
  schedule text not null default 'daily',
  confidence_threshold numeric(5,4) not null default 0.6500 check (confidence_threshold between 0 and 1),
  status text not null default 'active' check (status in ('active','paused','disabled')),
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_run_id uuid references public.ai_assistant_runs(id) on delete set null,
  last_status text,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_user_id,business_role,org_id,subject_scope,subject_id,data_class,scenario)
);
create index if not exists idx_v650_role_ai_due on public.role_ai_scan_schedules(status,next_run_at);

alter table public.ai_recommendations add column if not exists confidence numeric(5,4) check (confidence is null or confidence between 0 and 1);
alter table public.ai_recommendations add column if not exists evidence_refs jsonb not null default '[]'::jsonb;
alter table public.ai_recommendations add column if not exists effect_status text not null default 'not_evaluated' check (effect_status in ('not_evaluated','pending','achieved','partially_achieved','not_achieved'));
alter table public.ai_recommendations add column if not exists effect_summary text;
alter table public.ai_recommendations add column if not exists effect_evaluated_by uuid references public.app_users(id) on delete set null;
alter table public.ai_recommendations add column if not exists effect_evaluated_at timestamptz;

create table if not exists public.organization_feishu_connections (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  app_id text,
  app_secret_encrypted text,
  app_secret_key_version integer,
  base_token_encrypted text,
  base_token_key_version integer,
  table_mapping jsonb not null default '{}'::jsonb,
  status text not null default 'configured' check (status in ('configured','disabled','invalid')),
  last_verified_at timestamptz,
  last_error_code text,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.prevent_v650_business_event_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'V650_BUSINESS_EVENTS_APPEND_ONLY';
end;
$$;
drop trigger if exists trg_v650_business_events_append_only on public.business_events;
create trigger trg_v650_business_events_append_only before update or delete on public.business_events
for each row execute function public.prevent_v650_business_event_mutation();

create or replace function public.create_v650_cross_role_flow_tx(
  p_org_id uuid, p_subject_scope text, p_subject_id text, p_project_id uuid, p_data_class text,
  p_flow_type text, p_title text, p_summary text, p_business_impact text, p_source_type text, p_source_id text,
  p_pmo_owner_user_id uuid, p_deadline timestamptz, p_evidence_refs jsonb,
  p_actor_user_id uuid, p_actor_business_role text, p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_flow public.cross_role_flows%rowtype; v_existing public.cross_role_flows%rowtype;
begin
  if p_actor_business_role not in ('pm','operations','business_owner','finance','quality') then raise exception 'V650_SUBMIT_ROLE_FORBIDDEN'; end if;
  if p_subject_scope not in ('project','portfolio','organization') or nullif(trim(p_subject_id),'') is null then raise exception 'V650_SCOPE_REQUIRED'; end if;
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'V650_DATA_CLASS_INVALID'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_summary),'') is null or nullif(trim(p_business_impact),'') is null or nullif(trim(p_source_type),'') is null or nullif(trim(p_source_id),'') is null or nullif(trim(p_idempotency_key),'') is null then raise exception 'V650_INPUT_REQUIRED'; end if;
  if p_deadline is null or p_deadline<=now() then raise exception 'V650_FUTURE_DEADLINE_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_evidence_refs,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence_refs,'[]'::jsonb))=0 then raise exception 'V650_EVIDENCE_REQUIRED'; end if;
  if p_project_id is not null and not exists(select 1 from public.projects p where p.id=p_project_id and p.org_id=p_org_id and p.data_class=p_data_class) then raise exception 'V650_PROJECT_SCOPE_MISMATCH'; end if;
  select * into v_existing from public.cross_role_flows where org_id=p_org_id and idempotency_key=p_idempotency_key;
  if found then return to_jsonb(v_existing); end if;
  insert into public.cross_role_flows(org_id,subject_scope,subject_id,project_id,data_class,flow_type,title,summary,business_impact,source_type,source_id,pmo_owner_user_id,deadline,evidence_refs,idempotency_key,created_by,updated_by)
  values(p_org_id,p_subject_scope,p_subject_id,p_project_id,p_data_class,p_flow_type,trim(p_title),trim(p_summary),trim(p_business_impact),trim(p_source_type),trim(p_source_id),p_pmo_owner_user_id,p_deadline,p_evidence_refs,trim(p_idempotency_key),p_actor_user_id,p_actor_user_id)
  returning * into v_flow;
  insert into public.business_events(org_id,subject_scope,subject_id,project_id,data_class,aggregate_type,aggregate_id,event_type,to_state,actor_user_id,actor_business_role,evidence_refs,payload,idempotency_key)
  values(p_org_id,p_subject_scope,p_subject_id,p_project_id,p_data_class,'cross_role_flow',v_flow.id,'flow_submitted','submitted_to_pmo',p_actor_user_id,p_actor_business_role,p_evidence_refs,jsonb_build_object('title',v_flow.title,'deadline',v_flow.deadline),p_idempotency_key||':event');
  return to_jsonb(v_flow);
end;
$$;

create or replace function public.transition_v650_cross_role_flow_tx(
  p_flow_id uuid, p_org_id uuid, p_subject_scope text, p_subject_id text, p_data_class text,
  p_operation text, p_expected_version bigint, p_actor_user_id uuid, p_actor_business_role text,
  p_output_summary text, p_evidence_refs jsonb, p_reporting_snapshot_id uuid, p_decision_brief_id uuid, p_decision_id uuid,
  p_action_title text, p_action_owner_user_id uuid, p_action_deadline timestamptz, p_acceptance_criteria text,
  p_idempotency_key text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_flow public.cross_role_flows%rowtype; v_from text; v_to text; v_action_id uuid; v_existing public.business_events%rowtype;
begin
  select * into v_existing from public.business_events where org_id=p_org_id and idempotency_key=p_idempotency_key;
  if found then select * into v_flow from public.cross_role_flows where id=p_flow_id; return jsonb_build_object('flow',to_jsonb(v_flow),'duplicate',true); end if;
  select * into v_flow from public.cross_role_flows where id=p_flow_id for update;
  if not found then raise exception 'V650_FLOW_NOT_FOUND'; end if;
  if v_flow.org_id<>p_org_id or v_flow.subject_scope<>p_subject_scope or v_flow.subject_id<>p_subject_id or v_flow.data_class<>p_data_class then raise exception 'V650_SCOPE_MISMATCH'; end if;
  if v_flow.version<>p_expected_version then raise exception 'V650_VERSION_CONFLICT'; end if;
  v_from:=v_flow.status;
  if p_operation='pmo_review' and v_from='submitted_to_pmo' and p_actor_business_role='pmo' then v_to:='pmo_reviewed';
  elsif p_operation='freeze_report' and v_from='pmo_reviewed' and p_actor_business_role='pmo' then v_to:='report_frozen';
  elsif p_operation='submit_decision' and v_from='report_frozen' and p_actor_business_role='pmo' then v_to:='decision_submitted';
  elsif p_operation='record_decision' and v_from='decision_submitted' and p_actor_business_role in ('ceo','sponsor') then v_to:='decision_made';
  elsif p_operation='dispatch_action' and v_from='decision_made' and p_actor_business_role in ('pmo','ceo','sponsor') then v_to:='action_dispatched';
  elsif p_operation='acknowledge_receipt' and v_from='action_dispatched' and p_actor_business_role in ('pm','operations','business_owner','finance','quality') then v_to:='receipt_acknowledged';
  elsif p_operation='review_effect' and v_from='receipt_acknowledged' and p_actor_business_role='pmo' then v_to:='effect_reviewed';
  elsif p_operation='close' and v_from='effect_reviewed' and p_actor_business_role in ('pmo','ceo','sponsor') then v_to:='closed';
  elsif p_operation='cancel' and v_from in ('submitted_to_pmo','pmo_reviewed','report_frozen','decision_submitted') and p_actor_business_role in ('pmo','ceo','sponsor') then v_to:='cancelled';
  else raise exception 'V650_TRANSITION_FORBIDDEN'; end if;
  if p_operation in ('pmo_review','acknowledge_receipt','review_effect','close','cancel') and nullif(trim(coalesce(p_output_summary,'')),'') is null then raise exception 'V650_OUTPUT_REQUIRED'; end if;
  if p_operation in ('pmo_review','acknowledge_receipt','review_effect','close') and (jsonb_typeof(coalesce(p_evidence_refs,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence_refs,'[]'::jsonb))=0) then raise exception 'V650_EVIDENCE_REQUIRED'; end if;
  if p_operation='freeze_report' then
    if p_reporting_snapshot_id is null or not exists(select 1 from public.reporting_snapshots s where s.id=p_reporting_snapshot_id and s.org_id=p_org_id and s.subject_scope=p_subject_scope and s.subject_id=p_subject_id and s.data_class=p_data_class and s.status in ('submitted','accepted')) then raise exception 'V650_FROZEN_REPORT_REQUIRED'; end if;
  elsif p_operation='submit_decision' then
    if p_decision_brief_id is null or not exists(select 1 from public.decision_briefs b where b.id=p_decision_brief_id and b.org_id=p_org_id and b.subject_scope=p_subject_scope and b.subject_id=p_subject_id and b.data_class=p_data_class and b.status='submitted') then raise exception 'V650_DECISION_BRIEF_REQUIRED'; end if;
  elsif p_operation='record_decision' then
    if p_decision_id is null or not exists(select 1 from public.decisions d join public.decision_briefs b on b.id=d.brief_id where d.id=p_decision_id and b.id=v_flow.decision_brief_id and d.org_id=p_org_id) then raise exception 'V650_DECISION_REQUIRED'; end if;
  elsif p_operation='dispatch_action' then
    if nullif(trim(coalesce(p_action_title,'')),'') is null or p_action_owner_user_id is null or p_action_deadline is null or p_action_deadline<=now() or nullif(trim(coalesce(p_acceptance_criteria,'')),'') is null then raise exception 'V650_ACTION_INPUT_REQUIRED'; end if;
    insert into public.cross_role_flow_actions(flow_id,org_id,project_id,data_class,title,owner_user_id,reviewer_user_id,deadline,acceptance_criteria,created_by,updated_by)
    values(v_flow.id,p_org_id,v_flow.project_id,p_data_class,trim(p_action_title),p_action_owner_user_id,p_actor_user_id,p_action_deadline,trim(p_acceptance_criteria),p_actor_user_id,p_actor_user_id) returning id into v_action_id;
  elsif p_operation='acknowledge_receipt' then
    update public.cross_role_flow_actions set status='acknowledged',receipt_summary=trim(p_output_summary),evidence_refs=p_evidence_refs,version=version+1,updated_by=p_actor_user_id,updated_at=now() where flow_id=v_flow.id and owner_user_id=p_actor_user_id and status='dispatched';
    if not found then raise exception 'V650_ASSIGNED_ACTION_REQUIRED'; end if;
  elsif p_operation='review_effect' then
    update public.cross_role_flow_actions set status='effect_verified',effect_summary=trim(p_output_summary),evidence_refs=evidence_refs||p_evidence_refs,version=version+1,reviewer_user_id=p_actor_user_id,updated_by=p_actor_user_id,updated_at=now() where flow_id=v_flow.id and status in ('acknowledged','completed');
    if not found then raise exception 'V650_RECEIPT_REQUIRED'; end if;
  end if;
  update public.cross_role_flows set status=v_to,version=version+1,updated_by=p_actor_user_id,updated_at=now(),
    evidence_refs=case when jsonb_typeof(coalesce(p_evidence_refs,'[]'::jsonb))='array' then evidence_refs||p_evidence_refs else evidence_refs end,
    reporting_snapshot_id=coalesce(p_reporting_snapshot_id,reporting_snapshot_id),decision_brief_id=coalesce(p_decision_brief_id,decision_brief_id),decision_id=coalesce(p_decision_id,decision_id),
    execution_owner_user_id=coalesce(p_action_owner_user_id,execution_owner_user_id),decision_owner_user_id=case when p_operation='record_decision' then p_actor_user_id else decision_owner_user_id end,
    outcome_summary=case when p_operation in ('review_effect','close','cancel') then trim(p_output_summary) else outcome_summary end
    where id=v_flow.id returning * into v_flow;
  insert into public.business_events(org_id,subject_scope,subject_id,project_id,data_class,aggregate_type,aggregate_id,event_type,from_state,to_state,actor_user_id,actor_business_role,evidence_refs,payload,idempotency_key)
  values(p_org_id,p_subject_scope,p_subject_id,v_flow.project_id,p_data_class,'cross_role_flow',v_flow.id,p_operation,v_from,v_to,p_actor_user_id,p_actor_business_role,coalesce(p_evidence_refs,'[]'::jsonb),jsonb_strip_nulls(jsonb_build_object('output_summary',p_output_summary,'reporting_snapshot_id',p_reporting_snapshot_id,'decision_brief_id',p_decision_brief_id,'decision_id',p_decision_id,'action_id',v_action_id)),p_idempotency_key);
  return jsonb_build_object('flow',to_jsonb(v_flow),'action_id',v_action_id,'duplicate',false);
end;
$$;

alter table public.business_events enable row level security;
alter table public.cross_role_flows enable row level security;
alter table public.cross_role_flow_actions enable row level security;
alter table public.role_ai_scan_schedules enable row level security;
alter table public.organization_feishu_connections enable row level security;
revoke all on table public.business_events, public.cross_role_flows, public.cross_role_flow_actions, public.role_ai_scan_schedules, public.organization_feishu_connections from public, anon, authenticated;
grant select,insert on table public.business_events to service_role;
grant select,insert,update,delete on table public.cross_role_flows, public.cross_role_flow_actions, public.role_ai_scan_schedules, public.organization_feishu_connections to service_role;
revoke all on function public.create_v650_cross_role_flow_tx(uuid,text,text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_v650_cross_role_flow_tx(uuid,uuid,text,text,text,text,bigint,uuid,text,text,jsonb,uuid,uuid,uuid,text,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.create_v650_cross_role_flow_tx(uuid,text,text,uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,uuid,text,text) to service_role;
grant execute on function public.transition_v650_cross_role_flow_tx(uuid,uuid,text,text,text,text,bigint,uuid,text,text,jsonb,uuid,uuid,uuid,text,uuid,timestamptz,text,text) to service_role;
