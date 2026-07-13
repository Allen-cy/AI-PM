-- AI PMO V6.1.0 database security gate
--
-- Purpose:
--   1. Close the 13 legacy tables that were still exposed through the Data API.
--   2. Keep application access service-role-only.
--   3. Provide a service-only, repeatable database audit for the release gate.
--
-- This migration is additive and idempotent. It does not delete or rewrite data.

alter table public.cost_records enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.lessons_learned enable row level security;
alter table public.okr_key_results enable row level security;
alter table public.project_stages enable row level security;
alter table public.qa_sessions enable row level security;
alter table public.quality_checklists enable row level security;
alter table public.risk_retrospective_asset_governance_logs enable row level security;
alter table public.risk_retrospective_asset_sync_logs enable row level security;
alter table public.risk_retrospective_asset_usage_logs enable row level security;
alter table public.risk_retrospective_assets enable row level security;
alter table public.sign_offs enable row level security;
alter table public.wbs_items enable row level security;

revoke all on table
  public.cost_records,
  public.knowledge_documents,
  public.lessons_learned,
  public.okr_key_results,
  public.project_stages,
  public.qa_sessions,
  public.quality_checklists,
  public.risk_retrospective_asset_governance_logs,
  public.risk_retrospective_asset_sync_logs,
  public.risk_retrospective_asset_usage_logs,
  public.risk_retrospective_assets,
  public.sign_offs,
  public.wbs_items
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.cost_records,
  public.knowledge_documents,
  public.lessons_learned,
  public.okr_key_results,
  public.project_stages,
  public.qa_sessions,
  public.quality_checklists,
  public.risk_retrospective_asset_governance_logs,
  public.risk_retrospective_asset_sync_logs,
  public.risk_retrospective_asset_usage_logs,
  public.risk_retrospective_assets,
  public.sign_offs,
  public.wbs_items
to service_role;

-- Future objects are private until a migration explicitly grants the exact service access.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Existing application-owned functions and sequences are server-only. Extension-owned
-- objects are excluded so Supabase-managed capabilities are not modified.
do $$
declare
  table_schema text;
  table_name text;
  function_identity regprocedure;
  sequence_schema text;
  sequence_name text;
begin
  for table_schema, table_name in
    select pg_namespace.nspname, pg_class.relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_depend
        where pg_depend.classid = 'pg_class'::regclass
          and pg_depend.objid = pg_class.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )
  loop
    execute format('alter table %I.%I enable row level security', table_schema, table_name);
    execute format('revoke all on table %I.%I from public, anon, authenticated', table_schema, table_name);
    execute format('grant select, insert, update, delete on table %I.%I to service_role', table_schema, table_name);
  end loop;

  for function_identity in
    select pg_proc.oid::regprocedure
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and not exists (
        select 1 from pg_depend
        where pg_depend.classid = 'pg_proc'::regclass
          and pg_depend.objid = pg_proc.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', function_identity);
    execute format('grant execute on function %s to service_role', function_identity);
  end loop;

  for sequence_schema, sequence_name in
    select pg_namespace.nspname, pg_class.relname
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind = 'S'
      and not exists (
        select 1 from pg_depend
        where pg_depend.classid = 'pg_class'::regclass
          and pg_depend.objid = pg_class.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )
  loop
    execute format('revoke all on sequence %I.%I from public, anon, authenticated', sequence_schema, sequence_name);
    execute format('grant usage, select, update on sequence %I.%I to service_role', sequence_schema, sequence_name);
  end loop;
end
$$;

create or replace function public.audit_v61_database_security()
returns table (
  object_type text,
  object_name text,
  violation text,
  detail jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with required_tables(table_name) as (
    values
      ('cost_records'::text),
      ('knowledge_documents'::text),
      ('lessons_learned'::text),
      ('okr_key_results'::text),
      ('project_stages'::text),
      ('qa_sessions'::text),
      ('quality_checklists'::text),
      ('risk_retrospective_asset_governance_logs'::text),
      ('risk_retrospective_asset_sync_logs'::text),
      ('risk_retrospective_asset_usage_logs'::text),
      ('risk_retrospective_assets'::text),
      ('sign_offs'::text),
      ('wbs_items'::text)
  ),
  application_tables as (
    select
      pg_class.relname::text as table_name,
      pg_class.oid,
      pg_class.relrowsecurity,
      pg_class.relacl
    from pg_class
    join pg_namespace
      on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend
        where pg_depend.classid = 'pg_class'::regclass
          and pg_depend.objid = pg_class.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )

  ),
  application_functions as (
    select pg_proc.oid, pg_proc.oid::regprocedure::text as function_name
    from pg_proc
    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
    where pg_namespace.nspname = 'public'
      and not exists (
        select 1 from pg_depend
        where pg_depend.classid = 'pg_proc'::regclass
          and pg_depend.objid = pg_proc.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )
  ),
  application_sequences as (
    select pg_class.oid, pg_class.relname::text as sequence_name
    from pg_class
    join pg_namespace on pg_namespace.oid = pg_class.relnamespace
    where pg_namespace.nspname = 'public'
      and pg_class.relkind = 'S'
      and not exists (
        select 1 from pg_depend
        where pg_depend.classid = 'pg_class'::regclass
          and pg_depend.objid = pg_class.oid
          and pg_depend.refclassid = 'pg_extension'::regclass
          and pg_depend.deptype = 'e'
      )
  ),
  violations as (
    select
      'table'::text as object_type,
      required_tables.table_name as object_name,
      'TABLE_MISSING'::text as violation,
      '{}'::jsonb as detail
    from required_tables
    where not exists (select 1 from application_tables where application_tables.table_name = required_tables.table_name)

    union all
    select 'table', table_name, 'RLS_DISABLED', '{}'::jsonb
    from application_tables where not relrowsecurity

    union all
    select 'table', table_name, 'CLIENT_TABLE_PRIVILEGE',
      jsonb_build_object(
        'anon', has_table_privilege('anon', oid, 'SELECT') or has_table_privilege('anon', oid, 'INSERT') or has_table_privilege('anon', oid, 'UPDATE') or has_table_privilege('anon', oid, 'DELETE'),
        'authenticated', has_table_privilege('authenticated', oid, 'SELECT') or has_table_privilege('authenticated', oid, 'INSERT') or has_table_privilege('authenticated', oid, 'UPDATE') or has_table_privilege('authenticated', oid, 'DELETE')
      )
    from application_tables
    where has_table_privilege('anon', oid, 'SELECT')
       or has_table_privilege('anon', oid, 'INSERT')
       or has_table_privilege('anon', oid, 'UPDATE')
       or has_table_privilege('anon', oid, 'DELETE')
       or has_table_privilege('authenticated', oid, 'SELECT')
       or has_table_privilege('authenticated', oid, 'INSERT')
       or has_table_privilege('authenticated', oid, 'UPDATE')
       or has_table_privilege('authenticated', oid, 'DELETE')

    union all
    select 'table', table_name, 'SERVICE_ROLE_CRUD_MISSING', '{}'::jsonb
    from application_tables
    where not has_table_privilege('service_role', oid, 'SELECT')
       or not has_table_privilege('service_role', oid, 'INSERT')
       or not has_table_privilege('service_role', oid, 'UPDATE')
       or not has_table_privilege('service_role', oid, 'DELETE')

    union all
    select 'policy', pg_policies.tablename::text, 'CLIENT_POLICY_WITH_TABLE_PRIVILEGE',
      jsonb_build_object('policy', pg_policies.policyname, 'roles', pg_policies.roles)
    from pg_policies
    join application_tables on application_tables.table_name = pg_policies.tablename
    where pg_policies.schemaname = 'public'
      and pg_policies.roles && array['public','anon','authenticated']::name[]
      and (
        has_table_privilege('anon', application_tables.oid, 'SELECT')
        or has_table_privilege('authenticated', application_tables.oid, 'SELECT')
      )

    union all
    select 'function', function_name, 'CLIENT_FUNCTION_EXECUTE', '{}'::jsonb
    from application_functions
    where has_function_privilege('anon', oid, 'EXECUTE')
       or has_function_privilege('authenticated', oid, 'EXECUTE')

    union all
    select 'function', function_name, 'SERVICE_ROLE_EXECUTE_MISSING', '{}'::jsonb
    from application_functions
    where not has_function_privilege('service_role', oid, 'EXECUTE')

    union all
    select 'sequence', sequence_name, 'CLIENT_SEQUENCE_PRIVILEGE', '{}'::jsonb
    from application_sequences
    where has_sequence_privilege('anon', oid, 'USAGE')
       or has_sequence_privilege('anon', oid, 'SELECT')
       or has_sequence_privilege('anon', oid, 'UPDATE')
       or has_sequence_privilege('authenticated', oid, 'USAGE')
       or has_sequence_privilege('authenticated', oid, 'SELECT')
       or has_sequence_privilege('authenticated', oid, 'UPDATE')

    union all
    select 'sequence', sequence_name, 'SERVICE_ROLE_SEQUENCE_PRIVILEGE_MISSING', '{}'::jsonb
    from application_sequences
    where not has_sequence_privilege('service_role', oid, 'USAGE')
       or not has_sequence_privilege('service_role', oid, 'SELECT')
       or not has_sequence_privilege('service_role', oid, 'UPDATE')
  )
  select * from violations order by object_type, object_name, violation;
$$;

revoke all on function public.audit_v61_database_security() from public, anon, authenticated;
grant execute on function public.audit_v61_database_security() to service_role;

comment on function public.audit_v61_database_security() is
  'V6.1 release gate: audits application tables, RLS, client and service privileges, policies, functions and sequences.';

notify pgrst, 'reload schema';
