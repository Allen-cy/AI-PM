-- AI PM System V5.7 P24 closure gate, knowledge reuse and change impact.

create table if not exists public.project_closure_assessments (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  assessment_version integer not null default 1,
  fact_snapshot jsonb not null,
  blockers jsonb not null,
  ready boolean not null,
  status text not null default 'assessed' check (status in ('assessed','evidence_pending','submitted','approved','rejected','reopened')),
  assessed_by uuid not null references public.app_users(id) on delete restrict,
  reviewed_by uuid references public.app_users(id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  lifecycle_state_id uuid references public.project_lifecycle_states(id) on delete set null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  request_id text not null,
  created_at timestamptz not null default now(),
  unique (org_id,project_id,assessment_version,data_class)
);

create table if not exists public.knowledge_reuse_events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  source_project_id uuid references public.projects(id) on delete set null,
  target_project_id uuid references public.projects(id) on delete set null,
  recommendation_reason text not null,
  applicability jsonb not null default '{}'::jsonb,
  status text not null default 'recommended' check (status in ('recommended','viewed','accepted','rejected','applied','effect_reviewed')),
  actor_user_id uuid not null references public.app_users(id) on delete restrict,
  rejection_reason text,
  usage_note text,
  outcome text,
  effect_score integer check (effect_score between 1 and 5),
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_change_impact_links (
  id uuid primary key default uuid_generate_v4(),
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  knowledge_version_id uuid references public.knowledge_item_versions(id) on delete set null,
  target_type text not null check (target_type in ('module','template','subscriber','rule','prompt','training')),
  target_key text not null,
  impact_description text not null,
  owner_user_id uuid references public.app_users(id) on delete set null,
  priority text not null default 'P1' check (priority in ('P0','P1','P2')),
  due_at timestamptz,
  status text not null default 'pending_review' check (status in ('pending_review','in_progress','updated','no_change','closed')),
  closure_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (knowledge_item_id,knowledge_version_id,target_type,target_key)
);

create index if not exists idx_closure_assessment_project on public.project_closure_assessments(project_id,created_at desc);
create index if not exists idx_knowledge_reuse_target on public.knowledge_reuse_events(target_project_id,status,created_at desc);
create index if not exists idx_knowledge_impact_status on public.knowledge_change_impact_links(status,priority,due_at);

create or replace function public.enforce_p24_project_close_gate()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status
     and new.object_type = 'project'
     and new.status = 'closed'
     and not exists (
       select 1
       from public.project_closure_assessments assessment
       where assessment.org_id = new.org_id
         and assessment.project_id = new.project_id
         and assessment.data_class = new.data_class
         and assessment.ready = true
         and assessment.status = 'approved'
     ) then
    raise exception 'P24_FORMAL_CLOSE_GATE_NOT_APPROVED';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_p24_project_close_gate on public.project_lifecycle_states;
create trigger trg_p24_project_close_gate
before update of status on public.project_lifecycle_states
for each row execute function public.enforce_p24_project_close_gate();

create or replace function public.publish_closure_knowledge_candidate_tx(
  p_knowledge_item_id uuid,
  p_source_project_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_review_note text,
  p_impact_targets jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.knowledge_items;
  v_version_id uuid;
  v_target text;
begin
  select * into v_item
  from public.knowledge_items
  where id = p_knowledge_item_id
    and metadata->>'source_project_id' = p_source_project_id::text
  for update;
  if not found then raise exception 'P24_KNOWLEDGE_CANDIDATE_NOT_FOUND'; end if;
  if v_item.status not in ('draft', 'reviewed') then raise exception 'P24_KNOWLEDGE_CANDIDATE_NOT_PUBLISHABLE'; end if;

  select id into v_version_id
  from public.knowledge_item_versions
  where knowledge_item_id = p_knowledge_item_id
  order by created_at desc
  limit 1;
  if v_version_id is null then raise exception 'P24_KNOWLEDGE_VERSION_REQUIRED'; end if;

  update public.knowledge_items set
    status = 'published',
    current_version_label = coalesce(current_version_label, 'v1'),
    updated_by = p_actor_user_id,
    updated_by_name = p_actor_name,
    updated_at = now()
  where id = p_knowledge_item_id
  returning * into v_item;

  insert into public.knowledge_lifecycle_events(
    knowledge_item_id, page_id, event_type, from_status, to_status,
    actor_id, actor_name, event_status, review_note, request_id, metadata
  ) values (
    v_item.id, v_item.page_id, 'publish', 'draft', 'published',
    p_actor_user_id, p_actor_name, 'succeeded', p_review_note, p_request_id,
    jsonb_build_object('source_project_id', p_source_project_id, 'knowledge_version_id', v_version_id)
  );

  for v_target in select value from jsonb_array_elements_text(coalesce(p_impact_targets, '[]'::jsonb))
  loop
    insert into public.knowledge_change_impact_links(
      knowledge_item_id, knowledge_version_id, target_type, target_key,
      impact_description, owner_user_id, priority, due_at, status
    ) values (
      v_item.id, v_version_id, 'module', v_target,
      '复核新知识是否影响' || v_target || '模块、模板、提示词或规则。',
      p_actor_user_id, 'P1', now() + interval '14 days', 'pending_review'
    )
    on conflict (knowledge_item_id, knowledge_version_id, target_type, target_key)
    do update set impact_description = excluded.impact_description,
                  owner_user_id = excluded.owner_user_id,
                  due_at = excluded.due_at,
                  updated_at = now();
  end loop;

  return jsonb_build_object('knowledge_item_id', v_item.id, 'knowledge_version_id', v_version_id, 'status', v_item.status);
end;
$$;

alter table public.project_closure_assessments enable row level security;
alter table public.knowledge_reuse_events enable row level security;
alter table public.knowledge_change_impact_links enable row level security;
revoke all on table public.project_closure_assessments,public.knowledge_reuse_events,public.knowledge_change_impact_links from public,anon,authenticated;
grant select,insert,update,delete on table public.project_closure_assessments,public.knowledge_reuse_events,public.knowledge_change_impact_links to service_role;
revoke all on function public.publish_closure_knowledge_candidate_tx(uuid,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.publish_closure_knowledge_candidate_tx(uuid,uuid,uuid,text,text,jsonb,text) to service_role;
