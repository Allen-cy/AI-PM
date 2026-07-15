begin;

-- Re-assert the V6.1 server-only contract for objects introduced by later waves.
-- Append-only triggers continue to prevent event mutation even though the
-- service role owns the complete table privilege set required by the audit gate.
revoke all on table
  public.project_delivery_events,
  public.project_delivery_operation_receipts,
  public.project_evm_snapshots,
  public.project_governance_artifacts,
  public.project_governance_decisions,
  public.project_governance_events,
  public.project_governance_operation_receipts,
  public.project_initiation_records,
  public.project_plan_baselines,
  public.project_schedule_snapshots
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.project_delivery_events,
  public.project_delivery_operation_receipts,
  public.project_evm_snapshots,
  public.project_governance_artifacts,
  public.project_governance_decisions,
  public.project_governance_events,
  public.project_governance_operation_receipts,
  public.project_initiation_records,
  public.project_plan_baselines,
  public.project_schedule_snapshots
to service_role;

revoke all on sequence
  public.project_delivery_events_id_seq,
  public.project_governance_events_id_seq
from public, anon, authenticated;

grant usage, select, update on sequence
  public.project_delivery_events_id_seq,
  public.project_governance_events_id_seq
to service_role;

revoke all on function public.prevent_v633_issue_change_event_mutation()
from public, anon, authenticated;
grant execute on function public.prevent_v633_issue_change_event_mutation()
to service_role;

commit;
