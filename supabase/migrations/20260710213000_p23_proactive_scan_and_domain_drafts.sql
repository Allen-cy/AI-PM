-- P23 completion: proactive findings are persisted through the existing
-- management-signal RPC; accepted AI recommendations materialize atomically
-- into real domain draft/state-machine records after a second confirmation.

alter table public.ai_assistant_evaluations
  add column if not exists accuracy_score numeric(4,3),
  add column if not exists refusal_outcome text not null default 'not_applicable',
  add column if not exists false_positive boolean not null default false,
  add column if not exists false_negative boolean not null default false,
  add column if not exists human_modified boolean not null default false,
  add column if not exists human_edit_summary text,
  add column if not exists closure_effect text not null default 'not_evaluated';

alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_accuracy_score_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_accuracy_score_check
  check (accuracy_score is null or (accuracy_score between 0 and 1));
alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_refusal_outcome_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_refusal_outcome_check
  check (refusal_outcome in ('not_applicable','correct','incorrect'));
alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_closure_effect_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_closure_effect_check
  check (closure_effect in ('not_evaluated','achieved','partially_achieved','not_achieved','too_early'));
alter table public.ai_assistant_evaluations drop constraint if exists ai_assistant_evaluations_human_edit_check;
alter table public.ai_assistant_evaluations add constraint ai_assistant_evaluations_human_edit_check
  check (not human_modified or nullif(btrim(human_edit_summary),'') is not null);

create index if not exists idx_ai_evaluation_quality
  on public.ai_assistant_evaluations(org_id,business_role,data_class,created_at desc);

create or replace function public.materialize_ai_recommendation_tx(
  p_recommendation_id uuid,
  p_attempt_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_project_id uuid,
  p_normalized_payload jsonb,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rec public.ai_recommendations%rowtype;
  v_attempt public.ai_recommendation_execution_attempts%rowtype;
  v_project public.projects%rowtype;
  v_resource_id uuid;
  v_resource_type text;
  v_initial_status text;
  v_actor_name text;
  v_workflow_name text;
  v_workflow_stage text;
  v_workflow_state text;
  v_evidence jsonb;
  v_action_type text;
begin
  select * into v_rec from public.ai_recommendations where id=p_recommendation_id for update;
  if not found then raise exception 'P23_RECOMMENDATION_NOT_FOUND'; end if;
  if v_rec.status <> 'accepted' then raise exception 'P23_ACCEPTED_RECOMMENDATION_REQUIRED'; end if;
  if v_rec.actor_user_id <> p_actor_user_id or v_rec.business_role <> p_actor_business_role
    or v_rec.org_id <> p_org_id or v_rec.subject_scope <> p_subject_scope
    or v_rec.subject_id <> p_subject_id or v_rec.data_class <> p_data_class then
    raise exception 'P23_RECOMMENDATION_CONTEXT_MISMATCH';
  end if;

  select * into v_attempt from public.ai_recommendation_execution_attempts where id=p_attempt_id for update;
  if not found or v_attempt.recommendation_id <> v_rec.id or v_attempt.status <> 'requested'
    or not v_attempt.confirmation_received or v_attempt.actor_user_id <> p_actor_user_id then
    raise exception 'P23_CONFIRMED_EXECUTION_ATTEMPT_REQUIRED';
  end if;

  select * into v_project from public.projects
  where id=p_project_id and org_id=p_org_id and data_class=p_data_class;
  if not found then raise exception 'P23_PROJECT_OUTSIDE_CONTEXT'; end if;
  if p_normalized_payload->>'project_id' is distinct from p_project_id::text then
    raise exception 'P23_PAYLOAD_PROJECT_MISMATCH';
  end if;
  if jsonb_typeof(p_normalized_payload->'evidence_ids') <> 'array'
    or jsonb_array_length(p_normalized_payload->'evidence_ids')=0 then
    raise exception 'P23_EVIDENCE_REQUIRED';
  end if;
  select coalesce(name,email,p_actor_user_id::text) into v_actor_name
  from public.app_users where id=p_actor_user_id and status='active';
  if not found then raise exception 'P23_ACTOR_INACTIVE'; end if;

  if v_rec.recommendation_type='action' then
    insert into public.unified_action_items(
      source_type,source_id,org_id,subject_scope,subject_id,project_id,title,owner_user_id,owner,due_date,
      status,priority,acceptance_criteria,idempotency_key,metadata,created_by,created_by_name,updated_at
    ) values (
      'manual',v_rec.id::text,p_org_id,p_subject_scope,p_subject_id,p_project_id,v_rec.title,p_actor_user_id,v_actor_name,
      (p_normalized_payload->>'due_date')::date,'assigned',p_normalized_payload->>'priority',
      p_normalized_payload->>'acceptance_criteria','ai-recommendation:'||v_rec.id,
      jsonb_build_object('ai_run_id',v_rec.run_id,'ai_recommendation_id',v_rec.id,'reason',v_rec.reason,'evidence_ids',p_normalized_payload->'evidence_ids','lifecycle_boundary','awaiting_owner_acceptance'),
      p_actor_user_id,v_actor_name,now()
    ) returning id into v_resource_id;
    v_resource_type:='unified_action_item'; v_initial_status:='assigned';

  elsif v_rec.recommendation_type='risk' then
    insert into public.risks(
      project_id,risk_code,project_name,description,category,stage,source,impact_area,probability,impact,urgency,status,
      owner,due_date,trigger_condition,workflow_step,current_input,current_output,last_action,action_owner,action_deadline,evidence,created_at,updated_at
    ) values (
      p_project_id,'AI-RSK-'||upper(substr(replace(v_rec.id::text,'-',''),1,12)),v_project.name,p_normalized_payload->>'description',
      p_normalized_payload->>'category',p_normalized_payload->>'stage',p_normalized_payload->>'source',p_normalized_payload->>'impact_area',
      (p_normalized_payload->>'probability')::integer,(p_normalized_payload->>'impact')::integer,(p_normalized_payload->>'urgency')::integer,'identified',
      p_normalized_payload->>'owner',(p_normalized_payload->>'due_date')::date,nullif(p_normalized_payload->>'trigger_condition',''),'identify',
      'AI建议已经预览、接受和二次人工确认','待业务责任人完成风险分析','created_from_ai_recommendation',
      p_normalized_payload->>'owner',(p_normalized_payload->>'due_date')::date,(p_normalized_payload->'evidence_ids')::text,now(),now()
    ) returning id into v_resource_id;
    insert into public.risk_workflow_events(risk_id,risk_code,workflow_step,to_status,input_summary,output_summary,action_required,owner,deadline,evidence,actor)
    values(v_resource_id,'AI-RSK-'||upper(substr(replace(v_rec.id::text,'-',''),1,12)),'identify','identified','经两次人工确认的AI建议','风险已进入登记册','完成概率、影响和应对分析',p_normalized_payload->>'owner',(p_normalized_payload->>'due_date')::date,(p_normalized_payload->'evidence_ids')::text,v_actor_name);
    v_resource_type:='risk'; v_initial_status:='identified';

  elsif v_rec.recommendation_type='issue' then
    insert into public.project_issues(
      project_id,issue_code,project_name,title,description,severity,status,owner,due_date,impact_scope,evidence,created_by,created_by_name,metadata,created_at,updated_at
    ) values (
      p_project_id,'AI-ISS-'||upper(substr(replace(v_rec.id::text,'-',''),1,12)),v_project.name,v_rec.title,p_normalized_payload->>'description',
      p_normalized_payload->>'severity','open',p_normalized_payload->>'owner',(p_normalized_payload->>'due_date')::date,p_normalized_payload->>'impact_scope',
      (p_normalized_payload->'evidence_ids')::text,p_actor_user_id,v_actor_name,jsonb_build_object('source','ai-recommendation','recommendation_id',v_rec.id,'run_id',v_rec.run_id),now(),now()
    ) returning id into v_resource_id;
    insert into public.issue_change_events(subject_type,subject_id,event_type,to_status,actor_id,actor_name,comment,evidence,metadata)
    values('issue',v_resource_id::text,'created', 'open',p_actor_user_id,v_actor_name,'AI建议经两次人工确认后创建',(p_normalized_payload->'evidence_ids')::text,jsonb_build_object('recommendation_id',v_rec.id));
    v_resource_type:='project_issue'; v_initial_status:='open';

  elsif v_rec.recommendation_type='change' then
    insert into public.project_changes(
      project_id,change_code,project_name,title,reason,change_type,impact_scope,impact_cost,impact_schedule_days,status,owner,approver,due_date,created_by,created_by_name,metadata,created_at,updated_at
    ) values (
      p_project_id,'AI-CHG-'||upper(substr(replace(v_rec.id::text,'-',''),1,12)),v_project.name,v_rec.title,p_normalized_payload->>'reason',
      p_normalized_payload->>'change_type',p_normalized_payload->>'impact_scope',nullif(p_normalized_payload->>'impact_cost','')::numeric,
      nullif(p_normalized_payload->>'impact_schedule_days','')::integer,'proposed',p_normalized_payload->>'owner',p_normalized_payload->>'approver',
      (p_normalized_payload->>'due_date')::date,p_actor_user_id,v_actor_name,jsonb_build_object('source','ai-recommendation','recommendation_id',v_rec.id,'run_id',v_rec.run_id,'evidence_ids',p_normalized_payload->'evidence_ids'),now(),now()
    ) returning id into v_resource_id;
    insert into public.issue_change_events(subject_type,subject_id,event_type,to_status,actor_id,actor_name,comment,evidence,metadata)
    values('change',v_resource_id::text,'created','proposed',p_actor_user_id,v_actor_name,'AI建议经两次人工确认后创建',(p_normalized_payload->'evidence_ids')::text,jsonb_build_object('recommendation_id',v_rec.id));
    v_resource_type:='project_change'; v_initial_status:='proposed';

  elsif v_rec.recommendation_type='governance' then
    if p_actor_business_role <> 'pmo' then raise exception 'P23_GOVERNANCE_ROLE_FORBIDDEN'; end if;
    case p_normalized_payload->>'workflow_id'
      when 'project-initiation-review' then v_workflow_name:='项目立项评审'; v_workflow_stage:='启动阶段'; v_workflow_state:='待提交';
      when 'stage-gate-review' then v_workflow_name:='阶段门评审'; v_workflow_stage:='全生命周期'; v_workflow_state:='待准备';
      when 'change-control' then v_workflow_name:='变更评审'; v_workflow_stage:='执行/监控阶段'; v_workflow_state:='待申请';
      when 'risk-escalation' then v_workflow_name:='风险升级评审'; v_workflow_stage:='监控阶段'; v_workflow_state:='已识别';
      when 'project-closure' then v_workflow_name:='项目收尾验收'; v_workflow_stage:='收尾阶段'; v_workflow_state:='待验收';
      else raise exception 'P23_GOVERNANCE_WORKFLOW_INVALID';
    end case;
    insert into public.governance_process_instances(
      workflow_id,workflow_name,stage,project_id,canonical_project_id,project_name,title,trigger_summary,input_summary,owner,approver,state,priority,deadline,source,created_by,created_by_name,metadata,created_at,updated_at
    ) values (
      p_normalized_payload->>'workflow_id',v_workflow_name,v_workflow_stage,p_project_id::text,p_project_id,v_project.name,v_rec.title,v_rec.reason,p_normalized_payload->>'input_summary',
      p_normalized_payload->>'owner',p_normalized_payload->>'approver',v_workflow_state,p_normalized_payload->>'priority',(p_normalized_payload->>'deadline')::date,'ai-pmo',p_actor_user_id,v_actor_name,
      jsonb_build_object('source',jsonb_build_object('type','ai-recommendation','id',v_rec.id,'run_id',v_rec.run_id),'evidence_ids',p_normalized_payload->'evidence_ids'),now(),now()
    ) returning id into v_resource_id;
    insert into public.governance_process_events(instance_id,event_type,to_state,comment,actor_id,actor_name,actor_role,decision,outputs)
    values(v_resource_id,'created',v_workflow_state,'AI建议经两次人工确认后进入治理流程',p_actor_user_id,v_actor_name,p_actor_business_role,'created',jsonb_build_object('evidence_ids',p_normalized_payload->'evidence_ids'));
    v_resource_type:='governance_process_instance'; v_initial_status:=v_workflow_state;

  elsif v_rec.recommendation_type='decision_brief' then
    if p_actor_business_role <> 'pmo' then raise exception 'P23_DECISION_BRIEF_ROLE_FORBIDDEN'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('source_type',split_part(eid,':',1),'source_id',substring(eid from position(':' in eid)+1),'title',eid)),'[]'::jsonb)
      into v_evidence from jsonb_array_elements_text(p_normalized_payload->'evidence_ids') as eid;
    insert into public.decision_briefs(
      org_id,subject_scope,subject_id,project_id,data_class,status,workflow_status,title,decision_question,options,recommendation,evidence,impact_summary,
      requested_decision_at,execution_due_at,acceptance_criteria,source_signal_ids,recipient_user_ids,created_by,updated_by,decision_type,decision_mode,decision_level,
      authority_mode,structured_input,definition_version,downstream_action_templates,review_metrics,revocation_conditions,review_plan,created_at,updated_at
    ) values (
      p_org_id,p_subject_scope,p_subject_id,p_project_id,p_data_class,'draft','draft',v_rec.title,p_normalized_payload->>'decision_question',p_normalized_payload->'options',
      p_normalized_payload->>'recommendation',v_evidence,p_normalized_payload->>'impact_summary',(p_normalized_payload->>'requested_decision_at')::timestamptz,
      (p_normalized_payload->>'execution_due_at')::timestamptz,p_normalized_payload->>'acceptance_criteria','[]','[]',p_actor_user_id,p_actor_user_id,
      p_normalized_payload->>'decision_type','routine',p_normalized_payload->>'decision_level','individual',
      jsonb_build_object('business_reason',p_normalized_payload->>'impact_summary','forecast',p_normalized_payload->>'impact_summary','risks',v_rec.reason,'conditions',p_normalized_payload->>'acceptance_criteria'),
      'P21-v1','[]','[]',jsonb_build_array('业务条件不再成立'),jsonb_build_object('review_at',p_normalized_payload->>'execution_due_at','owner_role','pmo'),now(),now()
    ) returning id into v_resource_id;
    insert into public.decision_events(brief_id,event_type,to_status,actor_user_id,actor_business_role,detail,request_id)
    values(v_resource_id,'created','draft',p_actor_user_id,p_actor_business_role,jsonb_build_object('source','ai-recommendation','recommendation_id',v_rec.id,'evidence_ids',p_normalized_payload->'evidence_ids'),p_request_id);
    v_resource_type:='decision_brief'; v_initial_status:='draft';

  elsif v_rec.recommendation_type='report' then
    insert into public.reporting_snapshots(
      org_id,subject_scope,subject_id,snapshot_type,period_start,period_end,status,data_class,metrics,exceptions,narrative,source_snapshot_at,source_definition,created_by,version,created_at,updated_at
    ) values (
      p_org_id,'project',p_project_id::text,p_normalized_payload->>'snapshot_type',(p_normalized_payload->>'period_start')::date,(p_normalized_payload->>'period_end')::date,
      'draft',p_data_class,coalesce(p_normalized_payload->'metrics','{}'),coalesce(p_normalized_payload->'exceptions','[]'),p_normalized_payload->>'narrative',now(),
      jsonb_build_object('source','ai-recommendation','recommendation_id',v_rec.id,'run_id',v_rec.run_id,'evidence_ids',p_normalized_payload->'evidence_ids'),p_actor_user_id,1,now(),now()
    ) returning id into v_resource_id;
    insert into public.reporting_snapshot_events(snapshot_id,org_id,subject_scope,subject_id,data_class,event_type,to_status,reason,actor_user_id,actor_business_role,request_id)
    values(v_resource_id,p_org_id,'project',p_project_id::text,p_data_class,'created','draft','AI建议经两次人工确认后创建',p_actor_user_id,p_actor_business_role,p_request_id);
    v_resource_type:='reporting_snapshot'; v_initial_status:='draft';

  elsif v_rec.recommendation_type='feishu_draft' then
    v_action_type:=p_normalized_payload->>'type';
    if v_action_type not in ('message','task','calendar','document') then raise exception 'P23_FEISHU_ACTION_TYPE_FORBIDDEN'; end if;
    insert into public.feishu_action_confirmations(
      requester_id,requester_name,requester_email,source,source_page,action_type,idempotency_key,target_summary,risk_level,status,payload,preview,request_id,
      org_id,project_id,data_class,created_at,updated_at
    ) select
      p_actor_user_id,v_actor_name,u.email,'system','/role-assistant',v_action_type,p_normalized_payload->>'idempotency_key',v_rec.title,'medium','pending_confirmation',
      p_normalized_payload,jsonb_build_object('actionType',v_action_type,'targetType','飞书动作草稿','targetSummary',v_rec.title,'riskLevel','medium','riskReasons',jsonb_build_array('AI建议需要飞书确认队列再次确认'),'fields','[]'::jsonb,'confirmationRequired',true),
      p_request_id,p_org_id,p_project_id,p_data_class,now(),now()
    from public.app_users u where u.id=p_actor_user_id
    returning id into v_resource_id;
    v_resource_type:='feishu_action_confirmation'; v_initial_status:='pending_confirmation';
  else
    raise exception 'P23_RECOMMENDATION_TYPE_UNSUPPORTED';
  end if;

  update public.ai_recommendations
  set status='materialized',executed_resource_type=v_resource_type,executed_resource_id=v_resource_id::text,updated_at=now()
  where id=v_rec.id and status='accepted';
  if not found then raise exception 'P23_RECOMMENDATION_CONCURRENTLY_HANDLED'; end if;
  update public.ai_recommendation_execution_attempts
  set status='materialized',resource_type=v_resource_type,resource_id=v_resource_id::text,completed_at=now()
  where id=v_attempt.id and status='requested';
  if not found then raise exception 'P23_EXECUTION_ATTEMPT_CONCURRENTLY_HANDLED'; end if;
  return jsonb_build_object('recommendation_id',v_rec.id,'resource_type',v_resource_type,'resource_id',v_resource_id,'initial_status',v_initial_status,'request_id',p_request_id);
end $$;

revoke all on function public.materialize_ai_recommendation_tx(uuid,uuid,uuid,text,uuid,text,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.materialize_ai_recommendation_tx(uuid,uuid,uuid,text,uuid,text,text,text,uuid,jsonb,text) to service_role;
