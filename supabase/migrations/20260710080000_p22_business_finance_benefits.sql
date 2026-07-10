-- AI PM System V5.6 P22 business-finance and benefit-realization closed loop.
-- Scenario confirmation creates a pending impact package and action only. It never updates delivery or finance facts.

create table if not exists public.project_benefit_baselines (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  baseline_version text not null,
  benefit_name text not null,
  benefit_type text not null check (benefit_type in ('revenue','cost_saving','cash','efficiency','customer','strategic','risk_reduction')),
  metric_key text not null,
  baseline_value numeric(18,2) not null,
  target_value numeric(18,2) not null,
  forecast_value numeric(18,2) not null,
  actual_value numeric(18,2) not null default 0,
  currency text,
  unit text,
  benefit_owner_user_id uuid not null references public.app_users(id) on delete restrict,
  realization_due_date date not null,
  g6_review_due_date date not null,
  exit_criteria text not null,
  exit_threshold numeric(18,2),
  g6_reviewed_at timestamptz,
  g6_outcome text check (g6_outcome is null or g6_outcome in ('realized','not_realized')),
  status text not null default 'draft' check (status in ('draft','approved','tracking','at_risk','realized','not_realized','exit_pending','retired')),
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (org_id,project_id,benefit_name,baseline_version,data_class)
);

create table if not exists public.benefit_baseline_decisions (
  id uuid primary key default uuid_generate_v4(),
  benefit_baseline_id uuid not null references public.project_benefit_baselines(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_business_role text not null check (reviewer_business_role in ('business_owner','finance','pmo')),
  decision text not null check (decision in ('approve','reject')),
  comment text not null,
  request_id text,
  decided_at timestamptz not null default now(),
  unique (benefit_baseline_id,reviewer_business_role)
);

create table if not exists public.benefit_realization_reviews (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  benefit_baseline_id uuid not null references public.project_benefit_baselines(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  review_gate text not null check (review_gate in ('monthly','quarterly','G6','exit')),
  snapshot_at timestamptz not null,
  forecast_value numeric(18,2) not null,
  actual_value numeric(18,2) not null,
  variance numeric(18,2) not null,
  conclusion text not null,
  review_outcome text not null check (review_outcome in ('on_track','at_risk','realized','not_realized','retire')),
  action_required boolean not null default false,
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  submitted_by uuid not null references public.app_users(id) on delete restrict,
  submitted_business_role text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected','closed')),
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.benefit_review_decisions (
  id uuid primary key default uuid_generate_v4(),
  benefit_review_id uuid not null references public.benefit_realization_reviews(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_business_role text not null check (reviewer_business_role in ('business_owner','finance','pmo')),
  decision text not null check (decision in ('approve','reject')),
  comment text not null,
  request_id text,
  decided_at timestamptz not null default now(),
  unique (benefit_review_id,reviewer_business_role)
);

create table if not exists public.portfolio_scenarios (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  name text not null,
  scenario_type text not null check (scenario_type in ('delay','scope','resource','pause','terminate','combined')),
  baseline_snapshot jsonb not null,
  assumptions jsonb not null,
  results jsonb not null,
  status text not null default 'draft' check (status in ('draft','reviewed','confirmed','applied','retired')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  confirmed_by uuid references public.app_users(id) on delete set null,
  confirmed_at timestamptz,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_impact_packages (
  id uuid primary key default uuid_generate_v4(),
  scenario_id uuid not null references public.portfolio_scenarios(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete set null,
  proposed_changes jsonb not null,
  impact_summary text not null,
  status text not null default 'pending_application' check (status in ('pending_application','under_review','approved_for_application','applied','rejected','retired')),
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scenario_id)
);

create table if not exists public.benefit_realization_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  subject_type text not null check (subject_type in ('baseline','review','action','scenario','impact_package')),
  subject_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null,
  detail jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.benefit_realization_reviews add column if not exists review_outcome text;
alter table public.benefit_realization_reviews add column if not exists submitted_by uuid references public.app_users(id) on delete restrict;
alter table public.benefit_realization_reviews add column if not exists submitted_business_role text;
alter table public.benefit_realization_reviews add column if not exists request_id text;
alter table public.benefit_realization_reviews add column if not exists version bigint not null default 1;
alter table public.project_benefit_baselines add column if not exists version bigint not null default 1;

alter table public.unified_action_items drop constraint if exists unified_action_items_source_type_check;
alter table public.unified_action_items add constraint unified_action_items_source_type_check
  check (source_type in ('risk','issue','change','governance','signal','decision','report','cadence','benefit','scenario','ai_assistant','manual'));

create index if not exists idx_benefit_project_status on public.project_benefit_baselines(org_id,project_id,data_class,status);
create index if not exists idx_benefit_review_project on public.benefit_realization_reviews(project_id,review_gate,snapshot_at desc);
create index if not exists idx_benefit_review_status on public.benefit_realization_reviews(org_id,status,updated_at desc);
create index if not exists idx_benefit_events_subject on public.benefit_realization_events(subject_type,subject_id,created_at);
create index if not exists idx_portfolio_scenario_status on public.portfolio_scenarios(org_id,portfolio_id,data_class,status,created_at desc);
create index if not exists idx_scenario_impact_status on public.scenario_impact_packages(org_id,portfolio_id,data_class,status,updated_at desc);
create unique index if not exists idx_benefit_review_request on public.benefit_realization_reviews(request_id) where request_id is not null;
create unique index if not exists idx_benefit_event_request on public.benefit_realization_events(subject_type,subject_id,event_type,request_id) where request_id is not null;

alter table public.project_benefit_baselines enable row level security;
alter table public.benefit_baseline_decisions enable row level security;
alter table public.benefit_realization_reviews enable row level security;
alter table public.benefit_review_decisions enable row level security;
alter table public.portfolio_scenarios enable row level security;
alter table public.scenario_impact_packages enable row level security;
alter table public.benefit_realization_events enable row level security;

revoke all on table public.project_benefit_baselines,public.benefit_baseline_decisions,public.benefit_realization_reviews,public.benefit_review_decisions,public.portfolio_scenarios,public.scenario_impact_packages,public.benefit_realization_events from public,anon,authenticated;
grant select,insert,update,delete on table public.project_benefit_baselines,public.benefit_baseline_decisions,public.benefit_realization_reviews,public.benefit_review_decisions,public.portfolio_scenarios,public.scenario_impact_packages,public.benefit_realization_events to service_role;

create or replace function public.decide_benefit_baseline_tx(
  p_baseline_id uuid,
  p_decision text,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_baseline public.project_benefit_baselines%rowtype;
  v_approved boolean;
begin
  if p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_REVIEW_ROLE_FORBIDDEN'; end if;
  if p_decision not in ('approve','reject') then raise exception 'BENEFIT_DECISION_INVALID'; end if;
  if nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_DECISION_COMMENT_REQUIRED'; end if;
  select * into v_baseline from public.project_benefit_baselines where id=p_baseline_id for update;
  if not found then raise exception 'BENEFIT_BASELINE_NOT_FOUND'; end if;
  if v_baseline.status <> 'draft' then raise exception 'BENEFIT_BASELINE_NOT_DRAFT'; end if;

  insert into public.benefit_baseline_decisions(benefit_baseline_id,reviewer_user_id,reviewer_business_role,decision,comment,request_id,decided_at)
  values (p_baseline_id,p_actor_user_id,p_actor_business_role,p_decision,trim(p_comment),p_request_id,now())
  on conflict (benefit_baseline_id,reviewer_business_role) do update set
    reviewer_user_id=excluded.reviewer_user_id,decision=excluded.decision,comment=excluded.comment,request_id=excluded.request_id,decided_at=now();

  select count(*) filter (where decision='approve')=3
    and count(distinct reviewer_business_role)=3
  into v_approved from public.benefit_baseline_decisions where benefit_baseline_id=p_baseline_id;
  if v_approved then
    update public.project_benefit_baselines set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_at=now(),version=version+1 where id=p_baseline_id;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_baseline.org_id,v_baseline.project_id,'baseline',p_baseline_id,'human_review','draft',case when v_approved then 'approved' else 'draft' end,p_actor_user_id,p_actor_business_role,jsonb_build_object('decision',p_decision,'comment',trim(p_comment)),p_request_id);
  return jsonb_build_object('baseline',(select to_jsonb(b) from public.project_benefit_baselines b where b.id=p_baseline_id),'all_approved',v_approved);
end;
$$;

create or replace function public.start_benefit_tracking_tx(
  p_baseline_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_baseline public.project_benefit_baselines%rowtype;
begin
  if p_actor_business_role not in ('business_owner','pmo') then raise exception 'BENEFIT_TRACKING_ROLE_FORBIDDEN'; end if;
  select * into v_baseline from public.project_benefit_baselines where id=p_baseline_id for update;
  if not found then raise exception 'BENEFIT_BASELINE_NOT_FOUND'; end if;
  if v_baseline.status <> 'approved' then raise exception 'BENEFIT_BASELINE_NOT_APPROVED'; end if;
  update public.project_benefit_baselines set status='tracking',updated_at=now(),version=version+1 where id=p_baseline_id;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id)
  values (v_baseline.org_id,v_baseline.project_id,'baseline',p_baseline_id,'start_tracking','approved','tracking',p_actor_user_id,p_actor_business_role,p_request_id);
  return (select to_jsonb(b) from public.project_benefit_baselines b where b.id=p_baseline_id);
end;
$$;

create or replace function public.submit_benefit_review_tx(
  p_baseline_id uuid,
  p_review_gate text,
  p_snapshot_at timestamptz,
  p_forecast_value numeric,
  p_actual_value numeric,
  p_conclusion text,
  p_evidence jsonb,
  p_action_owner_user_id uuid,
  p_action_due_date date,
  p_action_acceptance_criteria text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_baseline public.project_benefit_baselines%rowtype;
  v_review_id uuid := public.uuid_generate_v4();
  v_action_id uuid;
  v_under_target boolean;
  v_outcome text;
begin
  if p_actor_business_role not in ('operations','business_owner','finance','pmo') then raise exception 'BENEFIT_SUBMIT_ROLE_FORBIDDEN'; end if;
  if p_review_gate not in ('monthly','quarterly','G6','exit') then raise exception 'BENEFIT_REVIEW_GATE_INVALID'; end if;
  if nullif(trim(p_conclusion),'') is null then raise exception 'BENEFIT_REVIEW_CONCLUSION_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_evidence,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0 then raise exception 'BENEFIT_REVIEW_EVIDENCE_REQUIRED'; end if;
  if p_forecast_value is null or p_actual_value is null then raise exception 'BENEFIT_REVIEW_VALUES_REQUIRED'; end if;
  select * into v_baseline from public.project_benefit_baselines where id=p_baseline_id for update;
  if not found then raise exception 'BENEFIT_BASELINE_NOT_FOUND'; end if;
  if p_review_gate in ('monthly','quarterly','G6') and v_baseline.status not in ('tracking','at_risk') then raise exception 'BENEFIT_REVIEW_NOT_TRACKING'; end if;
  if p_review_gate='exit' and v_baseline.status not in ('approved','tracking','at_risk','realized','not_realized') then raise exception 'BENEFIT_EXIT_REVIEW_NOT_ALLOWED'; end if;
  if p_request_id is not null and exists (select 1 from public.benefit_realization_reviews where request_id=p_request_id) then
    return (select jsonb_build_object('review',to_jsonb(r),'action_item_id',r.action_item_id) from public.benefit_realization_reviews r where r.request_id=p_request_id);
  end if;

  v_under_target := case when p_review_gate in ('G6','exit') then p_actual_value < v_baseline.target_value else p_forecast_value < v_baseline.target_value end;
  v_outcome := case when p_review_gate='exit' then 'retire' when p_review_gate='G6' and v_under_target then 'not_realized' when p_review_gate='G6' then 'realized' when v_under_target then 'at_risk' else 'on_track' end;
  if v_under_target and (p_action_owner_user_id is null or p_action_due_date is null or nullif(trim(p_action_acceptance_criteria),'') is null) then
    raise exception 'BENEFIT_CORRECTIVE_ACTION_REQUIRED';
  end if;

  insert into public.benefit_realization_reviews(id,org_id,benefit_baseline_id,project_id,review_gate,snapshot_at,forecast_value,actual_value,variance,conclusion,review_outcome,action_required,submitted_by,submitted_business_role,evidence,status,data_class,request_id)
  values (v_review_id,v_baseline.org_id,p_baseline_id,v_baseline.project_id,p_review_gate,coalesce(p_snapshot_at,now()),p_forecast_value,p_actual_value,p_actual_value-v_baseline.target_value,trim(p_conclusion),v_outcome,v_under_target,p_actor_user_id,p_actor_business_role,p_evidence,'submitted',v_baseline.data_class,p_request_id);

  if v_under_target then
    insert into public.unified_action_items(source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key)
    values ('benefit',v_review_id::text,(select name from public.projects where id=v_baseline.project_id),'收益纠偏：'||v_baseline.benefit_name,
      coalesce((select name from public.app_users where id=p_action_owner_user_id),'待确认责任人'),p_action_due_date,'assigned','P1',p_actor_user_id,
      coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),jsonb_build_object('benefit_baseline_id',p_baseline_id,'benefit_review_id',v_review_id,'review_gate',p_review_gate),
      v_baseline.org_id,'project',v_baseline.project_id::text,v_baseline.project_id,p_action_owner_user_id,trim(p_action_acceptance_criteria),'benefit-review:'||v_review_id::text)
    returning id into v_action_id;
    update public.benefit_realization_reviews set action_item_id=v_action_id where id=v_review_id;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_baseline.org_id,v_baseline.project_id,'review',v_review_id,'submit_review','submitted',p_actor_user_id,p_actor_business_role,jsonb_build_object('review_gate',p_review_gate,'under_target',v_under_target,'action_item_id',v_action_id),p_request_id);
  return jsonb_build_object('review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=v_review_id),'action_item_id',v_action_id);
end;
$$;

create or replace function public.decide_benefit_review_tx(
  p_review_id uuid,
  p_decision text,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review public.benefit_realization_reviews%rowtype;
  v_baseline public.project_benefit_baselines%rowtype;
  v_all_approved boolean;
  v_next_status text;
begin
  if p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_REVIEW_ROLE_FORBIDDEN'; end if;
  if p_decision not in ('approve','reject') then raise exception 'BENEFIT_DECISION_INVALID'; end if;
  if nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_DECISION_COMMENT_REQUIRED'; end if;
  select * into v_review from public.benefit_realization_reviews where id=p_review_id for update;
  if not found then raise exception 'BENEFIT_REVIEW_NOT_FOUND'; end if;
  if v_review.status <> 'submitted' then raise exception 'BENEFIT_REVIEW_NOT_SUBMITTED'; end if;
  select * into v_baseline from public.project_benefit_baselines where id=v_review.benefit_baseline_id for update;

  insert into public.benefit_review_decisions(benefit_review_id,reviewer_user_id,reviewer_business_role,decision,comment,request_id,decided_at)
  values (p_review_id,p_actor_user_id,p_actor_business_role,p_decision,trim(p_comment),p_request_id,now())
  on conflict (benefit_review_id,reviewer_business_role) do update set
    reviewer_user_id=excluded.reviewer_user_id,decision=excluded.decision,comment=excluded.comment,request_id=excluded.request_id,decided_at=now();

  if p_decision='reject' then
    update public.benefit_realization_reviews set status='rejected',updated_at=now(),version=version+1 where id=p_review_id;
    update public.unified_action_items set status='cancelled',updated_at=now() where id=v_review.action_item_id and status in ('assigned','accepted','rejected','in_progress');
    insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
    values (v_review.org_id,v_review.project_id,'review',p_review_id,'human_review','submitted','rejected',p_actor_user_id,p_actor_business_role,jsonb_build_object('decision',p_decision,'comment',trim(p_comment)),p_request_id);
    return jsonb_build_object('review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=p_review_id),'all_approved',false);
  end if;

  select count(*) filter (where decision='approve')=3 and count(distinct reviewer_business_role)=3
  into v_all_approved from public.benefit_review_decisions where benefit_review_id=p_review_id;
  if v_all_approved then
    v_next_status := case
      when v_review.review_gate='exit' then 'retired'
      when v_review.review_gate='G6' and v_review.review_outcome='not_realized' then 'not_realized'
      when v_review.review_gate='G6' then 'realized'
      when v_review.review_outcome='at_risk' then 'at_risk'
      else 'tracking'
    end;
    update public.project_benefit_baselines set forecast_value=v_review.forecast_value,actual_value=v_review.actual_value,status=v_next_status,updated_at=now(),version=version+1 where id=v_baseline.id;
    update public.benefit_realization_reviews set status=case when action_required then 'approved' else 'closed' end,updated_at=now(),version=version+1 where id=p_review_id;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_review.org_id,v_review.project_id,'review',p_review_id,'human_review','submitted',case when v_all_approved then case when v_review.action_required then 'approved' else 'closed' end else 'submitted' end,p_actor_user_id,p_actor_business_role,jsonb_build_object('decision',p_decision,'comment',trim(p_comment),'baseline_status',v_next_status),p_request_id);
  return jsonb_build_object('review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=p_review_id),'baseline',(select to_jsonb(b) from public.project_benefit_baselines b where b.id=v_baseline.id),'all_approved',v_all_approved);
end;
$$;

create or replace function public.transition_benefit_action_tx(
  p_action_id uuid,
  p_transition text,
  p_comment text,
  p_evidence jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_action public.unified_action_items%rowtype;
  v_review public.benefit_realization_reviews%rowtype;
  v_next text;
begin
  select * into v_action from public.unified_action_items where id=p_action_id and source_type='benefit' for update;
  if not found then raise exception 'BENEFIT_ACTION_NOT_FOUND'; end if;
  select * into v_review from public.benefit_realization_reviews where id=v_action.source_id::uuid and action_item_id=p_action_id for update;
  if not found then raise exception 'BENEFIT_REVIEW_NOT_FOUND'; end if;
  if p_transition in ('accept','start','submit_evidence') and v_action.owner_user_id<>p_actor_user_id then raise exception 'BENEFIT_ACTION_OWNER_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_ACTION_REVIEW_ROLE_REQUIRED'; end if;
  if p_transition='submit_evidence' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'BENEFIT_ACTION_EVIDENCE_REQUIRED'; end if;
  if p_transition='review_reject' and nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_ACTION_REJECTION_REASON_REQUIRED'; end if;
  v_next := case
    when v_action.status in ('assigned','rejected') and p_transition='accept' then 'accepted'
    when v_action.status='accepted' and p_transition='start' then 'in_progress'
    when v_action.status='in_progress' and p_transition='submit_evidence' then 'evidence_submitted'
    when v_action.status='evidence_submitted' and p_transition='review_reject' then 'rejected'
    when v_action.status='evidence_submitted' and p_transition='close' then 'closed'
    else null
  end;
  if v_next is null then raise exception 'BENEFIT_ACTION_TRANSITION_NOT_ALLOWED'; end if;
  update public.unified_action_items set
    status=v_next,
    evidence=case when p_transition='submit_evidence' then p_evidence else evidence end,
    close_evidence=case when p_transition='close' then coalesce(nullif(trim(p_comment),''),evidence::text) else close_evidence end,
    reviewer_user_id=case when p_transition in ('review_reject','close') then p_actor_user_id else reviewer_user_id end,
    accepted_at=case when p_transition='accept' then now() else accepted_at end,
    rejected_at=case when p_transition='review_reject' then now() else rejected_at end,
    reviewer_completed_at=case when p_transition='close' then now() else reviewer_completed_at end,
    closed_at=case when p_transition='close' then now() else closed_at end,
    updated_at=now(),version=version+1
  where id=p_action_id;
  if p_transition='close' then update public.benefit_realization_reviews set status='closed',updated_at=now(),version=version+1 where id=v_review.id and status='approved'; end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_review.org_id,v_review.project_id,'action',p_action_id,p_transition,v_action.status,v_next,p_actor_user_id,p_actor_business_role,jsonb_build_object('comment',trim(coalesce(p_comment,'')),'evidence_count',case when jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))='array' then jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) else 0 end),p_request_id);
  return jsonb_build_object('action',(select to_jsonb(a) from public.unified_action_items a where a.id=p_action_id),'review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=v_review.id));
end;
$$;

create or replace function public.confirm_portfolio_scenario_tx(
  p_scenario_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_impact_owner_user_id uuid,
  p_impact_due_date date,
  p_acceptance_criteria text,
  p_impact_summary text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_scenario public.portfolio_scenarios%rowtype;
  v_package_id uuid := public.uuid_generate_v4();
  v_action_id uuid;
begin
  if p_actor_business_role<>'ceo' then raise exception 'CEO_CONTEXT_REQUIRED'; end if;
  if p_subject_scope not in ('portfolio','organization') then raise exception 'PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED'; end if;
  if p_impact_owner_user_id is null or p_impact_due_date is null or nullif(trim(p_acceptance_criteria),'') is null or nullif(trim(p_impact_summary),'') is null then raise exception 'SCENARIO_IMPACT_ACTION_REQUIRED'; end if;
  select * into v_scenario from public.portfolio_scenarios where id=p_scenario_id and org_id=p_org_id for update;
  if not found then raise exception 'SCENARIO_NOT_FOUND'; end if;
  if v_scenario.status<>'draft' then raise exception 'SCENARIO_NOT_CONFIRMABLE'; end if;
  if p_subject_scope='portfolio' and (v_scenario.portfolio_id is null or v_scenario.portfolio_id::text<>p_subject_id) then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if p_subject_scope='organization' and p_subject_id<>p_org_id::text then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;

  update public.portfolio_scenarios set status='confirmed',confirmed_by=p_actor_user_id,confirmed_at=now(),updated_at=now() where id=p_scenario_id;
  insert into public.scenario_impact_packages(id,scenario_id,org_id,portfolio_id,proposed_changes,impact_summary,status,created_by,data_class)
  values (v_package_id,p_scenario_id,v_scenario.org_id,v_scenario.portfolio_id,jsonb_build_object('assumptions',v_scenario.assumptions,'calculated_results',v_scenario.results),trim(p_impact_summary),'pending_application',p_actor_user_id,v_scenario.data_class);
  insert into public.unified_action_items(source_type,source_id,title,owner,due_date,status,priority,created_by,created_by_name,metadata,org_id,subject_scope,subject_id,owner_user_id,acceptance_criteria,idempotency_key)
  values ('scenario',p_scenario_id::text,'评审并应用情景影响包：'||v_scenario.name,coalesce((select name from public.app_users where id=p_impact_owner_user_id),'待确认责任人'),p_impact_due_date,'assigned','P1',p_actor_user_id,
    coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),jsonb_build_object('scenario_id',p_scenario_id,'impact_package_id',v_package_id,'business_facts_changed',false),
    v_scenario.org_id,p_subject_scope,p_subject_id,p_impact_owner_user_id,trim(p_acceptance_criteria),'scenario:'||p_scenario_id::text||':impact-application')
  returning id into v_action_id;
  update public.scenario_impact_packages set action_item_id=v_action_id where id=v_package_id;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_scenario.org_id,null,'scenario',p_scenario_id,'confirm_scenario','draft','confirmed',p_actor_user_id,p_actor_business_role,jsonb_build_object('impact_package_id',v_package_id,'action_item_id',v_action_id,'business_facts_changed',false),p_request_id);
  return jsonb_build_object('scenario',(select to_jsonb(s) from public.portfolio_scenarios s where s.id=p_scenario_id),'impact_package',(select to_jsonb(i) from public.scenario_impact_packages i where i.id=v_package_id),'action_item_id',v_action_id);
end;
$$;

revoke all on function public.decide_benefit_baseline_tx(uuid,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.start_benefit_tracking_tx(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.submit_benefit_review_tx(uuid,text,timestamptz,numeric,numeric,text,jsonb,uuid,date,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.decide_benefit_review_tx(uuid,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_benefit_action_tx(uuid,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.confirm_portfolio_scenario_tx(uuid,uuid,text,text,uuid,date,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_benefit_baseline_tx(uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.start_benefit_tracking_tx(uuid,uuid,text,text) to service_role;
grant execute on function public.submit_benefit_review_tx(uuid,text,timestamptz,numeric,numeric,text,jsonb,uuid,date,text,uuid,text,text) to service_role;
grant execute on function public.decide_benefit_review_tx(uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.transition_benefit_action_tx(uuid,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.confirm_portfolio_scenario_tx(uuid,uuid,text,text,uuid,date,text,text,uuid,text,text) to service_role;
