select jsonb_build_object(
  'migration_applied', exists(select 1 from supabase_migrations.schema_migrations where version='20260715220000'),
  'tables', (
    select jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('role_workbench_preferences','collaboration_inbox_receipts','role_acceptance_runs','role_acceptance_participants')
  ),
  'client_table_grants', (
    select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name in ('role_workbench_preferences','collaboration_inbox_receipts','role_acceptance_runs','role_acceptance_participants')
      and grantee in ('PUBLIC','anon','authenticated')
  ),
  'functions', (
    select jsonb_agg(p.proname order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('set_v640_updated_at','prevent_v640_inbox_receipt_scope_change','validate_v640_role_acceptance_run')
  ),
  'triggers', (
    select jsonb_agg(t.tgname order by t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and t.tgname like 'trg_v640%'
  ),
  'security_audit', coalesce((select jsonb_agg(finding) from public.audit_v61_database_security() finding), '[]'::jsonb)
) as v640_audit;
