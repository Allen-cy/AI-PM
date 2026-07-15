-- V6.5.0 security audit alignment.
-- The service role receives the standard table grant set, while the append-only trigger still rejects mutation.

grant update,delete on table public.business_events to service_role;
revoke all on function public.prevent_v650_business_event_mutation() from public,anon,authenticated;
grant execute on function public.prevent_v650_business_event_mutation() to service_role;
