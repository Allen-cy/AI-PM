begin;
do $$
declare
  v_project public.projects%rowtype;
  v_submitter uuid;
  v_pmo uuid;
  v_flow jsonb;
  v_transition jsonb;
  v_event_count integer;
  v_mutation_blocked boolean := false;
begin
  select * into v_project from public.projects where data_class='test' order by created_at limit 1;
  if v_project.id is null then raise exception 'V650_SMOKE_TEST_PROJECT_REQUIRED'; end if;
  select user_id into v_submitter from public.user_business_roles where org_id=v_project.org_id and business_role in ('pm','operations') and status='active' limit 1;
  select user_id into v_pmo from public.user_business_roles where org_id=v_project.org_id and business_role='pmo' and status='active' limit 1;
  if v_submitter is null or v_pmo is null then raise exception 'V650_SMOKE_ROLE_USERS_REQUIRED'; end if;
  v_flow := public.create_v650_cross_role_flow_tx(v_project.org_id,'project',v_project.id::text,v_project.id,'test','exception_to_decision','V6.5事务烟测','验证跨角色业务事件与状态同事务写入','仅用于事务回滚烟测','acceptance_test','v650-smoke-source',v_pmo,now()+interval '2 days','["acceptance:v650"]'::jsonb,v_submitter,'pm','v650-smoke-create');
  v_transition := public.transition_v650_cross_role_flow_tx((v_flow->>'id')::uuid,v_project.org_id,'project',v_project.id::text,'test','pmo_review',1,v_pmo,'pmo','已核对事实、经营影响与责任边界','["acceptance:v650:pmo-review"]'::jsonb,null,null,null,null,null,null,null,'v650-smoke-review');
  if v_transition->'flow'->>'status'<>'pmo_reviewed' then raise exception 'V650_SMOKE_TRANSITION_FAILED'; end if;
  select count(*) into v_event_count from public.business_events where aggregate_id=(v_flow->>'id')::uuid;
  if v_event_count<>2 then raise exception 'V650_SMOKE_EVENT_COUNT_INVALID:%',v_event_count; end if;
  begin
    update public.business_events set payload=payload where aggregate_id=(v_flow->>'id')::uuid;
  exception when others then
    if sqlerrm like '%V650_BUSINESS_EVENTS_APPEND_ONLY%' then v_mutation_blocked:=true; else raise; end if;
  end;
  if not v_mutation_blocked then raise exception 'V650_SMOKE_APPEND_ONLY_GUARD_FAILED'; end if;
end;
$$;
rollback;
select 'passed' as status,'transaction rolled back; no test row retained' as persistence;
