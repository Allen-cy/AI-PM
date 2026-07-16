begin;

-- V6.6.6 closes the quarantine -> Chinese field decision -> explicit Base
-- confirmation loop. It never creates a canonical project and never promotes
-- sample/test-marked source rows to production.
create table if not exists public.feishu_data_classification_drafts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete restrict,
  quarantine_id uuid not null references public.feishu_reconcile_quarantine(id) on delete restrict,
  domain text not null check (domain in ('project','milestone','task','risk','contract','payment','cost','syncLedger')),
  source_container_id text not null,
  source_record_id text not null,
  target_data_class text not null check (target_data_class in ('production','sample','test','diagnostic')),
  target_chinese_value text not null check (target_chinese_value in ('正式','样例','测试','诊断')),
  expected_chinese_value text,
  decision_reason text not null check (char_length(trim(decision_reason)) between 4 and 500),
  status text not null default 'queued' check (status in ('queued','writing','succeeded','failed','cancelled')),
  requested_by uuid not null references public.app_users(id) on delete restrict,
  feishu_confirmation_id uuid unique,
  idempotency_key text not null,
  request_id text not null,
  version bigint not null default 1 check (version > 0),
  writeback_attempt_count integer not null default 0 check (writeback_attempt_count between 0 and 1000),
  writeback_lease_expires_at timestamptz,
  resource jsonb,
  error_code text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (org_id,idempotency_key)
);

alter table public.feishu_action_confirmations
  add column if not exists classification_draft_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.feishu_action_confirmations'::regclass
      and conname='feishu_action_confirmations_classification_draft_id_fkey'
  ) then
    alter table public.feishu_action_confirmations
      add constraint feishu_action_confirmations_classification_draft_id_fkey
      foreign key (classification_draft_id) references public.feishu_data_classification_drafts(id) on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.feishu_data_classification_drafts'::regclass
      and conname='feishu_data_classification_drafts_confirmation_fkey'
  ) then
    alter table public.feishu_data_classification_drafts
      add constraint feishu_data_classification_drafts_confirmation_fkey
      foreign key (feishu_confirmation_id) references public.feishu_action_confirmations(id) on delete restrict;
  end if;
end $$;

alter table public.feishu_action_confirmations drop constraint if exists feishu_action_confirmations_table_key_check;
alter table public.feishu_action_confirmations add constraint feishu_action_confirmations_table_key_check
  check (table_key is null or table_key in ('project','milestone','task','risk','contract','payment','cost','syncLedger'));
alter table public.feishu_action_confirmations drop constraint if exists feishu_action_confirmations_base_draft_check;
alter table public.feishu_action_confirmations add constraint feishu_action_confirmations_base_draft_check
  check (action_type <> 'base_record_update' or num_nonnulls(business_update_draft_id,classification_draft_id)=1) not valid;
alter table public.feishu_action_confirmations validate constraint feishu_action_confirmations_base_draft_check;

create unique index if not exists uq_feishu_confirmation_classification_draft
  on public.feishu_action_confirmations(classification_draft_id) where classification_draft_id is not null;
create unique index if not exists uq_v666_active_classification_quarantine
  on public.feishu_data_classification_drafts(quarantine_id)
  where status in ('queued','writing','failed');
create index if not exists idx_v666_classification_scope
  on public.feishu_data_classification_drafts(org_id,status,updated_at desc);

alter table public.feishu_data_classification_drafts enable row level security;
revoke all on table public.feishu_data_classification_drafts from public,anon,authenticated;
grant select,insert,update,delete on table public.feishu_data_classification_drafts to service_role;

create or replace function public.create_v666_data_classification_draft_tx(
  p_draft_id uuid,
  p_quarantine_id uuid,
  p_target_data_class text,
  p_reason text,
  p_actor_user_id uuid,
  p_expected_occurrence_count integer,
  p_idempotency_key text,
  p_payload jsonb,
  p_preview jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_q public.feishu_reconcile_quarantine%rowtype;
  v_existing public.feishu_data_classification_drafts%rowtype;
  v_draft_id uuid := p_draft_id;
  v_confirmation_id uuid;
  v_target_chinese text;
  v_current text;
  v_requester public.app_users%rowtype;
begin
  if v_draft_id is null then raise exception 'V666_DRAFT_ID_REQUIRED'; end if;
  if p_target_data_class not in ('production','sample','test','diagnostic') then raise exception 'V666_TARGET_DATA_CLASS_INVALID'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'V666_DECISION_REASON_REQUIRED'; end if;
  if char_length(trim(coalesce(p_idempotency_key,''))) not between 8 and 160 then raise exception 'V666_IDEMPOTENCY_KEY_INVALID'; end if;
  select * into v_q from public.feishu_reconcile_quarantine where id=p_quarantine_id for update;
  if not found or v_q.status not in ('pending','under_review') then raise exception 'V666_QUARANTINE_NOT_ACTIONABLE'; end if;
  if v_q.occurrence_count<>p_expected_occurrence_count then raise exception 'V666_QUARANTINE_VERSION_CONFLICT'; end if;
  select * into v_requester from public.app_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'V666_ACTOR_INACTIVE'; end if;
  if not exists (
    select 1 from public.user_business_roles r
    where r.user_id=p_actor_user_id and r.org_id=v_q.org_id and r.business_role='pmo'
      and r.subject_scope='organization' and r.subject_id=v_q.org_id::text and r.status='active'
      and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
  ) then raise exception 'V666_ORGANIZATION_PMO_REQUIRED'; end if;

  select * into v_existing from public.feishu_data_classification_drafts
  where quarantine_id=v_q.id and status in ('queued','writing','failed') order by created_at desc limit 1;
  if found then
    return jsonb_build_object('draft_id',v_existing.id,'confirmation_id',v_existing.feishu_confirmation_id,'status',v_existing.status,'duplicate',true);
  end if;

  if p_target_data_class='production' and (
    coalesce(nullif(trim(v_q.source_payload->>'样例来源'),''),nullif(trim(v_q.source_payload->>'样例编号'),''),nullif(trim(v_q.source_payload->>'示例来源'),''),nullif(trim(v_q.source_payload->>'demo_source'),'')) is not null
    or coalesce(nullif(trim(v_q.source_payload->>'测试批次'),''),nullif(trim(v_q.source_payload->>'测试标记'),''),nullif(trim(v_q.source_payload->>'test_batch'),''),nullif(trim(v_q.source_payload->>'test_marker'),'')) is not null
  ) then raise exception 'V666_SAMPLE_TO_PRODUCTION_FORBIDDEN'; end if;

  v_target_chinese := case p_target_data_class when 'production' then '正式' when 'sample' then '样例' when 'test' then '测试' else '诊断' end;
  v_current := coalesce(nullif(trim(v_q.source_payload->>'数据分类'),''),nullif(trim(v_q.source_payload->>'数据空间'),''),nullif(trim(v_q.source_payload->>'数据类型'),''),nullif(trim(v_q.source_payload->>'data_class'),''));
  if v_current=v_target_chinese then raise exception 'V666_CLASSIFICATION_ALREADY_APPLIED'; end if;

  if p_payload->>'type'<>'base_record_update'
    or p_payload->>'classification_draft_id'<>v_draft_id::text
    or p_payload->>'org_id'<>v_q.org_id::text
    or p_payload->>'data_class'<>'unclassified'
    or p_payload->>'table_key'<>v_q.domain
    or p_payload->>'record_id'<>v_q.source_record_id
    or p_payload ? 'project_id'
    or p_payload->>'idempotency_key'<>('data-classification-draft:'||v_draft_id::text||':v1')
    or p_payload->'fields' is distinct from jsonb_build_object('数据分类',v_target_chinese)
    or p_payload->'expected_fields' is distinct from jsonb_build_object('数据分类',v_current)
  then raise exception 'V666_WRITEBACK_PAYLOAD_MISMATCH'; end if;

  insert into public.feishu_data_classification_drafts(
    id,org_id,quarantine_id,domain,source_container_id,source_record_id,target_data_class,
    target_chinese_value,expected_chinese_value,decision_reason,status,requested_by,idempotency_key,request_id
  ) values (
    v_draft_id,v_q.org_id,v_q.id,v_q.domain,v_q.source_container_id,v_q.source_record_id,p_target_data_class,
    v_target_chinese,v_current,trim(p_reason),'queued',p_actor_user_id,p_idempotency_key,p_request_id
  );
  insert into public.feishu_action_confirmations(
    requester_id,requester_name,requester_email,source,source_page,action_type,idempotency_key,
    target_summary,risk_level,status,payload,preview,request_id,classification_draft_id,
    org_id,project_id,data_class,table_key,record_id
  ) values (
    p_actor_user_id,coalesce(v_requester.name,v_requester.email,v_requester.phone),v_requester.email,
    'integration_center','/integration-center/data-governance','base_record_update',p_payload->>'idempotency_key',
    coalesce(p_preview->>'targetSummary','更新飞书数据分类'),'high','pending_confirmation',p_payload,p_preview,p_request_id,v_draft_id,
    v_q.org_id,null,'unclassified',v_q.domain,v_q.source_record_id
  ) returning id into v_confirmation_id;
  update public.feishu_data_classification_drafts set feishu_confirmation_id=v_confirmation_id where id=v_draft_id;
  return jsonb_build_object('draft_id',v_draft_id,'confirmation_id',v_confirmation_id,'status','queued','duplicate',false);
end;
$$;

create or replace function public.claim_v666_data_classification_writeback_tx(
  p_confirmation_id uuid,p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_c public.feishu_action_confirmations%rowtype;
  v_d public.feishu_data_classification_drafts%rowtype;
  v_actor_role text;
  v_attempt integer;
  v_lease timestamptz;
begin
  select * into v_c from public.feishu_action_confirmations where id=p_confirmation_id for update;
  if not found or v_c.classification_draft_id is null or v_c.action_type<>'base_record_update' then raise exception 'V666_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_d from public.feishu_data_classification_drafts where id=v_c.classification_draft_id for update;
  if not found or v_d.feishu_confirmation_id<>v_c.id then raise exception 'V666_DRAFT_LINK_MISMATCH'; end if;
  select role into v_actor_role from public.app_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'V666_ACTOR_INACTIVE'; end if;
  if p_actor_user_id<>v_c.requester_id and coalesce(v_actor_role,'')<>'admin' then raise exception 'V666_WRITEBACK_FORBIDDEN'; end if;
  if not exists (
    select 1 from public.user_business_roles r where r.user_id=v_d.requested_by and r.org_id=v_d.org_id
      and r.business_role='pmo' and r.subject_scope='organization' and r.subject_id=v_d.org_id::text
      and r.status='active' and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
  ) then raise exception 'V666_REQUESTER_PMO_EXPIRED'; end if;
  if v_c.status='writing' and v_d.status='writing' and v_d.writeback_lease_expires_at>now() then raise exception 'V666_WRITEBACK_IN_PROGRESS'; end if;
  if not ((v_c.status in ('pending_confirmation','failed') and v_d.status in ('queued','failed'))
    or (v_c.status='writing' and v_d.status='writing' and coalesce(v_d.writeback_lease_expires_at,now())<=now()))
  then raise exception 'V666_WRITEBACK_STATE_CONFLICT'; end if;
  if v_c.org_id<>v_d.org_id or v_c.project_id is not null or v_c.data_class<>'unclassified'
    or v_c.table_key<>v_d.domain or v_c.record_id<>v_d.source_record_id then raise exception 'V666_WRITEBACK_LINK_MISMATCH'; end if;
  v_attempt:=v_d.writeback_attempt_count+1;
  v_lease:=now()+interval '5 minutes';
  update public.feishu_action_confirmations set status='writing',confirmed_at=coalesce(confirmed_at,now()),
    writeback_attempt_count=v_attempt,writeback_last_attempt_at=now(),writeback_lease_expires_at=v_lease,
    error_code=null,writeback_last_error=null,updated_at=now() where id=v_c.id;
  update public.feishu_data_classification_drafts set status='writing',writeback_attempt_count=v_attempt,
    writeback_lease_expires_at=v_lease,error_code=null,updated_at=now() where id=v_d.id;
  return jsonb_build_object('draft_id',v_d.id,'confirmation_id',v_c.id,'attempt',v_attempt,'lease_expires_at',v_lease);
end;
$$;

create or replace function public.finalize_v666_data_classification_writeback_tx(
  p_confirmation_id uuid,p_expected_attempt integer,p_status text,p_resource jsonb,p_error_code text,p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_c public.feishu_action_confirmations%rowtype;
  v_d public.feishu_data_classification_drafts%rowtype;
begin
  if p_status not in ('succeeded','failed') then raise exception 'V666_FINAL_STATUS_INVALID'; end if;
  select * into v_c from public.feishu_action_confirmations where id=p_confirmation_id for update;
  if not found or v_c.classification_draft_id is null then raise exception 'V666_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_d from public.feishu_data_classification_drafts where id=v_c.classification_draft_id for update;
  if not found or v_d.feishu_confirmation_id<>v_c.id then raise exception 'V666_DRAFT_LINK_MISMATCH'; end if;
  if v_d.writeback_attempt_count<>p_expected_attempt or v_c.writeback_attempt_count<>p_expected_attempt then raise exception 'V666_FENCING_TOKEN_MISMATCH'; end if;
  if v_c.status=p_status and v_d.status=p_status then return jsonb_build_object('draft_id',v_d.id,'status',p_status,'duplicate',true); end if;
  if v_c.status<>'writing' or v_d.status<>'writing' then raise exception 'V666_FINALIZE_STATE_CONFLICT'; end if;
  update public.feishu_action_confirmations set status=p_status,resource=case when p_status='succeeded' then coalesce(p_resource,'{}'::jsonb) else resource end,
    error_code=case when p_status='failed' then coalesce(nullif(left(p_error_code,160),''),'V666_WRITEBACK_FAILED') else null end,
    writeback_last_error=case when p_status='failed' then coalesce(nullif(left(p_error_code,160),''),'V666_WRITEBACK_FAILED') else null end,
    writeback_lease_expires_at=null,executed_at=now(),updated_at=now() where id=v_c.id;
  update public.feishu_data_classification_drafts set status=p_status,resource=case when p_status='succeeded' then coalesce(p_resource,'{}'::jsonb) else resource end,
    error_code=case when p_status='failed' then coalesce(nullif(left(p_error_code,160),''),'V666_WRITEBACK_FAILED') else null end,
    writeback_lease_expires_at=null,completed_at=case when p_status='succeeded' then now() else completed_at end,updated_at=now() where id=v_d.id;
  if p_status='succeeded' then
    update public.feishu_reconcile_quarantine set status='resolved',
      resolution_note='PMO已二次确认并写回飞书中文字段“数据分类”='||v_d.target_chinese_value||'；等待目标数据空间重新对账。',
      resolved_by=p_actor_user_id,resolved_at=now(),updated_at=now()
    where id=v_d.quarantine_id and status in ('pending','under_review');
  end if;
  return jsonb_build_object('draft_id',v_d.id,'status',p_status,'duplicate',false);
end;
$$;

create or replace function public.cancel_v666_data_classification_writeback_tx(
  p_confirmation_id uuid,p_actor_user_id uuid,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_c public.feishu_action_confirmations%rowtype;
  v_d public.feishu_data_classification_drafts%rowtype;
  v_actor_role text;
begin
  select * into v_c from public.feishu_action_confirmations where id=p_confirmation_id for update;
  if not found or v_c.classification_draft_id is null then raise exception 'V666_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_d from public.feishu_data_classification_drafts where id=v_c.classification_draft_id for update;
  if not found then raise exception 'V666_DRAFT_LINK_MISMATCH'; end if;
  select role into v_actor_role from public.app_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'V666_ACTOR_INACTIVE'; end if;
  if p_actor_user_id<>v_c.requester_id and coalesce(v_actor_role,'')<>'admin' then raise exception 'V666_WRITEBACK_FORBIDDEN'; end if;
  if v_c.status in ('writing','succeeded','cancelled') or v_d.status in ('writing','succeeded','cancelled') then raise exception 'V666_CANCEL_STATE_CONFLICT'; end if;
  update public.feishu_action_confirmations set status='cancelled',cancel_reason=coalesce(nullif(left(trim(p_reason),500),''),'用户取消数据分类写回。'),
    cancelled_at=now(),writeback_lease_expires_at=null,updated_at=now() where id=v_c.id;
  update public.feishu_data_classification_drafts set status='cancelled',cancelled_reason=coalesce(nullif(left(trim(p_reason),500),''),'用户取消数据分类写回。'),
    writeback_lease_expires_at=null,updated_at=now() where id=v_d.id;
  return jsonb_build_object('draft_id',v_d.id,'status','cancelled');
end;
$$;

revoke all on function public.create_v666_data_classification_draft_tx(uuid,uuid,text,text,uuid,integer,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.claim_v666_data_classification_writeback_tx(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finalize_v666_data_classification_writeback_tx(uuid,integer,text,jsonb,text,uuid) from public,anon,authenticated;
revoke all on function public.cancel_v666_data_classification_writeback_tx(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_v666_data_classification_draft_tx(uuid,uuid,text,text,uuid,integer,text,jsonb,jsonb,text) to service_role;
grant execute on function public.claim_v666_data_classification_writeback_tx(uuid,uuid) to service_role;
grant execute on function public.finalize_v666_data_classification_writeback_tx(uuid,integer,text,jsonb,text,uuid) to service_role;
grant execute on function public.cancel_v666_data_classification_writeback_tx(uuid,uuid,text) to service_role;

do $$ begin
  if exists(select 1 from public.audit_v61_database_security()) then
    raise exception 'V6.6.6 security audit reported findings';
  end if;
end $$;

commit;
