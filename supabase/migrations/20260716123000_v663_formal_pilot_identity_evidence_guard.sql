begin;

-- This migration must sort after the V6.6.0 controlled-pilot foundation.

-- Account classification is authoritative server-side data. Existing users
-- remain real users unless they already participated in a governed technical
-- rehearsal as a test account.
alter table public.app_users
  add column if not exists account_kind text not null default 'real_user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_account_kind_check'
  ) then
    alter table public.app_users
      add constraint app_users_account_kind_check
      check (account_kind in ('real_user','test_account','service_account')) not valid;
  end if;
end $$;

alter table public.app_users validate constraint app_users_account_kind_check;

do $$
begin
  if exists (
    select 1
    from public.controlled_pilot_participants
    group by user_id
    having count(distinct participant_kind) > 1
  ) then
    raise exception 'V663_PARTICIPANT_IDENTITY_HISTORY_CONFLICT';
  end if;
end $$;

update public.app_users u
set account_kind = 'test_account', updated_at = now()
where exists (
  select 1 from public.controlled_pilot_participants p
  where p.user_id = u.id and p.participant_kind = 'test_account'
);

create index if not exists idx_app_users_account_kind
  on public.app_users(account_kind,status);

create unique index if not exists uq_controlled_pilot_participants_run_user
  on public.controlled_pilot_participants(run_id,user_id);

create or replace function public.enforce_v663_pilot_participant_identity()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_mode text;
  v_account_kind text;
begin
  select mode into v_mode from public.controlled_pilot_runs where id=new.run_id;
  if v_mode is null then raise exception 'V663_PILOT_RUN_REQUIRED'; end if;
  select account_kind into v_account_kind from public.app_users where id=new.user_id and status='active';
  if v_account_kind is null then raise exception 'V663_ACTIVE_USER_REQUIRED'; end if;
  if v_mode='formal_pilot' and (new.participant_kind<>'real_user' or v_account_kind<>'real_user') then
    raise exception 'V663_FORMAL_REAL_USER_REQUIRED';
  end if;
  if v_mode='technical_rehearsal' and (new.participant_kind<>'test_account' or v_account_kind<>'test_account') then
    raise exception 'V663_TECHNICAL_TEST_ACCOUNT_REQUIRED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v663_pilot_participant_identity on public.controlled_pilot_participants;
create trigger trg_v663_pilot_participant_identity
before insert or update of run_id,user_id,participant_kind
on public.controlled_pilot_participants
for each row execute function public.enforce_v663_pilot_participant_identity();

-- A successful Feishu action without a stable project scope is useful history,
-- but it is not admissible evidence for a controlled pilot.
create or replace function public.enforce_v663_pilot_feishu_project_scope()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_project_id uuid;
begin
  select project_id into v_project_id
  from public.feishu_action_confirmations
  where id=new.confirmation_id and status='succeeded';
  if v_project_id is null then raise exception 'V663_FEISHU_PROJECT_SCOPE_REQUIRED'; end if;
  if not exists (
    select 1 from public.controlled_pilot_projects
    where run_id=new.run_id and project_id=v_project_id
  ) then
    raise exception 'V663_FEISHU_PROJECT_NOT_BOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_v663_pilot_feishu_project_scope on public.controlled_pilot_feishu_evidence;
create trigger trg_v663_pilot_feishu_project_scope
before insert or update of run_id,confirmation_id
on public.controlled_pilot_feishu_evidence
for each row execute function public.enforce_v663_pilot_feishu_project_scope();

revoke all on function public.enforce_v663_pilot_participant_identity(),public.enforce_v663_pilot_feishu_project_scope()
from public,anon,authenticated;
grant execute on function public.enforce_v663_pilot_participant_identity(),public.enforce_v663_pilot_feishu_project_scope()
to service_role;

do $$
begin
  if exists (select 1 from public.audit_v61_database_security()) then
    raise exception 'V6.6.3 security audit reported one or more findings';
  end if;
end $$;

commit;
