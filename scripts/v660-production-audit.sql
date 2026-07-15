with gate as (select jsonb_build_object(
  'migration_applied', exists(select 1 from supabase_migrations.schema_migrations where version='20260716040000'),
  'tables', (
    select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity) order by c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'controlled_pilot_runs','controlled_pilot_projects','controlled_pilot_participants',
      'controlled_pilot_module_checks','controlled_pilot_golden_chains',
      'controlled_pilot_feishu_evidence','controlled_pilot_events','feishu_confirmation_attempt_events'
    )
  ),
  'client_table_grants', (
    select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name in (
      'controlled_pilot_runs','controlled_pilot_projects','controlled_pilot_participants',
      'controlled_pilot_module_checks','controlled_pilot_golden_chains',
      'controlled_pilot_feishu_evidence','controlled_pilot_events','feishu_confirmation_attempt_events'
    ) and grantee in ('PUBLIC','anon','authenticated')
  ),
  'functions', (
    select jsonb_agg(p.proname order by p.proname)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'prevent_v660_pilot_event_mutation','capture_v660_feishu_attempt_event',
      'evaluate_v660_controlled_pilot','create_v660_controlled_pilot_tx','mutate_v660_controlled_pilot_tx'
    )
  ),
  'triggers', (
    select jsonb_agg(t.tgname order by t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and t.tgname like 'trg_v660%'
  ),
  'function_client_execute_grants', (
    select count(*) from information_schema.role_routine_grants
    where specific_schema='public' and routine_name in (
      'prevent_v660_pilot_event_mutation','capture_v660_feishu_attempt_event',
      'evaluate_v660_controlled_pilot','create_v660_controlled_pilot_tx','mutate_v660_controlled_pilot_tx'
    ) and grantee in ('PUBLIC','anon','authenticated') and privilege_type='EXECUTE'
  ),
  'security_audit', coalesce((select jsonb_agg(finding) from public.audit_v61_database_security() finding),'[]'::jsonb)
) as value),

candidates as (select jsonb_build_object(
  'test_projects', (
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'oa_no',oa_no) order by name),'[]'::jsonb)
    from public.projects where org_id='64000000-0000-4000-8000-000000000001'::uuid and data_class='test'
  ),
  'test_role_assignments', (
    select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'user_id',r.user_id,'role',r.business_role,'name',u.name) order by r.business_role),'[]'::jsonb)
    from public.user_business_roles r join public.app_users u on u.id=r.user_id
    where r.org_id='64000000-0000-4000-8000-000000000001'::uuid and r.business_role in ('pm','operations','pmo','ceo') and r.status='active'
  ),
  'golden_candidates', (
    select count(*) from public.golden_chain_runs where org_id='64000000-0000-4000-8000-000000000001'::uuid and data_class='test' and chain_key in ('A','E') and status in ('verification','passed')
  ),
  'scoped_feishu_candidates', (
    select count(*) from public.feishu_action_confirmations where org_id='64000000-0000-4000-8000-000000000001'::uuid and data_class='test' and action_type in ('message','task','base_record_update') and status='succeeded'
  )
) as value)
select jsonb_build_object(
  'gate',(select value from gate),
  'technical_rehearsal_candidates',(select value from candidates)
) as v660_audit;
