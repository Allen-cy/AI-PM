begin;

create or replace function public.enforce_v663_app_user_account_kind_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if old.account_kind is not distinct from new.account_kind then return new; end if;

  if exists (
    select 1
    from public.controlled_pilot_participants participant
    join public.controlled_pilot_runs run on run.id=participant.run_id
    where participant.user_id=new.id
      and (
        (run.mode='formal_pilot' and new.account_kind<>'real_user')
        or (run.mode='technical_rehearsal' and new.account_kind<>'test_account')
      )
  ) then
    raise exception 'V663_ACCOUNT_KIND_CONFLICTS_WITH_PILOT_HISTORY';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_v663_app_user_account_kind_change on public.app_users;
create trigger trg_v663_app_user_account_kind_change
before update of account_kind on public.app_users
for each row execute function public.enforce_v663_app_user_account_kind_change();

revoke all on function public.enforce_v663_app_user_account_kind_change()
from public,anon,authenticated;
grant execute on function public.enforce_v663_app_user_account_kind_change()
to service_role;

do $$
begin
  if exists (select 1 from public.audit_v61_database_security()) then
    raise exception 'V6.6.3 account kind guard security audit reported findings';
  end if;
end $$;

commit;
