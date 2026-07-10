-- AI PM System V5.5 P21/P22 reporting, meeting and CEO decision closed loop.
-- All records are server-side only; business authorization is enforced before service-role access.

create table if not exists public.reporting_snapshots (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  snapshot_type text not null check (snapshot_type in ('daily','weekly','monthly','quarterly','ad_hoc')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','submitted','accepted','superseded')),
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  metrics jsonb not null default '{}'::jsonb,
  exceptions jsonb not null default '[]'::jsonb,
  narrative text not null,
  source_snapshot_at timestamptz not null,
  source_definition jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  submitted_to_user_id uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  accepted_by uuid references public.app_users(id) on delete set null,
  accepted_at timestamptz,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create unique index if not exists idx_reporting_snapshot_period
  on public.reporting_snapshots(org_id,subject_scope,subject_id,snapshot_type,period_start,data_class,version);

create table if not exists public.governance_meetings (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  meeting_type text not null check (meeting_type in ('weekly_portfolio','monthly_operating','quarterly_portfolio','decision','ad_hoc')),
  title text not null,
  scheduled_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','minutes_pending','actions_pending','closed','cancelled')),
  chair_user_id uuid not null references public.app_users(id) on delete restrict,
  attendee_user_ids jsonb not null default '[]'::jsonb,
  agenda jsonb not null default '[]'::jsonb,
  reporting_snapshot_ids jsonb not null default '[]'::jsonb,
  minutes text,
  conclusions jsonb not null default '[]'::jsonb,
  action_item_ids jsonb not null default '[]'::jsonb,
  source_reference text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_governance_meeting_inbox
  on public.governance_meetings(org_id,subject_scope,subject_id,status,scheduled_at);

create table if not exists public.decision_briefs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete set null,
  data_class text not null default 'production' check (data_class in ('production','sample','test','diagnostic','unclassified')),
  status text not null default 'draft' check (status in ('draft','submitted','decided','distributed','effect_review_pending','effect_reviewed','closed','withdrawn')),
  title text not null,
  decision_question text not null,
  options jsonb not null,
  recommendation text not null,
  evidence jsonb not null,
  impact_summary text not null,
  requested_decision_at timestamptz not null,
  execution_due_at timestamptz not null,
  acceptance_criteria text not null,
  meeting_id uuid references public.governance_meetings(id) on delete set null,
  reporting_snapshot_id uuid references public.reporting_snapshots(id) on delete set null,
  source_signal_ids jsonb not null default '[]'::jsonb,
  recipient_user_ids jsonb not null default '[]'::jsonb,
  decision_target_user_id uuid references public.app_users(id) on delete set null,
  submitted_by uuid references public.app_users(id) on delete set null,
  submitted_at timestamptz,
  decided_at timestamptz,
  distributed_at timestamptz,
  effect_reviewed_at timestamptz,
  closed_at timestamptz,
  version bigint not null default 1,
  created_by uuid not null references public.app_users(id) on delete restrict,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_decision_brief_inbox
  on public.decision_briefs(org_id,subject_scope,subject_id,data_class,status,requested_decision_at);

alter table public.management_escalations
  add column if not exists decision_brief_id uuid references public.decision_briefs(id) on delete set null;

create index if not exists idx_management_escalation_decision_brief
  on public.management_escalations(decision_brief_id,status);

create table if not exists public.decisions (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null unique references public.decision_briefs(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete restrict,
  outcome text not null check (outcome in ('approved','rejected','conditional','deferred')),
  selected_option_key text,
  rationale text not null,
  conditions text,
  effective_at timestamptz,
  decided_by uuid not null references public.app_users(id) on delete restrict,
  decided_business_role text not null check (decided_business_role in ('ceo','sponsor')),
  decided_at timestamptz not null default now(),
  request_id text,
  created_at timestamptz not null default now(),
  check (outcome = 'deferred' or selected_option_key is not null)
);

create table if not exists public.decision_receipts (
  id uuid primary key default uuid_generate_v4(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  recipient_business_role text not null check (recipient_business_role in ('pm','operations','business_owner','finance','quality')),
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','acknowledged','disputed')),
  response text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id,recipient_user_id,recipient_business_role)
);

create table if not exists public.decision_effect_reviews (
  id uuid primary key default uuid_generate_v4(),
  decision_id uuid not null references public.decisions(id) on delete cascade,
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  expected_effect text not null,
  actual_effect text not null,
  outcome text not null check (outcome in ('achieved','partially_achieved','not_achieved','too_early')),
  metrics jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  submitted_by uuid not null references public.app_users(id) on delete restrict,
  submitted_business_role text not null check (submitted_business_role in ('pm','operations','business_owner','finance','quality')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_decision_effect_review_inbox
  on public.decision_effect_reviews(brief_id,status,submitted_at);

alter table public.decision_briefs add column if not exists execution_due_at timestamptz;
alter table public.decision_briefs add column if not exists acceptance_criteria text;
update public.decision_briefs set execution_due_at = coalesce(execution_due_at, requested_decision_at + interval '7 days'), acceptance_criteria = coalesce(nullif(acceptance_criteria,''), impact_summary) where execution_due_at is null or acceptance_criteria is null or acceptance_criteria = '';
alter table public.decision_briefs alter column execution_due_at set not null;
alter table public.decision_briefs alter column acceptance_criteria set not null;
alter table public.decision_receipts add column if not exists action_item_id uuid references public.unified_action_items(id) on delete set null;

create table if not exists public.decision_events (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_business_role text,
  detail jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

alter table public.reporting_snapshots enable row level security;
alter table public.governance_meetings enable row level security;
alter table public.decision_briefs enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_receipts enable row level security;
alter table public.decision_effect_reviews enable row level security;
alter table public.decision_events enable row level security;

revoke all on table public.reporting_snapshots from anon, authenticated;
revoke all on table public.governance_meetings from anon, authenticated;
revoke all on table public.decision_briefs from anon, authenticated;
revoke all on table public.decisions from anon, authenticated;
revoke all on table public.decision_receipts from anon, authenticated;
revoke all on table public.decision_effect_reviews from anon, authenticated;
revoke all on table public.decision_events from anon, authenticated;
revoke all on table public.reporting_snapshots, public.governance_meetings, public.decision_briefs, public.decisions, public.decision_receipts, public.decision_effect_reviews, public.decision_events from public;

grant select, insert, update, delete on table public.reporting_snapshots to service_role;
grant select, insert, update, delete on table public.governance_meetings to service_role;
grant select, insert, update, delete on table public.decision_briefs to service_role;
grant select, insert, update, delete on table public.decisions to service_role;
grant select, insert, update, delete on table public.decision_receipts to service_role;
grant select, insert, update, delete on table public.decision_effect_reviews to service_role;
grant select, insert, update, delete on table public.decision_events to service_role;

create or replace function public.decide_decision_brief_tx(
  p_brief_id uuid,
  p_expected_status text,
  p_outcome text,
  p_selected_option_key text,
  p_rationale text,
  p_conditions text,
  p_effective_at timestamptz,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_decision public.decisions%rowtype;
begin
  select * into v_brief from public.decision_briefs where id = p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status <> p_expected_status then raise exception 'DECISION_BRIEF_CONFLICT'; end if;
  if p_actor_business_role not in ('ceo','sponsor') then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  if not exists (
    select 1 from jsonb_array_elements(v_brief.options) option_value
    where option_value->>'key' = p_selected_option_key
  ) and p_outcome <> 'deferred' then raise exception 'DECISION_OPTION_NOT_FOUND'; end if;

  insert into public.decisions(brief_id,org_id,outcome,selected_option_key,rationale,conditions,effective_at,decided_by,decided_business_role,request_id)
  values (p_brief_id,v_brief.org_id,p_outcome,nullif(p_selected_option_key,''),p_rationale,nullif(p_conditions,''),p_effective_at,p_actor_user_id,p_actor_business_role,p_request_id)
  returning * into v_decision;

  update public.decision_briefs
  set status='decided', decided_at=now(), updated_at=now(), updated_by=p_actor_user_id, version=version+1
  where id=p_brief_id;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_brief_id,'decide',p_expected_status,'decided',p_actor_user_id,p_actor_business_role,jsonb_build_object('decision_id',v_decision.id,'outcome',p_outcome),p_request_id);
  return jsonb_build_object('brief',(select to_jsonb(b) from public.decision_briefs b where b.id=p_brief_id),'decision',to_jsonb(v_decision));
end;
$$;

create or replace function public.distribute_decision_brief_tx(
  p_brief_id uuid,
  p_expected_status text,
  p_recipients jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_decision_id uuid;
  v_recipient jsonb;
  v_action_id uuid;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status <> p_expected_status then raise exception 'DECISION_BRIEF_CONFLICT'; end if;
  if p_actor_business_role <> 'pmo' then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  select id into v_decision_id from public.decisions where brief_id=p_brief_id;
  if v_decision_id is null then raise exception 'DECISION_NOT_FOUND'; end if;
  if jsonb_array_length(p_recipients) = 0 then raise exception 'DECISION_RECIPIENT_REQUIRED'; end if;
  for v_recipient in select value from jsonb_array_elements(p_recipients)
  loop
    insert into public.unified_action_items(
      source_type,source_id,project_name,title,owner,due_date,status,priority,
      created_by,created_by_name,metadata,org_id,subject_scope,subject_id,project_id,
      owner_user_id,acceptance_criteria,idempotency_key
    ) values (
      'decision',p_brief_id::text,null,'执行决策：'||v_brief.title,
      coalesce((select name from public.app_users where id=(v_recipient->>'user_id')::uuid),v_recipient->>'business_role'),
      v_brief.execution_due_at::date,'assigned','P1',p_actor_user_id,
      coalesce((select name from public.app_users where id=p_actor_user_id),'系统'),
      jsonb_build_object('decision_id',v_decision_id,'brief_id',p_brief_id,'recipient_business_role',v_recipient->>'business_role'),
      v_brief.org_id,v_brief.subject_scope,v_brief.subject_id,v_brief.project_id,
      (v_recipient->>'user_id')::uuid,v_brief.acceptance_criteria,
      'decision:'||p_brief_id::text||':'||(v_recipient->>'user_id')||':'||(v_recipient->>'business_role')
    )
    on conflict (idempotency_key) where idempotency_key is not null
    do update set owner_user_id=excluded.owner_user_id,due_date=excluded.due_date,
                  acceptance_criteria=excluded.acceptance_criteria,updated_at=now()
    returning id into v_action_id;

    insert into public.decision_receipts(decision_id,brief_id,recipient_user_id,recipient_business_role,action_item_id)
    values (v_decision_id,p_brief_id,(v_recipient->>'user_id')::uuid,v_recipient->>'business_role',v_action_id)
    on conflict (decision_id,recipient_user_id,recipient_business_role)
    do update set action_item_id=excluded.action_item_id,updated_at=now();
  end loop;
  update public.decision_briefs set status='distributed',distributed_at=now(),updated_at=now(),updated_by=p_actor_user_id,version=version+1 where id=p_brief_id;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values (p_brief_id,'distribute',p_expected_status,'distributed',p_actor_user_id,p_actor_business_role,jsonb_build_object('recipient_count',jsonb_array_length(p_recipients)),p_request_id);
  return (select to_jsonb(b) from public.decision_briefs b where b.id=p_brief_id);
end;
$$;

create or replace function public.close_decision_brief_tx(
  p_brief_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status <> 'effect_reviewed' then raise exception 'DECISION_EFFECT_REVIEW_REQUIRED'; end if;
  if p_actor_business_role <> 'pmo' then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  if not exists (select 1 from public.decision_receipts where brief_id=p_brief_id) then raise exception 'DECISION_RECEIPT_REQUIRED'; end if;
  if exists (select 1 from public.decision_receipts where brief_id=p_brief_id and status <> 'acknowledged') then raise exception 'DECISION_RECEIPT_PENDING'; end if;
  if exists (
    select 1 from public.decision_receipts receipt
    where receipt.brief_id=p_brief_id
      and not exists (
        select 1 from public.decision_effect_reviews review
        where review.brief_id=p_brief_id and review.status='approved'
          and review.submitted_by=receipt.recipient_user_id
          and review.submitted_business_role=receipt.recipient_business_role
      )
  ) then raise exception 'DECISION_EFFECT_REVIEW_REQUIRED'; end if;
  if exists (
    select 1 from public.decision_receipts receipt
    left join public.unified_action_items action on action.id=receipt.action_item_id
    where receipt.brief_id=p_brief_id and (action.id is null or action.status <> 'evidence_submitted')
  ) then raise exception 'DECISION_EXECUTION_EVIDENCE_REQUIRED'; end if;
  update public.unified_action_items action set
    status='closed',closed_at=now(),reviewer_user_id=p_actor_user_id,reviewer_completed_at=now(),updated_at=now(),version=version+1,
    effect_review=jsonb_build_object('decision_brief_id',p_brief_id,'reviewed_at',now(),'reviewed_by',p_actor_user_id)
  where action.id in (select action_item_id from public.decision_receipts where brief_id=p_brief_id);
  update public.decision_briefs set status='closed',closed_at=now(),updated_at=now(),updated_by=p_actor_user_id,version=version+1 where id=p_brief_id;
  update public.management_escalations set status='resolved', updated_at=now() where decision_brief_id=p_brief_id and status='brief_created';
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id)
  values (p_brief_id,'close','effect_reviewed','closed',p_actor_user_id,p_actor_business_role,p_request_id);
  return (select to_jsonb(b) from public.decision_briefs b where b.id=p_brief_id);
end;
$$;

create or replace function public.acknowledge_decision_receipt_tx(
  p_brief_id uuid,
  p_receipt_id uuid,
  p_status text,
  p_response text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt public.decision_receipts%rowtype;
  v_action public.unified_action_items%rowtype;
begin
  select * into v_receipt from public.decision_receipts
  where id=p_receipt_id and brief_id=p_brief_id
    and recipient_user_id=p_actor_user_id and recipient_business_role=p_actor_business_role
  for update;
  if not found then raise exception 'DECISION_RECEIPT_NOT_FOUND'; end if;
  if v_receipt.status not in ('pending','disputed') then raise exception 'DECISION_RECEIPT_CONFLICT'; end if;
  if p_status not in ('acknowledged','disputed') then raise exception 'DECISION_RECEIPT_STATUS_INVALID'; end if;
  if nullif(trim(p_response),'') is null then raise exception 'DECISION_RECEIPT_RESPONSE_REQUIRED'; end if;
  if v_receipt.action_item_id is null then raise exception 'DECISION_ACTION_REQUIRED'; end if;

  update public.decision_receipts set status=p_status,response=p_response,
    acknowledged_at=case when p_status='acknowledged' then now() else null end,updated_at=now()
  where id=p_receipt_id returning * into v_receipt;
  update public.unified_action_items set
    status=case when p_status='acknowledged' then 'accepted' else 'rejected' end,
    accepted_at=case when p_status='acknowledged' then now() else accepted_at end,
    rejected_at=case when p_status='disputed' then now() else null end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('receipt_response',p_response),
    updated_at=now(),version=version+1
  where id=v_receipt.action_item_id and owner_user_id=p_actor_user_id and status in ('assigned','rejected')
  returning * into v_action;
  if v_action.id is null then raise exception 'DECISION_ACTION_CONFLICT'; end if;
  insert into public.decision_events(brief_id,event_type,actor_user_id,actor_business_role,detail,request_id)
  values (p_brief_id,case when p_status='acknowledged' then 'acknowledge_receipt' else 'dispute_receipt' end,
          p_actor_user_id,p_actor_business_role,jsonb_build_object('receipt_id',p_receipt_id,'action_item_id',v_action.id,'response',p_response),p_request_id);
  return jsonb_build_object('receipt',to_jsonb(v_receipt),'action',to_jsonb(v_action));
end;
$$;

create or replace function public.transition_decision_action_tx(
  p_brief_id uuid,
  p_receipt_id uuid,
  p_operation text,
  p_evidence jsonb,
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
  v_receipt public.decision_receipts%rowtype;
  v_action public.unified_action_items%rowtype;
  v_expected_status text;
  v_next_status text;
begin
  select * into v_receipt from public.decision_receipts
  where id=p_receipt_id and brief_id=p_brief_id and status='acknowledged'
    and recipient_user_id=p_actor_user_id and recipient_business_role=p_actor_business_role
  for update;
  if not found then raise exception 'DECISION_RECEIPT_ACK_REQUIRED'; end if;
  select * into v_action from public.unified_action_items
  where id=v_receipt.action_item_id and owner_user_id=p_actor_user_id and source_type='decision' and source_id=p_brief_id::text
  for update;
  if not found then raise exception 'DECISION_ACTION_NOT_FOUND'; end if;
  if p_operation='start_execution' then v_expected_status:='accepted'; v_next_status:='in_progress';
  elsif p_operation='submit_execution_evidence' then v_expected_status:='in_progress'; v_next_status:='evidence_submitted';
  else raise exception 'DECISION_ACTION_OPERATION_INVALID'; end if;
  if v_action.status<>v_expected_status then raise exception 'DECISION_ACTION_CONFLICT:%',v_action.status; end if;
  if p_operation='submit_execution_evidence' and jsonb_array_length(coalesce(p_evidence,'[]'::jsonb))=0 then raise exception 'DECISION_EXECUTION_EVIDENCE_REQUIRED'; end if;
  update public.unified_action_items set
    status=v_next_status,
    evidence=case when p_operation='submit_execution_evidence' then p_evidence else evidence end,
    close_evidence=case when p_operation='submit_execution_evidence' then
      (select string_agg(coalesce(item->>'title','证据')||'('||coalesce(item->>'source_type','source')||':'||coalesce(item->>'source_id','id')||')','；') from jsonb_array_elements(p_evidence) item)
      else close_evidence end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_execution_comment',p_comment),
    updated_at=now(),version=version+1
  where id=v_action.id returning * into v_action;
  insert into public.decision_events(brief_id,event_type,actor_user_id,actor_business_role,detail,request_id)
  values (p_brief_id,p_operation,p_actor_user_id,p_actor_business_role,
          jsonb_build_object('receipt_id',p_receipt_id,'action_item_id',v_action.id,'evidence_count',jsonb_array_length(coalesce(p_evidence,'[]'::jsonb)),'comment',p_comment),p_request_id);
  return jsonb_build_object('receipt',to_jsonb(v_receipt),'action',to_jsonb(v_action));
end;
$$;

revoke all on function public.decide_decision_brief_tx(uuid,text,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
revoke all on function public.distribute_decision_brief_tx(uuid,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.close_decision_brief_tx(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.acknowledge_decision_receipt_tx(uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_decision_action_tx(uuid,uuid,text,jsonb,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_decision_brief_tx(uuid,text,text,text,text,text,timestamptz,uuid,text,text) to service_role;
grant execute on function public.distribute_decision_brief_tx(uuid,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.close_decision_brief_tx(uuid,uuid,text,text) to service_role;
grant execute on function public.acknowledge_decision_receipt_tx(uuid,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.transition_decision_action_tx(uuid,uuid,text,jsonb,text,uuid,text,text) to service_role;
