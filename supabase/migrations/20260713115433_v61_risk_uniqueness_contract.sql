-- AI-PMO V6.1 rolling-release contract migration.
-- Apply only after the V6.1 application is live and all V6.0 instances have drained.
-- The expansion migration must already have installed every project-scoped replacement.

do $$
declare
  required_constraint text;
begin
  foreach required_constraint in array array[
    'risks_org_data_project_risk_code_key',
    'risk_retrospective_assets_org_data_asset_key',
    'risk_retro_followups_org_data_action_key',
    'risk_retro_snapshots_org_data_date_key',
    'risk_retro_reminders_org_data_key'
  ] loop
    if not exists (
      select 1
      from pg_constraint
      where conname = required_constraint
        and connamespace = 'public'::regnamespace
    ) then
      raise exception 'V61_EXPANSION_MIGRATION_REQUIRED: %', required_constraint;
    end if;
  end loop;
end
$$;

alter table public.risks
  drop constraint if exists risks_risk_code_key;
alter table public.risk_retrospective_assets
  drop constraint if exists risk_retrospective_assets_asset_key_key;
alter table public.risk_retrospective_governance_followups
  drop constraint if exists risk_retrospective_governance_followups_action_key_key;
alter table public.risk_retrospective_governance_operation_snapshots
  drop constraint if exists risk_retrospective_governance_operation_snaps_snapshot_date_key;
alter table public.risk_retrospective_governance_reminder_logs
  drop constraint if exists risk_retrospective_governance_reminder_logs_reminder_key_key;

notify pgrst, 'reload schema';
