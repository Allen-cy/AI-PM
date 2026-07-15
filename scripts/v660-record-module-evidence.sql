do $$
declare
  v_run_id uuid;
  v_version integer;
  v_actor uuid:='64000000-0000-4000-8000-000000000103'::uuid;
  v_item jsonb;
begin
  select id into v_run_id from public.controlled_pilot_runs
  where org_id='64000000-0000-4000-8000-000000000001'::uuid and idempotency_key='v660-technical-rehearsal-20260716';
  if v_run_id is null then raise exception 'V660_TECHNICAL_REHEARSAL_NOT_FOUND'; end if;

  for v_item in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('key','identity_access','evidence',jsonb_build_array('test:tests/v61-security-gate.test.ts','db:audit_v61_database_security=0')),
    jsonb_build_object('key','data_reconcile','evidence',jsonb_build_array('test:tests/v62-feishu-reconcile.test.ts','test:tests/v62-feishu-reconcile-service.test.ts')),
    jsonb_build_object('key','initiation_planning','evidence',jsonb_build_array('test:tests/v63-initiation-planning-realization.test.ts')),
    jsonb_build_object('key','wbs_cpm_evm_resources','evidence',jsonb_build_array('test:tests/v631-delivery-control-realization.test.ts','test:tests/cpm.test.ts')),
    jsonb_build_object('key','commercial_finance','evidence',jsonb_build_array('test:tests/v632-commercial-quality-realization.test.ts','test:tests/business-finance.test.ts')),
    jsonb_build_object('key','stakeholders','evidence',jsonb_build_array('test:tests/v632-commercial-quality-realization.test.ts')),
    jsonb_build_object('key','quality_acceptance','evidence',jsonb_build_array('test:tests/v632-commercial-quality-realization.test.ts')),
    jsonb_build_object('key','execution_monitoring','evidence',jsonb_build_array('test:tests/v633-project-control-unification.test.ts')),
    jsonb_build_object('key','risk_issue_change','evidence',jsonb_build_array('test:tests/risk-workflows.test.ts','test:tests/v61-issue-change-authorization.test.ts')),
    jsonb_build_object('key','closure','evidence',jsonb_build_array('test:tests/closure-knowledge.test.ts','test:tests/v633-project-control-unification.test.ts')),
    jsonb_build_object('key','formal_reporting_meetings','evidence',jsonb_build_array('test:tests/v634-formal-output-persistence.test.ts','test:tests/p21-decision-governance.test.ts')),
    jsonb_build_object('key','role_workbenches_inbox','evidence',jsonb_build_array('test:tests/v640-role-workbench.test.ts','test:tests/collaboration-inbox.test.ts')),
    jsonb_build_object('key','cross_role_flow','evidence',jsonb_build_array('test:tests/v650-cross-role-loop.test.ts')),
    jsonb_build_object('key','feishu_identity_boundary','evidence',jsonb_build_array('test:tests/v650-cross-role-loop.test.ts','test:tests/feishu-actions.test.ts')),
    jsonb_build_object('key','ai_rag','evidence',jsonb_build_array('test:tests/rag-service.test.ts','test:tests/role-assistant.test.ts')),
    jsonb_build_object('key','security_recovery_mobile','evidence',jsonb_build_array('test:tests/v61-ui-regressions.test.ts','build:6.6.0:189-static-pages','db:v660-client-grants=0'))
  )) loop
    select version into v_version from public.controlled_pilot_runs where id=v_run_id;
    perform public.mutate_v660_controlled_pilot_tx(
      v_run_id,'64000000-0000-4000-8000-000000000001'::uuid,'test','record_module_check',
      jsonb_build_object('module_key',v_item->>'key','result','passed','summary','V6.6.0自动化测试、类型检查、Lint、生产构建和数据库安全审计已通过；仅代表技术演练证据。','evidence_refs',v_item->'evidence'),
      v_actor,'pmo',v_version,'v660-module-'||(v_item->>'key'),'v660-module-'||(v_item->>'key')
    );
  end loop;
end $$;

select jsonb_build_object(
  'run_id',r.id,
  'version',r.version,
  'evaluation',public.evaluate_v660_controlled_pilot(r.id),
  'module_events',(select count(*) from public.controlled_pilot_events where run_id=r.id and event_type='record_module_check')
) as v660_module_evidence
from public.controlled_pilot_runs r
where r.org_id='64000000-0000-4000-8000-000000000001'::uuid and r.idempotency_key='v660-technical-rehearsal-20260716';
