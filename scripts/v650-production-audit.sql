select version,name from supabase_migrations.schema_migrations where version='20260716010000';

select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('business_events','cross_role_flows','cross_role_flow_actions','role_ai_scan_schedules','organization_feishu_connections')
order by c.relname;

select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name in ('business_events','cross_role_flows','cross_role_flow_actions','role_ai_scan_schedules','organization_feishu_connections')
  and grantee in ('PUBLIC','anon','authenticated')
order by table_name,grantee,privilege_type;

select p.proname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('create_v650_cross_role_flow_tx','transition_v650_cross_role_flow_tx','prevent_v650_business_event_mutation')
order by p.proname;

select trigger_name,event_object_table,event_manipulation
from information_schema.triggers
where trigger_schema='public' and trigger_name='trg_v650_business_events_append_only'
order by event_manipulation;

select column_name from information_schema.columns
where table_schema='public' and table_name='ai_recommendations'
  and column_name in ('confidence','evidence_refs','effect_status','effect_summary','effect_evaluated_by','effect_evaluated_at')
order by column_name;

select public.audit_v61_database_security();
