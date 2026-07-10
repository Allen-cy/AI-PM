-- AI PM System V5.4.0 P19 controlled business writeback.
-- Business draft confirmation and Feishu Base confirmation queue are linked atomically.

create table if not exists public.feishu_action_confirmations (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid references public.app_users(id) on delete set null,
  requester_name text,
  requester_email text,
  source text not null default 'system' check (source in ('api_token', 'user_center', 'integration_center', 'system')),
  source_page text,
  action_type text not null,
  idempotency_key text not null,
  target_summary text not null,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation', 'confirmed', 'writing', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  resource jsonb,
  error_code text,
  cancel_reason text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  executed_at timestamptz,
  cancelled_at timestamptz
);

alter table public.feishu_action_confirmations enable row level security;
revoke all on table public.feishu_action_confirmations from public, anon, authenticated;
grant select, insert, update, delete on table public.feishu_action_confirmations to service_role;

alter table public.feishu_action_confirmations
  drop constraint if exists feishu_action_confirmations_action_type_check;
alter table public.feishu_action_confirmations
  add constraint feishu_action_confirmations_action_type_check
  check (action_type in ('message', 'task', 'calendar', 'document', 'base_record_update'));

alter table public.feishu_action_confirmations
  add column if not exists business_update_draft_id uuid,
  add column if not exists org_id uuid references public.organizations(id) on delete restrict,
  add column if not exists project_id uuid references public.projects(id) on delete restrict,
  add column if not exists data_class text,
  add column if not exists table_key text,
  add column if not exists record_id text,
  add column if not exists writeback_attempt_count integer not null default 0,
  add column if not exists writeback_last_attempt_at timestamptz,
  add column if not exists writeback_lease_expires_at timestamptz,
  add column if not exists writeback_last_error text;

alter table public.feishu_action_confirmations
  drop constraint if exists feishu_action_confirmations_writeback_attempt_count_check;
alter table public.feishu_action_confirmations
  add constraint feishu_action_confirmations_writeback_attempt_count_check
  check (writeback_attempt_count between 0 and 1000);

alter table public.feishu_action_confirmations
  drop constraint if exists feishu_action_confirmations_data_class_check;
alter table public.feishu_action_confirmations
  add constraint feishu_action_confirmations_data_class_check
  check (data_class is null or data_class in ('production', 'sample', 'test', 'diagnostic', 'unclassified'));
alter table public.feishu_action_confirmations
  drop constraint if exists feishu_action_confirmations_table_key_check;
alter table public.feishu_action_confirmations
  add constraint feishu_action_confirmations_table_key_check
  check (table_key is null or table_key in ('project', 'milestone', 'risk', 'contract', 'payment'));

alter table public.business_update_drafts
  add column if not exists feishu_confirmation_id uuid references public.feishu_action_confirmations(id) on delete restrict;
alter table public.business_update_drafts
  drop constraint if exists business_update_drafts_writeback_status_check;
alter table public.business_update_drafts
  add constraint business_update_drafts_writeback_status_check
  check (writeback_status in ('not_requested', 'queued', 'writing', 'succeeded', 'failed', 'cancelled'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'feishu_action_confirmations_business_update_draft_id_fkey'
      and conrelid = 'public.feishu_action_confirmations'::regclass
  ) then
    alter table public.feishu_action_confirmations
      add constraint feishu_action_confirmations_business_update_draft_id_fkey
      foreign key (business_update_draft_id) references public.business_update_drafts(id) on delete restrict;
  end if;
end $$;

create unique index if not exists uq_business_update_drafts_feishu_confirmation
  on public.business_update_drafts(feishu_confirmation_id)
  where feishu_confirmation_id is not null;
create unique index if not exists uq_feishu_confirmation_business_update_draft
  on public.feishu_action_confirmations(business_update_draft_id)
  where business_update_draft_id is not null;
create index if not exists idx_feishu_confirmation_base_record
  on public.feishu_action_confirmations(org_id, data_class, table_key, record_id, created_at desc)
  where action_type = 'base_record_update';

create or replace function public.queue_business_update_draft_writeback_tx(
  p_draft_id uuid,
  p_actor_user_id uuid,
  p_expected_version bigint,
  p_payload jsonb,
  p_preview jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.business_update_drafts%rowtype;
  v_confirmation_id uuid;
  v_actor_role text;
  v_requester public.app_users%rowtype;
  v_field_name text;
  v_proposed_fields jsonb;
  v_expected_fields jsonb;
begin
  select * into v_draft from public.business_update_drafts where id = p_draft_id for update;
  if not found then raise exception 'P19_DRAFT_NOT_FOUND'; end if;

  select role into v_actor_role from public.app_users where id = p_actor_user_id and status = 'active';
  if not found then raise exception 'P19_ACTOR_INACTIVE'; end if;
  if p_actor_user_id <> v_draft.requested_by and coalesce(v_actor_role, '') <> 'admin' then
    raise exception 'P19_DRAFT_CONFIRM_FORBIDDEN';
  end if;

  if v_draft.status = 'confirmed' and v_draft.feishu_confirmation_id is not null then
    return jsonb_build_object(
      'draft_id', v_draft.id,
      'confirmation_id', v_draft.feishu_confirmation_id,
      'writeback_status', v_draft.writeback_status,
      'duplicate', true
    );
  end if;
  if v_draft.status <> 'pending_confirmation' or v_draft.version <> p_expected_version then
    raise exception 'P19_DRAFT_VERSION_CONFLICT';
  end if;
  if v_draft.source_type = 'action' then
    raise exception 'P19_ACTION_SOURCE_NOT_EXECUTABLE';
  end if;
  select
    coalesce(jsonb_object_agg(change->>'field', change->'proposedValue'), '{}'::jsonb),
    coalesce(jsonb_object_agg(change->>'field', change->'currentValue'), '{}'::jsonb)
  into v_proposed_fields, v_expected_fields
  from jsonb_array_elements(v_draft.changes) as change;
  if p_payload->>'type' <> 'base_record_update'
    or p_payload->>'business_update_draft_id' <> v_draft.id::text
    or p_payload->>'org_id' <> v_draft.org_id::text
    or p_payload->>'project_id' <> v_draft.project_id::text
    or p_payload->>'data_class' <> v_draft.data_class
    or p_payload->>'table_key' <> v_draft.source_type
    or p_payload->>'record_id' <> v_draft.source_record_id
    or p_payload->>'idempotency_key' <> ('business-update-draft:' || v_draft.id::text || ':v' || (v_draft.version + 1)::text)
    or jsonb_typeof(p_payload->'fields') <> 'object'
    or jsonb_typeof(p_payload->'expected_fields') <> 'object'
    or p_payload->'fields' is distinct from v_proposed_fields
    or p_payload->'expected_fields' is distinct from v_expected_fields
    or (select array_agg(field_name order by field_name) from jsonb_object_keys(p_payload->'fields') as f(field_name))
       is distinct from (select array_agg(field_name order by field_name) from jsonb_object_keys(p_payload->'expected_fields') as f(field_name))
  then
    raise exception 'P19_WRITEBACK_PAYLOAD_MISMATCH';
  end if;
  for v_field_name in select jsonb_object_keys(p_payload->'fields') loop
    if v_field_name !~ '[一-龥]' then raise exception 'P19_CHINESE_FIELD_REQUIRED'; end if;
  end loop;

  select * into v_requester from public.app_users where id = v_draft.requested_by and status = 'active';
  if not found then raise exception 'P19_REQUESTER_INACTIVE'; end if;
  insert into public.feishu_action_confirmations(
    requester_id, requester_name, requester_email, source, source_page,
    action_type, idempotency_key, target_summary, risk_level, status,
    payload, preview, request_id, business_update_draft_id,
    org_id, project_id, data_class, table_key, record_id
  ) values (
    v_draft.requested_by, coalesce(v_requester.name, v_requester.email, v_requester.phone), v_requester.email,
    'integration_center', '/business-assistant',
    'base_record_update', p_payload->>'idempotency_key', coalesce(p_preview->>'targetSummary', '更新飞书业务记录'),
    'high', 'pending_confirmation', p_payload, p_preview, p_request_id, v_draft.id,
    v_draft.org_id, v_draft.project_id, v_draft.data_class, v_draft.source_type, v_draft.source_record_id
  ) returning id into v_confirmation_id;

  update public.business_update_drafts set
    status = 'confirmed',
    writeback_status = 'queued',
    feishu_confirmation_id = v_confirmation_id,
    confirmed_by = p_actor_user_id,
    confirmed_at = now(),
    version = version + 1,
    updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'confirmation_id', v_confirmation_id,
    'writeback_status', 'queued',
    'duplicate', false
  );
end;
$$;

create or replace function public.claim_business_update_writeback_tx(
  p_confirmation_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmation public.feishu_action_confirmations%rowtype;
  v_draft public.business_update_drafts%rowtype;
  v_actor_role text;
  v_attempt integer;
  v_lease_expires_at timestamptz;
begin
  select * into v_confirmation from public.feishu_action_confirmations where id = p_confirmation_id for update;
  if not found or v_confirmation.action_type <> 'base_record_update' then raise exception 'P19_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_draft from public.business_update_drafts where feishu_confirmation_id = p_confirmation_id for update;
  if not found then raise exception 'P19_DRAFT_LINK_NOT_FOUND'; end if;
  select role into v_actor_role from public.app_users where id = p_actor_user_id and status = 'active';
  if not found then raise exception 'P19_ACTOR_INACTIVE'; end if;
  if p_actor_user_id <> v_confirmation.requester_id and coalesce(v_actor_role, '') <> 'admin' then
    raise exception 'P19_WRITEBACK_FORBIDDEN';
  end if;
  if v_draft.status <> 'confirmed' then raise exception 'P19_WRITEBACK_STATE_CONFLICT'; end if;
  if v_confirmation.status = 'writing' and v_draft.writeback_status = 'writing' then
    if v_confirmation.writeback_lease_expires_at is not null
      and v_confirmation.writeback_lease_expires_at > now()
    then raise exception 'P19_WRITEBACK_IN_PROGRESS'; end if;
  elsif v_confirmation.status not in ('pending_confirmation', 'confirmed', 'failed')
    or v_draft.status <> 'confirmed'
    or v_draft.writeback_status not in ('queued', 'failed')
  then raise exception 'P19_WRITEBACK_STATE_CONFLICT'; end if;
  if v_confirmation.business_update_draft_id <> v_draft.id
    or v_confirmation.org_id <> v_draft.org_id
    or v_confirmation.project_id <> v_draft.project_id
    or v_confirmation.data_class <> v_draft.data_class
    or v_confirmation.table_key <> v_draft.source_type
    or v_confirmation.record_id <> v_draft.source_record_id
  then raise exception 'P19_WRITEBACK_LINK_MISMATCH'; end if;

  v_attempt := v_confirmation.writeback_attempt_count + 1;
  v_lease_expires_at := now() + interval '5 minutes';
  update public.feishu_action_confirmations set
    status = 'writing', confirmed_at = coalesce(confirmed_at, now()), error_code = null,
    writeback_attempt_count = v_attempt,
    writeback_last_attempt_at = now(),
    writeback_lease_expires_at = v_lease_expires_at,
    writeback_last_error = null,
    updated_at = now()
  where id = p_confirmation_id;
  update public.business_update_drafts set writeback_status = 'writing', updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object(
    'draft_id', v_draft.id,
    'confirmation_id', p_confirmation_id,
    'payload', v_confirmation.payload,
    'attempt', v_attempt,
    'lease_expires_at', v_lease_expires_at
  );
end;
$$;

-- Remove the preliminary non-fenced signature if an earlier draft of this
-- migration was applied during development.
drop function if exists public.finalize_business_update_writeback_tx(uuid,text,jsonb,text);

create or replace function public.finalize_business_update_writeback_tx(
  p_confirmation_id uuid,
  p_expected_attempt integer,
  p_status text,
  p_resource jsonb default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmation public.feishu_action_confirmations%rowtype;
  v_draft public.business_update_drafts%rowtype;
begin
  if p_status not in ('succeeded', 'failed') then raise exception 'P19_FINAL_STATUS_INVALID'; end if;
  select * into v_confirmation from public.feishu_action_confirmations where id = p_confirmation_id for update;
  if not found or v_confirmation.action_type <> 'base_record_update' then raise exception 'P19_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_draft from public.business_update_drafts where feishu_confirmation_id = p_confirmation_id for update;
  if not found then raise exception 'P19_DRAFT_LINK_NOT_FOUND'; end if;
  if v_confirmation.writeback_attempt_count <> p_expected_attempt then
    raise exception 'P19_WRITEBACK_FENCING_TOKEN_MISMATCH';
  end if;
  if v_confirmation.status = p_status and v_draft.writeback_status = p_status then
    return jsonb_build_object('draft_id', v_draft.id, 'confirmation_id', p_confirmation_id, 'status', p_status, 'duplicate', true);
  end if;
  if v_confirmation.status <> 'writing' or v_draft.writeback_status <> 'writing' then
    raise exception 'P19_FINALIZE_STATE_CONFLICT';
  end if;

  update public.feishu_action_confirmations set
    status = p_status,
    resource = case when p_status = 'succeeded' then coalesce(p_resource, '{}'::jsonb) else resource end,
    error_code = case when p_status = 'failed' then coalesce(nullif(left(p_error_code, 160), ''), 'P19_WRITEBACK_FAILED') else null end,
    writeback_lease_expires_at = null,
    writeback_last_error = case when p_status = 'failed' then coalesce(nullif(left(p_error_code, 160), ''), 'P19_WRITEBACK_FAILED') else null end,
    executed_at = now(), updated_at = now()
  where id = p_confirmation_id;
  update public.business_update_drafts set writeback_status = p_status, updated_at = now()
  where id = v_draft.id;

  return jsonb_build_object('draft_id', v_draft.id, 'confirmation_id', p_confirmation_id, 'status', p_status, 'duplicate', false);
end;
$$;

create or replace function public.cancel_business_update_writeback_tx(
  p_confirmation_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_confirmation public.feishu_action_confirmations%rowtype;
  v_draft public.business_update_drafts%rowtype;
  v_actor_role text;
begin
  select * into v_confirmation from public.feishu_action_confirmations where id = p_confirmation_id for update;
  if not found or v_confirmation.action_type <> 'base_record_update' then raise exception 'P19_CONFIRMATION_NOT_FOUND'; end if;
  select * into v_draft from public.business_update_drafts where feishu_confirmation_id = p_confirmation_id for update;
  if not found then raise exception 'P19_DRAFT_LINK_NOT_FOUND'; end if;
  select role into v_actor_role from public.app_users where id = p_actor_user_id and status = 'active';
  if not found then raise exception 'P19_ACTOR_INACTIVE'; end if;
  if p_actor_user_id <> v_confirmation.requester_id and coalesce(v_actor_role, '') <> 'admin' then
    raise exception 'P19_WRITEBACK_FORBIDDEN';
  end if;
  if v_confirmation.status in ('writing', 'succeeded', 'cancelled') or v_draft.writeback_status in ('writing', 'succeeded', 'cancelled') then
    raise exception 'P19_CANCEL_STATE_CONFLICT';
  end if;

  update public.feishu_action_confirmations set
    status = 'cancelled', cancel_reason = coalesce(nullif(left(trim(p_reason), 500), ''), '用户取消飞书Base写回。'),
    writeback_lease_expires_at = null, cancelled_at = now(), updated_at = now()
  where id = p_confirmation_id;
  update public.business_update_drafts set writeback_status = 'cancelled', updated_at = now()
  where id = v_draft.id;
  return jsonb_build_object('draft_id', v_draft.id, 'confirmation_id', p_confirmation_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.queue_business_update_draft_writeback_tx(uuid,uuid,bigint,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.claim_business_update_writeback_tx(uuid,uuid) from public, anon, authenticated;
revoke all on function public.finalize_business_update_writeback_tx(uuid,integer,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.cancel_business_update_writeback_tx(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.queue_business_update_draft_writeback_tx(uuid,uuid,bigint,jsonb,jsonb,text) to service_role;
grant execute on function public.claim_business_update_writeback_tx(uuid,uuid) to service_role;
grant execute on function public.finalize_business_update_writeback_tx(uuid,integer,text,jsonb,text) to service_role;
grant execute on function public.cancel_business_update_writeback_tx(uuid,uuid,text) to service_role;
