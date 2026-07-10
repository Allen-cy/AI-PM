-- P25: five golden-chain acceptance runs with human execution, independent verification and evidence.
-- Supabase CLI is not installed in this workspace; this migration was created manually and must be
-- applied after 20260710110000_p25_operations_center.sql and the P17/P18 operating-contract migration.

create table if not exists public.golden_chain_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  chain_key text not null check (chain_key in ('A','B','C','D','E')),
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  status text not null default 'draft' check (status in ('draft','ready','running','verification','passed','failed','blocked','cancelled')),
  source_snapshot_at timestamptz,
  idempotency_key text not null,
  request_fingerprint text not null,
  prepared_by uuid references public.app_users(id) on delete set null,
  prepared_at timestamptz,
  started_by uuid references public.app_users(id) on delete set null,
  started_at timestamptz,
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_at timestamptz,
  failure_reason text,
  blocked_reason text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (org_id,idempotency_key),
  unique (id,org_id,project_id,data_class)
);

create table if not exists public.golden_chain_run_participants (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  user_id uuid not null references public.app_users(id) on delete restrict,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  assignment_id uuid not null references public.user_business_roles(id) on delete restrict,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id,business_role),
  unique (run_id,user_id,business_role),
  foreign key (run_id,org_id,project_id,data_class)
    references public.golden_chain_runs(id,org_id,project_id,data_class) on delete cascade
);

create table if not exists public.golden_chain_steps (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  step_key text not null,
  sequence_no integer not null check (sequence_no > 0),
  label text not null,
  actor_roles text[] not null check (cardinality(actor_roles) > 0),
  required_artifact_types text[] not null check (cardinality(required_artifact_types) > 0),
  status text not null default 'pending' check (status in ('pending','in_progress','submitted','verified','failed')),
  artifact_references jsonb not null default '[]'::jsonb check (jsonb_typeof(artifact_references) = 'array'),
  started_by uuid references public.app_users(id) on delete set null,
  started_business_role text,
  started_at timestamptz,
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_business_role text,
  submitted_at timestamptz,
  verified_by uuid references public.app_users(id) on delete set null,
  verifier_business_role text,
  verified_at timestamptz,
  verification_comment text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (run_id,step_key),
  unique (id,run_id),
  foreign key (run_id,org_id,project_id,data_class)
    references public.golden_chain_runs(id,org_id,project_id,data_class) on delete cascade
);

create table if not exists public.golden_chain_failure_paths (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  path_key text not null,
  label text not null,
  status text not null default 'pending' check (status in ('pending','submitted','passed','failed')),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_business_role text,
  submitted_at timestamptz,
  verified_by uuid references public.app_users(id) on delete set null,
  verifier_business_role text,
  verified_at timestamptz,
  verification_comment text,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (run_id,path_key),
  unique (id,run_id),
  foreign key (run_id,org_id,project_id,data_class)
    references public.golden_chain_runs(id,org_id,project_id,data_class) on delete cascade
);

create table if not exists public.golden_chain_events (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  subject_type text not null check (subject_type in ('run','step','failure_path')),
  subject_id text not null,
  event_type text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null,
  reason text,
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (run_id,subject_type,subject_id,event_type,request_id),
  foreign key (run_id,org_id,project_id,data_class)
    references public.golden_chain_runs(id,org_id,project_id,data_class) on delete cascade
);

create index if not exists idx_golden_chain_runs_scope
  on public.golden_chain_runs(org_id,project_id,data_class,status,updated_at desc);
create index if not exists idx_golden_chain_participants_user
  on public.golden_chain_run_participants(user_id,org_id,project_id,data_class);
create index if not exists idx_golden_chain_steps_run
  on public.golden_chain_steps(run_id,sequence_no,status);
create index if not exists idx_golden_chain_failure_paths_run
  on public.golden_chain_failure_paths(run_id,status);
create index if not exists idx_golden_chain_events_run
  on public.golden_chain_events(run_id,created_at desc);

create or replace function public.golden_chain_assignment_covers_project(
  p_assignment_id uuid,
  p_user_id uuid,
  p_business_role text,
  p_org_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_business_roles assignment
    where assignment.id = p_assignment_id
      and assignment.user_id = p_user_id
      and assignment.business_role = p_business_role
      and assignment.org_id = p_org_id
      and assignment.status = 'active'
      and assignment.valid_from <= now()
      and (assignment.valid_until is null or assignment.valid_until >= now())
      and (
        (assignment.subject_scope = 'organization' and assignment.subject_id = p_org_id::text)
        or (assignment.subject_scope = 'project' and assignment.subject_id = p_project_id::text)
        or (assignment.subject_scope = 'portfolio' and exists (
          select 1 from public.portfolio_project_links link
          where link.org_id = p_org_id
            and link.portfolio_id::text = assignment.subject_id
            and link.project_id = p_project_id
        ))
        or (assignment.subject_scope in ('customer','contract') and exists (
          select 1 from public.business_subject_links link
          where link.org_id = p_org_id
            and link.source_type = assignment.subject_scope
            and link.source_id = assignment.subject_id
            and link.target_type = 'project'
            and link.target_id = p_project_id::text
        ))
      )
  );
$$;

create or replace function public.golden_chain_artifact_references_valid(
  p_references jsonb,
  p_data_class text
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(p_references) <> 'array' or jsonb_array_length(p_references) = 0 then
    return false;
  end if;
  if lower(p_references::text) ~ '"(secret|token|password|api.?key|credential)"[[:space:]]*:' then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(p_references) reference
    where jsonb_typeof(reference) <> 'object'
      or coalesce(reference->>'objectType','') = ''
      or coalesce(reference->>'objectId','') = ''
      or coalesce(reference->>'sourceType','') not in ('supabase','feishu','obsidian','external')
      or coalesce(reference->>'dataClass','') <> p_data_class
      or coalesce(reference->>'verifiedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  );
end;
$$;

create or replace function public.golden_chain_artifacts_exist(
  p_references jsonb,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_reference jsonb;
  v_type text;
  v_id uuid;
  v_exists boolean;
begin
  if not public.golden_chain_artifact_references_valid(p_references,p_data_class) then return false; end if;
  for v_reference in select value from jsonb_array_elements(p_references) loop
    if coalesce(v_reference->>'objectId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
    v_type:=v_reference->>'objectType';v_id:=(v_reference->>'objectId')::uuid;v_exists:=false;
    case v_type
      when 'project_fact_snapshot' then select exists(select 1 from public.reporting_snapshots where id=v_id and org_id=p_org_id and subject_scope='project' and subject_id=p_project_id::text and data_class=p_data_class) into v_exists;
      when 'metric_observation' then select exists(select 1 from public.metric_observations where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'lifecycle_state' then select exists(select 1 from public.project_lifecycle_states where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'lifecycle_event' then select exists(select 1 from public.project_lifecycle_events event join public.project_lifecycle_states state on state.id=event.lifecycle_state_id where event.id=v_id and event.org_id=p_org_id and event.project_id=p_project_id and state.data_class=p_data_class) into v_exists;
      when 'management_signal' then select exists(select 1 from public.management_signals where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'business_forecast' then select exists(select 1 from public.business_forecast_versions where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'object_impact_package' then select exists(select 1 from public.object_impact_packages where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'reporting_snapshot' then select exists(select 1 from public.reporting_snapshots where id=v_id and org_id=p_org_id and subject_scope='project' and subject_id=p_project_id::text and data_class=p_data_class) into v_exists;
      when 'decision_brief' then select exists(select 1 from public.decision_briefs where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'management_decision' then select exists(select 1 from public.decisions decision join public.decision_briefs brief on brief.id=decision.brief_id where decision.id=v_id and decision.org_id=p_org_id and brief.project_id=p_project_id and brief.data_class=p_data_class) into v_exists;
      when 'decision_receipt' then select exists(select 1 from public.decision_receipts receipt join public.decision_briefs brief on brief.id=receipt.brief_id where receipt.id=v_id and brief.org_id=p_org_id and brief.project_id=p_project_id and brief.data_class=p_data_class) into v_exists;
      when 'unified_action_item' then select exists(select 1 from public.unified_action_items where id=v_id and org_id=p_org_id and project_id=p_project_id) into v_exists;
      when 'feishu_confirmation' then select exists(select 1 from public.feishu_action_confirmations where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'effect_review' then select (
        exists(select 1 from public.decision_effect_reviews review join public.decision_briefs brief on brief.id=review.brief_id where review.id=v_id and brief.org_id=p_org_id and brief.project_id=p_project_id and brief.data_class=p_data_class)
        or exists(select 1 from public.benefit_realization_reviews where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class)
        or exists(select 1 from public.knowledge_reuse_events where id=v_id and org_id=p_org_id and target_project_id=p_project_id and data_class=p_data_class and status='effect_reviewed')
      ) into v_exists;
      when 'benefit_baseline' then select exists(select 1 from public.project_benefit_baselines where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'benefit_review' then select exists(select 1 from public.benefit_realization_reviews where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'resource_capacity_snapshot' then select exists(select 1 from public.resource_capacity_snapshots snapshot join public.resource_capacity_allocations allocation on allocation.capacity_snapshot_id=snapshot.id where snapshot.id=v_id and snapshot.org_id=p_org_id and allocation.project_id=p_project_id and snapshot.data_class=p_data_class) into v_exists;
      when 'closure_assessment' then select exists(select 1 from public.project_closure_assessments where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'retrospective' then select exists(select 1 from public.project_retrospectives where id=v_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class) into v_exists;
      when 'knowledge_item' then select exists(select 1 from public.knowledge_items where id=v_id and metadata->>'org_id'=p_org_id::text and metadata->>'source_project_id'=p_project_id::text) into v_exists;
      when 'knowledge_reuse_event' then select exists(select 1 from public.knowledge_reuse_events where id=v_id and org_id=p_org_id and target_project_id=p_project_id and data_class=p_data_class) into v_exists;
      else v_exists:=false;
    end case;
    if not v_exists then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.golden_chain_failure_evidence_valid(p_evidence jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0 then
    return false;
  end if;
  if lower(p_evidence::text) ~ '"(secret|token|password|api.?key|credential)"[[:space:]]*:' then
    return false;
  end if;
  return not exists (
    select 1
    from jsonb_array_elements(p_evidence) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item->>'type','') = ''
      or coalesce(item->>'id','') = ''
      or coalesce(item->>'source','') = ''
      or coalesce(item->>'observedAt','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  );
end;
$$;

create or replace function public.create_golden_chain_run_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_chain_key text,
  p_data_class text,
  p_source_snapshot_at timestamptz,
  p_participants jsonb,
  p_steps jsonb,
  p_failure_paths jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_actor_assignment_id uuid,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_request_id text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_run public.golden_chain_runs;
  v_project record;
  v_item jsonb;
  v_required_roles text[];
  v_step_keys text[];
  v_failure_keys text[];
  v_created boolean := false;
begin
  if p_chain_key not in ('A','B','C','D','E') then raise exception 'GOLDEN_CHAIN_KEY_INVALID'; end if;
  if coalesce(p_idempotency_key,'') = '' or coalesce(p_request_fingerprint,'') = '' then raise exception 'GOLDEN_CHAIN_IDEMPOTENCY_REQUIRED'; end if;
  if p_actor_business_role not in ('pmo','quality','ceo') then raise exception 'GOLDEN_CHAIN_CREATE_ROLE_FORBIDDEN'; end if;
  if not public.golden_chain_assignment_covers_project(p_actor_assignment_id,p_actor_user_id,p_actor_business_role,p_org_id,p_project_id) then
    raise exception 'GOLDEN_CHAIN_ACTOR_ASSIGNMENT_INVALID';
  end if;

  select id,org_id,data_class into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'GOLDEN_CHAIN_PROJECT_NOT_FOUND'; end if;
  if v_project.org_id <> p_org_id or v_project.data_class <> p_data_class then raise exception 'GOLDEN_CHAIN_PROJECT_SCOPE_MISMATCH'; end if;

  v_required_roles := case p_chain_key
    when 'A' then array['pm','operations','pmo','ceo']
    when 'B' then array['pm','operations','finance','pmo','ceo']
    when 'C' then array['business_owner','finance','pmo','ceo']
    when 'D' then array['pm','pmo','ceo']
    else array['pm','operations','finance','business_owner','pmo','quality'] end;
  v_step_keys := case p_chain_key
    when 'A' then array['freeze_facts','confirm_delay','confirm_cash_impact','pmo_review','authorized_decision','execute','effect_review']
    when 'B' then array['freeze_finance_basis','update_forecast','finance_verify','prepare_options','decide','review_margin']
    when 'C' then array['freeze_benefit_baseline','review_benefit_gap','exit_decision','handover_exit','review_exit_effect']
    when 'D' then array['freeze_capacity','detect_conflict','prepare_portfolio_options','portfolio_decision','apply_to_projects','capacity_effect_review']
    else array['closure_inputs','closure_gate','retrospective','knowledge_review','knowledge_reuse'] end;
  v_failure_keys := case p_chain_key
    when 'A' then array['pm_denies','duplicate_signal','request_more_evidence','feishu_failure','overdue_action','unauthorized_access']
    when 'B' then array['currency_conflict','finance_rejects','stale_forecast','unauthorized_amount']
    when 'C' then array['insufficient_data','unauthorized_decision','open_contract_obligation','missing_exit_criteria']
    when 'D' then array['stale_capacity','assignee_rejects','third_project_impact','delegation_expired']
    else array['partial_acceptance','disputed_receivable','expired_evidence','knowledge_rejected','project_reopened'] end;

  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) <> cardinality(v_required_roles) then raise exception 'PARTICIPANT_ROLE_MISSING'; end if;
  if exists (
    select 1 from unnest(v_required_roles) required_role
    where (select count(*) from jsonb_array_elements(p_participants) item where item->>'businessRole' = required_role) <> 1
  ) then raise exception 'PARTICIPANT_ROLE_MISSING_OR_DUPLICATED'; end if;
  for v_item in select value from jsonb_array_elements(p_participants) loop
    if coalesce(v_item->>'businessRole','') <> all(v_required_roles) then raise exception 'PARTICIPANT_ROLE_NOT_IN_CHAIN'; end if;
    if not public.golden_chain_assignment_covers_project(
      nullif(v_item->>'assignmentId','')::uuid,
      nullif(v_item->>'userId','')::uuid,
      v_item->>'businessRole',p_org_id,p_project_id
    ) then raise exception 'PARTICIPANT_ASSIGNMENT_INVALID:%',v_item->>'businessRole'; end if;
  end loop;

  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) <> cardinality(v_step_keys) then raise exception 'GOLDEN_CHAIN_STEP_DEFINITION_INVALID'; end if;
  if exists (
    select 1 from unnest(v_step_keys) required_key
    where (select count(*) from jsonb_array_elements(p_steps) item where item->>'key' = required_key) <> 1
  ) then raise exception 'GOLDEN_CHAIN_STEP_DEFINITION_INVALID'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_steps) item
    where coalesce(item->>'key','') <> all(v_step_keys)
      or coalesce(item->>'label','') = ''
      or jsonb_typeof(item->'actorRoles') <> 'array'
      or jsonb_array_length(item->'actorRoles') = 0
      or jsonb_typeof(item->'requiredArtifactTypes') <> 'array'
      or jsonb_array_length(item->'requiredArtifactTypes') = 0
  ) then raise exception 'GOLDEN_CHAIN_STEP_DEFINITION_INVALID'; end if;

  if jsonb_typeof(p_failure_paths) <> 'array' or jsonb_array_length(p_failure_paths) <> cardinality(v_failure_keys) then raise exception 'GOLDEN_CHAIN_FAILURE_DEFINITION_INVALID'; end if;
  if exists (
    select 1 from unnest(v_failure_keys) required_key
    where (select count(*) from jsonb_array_elements(p_failure_paths) item where item->>'key' = required_key) <> 1
  ) then raise exception 'GOLDEN_CHAIN_FAILURE_DEFINITION_INVALID'; end if;

  insert into public.golden_chain_runs(
    org_id,project_id,chain_key,data_class,source_snapshot_at,idempotency_key,request_fingerprint,created_by
  ) values (
    p_org_id,p_project_id,p_chain_key,p_data_class,p_source_snapshot_at,p_idempotency_key,p_request_fingerprint,p_actor_user_id
  )
  on conflict (org_id,idempotency_key) do nothing
  returning * into v_run;

  if found then
    v_created := true;
  else
    select * into v_run from public.golden_chain_runs where org_id=p_org_id and idempotency_key=p_idempotency_key for update;
    if v_run.request_fingerprint <> p_request_fingerprint
      or v_run.project_id <> p_project_id
      or v_run.chain_key <> p_chain_key
      or v_run.data_class <> p_data_class then
      raise exception 'IDEMPOTENCY_KEY_PAYLOAD_CONFLICT';
    end if;
  end if;

  if v_created then
    insert into public.golden_chain_run_participants(run_id,org_id,project_id,data_class,user_id,business_role,assignment_id)
    select v_run.id,p_org_id,p_project_id,p_data_class,(item->>'userId')::uuid,item->>'businessRole',(item->>'assignmentId')::uuid
    from jsonb_array_elements(p_participants) item;

    insert into public.golden_chain_steps(run_id,org_id,project_id,data_class,step_key,sequence_no,label,actor_roles,required_artifact_types)
    select v_run.id,p_org_id,p_project_id,p_data_class,item->>'key',ordinality::integer,item->>'label',
      array(select jsonb_array_elements_text(item->'actorRoles')),
      array(select jsonb_array_elements_text(item->'requiredArtifactTypes'))
    from jsonb_array_elements(p_steps) with ordinality as source(item,ordinality);

    insert into public.golden_chain_failure_paths(run_id,org_id,project_id,data_class,path_key,label)
    select v_run.id,p_org_id,p_project_id,p_data_class,item->>'key',item->>'label'
    from jsonb_array_elements(p_failure_paths) item;

    insert into public.golden_chain_events(run_id,org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,reason,evidence,request_id)
    values (v_run.id,p_org_id,p_project_id,p_data_class,'run',v_run.id::text,'create',null,'draft',p_actor_user_id,p_actor_business_role,null,'[]'::jsonb,p_request_id);
  end if;
  return jsonb_build_object('run',to_jsonb(v_run),'created',v_created);
end;
$$;

create or replace function public.transition_golden_chain_step_tx(
  p_step_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_artifact_references jsonb,
  p_comment text,
  p_request_id text
)
returns public.golden_chain_steps
language plpgsql
set search_path = public
as $$
declare
  v_step public.golden_chain_steps;
  v_run public.golden_chain_runs;
  v_next text;
begin
  select * into v_step from public.golden_chain_steps where id=p_step_id for update;
  if not found then raise exception 'GOLDEN_CHAIN_STEP_NOT_FOUND'; end if;
  select * into v_run from public.golden_chain_runs where id=v_step.run_id for update;
  if exists (select 1 from public.golden_chain_events where run_id=v_run.id and subject_type='step' and subject_id=p_step_id::text and event_type=p_action and request_id=p_request_id) then return v_step; end if;
  if v_run.status <> 'running' then raise exception 'GOLDEN_CHAIN_RUN_NOT_RUNNING'; end if;
  if v_step.status <> p_expected_status or v_step.version <> p_expected_version then raise exception 'GOLDEN_CHAIN_STEP_CONFLICT:%:%',v_step.status,v_step.version; end if;
  if not exists (select 1 from public.golden_chain_run_participants where run_id=v_run.id and user_id=p_actor_user_id and business_role=p_actor_business_role) then raise exception 'GOLDEN_CHAIN_ACTOR_NOT_PARTICIPANT'; end if;

  v_next := case
    when p_action='start' and v_step.status='pending' then 'in_progress'
    when p_action='submit' and v_step.status='in_progress' then 'submitted'
    when p_action='verify' and v_step.status='submitted' then 'verified'
    when p_action='reject' and v_step.status='submitted' then 'failed'
    when p_action='retry' and v_step.status='failed' then 'in_progress'
    else null end;
  if v_next is null then raise exception 'GOLDEN_CHAIN_STEP_TRANSITION_FORBIDDEN:%:%',v_step.status,p_action; end if;

  if p_action in ('start','submit','retry') and not (p_actor_business_role = any(v_step.actor_roles)) then raise exception 'GOLDEN_CHAIN_STEP_ACTOR_ROLE_FORBIDDEN'; end if;
  if p_action='submit' and v_step.started_by <> p_actor_user_id then raise exception 'GOLDEN_CHAIN_STEP_EXECUTOR_MISMATCH'; end if;
  if p_action='submit' then
    if not public.golden_chain_artifact_references_valid(p_artifact_references,v_step.data_class) then raise exception 'ARTIFACT_REFERENCE_FIELDS_REQUIRED'; end if;
    if exists (
      select 1 from unnest(v_step.required_artifact_types) required_type
      where not exists (select 1 from jsonb_array_elements(p_artifact_references) item where item->>'objectType'=required_type)
    ) then raise exception 'REQUIRED_ARTIFACT_MISSING'; end if;
    if not public.golden_chain_artifacts_exist(p_artifact_references,v_step.org_id,v_step.project_id,v_step.data_class) then raise exception 'ARTIFACT_REFERENCE_NOT_FOUND_OR_OUTSIDE_SCOPE'; end if;
  end if;
  if p_action in ('verify','reject') then
    if p_actor_user_id=v_step.submitted_by then raise exception 'P25_INDEPENDENT_VERIFIER_REQUIRED'; end if;
    if p_actor_business_role not in ('pmo','quality','finance','ceo','business_owner') then raise exception 'GOLDEN_CHAIN_VERIFIER_ROLE_FORBIDDEN'; end if;
  end if;
  if p_action='reject' and coalesce(nullif(trim(p_comment),''),'')='' then raise exception 'GOLDEN_CHAIN_REJECTION_REASON_REQUIRED'; end if;

  update public.golden_chain_steps set
    status=v_next,
    artifact_references=case when p_action='submit' then p_artifact_references when p_action='retry' then '[]'::jsonb else artifact_references end,
    started_by=case when p_action in ('start','retry') then p_actor_user_id else started_by end,
    started_business_role=case when p_action in ('start','retry') then p_actor_business_role else started_business_role end,
    started_at=case when p_action in ('start','retry') then now() else started_at end,
    submitted_by=case when p_action='submit' then p_actor_user_id when p_action='retry' then null else submitted_by end,
    submitted_business_role=case when p_action='submit' then p_actor_business_role when p_action='retry' then null else submitted_business_role end,
    submitted_at=case when p_action='submit' then now() when p_action='retry' then null else submitted_at end,
    verified_by=case when p_action in ('verify','reject') then p_actor_user_id when p_action='retry' then null else verified_by end,
    verifier_business_role=case when p_action in ('verify','reject') then p_actor_business_role when p_action='retry' then null else verifier_business_role end,
    verified_at=case when p_action in ('verify','reject') then now() when p_action='retry' then null else verified_at end,
    verification_comment=case when p_action in ('verify','reject') then nullif(trim(p_comment),'') when p_action='retry' then null else verification_comment end,
    updated_at=now(),version=version+1
  where id=p_step_id returning * into v_step;

  insert into public.golden_chain_events(run_id,org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,reason,evidence,request_id)
  values (v_run.id,v_run.org_id,v_run.project_id,v_run.data_class,'step',p_step_id::text,p_action,p_expected_status,v_next,p_actor_user_id,p_actor_business_role,nullif(trim(p_comment),''),case when p_action='submit' then p_artifact_references else '[]'::jsonb end,p_request_id);
  return v_step;
end;
$$;

create or replace function public.verify_golden_chain_failure_path_tx(
  p_failure_path_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_evidence jsonb,
  p_comment text,
  p_request_id text
)
returns public.golden_chain_failure_paths
language plpgsql
set search_path = public
as $$
declare
  v_path public.golden_chain_failure_paths;
  v_run public.golden_chain_runs;
  v_next text;
begin
  select * into v_path from public.golden_chain_failure_paths where id=p_failure_path_id for update;
  if not found then raise exception 'GOLDEN_CHAIN_FAILURE_PATH_NOT_FOUND'; end if;
  select * into v_run from public.golden_chain_runs where id=v_path.run_id for update;
  if exists (select 1 from public.golden_chain_events where run_id=v_run.id and subject_type='failure_path' and subject_id=p_failure_path_id::text and event_type=p_action and request_id=p_request_id) then return v_path; end if;
  if v_run.status <> 'running' then raise exception 'GOLDEN_CHAIN_RUN_NOT_RUNNING'; end if;
  if v_path.status <> p_expected_status or v_path.version <> p_expected_version then raise exception 'GOLDEN_CHAIN_FAILURE_PATH_CONFLICT:%:%',v_path.status,v_path.version; end if;
  if not exists (select 1 from public.golden_chain_run_participants where run_id=v_run.id and user_id=p_actor_user_id and business_role=p_actor_business_role) then raise exception 'GOLDEN_CHAIN_ACTOR_NOT_PARTICIPANT'; end if;

  v_next := case
    when p_action='submit' and v_path.status='pending' then 'submitted'
    when p_action='verify_pass' and v_path.status='submitted' then 'passed'
    when p_action='verify_fail' and v_path.status='submitted' then 'failed'
    when p_action='retry' and v_path.status='failed' then 'pending'
    else null end;
  if v_next is null then raise exception 'GOLDEN_CHAIN_FAILURE_PATH_TRANSITION_FORBIDDEN:%:%',v_path.status,p_action; end if;
  if p_action='submit' and not public.golden_chain_failure_evidence_valid(p_evidence) then raise exception 'FAILURE_PATH_STRUCTURED_EVIDENCE_REQUIRED'; end if;
  if p_action in ('verify_pass','verify_fail') then
    if p_actor_user_id=v_path.submitted_by then raise exception 'P25_INDEPENDENT_VERIFIER_REQUIRED'; end if;
    if p_actor_business_role not in ('pmo','quality','ceo') then raise exception 'GOLDEN_CHAIN_FAILURE_VERIFIER_ROLE_FORBIDDEN'; end if;
  end if;
  if p_action='verify_fail' and coalesce(nullif(trim(p_comment),''),'')='' then raise exception 'GOLDEN_CHAIN_FAILURE_REJECTION_REASON_REQUIRED'; end if;

  update public.golden_chain_failure_paths set
    status=v_next,
    evidence=case when p_action='submit' then p_evidence when p_action='retry' then '[]'::jsonb else evidence end,
    submitted_by=case when p_action='submit' then p_actor_user_id when p_action='retry' then null else submitted_by end,
    submitted_business_role=case when p_action='submit' then p_actor_business_role when p_action='retry' then null else submitted_business_role end,
    submitted_at=case when p_action='submit' then now() when p_action='retry' then null else submitted_at end,
    verified_by=case when p_action in ('verify_pass','verify_fail') then p_actor_user_id when p_action='retry' then null else verified_by end,
    verifier_business_role=case when p_action in ('verify_pass','verify_fail') then p_actor_business_role when p_action='retry' then null else verifier_business_role end,
    verified_at=case when p_action in ('verify_pass','verify_fail') then now() when p_action='retry' then null else verified_at end,
    verification_comment=case when p_action in ('verify_pass','verify_fail') then nullif(trim(p_comment),'') when p_action='retry' then null else verification_comment end,
    updated_at=now(),version=version+1
  where id=p_failure_path_id returning * into v_path;

  insert into public.golden_chain_events(run_id,org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,reason,evidence,request_id)
  values (v_run.id,v_run.org_id,v_run.project_id,v_run.data_class,'failure_path',p_failure_path_id::text,p_action,p_expected_status,v_next,p_actor_user_id,p_actor_business_role,nullif(trim(p_comment),''),case when p_action='submit' then p_evidence else '[]'::jsonb end,p_request_id);
  return v_path;
end;
$$;

create or replace function public.transition_golden_chain_run_tx(
  p_run_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_source_snapshot_at timestamptz,
  p_reason text,
  p_request_id text
)
returns public.golden_chain_runs
language plpgsql
set search_path = public
as $$
declare
  v_run public.golden_chain_runs;
  v_next text;
begin
  select * into v_run from public.golden_chain_runs where id=p_run_id for update;
  if not found then raise exception 'GOLDEN_CHAIN_RUN_NOT_FOUND'; end if;
  if exists (select 1 from public.golden_chain_events where run_id=v_run.id and subject_type='run' and subject_id=p_run_id::text and event_type=p_action and request_id=p_request_id) then return v_run; end if;
  if v_run.status <> p_expected_status or v_run.version <> p_expected_version then raise exception 'GOLDEN_CHAIN_RUN_CONFLICT:%:%',v_run.status,v_run.version; end if;
  if not exists (select 1 from public.golden_chain_run_participants where run_id=v_run.id and user_id=p_actor_user_id and business_role=p_actor_business_role) then raise exception 'GOLDEN_CHAIN_ACTOR_NOT_PARTICIPANT'; end if;

  v_next := case
    when p_action='prepare' and v_run.status='draft' then 'ready'
    when p_action='start' and v_run.status='ready' then 'running'
    when p_action='submit_verification' and v_run.status='running' then 'verification'
    when p_action='pass' and v_run.status='verification' then 'passed'
    when p_action='fail' and v_run.status='verification' then 'failed'
    when p_action='block' and v_run.status in ('ready','running','verification') then 'blocked'
    when p_action='resume' and v_run.status='blocked' then 'running'
    when p_action='retry' and v_run.status='failed' then 'running'
    when p_action='cancel' and v_run.status in ('draft','ready','running','failed','blocked') then 'cancelled'
    else null end;
  if v_next is null then raise exception 'GOLDEN_CHAIN_RUN_TRANSITION_FORBIDDEN:%:%',v_run.status,p_action; end if;
  if p_action in ('prepare','start','submit_verification','block','resume','retry','cancel') and p_actor_business_role not in ('pmo','quality','ceo') then raise exception 'GOLDEN_CHAIN_RUN_OPERATOR_ROLE_FORBIDDEN'; end if;
  if p_action='prepare' and coalesce(p_source_snapshot_at,v_run.source_snapshot_at) is null then raise exception 'SOURCE_SNAPSHOT_REQUIRED'; end if;
  if p_action='submit_verification' then
    if exists (select 1 from public.golden_chain_steps where run_id=v_run.id and status <> 'verified') then raise exception 'GOLDEN_STEP_NOT_VERIFIED'; end if;
    if exists (select 1 from public.golden_chain_failure_paths where run_id=v_run.id and (status <> 'passed' or jsonb_array_length(evidence)=0)) then raise exception 'FAILURE_PATH_NOT_VERIFIED'; end if;
  end if;
  if p_action in ('pass','fail') then
    if (v_run.chain_key='E' and p_actor_business_role <> 'quality') or (v_run.chain_key<>'E' and p_actor_business_role <> 'ceo') then raise exception 'GOLDEN_CHAIN_FINAL_VERIFIER_ROLE_FORBIDDEN'; end if;
    if p_actor_user_id=v_run.submitted_by then raise exception 'P25_INDEPENDENT_VERIFIER_REQUIRED'; end if;
  end if;
  if p_action='pass' then
    if v_run.data_class <> 'production' then raise exception 'PRODUCTION_DATA_REQUIRED'; end if;
    if v_run.source_snapshot_at is null then raise exception 'SOURCE_SNAPSHOT_REQUIRED'; end if;
    if exists (select 1 from public.golden_chain_steps where run_id=v_run.id and (status <> 'verified' or not public.golden_chain_artifact_references_valid(artifact_references,data_class))) then raise exception 'GOLDEN_STEP_NOT_VERIFIED'; end if;
    if exists (select 1 from public.golden_chain_failure_paths where run_id=v_run.id and (status <> 'passed' or not public.golden_chain_failure_evidence_valid(evidence))) then raise exception 'FAILURE_PATH_NOT_VERIFIED'; end if;
  end if;
  if p_action in ('fail','block') and coalesce(nullif(trim(p_reason),''),'')='' then raise exception 'GOLDEN_CHAIN_REASON_REQUIRED'; end if;

  update public.golden_chain_runs set
    status=v_next,
    source_snapshot_at=case when p_action='prepare' then coalesce(p_source_snapshot_at,source_snapshot_at) else source_snapshot_at end,
    prepared_by=case when p_action='prepare' then p_actor_user_id else prepared_by end,
    prepared_at=case when p_action='prepare' then now() else prepared_at end,
    started_by=case when p_action in ('start','resume','retry') then p_actor_user_id else started_by end,
    started_at=case when p_action in ('start','resume','retry') then now() else started_at end,
    submitted_by=case when p_action='submit_verification' then p_actor_user_id else submitted_by end,
    submitted_at=case when p_action='submit_verification' then now() else submitted_at end,
    verified_by=case when p_action in ('pass','fail') then p_actor_user_id else verified_by end,
    verified_at=case when p_action in ('pass','fail') then now() else verified_at end,
    failure_reason=case when p_action='fail' then trim(p_reason) when p_action='retry' then null else failure_reason end,
    blocked_reason=case when p_action='block' then trim(p_reason) when p_action='resume' then null else blocked_reason end,
    updated_at=now(),version=version+1
  where id=p_run_id returning * into v_run;

  insert into public.golden_chain_events(run_id,org_id,project_id,data_class,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,reason,evidence,request_id)
  values (v_run.id,v_run.org_id,v_run.project_id,v_run.data_class,'run',p_run_id::text,p_action,p_expected_status,v_next,p_actor_user_id,p_actor_business_role,nullif(trim(p_reason),''),'[]'::jsonb,p_request_id);
  return v_run;
end;
$$;

insert into public.business_authorization_policies(
  org_id,policy_key,version,status,effect,business_role,object_type,action,
  allowed_states,project_levels,decision_levels,max_amount,sensitive_fields,priority,effective_from,approved_at
)
select null,'p25-golden-chain-'||role||'-'||action_name,1,'active','allow',role,'golden_chain',action_name,
  '["*"]'::jsonb,'["*"]'::jsonb,'["project"]'::jsonb,null,'[]'::jsonb,120,now(),now()
from (values
  ('pmo','create'),('quality','create'),('ceo','create'),
  ('pm','execute'),('operations','execute'),('pmo','execute'),('ceo','execute'),
  ('business_owner','execute'),('finance','execute'),('quality','execute'),
  ('pmo','verify'),('quality','verify'),('ceo','verify'),('business_owner','verify'),('finance','verify')
) as policy(role,action_name)
on conflict do nothing;

alter table public.golden_chain_runs enable row level security;
alter table public.golden_chain_run_participants enable row level security;
alter table public.golden_chain_steps enable row level security;
alter table public.golden_chain_failure_paths enable row level security;
alter table public.golden_chain_events enable row level security;

revoke all on table public.golden_chain_runs,public.golden_chain_run_participants,public.golden_chain_steps,public.golden_chain_failure_paths,public.golden_chain_events from public,anon,authenticated;
grant select,insert,update,delete on table public.golden_chain_runs,public.golden_chain_run_participants,public.golden_chain_steps,public.golden_chain_failure_paths,public.golden_chain_events to service_role;

revoke all on function public.golden_chain_assignment_covers_project(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.golden_chain_artifact_references_valid(jsonb,text) from public,anon,authenticated;
revoke all on function public.golden_chain_artifacts_exist(jsonb,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.golden_chain_failure_evidence_valid(jsonb) from public,anon,authenticated;
revoke all on function public.create_golden_chain_run_tx(uuid,uuid,text,text,timestamptz,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.transition_golden_chain_step_tx(uuid,text,bigint,text,uuid,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.verify_golden_chain_failure_path_tx(uuid,text,bigint,text,uuid,text,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.transition_golden_chain_run_tx(uuid,text,bigint,text,uuid,text,timestamptz,text,text) from public,anon,authenticated;

grant execute on function public.golden_chain_assignment_covers_project(uuid,uuid,text,uuid,uuid) to service_role;
grant execute on function public.golden_chain_artifact_references_valid(jsonb,text) to service_role;
grant execute on function public.golden_chain_artifacts_exist(jsonb,uuid,uuid,text) to service_role;
grant execute on function public.golden_chain_failure_evidence_valid(jsonb) to service_role;
grant execute on function public.create_golden_chain_run_tx(uuid,uuid,text,text,timestamptz,jsonb,jsonb,jsonb,uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.transition_golden_chain_step_tx(uuid,text,bigint,text,uuid,text,jsonb,text,text) to service_role;
grant execute on function public.verify_golden_chain_failure_path_tx(uuid,text,bigint,text,uuid,text,jsonb,text,text) to service_role;
grant execute on function public.transition_golden_chain_run_tx(uuid,text,bigint,text,uuid,text,timestamptz,text,text) to service_role;
