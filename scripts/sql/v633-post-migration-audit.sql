select
  (select count(*) from information_schema.columns where table_schema='public' and table_name in ('project_issues','project_changes','unified_action_items') and column_name in ('version','last_idempotency_key')) as hardened_columns,
  (select relrowsecurity from pg_class where oid='public.project_control_operation_receipts'::regclass) as receipts_rls,
  (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('apply_project_issue_change_action_tx','begin_v633_project_control_operation','finish_v633_project_control_operation')) as project_control_functions,
  (select count(*) from pg_trigger where not tgisinternal and tgname='trg_v633_issue_change_events_append_only') as append_only_triggers,
  (select count(*) from supabase_migrations.schema_migrations where version='20260715181000') as migration_registered,
  (select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='project_control_operation_receipts' and grantee in ('anon','authenticated','PUBLIC')) as receipt_client_grants,
  (select count(*) from information_schema.routine_privileges where routine_schema='public' and routine_name in ('apply_project_issue_change_action_tx','begin_v633_project_control_operation','finish_v633_project_control_operation') and grantee in ('anon','authenticated','PUBLIC')) as function_client_grants;
