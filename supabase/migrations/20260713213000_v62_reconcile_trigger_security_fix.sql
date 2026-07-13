-- AI PM System V6.2.0: close the database audit gap for the scoped mirror trigger.
-- The trigger function remains unavailable to browser-facing roles and executable
-- only by the service role used by the server-side reconciliation transaction.

revoke all on function public.enforce_v62_project_scope() from public, anon, authenticated;
grant execute on function public.enforce_v62_project_scope() to service_role;

select pg_notify('pgrst', 'reload schema');
