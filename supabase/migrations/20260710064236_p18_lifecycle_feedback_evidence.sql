-- P18: full lifecycle, human feedback correction, and evidence-gated state transitions.
-- P17 owns identity, scoped roles, management signals and the evidence catalog.

create table if not exists public.evidence_requirements (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  object_type text not null check (object_type in ('project','plan_baseline','deliverable','change','reporting','closure')),
  from_status text not null,
  to_status text not null,
  evidence_type text not null,
  minimum_count integer not null default 1 check (minimum_count > 0),
  verifier_roles jsonb not null default '[]'::jsonb check (jsonb_typeof(verifier_roles) = 'array'),
  validity_days integer check (validity_days is null or validity_days > 0),
  expiry_action text not null default 'block_transition'
    check (expiry_action in ('block_transition','reopen_object','warn')),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_until >= effective_from)
);

create unique index if not exists idx_p18_evidence_requirement_scope
  on public.evidence_requirements(
    coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),
    object_type, from_status, to_status, evidence_type, version
  );

create table if not exists public.project_lifecycle_states (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  object_type text not null check (object_type in ('project','plan_baseline','deliverable','change','reporting','closure')),
  object_id text not null,
  status text not null,
  owner_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz,
  data_class text not null default 'production'
    check (data_class in ('production','sample','test','diagnostic','unclassified')),
  version bigint not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, project_id, object_type, object_id)
);

create table if not exists public.project_lifecycle_events (
  id uuid primary key default uuid_generate_v4(),
  lifecycle_state_id uuid not null references public.project_lifecycle_states(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null
    check (actor_business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  comment text,
  required_evidence_types jsonb not null default '[]'::jsonb check (jsonb_typeof(required_evidence_types) = 'array'),
  accepted_evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(accepted_evidence_ids) = 'array'),
  idempotency_key text not null,
  request_id text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.feedback_correction_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  target_type text not null
    check (target_type in ('management_signal','lifecycle_state','forecast','rule','ai_evaluation','action')),
  target_id text not null,
  correction_type text not null
    check (correction_type in ('false_positive','business_fact_denial','evidence_requested','action_rejected','state_correction')),
  status text not null default 'submitted'
    check (status in ('submitted','correction_in_progress','pending_verification','closed','rejected')),
  reason_code text not null,
  reason_detail text not null,
  proposed_correction jsonb not null check (jsonb_typeof(proposed_correction) = 'object'),
  applied_correction jsonb not null default '{}'::jsonb check (jsonb_typeof(applied_correction) = 'object'),
  correction_owner_user_id uuid not null references public.app_users(id) on delete restrict,
  due_at timestamptz not null,
  resubmission_path text not null,
  submitted_by uuid not null references public.app_users(id) on delete restrict,
  submitted_business_role text not null
    check (submitted_business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  triaged_by uuid references public.app_users(id) on delete set null,
  verified_by uuid references public.app_users(id) on delete set null,
  closed_at timestamptz,
  idempotency_key text not null,
  version bigint not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.feedback_correction_transitions (
  id uuid primary key default uuid_generate_v4(),
  correction_event_id uuid not null references public.feedback_correction_events(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null,
  comment text,
  reason_code text,
  applied_correction jsonb not null default '{}'::jsonb check (jsonb_typeof(applied_correction) = 'object'),
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (correction_event_id, request_id, action)
);

create index if not exists idx_p18_lifecycle_project on public.project_lifecycle_states(project_id, object_type, status);
create index if not exists idx_p18_lifecycle_event_project on public.project_lifecycle_events(project_id, created_at desc);
create index if not exists idx_p18_correction_project on public.feedback_correction_events(project_id, status, due_at);
create index if not exists idx_p18_correction_target on public.feedback_correction_events(target_type, target_id, status);
create index if not exists idx_p18_correction_history on public.feedback_correction_transitions(correction_event_id, created_at);

create or replace function public.enforce_p18_project_org_and_data_class()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_project_org uuid;
  v_project_data_class text;
begin
  select org_id, data_class into v_project_org, v_project_data_class
  from public.projects where id = new.project_id;
  if v_project_org is null then raise exception 'P18_PROJECT_NOT_FOUND'; end if;
  if new.org_id <> v_project_org then raise exception 'P18_ORG_MISMATCH'; end if;
  if tg_table_name = 'project_lifecycle_states' and new.data_class <> v_project_data_class then
    raise exception 'P18_DATA_CLASS_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_p18_lifecycle_scope on public.project_lifecycle_states;
create trigger trg_p18_lifecycle_scope before insert or update on public.project_lifecycle_states
for each row execute function public.enforce_p18_project_org_and_data_class();

drop trigger if exists trg_p18_lifecycle_event_scope on public.project_lifecycle_events;
create trigger trg_p18_lifecycle_event_scope before insert or update on public.project_lifecycle_events
for each row execute function public.enforce_p18_project_org_and_data_class();

drop trigger if exists trg_p18_correction_scope on public.feedback_correction_events;
create trigger trg_p18_correction_scope before insert or update on public.feedback_correction_events
for each row execute function public.enforce_p18_project_org_and_data_class();

create or replace function public.initialize_project_lifecycle_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_idempotency_key text,
  p_request_id text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.project_lifecycle_states;
  v_event public.project_lifecycle_events;
begin
  select * into v_event from public.project_lifecycle_events
  where org_id = p_org_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_state from public.project_lifecycle_states where id = v_event.lifecycle_state_id;
    return jsonb_build_object('state', to_jsonb(v_state), 'event', to_jsonb(v_event));
  end if;

  insert into public.project_lifecycle_states(
    org_id, project_id, object_type, object_id, status, data_class, created_by, updated_by
  ) values (
    p_org_id, p_project_id, 'project', p_project_id::text, 'proposed', p_data_class, p_actor_user_id, p_actor_user_id
  )
  on conflict (org_id, project_id, object_type, object_id) do nothing
  returning * into v_state;

  if v_state.id is null then raise exception 'P18_LIFECYCLE_ALREADY_INITIALIZED'; end if;

  insert into public.project_lifecycle_events(
    lifecycle_state_id, org_id, project_id, object_type, object_id, event_type,
    from_status, to_status, actor_user_id, actor_business_role, comment,
    required_evidence_types, accepted_evidence_ids, idempotency_key, request_id
  ) values (
    v_state.id, p_org_id, p_project_id, 'project', p_project_id::text, 'initialize',
    null, 'proposed', p_actor_user_id, p_actor_business_role, p_comment,
    '[]'::jsonb, '[]'::jsonb, p_idempotency_key, p_request_id
  ) returning * into v_event;

  return jsonb_build_object('state', to_jsonb(v_state), 'event', to_jsonb(v_event));
end;
$$;

create or replace function public.transition_project_lifecycle_tx(
  p_state_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_next_status text,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_required_evidence_types jsonb,
  p_accepted_evidence_ids jsonb,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.project_lifecycle_states;
  v_event public.project_lifecycle_events;
  v_requirement public.evidence_requirements;
  v_valid_count integer;
begin
  select * into v_state from public.project_lifecycle_states where id = p_state_id for update;
  if not found then raise exception 'P18_LIFECYCLE_STATE_NOT_FOUND'; end if;

  select * into v_event from public.project_lifecycle_events
  where org_id = v_state.org_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('state', to_jsonb(v_state), 'event', to_jsonb(v_event));
  end if;
  if v_state.status <> p_expected_status or v_state.version <> p_expected_version then
    raise exception 'P18_LIFECYCLE_CONFLICT:%:%', v_state.status, v_state.version;
  end if;

  for v_requirement in
    select distinct on (evidence_type) * from public.evidence_requirements
    where active = true
      and (org_id is null or org_id = v_state.org_id)
      and object_type = v_state.object_type
      and from_status = p_expected_status
      and to_status = p_next_status
      and effective_from <= now()
      and (effective_until is null or effective_until >= now())
    order by evidence_type, (org_id is not null) desc, version desc
  loop
    select count(*) into v_valid_count
    from public.evidence_links evidence
    where evidence.id in (
      select value::uuid from jsonb_array_elements_text(coalesce(p_accepted_evidence_ids, '[]'::jsonb)) as value
    )
      and evidence.org_id = v_state.org_id
      and evidence.subject_type = 'project'
      and evidence.subject_id = v_state.project_id::text
      and evidence.evidence_type = v_requirement.evidence_type
      and evidence.metadata->>'lifecycle_object_type' = v_state.object_type
      and evidence.metadata->>'lifecycle_object_id' = v_state.object_id
      and evidence.verified_at is not null
      and evidence.verified_by is not null
      and (
        jsonb_array_length(v_requirement.verifier_roles) = 0
        or v_requirement.verifier_roles ? (evidence.metadata->>'verified_business_role')
      )
      and (evidence.valid_until is null or evidence.valid_until >= now());
    if v_valid_count < v_requirement.minimum_count then
      raise exception 'P18_EVIDENCE_GATE_FAILED:%', v_requirement.evidence_type;
    end if;
  end loop;

  update public.project_lifecycle_states set
    status = p_next_status,
    updated_by = p_actor_user_id,
    updated_at = now(),
    version = version + 1
  where id = p_state_id
  returning * into v_state;

  insert into public.project_lifecycle_events(
    lifecycle_state_id, org_id, project_id, object_type, object_id, event_type,
    from_status, to_status, actor_user_id, actor_business_role, comment,
    required_evidence_types, accepted_evidence_ids, idempotency_key, request_id
  ) values (
    v_state.id, v_state.org_id, v_state.project_id, v_state.object_type, v_state.object_id, p_action,
    p_expected_status, p_next_status, p_actor_user_id, p_actor_business_role, p_comment,
    coalesce(p_required_evidence_types, '[]'::jsonb), coalesce(p_accepted_evidence_ids, '[]'::jsonb),
    p_idempotency_key, p_request_id
  ) returning * into v_event;

  return jsonb_build_object('state', to_jsonb(v_state), 'event', to_jsonb(v_event));
end;
$$;

create or replace function public.initialize_lifecycle_object_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_object_type text,
  p_object_id text,
  p_initial_status text,
  p_owner_user_id uuid,
  p_due_at timestamptz,
  p_data_class text,
  p_metadata jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_idempotency_key text,
  p_request_id text,
  p_comment text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state public.project_lifecycle_states;
  v_event public.project_lifecycle_events;
begin
  if p_object_type not in ('plan_baseline','deliverable','change','reporting','closure') then raise exception 'P18_OBJECT_TYPE_INVALID'; end if;
  if nullif(trim(p_object_id),'') is null then raise exception 'P18_OBJECT_ID_REQUIRED'; end if;
  if p_object_type <> 'closure' and (nullif(p_metadata->>'source_type','') is null or nullif(p_metadata->>'source_id','') is null) then raise exception 'P18_STABLE_SOURCE_REQUIRED'; end if;
  select * into v_event from public.project_lifecycle_events where org_id=p_org_id and idempotency_key=p_idempotency_key;
  if found then select * into v_state from public.project_lifecycle_states where id=v_event.lifecycle_state_id; return jsonb_build_object('state',to_jsonb(v_state),'event',to_jsonb(v_event)); end if;
  insert into public.project_lifecycle_states(org_id,project_id,object_type,object_id,status,owner_user_id,due_at,data_class,metadata,created_by,updated_by)
  values (p_org_id,p_project_id,p_object_type,p_object_id,p_initial_status,p_owner_user_id,p_due_at,p_data_class,coalesce(p_metadata,'{}'::jsonb),p_actor_user_id,p_actor_user_id)
  on conflict (org_id,project_id,object_type,object_id) do nothing returning * into v_state;
  if v_state.id is null then raise exception 'P18_LIFECYCLE_OBJECT_ALREADY_INITIALIZED'; end if;
  insert into public.project_lifecycle_events(lifecycle_state_id,org_id,project_id,object_type,object_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,required_evidence_types,accepted_evidence_ids,idempotency_key,request_id)
  values (v_state.id,p_org_id,p_project_id,p_object_type,p_object_id,'initialize',null,p_initial_status,p_actor_user_id,p_actor_business_role,p_comment,'[]'::jsonb,'[]'::jsonb,p_idempotency_key,p_request_id)
  returning * into v_event;
  return jsonb_build_object('state',to_jsonb(v_state),'event',to_jsonb(v_event));
end;
$$;

create or replace function public.transition_feedback_correction_tx(
  p_correction_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_next_status text,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_reason_code text,
  p_applied_correction jsonb,
  p_request_id text
)
returns public.feedback_correction_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correction public.feedback_correction_events;
begin
  if exists (
    select 1 from public.feedback_correction_transitions
    where correction_event_id = p_correction_id and request_id = p_request_id and action = p_action
  ) then
    select * into v_correction from public.feedback_correction_events where id = p_correction_id;
    return v_correction;
  end if;

  select * into v_correction from public.feedback_correction_events where id = p_correction_id for update;
  if not found then raise exception 'P18_CORRECTION_NOT_FOUND'; end if;
  if v_correction.status <> p_expected_status or v_correction.version <> p_expected_version then
    raise exception 'P18_CORRECTION_CONFLICT:%:%', v_correction.status, v_correction.version;
  end if;

  update public.feedback_correction_events set
    status = p_next_status,
    triaged_by = case when p_action in ('accept','reject') then p_actor_user_id else triaged_by end,
    verified_by = case when p_action = 'verify' then p_actor_user_id else verified_by end,
    applied_correction = case when p_action = 'submit_correction' then coalesce(p_applied_correction, '{}'::jsonb) else applied_correction end,
    closed_at = case when p_next_status in ('closed','rejected') then now() else null end,
    updated_at = now(),
    version = version + 1
  where id = p_correction_id
  returning * into v_correction;

  insert into public.feedback_correction_transitions(
    correction_event_id, action, from_status, to_status, actor_user_id,
    actor_business_role, comment, reason_code, applied_correction, request_id
  ) values (
    p_correction_id, p_action, p_expected_status, p_next_status, p_actor_user_id,
    p_actor_business_role, p_comment, p_reason_code, coalesce(p_applied_correction, '{}'::jsonb), p_request_id
  );
  return v_correction;
end;
$$;

insert into public.evidence_requirements(
  org_id, object_type, from_status, to_status, evidence_type, minimum_count,
  verifier_roles, validity_days, expiry_action, version
) values
  (null, 'project', 'proposed', 'approved', 'project_charter', 1, '["pmo","sponsor"]'::jsonb, 365, 'block_transition', 1),
  (null, 'project', 'proposed', 'approved', 'business_case', 1, '["pmo","sponsor"]'::jsonb, 180, 'block_transition', 1),
  (null, 'plan_baseline', 'submitted', 'approved', 'baseline_plan', 1, '["pmo"]'::jsonb, null, 'block_transition', 1),
  (null, 'deliverable', 'submitted', 'accepted', 'acceptance_record', 1, '["operations","business_owner","pmo"]'::jsonb, null, 'reopen_object', 1),
  (null, 'change', 'submitted', 'approved', 'impact_assessment', 1, '["pmo","sponsor"]'::jsonb, 90, 'block_transition', 1),
  (null, 'reporting', 'submitted', 'frozen', 'source_snapshot', 1, '["pmo"]'::jsonb, 45, 'warn', 1),
  (null, 'closure', 'submitted', 'approved', 'closure_report', 1, '["pmo","sponsor"]'::jsonb, null, 'block_transition', 1),
  (null, 'closure', 'submitted', 'approved', 'acceptance_record', 1, '["operations","business_owner","pmo"]'::jsonb, null, 'block_transition', 1),
  (null, 'closure', 'submitted', 'approved', 'financial_confirmation', 1, '["finance","pmo"]'::jsonb, 30, 'block_transition', 1),
  (null, 'closure', 'submitted', 'approved', 'knowledge_handover', 1, '["pmo","quality"]'::jsonb, null, 'block_transition', 1)
on conflict do nothing;

alter table public.evidence_requirements enable row level security;
alter table public.project_lifecycle_states enable row level security;
alter table public.project_lifecycle_events enable row level security;
alter table public.feedback_correction_events enable row level security;
alter table public.feedback_correction_transitions enable row level security;

revoke all on table public.evidence_requirements from anon, authenticated;
revoke all on table public.project_lifecycle_states from anon, authenticated;
revoke all on table public.project_lifecycle_events from anon, authenticated;
revoke all on table public.feedback_correction_events from anon, authenticated;
revoke all on table public.feedback_correction_transitions from anon, authenticated;

grant select, insert, update, delete on table public.evidence_requirements to service_role;
grant select, insert, update, delete on table public.project_lifecycle_states to service_role;
grant select, insert, update, delete on table public.project_lifecycle_events to service_role;
grant select, insert, update, delete on table public.feedback_correction_events to service_role;
grant select, insert, update, delete on table public.feedback_correction_transitions to service_role;
revoke all on function public.initialize_lifecycle_object_tx(uuid,uuid,text,text,text,uuid,timestamptz,text,jsonb,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.initialize_lifecycle_object_tx(uuid,uuid,text,text,text,uuid,timestamptz,text,jsonb,uuid,text,text,text,text) to service_role;

revoke all on function public.initialize_project_lifecycle_tx(uuid,uuid,text,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.transition_project_lifecycle_tx(uuid,text,bigint,text,text,uuid,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.transition_feedback_correction_tx(uuid,text,bigint,text,text,uuid,text,text,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.initialize_project_lifecycle_tx(uuid,uuid,text,uuid,text,text,text,text) to service_role;
grant execute on function public.transition_project_lifecycle_tx(uuid,text,bigint,text,text,uuid,text,text,jsonb,jsonb,text,text) to service_role;
grant execute on function public.transition_feedback_correction_tx(uuid,text,bigint,text,text,uuid,text,text,text,jsonb,text) to service_role;

revoke all on function public.enforce_p18_project_org_and_data_class() from public, anon, authenticated;
