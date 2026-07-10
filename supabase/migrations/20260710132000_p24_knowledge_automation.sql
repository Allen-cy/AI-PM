-- AI PM System V6.0 P24 retrospective automation, contextual recommendation and subscription review.

create table if not exists public.project_retrospectives (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null default 'submitted' check (status in ('draft','submitted','reviewed','published','rejected')),
  objectives text not null,outcomes text not null,deviations text not null,root_causes text not null,
  key_decisions text not null,action_effects text not null,lessons text not null,applicability_conditions text not null,
  evidence_ids jsonb not null check (jsonb_typeof(evidence_ids)='array' and jsonb_array_length(evidence_ids)>0),
  submitted_by uuid not null references public.app_users(id) on delete restrict,
  reviewed_by uuid references public.app_users(id) on delete set null,review_note text,reviewed_at timestamptz,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  request_id text not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

create table if not exists public.retrospective_knowledge_candidates (
  id uuid primary key default uuid_generate_v4(),
  retrospective_id uuid not null references public.project_retrospectives(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  candidate_type text not null check (candidate_type in ('lesson_learned','improvement_action','template_revision','governance_rule')),
  title text not null,summary text not null,applicability_conditions text not null,
  evidence_ids jsonb not null check (jsonb_typeof(evidence_ids)='array' and jsonb_array_length(evidence_ids)>0),
  suggested_action text,owner_user_id uuid references public.app_users(id) on delete set null,due_at timestamptz,
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','materialized')),
  review_note text,reviewed_by uuid references public.app_users(id) on delete set null,reviewed_at timestamptz,
  knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  knowledge_version_id uuid references public.knowledge_item_versions(id) on delete set null,
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique (retrospective_id,candidate_type,title)
);

create table if not exists public.knowledge_recommendation_requests (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('new_project','management_signal','manual')),
  trigger_source_id text not null default '',scenario text not null,criteria jsonb not null,
  recommendations jsonb not null check (jsonb_typeof(recommendations)='object'),
  status text not null default 'generated' check (status in ('generated','reviewed','closed')),
  requested_by uuid not null references public.app_users(id) on delete restrict,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  request_id text not null unique,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);

alter table public.knowledge_reuse_events add column if not exists recommendation_request_id uuid references public.knowledge_recommendation_requests(id) on delete set null;
create index if not exists idx_p24_retrospective_project on public.project_retrospectives(project_id,status,created_at desc);
create index if not exists idx_p24_candidate_review on public.retrospective_knowledge_candidates(org_id,status,candidate_type,created_at);
create index if not exists idx_p24_recommendation_project on public.knowledge_recommendation_requests(project_id,created_at desc);
create unique index if not exists idx_p24_reuse_recommendation_item on public.knowledge_reuse_events(recommendation_request_id,knowledge_item_id,target_project_id) where recommendation_request_id is not null;

create or replace function public.submit_project_retrospective_tx(
  p_org_id uuid,p_project_id uuid,p_data_class text,p_input jsonb,p_candidates jsonb,p_actor_user_id uuid,p_request_id text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_retrospective public.project_retrospectives;v_candidate jsonb;v_evidence_id text;v_count integer;
begin
  select * into v_retrospective from public.project_retrospectives where request_id=p_request_id;
  if found then return jsonb_build_object('retrospective',to_jsonb(v_retrospective),'candidates',(select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from public.retrospective_knowledge_candidates c where c.retrospective_id=v_retrospective.id));end if;
  if coalesce(jsonb_typeof(p_input->'evidence_ids'),'null')<>'array' or jsonb_array_length(p_input->'evidence_ids')=0 then raise exception 'P24_RETROSPECTIVE_EVIDENCE_REQUIRED';end if;
  for v_evidence_id in select value from jsonb_array_elements_text(p_input->'evidence_ids') loop
    select count(*) into v_count from public.evidence_links where id::text=v_evidence_id and org_id=p_org_id and subject_type='project' and subject_id=p_project_id::text and verified_at is not null and (valid_until is null or valid_until>=now());
    if v_count=0 then raise exception 'P24_RETROSPECTIVE_EVIDENCE_NOT_VERIFIED:%',v_evidence_id;end if;
  end loop;
  insert into public.project_retrospectives(org_id,project_id,status,objectives,outcomes,deviations,root_causes,key_decisions,action_effects,lessons,applicability_conditions,evidence_ids,submitted_by,data_class,request_id)
  values(p_org_id,p_project_id,'submitted',p_input->>'objectives',p_input->>'outcomes',p_input->>'deviations',p_input->>'root_causes',p_input->>'key_decisions',p_input->>'action_effects',p_input->>'lessons',p_input->>'applicability_conditions',p_input->'evidence_ids',p_actor_user_id,p_data_class,p_request_id)
  returning * into v_retrospective;
  for v_candidate in select value from jsonb_array_elements(p_candidates) loop
    insert into public.retrospective_knowledge_candidates(retrospective_id,org_id,project_id,candidate_type,title,summary,applicability_conditions,evidence_ids,suggested_action,owner_user_id,due_at,status,data_class)
    values(v_retrospective.id,p_org_id,p_project_id,v_candidate->>'candidate_type',v_candidate->>'title',v_candidate->>'summary',v_candidate->>'applicability_conditions',v_candidate->'evidence_ids',nullif(v_candidate->>'suggested_action',''),nullif(v_candidate->>'owner_user_id','')::uuid,nullif(v_candidate->>'due_at','')::timestamptz,'pending_review',p_data_class);
  end loop;
  return jsonb_build_object('retrospective',to_jsonb(v_retrospective),'candidates',(select jsonb_agg(to_jsonb(c)) from public.retrospective_knowledge_candidates c where c.retrospective_id=v_retrospective.id));
end;$$;

create or replace function public.materialize_retrospective_candidate_tx(
  p_candidate_id uuid,p_actor_user_id uuid,p_actor_name text,p_actor_business_role text,p_content_hash text,p_request_id text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_candidate public.retrospective_knowledge_candidates;v_item public.knowledge_items;v_version public.knowledge_item_versions;v_page_id text;v_action_id uuid;
begin
  if p_actor_business_role not in ('pmo','quality') then raise exception 'P24_KNOWLEDGE_REVIEW_ROLE_REQUIRED';end if;
  select * into v_candidate from public.retrospective_knowledge_candidates where id=p_candidate_id for update;
  if not found then raise exception 'P24_RETROSPECTIVE_CANDIDATE_NOT_FOUND';end if;
  if v_candidate.status='materialized' then return jsonb_build_object('candidate',to_jsonb(v_candidate));end if;
  if v_candidate.status<>'approved' then raise exception 'P24_RETROSPECTIVE_CANDIDATE_NOT_APPROVED';end if;
  v_page_id:='project-'||v_candidate.project_id||'-retrospective-'||v_candidate.id;
  insert into public.knowledge_items(page_id,title,knowledge_type,status,owner_name,domains,tags,source_refs,confidentiality,applicable_scenarios,metadata,created_by,created_by_name,updated_by,updated_by_name)
  values(v_page_id,v_candidate.title,v_candidate.candidate_type,'draft',p_actor_name,array['project-management'],array[v_candidate.candidate_type],array['project:'||v_candidate.project_id,'retrospective:'||v_candidate.retrospective_id],'internal',array[v_candidate.applicability_conditions],jsonb_build_object('org_id',v_candidate.org_id,'source_project_id',v_candidate.project_id,'source_retrospective_id',v_candidate.retrospective_id,'candidate_type',v_candidate.candidate_type,'summary',v_candidate.summary,'evidence_ids',v_candidate.evidence_ids,'applicability_conditions',v_candidate.applicability_conditions),p_actor_user_id,p_actor_name,p_actor_user_id,p_actor_name)
  on conflict (page_id) do update set updated_at=now() returning * into v_item;
  insert into public.knowledge_item_versions(knowledge_item_id,page_id,version_label,snapshot_index_version,content_sha256,change_summary,source_refs,metadata,created_by,created_by_name)
  values(v_item.id,v_page_id,'v1','retrospective-candidate-v1',p_content_hash,v_candidate.summary,array['project:'||v_candidate.project_id],jsonb_build_object('candidate_id',v_candidate.id,'evidence_ids',v_candidate.evidence_ids),p_actor_user_id,p_actor_name)
  on conflict (page_id,version_label) do update set change_summary=excluded.change_summary,content_sha256=excluded.content_sha256 returning * into v_version;
  if v_candidate.candidate_type='improvement_action' then
    if v_candidate.owner_user_id is null or v_candidate.due_at is null then raise exception 'P24_IMPROVEMENT_OWNER_AND_DUE_REQUIRED';end if;
    insert into public.unified_action_items(source_type,source_id,title,due_date,status,priority,metadata,org_id,subject_scope,subject_id,project_id,owner_user_id,reviewer_user_id,acceptance_criteria,idempotency_key,created_by,created_by_name)
    values('manual',v_candidate.id::text,v_candidate.title,v_candidate.due_at::date,'assigned','P1',jsonb_build_object('retrospective_candidate_id',v_candidate.id,'summary',v_candidate.summary),v_candidate.org_id,'project',v_candidate.project_id::text,v_candidate.project_id,v_candidate.owner_user_id,p_actor_user_id,coalesce(v_candidate.suggested_action,'完成改进并提交效果证据'),'retrospective-improvement:'||v_candidate.id,p_actor_user_id,p_actor_name)
    on conflict (idempotency_key) where idempotency_key is not null do update set updated_at=now() returning id into v_action_id;
  elsif v_candidate.candidate_type in ('template_revision','governance_rule') then
    insert into public.knowledge_change_impact_links(knowledge_item_id,knowledge_version_id,target_type,target_key,impact_description,owner_user_id,priority,due_at,status)
    values(v_item.id,v_version.id,case when v_candidate.candidate_type='template_revision' then 'template' else 'rule' end,v_candidate.title,coalesce(v_candidate.suggested_action,v_candidate.summary),coalesce(v_candidate.owner_user_id,p_actor_user_id),'P1',coalesce(v_candidate.due_at,now()+interval '14 days'),'pending_review')
    on conflict (knowledge_item_id,knowledge_version_id,target_type,target_key) do update set impact_description=excluded.impact_description,updated_at=now();
  end if;
  update public.retrospective_knowledge_candidates set status='materialized',knowledge_item_id=v_item.id,knowledge_version_id=v_version.id,action_item_id=v_action_id,updated_at=now() where id=v_candidate.id returning * into v_candidate;
  return jsonb_build_object('candidate',to_jsonb(v_candidate),'knowledge_item',to_jsonb(v_item),'knowledge_version',to_jsonb(v_version),'action_item_id',v_action_id);
end;$$;

create or replace function public.create_closure_knowledge_candidate_tx(
  p_page_id text,p_title text,p_knowledge_type text,p_owner_name text,p_domains jsonb,p_tags jsonb,
  p_source_refs jsonb,p_confidentiality text,p_applicable_scenarios jsonb,p_metadata jsonb,
  p_content_hash text,p_actor_user_id uuid,p_actor_name text
)
returns jsonb
language plpgsql security definer set search_path=public
as $$
declare v_item public.knowledge_items;v_version public.knowledge_item_versions;
begin
  insert into public.knowledge_items(page_id,title,knowledge_type,status,owner_name,domains,tags,source_refs,confidentiality,applicable_scenarios,metadata,created_by,created_by_name,updated_by,updated_by_name)
  values(p_page_id,p_title,p_knowledge_type,'draft',p_owner_name,array(select jsonb_array_elements_text(p_domains)),array(select jsonb_array_elements_text(p_tags)),array(select jsonb_array_elements_text(p_source_refs)),p_confidentiality,array(select jsonb_array_elements_text(p_applicable_scenarios)),p_metadata,p_actor_user_id,p_actor_name,p_actor_user_id,p_actor_name)
  on conflict(page_id) do update set title=excluded.title,metadata=excluded.metadata,updated_by=p_actor_user_id,updated_by_name=p_actor_name,updated_at=now()
  returning * into v_item;
  insert into public.knowledge_item_versions(knowledge_item_id,page_id,version_label,snapshot_index_version,content_sha256,change_summary,source_refs,metadata,created_by,created_by_name)
  values(v_item.id,p_page_id,'v1','closure-candidate-v1',p_content_hash,p_metadata->>'summary',array(select jsonb_array_elements_text(p_source_refs)),jsonb_build_object('source_project_id',p_metadata->>'source_project_id'),p_actor_user_id,p_actor_name)
  on conflict(page_id,version_label) do update set change_summary=excluded.change_summary,content_sha256=excluded.content_sha256
  returning * into v_version;
  return jsonb_build_object('knowledge_item',to_jsonb(v_item),'knowledge_version',to_jsonb(v_version));
end;$$;

create or replace function public.queue_p24_knowledge_publish_notifications()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  if old.status is distinct from new.status and new.status='published' then
    insert into public.knowledge_subscription_notifications(subscription_id,subscriber_id,subscriber_name,module_name,domain,notification_channel,title,message,related_page_ids,action_required,priority,status,request_id,metadata)
    select subscription.id,subscription.subscriber_id,subscription.subscriber_name,subscription.module_name,subscription.domain,subscription.notification_channel,'知识已更新：'||new.title,'已发布新知识版本，请复核对当前模块、模板或治理规则的影响。',array[new.page_id],'查看知识变更并完成影响复核','P1','queued','knowledge-publish:'||new.id||':'||coalesce(new.current_version_label,'v1'),jsonb_build_object('knowledge_item_id',new.id,'knowledge_version',new.current_version_label,'source_project_id',new.metadata->>'source_project_id')
    from public.knowledge_subscriptions subscription
    where subscription.status='active' and (subscription.domain is null or subscription.domain=any(new.domains))
      and not exists(select 1 from public.knowledge_subscription_notifications notification where notification.subscription_id=subscription.id and notification.metadata->>'knowledge_item_id'=new.id::text and notification.metadata->>'knowledge_version'=coalesce(new.current_version_label,'v1'));
  end if;return new;
end;$$;
drop trigger if exists trg_p24_queue_knowledge_publish_notifications on public.knowledge_items;
create trigger trg_p24_queue_knowledge_publish_notifications after update of status on public.knowledge_items for each row execute function public.queue_p24_knowledge_publish_notifications();

alter table public.project_retrospectives enable row level security;alter table public.retrospective_knowledge_candidates enable row level security;alter table public.knowledge_recommendation_requests enable row level security;
revoke all on table public.project_retrospectives,public.retrospective_knowledge_candidates,public.knowledge_recommendation_requests from public,anon,authenticated;
grant select,insert,update,delete on table public.project_retrospectives,public.retrospective_knowledge_candidates,public.knowledge_recommendation_requests to service_role;
revoke all on function public.materialize_retrospective_candidate_tx(uuid,uuid,text,text,text,text) from public,anon,authenticated;revoke all on function public.queue_p24_knowledge_publish_notifications() from public,anon,authenticated;
revoke all on function public.submit_project_retrospective_tx(uuid,uuid,text,jsonb,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.create_closure_knowledge_candidate_tx(text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.materialize_retrospective_candidate_tx(uuid,uuid,text,text,text,text) to service_role;grant execute on function public.queue_p24_knowledge_publish_notifications() to service_role;
grant execute on function public.submit_project_retrospective_tx(uuid,uuid,text,jsonb,jsonb,uuid,text) to service_role;
grant execute on function public.create_closure_knowledge_candidate_tx(text,text,text,text,jsonb,jsonb,jsonb,text,jsonb,jsonb,text,uuid,text) to service_role;
