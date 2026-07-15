select jsonb_build_object(
  'migrations_registered', (select count(*) from supabase_migrations.schema_migrations where version in ('20260715201000','20260715203000','20260715204000')),
  'tables', jsonb_build_object(
    'formal_business_outputs', to_regclass('public.formal_business_outputs') is not null,
    'formal_business_output_events', to_regclass('public.formal_business_output_events') is not null
  ),
  'rls', (select jsonb_object_agg(relname,relrowsecurity) from pg_class where oid in ('public.formal_business_outputs'::regclass,'public.formal_business_output_events'::regclass)),
  'anon_table_privileges', (select count(*) from information_schema.role_table_grants where grantee in ('PUBLIC','anon','authenticated') and table_schema='public' and table_name in ('formal_business_outputs','formal_business_output_events')),
  'service_table_privileges', (select count(*) from information_schema.role_table_grants where grantee='service_role' and table_schema='public' and table_name in ('formal_business_outputs','formal_business_output_events')),
  'functions', jsonb_build_object(
    'save_output', to_regprocedure('public.save_v634_formal_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamp with time zone,uuid,uuid,uuid,uuid,uuid,text,text,bigint)') is not null,
    'save_report', to_regprocedure('public.save_v634_report_output_tx(uuid,text,text,uuid,text,text,text,text,text,text,jsonb,jsonb,timestamp with time zone,uuid,uuid,uuid,uuid,uuid,text,text,bigint,text,date,date,jsonb,jsonb,text)') is not null,
    'transition_output', to_regprocedure('public.transition_v634_formal_output_tx(uuid,uuid,text,text,text,text,bigint,text,uuid,text,text)') is not null
  ),
  'triggers', (select jsonb_agg(tgname order by tgname) from pg_trigger where not tgisinternal and tgname in ('trg_v634_output_events_append_only','trg_v634_materialize_meeting_minutes','trg_v634_materialize_knowledge_output')),
  'row_counts', jsonb_build_object(
    'outputs', (select count(*) from public.formal_business_outputs),
    'events', (select count(*) from public.formal_business_output_events)
  ),
  'security_violations', coalesce((select jsonb_agg(item) from public.audit_v61_database_security() item),'[]'::jsonb)
) as v634_audit;
