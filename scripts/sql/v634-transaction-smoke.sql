do $$
declare
  v_role public.user_business_roles%rowtype;
  v_saved jsonb;
  v_output_id uuid;
  v_snapshot_id uuid;
  v_transitioned jsonb;
  v_guarded boolean := false;
begin
  select * into v_role from public.user_business_roles
  where status='active' and business_role='pmo' and subject_scope='organization'
  order by created_at limit 1;
  if not found then raise exception 'V634_SMOKE_PMO_CONTEXT_MISSING'; end if;

  v_saved := public.save_v634_report_output_tx(
    p_org_id=>v_role.org_id,p_subject_scope=>v_role.subject_scope,p_subject_id=>v_role.subject_id,p_project_id=>null,
    p_data_class=>'production',p_output_type=>'generated_report',p_output_key=>'v634:transaction-smoke',p_title=>'V6.3.4事务验证报告',
    p_content_type=>'text/markdown',p_content=>'# V6.3.4 transaction smoke',p_structured_payload=>jsonb_build_object('smoke',true),
    p_source_definition=>jsonb_build_object('type','transaction_smoke'),p_source_snapshot_at=>now(),p_reporting_snapshot_id=>null,p_meeting_id=>null,
    p_migration_batch_id=>null,p_knowledge_item_id=>null,p_actor_user_id=>v_role.user_id,p_actor_business_role=>v_role.business_role,
    p_idempotency_key=>'v634:transaction-smoke',p_expected_version=>0,p_snapshot_type=>'ad_hoc',p_period_start=>current_date,
    p_period_end=>current_date,p_metrics=>jsonb_build_object('smoke',1),p_exceptions=>'[]'::jsonb,p_narrative=>'V6.3.4原子留档验证'
  );
  v_output_id := (v_saved->'output'->>'id')::uuid;
  v_snapshot_id := (v_saved->'snapshot'->>'id')::uuid;
  if v_output_id is null or v_snapshot_id is null then raise exception 'V634_SMOKE_ATOMIC_OUTPUT_MISSING'; end if;
  if not exists(select 1 from public.formal_business_outputs where id=v_output_id and reporting_snapshot_id=v_snapshot_id) then raise exception 'V634_SMOKE_LINK_MISSING'; end if;
  if not exists(select 1 from public.formal_business_output_events where output_id=v_output_id and event_type='create') then raise exception 'V634_SMOKE_EVENT_MISSING'; end if;

  v_transitioned := public.transition_v634_formal_output_tx(v_output_id,v_role.org_id,v_role.subject_scope,v_role.subject_id,'production','submit',1,'提交验证',v_role.user_id,v_role.business_role,'v634:transaction-smoke:submit');
  if v_transitioned->>'status'<>'submitted' or (v_transitioned->>'state_version')::bigint<>2 then raise exception 'V634_SMOKE_TRANSITION_FAILED'; end if;

  begin
    update public.formal_business_output_events set reason='forbidden' where output_id=v_output_id;
  exception when others then
    if sqlerrm like '%V634_OUTPUT_EVENTS_APPEND_ONLY%' then v_guarded := true; else raise; end if;
  end;
  if not v_guarded then raise exception 'V634_SMOKE_APPEND_ONLY_GUARD_FAILED'; end if;
end;
$$;
