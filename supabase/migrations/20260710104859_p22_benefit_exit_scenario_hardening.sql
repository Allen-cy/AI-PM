-- P22 benefit-realization hardening.
-- Adds an explicit G6 gate, evidence-backed exit handover, scoped action data classes,
-- and a closed-loop state machine for confirmed portfolio scenario impact packages.

alter table public.project_benefit_baselines
  add column if not exists g6_review_due_date date,
  add column if not exists exit_criteria text,
  add column if not exists g6_reviewed_at timestamptz,
  add column if not exists g6_outcome text,
  add column if not exists request_id text;

do $$
begin
  if exists (
    select 1 from public.project_benefit_baselines
    where g6_review_due_date is null or nullif(trim(exit_criteria),'') is null
  ) then
    raise exception 'P22_HARDENING_REQUIRES_REAL_G6_AND_EXIT_CRITERIA_BACKFILL';
  end if;
end
$$;

alter table public.project_benefit_baselines
  alter column g6_review_due_date set not null,
  alter column exit_criteria set not null;

alter table public.project_benefit_baselines drop constraint if exists project_benefit_baselines_status_check;
alter table public.project_benefit_baselines add constraint project_benefit_baselines_status_check
  check (status in ('draft','approved','tracking','at_risk','realized','not_realized','exit_pending','retired'));
alter table public.project_benefit_baselines drop constraint if exists project_benefit_baselines_g6_outcome_check;
alter table public.project_benefit_baselines add constraint project_benefit_baselines_g6_outcome_check
  check (g6_outcome is null or g6_outcome in ('realized','not_realized'));

create unique index if not exists idx_benefit_baseline_request
  on public.project_benefit_baselines(request_id) where request_id is not null;

alter table public.unified_action_items
  add column if not exists data_class text not null default 'unclassified';
alter table public.unified_action_items drop constraint if exists unified_action_items_data_class_check;
alter table public.unified_action_items add constraint unified_action_items_data_class_check
  check (data_class in ('production','sample','test','diagnostic','unclassified'));
alter table public.unified_action_items drop constraint if exists unified_action_items_source_type_check;
alter table public.unified_action_items add constraint unified_action_items_source_type_check
  check (source_type in ('risk','issue','change','governance','signal','decision','report','cadence','benefit','benefit_handover','scenario','ai_assistant','manual'));

update public.unified_action_items action
set data_class=project.data_class
from public.projects project
where action.project_id=project.id and action.data_class='unclassified' and project.data_class<>'unclassified';

update public.unified_action_items action
set data_class=brief.data_class
from public.decision_briefs brief
where action.source_type='decision' and action.source_id=brief.id::text and action.data_class='unclassified' and brief.data_class<>'unclassified';

create or replace function public.derive_unified_action_data_class()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_data_class text;
begin
  if new.data_class is null or new.data_class='unclassified' then
    if new.project_id is not null then
      select data_class into v_data_class from public.projects where id=new.project_id;
    end if;
    if (v_data_class is null or v_data_class='unclassified') and new.metadata->>'data_class' in ('production','sample','test','diagnostic','unclassified') then
      v_data_class := new.metadata->>'data_class';
    end if;
    if (v_data_class is null or v_data_class='unclassified') and new.source_type='decision' and new.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select data_class into v_data_class from public.decision_briefs where id=new.source_id::uuid;
    end if;
    if v_data_class in ('production','sample','test','diagnostic','unclassified') then new.data_class := v_data_class; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_derive_unified_action_data_class on public.unified_action_items;
create trigger trg_derive_unified_action_data_class
before insert or update of project_id,metadata,source_type,data_class on public.unified_action_items
for each row execute function public.derive_unified_action_data_class();

revoke all on function public.derive_unified_action_data_class() from public,anon,authenticated;
grant execute on function public.derive_unified_action_data_class() to service_role;

create table if not exists public.benefit_realization_handovers (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  benefit_baseline_id uuid not null references public.project_benefit_baselines(id) on delete cascade,
  exit_review_id uuid not null references public.benefit_realization_reviews(id) on delete cascade,
  from_owner_user_id uuid not null references public.app_users(id) on delete restrict,
  to_owner_user_id uuid not null references public.app_users(id) on delete restrict,
  due_date date not null,
  acceptance_criteria text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','accepted','rejected','in_progress','evidence_submitted','completed','cancelled')),
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  submitted_by uuid not null references public.app_users(id) on delete restrict,
  accepted_by uuid references public.app_users(id) on delete set null,
  reviewed_by uuid references public.app_users(id) on delete set null,
  rejection_reason text,
  accepted_at timestamptz,
  completed_at timestamptz,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (exit_review_id)
);

create index if not exists idx_benefit_handover_scope
  on public.benefit_realization_handovers(org_id,project_id,data_class,status,updated_at desc);
create unique index if not exists idx_benefit_handover_request
  on public.benefit_realization_handovers(request_id) where request_id is not null;
create unique index if not exists idx_benefit_single_open_gate_review
  on public.benefit_realization_reviews(benefit_baseline_id,review_gate)
  where status in ('submitted','approved');

alter table public.benefit_realization_events drop constraint if exists benefit_realization_events_subject_type_check;
alter table public.benefit_realization_events add constraint benefit_realization_events_subject_type_check
  check (subject_type in ('baseline','review','action','handover','scenario','impact_package'));

alter table public.benefit_realization_handovers enable row level security;
revoke all on table public.benefit_realization_handovers from public,anon,authenticated;
grant select,insert,update,delete on table public.benefit_realization_handovers to service_role;

create or replace function public.enforce_benefit_baseline_gate_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.g6_review_due_date is null then raise exception 'BENEFIT_G6_REVIEW_DUE_DATE_REQUIRED'; end if;
  if nullif(trim(new.exit_criteria),'') is null then raise exception 'BENEFIT_EXIT_CRITERIA_REQUIRED'; end if;
  return new;
end;
$$;

drop function if exists public.decide_benefit_review_tx(uuid,text,text,uuid,text,text);
create or replace function public.decide_benefit_review_tx(
  p_review_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
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
  v_handover_action_id uuid;
begin
  if p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_REVIEW_ROLE_FORBIDDEN'; end if;
  if p_decision not in ('approve','reject') then raise exception 'BENEFIT_DECISION_INVALID'; end if;
  if nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_DECISION_COMMENT_REQUIRED'; end if;
  select * into v_review from public.benefit_realization_reviews
    where id=p_review_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_REVIEW_OUTSIDE_CONTEXT'; end if;
  if v_review.status<>'submitted' then raise exception 'BENEFIT_REVIEW_NOT_SUBMITTED'; end if;
  select * into v_baseline from public.project_benefit_baselines
    where id=v_review.benefit_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_BASELINE_OUTSIDE_CONTEXT'; end if;

  insert into public.benefit_review_decisions(benefit_review_id,reviewer_user_id,reviewer_business_role,decision,comment,request_id,decided_at)
  values (p_review_id,p_actor_user_id,p_actor_business_role,p_decision,trim(p_comment),p_request_id,now())
  on conflict (benefit_review_id,reviewer_business_role) do update set
    reviewer_user_id=excluded.reviewer_user_id,decision=excluded.decision,comment=excluded.comment,request_id=excluded.request_id,decided_at=now();

  if p_decision='reject' then
    select action_item_id into v_handover_action_id from public.benefit_realization_handovers where exit_review_id=p_review_id for update;
    update public.benefit_realization_reviews set status='rejected',updated_at=now(),version=version+1 where id=p_review_id;
    update public.unified_action_items set status='cancelled',updated_at=now(),version=version+1
      where id in (v_review.action_item_id,v_handover_action_id) and status in ('assigned','accepted','rejected','in_progress','evidence_submitted');
    update public.benefit_realization_handovers set status='cancelled',rejection_reason=trim(p_comment),reviewed_by=p_actor_user_id,updated_at=now(),version=version+1
      where exit_review_id=p_review_id and status<>'completed';
    insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
    values (p_org_id,p_project_id,'review',p_review_id,'human_review','submitted','rejected',p_actor_user_id,p_actor_business_role,
      jsonb_build_object('decision',p_decision,'comment',trim(p_comment)),p_request_id);
    return jsonb_build_object('review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=p_review_id),'all_approved',false);
  end if;

  select count(*) filter (where decision='approve')=3 and count(distinct reviewer_business_role)=3
  into v_all_approved from public.benefit_review_decisions where benefit_review_id=p_review_id;
  if v_all_approved then
    v_next_status := case
      when v_review.review_gate='exit' then 'exit_pending'
      when v_review.review_gate='G6' and v_review.review_outcome='not_realized' then 'not_realized'
      when v_review.review_gate='G6' then 'realized'
      when v_review.review_outcome='at_risk' then 'at_risk'
      else 'tracking'
    end;
    update public.project_benefit_baselines set
      forecast_value=v_review.forecast_value,
      actual_value=v_review.actual_value,
      status=v_next_status,
      g6_reviewed_at=case when v_review.review_gate='G6' then now() else g6_reviewed_at end,
      g6_outcome=case when v_review.review_gate='G6' then case when v_review.review_outcome='not_realized' then 'not_realized' else 'realized' end else g6_outcome end,
      updated_at=now(),version=version+1
    where id=v_baseline.id;
    update public.benefit_realization_reviews set
      status=case when v_review.review_gate='exit' or action_required then 'approved' else 'closed' end,
      updated_at=now(),version=version+1
    where id=p_review_id;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'review',p_review_id,'human_review','submitted',
    case when v_all_approved then case when v_review.review_gate='exit' or v_review.action_required then 'approved' else 'closed' end else 'submitted' end,
    p_actor_user_id,p_actor_business_role,jsonb_build_object('decision',p_decision,'comment',trim(p_comment),'baseline_status',v_next_status,'all_approved',v_all_approved),p_request_id);
  return jsonb_build_object(
    'review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=p_review_id),
    'baseline',(select to_jsonb(b) from public.project_benefit_baselines b where b.id=v_baseline.id),
    'handover',(select to_jsonb(h) from public.benefit_realization_handovers h where h.exit_review_id=p_review_id),
    'all_approved',v_all_approved
  );
end;
$$;

drop function if exists public.submit_benefit_review_tx(uuid,text,timestamptz,numeric,numeric,text,jsonb,uuid,date,text,uuid,text,text);
create or replace function public.submit_benefit_review_tx(
  p_baseline_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_review_gate text,
  p_snapshot_at timestamptz,
  p_forecast_value numeric,
  p_actual_value numeric,
  p_conclusion text,
  p_evidence jsonb,
  p_action_owner_user_id uuid,
  p_action_due_date date,
  p_action_acceptance_criteria text,
  p_handover_owner_user_id uuid,
  p_handover_due_date date,
  p_handover_acceptance_criteria text,
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
  v_handover_id uuid;
  v_handover_action_id uuid;
  v_under_target boolean;
  v_outcome text;
begin
  if p_actor_business_role not in ('operations','business_owner','finance','pmo') then raise exception 'BENEFIT_SUBMIT_ROLE_FORBIDDEN'; end if;
  if p_review_gate not in ('monthly','quarterly','G6','exit') then raise exception 'BENEFIT_REVIEW_GATE_INVALID'; end if;
  if nullif(trim(p_conclusion),'') is null then raise exception 'BENEFIT_REVIEW_CONCLUSION_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0 then raise exception 'BENEFIT_REVIEW_EVIDENCE_REQUIRED'; end if;
  if p_forecast_value is null or p_actual_value is null then raise exception 'BENEFIT_REVIEW_VALUES_REQUIRED'; end if;
  select * into v_baseline from public.project_benefit_baselines
    where id=p_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_BASELINE_OUTSIDE_CONTEXT'; end if;
  if p_review_gate in ('monthly','quarterly','G6') and v_baseline.status not in ('tracking','at_risk') then raise exception 'BENEFIT_REVIEW_NOT_TRACKING'; end if;
  if p_review_gate='exit' then
    if v_baseline.g6_reviewed_at is null then raise exception 'BENEFIT_G6_REVIEW_REQUIRED'; end if;
    if v_baseline.status not in ('realized','not_realized') then raise exception 'BENEFIT_EXIT_REVIEW_NOT_ALLOWED'; end if;
    if p_handover_owner_user_id is null or p_handover_due_date is null or nullif(trim(p_handover_acceptance_criteria),'') is null then
      raise exception 'BENEFIT_EXIT_HANDOVER_REQUIRED';
    end if;
  end if;
  if p_request_id is not null and exists (select 1 from public.benefit_realization_reviews where request_id=p_request_id) then
    return (select jsonb_build_object(
      'review',to_jsonb(r),
      'action_item_id',r.action_item_id,
      'handover',(select to_jsonb(h) from public.benefit_realization_handovers h where h.exit_review_id=r.id)
    ) from public.benefit_realization_reviews r where r.request_id=p_request_id);
  end if;

  v_under_target := case when p_review_gate in ('G6','exit') then p_actual_value<v_baseline.target_value else p_forecast_value<v_baseline.target_value end;
  v_outcome := case when p_review_gate='exit' then 'retire' when p_review_gate='G6' and v_under_target then 'not_realized' when p_review_gate='G6' then 'realized' when v_under_target then 'at_risk' else 'on_track' end;
  if v_under_target and (p_action_owner_user_id is null or p_action_due_date is null or nullif(trim(p_action_acceptance_criteria),'') is null) then
    raise exception 'BENEFIT_CORRECTIVE_ACTION_REQUIRED';
  end if;

  insert into public.benefit_realization_reviews(
    id,org_id,benefit_baseline_id,project_id,review_gate,snapshot_at,forecast_value,actual_value,variance,
    conclusion,review_outcome,action_required,submitted_by,submitted_business_role,evidence,status,data_class,request_id
  ) values (
    v_review_id,p_org_id,p_baseline_id,p_project_id,p_review_gate,coalesce(p_snapshot_at,now()),p_forecast_value,p_actual_value,
    p_actual_value-v_baseline.target_value,trim(p_conclusion),v_outcome,v_under_target,p_actor_user_id,p_actor_business_role,p_evidence,'submitted',p_data_class,p_request_id
  );

  if v_under_target then
    insert into public.unified_action_items(
      source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
      org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key,data_class
    ) values (
      'benefit',v_review_id::text,(select name from public.projects where id=p_project_id),'收益纠偏：'||v_baseline.benefit_name,
      coalesce((select name from public.app_users where id=p_action_owner_user_id),'待确认责任人'),p_action_due_date,'assigned','P1',p_actor_user_id,
      coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),
      jsonb_build_object('benefit_baseline_id',p_baseline_id,'benefit_review_id',v_review_id,'review_gate',p_review_gate,'data_class',p_data_class),
      p_org_id,'project',p_project_id::text,p_project_id,p_action_owner_user_id,trim(p_action_acceptance_criteria),'benefit-review:'||v_review_id::text,p_data_class
    ) returning id into v_action_id;
    update public.benefit_realization_reviews set action_item_id=v_action_id where id=v_review_id;
  end if;

  if p_review_gate='exit' then
    v_handover_id := public.uuid_generate_v4();
    insert into public.benefit_realization_handovers(
      id,org_id,project_id,benefit_baseline_id,exit_review_id,from_owner_user_id,to_owner_user_id,due_date,
      acceptance_criteria,status,submitted_by,data_class,request_id
    ) values (
      v_handover_id,p_org_id,p_project_id,p_baseline_id,v_review_id,v_baseline.benefit_owner_user_id,p_handover_owner_user_id,
      p_handover_due_date,trim(p_handover_acceptance_criteria),'proposed',p_actor_user_id,p_data_class,p_request_id
    );
    insert into public.unified_action_items(
      source_type,source_id,project_name,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
      org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key,data_class
    ) values (
      'benefit_handover',v_handover_id::text,(select name from public.projects where id=p_project_id),'收益退出移交：'||v_baseline.benefit_name,
      coalesce((select name from public.app_users where id=p_handover_owner_user_id),'待确认接收人'),p_handover_due_date,'assigned','P1',p_actor_user_id,
      coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),
      jsonb_build_object('benefit_baseline_id',p_baseline_id,'benefit_review_id',v_review_id,'handover_id',v_handover_id,'data_class',p_data_class),
      p_org_id,'project',p_project_id::text,p_project_id,p_handover_owner_user_id,trim(p_handover_acceptance_criteria),'benefit-handover:'||v_handover_id::text,p_data_class
    ) returning id into v_handover_action_id;
    update public.benefit_realization_handovers set action_item_id=v_handover_action_id where id=v_handover_id;
  end if;

  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'review',v_review_id,'submit_review','submitted',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('review_gate',p_review_gate,'under_target',v_under_target,'action_item_id',v_action_id,'handover_id',v_handover_id,'handover_action_id',v_handover_action_id,'data_class',p_data_class),p_request_id);
  return jsonb_build_object(
    'review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=v_review_id),
    'action_item_id',v_action_id,
    'handover',(select to_jsonb(h) from public.benefit_realization_handovers h where h.id=v_handover_id)
  );
end;
$$;

drop trigger if exists trg_enforce_benefit_baseline_gate_fields on public.project_benefit_baselines;
create trigger trg_enforce_benefit_baseline_gate_fields
before insert or update on public.project_benefit_baselines
for each row execute function public.enforce_benefit_baseline_gate_fields();

revoke all on function public.enforce_benefit_baseline_gate_fields() from public,anon,authenticated;
grant execute on function public.enforce_benefit_baseline_gate_fields() to service_role;

create or replace function public.create_benefit_baseline_tx(
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
  p_baseline_version text,
  p_benefit_name text,
  p_benefit_type text,
  p_metric_key text,
  p_baseline_value numeric,
  p_target_value numeric,
  p_forecast_value numeric,
  p_actual_value numeric,
  p_currency text,
  p_unit text,
  p_benefit_owner_user_id uuid,
  p_realization_due_date date,
  p_g6_review_due_date date,
  p_exit_criteria text,
  p_exit_threshold numeric,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_baseline_id uuid := public.uuid_generate_v4();
begin
  if p_actor_business_role not in ('operations','pmo','business_owner') then raise exception 'BENEFIT_BASELINE_CREATE_ROLE_FORBIDDEN'; end if;
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'BENEFIT_DATA_CLASS_INVALID'; end if;
  if not exists (select 1 from public.projects where id=p_project_id and org_id=p_org_id and data_class=p_data_class) then raise exception 'PROJECT_OUTSIDE_CONTEXT'; end if;
  if p_benefit_owner_user_id is null then raise exception 'BENEFIT_OWNER_REQUIRED'; end if;
  if p_target_value is null or p_target_value<=0 then raise exception 'TARGET_VALUE_MUST_BE_POSITIVE'; end if;
  if p_realization_due_date is null then raise exception 'REALIZATION_DUE_DATE_REQUIRED'; end if;
  if p_g6_review_due_date is null then raise exception 'BENEFIT_G6_REVIEW_DUE_DATE_REQUIRED'; end if;
  if p_g6_review_due_date>p_realization_due_date then raise exception 'BENEFIT_G6_AFTER_REALIZATION_DUE_DATE'; end if;
  if nullif(trim(p_exit_criteria),'') is null then raise exception 'BENEFIT_EXIT_CRITERIA_REQUIRED'; end if;
  if p_request_id is not null and exists (select 1 from public.project_benefit_baselines where request_id=p_request_id) then
    return (select to_jsonb(b) from public.project_benefit_baselines b where b.request_id=p_request_id);
  end if;

  insert into public.project_benefit_baselines(
    id,org_id,project_id,baseline_version,benefit_name,benefit_type,metric_key,baseline_value,target_value,
    forecast_value,actual_value,currency,unit,benefit_owner_user_id,realization_due_date,g6_review_due_date,
    exit_criteria,exit_threshold,status,data_class,created_by,request_id
  ) values (
    v_baseline_id,p_org_id,p_project_id,trim(p_baseline_version),trim(p_benefit_name),p_benefit_type,trim(p_metric_key),p_baseline_value,p_target_value,
    p_forecast_value,p_actual_value,nullif(trim(p_currency),''),nullif(trim(p_unit),''),p_benefit_owner_user_id,p_realization_due_date,p_g6_review_due_date,
    trim(p_exit_criteria),p_exit_threshold,'draft',p_data_class,p_actor_user_id,p_request_id
  );
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'baseline',v_baseline_id,'create_baseline','draft',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('data_class',p_data_class,'g6_review_due_date',p_g6_review_due_date,'exit_criteria_confirmed',true),p_request_id);
  return (select to_jsonb(b) from public.project_benefit_baselines b where b.id=v_baseline_id);
end;
$$;

drop function if exists public.decide_benefit_baseline_tx(uuid,text,text,uuid,text,text);
create or replace function public.decide_benefit_baseline_tx(
  p_baseline_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
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
  v_all_approved boolean;
begin
  if p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_REVIEW_ROLE_FORBIDDEN'; end if;
  if p_decision not in ('approve','reject') then raise exception 'BENEFIT_DECISION_INVALID'; end if;
  if nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_DECISION_COMMENT_REQUIRED'; end if;
  select * into v_baseline from public.project_benefit_baselines
    where id=p_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_BASELINE_OUTSIDE_CONTEXT'; end if;
  if v_baseline.status<>'draft' then raise exception 'BENEFIT_BASELINE_NOT_DRAFT'; end if;

  insert into public.benefit_baseline_decisions(benefit_baseline_id,reviewer_user_id,reviewer_business_role,decision,comment,request_id,decided_at)
  values (p_baseline_id,p_actor_user_id,p_actor_business_role,p_decision,trim(p_comment),p_request_id,now())
  on conflict (benefit_baseline_id,reviewer_business_role) do update set
    reviewer_user_id=excluded.reviewer_user_id,decision=excluded.decision,comment=excluded.comment,request_id=excluded.request_id,decided_at=now();

  select count(*) filter (where decision='approve')=3 and count(distinct reviewer_business_role)=3
  into v_all_approved from public.benefit_baseline_decisions where benefit_baseline_id=p_baseline_id;
  if v_all_approved then
    update public.project_benefit_baselines set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_at=now(),version=version+1 where id=p_baseline_id;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'baseline',p_baseline_id,'baseline_review','draft',case when v_all_approved then 'approved' else 'draft' end,
    p_actor_user_id,p_actor_business_role,jsonb_build_object('decision',p_decision,'comment',trim(p_comment),'all_approved',v_all_approved),p_request_id);
  return jsonb_build_object('baseline',(select to_jsonb(b) from public.project_benefit_baselines b where b.id=p_baseline_id),'all_approved',v_all_approved);
end;
$$;

drop function if exists public.start_benefit_tracking_tx(uuid,uuid,text,text);
create or replace function public.start_benefit_tracking_tx(
  p_baseline_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
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
begin
  if p_actor_business_role not in ('business_owner','pmo') then raise exception 'BENEFIT_TRACKING_ROLE_FORBIDDEN'; end if;
  select * into v_baseline from public.project_benefit_baselines
    where id=p_baseline_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_BASELINE_OUTSIDE_CONTEXT'; end if;
  if v_baseline.status<>'approved' then raise exception 'BENEFIT_BASELINE_NOT_APPROVED'; end if;
  update public.project_benefit_baselines set status='tracking',updated_at=now(),version=version+1 where id=p_baseline_id;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id)
  values (p_org_id,p_project_id,'baseline',p_baseline_id,'start_tracking','approved','tracking',p_actor_user_id,p_actor_business_role,p_request_id);
  return (select to_jsonb(b) from public.project_benefit_baselines b where b.id=p_baseline_id);
end;
$$;

create or replace function public.finalize_benefit_exit_if_ready_tx(
  p_review_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review public.benefit_realization_reviews%rowtype;
  v_handover public.benefit_realization_handovers%rowtype;
  v_corrective_status text;
begin
  select * into v_review from public.benefit_realization_reviews where id=p_review_id for update;
  if not found or v_review.review_gate<>'exit' or v_review.status<>'approved' then return false; end if;
  select * into v_handover from public.benefit_realization_handovers where exit_review_id=p_review_id for update;
  if not found or v_handover.status<>'completed' then return false; end if;
  if v_review.action_required then
    select status into v_corrective_status from public.unified_action_items where id=v_review.action_item_id;
    if v_corrective_status is distinct from 'closed' then return false; end if;
  end if;
  update public.project_benefit_baselines set status='retired',updated_at=now(),version=version+1 where id=v_review.benefit_baseline_id and status='exit_pending';
  update public.benefit_realization_reviews set status='closed',updated_at=now(),version=version+1 where id=p_review_id;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (v_review.org_id,v_review.project_id,'review',p_review_id,'finalize_exit','approved','closed',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('baseline_status','retired','handover_id',v_handover.id,'corrective_action_id',v_review.action_item_id),p_request_id);
  return true;
end;
$$;

drop function if exists public.transition_benefit_action_tx(uuid,text,text,jsonb,uuid,text,text);
create or replace function public.transition_benefit_action_tx(
  p_action_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
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
  select * into v_action from public.unified_action_items
    where id=p_action_id and source_type='benefit' and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_ACTION_OUTSIDE_CONTEXT'; end if;
  select * into v_review from public.benefit_realization_reviews
    where id=v_action.source_id::uuid and action_item_id=p_action_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_REVIEW_OUTSIDE_CONTEXT'; end if;
  if p_transition in ('accept','start','submit_evidence') and v_review.status<>'approved' then raise exception 'BENEFIT_REVIEW_APPROVAL_REQUIRED'; end if;
  if p_transition in ('accept','start','submit_evidence') and v_action.owner_user_id<>p_actor_user_id then raise exception 'BENEFIT_ACTION_OWNER_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_ACTION_REVIEW_ROLE_REQUIRED'; end if;
  if p_transition='submit_evidence' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'BENEFIT_ACTION_EVIDENCE_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_ACTION_REVIEW_COMMENT_REQUIRED'; end if;
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
    close_evidence=case when p_transition='close' then trim(p_comment) else close_evidence end,
    reviewer_user_id=case when p_transition in ('review_reject','close') then p_actor_user_id else reviewer_user_id end,
    accepted_at=case when p_transition='accept' then now() else accepted_at end,
    rejected_at=case when p_transition='review_reject' then now() else rejected_at end,
    reviewer_completed_at=case when p_transition='close' then now() else reviewer_completed_at end,
    closed_at=case when p_transition='close' then now() else closed_at end,
    updated_at=now(),version=version+1
  where id=p_action_id;
  if p_transition='close' then
    if v_review.review_gate='exit' then
      perform public.finalize_benefit_exit_if_ready_tx(v_review.id,p_actor_user_id,p_actor_business_role,p_request_id);
    else
      update public.benefit_realization_reviews set status='closed',updated_at=now(),version=version+1 where id=v_review.id and status='approved';
    end if;
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'action',p_action_id,p_transition,v_action.status,v_next,p_actor_user_id,p_actor_business_role,
    jsonb_build_object('comment',trim(coalesce(p_comment,'')),'data_class',p_data_class,'evidence_count',case when jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))='array' then jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) else 0 end),p_request_id);
  return jsonb_build_object('action',(select to_jsonb(a) from public.unified_action_items a where a.id=p_action_id),'review',(select to_jsonb(r) from public.benefit_realization_reviews r where r.id=v_review.id));
end;
$$;

create or replace function public.transition_benefit_handover_tx(
  p_handover_id uuid,
  p_org_id uuid,
  p_project_id uuid,
  p_data_class text,
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
  v_handover public.benefit_realization_handovers%rowtype;
  v_action public.unified_action_items%rowtype;
  v_review_status text;
  v_next text;
begin
  select * into v_handover from public.benefit_realization_handovers
    where id=p_handover_id and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_HANDOVER_OUTSIDE_CONTEXT'; end if;
  select * into v_action from public.unified_action_items
    where id=v_handover.action_item_id and source_type='benefit_handover' and org_id=p_org_id and project_id=p_project_id and data_class=p_data_class for update;
  if not found then raise exception 'BENEFIT_HANDOVER_ACTION_NOT_FOUND'; end if;
  select status into v_review_status from public.benefit_realization_reviews where id=v_handover.exit_review_id for update;
  if p_transition in ('accept','start','submit_evidence') and v_review_status<>'approved' then raise exception 'BENEFIT_HANDOVER_REVIEW_APPROVAL_REQUIRED'; end if;
  if p_transition in ('accept','start','submit_evidence') and v_handover.to_owner_user_id<>p_actor_user_id then raise exception 'BENEFIT_HANDOVER_RECIPIENT_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and p_actor_business_role not in ('business_owner','finance','pmo') then raise exception 'BENEFIT_HANDOVER_REVIEW_ROLE_REQUIRED'; end if;
  if p_transition='submit_evidence' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'BENEFIT_HANDOVER_EVIDENCE_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and nullif(trim(p_comment),'') is null then raise exception 'BENEFIT_HANDOVER_REVIEW_COMMENT_REQUIRED'; end if;
  v_next := case
    when v_handover.status in ('proposed','rejected') and p_transition='accept' then 'accepted'
    when v_handover.status='accepted' and p_transition='start' then 'in_progress'
    when v_handover.status='in_progress' and p_transition='submit_evidence' then 'evidence_submitted'
    when v_handover.status='evidence_submitted' and p_transition='review_reject' then 'rejected'
    when v_handover.status='evidence_submitted' and p_transition='close' then 'completed'
    else null
  end;
  if v_next is null then raise exception 'BENEFIT_HANDOVER_TRANSITION_NOT_ALLOWED'; end if;
  update public.benefit_realization_handovers set
    status=v_next,
    evidence=case when p_transition='submit_evidence' then p_evidence else evidence end,
    accepted_by=case when p_transition='accept' then p_actor_user_id else accepted_by end,
    accepted_at=case when p_transition='accept' then now() else accepted_at end,
    reviewed_by=case when p_transition in ('review_reject','close') then p_actor_user_id else reviewed_by end,
    rejection_reason=case when p_transition='review_reject' then trim(p_comment) else rejection_reason end,
    completed_at=case when p_transition='close' then now() else completed_at end,
    updated_at=now(),version=version+1
  where id=p_handover_id;
  update public.unified_action_items set
    status=case when v_next='completed' then 'closed' when v_next='rejected' then 'rejected' else v_next end,
    evidence=case when p_transition='submit_evidence' then p_evidence else evidence end,
    close_evidence=case when p_transition='close' then trim(p_comment) else close_evidence end,
    reviewer_user_id=case when p_transition in ('review_reject','close') then p_actor_user_id else reviewer_user_id end,
    accepted_at=case when p_transition='accept' then now() else accepted_at end,
    rejected_at=case when p_transition='review_reject' then now() else rejected_at end,
    reviewer_completed_at=case when p_transition='close' then now() else reviewer_completed_at end,
    closed_at=case when p_transition='close' then now() else closed_at end,
    updated_at=now(),version=version+1
  where id=v_action.id;
  if p_transition='close' then
    perform public.finalize_benefit_exit_if_ready_tx(v_handover.exit_review_id,p_actor_user_id,p_actor_business_role,p_request_id);
  end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,p_project_id,'handover',p_handover_id,p_transition,v_handover.status,v_next,p_actor_user_id,p_actor_business_role,
    jsonb_build_object('comment',trim(coalesce(p_comment,'')),'data_class',p_data_class,'evidence_count',case when jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))='array' then jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) else 0 end),p_request_id);
  return jsonb_build_object(
    'handover',(select to_jsonb(h) from public.benefit_realization_handovers h where h.id=p_handover_id),
    'action',(select to_jsonb(a) from public.unified_action_items a where a.id=v_action.id),
    'baseline',(select to_jsonb(b) from public.project_benefit_baselines b where b.id=v_handover.benefit_baseline_id)
  );
end;
$$;

drop function if exists public.confirm_portfolio_scenario_tx(uuid,uuid,text,text,uuid,date,text,text,uuid,text,text);
create or replace function public.confirm_portfolio_scenario_tx(
  p_scenario_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
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
  select * into v_scenario from public.portfolio_scenarios
    where id=p_scenario_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if v_scenario.status<>'draft' then raise exception 'SCENARIO_NOT_CONFIRMABLE'; end if;
  if p_subject_scope='portfolio' and (v_scenario.portfolio_id is null or v_scenario.portfolio_id::text<>p_subject_id) then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if p_subject_scope='organization' and p_subject_id<>p_org_id::text then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;

  update public.portfolio_scenarios set status='confirmed',confirmed_by=p_actor_user_id,confirmed_at=now(),updated_at=now() where id=p_scenario_id;
  insert into public.scenario_impact_packages(id,scenario_id,org_id,portfolio_id,proposed_changes,impact_summary,status,created_by,data_class)
  values (
    v_package_id,p_scenario_id,p_org_id,v_scenario.portfolio_id,
    jsonb_build_object('baseline_snapshot',v_scenario.baseline_snapshot,'assumptions',v_scenario.assumptions,'calculated_results',v_scenario.results),
    trim(p_impact_summary),'pending_application',p_actor_user_id,p_data_class
  );
  insert into public.unified_action_items(
    source_type,source_id,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
    org_id,subject_scope,subject_id,owner_user_id,acceptance_criteria,idempotency_key,data_class
  ) values (
    'scenario',p_scenario_id::text,'评审并应用情景影响包：'||v_scenario.name,
    coalesce((select name from public.app_users where id=p_impact_owner_user_id),'待确认责任人'),p_impact_due_date,'assigned','P1',p_actor_user_id,
    coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),
    jsonb_build_object('scenario_id',p_scenario_id,'impact_package_id',v_package_id,'business_facts_changed',false,'data_class',p_data_class),
    p_org_id,p_subject_scope,p_subject_id,p_impact_owner_user_id,trim(p_acceptance_criteria),'scenario:'||p_scenario_id::text||':impact-application',p_data_class
  ) returning id into v_action_id;
  update public.scenario_impact_packages set action_item_id=v_action_id where id=v_package_id;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,null,'scenario',p_scenario_id,'confirm_scenario','draft','confirmed',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('impact_package_id',v_package_id,'action_item_id',v_action_id,'business_facts_changed',false,'data_class',p_data_class),p_request_id);
  return jsonb_build_object(
    'scenario',(select to_jsonb(s) from public.portfolio_scenarios s where s.id=p_scenario_id),
    'impact_package',(select to_jsonb(i) from public.scenario_impact_packages i where i.id=v_package_id),
    'action_item_id',v_action_id
  );
end;
$$;

create or replace function public.transition_scenario_impact_action_tx(
  p_action_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
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
  v_package public.scenario_impact_packages%rowtype;
  v_scenario public.portfolio_scenarios%rowtype;
  v_next_action text;
  v_next_package text;
begin
  if p_subject_scope not in ('portfolio','organization') then raise exception 'PORTFOLIO_OR_ORGANIZATION_CONTEXT_REQUIRED'; end if;
  select * into v_action from public.unified_action_items
    where id=p_action_id and source_type='scenario' and org_id=p_org_id and subject_scope=p_subject_scope and subject_id=p_subject_id and data_class=p_data_class for update;
  if not found then raise exception 'SCENARIO_ACTION_OUTSIDE_CONTEXT'; end if;
  select * into v_package from public.scenario_impact_packages
    where action_item_id=p_action_id and scenario_id=v_action.source_id::uuid and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'SCENARIO_IMPACT_PACKAGE_OUTSIDE_CONTEXT'; end if;
  select * into v_scenario from public.portfolio_scenarios
    where id=v_package.scenario_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if p_subject_scope='portfolio' and (v_scenario.portfolio_id is null or v_scenario.portfolio_id::text<>p_subject_id) then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if p_subject_scope='organization' and p_subject_id<>p_org_id::text then raise exception 'SCENARIO_OUTSIDE_CONTEXT'; end if;
  if p_transition in ('accept','start','submit_evidence') and v_action.owner_user_id<>p_actor_user_id then raise exception 'SCENARIO_ACTION_OWNER_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and p_actor_business_role not in ('pmo','finance','ceo') then raise exception 'SCENARIO_ACTION_REVIEW_ROLE_REQUIRED'; end if;
  if p_transition='submit_evidence' and (jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0) then raise exception 'SCENARIO_APPLICATION_EVIDENCE_REQUIRED'; end if;
  if p_transition in ('review_reject','close') and nullif(trim(p_comment),'') is null then raise exception 'SCENARIO_ACTION_REVIEW_COMMENT_REQUIRED'; end if;
  v_next_action := case
    when v_action.status in ('assigned','rejected') and p_transition='accept' then 'accepted'
    when v_action.status='accepted' and p_transition='start' then 'in_progress'
    when v_action.status='in_progress' and p_transition='submit_evidence' then 'evidence_submitted'
    when v_action.status='evidence_submitted' and p_transition='review_reject' then 'rejected'
    when v_action.status='evidence_submitted' and p_transition='close' then 'closed'
    else null
  end;
  if v_next_action is null then raise exception 'SCENARIO_IMPACT_TRANSITION_NOT_ALLOWED'; end if;
  v_next_package := case
    when p_transition in ('accept','start') then 'under_review'
    when p_transition='submit_evidence' then 'approved_for_application'
    when p_transition='review_reject' then 'rejected'
    when p_transition='close' then 'applied'
    else v_package.status
  end;
  update public.unified_action_items set
    status=v_next_action,
    evidence=case when p_transition='submit_evidence' then p_evidence else evidence end,
    close_evidence=case when p_transition='close' then trim(p_comment) else close_evidence end,
    reviewer_user_id=case when p_transition in ('review_reject','close') then p_actor_user_id else reviewer_user_id end,
    accepted_at=case when p_transition='accept' then now() else accepted_at end,
    rejected_at=case when p_transition='review_reject' then now() else rejected_at end,
    reviewer_completed_at=case when p_transition='close' then now() else reviewer_completed_at end,
    closed_at=case when p_transition='close' then now() else closed_at end,
    updated_at=now(),version=version+1
  where id=p_action_id;
  update public.scenario_impact_packages set status=v_next_package,updated_at=now() where id=v_package.id;
  if p_transition='close' then update public.portfolio_scenarios set status='applied',updated_at=now() where id=v_scenario.id; end if;
  insert into public.benefit_realization_events(org_id,project_id,subject_type,subject_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_org_id,null,'impact_package',v_package.id,p_transition,v_package.status,v_next_package,p_actor_user_id,p_actor_business_role,
    jsonb_build_object(
      'action_from_status',v_action.status,'action_to_status',v_next_action,'data_class',p_data_class,
      'business_facts_changed',false,'writeback_gate','BUSINESS_FACTS_REQUIRE_SEPARATE_CONFIRMED_WRITEBACK',
      'evidence_count',case when jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))='array' then jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)) else 0 end
    ),p_request_id);
  return jsonb_build_object(
    'scenario',(select to_jsonb(s) from public.portfolio_scenarios s where s.id=v_scenario.id),
    'impact_package',(select to_jsonb(i) from public.scenario_impact_packages i where i.id=v_package.id),
    'action',(select to_jsonb(a) from public.unified_action_items a where a.id=p_action_id),
    'business_facts_changed',false
  );
end;
$$;

revoke all on function public.create_benefit_baseline_tx(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,uuid,date,date,text,numeric,uuid,text,text) from public,anon,authenticated;
revoke all on function public.decide_benefit_baseline_tx(uuid,uuid,uuid,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.start_benefit_tracking_tx(uuid,uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.submit_benefit_review_tx(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,jsonb,uuid,date,text,uuid,date,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.decide_benefit_review_tx(uuid,uuid,uuid,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.finalize_benefit_exit_if_ready_tx(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_benefit_action_tx(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_benefit_handover_tx(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.confirm_portfolio_scenario_tx(uuid,uuid,text,text,text,uuid,date,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_scenario_impact_action_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;

grant execute on function public.create_benefit_baseline_tx(uuid,uuid,text,text,text,text,text,numeric,numeric,numeric,numeric,text,text,uuid,date,date,text,numeric,uuid,text,text) to service_role;
grant execute on function public.decide_benefit_baseline_tx(uuid,uuid,uuid,text,text,text,uuid,text,text) to service_role;
grant execute on function public.start_benefit_tracking_tx(uuid,uuid,uuid,text,uuid,text,text) to service_role;
grant execute on function public.submit_benefit_review_tx(uuid,uuid,uuid,text,text,timestamptz,numeric,numeric,text,jsonb,uuid,date,text,uuid,date,text,uuid,text,text) to service_role;
grant execute on function public.decide_benefit_review_tx(uuid,uuid,uuid,text,text,text,uuid,text,text) to service_role;
grant execute on function public.finalize_benefit_exit_if_ready_tx(uuid,uuid,text,text) to service_role;
grant execute on function public.transition_benefit_action_tx(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.transition_benefit_handover_tx(uuid,uuid,uuid,text,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.confirm_portfolio_scenario_tx(uuid,uuid,text,text,text,uuid,date,text,text,uuid,text,text) to service_role;
grant execute on function public.transition_scenario_impact_action_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) to service_role;
