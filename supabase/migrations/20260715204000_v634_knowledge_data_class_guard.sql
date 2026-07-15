-- AI-PMO V6.3.4 knowledge output data-class guard.
-- Older retrospective candidates did not always copy data_class into metadata.
-- Derive it from the canonical project and reject explicit conflicts; never
-- default missing knowledge metadata to production.

create or replace function public.materialize_v634_knowledge_output()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_org_id uuid;
  v_project_id uuid;
  v_actor uuid;
  v_data_class text;
  v_project_data_class text;
  v_version bigint;
  v_result jsonb;
  v_content text;
begin
  if new.status<>'published' or old.status='published' then return new; end if;
  if coalesce(new.metadata->>'org_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return new; end if;
  v_org_id := (new.metadata->>'org_id')::uuid;
  v_actor := coalesce(new.updated_by,new.created_by);
  if v_actor is null then return new; end if;
  if coalesce(new.metadata->>'source_project_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_project_id := (new.metadata->>'source_project_id')::uuid;
    select p.data_class into v_project_data_class from public.projects p where p.id=v_project_id and p.org_id=v_org_id;
    if v_project_data_class is null then return new; end if;
  end if;
  v_data_class := nullif(new.metadata->>'data_class','');
  if v_data_class is not null and v_project_data_class is not null and v_data_class<>v_project_data_class then raise exception 'V634_KNOWLEDGE_DATA_CLASS_MISMATCH'; end if;
  if v_data_class is null then v_data_class := v_project_data_class; end if;
  if v_data_class not in ('production','sample','test','diagnostic','unclassified') then return new; end if;
  v_content := coalesce(nullif(new.metadata->>'summary',''),'# '||new.title||E'\n\n'||array_to_string(new.source_refs,E'\n'));
  select coalesce(max(version),0) into v_version from public.formal_business_outputs where org_id=v_org_id and output_key='knowledge:'||new.id::text and data_class=v_data_class;
  v_result := public.save_v634_formal_output_tx(
    v_org_id,case when v_project_id is null then 'organization' else 'project' end,coalesce(v_project_id::text,v_org_id::text),v_project_id,v_data_class,
    'knowledge_asset','knowledge:'||new.id::text,new.title,'text/markdown',v_content,
    jsonb_build_object('page_id',new.page_id,'knowledge_type',new.knowledge_type,'domains',new.domains,'tags',new.tags,'applicable_scenarios',new.applicable_scenarios),
    jsonb_build_object('type','knowledge_item','knowledge_item_id',new.id,'source_refs',new.source_refs),new.updated_at,null,null,null,new.id,
    v_actor,'quality','knowledge:'||new.id::text||':published:'||public.p21_sha256_hex(v_content),v_version
  );
  return new;
end;
$$;

revoke all on function public.materialize_v634_knowledge_output() from public,anon,authenticated;
grant execute on function public.materialize_v634_knowledge_output() to service_role;
