begin;

create or replace function public.prevent_v632_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'APPEND_ONLY_EVENT';
end $$;

revoke all on function public.prevent_v632_event_mutation() from public, anon, authenticated;
grant execute on function public.prevent_v632_event_mutation() to service_role;

commit;
