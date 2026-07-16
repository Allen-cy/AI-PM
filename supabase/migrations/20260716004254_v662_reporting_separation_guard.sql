begin;

-- Keep the legacy evidence, but remove the three active same-person loops that
-- pre-date the four-account acceptance model. A suspended row remains available
-- to security exports and audit history.
update public.business_reporting_relationships
set status = 'suspended',
    valid_until = coalesce(valid_until, now()),
    revoked_reason = coalesce(nullif(revoked_reason, ''), 'V6.6.2：同一用户不得同时作为上报人和接收人，历史关系保留为暂停状态')
where status = 'active'
  and from_user_id = to_user_id;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_reporting_relationships'::regclass
      and conname = 'business_reporting_relationships_no_active_self_loop'
  ) then
    alter table public.business_reporting_relationships
      add constraint business_reporting_relationships_no_active_self_loop
      check (from_user_id <> to_user_id or status <> 'active') not valid;
  end if;
end $$;

alter table public.business_reporting_relationships
  validate constraint business_reporting_relationships_no_active_self_loop;

-- The migration changes neither exposure nor client grants. Fail closed if a
-- pre-existing security regression is present instead of publishing a false pass.
do $$
begin
  if exists (select 1 from public.audit_v61_database_security()) then
    raise exception 'V6.6.2 security audit reported one or more findings';
  end if;
end $$;

commit;
