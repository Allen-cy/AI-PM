select jsonb_build_object(
  'organizations', (select count(*) from public.organizations),
  'projects', (select count(*) from public.projects),
  'active_roles', (select count(*) from public.user_business_roles where status='active'),
  'eligible_report_roles', coalesce((select jsonb_agg(jsonb_build_object('org_id',org_id,'subject_scope',subject_scope,'subject_id',subject_id,'business_role',business_role,'user_id',user_id)) from public.user_business_roles where status='active' and business_role in ('pm','operations','pmo') limit 10),'[]'::jsonb)
) as context_probe;
