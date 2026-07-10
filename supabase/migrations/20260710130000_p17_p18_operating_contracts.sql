-- AI PM System V6.0 P17/P18 operating contracts hardening.
-- Adds deny-first authorization dimensions, metric trust, accountable coverage,
-- confirmed impact packages, correction write-through and evidence expiry processing.

create table if not exists public.business_authorization_policies (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  policy_key text not null,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','retired')),
  effect text not null check (effect in ('allow','deny')),
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  object_type text not null,
  action text not null,
  allowed_states jsonb not null default '["*"]'::jsonb check (jsonb_typeof(allowed_states) = 'array'),
  project_levels jsonb not null default '["*"]'::jsonb check (jsonb_typeof(project_levels) = 'array'),
  decision_levels jsonb not null default '["*"]'::jsonb check (jsonb_typeof(decision_levels) = 'array'),
  max_amount numeric(18,2),
  sensitive_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(sensitive_fields) = 'array'),
  priority integer not null default 100,
  effective_from timestamptz,
  effective_until timestamptz,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_amount is null or max_amount >= 0),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create unique index if not exists idx_p17_authorization_policy_version
  on public.business_authorization_policies(coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),policy_key,version);

create table if not exists public.business_role_recusals (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  reason_code text not null,
  reason_detail text not null,
  status text not null default 'active' check (status in ('active','released','expired')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  approved_by uuid references public.app_users(id) on delete set null,
  released_by uuid references public.app_users(id) on delete set null,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create unique index if not exists idx_p17_active_recusal
  on public.business_role_recusals(org_id,user_id,business_role,subject_scope,subject_id)
  where status = 'active';

create table if not exists public.business_role_coverage_gaps (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  required_business_role text not null check (required_business_role in ('pm','operations','pmo','ceo','sponsor','business_owner','finance','quality')),
  source_type text not null,
  source_id text not null,
  status text not null default 'open' check (status in ('open','assigned','verified','closed','waived')),
  owner_user_id uuid references public.app_users(id) on delete set null,
  due_at timestamptz not null,
  resolution_note text,
  verified_by uuid references public.app_users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,subject_scope,subject_id,required_business_role,source_type,source_id)
);

create table if not exists public.data_sync_contracts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  fact_key text not null,
  source_system text not null,
  target_system text not null,
  direction text not null check (direction in ('inbound','outbound','bidirectional','reference_only')),
  refresh_policy text not null,
  idempotency_definition text not null,
  deletion_semantics text not null,
  compensation_strategy text not null,
  reconciliation_owner_role text not null,
  status text not null default 'draft' check (status in ('draft','active','suspended','retired')),
  version integer not null default 1,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_p17_sync_contract_version
  on public.data_sync_contracts(coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid),fact_key,version);

create table if not exists public.metric_observations (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  metric_definition_id uuid not null references public.metric_definitions(id) on delete restrict,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  project_id uuid references public.projects(id) on delete set null,
  period_key text not null,
  current_value numeric(20,4),
  baseline_value numeric(20,4),
  previous_forecast_value numeric(20,4),
  latest_forecast_value numeric(20,4),
  currency text,
  unit text,
  source_type text not null,
  source_id text not null,
  source_status text not null check (source_status in ('verified','manual_unverified','unavailable')),
  observed_at timestamptz not null,
  freshness_status text not null check (freshness_status in ('fresh','stale','unavailable')),
  trust_status text not null check (trust_status in ('trusted','untrusted','accepted_with_risk')),
  data_owner_user_id uuid references public.app_users(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  evidence_ids jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_ids) = 'array'),
  risk_acceptance_note text,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id,metric_definition_id,subject_scope,subject_id,period_key,source_type,source_id)
);

create table if not exists public.business_forecast_versions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  forecast_type text not null,
  forecast_value jsonb not null,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  status text not null default 'draft' check (status in ('draft','pending_confirmation','confirmed','superseded','rejected')),
  source_type text not null,
  source_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  version bigint not null default 1,
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  confirmed_by uuid references public.app_users(id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,project_id,forecast_type,version,data_class)
);

create table if not exists public.object_impact_packages (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  source_type text not null check (source_type in ('risk','issue','change')),
  source_id text not null,
  source_status text not null,
  targets jsonb not null check (jsonb_typeof(targets) = 'array' and jsonb_array_length(targets) > 0),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','confirmed','rejected','applied','effect_reviewed','closed')),
  owner_user_id uuid not null references public.app_users(id) on delete restrict,
  reviewer_user_id uuid not null references public.app_users(id) on delete restrict,
  due_at timestamptz not null,
  confirmation_note text,
  application_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(application_evidence) = 'array'),
  effect_review jsonb not null default '{}'::jsonb check (jsonb_typeof(effect_review) = 'object'),
  idempotency_key text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  version bigint not null default 1,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,idempotency_key)
);

create table if not exists public.object_impact_package_events (
  id uuid primary key default uuid_generate_v4(),
  impact_package_id uuid not null references public.object_impact_packages(id) on delete cascade,
  action text not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null,
  comment text,
  evidence jsonb not null default '[]'::jsonb,
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (impact_package_id,request_id,action)
);

create table if not exists public.evidence_expiry_events (
  id uuid primary key default uuid_generate_v4(),
  evidence_link_id uuid not null unique references public.evidence_links(id) on delete cascade,
  lifecycle_state_id uuid references public.project_lifecycle_states(id) on delete set null,
  expiry_action text not null check (expiry_action in ('block_transition','reopen_object','warn')),
  previous_status text,
  next_status text,
  signal_id uuid references public.management_signals(id) on delete set null,
  processed_at timestamptz not null default now(),
  detail jsonb not null default '{}'::jsonb
);

alter table public.management_signals
  add column if not exists window_key text,
  add column if not exists next_review_at timestamptz,
  add column if not exists metric_observation_ids jsonb not null default '[]'::jsonb,
  add column if not exists trust_status text not null default 'untrusted';

alter table public.management_signals drop constraint if exists management_signals_trust_status_check;
alter table public.management_signals add constraint management_signals_trust_status_check
  check (trust_status in ('trusted','untrusted','accepted_with_risk'));

create index if not exists idx_p17_authorization_lookup on public.business_authorization_policies(org_id,business_role,object_type,action,status,priority desc);
create index if not exists idx_p17_coverage_open on public.business_role_coverage_gaps(org_id,status,due_at);
create index if not exists idx_p17_metric_observation_subject on public.metric_observations(org_id,subject_scope,subject_id,period_key,observed_at desc);
create index if not exists idx_p18_forecast_project on public.business_forecast_versions(project_id,forecast_type,status,version desc);
create index if not exists idx_p18_impact_project on public.object_impact_packages(project_id,status,due_at);
create index if not exists idx_p18_expiry_processed on public.evidence_expiry_events(processed_at desc);

create or replace function public.enforce_p17_delegated_business_role()
returns trigger
language plpgsql
set search_path=public
as $$
declare v_source public.user_business_roles;
begin
  if new.delegated_from_user_id is null then return new; end if;
  if new.delegated_from_user_id=new.user_id then raise exception 'P17_SELF_DELEGATION_FORBIDDEN'; end if;
  if new.valid_until is null or nullif(trim(coalesce(new.assignment_reason,'')),'') is null then raise exception 'P17_DELEGATION_EXPIRY_AND_REASON_REQUIRED'; end if;
  select * into v_source from public.user_business_roles where user_id=new.delegated_from_user_id and business_role=new.business_role and org_id=new.org_id and subject_scope=new.subject_scope and subject_id=new.subject_id and status='active' and valid_from<=new.valid_from and (valid_until is null or valid_until>=new.valid_until) order by created_at desc limit 1;
  if not found then raise exception 'P17_DELEGATOR_ACTIVE_AUTHORITY_REQUIRED'; end if;
  return new;
end; $$;

drop trigger if exists trg_p17_delegated_business_role on public.user_business_roles;
create trigger trg_p17_delegated_business_role before insert or update of delegated_from_user_id,valid_from,valid_until,status on public.user_business_roles for each row execute function public.enforce_p17_delegated_business_role();

create or replace function public.scan_business_role_coverage_gaps_tx(p_org_id uuid,p_due_at timestamptz default now()+interval '1 day')
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_project public.projects; v_role text; v_created integer:=0; v_resolved integer:=0;
begin
  for v_project in select * from public.projects where org_id=p_org_id and coalesce(status,'') not in ('closed','cancelled','terminated') loop
    foreach v_role in array array['pm','operations','pmo'] loop
      if exists(select 1 from public.user_business_roles role where role.org_id=p_org_id and role.business_role=v_role and role.status='active' and role.valid_from<=now() and (role.valid_until is null or role.valid_until>=now()) and ((role.subject_scope='project' and role.subject_id=v_project.id::text) or (role.subject_scope='organization' and role.subject_id=p_org_id::text))) then
        update public.business_role_coverage_gaps set status='verified',updated_at=now() where org_id=p_org_id and subject_scope='project' and subject_id=v_project.id::text and required_business_role=v_role and source_type='coverage_scan' and source_id=v_project.id::text and status in ('open','assigned');
        if found then v_resolved:=v_resolved+1; end if;
      else
        insert into public.business_role_coverage_gaps(org_id,subject_scope,subject_id,required_business_role,source_type,source_id,status,due_at)
        values(p_org_id,'project',v_project.id::text,v_role,'coverage_scan',v_project.id::text,'open',p_due_at)
        on conflict (org_id,subject_scope,subject_id,required_business_role,source_type,source_id) do update set status=case when public.business_role_coverage_gaps.status='closed' then 'closed' else 'open' end,due_at=excluded.due_at,updated_at=now();
        v_created:=v_created+1;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('open_or_refreshed',v_created,'coverage_restored',v_resolved);
end; $$;

insert into public.business_authorization_policies(
  org_id,policy_key,version,status,effect,business_role,object_type,action,
  allowed_states,project_levels,decision_levels,max_amount,sensitive_fields,priority,effective_from,approved_at
)
select null,'baseline-'||role||'-project-read',1,'active','allow',role,'project','read','["*"]'::jsonb,'["*"]'::jsonb,'["*"]'::jsonb,null,'[]'::jsonb,100,now(),now()
from unnest(array['pm','operations','pmo','ceo','sponsor','business_owner','finance','quality']) role
on conflict do nothing;

insert into public.business_authorization_policies(
  org_id,policy_key,version,status,effect,business_role,object_type,action,
  allowed_states,project_levels,decision_levels,max_amount,sensitive_fields,priority,effective_from,approved_at
)
select null,'baseline-'||role||'-impact-'||action_name,1,'active','allow',role,'impact_package',action_name,
  case when action_name='create' then '["source_confirmed"]'::jsonb when action_name='execute' then '["confirmed"]'::jsonb else '["pending_confirmation","applied","effect_reviewed"]'::jsonb end,
  '["*"]'::jsonb,'["project"]'::jsonb,null,'[]'::jsonb,100,now(),now()
from (values
  ('pm','create'),('operations','create'),('pmo','create'),
  ('pm','execute'),('operations','execute'),
  ('pmo','review'),('sponsor','review'),('business_owner','review'),('finance','review')
) as policy(role,action_name)
on conflict do nothing;

insert into public.management_rule_versions(scope_key,rule_key,version,status,configuration)
select 'global', signal_type, 'P18-' || upper(signal_type) || '-v1', 'draft',
       jsonb_build_object('signal_type',signal_type,'project_levels',jsonb_build_object('S','strict','A','strict','B','standard','C','standard'),'thresholds',jsonb_build_object('yellow',null,'red',null),'freshness_required',true,'owner_required',true,'next_review_required',true)
from unnest(array['progress','cost','quality','risk','resource','acceptance','cash','benefit','data_quality']) signal_type
on conflict (coalesce(org_id, '00000000-0000-0000-0000-000000000000'::uuid), scope_key, rule_key, version) do nothing;

insert into public.metric_definitions(metric_key,version,name,definition,source_definition,freshness_sla_minutes,status)
values
  ('contract_amount','P17-v1','合同额','当前有效合同含税或不含税金额，口径由合同记录声明','{"authority":"feishu_contract_or_contract_system","owner_role":"operations"}'::jsonb,1440,'draft'),
  ('revenue','P17-v1','收入','财务确认的期间收入','{"authority":"finance","owner_role":"finance"}'::jsonb,1440,'draft'),
  ('bac','P17-v1','完工预算BAC','已批准成本基线总额','{"authority":"approved_cost_baseline","owner_role":"finance"}'::jsonb,1440,'draft'),
  ('ac','P17-v1','实际成本AC','期间累计实际成本','{"authority":"finance","owner_role":"finance"}'::jsonb,1440,'draft'),
  ('eac','P17-v1','完工估算EAC','基于当前绩效和剩余工作预测的完工成本','{"authority":"confirmed_forecast","owner_role":"pm"}'::jsonb,1440,'draft'),
  ('gross_margin','P17-v1','毛利','收入减成本，必须声明币种税制和期间','{"authority":"finance_plus_confirmed_forecast","owner_role":"finance"}'::jsonb,1440,'draft'),
  ('receivable','P17-v1','应收','已满足应收确认条件但尚未核销的金额','{"authority":"finance_or_verified_feishu","owner_role":"finance"}'::jsonb,240,'draft'),
  ('forecast_collection','P17-v1','预计实收','经运营和财务确认的未来实收预测','{"authority":"confirmed_forecast","owner_role":"operations"}'::jsonb,240,'draft'),
  ('cash_received','P17-v1','到账','财务确认的实际到账金额','{"authority":"finance","owner_role":"finance"}'::jsonb,60,'draft')
on conflict do nothing;

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
  v_severity text;
begin
  if exists (select 1 from public.feedback_correction_transitions where correction_event_id=p_correction_id and request_id=p_request_id and action=p_action) then
    select * into v_correction from public.feedback_correction_events where id=p_correction_id;
    return v_correction;
  end if;
  select * into v_correction from public.feedback_correction_events where id=p_correction_id for update;
  if not found then raise exception 'P18_CORRECTION_NOT_FOUND'; end if;
  if v_correction.status <> p_expected_status or v_correction.version <> p_expected_version then raise exception 'P18_CORRECTION_CONFLICT:%:%',v_correction.status,v_correction.version; end if;
  if p_action='verify' and p_actor_user_id=v_correction.submitted_by then raise exception 'P18_INDEPENDENT_VERIFIER_REQUIRED'; end if;
  if p_action='verify' and jsonb_typeof(v_correction.applied_correction) <> 'object' then raise exception 'P18_APPLIED_CORRECTION_REQUIRED'; end if;

  if p_action='verify' then
    if v_correction.target_type='management_signal' then
      v_severity := coalesce(nullif(v_correction.applied_correction->>'severity',''),(select severity from public.management_signals where id::text=v_correction.target_id));
      if v_severity not in ('low','medium','high','critical') then raise exception 'P18_CORRECTION_SEVERITY_INVALID'; end if;
      update public.management_signals set
        summary=coalesce(nullif(v_correction.applied_correction->>'summary',''),summary),
        severity=v_severity,
        owner_user_id=case when v_correction.applied_correction ? 'owner_user_id' then nullif(v_correction.applied_correction->>'owner_user_id','')::uuid else owner_user_id end,
        due_at=case when v_correction.applied_correction ? 'due_at' then nullif(v_correction.applied_correction->>'due_at','')::timestamptz else due_at end,
        impact=impact || coalesce(v_correction.applied_correction->'impact','{}'::jsonb),
        payload=payload || coalesce(v_correction.applied_correction->'payload','{}'::jsonb) || jsonb_build_object('verified_correction_event_id',v_correction.id),
        updated_by=p_actor_user_id,updated_at=now(),version=version+1
      where id::text=v_correction.target_id and project_id=v_correction.project_id;
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    elsif v_correction.target_type='lifecycle_state' then
      update public.project_lifecycle_states set
        owner_user_id=case when v_correction.applied_correction ? 'owner_user_id' then nullif(v_correction.applied_correction->>'owner_user_id','')::uuid else owner_user_id end,
        due_at=case when v_correction.applied_correction ? 'due_at' then nullif(v_correction.applied_correction->>'due_at','')::timestamptz else due_at end,
        metadata=metadata || jsonb_build_object('verified_correction_event_id',v_correction.id,'correction',v_correction.applied_correction),
        updated_by=p_actor_user_id,updated_at=now(),version=version+1
      where id::text=v_correction.target_id and project_id=v_correction.project_id;
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    elsif v_correction.target_type='action' then
      update public.unified_action_items set
        title=coalesce(nullif(v_correction.applied_correction->>'title',''),title),
        owner_user_id=case when v_correction.applied_correction ? 'owner_user_id' then nullif(v_correction.applied_correction->>'owner_user_id','')::uuid else owner_user_id end,
        due_date=case when v_correction.applied_correction ? 'due_date' then nullif(v_correction.applied_correction->>'due_date','')::date else due_date end,
        acceptance_criteria=coalesce(nullif(v_correction.applied_correction->>'acceptance_criteria',''),acceptance_criteria),
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('verified_correction_event_id',v_correction.id),
        updated_at=now(),version=version+1
      where id::text=v_correction.target_id and project_id=v_correction.project_id;
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    elsif v_correction.target_type='rule' then
      update public.management_rule_versions set configuration=configuration || coalesce(v_correction.applied_correction->'configuration','{}'::jsonb)
      where id::text=v_correction.target_id and (org_id=v_correction.org_id or org_id is null);
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    elsif v_correction.target_type='forecast' then
      update public.business_forecast_versions set
        forecast_value=coalesce(v_correction.applied_correction->'forecast_value',forecast_value),
        confidence=case when v_correction.applied_correction ? 'confidence' then (v_correction.applied_correction->>'confidence')::numeric else confidence end,
        status='confirmed',confirmed_by=p_actor_user_id,confirmed_at=now(),updated_at=now(),version=version+1
      where id::text=v_correction.target_id and project_id=v_correction.project_id;
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    elsif v_correction.target_type='ai_evaluation' then
      update public.ai_assistant_evaluations set
        correction=coalesce(nullif(v_correction.applied_correction->>'correction',''),correction),
        outcome=coalesce(nullif(v_correction.applied_correction->>'outcome',''),outcome),
        adopted=case when v_correction.applied_correction ? 'adopted' then (v_correction.applied_correction->>'adopted')::boolean else adopted end
      where id::text=v_correction.target_id and org_id=v_correction.org_id and subject_id=v_correction.project_id::text;
      if not found then raise exception 'P18_CORRECTION_TARGET_NOT_FOUND'; end if;
    else raise exception 'P18_CORRECTION_TARGET_UNSUPPORTED';
    end if;
  end if;

  update public.feedback_correction_events set
    status=p_next_status,
    triaged_by=case when p_action in ('accept','reject') then p_actor_user_id else triaged_by end,
    verified_by=case when p_action='verify' then p_actor_user_id else verified_by end,
    applied_correction=case when p_action='submit_correction' then coalesce(p_applied_correction,'{}'::jsonb) else applied_correction end,
    closed_at=case when p_next_status in ('closed','rejected') then now() else null end,
    updated_at=now(),version=version+1
  where id=p_correction_id returning * into v_correction;
  insert into public.feedback_correction_transitions(correction_event_id,action,from_status,to_status,actor_user_id,actor_business_role,comment,reason_code,applied_correction,request_id)
  values(p_correction_id,p_action,p_expected_status,p_next_status,p_actor_user_id,p_actor_business_role,p_comment,p_reason_code,coalesce(p_applied_correction,'{}'::jsonb),p_request_id);
  return v_correction;
end;
$$;

create or replace function public.process_expired_lifecycle_evidence_tx(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evidence public.evidence_links;
  v_state public.project_lifecycle_states;
  v_requirement public.evidence_requirements;
  v_signal_id uuid;
  v_processed integer := 0;
begin
  for v_evidence in
    select evidence.* from public.evidence_links evidence
    where evidence.verified_at is not null and evidence.valid_until is not null and evidence.valid_until < p_now
      and evidence.metadata ? 'lifecycle_object_type' and evidence.metadata ? 'lifecycle_object_id'
      and not exists (select 1 from public.evidence_expiry_events event where event.evidence_link_id=evidence.id)
    for update skip locked
  loop
    select * into v_state from public.project_lifecycle_states
    where org_id=v_evidence.org_id and project_id::text=v_evidence.subject_id
      and object_type=v_evidence.metadata->>'lifecycle_object_type'
      and object_id=v_evidence.metadata->>'lifecycle_object_id'
    for update;
    if not found then
      insert into public.evidence_expiry_events(evidence_link_id,expiry_action,detail)
      values(v_evidence.id,'warn',jsonb_build_object('result','lifecycle_state_not_found'));
      v_processed:=v_processed+1; continue;
    end if;
    select * into v_requirement from public.evidence_requirements
    where active=true and (org_id is null or org_id=v_state.org_id) and object_type=v_state.object_type
      and to_status=v_state.status and evidence_type=v_evidence.evidence_type
    order by (org_id is not null) desc,version desc limit 1;
    if not found then
      insert into public.evidence_expiry_events(evidence_link_id,lifecycle_state_id,expiry_action,previous_status,next_status,detail)
      values(v_evidence.id,v_state.id,'warn',v_state.status,v_state.status,jsonb_build_object('result','requirement_not_found'));
      v_processed:=v_processed+1; continue;
    end if;
    if v_requirement.expiry_action='reopen_object' then
      update public.project_lifecycle_states set status=v_requirement.from_status,version=version+1,updated_by=coalesce(v_evidence.verified_by,v_state.updated_by),updated_at=p_now where id=v_state.id;
      insert into public.project_lifecycle_events(lifecycle_state_id,org_id,project_id,object_type,object_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,required_evidence_types,accepted_evidence_ids,idempotency_key,request_id,metadata)
      values(v_state.id,v_state.org_id,v_state.project_id,v_state.object_type,v_state.object_id,'evidence_expired',v_state.status,v_requirement.from_status,coalesce(v_evidence.verified_by,v_state.updated_by),'quality','证据到期，按规则重新打开对象',jsonb_build_array(v_evidence.evidence_type),jsonb_build_array(v_evidence.id),'evidence-expiry:'||v_evidence.id,'evidence-expiry:'||v_evidence.id,jsonb_build_object('evidence_id',v_evidence.id));
    end if;
    if v_requirement.expiry_action in ('warn','reopen_object') then
      insert into public.management_signals(org_id,subject_scope,subject_id,project_id,data_class,signal_type,rule_version,baseline_version,severity,route,status,title,summary,impact,payload,dedup_key,window_key,owner_user_id,reviewer_user_id,due_at,next_review_at,source_type,source_id,snapshot_at,trust_status,created_by,updated_by)
      values(v_state.org_id,'project',v_state.project_id::text,v_state.project_id,v_state.data_class,'data_quality','P18-EVIDENCE-EXPIRY-v1',v_state.version::text,'high','action','pending_verification','生命周期证据已过期','证据“'||v_evidence.title||'”已超过有效期，需要补充新版本并重新验证。',jsonb_build_object('object_type',v_state.object_type,'object_id',v_state.object_id),jsonb_build_object('evidence_id',v_evidence.id,'expiry_action',v_requirement.expiry_action),'data_quality:project:'||v_state.project_id||':evidence-expiry:'||v_evidence.id,'evidence-expiry:'||v_evidence.id,coalesce(v_state.owner_user_id,v_state.updated_by),v_evidence.verified_by,p_now+interval '1 day',p_now+interval '1 day','evidence_link',v_evidence.id::text,p_now,'trusted',coalesce(v_evidence.verified_by,v_state.updated_by),coalesce(v_evidence.verified_by,v_state.updated_by))
      on conflict (org_id,dedup_key) do update set updated_at=p_now
      returning id into v_signal_id;
    else v_signal_id:=null;
    end if;
    insert into public.evidence_expiry_events(evidence_link_id,lifecycle_state_id,expiry_action,previous_status,next_status,signal_id,detail)
    values(v_evidence.id,v_state.id,v_requirement.expiry_action,v_state.status,case when v_requirement.expiry_action='reopen_object' then v_requirement.from_status else v_state.status end,v_signal_id,jsonb_build_object('requirement_id',v_requirement.id,'valid_until',v_evidence.valid_until));
    v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object('processed',v_processed,'processed_at',p_now);
end;
$$;

create or replace function public.transition_object_impact_package_tx(
  p_package_id uuid,
  p_expected_status text,
  p_expected_version bigint,
  p_action text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_comment text,
  p_evidence jsonb,
  p_effect_review jsonb,
  p_request_id text
)
returns public.object_impact_packages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.object_impact_packages;
  v_next text;
begin
  if exists(select 1 from public.object_impact_package_events where impact_package_id=p_package_id and request_id=p_request_id and action=p_action) then
    select * into v_package from public.object_impact_packages where id=p_package_id;
    return v_package;
  end if;
  select * into v_package from public.object_impact_packages where id=p_package_id for update;
  if not found then raise exception 'P18_IMPACT_PACKAGE_NOT_FOUND'; end if;
  if v_package.status<>p_expected_status or v_package.version<>p_expected_version then raise exception 'P18_IMPACT_PACKAGE_CONFLICT'; end if;
  v_next := case
    when p_expected_status='pending_confirmation' and p_action='confirm' then 'confirmed'
    when p_expected_status='pending_confirmation' and p_action='reject' then 'rejected'
    when p_expected_status='confirmed' and p_action='submit_application' then 'applied'
    when p_expected_status='applied' and p_action='review_effect' then 'effect_reviewed'
    when p_expected_status='effect_reviewed' and p_action='close' then 'closed'
    else null end;
  if v_next is null then raise exception 'P18_IMPACT_PACKAGE_TRANSITION_FORBIDDEN'; end if;
  if p_action in ('confirm','reject','review_effect','close') and p_actor_user_id<>v_package.reviewer_user_id then raise exception 'P18_IMPACT_PACKAGE_REVIEWER_REQUIRED'; end if;
  if p_action='submit_application' and p_actor_user_id<>v_package.owner_user_id then raise exception 'P18_IMPACT_PACKAGE_OWNER_REQUIRED'; end if;
  if p_action in ('confirm','reject') and p_actor_business_role not in ('pmo','sponsor','business_owner','finance') then raise exception 'P18_IMPACT_PACKAGE_REVIEW_ROLE_REQUIRED'; end if;
  if p_action in ('confirm','reject') and nullif(trim(p_comment),'') is null then raise exception 'P18_IMPACT_PACKAGE_COMMENT_REQUIRED'; end if;
  if p_action='submit_application' and (p_evidence is null or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0) then raise exception 'P18_IMPACT_PACKAGE_EVIDENCE_REQUIRED'; end if;
  if p_action='review_effect' and (p_effect_review is null or jsonb_typeof(p_effect_review)<>'object' or p_effect_review='{}'::jsonb) then raise exception 'P18_IMPACT_PACKAGE_EFFECT_REVIEW_REQUIRED'; end if;
  update public.object_impact_packages set
    status=v_next,
    confirmation_note=case when p_action in ('confirm','reject') then p_comment else confirmation_note end,
    application_evidence=case when p_action='submit_application' then p_evidence else application_evidence end,
    effect_review=case when p_action='review_effect' then p_effect_review else effect_review end,
    updated_at=now(),version=version+1
  where id=p_package_id returning * into v_package;
  insert into public.object_impact_package_events(impact_package_id,action,from_status,to_status,actor_user_id,actor_business_role,comment,evidence,request_id)
  values(p_package_id,p_action,p_expected_status,v_next,p_actor_user_id,p_actor_business_role,p_comment,coalesce(p_evidence,'[]'::jsonb),p_request_id);
  return v_package;
end;
$$;

create or replace function public.upsert_generic_management_signal_tx(
  p_payload jsonb,p_actor_user_id uuid,p_actor_business_role text,p_request_id text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_signal public.management_signals; v_created boolean:=false;
begin
  if p_payload->>'signal_type' not in ('progress','cost','quality','risk','resource','acceptance','cash','benefit','data_quality') then raise exception 'P18_SIGNAL_TYPE_INVALID'; end if;
  if nullif(p_payload->>'owner_user_id','') is null or nullif(p_payload->>'next_review_at','') is null then raise exception 'P18_SIGNAL_OWNER_AND_REVIEW_REQUIRED'; end if;
  select * into v_signal from public.management_signals where org_id=(p_payload->>'org_id')::uuid and dedup_key=p_payload->>'dedup_key' for update;
  if found then
    update public.management_signals set
      signal_type=p_payload->>'signal_type',rule_version=p_payload->>'rule_version',severity=p_payload->>'severity',route=p_payload->>'route',title=p_payload->>'title',summary=p_payload->>'summary',impact=coalesce(p_payload->'impact','{}'::jsonb),payload=coalesce(p_payload->'payload','{}'::jsonb),owner_user_id=(p_payload->>'owner_user_id')::uuid,due_at=(p_payload->>'due_at')::timestamptz,next_review_at=(p_payload->>'next_review_at')::timestamptz,metric_observation_ids=coalesce(p_payload->'metric_observation_ids','[]'::jsonb),source_type=p_payload->>'source_type',source_id=p_payload->>'source_id',snapshot_at=(p_payload->>'snapshot_at')::timestamptz,trust_status=p_payload->>'trust_status',updated_by=p_actor_user_id,updated_at=now(),version=version+1
    where id=v_signal.id returning * into v_signal;
  else
    insert into public.management_signals(org_id,subject_scope,subject_id,project_id,data_class,signal_type,rule_version,baseline_version,severity,route,status,title,summary,impact,payload,dedup_key,window_key,owner_user_id,due_at,next_review_at,metric_observation_ids,source_type,source_id,snapshot_at,trust_status,created_by,updated_by)
    values((p_payload->>'org_id')::uuid,'project',p_payload->>'project_id',(p_payload->>'project_id')::uuid,p_payload->>'data_class',p_payload->>'signal_type',p_payload->>'rule_version',nullif(p_payload->>'baseline_version',''),p_payload->>'severity',p_payload->>'route','pending_verification',p_payload->>'title',p_payload->>'summary',coalesce(p_payload->'impact','{}'::jsonb),coalesce(p_payload->'payload','{}'::jsonb),p_payload->>'dedup_key',p_payload#>>'{payload,period_key}',(p_payload->>'owner_user_id')::uuid,(p_payload->>'due_at')::timestamptz,(p_payload->>'next_review_at')::timestamptz,coalesce(p_payload->'metric_observation_ids','[]'::jsonb),p_payload->>'source_type',p_payload->>'source_id',(p_payload->>'snapshot_at')::timestamptz,p_payload->>'trust_status',p_actor_user_id,p_actor_user_id)
    returning * into v_signal;
    v_created:=true;
  end if;
  insert into public.management_signal_events(signal_id,event_type,from_status,to_status,actor_user_id,actor_business_role,comment,evidence,request_id)
  values(v_signal.id,case when v_created then 'detected' else 'facts_refreshed' end,case when v_created then null else v_signal.status end,v_signal.status,p_actor_user_id,p_actor_business_role,'规则扫描写入已验证来源的指标事实',coalesce(p_payload->'metric_observation_ids','[]'::jsonb),p_request_id)
  on conflict do nothing;
  return jsonb_build_object('signal',to_jsonb(v_signal),'created',v_created);
end; $$;

alter table public.business_authorization_policies enable row level security;
alter table public.business_role_recusals enable row level security;
alter table public.business_role_coverage_gaps enable row level security;
alter table public.data_sync_contracts enable row level security;
alter table public.metric_observations enable row level security;
alter table public.business_forecast_versions enable row level security;
alter table public.object_impact_packages enable row level security;
alter table public.object_impact_package_events enable row level security;
alter table public.evidence_expiry_events enable row level security;

revoke all on table public.business_authorization_policies,public.business_role_recusals,public.business_role_coverage_gaps,public.data_sync_contracts,public.metric_observations,public.business_forecast_versions,public.object_impact_packages,public.object_impact_package_events,public.evidence_expiry_events from public,anon,authenticated;
grant select,insert,update,delete on table public.business_authorization_policies,public.business_role_recusals,public.business_role_coverage_gaps,public.data_sync_contracts,public.metric_observations,public.business_forecast_versions,public.object_impact_packages,public.object_impact_package_events,public.evidence_expiry_events to service_role;
revoke all on function public.transition_feedback_correction_tx(uuid,text,bigint,text,text,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
revoke all on function public.scan_business_role_coverage_gaps_tx(uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.process_expired_lifecycle_evidence_tx(timestamptz) from public,anon,authenticated;
revoke all on function public.transition_object_impact_package_tx(uuid,text,bigint,text,uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.upsert_generic_management_signal_tx(jsonb,uuid,text,text) from public,anon,authenticated;
grant execute on function public.transition_feedback_correction_tx(uuid,text,bigint,text,text,uuid,text,text,text,jsonb,text) to service_role;
grant execute on function public.scan_business_role_coverage_gaps_tx(uuid,timestamptz) to service_role;
grant execute on function public.process_expired_lifecycle_evidence_tx(timestamptz) to service_role;
grant execute on function public.transition_object_impact_package_tx(uuid,text,bigint,text,uuid,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.upsert_generic_management_signal_tx(jsonb,uuid,text,text) to service_role;
