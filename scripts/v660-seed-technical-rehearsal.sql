do $$
declare
  v_org uuid:='64000000-0000-4000-8000-000000000001'::uuid;
  v_actor uuid:='64000000-0000-4000-8000-000000000103'::uuid;
  v_run_id uuid;
  v_version integer;
  v_project uuid;
  v_assignment uuid;
begin
  perform public.create_v660_controlled_pilot_tx(
    v_org,'technical_rehearsal','test','V6.6全模块技术演练候选',
    '验证五项目、四角色职责分离、16模块、黄金链A/E、飞书三类写入和故障恢复契约；不得替代正式试点。',
    v_actor,'pmo','v660-technical-rehearsal-20260716','v660-seed-create'
  );
  select id into v_run_id from public.controlled_pilot_runs where org_id=v_org and idempotency_key='v660-technical-rehearsal-20260716';

  foreach v_project in array array[
    '64000000-0000-4000-8000-000000000201'::uuid,'64000000-0000-4000-8000-000000000202'::uuid,
    '64000000-0000-4000-8000-000000000203'::uuid,'64000000-0000-4000-8000-000000000204'::uuid,
    '64000000-0000-4000-8000-000000000205'::uuid
  ] loop
    select version into v_version from public.controlled_pilot_runs where id=v_run_id;
    perform public.mutate_v660_controlled_pilot_tx(v_run_id,v_org,'test','add_project',jsonb_build_object('project_id',v_project,'coverage_note','V6.6五项目技术演练'),v_actor,'pmo',v_version,'v660-project-'||v_project::text,'v660-seed-project-'||v_project::text);
  end loop;

  foreach v_assignment in array array[
    '64000000-0000-4000-8000-000000000301'::uuid,'64000000-0000-4000-8000-000000000302'::uuid,
    '64000000-0000-4000-8000-000000000303'::uuid,'64000000-0000-4000-8000-000000000304'::uuid
  ] loop
    select version into v_version from public.controlled_pilot_runs where id=v_run_id;
    perform public.mutate_v660_controlled_pilot_tx(v_run_id,v_org,'test','bind_participant',jsonb_build_object('assignment_id',v_assignment,'participant_kind','test_account'),v_actor,'pmo',v_version,'v660-participant-'||v_assignment::text,'v660-seed-participant-'||v_assignment::text);
  end loop;

  select version into v_version from public.controlled_pilot_runs where id=v_run_id;
  perform public.mutate_v660_controlled_pilot_tx(v_run_id,v_org,'test','transition',jsonb_build_object('action','start_collection'),v_actor,'pmo',v_version,'v660-start-collection','v660-seed-start');
end $$;

select jsonb_build_object(
  'run',to_jsonb(r),
  'evaluation',public.evaluate_v660_controlled_pilot(r.id),
  'event_count',(select count(*) from public.controlled_pilot_events where run_id=r.id)
) as v660_technical_rehearsal
from public.controlled_pilot_runs r
where r.org_id='64000000-0000-4000-8000-000000000001'::uuid and r.idempotency_key='v660-technical-rehearsal-20260716';
