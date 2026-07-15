begin;

create table if not exists public.controlled_pilot_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  mode text not null check (mode in ('technical_rehearsal','formal_pilot')),
  data_class text not null check (data_class in ('production','test')),
  name text not null check (length(trim(name)) between 3 and 160),
  objective text not null default '',
  status text not null default 'draft' check (status in ('draft','collecting','technical_ready','running','verification','passed','failed','cancelled')),
  version integer not null default 1 check (version > 0),
  idempotency_key text not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  started_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id,idempotency_key),
  check ((mode='technical_rehearsal' and data_class='test') or (mode='formal_pilot' and data_class='production'))
);

create table if not exists public.controlled_pilot_projects (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_data_class text not null check (project_data_class in ('production','test')),
  coverage_note text not null default '',
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (run_id,project_id)
);

create table if not exists public.controlled_pilot_participants (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  assignment_id uuid not null references public.user_business_roles(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete restrict,
  business_role text not null check (business_role in ('pm','operations','pmo','ceo')),
  participant_kind text not null check (participant_kind in ('test_account','real_user')),
  self_signoff_statement text,
  self_signed_at timestamptz,
  self_signoff_request_id text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,user_id),
  unique (run_id,business_role),
  unique (run_id,assignment_id)
);

create table if not exists public.controlled_pilot_module_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  module_key text not null check (module_key in (
    'identity_access','data_reconcile','initiation_planning','wbs_cpm_evm_resources',
    'commercial_finance','stakeholders','quality_acceptance','execution_monitoring',
    'risk_issue_change','closure','formal_reporting_meetings','role_workbenches_inbox',
    'cross_role_flow','feishu_identity_boundary','ai_rag','security_recovery_mobile'
  )),
  result text not null check (result in ('pending','passed','failed')),
  summary text not null default '',
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs)='array'),
  verified_by uuid references public.app_users(id) on delete restrict,
  verified_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,module_key)
);

create table if not exists public.controlled_pilot_golden_chains (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  chain_key text not null check (chain_key in ('A','E')),
  golden_chain_run_id uuid not null references public.golden_chain_runs(id) on delete restrict,
  verification_level text not null check (verification_level in ('technical_exercised','formal_passed')),
  status_snapshot text not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  linked_by uuid not null references public.app_users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  unique (run_id,chain_key),
  unique (run_id,golden_chain_run_id)
);

create table if not exists public.feishu_confirmation_attempt_events (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null references public.feishu_action_confirmations(id) on delete cascade,
  attempt_no integer not null default 0 check (attempt_no >= 0),
  status text not null check (status in ('writing','failed','succeeded')),
  error_code text,
  occurred_at timestamptz not null default now(),
  unique (confirmation_id,attempt_no,status)
);

create table if not exists public.controlled_pilot_feishu_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  confirmation_id uuid not null references public.feishu_action_confirmations(id) on delete restrict,
  action_type text not null check (action_type in ('message','task','base_record_update')),
  status_snapshot text not null check (status_snapshot='succeeded'),
  retry_count integer not null default 0 check (retry_count >= 0),
  failure_observed_at timestamptz,
  recovered_at timestamptz,
  source_record jsonb not null default '{}'::jsonb,
  linked_by uuid not null references public.app_users(id) on delete restrict,
  linked_at timestamptz not null default now(),
  unique (run_id,confirmation_id)
);

create table if not exists public.controlled_pilot_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.controlled_pilot_runs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete restrict,
  data_class text not null check (data_class in ('production','test')),
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  actor_business_role text not null check (actor_business_role in ('pm','operations','pmo','ceo')),
  idempotency_key text not null,
  request_id text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (run_id,idempotency_key)
);

create index if not exists idx_v660_pilot_runs_scope on public.controlled_pilot_runs(org_id,data_class,status,updated_at desc);
create index if not exists idx_v660_pilot_projects_run on public.controlled_pilot_projects(run_id,project_id);
create index if not exists idx_v660_pilot_participants_run on public.controlled_pilot_participants(run_id,business_role,user_id);
create index if not exists idx_v660_pilot_modules_run on public.controlled_pilot_module_checks(run_id,result,module_key);
create index if not exists idx_v660_pilot_events_run on public.controlled_pilot_events(run_id,occurred_at);
create index if not exists idx_v660_feishu_attempts on public.feishu_confirmation_attempt_events(confirmation_id,attempt_no,occurred_at);

create or replace function public.prevent_v660_pilot_event_mutation()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  raise exception 'V660_APPEND_ONLY_EVENT';
end;
$$;

drop trigger if exists trg_v660_pilot_event_immutable on public.controlled_pilot_events;
create trigger trg_v660_pilot_event_immutable before update or delete on public.controlled_pilot_events
for each row execute function public.prevent_v660_pilot_event_mutation();

drop trigger if exists trg_v660_feishu_attempt_event_immutable on public.feishu_confirmation_attempt_events;
create trigger trg_v660_feishu_attempt_event_immutable before update or delete on public.feishu_confirmation_attempt_events
for each row execute function public.prevent_v660_pilot_event_mutation();

create or replace function public.capture_v660_feishu_attempt_event()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.action_type='base_record_update'
    and new.status in ('writing','failed','succeeded')
    and (old.status is distinct from new.status or old.writeback_attempt_count is distinct from new.writeback_attempt_count)
  then
    insert into public.feishu_confirmation_attempt_events(confirmation_id,attempt_no,status,error_code,occurred_at)
    values(new.id,new.writeback_attempt_count,new.status,coalesce(new.writeback_last_error,new.error_code),now())
    on conflict (confirmation_id,attempt_no,status) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v660_capture_feishu_attempt on public.feishu_action_confirmations;
create trigger trg_v660_capture_feishu_attempt after update of status,writeback_attempt_count on public.feishu_action_confirmations
for each row execute function public.capture_v660_feishu_attempt_event();

create or replace function public.evaluate_v660_controlled_pilot(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.controlled_pilot_runs%rowtype;
  v_projects integer:=0;
  v_users integer:=0;
  v_roles integer:=0;
  v_signoffs integer:=0;
  v_kinds integer:=0;
  v_modules integer:=0;
  v_chains integer:=0;
  v_feishu integer:=0;
  v_recovery integer:=0;
  v_required_level text;
  v_blockers jsonb:='[]'::jsonb;
  v_ready boolean:=false;
begin
  select * into v_run from public.controlled_pilot_runs where id=p_run_id;
  if not found then raise exception 'V660_RUN_NOT_FOUND'; end if;
  v_required_level:=case when v_run.mode='formal_pilot' then 'formal_passed' else 'technical_exercised' end;
  select count(distinct project_id) into v_projects from public.controlled_pilot_projects where run_id=p_run_id;
  select count(distinct user_id),count(distinct business_role),count(*) filter(where self_signed_at is not null),
    count(*) filter(where participant_kind=case when v_run.mode='formal_pilot' then 'real_user' else 'test_account' end)
  into v_users,v_roles,v_signoffs,v_kinds from public.controlled_pilot_participants where run_id=p_run_id;
  select count(*) into v_modules from public.controlled_pilot_module_checks
    where run_id=p_run_id and result='passed' and jsonb_array_length(evidence_refs)>0;
  select count(distinct chain_key) into v_chains from public.controlled_pilot_golden_chains
    where run_id=p_run_id and verification_level=v_required_level and chain_key in ('A','E');
  select count(distinct action_type) into v_feishu from public.controlled_pilot_feishu_evidence
    where run_id=p_run_id and status_snapshot='succeeded' and action_type in ('message','task','base_record_update');
  select count(*) into v_recovery from public.controlled_pilot_feishu_evidence
    where run_id=p_run_id and retry_count>=2 and failure_observed_at is not null and recovered_at is not null;

  if v_projects<5 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FIVE_PROJECTS_REQUIRED','detail',format('至少需要5个项目，当前%s个',v_projects))); end if;
  if v_users<4 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FOUR_DISTINCT_USERS_REQUIRED','detail','四个角色必须由不同用户承担')); end if;
  if v_roles<4 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FOUR_ROLES_REQUIRED','detail','PM、运营、PMO、CEO角色不完整')); end if;
  if v_signoffs<4 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FOUR_SELF_SIGNOFFS_REQUIRED','detail','四个角色尚未全部本人签署')); end if;
  if v_kinds<4 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code',case when v_run.mode='formal_pilot' then 'FOUR_REAL_USERS_REQUIRED' else 'FOUR_TEST_ACCOUNTS_REQUIRED' end,'detail','参与人身份类型不符合当前验收模式')); end if;
  if v_modules<16 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','MODULE_COVERAGE_INCOMPLETE','detail',format('16个模块仅通过%s个',v_modules))); end if;
  if not exists(select 1 from public.controlled_pilot_golden_chains where run_id=p_run_id and chain_key='A' and verification_level=v_required_level) then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','GOLDEN_CHAIN_A_REQUIRED','detail','黄金链A未达到要求')); end if;
  if not exists(select 1 from public.controlled_pilot_golden_chains where run_id=p_run_id and chain_key='E' and verification_level=v_required_level) then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','GOLDEN_CHAIN_E_REQUIRED','detail','黄金链E未达到要求')); end if;
  if v_feishu<3 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FEISHU_THREE_TYPES_REQUIRED','detail','飞书消息、任务、智能表写入未全部成功')); end if;
  if v_recovery<1 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FEISHU_FAILURE_RETRY_REQUIRED','detail','缺少真实失败后重试成功证据')); end if;
  if v_run.mode='formal_pilot' and v_run.data_class<>'production' then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','FORMAL_PRODUCTION_DATA_REQUIRED','detail','正式试点只能使用production数据')); end if;
  if v_run.mode='technical_rehearsal' and v_run.data_class<>'test' then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','TECHNICAL_TEST_DATA_REQUIRED','detail','技术演练只能使用test数据')); end if;
  v_ready:=jsonb_array_length(v_blockers)=0;
  return jsonb_build_object(
    'technical_ready',v_run.mode='technical_rehearsal' and v_ready,
    'formal_passed',v_run.mode='formal_pilot' and v_ready,
    'blockers',v_blockers,
    'metrics',jsonb_build_object('projects',v_projects,'distinct_users',v_users,'roles',v_roles,'self_signoffs',v_signoffs,'modules_passed',v_modules,'golden_chains',v_chains,'feishu_types',v_feishu,'recovered_failures',v_recovery)
  );
end;
$$;

create or replace function public.create_v660_controlled_pilot_tx(
  p_org_id uuid,p_mode text,p_data_class text,p_name text,p_objective text,
  p_actor_user_id uuid,p_actor_business_role text,p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.controlled_pilot_runs%rowtype;
  v_result jsonb;
begin
  if p_actor_business_role<>'pmo' then raise exception 'V660_PMO_REQUIRED'; end if;
  if p_mode not in ('technical_rehearsal','formal_pilot') then raise exception 'V660_MODE_INVALID'; end if;
  if (p_mode='technical_rehearsal' and p_data_class<>'test') or (p_mode='formal_pilot' and p_data_class<>'production') then raise exception 'V660_DATA_CLASS_MODE_MISMATCH'; end if;
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'V660_IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into v_run from public.controlled_pilot_runs where org_id=p_org_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('run',to_jsonb(v_run),'duplicate',true,'evaluation',public.evaluate_v660_controlled_pilot(v_run.id)); end if;
  insert into public.controlled_pilot_runs(org_id,mode,data_class,name,objective,created_by,idempotency_key)
  values(p_org_id,p_mode,p_data_class,trim(p_name),coalesce(trim(p_objective),''),p_actor_user_id,p_idempotency_key)
  returning * into v_run;
  v_result:=jsonb_build_object('run',to_jsonb(v_run),'duplicate',false,'evaluation',public.evaluate_v660_controlled_pilot(v_run.id));
  insert into public.controlled_pilot_events(run_id,org_id,data_class,event_type,to_status,actor_user_id,actor_business_role,idempotency_key,request_id,payload,result)
  values(v_run.id,p_org_id,p_data_class,'pilot_created',v_run.status,p_actor_user_id,p_actor_business_role,p_idempotency_key,p_request_id,jsonb_build_object('mode',p_mode,'name',p_name),v_result);
  return v_result;
end;
$$;

create or replace function public.mutate_v660_controlled_pilot_tx(
  p_run_id uuid,p_org_id uuid,p_data_class text,p_operation text,p_payload jsonb,
  p_actor_user_id uuid,p_actor_business_role text,p_expected_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_run public.controlled_pilot_runs%rowtype;
  v_event public.controlled_pilot_events%rowtype;
  v_assignment public.user_business_roles%rowtype;
  v_golden public.golden_chain_runs%rowtype;
  v_confirmation public.feishu_action_confirmations%rowtype;
  v_from_status text;
  v_to_status text;
  v_level text;
  v_failure_at timestamptz;
  v_recovered_at timestamptz;
  v_eval jsonb;
  v_result jsonb;
  v_project_count integer;
  v_user_count integer;
  v_role_count integer;
begin
  if nullif(trim(p_idempotency_key),'') is null then raise exception 'V660_IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into v_event from public.controlled_pilot_events where run_id=p_run_id and idempotency_key=p_idempotency_key;
  if found then return v_event.result||jsonb_build_object('duplicate',true); end if;
  select * into v_run from public.controlled_pilot_runs where id=p_run_id and org_id=p_org_id and data_class=p_data_class for update;
  if not found then raise exception 'V660_RUN_NOT_FOUND'; end if;
  if v_run.version<>p_expected_version then raise exception 'V660_VERSION_CONFLICT'; end if;
  if v_run.status in ('passed','cancelled','technical_ready') then raise exception 'V660_TERMINAL_RUN_IMMUTABLE'; end if;
  v_from_status:=v_run.status;
  v_to_status:=v_run.status;

  if p_operation='add_project' then
    if p_actor_business_role<>'pmo' then raise exception 'V660_PMO_REQUIRED'; end if;
    if v_run.status not in ('draft','collecting') then raise exception 'V660_PROJECT_BINDING_CLOSED'; end if;
    if not exists(select 1 from public.projects where id=(p_payload->>'project_id')::uuid and org_id=p_org_id and data_class=p_data_class) then raise exception 'V660_PROJECT_OUTSIDE_SCOPE'; end if;
    insert into public.controlled_pilot_projects(run_id,project_id,project_data_class,coverage_note,created_by)
    values(p_run_id,(p_payload->>'project_id')::uuid,p_data_class,coalesce(p_payload->>'coverage_note',''),p_actor_user_id)
    on conflict(run_id,project_id) do update set coverage_note=excluded.coverage_note;
  elsif p_operation='bind_participant' then
    if p_actor_business_role<>'pmo' then raise exception 'V660_PMO_REQUIRED'; end if;
    if v_run.status not in ('draft','collecting') then raise exception 'V660_PARTICIPANT_BINDING_CLOSED'; end if;
    select * into v_assignment from public.user_business_roles
      where id=(p_payload->>'assignment_id')::uuid and org_id=p_org_id and status='active'
        and business_role in ('pm','operations','pmo','ceo') and valid_from<=now() and (valid_until is null or valid_until>=now());
    if not found then raise exception 'V660_ASSIGNMENT_OUTSIDE_SCOPE'; end if;
    if (v_run.mode='formal_pilot' and p_payload->>'participant_kind'<>'real_user') or (v_run.mode='technical_rehearsal' and p_payload->>'participant_kind'<>'test_account') then raise exception 'V660_PARTICIPANT_KIND_MISMATCH'; end if;
    insert into public.controlled_pilot_participants(run_id,assignment_id,user_id,business_role,participant_kind,created_by)
    values(p_run_id,v_assignment.id,v_assignment.user_id,v_assignment.business_role,p_payload->>'participant_kind',p_actor_user_id)
    on conflict(run_id,business_role) do update set assignment_id=excluded.assignment_id,user_id=excluded.user_id,participant_kind=excluded.participant_kind,updated_at=now(),self_signoff_statement=null,self_signed_at=null,self_signoff_request_id=null;
  elsif p_operation='record_module_check' then
    if p_actor_business_role not in ('pm','operations','pmo','ceo') then raise exception 'V660_ROLE_FORBIDDEN'; end if;
    if v_run.status not in ('collecting','running','verification') then raise exception 'V660_MODULE_CHECK_STATE_INVALID'; end if;
    if p_payload->>'result' not in ('pending','passed','failed') then raise exception 'V660_MODULE_RESULT_INVALID'; end if;
    if p_payload->>'result'='passed' and (jsonb_typeof(p_payload->'evidence_refs')<>'array' or jsonb_array_length(p_payload->'evidence_refs')=0) then raise exception 'V660_MODULE_EVIDENCE_REQUIRED'; end if;
    insert into public.controlled_pilot_module_checks(run_id,module_key,result,summary,evidence_refs,verified_by,verified_at)
    values(p_run_id,p_payload->>'module_key',p_payload->>'result',coalesce(p_payload->>'summary',''),coalesce(p_payload->'evidence_refs','[]'::jsonb),p_actor_user_id,case when p_payload->>'result'<>'pending' then now() end)
    on conflict(run_id,module_key) do update set result=excluded.result,summary=excluded.summary,evidence_refs=excluded.evidence_refs,verified_by=excluded.verified_by,verified_at=excluded.verified_at,version=public.controlled_pilot_module_checks.version+1,updated_at=now();
  elsif p_operation='link_golden_chain' then
    if p_actor_business_role<>'pmo' then raise exception 'V660_PMO_REQUIRED'; end if;
    select * into v_golden from public.golden_chain_runs
      where id=(p_payload->>'golden_chain_run_id')::uuid and org_id=p_org_id and data_class=p_data_class and chain_key in ('A','E');
    if not found then raise exception 'V660_GOLDEN_CHAIN_OUTSIDE_SCOPE'; end if;
    if not exists(select 1 from public.controlled_pilot_projects where run_id=p_run_id and project_id=v_golden.project_id) then raise exception 'V660_GOLDEN_CHAIN_PROJECT_NOT_BOUND'; end if;
    if v_run.mode='formal_pilot' then
      if v_golden.status<>'passed' or v_golden.data_class<>'production' then raise exception 'V660_FORMAL_GOLDEN_CHAIN_NOT_PASSED'; end if;
      v_level:='formal_passed';
    else
      if v_golden.status not in ('verification','passed')
        or exists(select 1 from public.golden_chain_steps where run_id=v_golden.id and status<>'verified')
        or exists(select 1 from public.golden_chain_failure_paths where run_id=v_golden.id and status<>'passed')
      then raise exception 'V660_TECHNICAL_GOLDEN_CHAIN_NOT_EXERCISED'; end if;
      v_level:='technical_exercised';
    end if;
    insert into public.controlled_pilot_golden_chains(run_id,chain_key,golden_chain_run_id,verification_level,status_snapshot,evidence_snapshot,linked_by)
    values(p_run_id,v_golden.chain_key,v_golden.id,v_level,v_golden.status,jsonb_build_object('verified_at',v_golden.verified_at,'project_id',v_golden.project_id),p_actor_user_id)
    on conflict(run_id,chain_key) do update set golden_chain_run_id=excluded.golden_chain_run_id,verification_level=excluded.verification_level,status_snapshot=excluded.status_snapshot,evidence_snapshot=excluded.evidence_snapshot,linked_by=excluded.linked_by,linked_at=now();
  elsif p_operation='link_feishu_confirmation' then
    if p_actor_business_role not in ('operations','pmo') then raise exception 'V660_FEISHU_LINK_ROLE_FORBIDDEN'; end if;
    select * into v_confirmation from public.feishu_action_confirmations
      where id=(p_payload->>'confirmation_id')::uuid and org_id=p_org_id and data_class=p_data_class
        and status='succeeded' and action_type in ('message','task','base_record_update');
    if not found then raise exception 'V660_FEISHU_CONFIRMATION_OUTSIDE_SCOPE'; end if;
    if v_confirmation.project_id is not null and not exists(select 1 from public.controlled_pilot_projects where run_id=p_run_id and project_id=v_confirmation.project_id) then raise exception 'V660_FEISHU_PROJECT_NOT_BOUND'; end if;
    select min(occurred_at) filter(where status='failed'),max(occurred_at) filter(where status='succeeded')
    into v_failure_at,v_recovered_at from public.feishu_confirmation_attempt_events where confirmation_id=v_confirmation.id;
    insert into public.controlled_pilot_feishu_evidence(run_id,confirmation_id,action_type,status_snapshot,retry_count,failure_observed_at,recovered_at,source_record,linked_by)
    values(p_run_id,v_confirmation.id,v_confirmation.action_type,v_confirmation.status,v_confirmation.writeback_attempt_count,v_failure_at,v_recovered_at,jsonb_build_object('resource',v_confirmation.resource,'executed_at',v_confirmation.executed_at,'request_id',v_confirmation.request_id),p_actor_user_id)
    on conflict(run_id,confirmation_id) do update set status_snapshot=excluded.status_snapshot,retry_count=excluded.retry_count,failure_observed_at=excluded.failure_observed_at,recovered_at=excluded.recovered_at,source_record=excluded.source_record,linked_by=excluded.linked_by,linked_at=now();
  elsif p_operation='self_signoff' then
    if coalesce((p_payload->>'confirm')::boolean,false) is not true then raise exception 'V660_SELF_SIGNOFF_CONFIRMATION_REQUIRED'; end if;
    if length(trim(coalesce(p_payload->>'statement','')))<12 then raise exception 'V660_SELF_SIGNOFF_STATEMENT_REQUIRED'; end if;
    update public.controlled_pilot_participants set self_signoff_statement=trim(p_payload->>'statement'),self_signed_at=now(),self_signoff_request_id=p_request_id,updated_at=now()
    where run_id=p_run_id and user_id=p_actor_user_id and business_role=p_actor_business_role;
    if not found then raise exception 'V660_SELF_SIGNOFF_ACTOR_REQUIRED'; end if;
  elsif p_operation='transition' then
    if p_payload->>'action'='start_collection' and v_run.status='draft' and p_actor_business_role='pmo' then v_to_status:='collecting';
    elsif p_payload->>'action'='mark_technical_ready' and v_run.status='collecting' and p_actor_business_role='pmo' and v_run.mode='technical_rehearsal' then
      v_eval:=public.evaluate_v660_controlled_pilot(p_run_id); if coalesce((v_eval->>'technical_ready')::boolean,false) is not true then raise exception 'V660_TECHNICAL_READINESS_BLOCKED'; end if; v_to_status:='technical_ready';
    elsif p_payload->>'action'='start_formal_pilot' and v_run.status='collecting' and p_actor_business_role='pmo' and v_run.mode='formal_pilot' then
      select count(distinct project_id) into v_project_count from public.controlled_pilot_projects where run_id=p_run_id;
      select count(distinct user_id),count(distinct business_role) into v_user_count,v_role_count from public.controlled_pilot_participants where run_id=p_run_id;
      if v_project_count<5 or v_user_count<4 or v_role_count<4 then raise exception 'V660_FORMAL_BASELINE_INCOMPLETE'; end if; v_to_status:='running';
    elsif p_payload->>'action'='submit_verification' and v_run.status='running' and p_actor_business_role='pmo' then v_to_status:='verification';
    elsif p_payload->>'action'='pass' and v_run.status='verification' and p_actor_business_role='ceo' and v_run.mode='formal_pilot' then
      v_eval:=public.evaluate_v660_controlled_pilot(p_run_id); if coalesce((v_eval->>'formal_passed')::boolean,false) is not true then raise exception 'V660_FORMAL_ACCEPTANCE_BLOCKED'; end if; v_to_status:='passed';
    elsif p_payload->>'action'='fail' and v_run.status='verification' and p_actor_business_role in ('pmo','ceo') then v_to_status:='failed';
    elsif p_payload->>'action'='retry' and v_run.status='failed' and p_actor_business_role='pmo' then v_to_status:='running';
    elsif p_payload->>'action'='cancel' and p_actor_business_role='pmo' then v_to_status:='cancelled';
    else raise exception 'V660_TRANSITION_FORBIDDEN'; end if;
  else raise exception 'V660_OPERATION_INVALID'; end if;

  update public.controlled_pilot_runs set status=v_to_status,version=version+1,updated_at=now(),
    started_at=case when v_to_status in ('collecting','running') then coalesce(started_at,now()) else started_at end,
    submitted_at=case when v_to_status='verification' then now() else submitted_at end,
    completed_at=case when v_to_status in ('technical_ready','passed','failed','cancelled') then now() else null end,
    failure_reason=case when v_to_status='failed' then nullif(trim(coalesce(p_payload->>'reason','')),'') when v_to_status not in ('failed') then null else failure_reason end
  where id=p_run_id returning * into v_run;
  v_eval:=public.evaluate_v660_controlled_pilot(p_run_id);
  v_result:=jsonb_build_object('run',to_jsonb(v_run),'evaluation',v_eval,'duplicate',false);
  insert into public.controlled_pilot_events(run_id,org_id,data_class,event_type,from_status,to_status,actor_user_id,actor_business_role,idempotency_key,request_id,payload,result)
  values(p_run_id,p_org_id,p_data_class,p_operation,v_from_status,v_to_status,p_actor_user_id,p_actor_business_role,p_idempotency_key,p_request_id,p_payload,v_result);
  return v_result;
end;
$$;

alter table public.controlled_pilot_runs enable row level security;
alter table public.controlled_pilot_projects enable row level security;
alter table public.controlled_pilot_participants enable row level security;
alter table public.controlled_pilot_module_checks enable row level security;
alter table public.controlled_pilot_golden_chains enable row level security;
alter table public.feishu_confirmation_attempt_events enable row level security;
alter table public.controlled_pilot_feishu_evidence enable row level security;
alter table public.controlled_pilot_events enable row level security;

revoke all on table public.controlled_pilot_runs,public.controlled_pilot_projects,public.controlled_pilot_participants,public.controlled_pilot_module_checks,public.controlled_pilot_golden_chains,public.feishu_confirmation_attempt_events,public.controlled_pilot_feishu_evidence,public.controlled_pilot_events from public,anon,authenticated;
grant select,insert,update,delete on table public.controlled_pilot_runs,public.controlled_pilot_projects,public.controlled_pilot_participants,public.controlled_pilot_module_checks,public.controlled_pilot_golden_chains,public.feishu_confirmation_attempt_events,public.controlled_pilot_feishu_evidence,public.controlled_pilot_events to service_role;

revoke all on function public.prevent_v660_pilot_event_mutation(),public.capture_v660_feishu_attempt_event(),public.evaluate_v660_controlled_pilot(uuid),public.create_v660_controlled_pilot_tx(uuid,text,text,text,text,uuid,text,text,text),public.mutate_v660_controlled_pilot_tx(uuid,uuid,text,text,jsonb,uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function public.prevent_v660_pilot_event_mutation(),public.capture_v660_feishu_attempt_event(),public.evaluate_v660_controlled_pilot(uuid),public.create_v660_controlled_pilot_tx(uuid,text,text,text,text,uuid,text,text,text),public.mutate_v660_controlled_pilot_tx(uuid,uuid,text,text,jsonb,uuid,text,integer,text,text) to service_role;

commit;
