-- AI PM System V6.0 P19 PM/Operations joint checks and operating calendar.

create table if not exists public.business_joint_check_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  snapshot_at timestamptz not null,
  source_definition jsonb not null,
  data_gaps jsonb not null default '[]'::jsonb,
  status text not null default 'completed' check (status in ('running','completed','failed')),
  triggered_by uuid not null references public.app_users(id) on delete restrict,
  triggered_business_role text not null check (triggered_business_role in ('pm','operations')),
  request_id text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.business_joint_check_items (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.business_joint_check_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  check_type text not null check (check_type in ('delivery_acceptance_gap','acceptance_billing_gap','delay_cash_impact')),
  severity text not null check (severity in ('medium','high','critical')),
  title text not null,
  finding text not null,
  fact_references jsonb not null check (jsonb_typeof(fact_references)='array'),
  suggested_action text not null,
  owner_business_role text not null check (owner_business_role in ('pm','operations')),
  reviewer_business_role text not null default 'pmo',
  owner_user_id uuid references public.app_users(id) on delete set null,
  reviewer_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'detected' check (status in ('detected','confirmed','dismissed','action_created','closed','reopened')),
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  closure_evidence jsonb not null default '[]'::jsonb,
  resolution_note text,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,project_id,check_type)
);

create table if not exists public.business_operating_cadences (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  business_role text not null check (business_role in ('pm','operations')),
  name text not null,
  cadence_type text not null check (cadence_type in ('daily','weekly','monthly','event')),
  timezone text not null default 'Asia/Shanghai',
  day_of_week integer check (day_of_week is null or day_of_week between 0 and 6),
  day_of_month integer check (day_of_month is null or day_of_month between 1 and 31),
  event_key text,
  due_after_minutes integer not null default 480 check (due_after_minutes > 0),
  required_inputs jsonb not null default '[]'::jsonb,
  required_outputs jsonb not null default '[]'::jsonb,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  status text not null default 'active' check (status in ('draft','active','paused','retired')),
  version integer not null default 1,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((cadence_type='weekly')=(day_of_week is not null) or cadence_type<>'weekly'),
  check ((cadence_type='monthly')=(day_of_month is not null) or cadence_type<>'monthly'),
  check ((cadence_type='event')=(event_key is not null) or cadence_type<>'event'),
  unique (org_id,subject_scope,subject_id,business_role,name,version)
);

create table if not exists public.business_operating_occurrences (
  id uuid primary key default uuid_generate_v4(),
  cadence_id uuid not null references public.business_operating_cadences(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null,
  subject_id text not null,
  business_role text not null,
  scheduled_at timestamptz not null,
  due_at timestamptz not null,
  trigger_type text not null,
  trigger_source_id text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','evidence_submitted','closed','overdue','cancelled')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_summary text,
  action_item_ids jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cadence_id,scheduled_at,trigger_source_id)
);

create index if not exists idx_p19_joint_check_scope on public.business_joint_check_items(org_id,project_id,status,severity,updated_at desc);
create index if not exists idx_p19_cadence_active on public.business_operating_cadences(org_id,status,cadence_type);
create index if not exists idx_p19_occurrence_owner on public.business_operating_occurrences(owner_user_id,status,due_at);

create or replace function public.transition_business_joint_check_tx(
  p_item_id uuid,p_expected_status text,p_expected_version bigint,p_action text,
  p_actor_user_id uuid,p_actor_business_role text,p_owner_user_id uuid,p_reviewer_user_id uuid,
  p_due_at timestamptz,p_comment text,p_evidence jsonb,p_request_id text
)
returns public.business_joint_check_items
language plpgsql security definer set search_path=public
as $$
declare v_item public.business_joint_check_items; v_next text; v_action_id uuid;
begin
  select * into v_item from public.business_joint_check_items where id=p_item_id for update;
  if not found then raise exception 'P19_JOINT_CHECK_NOT_FOUND'; end if;
  if v_item.status<>p_expected_status or v_item.version<>p_expected_version then raise exception 'P19_JOINT_CHECK_CONFLICT'; end if;
  v_next:=case
    when p_expected_status in ('detected','reopened') and p_action='confirm' then 'confirmed'
    when p_expected_status in ('detected','reopened') and p_action='dismiss' then 'dismissed'
    when p_expected_status='confirmed' and p_action='create_action' then 'action_created'
    when p_expected_status='action_created' and p_action='close' then 'closed'
    when p_expected_status in ('dismissed','closed') and p_action='reopen' then 'reopened'
    else null end;
  if v_next is null then raise exception 'P19_JOINT_CHECK_TRANSITION_FORBIDDEN'; end if;
  if p_action in ('confirm','dismiss') and p_actor_business_role not in ('pm','operations','pmo') then raise exception 'P19_JOINT_CHECK_CONFIRM_ROLE_REQUIRED'; end if;
  if p_action='dismiss' and nullif(trim(p_comment),'') is null then raise exception 'P19_JOINT_CHECK_DISMISS_REASON_REQUIRED'; end if;
  if p_action='create_action' then
    if p_owner_user_id is null or p_reviewer_user_id is null or p_due_at is null then raise exception 'P19_JOINT_CHECK_ACTION_ASSIGNMENT_REQUIRED'; end if;
    insert into public.unified_action_items(source_type,source_id,project_name,title,owner,due_date,status,priority,metadata,org_id,subject_scope,subject_id,project_id,owner_user_id,reviewer_user_id,acceptance_criteria,idempotency_key,created_by,created_by_name)
    select 'manual',v_item.id::text,project.name,v_item.title,null,p_due_at::date,'assigned',case when v_item.severity='critical' then 'P0' when v_item.severity='high' then 'P1' else 'P2' end,jsonb_build_object('joint_check_item_id',v_item.id,'finding',v_item.finding),v_item.org_id,'project',v_item.project_id::text,v_item.project_id,p_owner_user_id,p_reviewer_user_id,v_item.suggested_action,'joint-check:'||v_item.id,p_actor_user_id,'P19联合检查'
    from public.projects project where project.id=v_item.project_id
    on conflict (idempotency_key) where idempotency_key is not null do update set updated_at=now()
    returning id into v_action_id;
  elsif p_action='close' then
    if v_item.action_item_id is null or not exists(select 1 from public.unified_action_items where id=v_item.action_item_id and status in ('done','closed')) then raise exception 'P19_JOINT_CHECK_ACTION_NOT_CLOSED'; end if;
    if p_evidence is null or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0 then raise exception 'P19_JOINT_CHECK_CLOSURE_EVIDENCE_REQUIRED'; end if;
  end if;
  update public.business_joint_check_items set status=v_next,
    owner_user_id=case when p_action='create_action' then p_owner_user_id else owner_user_id end,
    reviewer_user_id=case when p_action='create_action' then p_reviewer_user_id else reviewer_user_id end,
    due_at=case when p_action='create_action' then p_due_at else due_at end,
    action_item_id=coalesce(v_action_id,action_item_id),
    closure_evidence=case when p_action='close' then p_evidence else closure_evidence end,
    resolution_note=case when p_action in ('dismiss','close') then p_comment else resolution_note end,
    version=version+1,updated_at=now()
  where id=p_item_id returning * into v_item;
  return v_item;
end; $$;

create or replace function public.materialize_business_operating_calendar_tx(
  p_org_id uuid,p_business_date date,p_data_class text,p_event_key text default null,p_event_source_id text default ''
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_definition public.business_operating_cadences; v_created integer:=0; v_scheduled timestamptz;
begin
  for v_definition in select * from public.business_operating_cadences where org_id=p_org_id and status='active' and (
    cadence_type='daily'
    or (cadence_type='weekly' and day_of_week=extract(dow from p_business_date)::integer)
    or (cadence_type='monthly' and day_of_month=extract(day from p_business_date)::integer)
    or (cadence_type='event' and event_key=p_event_key)
  ) loop
    v_scheduled:=(p_business_date::text||' 09:00:00 Asia/Shanghai')::timestamptz;
    insert into public.business_operating_occurrences(cadence_id,org_id,subject_scope,subject_id,business_role,scheduled_at,due_at,trigger_type,trigger_source_id,status,owner_user_id,data_class)
    values(v_definition.id,v_definition.org_id,v_definition.subject_scope,v_definition.subject_id,v_definition.business_role,v_scheduled,v_scheduled+make_interval(mins=>v_definition.due_after_minutes),v_definition.cadence_type,case when v_definition.cadence_type='event' then coalesce(p_event_source_id,'') else '' end,'scheduled',v_definition.owner_user_id,p_data_class)
    on conflict (cadence_id,scheduled_at,trigger_source_id) do nothing;
    if found then v_created:=v_created+1; end if;
  end loop;
  return jsonb_build_object('created',v_created,'business_date',p_business_date,'event_key',p_event_key);
end; $$;

create or replace function public.transition_business_operating_occurrence_tx(
  p_occurrence_id uuid,p_expected_status text,p_action text,p_actor_user_id uuid,
  p_output_summary text,p_evidence jsonb,p_action_item_ids jsonb
)
returns public.business_operating_occurrences
language plpgsql security definer set search_path=public
as $$
declare v_occurrence public.business_operating_occurrences; v_next text;
begin
  select * into v_occurrence from public.business_operating_occurrences where id=p_occurrence_id for update;
  if not found then raise exception 'P19_OCCURRENCE_NOT_FOUND'; end if;
  if v_occurrence.status<>p_expected_status then raise exception 'P19_OCCURRENCE_CONFLICT'; end if;
  if v_occurrence.owner_user_id<>p_actor_user_id then raise exception 'P19_OCCURRENCE_OWNER_REQUIRED'; end if;
  v_next:=case when p_expected_status in ('scheduled','overdue') and p_action='start' then 'in_progress' when p_expected_status='in_progress' and p_action='submit_evidence' then 'evidence_submitted' when p_expected_status='evidence_submitted' and p_action='close' then 'closed' when p_action='cancel' and p_expected_status in ('scheduled','in_progress') then 'cancelled' else null end;
  if v_next is null then raise exception 'P19_OCCURRENCE_TRANSITION_FORBIDDEN'; end if;
  if p_action='submit_evidence' and (nullif(trim(p_output_summary),'') is null or p_evidence is null or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0) then raise exception 'P19_OCCURRENCE_OUTPUT_AND_EVIDENCE_REQUIRED'; end if;
  update public.business_operating_occurrences set status=v_next,
    output_summary=case when p_action='submit_evidence' then p_output_summary else output_summary end,
    evidence=case when p_action='submit_evidence' then p_evidence else evidence end,
    action_item_ids=case when p_action='submit_evidence' then coalesce(p_action_item_ids,'[]'::jsonb) else action_item_ids end,
    completed_at=case when v_next='closed' then now() else completed_at end,updated_at=now()
  where id=p_occurrence_id returning * into v_occurrence;
  return v_occurrence;
end; $$;

alter table public.business_joint_check_runs enable row level security;
alter table public.business_joint_check_items enable row level security;
alter table public.business_operating_cadences enable row level security;
alter table public.business_operating_occurrences enable row level security;
revoke all on table public.business_joint_check_runs,public.business_joint_check_items,public.business_operating_cadences,public.business_operating_occurrences from public,anon,authenticated;
grant select,insert,update,delete on table public.business_joint_check_runs,public.business_joint_check_items,public.business_operating_cadences,public.business_operating_occurrences to service_role;
revoke all on function public.transition_business_joint_check_tx(uuid,text,bigint,text,uuid,text,uuid,uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.materialize_business_operating_calendar_tx(uuid,date,text,text,text) from public,anon,authenticated;
revoke all on function public.transition_business_operating_occurrence_tx(uuid,text,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.transition_business_joint_check_tx(uuid,text,bigint,text,uuid,text,uuid,uuid,timestamptz,text,jsonb,text) to service_role;
grant execute on function public.materialize_business_operating_calendar_tx(uuid,date,text,text,text) to service_role;
grant execute on function public.transition_business_operating_occurrence_tx(uuid,text,text,uuid,text,jsonb,jsonb) to service_role;
