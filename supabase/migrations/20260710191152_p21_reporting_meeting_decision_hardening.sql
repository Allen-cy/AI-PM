-- AI PM System V6.0 P21 reporting, meeting and unified-decision hardening.
-- Server-only business tables. Application scope checks are repeated inside
-- transactional RPCs so service-role access cannot accidentally cross subjects.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.p21_sha256_hex(p_value text)
returns text
language sql
stable
set search_path = extensions, pg_temp
as $$
  select encode(digest(convert_to(coalesce(p_value,''),'UTF8'),'sha256'),'hex')
$$;

-- Personal notification identity is explicit. A decision SLA draft is never
-- queued against an inferred email/phone or the global Feishu connection.
alter table public.user_feishu_connections
  add column if not exists notification_receive_id_type text,
  add column if not exists notification_receive_id text;
alter table public.user_feishu_connections drop constraint if exists user_feishu_connections_notification_receive_type_check;
alter table public.user_feishu_connections add constraint user_feishu_connections_notification_receive_type_check
  check (notification_receive_id_type is null or notification_receive_id_type in ('chat_id','open_id'));
alter table public.user_feishu_connections drop constraint if exists user_feishu_connections_notification_receive_pair_check;
alter table public.user_feishu_connections add constraint user_feishu_connections_notification_receive_pair_check
  check ((notification_receive_id_type is null) = (notification_receive_id is null));

-- Reporting snapshots: frozen versions are immutable; corrections create a new version.
alter table public.reporting_snapshots drop constraint if exists reporting_snapshots_status_check;
update public.reporting_snapshots
set status = 'frozen', updated_at = now()
where status = 'accepted';
alter table public.reporting_snapshots
  add constraint reporting_snapshots_status_check
  check (status in ('draft','submitted','returned','frozen','superseded'));
alter table public.reporting_snapshots
  add column if not exists submitted_by uuid references public.app_users(id) on delete set null,
  add column if not exists returned_by uuid references public.app_users(id) on delete set null,
  add column if not exists returned_at timestamptz,
  add column if not exists return_reason text,
  add column if not exists correction_due_at timestamptz,
  add column if not exists frozen_by uuid references public.app_users(id) on delete set null,
  add column if not exists frozen_at timestamptz,
  add column if not exists supersedes_snapshot_id uuid references public.reporting_snapshots(id) on delete set null,
  add column if not exists superseded_by_snapshot_id uuid references public.reporting_snapshots(id) on delete set null,
  add column if not exists content_hash text,
  add column if not exists request_id text;
update public.reporting_snapshots
set frozen_by = coalesce(frozen_by, accepted_by), frozen_at = coalesce(frozen_at, accepted_at)
where status in ('frozen','superseded');
create unique index if not exists idx_p21_reporting_snapshot_request
  on public.reporting_snapshots(request_id) where request_id is not null;

create table if not exists public.reporting_snapshot_events (
  id uuid primary key default uuid_generate_v4(),
  snapshot_id uuid not null references public.reporting_snapshots(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  event_type text not null,
  from_status text,
  to_status text not null,
  reason text,
  due_at timestamptz,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_business_role text,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.reporting_receipts (
  id uuid primary key default uuid_generate_v4(),
  snapshot_id uuid not null references public.reporting_snapshots(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  recipient_business_role text not null default 'pmo' check (recipient_business_role = 'pmo'),
  status text not null default 'pending' check (status in ('pending','returned','frozen','superseded')),
  response text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(snapshot_id,recipient_user_id,recipient_business_role)
);

-- Meeting state, evidence freeze, cancellation/postponement and proxy attendance.
alter table public.governance_meetings add column if not exists data_class text;
update public.governance_meetings set data_class = 'production' where data_class is null;
alter table public.governance_meetings alter column data_class set default 'production';
alter table public.governance_meetings alter column data_class set not null;
alter table public.governance_meetings drop constraint if exists governance_meetings_data_class_check;
alter table public.governance_meetings add constraint governance_meetings_data_class_check
  check (data_class in ('production','sample','test','diagnostic','unclassified'));
alter table public.governance_meetings drop constraint if exists governance_meetings_status_check;
alter table public.governance_meetings add constraint governance_meetings_status_check
  check (status in ('scheduled','agenda_frozen','in_progress','minutes_pending','actions_pending','effect_review','closed','cancelled','postponed'));
alter table public.governance_meetings
  add column if not exists timezone text not null default 'Asia/Shanghai',
  add column if not exists working_calendar_key text not null default 'CN-standard',
  add column if not exists agenda_frozen_at timestamptz,
  add column if not exists agenda_frozen_by uuid references public.app_users(id) on delete set null,
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists decision_brief_ids jsonb not null default '[]'::jsonb,
  add column if not exists review_plan_ids jsonb not null default '[]'::jsonb,
  add column if not exists cancellation_reason text,
  add column if not exists postponed_reason text,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists impacted_decision_ids jsonb not null default '[]'::jsonb,
  add column if not exists effect_reviewed_at timestamptz,
  add column if not exists closed_by uuid references public.app_users(id) on delete set null;

create table if not exists public.governance_meeting_delegates (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  absent_user_id uuid not null references public.app_users(id) on delete cascade,
  proxy_user_id uuid not null references public.app_users(id) on delete cascade,
  absent_business_role text not null,
  proxy_business_role text not null,
  reason text not null,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  granted_by uuid not null references public.app_users(id) on delete restrict,
  revoked_by uuid references public.app_users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (absent_user_id <> proxy_user_id),
  check (valid_until >= valid_from),
  unique(meeting_id,absent_user_id,absent_business_role)
);

create table if not exists public.meeting_conclusion_outputs (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  conclusion_key text not null,
  conclusion_type text not null check (conclusion_type in ('decision','action','no_action')),
  title text not null,
  rationale text,
  decision_brief_id uuid references public.decision_briefs(id) on delete set null,
  action_item_id uuid references public.unified_action_items(id) on delete set null,
  review_at timestamptz not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(meeting_id,conclusion_key),
  check (
    (conclusion_type='decision' and decision_brief_id is not null and action_item_id is null) or
    (conclusion_type='action' and action_item_id is not null and decision_brief_id is null) or
    (conclusion_type='no_action' and decision_brief_id is null and action_item_id is null and nullif(trim(rationale),'') is not null)
  )
);

create table if not exists public.meeting_review_plans (
  id uuid primary key default uuid_generate_v4(),
  meeting_id uuid not null references public.governance_meetings(id) on delete cascade,
  conclusion_output_id uuid not null references public.meeting_conclusion_outputs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  owner_user_id uuid references public.app_users(id) on delete set null,
  owner_business_role text not null default 'pmo',
  review_at timestamptz not null,
  review_metrics jsonb not null default '[]'::jsonb,
  status text not null default 'planned' check (status in ('planned','due','submitted','accepted','rejected','closed')),
  result jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(conclusion_output_id)
);

-- Versioned standard decision contracts and response SLA configuration.
create table if not exists public.decision_type_definitions (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  decision_type text not null check (decision_type in ('continue','accelerate','downgrade','pause','terminate','resource_adjustment','risk_acceptance','evidence_request')),
  decision_level text not null check (decision_level in ('project','portfolio','executive')),
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  required_input_fields jsonb not null check (jsonb_typeof(required_input_fields)='array'),
  allowed_decision_roles jsonb not null check (jsonb_typeof(allowed_decision_roles)='array'),
  downstream_action_templates jsonb not null check (jsonb_typeof(downstream_action_templates)='array'),
  review_metrics jsonb not null check (jsonb_typeof(review_metrics)='array'),
  revocation_conditions jsonb not null check (jsonb_typeof(revocation_conditions)='array'),
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id,decision_type,decision_level,version),
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists idx_p21_global_decision_definition
  on public.decision_type_definitions(decision_type,decision_level,version)
  where org_id is null;

create table if not exists public.decision_sla_policies (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete cascade,
  decision_mode text not null check (decision_mode in ('routine','emergency')),
  decision_level text not null check (decision_level in ('project','portfolio','executive')),
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  response_sla_minutes integer not null check (response_sla_minutes > 0),
  evidence_sla_minutes integer not null check (evidence_sla_minutes > 0),
  receipt_sla_minutes integer not null check (receipt_sla_minutes > 0),
  escalation_levels jsonb not null default '[]'::jsonb check (jsonb_typeof(escalation_levels)='array'),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  approved_by uuid references public.app_users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(org_id,decision_mode,decision_level,version),
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists idx_p21_global_decision_sla
  on public.decision_sla_policies(decision_mode,decision_level,version)
  where org_id is null;

create table if not exists public.decision_committees (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  name text not null,
  decision_levels jsonb not null default '["portfolio","executive"]'::jsonb check (jsonb_typeof(decision_levels)='array'),
  chair_user_id uuid not null references public.app_users(id) on delete restrict,
  quorum integer not null check (quorum > 0),
  min_approvals integer not null check (min_approvals > 0 and min_approvals <= quorum),
  status text not null default 'active' check (status in ('active','suspended','retired')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  request_id text,
  request_hash text,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);
alter table public.decision_committees add column if not exists request_id text;
alter table public.decision_committees add column if not exists request_hash text;
create unique index if not exists idx_p21_decision_committee_request
  on public.decision_committees(org_id,request_id) where request_id is not null;

create table if not exists public.decision_committee_members (
  id uuid primary key default uuid_generate_v4(),
  committee_id uuid not null references public.decision_committees(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  user_id uuid not null references public.app_users(id) on delete cascade,
  business_role text not null check (business_role in ('ceo','sponsor')),
  member_role text not null default 'voter' check (member_role in ('chair','voter','observer')),
  status text not null default 'active' check (status in ('active','suspended','revoked','expired')),
  delegated_from_user_id uuid references public.app_users(id) on delete set null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(committee_id,user_id,business_role),
  check (valid_until is null or valid_until >= valid_from)
);

-- Add exact P21 workflow and the immutable contract snapshot to each brief.
alter table public.decision_briefs
  add column if not exists workflow_status text not null default 'draft',
  add column if not exists decision_type text not null default 'continue',
  add column if not exists decision_mode text not null default 'routine',
  add column if not exists decision_level text not null default 'executive',
  add column if not exists authority_mode text not null default 'individual',
  add column if not exists committee_id uuid references public.decision_committees(id) on delete set null,
  add column if not exists structured_input jsonb not null default '{}'::jsonb,
  add column if not exists emergency_trigger text,
  add column if not exists response_sla_minutes integer,
  add column if not exists sla_policy_version text,
  add column if not exists definition_version text not null default 'P21-v1',
  add column if not exists downstream_action_templates jsonb not null default '[]'::jsonb,
  add column if not exists review_metrics jsonb not null default '[]'::jsonb,
  add column if not exists revocation_conditions jsonb not null default '[]'::jsonb,
  add column if not exists review_plan jsonb not null default '{}'::jsonb,
  add column if not exists reopened_from_brief_id uuid references public.decision_briefs(id) on delete set null,
  add column if not exists reopened_at timestamptz;
update public.decision_briefs set workflow_status = case status
  when 'draft' then 'draft' when 'submitted' then 'pending_decision'
  when 'decided' then 'decided' when 'distributed' then 'translated'
  when 'effect_review_pending' then 'effect_review' when 'effect_reviewed' then 'effect_review'
  when 'closed' then 'closed' when 'withdrawn' then 'closed' else 'draft' end
where workflow_status = 'draft' and status <> 'draft';
alter table public.decision_briefs drop constraint if exists decision_briefs_workflow_status_check;
alter table public.decision_briefs add constraint decision_briefs_workflow_status_check
  check (workflow_status in ('draft','evidence_required','pending_decision','decided','translated','executing','effect_review','closed','reopened'));
alter table public.decision_briefs drop constraint if exists decision_briefs_decision_type_check;
alter table public.decision_briefs add constraint decision_briefs_decision_type_check
  check (decision_type in ('continue','accelerate','downgrade','pause','terminate','resource_adjustment','risk_acceptance','evidence_request'));
alter table public.decision_briefs drop constraint if exists decision_briefs_decision_mode_check;
alter table public.decision_briefs add constraint decision_briefs_decision_mode_check check (decision_mode in ('routine','emergency'));
alter table public.decision_briefs drop constraint if exists decision_briefs_decision_level_check;
alter table public.decision_briefs add constraint decision_briefs_decision_level_check check (decision_level in ('project','portfolio','executive'));
alter table public.decision_briefs drop constraint if exists decision_briefs_authority_mode_check;
alter table public.decision_briefs add constraint decision_briefs_authority_mode_check check (authority_mode in ('individual','committee'));
alter table public.decision_briefs drop constraint if exists decision_briefs_authority_target_check;
alter table public.decision_briefs add constraint decision_briefs_authority_target_check check (
  (authority_mode='individual' and committee_id is null) or
  (authority_mode='committee' and committee_id is not null)
);

alter table public.decisions
  add column if not exists decision_type text,
  add column if not exists decision_level text,
  add column if not exists authority_type text not null default 'direct',
  add column if not exists delegated_from_user_id uuid references public.app_users(id) on delete set null,
  add column if not exists committee_id uuid references public.decision_committees(id) on delete set null,
  add column if not exists quorum_snapshot jsonb not null default '{}'::jsonb;
alter table public.decisions drop constraint if exists decisions_authority_type_check;
alter table public.decisions add constraint decisions_authority_type_check check (authority_type in ('direct','delegate','committee'));

create table if not exists public.decision_votes (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  committee_id uuid not null references public.decision_committees(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  voter_user_id uuid not null references public.app_users(id) on delete cascade,
  voter_business_role text not null check (voter_business_role in ('ceo','sponsor')),
  vote text not null check (vote in ('approve','reject','abstain')),
  selected_option_key text,
  rationale text not null,
  delegated_from_user_id uuid references public.app_users(id) on delete set null,
  voted_at timestamptz not null default now(),
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(brief_id,voter_user_id,voter_business_role)
);

create table if not exists public.decision_evidence_requests (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  requested_by uuid not null references public.app_users(id) on delete restrict,
  requested_business_role text not null check (requested_business_role in ('ceo','sponsor')),
  assigned_to_user_id uuid not null references public.app_users(id) on delete restrict,
  assigned_to_business_role text not null default 'pmo' check (assigned_to_business_role='pmo'),
  required_items jsonb not null check (jsonb_typeof(required_items)='array' and jsonb_array_length(required_items)>0),
  reason text not null,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','submitted','accepted','rejected','expired')),
  response text,
  evidence jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  reviewed_by uuid references public.app_users(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_p21_open_evidence_request
  on public.decision_evidence_requests(brief_id)
  where status in ('open','submitted','rejected');

create table if not exists public.decision_authority_responses (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null check (subject_scope in ('project','portfolio','organization','customer','contract')),
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  responder_user_id uuid not null references public.app_users(id) on delete cascade,
  responder_business_role text not null check (responder_business_role in ('ceo','sponsor')),
  response_type text not null check (response_type in ('declined','abstained','recused')),
  reason text not null,
  delegated_from_user_id uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  request_id text
);
create unique index if not exists idx_p21_authority_response_request
  on public.decision_authority_responses(brief_id,request_id) where request_id is not null;

create table if not exists public.decision_execution_actions (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  decision_id uuid not null references public.decisions(id) on delete cascade,
  receipt_id uuid not null references public.decision_receipts(id) on delete cascade,
  action_item_id uuid not null references public.unified_action_items(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  template_key text not null,
  template_version text not null,
  created_at timestamptz not null default now(),
  unique(receipt_id,action_item_id),
  unique(brief_id,template_key,action_item_id)
);

create table if not exists public.decision_sla_escalations (
  id uuid primary key default uuid_generate_v4(),
  brief_id uuid not null references public.decision_briefs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  subject_scope text not null,
  subject_id text not null,
  data_class text not null check (data_class in ('production','sample','test','diagnostic','unclassified')),
  escalation_key text not null,
  escalation_type text not null check (escalation_type in ('decision_response','evidence_response','receipt_response','execution','effect_review','authority_declined')),
  escalation_level text not null check (escalation_level in ('project','pmo','executive')),
  reason text not null,
  due_at timestamptz not null,
  target_user_id uuid references public.app_users(id) on delete set null,
  target_business_role text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','cancelled')),
  source_payload jsonb not null default '{}'::jsonb,
  feishu_confirmation_id uuid references public.feishu_action_confirmations(id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  unique(escalation_key)
);
alter table public.decision_sla_escalations
  add column if not exists feishu_confirmation_id uuid references public.feishu_action_confirmations(id) on delete set null;
create unique index if not exists idx_p21_sla_feishu_confirmation
  on public.decision_sla_escalations(feishu_confirmation_id) where feishu_confirmation_id is not null;
create unique index if not exists idx_p21_decision_sla_confirmation_idempotency
  on public.feishu_action_confirmations(idempotency_key) where source_page='/decision-center';

create index if not exists idx_p21_reporting_events_scope on public.reporting_snapshot_events(org_id,subject_scope,subject_id,data_class,created_at desc);
create index if not exists idx_p21_reporting_receipts_inbox on public.reporting_receipts(recipient_user_id,status,updated_at desc);
create index if not exists idx_p21_meeting_scope on public.governance_meetings(org_id,subject_scope,subject_id,data_class,status,scheduled_at);
create index if not exists idx_p21_committee_scope on public.decision_committees(org_id,subject_scope,subject_id,data_class,status);
create index if not exists idx_p21_votes_brief on public.decision_votes(brief_id,voted_at);
create index if not exists idx_p21_evidence_due on public.decision_evidence_requests(org_id,status,due_at);
create index if not exists idx_p21_execution_brief on public.decision_execution_actions(brief_id,receipt_id);
create index if not exists idx_p21_sla_open on public.decision_sla_escalations(org_id,status,due_at);

-- Global defaults are versioned configuration, not display data. Organizations may
-- supersede them with an org-specific active version.
insert into public.decision_type_definitions(
  org_id,decision_type,decision_level,version,status,required_input_fields,
  allowed_decision_roles,downstream_action_templates,review_metrics,revocation_conditions,
  approved_at,effective_from
)
select null, definition.decision_type, level_name, 'P21-v1', 'active',
       definition.required_input_fields, '["ceo","sponsor"]'::jsonb,
       definition.downstream_action_templates, definition.review_metrics,
       definition.revocation_conditions, now(), now()
from (values
  ('continue', '["business_reason","forecast","risks","conditions"]'::jsonb,
   '[{"key":"stage_gate","title":"落实继续/有条件继续的阶段门结论","ownerRoles":["pm","operations"],"acceptanceCriteria":"条件清单逐项完成并由PMO复核"}]'::jsonb,
   '["condition_completion_rate","milestone_forecast_variance","cash_forecast_variance"]'::jsonb,
   '["任一前置条件逾期","最新预测越过批准容差","关键证据失效"]'::jsonb),
  ('accelerate', '["strategic_value","resource_conflicts","benefit_cash_impact"]'::jsonb,
   '[{"key":"acceleration_plan","title":"执行加速方案并更新优先级、里程碑与预算","ownerRoles":["pm","operations","finance"],"acceptanceCriteria":"资源生效且基线、预算和现金预测完成更新"}]'::jsonb,
   '["cycle_time_improvement","opportunity_cost","benefit_forecast_delta"]'::jsonb,
   '["机会成本高于批准上限","加速后收益预测下降","关键资源不可用"]'::jsonb),
  ('downgrade', '["value_decline","scope_options","contract_impact"]'::jsonb,
   '[{"key":"scope_change","title":"执行降级/范围调整并处理基线与合同影响","ownerRoles":["pm","operations","finance"],"acceptanceCriteria":"变更获批且范围、基线、合同和客户承诺一致"}]'::jsonb,
   '["cost_reduction","benefit_delta","customer_impact"]'::jsonb,
   '["客户拒绝范围调整","合同损失超过批准值","剩余价值恢复至原等级"]'::jsonb),
  ('pause', '["pause_reason","obligation_inventory","restart_conditions"]'::jsonb,
   '[{"key":"pause_control","title":"冻结新增投入并完成暂停义务与重启条件清单","ownerRoles":["pm","operations","finance"],"acceptanceCriteria":"新增投入冻结、存量义务有责任人、重启门槛可验证"}]'::jsonb,
   '["cash_burn_avoided","open_obligation_count","restart_condition_completion"]'::jsonb,
   '["暂停导致不可接受的合同违约","重启条件已全部满足","风险敞口超过停项阈值"]'::jsonb),
  ('terminate', '["termination_basis","contract_customer_impact","closure_obligations"]'::jsonb,
   '[{"key":"termination_plan","title":"执行终止、合同客户处理、资源释放与收尾","ownerRoles":["pm","operations","finance","business_owner"],"acceptanceCriteria":"终止义务、资源释放、客户沟通和收尾门禁全部完成"}]'::jsonb,
   '["loss_avoided","termination_cost","obligation_completion_rate"]'::jsonb,
   '["终止成本超过批准边界","关键合同义务无法解除","出现经批准的更优转向方案"]'::jsonb),
  ('resource_adjustment', '["resource_gap","candidate_plan","milestone_budget_impact"]'::jsonb,
   '[{"key":"resource_reallocation","title":"执行资源调配并同步受影响项目里程碑与预算","ownerRoles":["pm","operations","finance"],"acceptanceCriteria":"资源到岗且所有受影响项目基线与预算完成更新"}]'::jsonb,
   '["capacity_gap","milestone_recovery_days","budget_delta","third_project_impact"]'::jsonb,
   '["被调人员或责任人拒收","容量数据过期","第三项目影响超过批准容差"]'::jsonb),
  ('risk_acceptance', '["risk_id","residual_exposure","appetite_basis","contingency"]'::jsonb,
   '[{"key":"risk_watch","title":"登记风险接受边界、应急预案与复审触发器","ownerRoles":["pm","operations","quality"],"acceptanceCriteria":"剩余风险、预案Owner、触发阈值和复审日期均已登记"}]'::jsonb,
   '["residual_exposure","trigger_distance","contingency_readiness"]'::jsonb,
   '["剩余风险超过风险偏好","应急预案失效","关键假设变化"]'::jsonb),
  ('evidence_request', '["evidence_gaps","required_evidence","due_at"]'::jsonb,
   '[{"key":"evidence_completion","title":"补齐并验证决策所需证据","ownerRoles":["pm","operations","finance","quality"],"acceptanceCriteria":"要求的证据全部提交、可追溯并通过授权决策人确认"}]'::jsonb,
   '["evidence_completion_rate","evidence_freshness","decision_delay"]'::jsonb,
   '["证据来源失效","补证超过SLA","新增事实改变决策问题"]'::jsonb)
) as definition(decision_type,required_input_fields,downstream_action_templates,review_metrics,revocation_conditions)
cross join unnest(array['project','portfolio','executive']) level_name
on conflict do nothing;

insert into public.decision_sla_policies(
  org_id,decision_mode,decision_level,version,status,response_sla_minutes,
  evidence_sla_minutes,receipt_sla_minutes,escalation_levels,approved_at,effective_from
)
values
  (null,'routine','project','P21-v1','active',1440,1440,1440,'["pmo","executive"]'::jsonb,now(),now()),
  (null,'routine','portfolio','P21-v1','active',1440,1440,1440,'["pmo","executive"]'::jsonb,now(),now()),
  (null,'routine','executive','P21-v1','active',1440,1440,1440,'["pmo","executive"]'::jsonb,now(),now()),
  (null,'emergency','project','P21-v1','active',240,240,240,'["pmo","executive"]'::jsonb,now(),now()),
  (null,'emergency','portfolio','P21-v1','active',120,120,120,'["pmo","executive"]'::jsonb,now(),now()),
  (null,'emergency','executive','P21-v1','active',60,60,60,'["pmo","executive"]'::jsonb,now(),now())
on conflict do nothing;

-- Freeze guards compare business content, while still allowing the status-only
-- frozen -> superseded transition.
create or replace function public.enforce_reporting_snapshot_immutability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status in ('frozen','superseded') and (
    new.org_id is distinct from old.org_id or new.subject_scope is distinct from old.subject_scope or
    new.subject_id is distinct from old.subject_id or new.snapshot_type is distinct from old.snapshot_type or
    new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end or
    new.data_class is distinct from old.data_class or new.metrics is distinct from old.metrics or
    new.exceptions is distinct from old.exceptions or new.narrative is distinct from old.narrative or
    new.source_snapshot_at is distinct from old.source_snapshot_at or new.source_definition is distinct from old.source_definition
  ) then
    raise exception 'REPORTING_SNAPSHOT_FROZEN_IMMUTABLE';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reporting_snapshot_immutable on public.reporting_snapshots;
create trigger trg_reporting_snapshot_immutable before update on public.reporting_snapshots
for each row execute function public.enforce_reporting_snapshot_immutability();

create or replace function public.create_reporting_snapshot_tx(
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_snapshot_type text,
  p_period_start date,
  p_period_end date,
  p_metrics jsonb,
  p_exceptions jsonb,
  p_narrative text,
  p_source_snapshot_at timestamptz,
  p_source_definition jsonb,
  p_submitted_to_user_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot public.reporting_snapshots%rowtype;
  v_existing public.reporting_snapshots%rowtype;
  v_hash text;
  v_version bigint;
  v_status text;
begin
  if p_subject_scope not in ('project','portfolio','organization','customer','contract') then raise exception 'REPORTING_SCOPE_INVALID'; end if;
  if p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'REPORTING_DATA_CLASS_INVALID'; end if;
  if p_snapshot_type not in ('daily','weekly','monthly','quarterly','ad_hoc') then raise exception 'REPORTING_TYPE_INVALID'; end if;
  if p_actor_business_role not in ('pm','operations','pmo') then raise exception 'REPORTING_ROLE_FORBIDDEN'; end if;
  if p_period_end < p_period_start or nullif(trim(p_narrative),'') is null or p_source_snapshot_at is null or coalesce(p_source_definition,'{}'::jsonb)='{}'::jsonb then
    raise exception 'REPORTING_INPUT_INVALID';
  end if;
  if p_snapshot_type='weekly' and p_subject_scope not in ('project','portfolio') then raise exception 'REPORTING_WEEKLY_SCOPE_INVALID'; end if;
  if p_snapshot_type='monthly' and p_subject_scope not in ('portfolio','organization') then raise exception 'REPORTING_MONTHLY_SCOPE_INVALID'; end if;
  if p_snapshot_type='quarterly' and p_subject_scope not in ('portfolio','organization') then raise exception 'REPORTING_QUARTERLY_SCOPE_INVALID'; end if;
  v_hash := public.p21_sha256_hex(coalesce(p_metrics,'{}'::jsonb)::text||coalesce(p_exceptions,'[]'::jsonb)::text||trim(p_narrative)||p_source_snapshot_at::text||p_source_definition::text);
  if nullif(trim(p_request_id),'') is not null then
    select * into v_existing from public.reporting_snapshots where request_id=p_request_id;
    if found then
      if v_existing.content_hash is distinct from v_hash or v_existing.org_id<>p_org_id or v_existing.subject_scope<>p_subject_scope or v_existing.subject_id<>p_subject_id or v_existing.data_class<>p_data_class then
        raise exception 'REPORTING_IDEMPOTENCY_CONFLICT';
      end if;
      return to_jsonb(v_existing);
    end if;
  end if;
  if p_submitted_to_user_id is not null and not exists (
    select 1 from public.business_reporting_relationships r
    where r.org_id=p_org_id and r.subject_scope=p_subject_scope and r.subject_id=p_subject_id
      and r.from_user_id=p_actor_user_id and r.from_business_role=p_actor_business_role
      and r.to_user_id=p_submitted_to_user_id and r.to_business_role='pmo'
      and r.relationship_type in ('reports_to','escalates_to') and r.status='active'
      and r.valid_from<=now() and (r.valid_until is null or r.valid_until>=now())
  ) then raise exception 'REPORTING_RELATIONSHIP_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org_id::text||':'||p_subject_scope||':'||p_subject_id||':'||p_snapshot_type||':'||p_period_start::text||':'||p_data_class,0));
  select coalesce(max(version),0)+1 into v_version from public.reporting_snapshots
  where org_id=p_org_id and subject_scope=p_subject_scope and subject_id=p_subject_id
    and snapshot_type=p_snapshot_type and period_start=p_period_start and data_class=p_data_class;
  v_status := case when p_submitted_to_user_id is null then 'draft' else 'submitted' end;
  insert into public.reporting_snapshots(
    org_id,subject_scope,subject_id,snapshot_type,period_start,period_end,status,data_class,
    metrics,exceptions,narrative,source_snapshot_at,source_definition,created_by,submitted_by,
    submitted_to_user_id,submitted_at,version,content_hash,request_id
  ) values (
    p_org_id,p_subject_scope,p_subject_id,p_snapshot_type,p_period_start,p_period_end,v_status,p_data_class,
    coalesce(p_metrics,'{}'::jsonb),coalesce(p_exceptions,'[]'::jsonb),trim(p_narrative),p_source_snapshot_at,p_source_definition,
    p_actor_user_id,case when p_submitted_to_user_id is null then null else p_actor_user_id end,
    p_submitted_to_user_id,case when p_submitted_to_user_id is null then null else now() end,v_version,
    v_hash,p_request_id
  ) returning * into v_snapshot;
  if p_submitted_to_user_id is not null then
    insert into public.reporting_receipts(snapshot_id,org_id,subject_scope,subject_id,data_class,recipient_user_id)
    values(v_snapshot.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_submitted_to_user_id);
  end if;
  insert into public.reporting_snapshot_events(snapshot_id,org_id,subject_scope,subject_id,data_class,event_type,to_status,actor_user_id,actor_business_role,request_id)
  values(v_snapshot.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,'create',v_status,p_actor_user_id,p_actor_business_role,p_request_id);
  return to_jsonb(v_snapshot);
end;
$$;

create or replace function public.transition_reporting_snapshot_tx(
  p_snapshot_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_expected_status text,
  p_operation text,
  p_reason text,
  p_due_at timestamptz,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot public.reporting_snapshots%rowtype;
  v_next text;
begin
  select * into v_snapshot from public.reporting_snapshots where id=p_snapshot_id for update;
  if not found then raise exception 'REPORTING_SNAPSHOT_NOT_FOUND'; end if;
  if v_snapshot.org_id<>p_org_id or v_snapshot.subject_scope<>p_subject_scope or v_snapshot.subject_id<>p_subject_id then raise exception 'REPORTING_SCOPE_MISMATCH'; end if;
  if v_snapshot.data_class<>p_data_class then raise exception 'REPORTING_DATA_CLASS_MISMATCH'; end if;
  if v_snapshot.status<>p_expected_status then raise exception 'REPORTING_SNAPSHOT_CONFLICT'; end if;
  if p_operation='submit' and p_expected_status='draft' then v_next:='submitted';
  elsif p_operation='return' and p_expected_status='submitted' then v_next:='returned';
  elsif p_operation='resubmit' and p_expected_status='returned' then v_next:='submitted';
  elsif p_operation='freeze' and p_expected_status='submitted' then v_next:='frozen';
  elsif p_operation='supersede' and p_expected_status='frozen' then v_next:='superseded';
  else raise exception 'REPORTING_TRANSITION_INVALID'; end if;
  if p_operation in ('return','freeze','supersede') and p_actor_business_role<>'pmo' then raise exception 'REPORTING_ROLE_FORBIDDEN'; end if;
  if p_operation in ('submit','resubmit') and p_actor_business_role not in ('pm','operations','pmo') then raise exception 'REPORTING_ROLE_FORBIDDEN'; end if;
  if p_operation='return' and (nullif(trim(p_reason),'') is null or p_due_at is null or p_due_at<=now()) then raise exception 'REPORTING_RETURN_REASON_DUE_REQUIRED'; end if;
  if p_operation in ('freeze','return') and v_snapshot.submitted_to_user_id<>p_actor_user_id then raise exception 'REPORTING_RECIPIENT_MISMATCH'; end if;
  update public.reporting_snapshots set
    status=v_next,
    submitted_by=case when p_operation in ('submit','resubmit') then p_actor_user_id else submitted_by end,
    submitted_at=case when p_operation in ('submit','resubmit') then now() else submitted_at end,
    returned_by=case when p_operation='return' then p_actor_user_id else returned_by end,
    returned_at=case when p_operation='return' then now() else returned_at end,
    return_reason=case when p_operation='return' then trim(p_reason) when p_operation='resubmit' then null else return_reason end,
    correction_due_at=case when p_operation='return' then p_due_at when p_operation='resubmit' then null else correction_due_at end,
    frozen_by=case when p_operation='freeze' then p_actor_user_id else frozen_by end,
    frozen_at=case when p_operation='freeze' then now() else frozen_at end,
    updated_at=now()
  where id=p_snapshot_id returning * into v_snapshot;
  if p_operation='supersede' then
    update public.reporting_snapshots set superseded_by_snapshot_id = v_snapshot.id
    where id=p_snapshot_id returning * into v_snapshot;
  end if;
  update public.reporting_receipts set status=case p_operation when 'return' then 'returned' when 'freeze' then 'frozen' when 'supersede' then 'superseded' else 'pending' end,
    response=case when p_operation='return' then trim(p_reason) else response end,
    responded_at=case when p_operation in ('return','freeze','supersede') then now() else responded_at end,updated_at=now()
  where snapshot_id=p_snapshot_id;
  insert into public.reporting_snapshot_events(snapshot_id,org_id,subject_scope,subject_id,data_class,event_type,from_status,to_status,reason,due_at,actor_user_id,actor_business_role,request_id)
  values(p_snapshot_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_operation,p_expected_status,v_next,nullif(trim(p_reason),''),p_due_at,p_actor_user_id,p_actor_business_role,p_request_id);
  return to_jsonb(v_snapshot);
end;
$$;

create or replace function public.transition_governance_meeting_tx(
  p_meeting_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_expected_status text,
  p_operation text,
  p_reason text,
  p_rescheduled_at timestamptz,
  p_impacted_decision_ids jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting public.governance_meetings%rowtype;
  v_next text;
  v_snapshot jsonb;
begin
  select * into v_meeting from public.governance_meetings where id=p_meeting_id for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_meeting.org_id<>p_org_id or v_meeting.subject_scope<>p_subject_scope or v_meeting.subject_id<>p_subject_id then raise exception 'MEETING_SCOPE_MISMATCH'; end if;
  if v_meeting.data_class<>p_data_class then raise exception 'MEETING_DATA_CLASS_MISMATCH'; end if;
  if v_meeting.status<>p_expected_status then raise exception 'MEETING_CONFLICT'; end if;
  if p_actor_business_role<>'pmo' then raise exception 'MEETING_ROLE_FORBIDDEN'; end if;

  if p_operation='freeze_agenda' and p_expected_status='scheduled' then v_next:='agenda_frozen';
  elsif p_operation='start' and p_expected_status='agenda_frozen' then v_next:='in_progress';
  elsif p_operation='start_effect_review' and p_expected_status='actions_pending' then v_next:='effect_review';
  elsif p_operation='close' and p_expected_status='effect_review' then v_next:='closed';
  elsif p_operation='cancel' and p_expected_status in ('scheduled','agenda_frozen','postponed') then v_next:='cancelled';
  elsif p_operation='postpone' and p_expected_status in ('scheduled','agenda_frozen') then v_next:='postponed';
  elsif p_operation='reschedule' and p_expected_status='postponed' then v_next:='scheduled';
  else raise exception 'MEETING_TRANSITION_INVALID'; end if;

  if p_operation in ('cancel','postpone') and nullif(trim(p_reason),'') is null then raise exception 'MEETING_REASON_REQUIRED'; end if;
  if p_operation in ('postpone','reschedule') and (p_rescheduled_at is null or p_rescheduled_at<=now()) then raise exception 'MEETING_RESCHEDULE_TIME_REQUIRED'; end if;
  if p_operation='freeze_agenda' then
    if jsonb_array_length(v_meeting.agenda)=0 then raise exception 'MEETING_AGENDA_REQUIRED'; end if;
    if exists (
      select 1 from jsonb_array_elements_text(v_meeting.reporting_snapshot_ids) source_id
      left join public.reporting_snapshots snapshot on snapshot.id=source_id::uuid
      where snapshot.id is null or snapshot.org_id<>p_org_id or snapshot.data_class<>p_data_class
        or snapshot.status<>'frozen' or snapshot.subject_scope<>p_subject_scope or snapshot.subject_id<>p_subject_id
    ) then raise exception 'MEETING_FROZEN_REPORTING_SNAPSHOT_REQUIRED'; end if;
    select jsonb_build_object(
      'frozen_at',now(),
      'reporting_snapshots',coalesce(jsonb_agg(to_jsonb(snapshot) order by snapshot.period_end),'[]'::jsonb),
      'agenda',v_meeting.agenda
    ) into v_snapshot
    from public.reporting_snapshots snapshot
    where snapshot.id in (select value::uuid from jsonb_array_elements_text(v_meeting.reporting_snapshot_ids));
  end if;
  if p_operation='start' and exists (
    select 1 from public.governance_meeting_delegates delegate
    where delegate.meeting_id=p_meeting_id and delegate.status='active'
      and (delegate.valid_from>v_meeting.scheduled_at or delegate.valid_until<v_meeting.scheduled_at)
  ) then raise exception 'MEETING_DELEGATION_NOT_VALID_AT_MEETING_TIME'; end if;
  if p_operation='start_effect_review' and exists (
    select 1 from public.meeting_review_plans plan where plan.meeting_id=p_meeting_id and plan.status not in ('planned','due','submitted','accepted','rejected','closed')
  ) then raise exception 'MEETING_REVIEW_PLAN_INVALID'; end if;
  if p_operation='close' and exists (
    select 1 from public.meeting_review_plans plan where plan.meeting_id=p_meeting_id and plan.status not in ('accepted','closed')
  ) then raise exception 'MEETING_EFFECT_REVIEW_REQUIRED'; end if;

  update public.governance_meetings set
    status=v_next,
    agenda_frozen_at=case when p_operation='freeze_agenda' then now() when p_operation='reschedule' then null else agenda_frozen_at end,
    agenda_frozen_by=case when p_operation='freeze_agenda' then p_actor_user_id when p_operation='reschedule' then null else agenda_frozen_by end,
    evidence_snapshot=case when p_operation='freeze_agenda' then coalesce(v_snapshot,'{}'::jsonb) when p_operation='reschedule' then '{}'::jsonb else evidence_snapshot end,
    cancellation_reason=case when p_operation='cancel' then trim(p_reason) else cancellation_reason end,
    postponed_reason=case when p_operation='postpone' then trim(p_reason) when p_operation='reschedule' then null else postponed_reason end,
    rescheduled_at=case when p_operation in ('postpone','reschedule') then p_rescheduled_at else rescheduled_at end,
    scheduled_at=case when p_operation='reschedule' then p_rescheduled_at else scheduled_at end,
    impacted_decision_ids=case when p_operation in ('cancel','postpone') then coalesce(p_impacted_decision_ids,'[]'::jsonb) else impacted_decision_ids end,
    effect_reviewed_at=case when p_operation='close' then now() else effect_reviewed_at end,
    closed_by=case when p_operation='close' then p_actor_user_id else closed_by end,
    ended_at=case when p_operation in ('cancel','close') then now() else ended_at end,
    updated_at=now()
  where id=p_meeting_id returning * into v_meeting;
  return to_jsonb(v_meeting);
end;
$$;

create or replace function public.record_governance_meeting_outcome_tx(
  p_meeting_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_expected_status text,
  p_minutes text,
  p_conclusions jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_meeting public.governance_meetings%rowtype;
  v_conclusion jsonb;
  v_type text;
  v_key text;
  v_title text;
  v_brief jsonb;
  v_brief_id uuid;
  v_action_id uuid;
  v_output_id uuid;
  v_review_id uuid;
  v_output_count integer := 0;
  v_action_ids jsonb := '[]'::jsonb;
  v_brief_ids jsonb := '[]'::jsonb;
  v_review_ids jsonb := '[]'::jsonb;
begin
  select * into v_meeting from public.governance_meetings where id=p_meeting_id for update;
  if not found then raise exception 'MEETING_NOT_FOUND'; end if;
  if v_meeting.org_id<>p_org_id or v_meeting.subject_scope<>p_subject_scope or v_meeting.subject_id<>p_subject_id then raise exception 'MEETING_SCOPE_MISMATCH'; end if;
  if v_meeting.data_class<>p_data_class then raise exception 'MEETING_DATA_CLASS_MISMATCH'; end if;
  if v_meeting.status<>p_expected_status or p_expected_status not in ('in_progress','minutes_pending') then raise exception 'MEETING_CONFLICT'; end if;
  if p_actor_business_role<>'pmo' then raise exception 'MEETING_ROLE_FORBIDDEN'; end if;
  if nullif(trim(p_minutes),'') is null or jsonb_typeof(p_conclusions)<>'array' or jsonb_array_length(p_conclusions)=0 then raise exception 'MEETING_MINUTES_CONCLUSIONS_REQUIRED'; end if;

  update public.governance_meetings set status='minutes_pending',minutes=trim(p_minutes),conclusions=p_conclusions,ended_at=coalesce(ended_at,now()),updated_at=now() where id=p_meeting_id;

  for v_conclusion in select value from jsonb_array_elements(p_conclusions)
  loop
    v_output_count := v_output_count + 1;
    v_type := v_conclusion->>'type';
    v_key := coalesce(nullif(v_conclusion->>'conclusion_key',''),v_output_count::text);
    v_title := nullif(trim(v_conclusion->>'title'),'');
    v_brief_id := null; v_action_id := null;
    if v_type not in ('decision','action','no_action') or v_title is null or nullif(v_conclusion->>'review_at','') is null then
      raise exception 'MEETING_CONCLUSION_OUTPUT_REQUIRED';
    end if;
    if v_type='decision' then
      v_brief := v_conclusion->'decision_brief';
      if jsonb_typeof(v_brief)<>'object' or nullif(v_brief->>'decisionType','') is null or jsonb_array_length(coalesce(v_brief->'options','[]'::jsonb))<2 or jsonb_array_length(coalesce(v_brief->'evidence','[]'::jsonb))=0 then
        raise exception 'MEETING_DECISION_BRIEF_INVALID';
      end if;
      if nullif(v_brief->>'reportingSnapshotId','') is not null and not exists (
        select 1 from public.reporting_snapshots snapshot
        where snapshot.id=(v_brief->>'reportingSnapshotId')::uuid and snapshot.org_id=p_org_id
          and snapshot.subject_scope=p_subject_scope and snapshot.subject_id=p_subject_id
          and snapshot.data_class=p_data_class and snapshot.status='frozen'
      ) then raise exception 'MEETING_REPORTING_SNAPSHOT_SCOPE_INVALID'; end if;
      if nullif(v_brief->>'committeeId','') is not null and not exists (
        select 1 from public.decision_committees committee
        where committee.id=(v_brief->>'committeeId')::uuid and committee.org_id=p_org_id
          and committee.subject_scope=p_subject_scope and committee.subject_id=p_subject_id
          and committee.data_class=p_data_class and committee.status='active'
          and committee.valid_from<=now() and (committee.valid_until is null or committee.valid_until>=now())
      ) then raise exception 'MEETING_COMMITTEE_SCOPE_INVALID'; end if;
      if nullif(v_brief->>'committeeId','') is not null and not exists (
        select 1 from public.decision_committees committee
        where committee.id=(v_brief->>'committeeId')::uuid
          and committee.decision_levels ? coalesce(v_brief->>'decisionLevel','executive')
      ) then raise exception 'DECISION_COMMITTEE_LEVEL_FORBIDDEN'; end if;
      insert into public.decision_briefs(
        org_id,subject_scope,subject_id,project_id,data_class,status,workflow_status,title,decision_question,
        options,recommendation,evidence,impact_summary,requested_decision_at,execution_due_at,acceptance_criteria,
        meeting_id,reporting_snapshot_id,source_signal_ids,recipient_user_ids,created_by,updated_by,
        decision_type,decision_mode,decision_level,authority_mode,committee_id,structured_input,emergency_trigger,
        response_sla_minutes,definition_version,downstream_action_templates,review_metrics,revocation_conditions,review_plan
      ) values (
        p_org_id,p_subject_scope,p_subject_id,case when p_subject_scope='project' then p_subject_id::uuid else null end,p_data_class,'draft','draft',
        v_brief->>'title',v_brief->>'decisionQuestion',v_brief->'options',v_brief->>'recommendation',v_brief->'evidence',v_brief->>'impactSummary',
        (v_brief->>'requestedDecisionAt')::timestamptz,(v_brief->>'executionDueAt')::timestamptz,v_brief->>'acceptanceCriteria',
        p_meeting_id,nullif(v_brief->>'reportingSnapshotId','')::uuid,coalesce(v_brief->'sourceSignalIds','[]'::jsonb),coalesce(v_brief->'recipientUserIds','[]'::jsonb),
        p_actor_user_id,p_actor_user_id,v_brief->>'decisionType',coalesce(v_brief->>'decisionMode','routine'),coalesce(v_brief->>'decisionLevel','executive'),
        coalesce(v_brief->>'authorityMode','individual'),nullif(v_brief->>'committeeId','')::uuid,coalesce(v_brief->'structuredInput','{}'::jsonb),nullif(v_brief->>'emergencyTrigger',''),
        nullif(v_brief->>'responseSlaMinutes','')::integer,coalesce(v_brief->>'definitionVersion','P21-v1'),coalesce(v_brief->'downstreamActionTemplates','[]'::jsonb),
        coalesce(v_brief->'reviewMetrics','[]'::jsonb),coalesce(v_brief->'revocationConditions','[]'::jsonb),coalesce(v_brief->'reviewPlan','{}'::jsonb)
      ) returning id into v_brief_id;
      v_brief_ids := v_brief_ids||jsonb_build_array(v_brief_id);
      insert into public.decision_events(brief_id,event_type,to_status,actor_user_id,actor_business_role,detail,request_id)
      values(v_brief_id,'created_from_meeting','draft',p_actor_user_id,p_actor_business_role,jsonb_build_object('meeting_id',p_meeting_id,'conclusion_key',v_key),p_request_id);
    elsif v_type='action' then
      if nullif(v_conclusion->>'owner_user_id','') is null or nullif(v_conclusion->>'owner_business_role','') is null or nullif(v_conclusion->>'due_at','') is null or nullif(v_conclusion->>'acceptance_criteria','') is null then
        raise exception 'MEETING_ACTION_INPUT_REQUIRED';
      end if;
      if not exists (
        select 1 from public.user_business_roles role_row
        where role_row.org_id=p_org_id and role_row.subject_scope=p_subject_scope and role_row.subject_id=p_subject_id
          and role_row.user_id=(v_conclusion->>'owner_user_id')::uuid and role_row.business_role=v_conclusion->>'owner_business_role'
          and role_row.status='active' and role_row.valid_from<=now() and (role_row.valid_until is null or role_row.valid_until>=now())
      ) then raise exception 'MEETING_ACTION_OWNER_SCOPE_INVALID'; end if;
      insert into public.unified_action_items(
        source_type,source_id,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
        org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key
      ) values (
        'governance',p_meeting_id::text,v_title,
        coalesce((select name from public.app_users where id=(v_conclusion->>'owner_user_id')::uuid),v_conclusion->>'owner_business_role'),
        (v_conclusion->>'due_at')::date,'assigned','P1',p_actor_user_id,coalesce((select name from public.app_users where id=p_actor_user_id),'PMO'),
        jsonb_build_object('meeting_id',p_meeting_id,'conclusion_key',v_key,'owner_business_role',v_conclusion->>'owner_business_role','data_class',p_data_class),
        p_org_id,p_subject_scope,p_subject_id,case when p_subject_scope='project' then p_subject_id::uuid else null end,
        (v_conclusion->>'owner_user_id')::uuid,v_conclusion->>'acceptance_criteria','meeting:'||p_meeting_id::text||':conclusion:'||v_key
      ) on conflict (idempotency_key) where idempotency_key is not null
        do update set title=excluded.title,owner_user_id=excluded.owner_user_id,due_date=excluded.due_date,acceptance_criteria=excluded.acceptance_criteria,updated_at=now()
      returning id into v_action_id;
      v_action_ids := v_action_ids||jsonb_build_array(v_action_id);
    else
      if nullif(trim(v_conclusion->>'rationale'),'') is null then raise exception 'MEETING_NO_ACTION_REASON_REQUIRED'; end if;
    end if;

    insert into public.meeting_conclusion_outputs(
      meeting_id,org_id,subject_scope,subject_id,data_class,conclusion_key,conclusion_type,title,rationale,
      decision_brief_id,action_item_id,review_at,created_by
    ) values (
      p_meeting_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,v_key,v_type,v_title,nullif(trim(v_conclusion->>'rationale'),''),
      v_brief_id,v_action_id,(v_conclusion->>'review_at')::timestamptz,p_actor_user_id
    ) returning id into v_output_id;
    insert into public.meeting_review_plans(
      meeting_id,conclusion_output_id,org_id,subject_scope,subject_id,data_class,owner_user_id,owner_business_role,review_at,review_metrics
    ) values (
      p_meeting_id,v_output_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,
      coalesce(nullif(v_conclusion->>'owner_user_id','')::uuid,p_actor_user_id),coalesce(nullif(v_conclusion->>'owner_business_role',''),'pmo'),
      (v_conclusion->>'review_at')::timestamptz,case when v_type='decision' then coalesce(v_brief->'reviewMetrics','[]'::jsonb) else coalesce(v_conclusion->'review_metrics','[]'::jsonb) end
    ) returning id into v_review_id;
    v_review_ids := v_review_ids||jsonb_build_array(v_review_id);
  end loop;
  if v_output_count<>jsonb_array_length(p_conclusions) then raise exception 'MEETING_CONCLUSION_OUTPUT_REQUIRED'; end if;
  update public.governance_meetings set status='actions_pending',action_item_ids=v_action_ids,decision_brief_ids=v_brief_ids,review_plan_ids=v_review_ids,updated_at=now()
  where id=p_meeting_id returning * into v_meeting;
  return jsonb_build_object('meeting',to_jsonb(v_meeting),'output_count',v_output_count,'action_item_ids',v_action_ids,'decision_brief_ids',v_brief_ids,'review_plan_ids',v_review_ids);
end;
$$;

create or replace function public.p21_decision_authority_type(
  p_brief_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text
) returns text
language plpgsql
security invoker
set search_path = ''
stable
as $$
declare
  v_brief public.decision_briefs%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id;
  if not found then return null; end if;
  if p_actor_business_role not in ('ceo','sponsor') then return null; end if;
  if exists (
    select 1 from public.business_role_recusals recusal
    where recusal.org_id=v_brief.org_id and recusal.subject_scope=v_brief.subject_scope and recusal.subject_id=v_brief.subject_id
      and recusal.user_id=p_actor_user_id and recusal.business_role=p_actor_business_role and recusal.status='active'
      and recusal.valid_from<=now() and (recusal.valid_until is null or recusal.valid_until>=now())
  ) then return null; end if;
  if v_brief.authority_mode='committee' then
    if exists (
      select 1 from public.decision_committee_members member
      join public.decision_committees committee on committee.id=member.committee_id
      where member.committee_id=v_brief.committee_id and member.user_id=p_actor_user_id and member.business_role=p_actor_business_role
        and member.member_role in ('chair','voter') and member.status='active'
        and member.org_id=v_brief.org_id and member.subject_scope=v_brief.subject_scope and member.subject_id=v_brief.subject_id and member.data_class=v_brief.data_class
        and member.valid_from<=now() and (member.valid_until is null or member.valid_until>=now())
        and committee.status='active' and committee.valid_from<=now() and (committee.valid_until is null or committee.valid_until>=now())
    ) then return 'committee'; end if;
    return null;
  end if;
  if v_brief.decision_target_user_id=p_actor_user_id then return 'direct'; end if;
  if exists (
    select 1 from public.user_business_roles role_row
    where role_row.user_id=p_actor_user_id and role_row.business_role=p_actor_business_role
      and role_row.org_id=v_brief.org_id and role_row.subject_scope=v_brief.subject_scope and role_row.subject_id=v_brief.subject_id
      and role_row.delegated_from_user_id=v_brief.decision_target_user_id and role_row.status='active'
      and role_row.valid_from<=now() and role_row.valid_until is not null and role_row.valid_until>=now()
  ) or exists (
    select 1 from public.business_reporting_relationships relationship
    where relationship.org_id=v_brief.org_id and relationship.subject_scope=v_brief.subject_scope and relationship.subject_id=v_brief.subject_id
      and relationship.from_user_id=v_brief.decision_target_user_id and relationship.to_user_id=p_actor_user_id
      and relationship.to_business_role=p_actor_business_role and relationship.relationship_type='delegates_to' and relationship.status='active'
      and relationship.valid_from<=now() and relationship.valid_until is not null and relationship.valid_until>=now()
  ) then return 'delegate'; end if;
  return null;
end;
$$;

create or replace function public.decide_decision_brief_tx(
  p_brief_id uuid,
  p_expected_status text,
  p_outcome text,
  p_selected_option_key text,
  p_rationale text,
  p_conditions text,
  p_effective_at timestamptz,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_decision public.decisions%rowtype;
  v_authority text;
  v_definition public.decision_type_definitions%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status<>p_expected_status or v_brief.workflow_status<>'pending_decision' then raise exception 'DECISION_BRIEF_CONFLICT'; end if;
  if v_brief.authority_mode='committee' then raise exception 'DECISION_COMMITTEE_VOTE_REQUIRED'; end if;
  v_authority := public.p21_decision_authority_type(p_brief_id,p_actor_user_id,p_actor_business_role);
  if v_authority is null or v_authority not in ('direct','delegate') then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  select * into v_definition from public.decision_type_definitions definition
  where (definition.org_id=v_brief.org_id or definition.org_id is null)
    and definition.decision_type=v_brief.decision_type and definition.decision_level=v_brief.decision_level
    and definition.version=v_brief.definition_version and definition.status='active'
    and definition.effective_from<=now() and (definition.effective_until is null or definition.effective_until>=now())
  order by (definition.org_id is not null) desc limit 1;
  if not found then raise exception 'DECISION_DEFINITION_NOT_ACTIVE'; end if;
  if not (v_definition.allowed_decision_roles ? p_actor_business_role) then raise exception 'DECISION_LEVEL_ROLE_FORBIDDEN'; end if;
  if p_outcome not in ('approved','rejected','conditional','deferred') or nullif(trim(p_rationale),'') is null then raise exception 'DECISION_OUTCOME_INVALID'; end if;
  if p_outcome<>'deferred' and not exists (
    select 1 from jsonb_array_elements(v_brief.options) option_value where option_value->>'key'=p_selected_option_key
  ) then raise exception 'DECISION_OPTION_NOT_FOUND'; end if;
  if p_outcome='conditional' and nullif(trim(p_conditions),'') is null then raise exception 'DECISION_CONDITIONS_REQUIRED'; end if;
  insert into public.decisions(
    brief_id,org_id,outcome,selected_option_key,rationale,conditions,effective_at,decided_by,decided_business_role,request_id,
    decision_type,decision_level,authority_type,delegated_from_user_id
  ) values (
    p_brief_id,v_brief.org_id,p_outcome,nullif(p_selected_option_key,''),trim(p_rationale),nullif(trim(p_conditions),''),p_effective_at,
    p_actor_user_id,p_actor_business_role,p_request_id,v_brief.decision_type,v_brief.decision_level,v_authority,
    case when v_authority='delegate' then v_brief.decision_target_user_id else null end
  ) returning * into v_decision;
  update public.decision_briefs set status='decided',workflow_status='decided',decided_at=now(),updated_at=now(),updated_by=p_actor_user_id,version=version+1 where id=p_brief_id;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,'decide','pending_decision','decided',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('decision_id',v_decision.id,'outcome',p_outcome,'authority_type',v_authority,'definition_version',v_brief.definition_version),p_request_id);
  return jsonb_build_object('brief',(select to_jsonb(brief) from public.decision_briefs brief where brief.id=p_brief_id),'decision',to_jsonb(v_decision));
end;
$$;

create or replace function public.request_decision_evidence_tx(
  p_brief_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_required_items jsonb,
  p_reason text,
  p_due_at timestamptz,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_request public.decision_evidence_requests%rowtype;
  v_authority text;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  if v_brief.workflow_status<>'pending_decision' then raise exception 'DECISION_BRIEF_CONFLICT'; end if;
  v_authority := public.p21_decision_authority_type(p_brief_id,p_actor_user_id,p_actor_business_role);
  if v_authority is null then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  if jsonb_typeof(p_required_items)<>'array' or jsonb_array_length(p_required_items)=0 or nullif(trim(p_reason),'') is null or p_due_at<=now() then raise exception 'DECISION_EVIDENCE_REQUEST_INVALID'; end if;
  if v_brief.submitted_by is null then raise exception 'DECISION_EVIDENCE_ASSIGNEE_REQUIRED'; end if;
  insert into public.decision_evidence_requests(
    brief_id,org_id,subject_scope,subject_id,data_class,requested_by,requested_business_role,
    assigned_to_user_id,required_items,reason,due_at,request_id
  ) values (
    p_brief_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_actor_user_id,p_actor_business_role,
    v_brief.submitted_by,p_required_items,trim(p_reason),p_due_at,p_request_id
  ) returning * into v_request;
  update public.decision_briefs set workflow_status='evidence_required',updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,'request_evidence','pending_decision','evidence_required',p_actor_user_id,p_actor_business_role,
    jsonb_build_object('evidence_request_id',v_request.id,'required_items',p_required_items,'due_at',p_due_at,'authority_type',v_authority),p_request_id);
  return jsonb_build_object('brief',(select to_jsonb(brief) from public.decision_briefs brief where brief.id=p_brief_id),'evidence_request',to_jsonb(v_request));
end;
$$;

create or replace function public.respond_decision_evidence_tx(
  p_brief_id uuid,
  p_request_id_value uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_operation text,
  p_response text,
  p_evidence jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_operation_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_request public.decision_evidence_requests%rowtype;
  v_authority text;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  select * into v_request from public.decision_evidence_requests where id=p_request_id_value and brief_id=p_brief_id for update;
  if not found then raise exception 'DECISION_EVIDENCE_REQUEST_NOT_FOUND'; end if;
  if p_operation='submit' then
    if v_brief.workflow_status<>'evidence_required' or v_request.status not in ('open','rejected') then raise exception 'DECISION_EVIDENCE_CONFLICT'; end if;
    if v_request.assigned_to_user_id<>p_actor_user_id or p_actor_business_role<>'pmo' then raise exception 'DECISION_EVIDENCE_ASSIGNEE_FORBIDDEN'; end if;
    if nullif(trim(p_response),'') is null or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0 then raise exception 'DECISION_EVIDENCE_RESPONSE_REQUIRED'; end if;
    update public.decision_evidence_requests set status='submitted',response=trim(p_response),evidence=p_evidence,submitted_at=now(),updated_at=now() where id=p_request_id_value returning * into v_request;
    insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
    values(p_brief_id,'resubmit_evidence','evidence_required','evidence_required',p_actor_user_id,p_actor_business_role,jsonb_build_object('evidence_request_id',v_request.id,'evidence_count',jsonb_array_length(p_evidence)),p_operation_request_id);
  elsif p_operation in ('accept','reject') then
    if v_request.status<>'submitted' then raise exception 'DECISION_EVIDENCE_CONFLICT'; end if;
    v_authority := public.p21_decision_authority_type(p_brief_id,p_actor_user_id,p_actor_business_role);
    if v_authority is null then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
    if nullif(trim(p_response),'') is null then raise exception 'DECISION_EVIDENCE_REVIEW_COMMENT_REQUIRED'; end if;
    update public.decision_evidence_requests set status=case when p_operation='accept' then 'accepted' else 'rejected' end,
      reviewed_by=p_actor_user_id,reviewed_at=now(),review_comment=trim(p_response),updated_at=now()
    where id=p_request_id_value returning * into v_request;
    update public.decision_briefs set workflow_status=case when p_operation='accept' then 'pending_decision' else 'evidence_required' end,
      evidence=case when p_operation='accept' then evidence||v_request.evidence else evidence end,
      updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id;
    insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
    values(p_brief_id,case when p_operation='accept' then 'accept_evidence' else 'reject_evidence' end,'evidence_required',case when p_operation='accept' then 'pending_decision' else 'evidence_required' end,
      p_actor_user_id,p_actor_business_role,jsonb_build_object('evidence_request_id',v_request.id,'authority_type',v_authority,'comment',trim(p_response)),p_operation_request_id);
  else raise exception 'DECISION_EVIDENCE_OPERATION_INVALID'; end if;
  return jsonb_build_object('brief',(select to_jsonb(brief) from public.decision_briefs brief where brief.id=p_brief_id),'evidence_request',to_jsonb(v_request));
end;
$$;

create or replace function public.cast_decision_vote_tx(
  p_brief_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_vote text,
  p_selected_option_key text,
  p_rationale text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_committee public.decision_committees%rowtype;
  v_member public.decision_committee_members%rowtype;
  v_vote public.decision_votes%rowtype;
  v_decision public.decisions%rowtype;
  v_vote_count integer;
  v_approve_count integer;
  v_reject_count integer;
  v_selected_option text;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  if v_brief.authority_mode<>'committee' or v_brief.workflow_status<>'pending_decision' then raise exception 'DECISION_COMMITTEE_VOTE_CONFLICT'; end if;
  select * into v_committee from public.decision_committees
  where id=v_brief.committee_id and org_id=p_org_id and subject_scope=p_subject_scope and subject_id=p_subject_id and data_class=p_data_class
    and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now()) for update;
  if not found then raise exception 'DECISION_COMMITTEE_NOT_ACTIVE'; end if;
  if not (v_committee.decision_levels ? v_brief.decision_level) then raise exception 'DECISION_COMMITTEE_LEVEL_FORBIDDEN'; end if;
  select * into v_member from public.decision_committee_members
  where committee_id=v_committee.id and user_id=p_actor_user_id and business_role=p_actor_business_role
    and member_role in ('chair','voter') and status='active' and valid_from<=now() and (valid_until is null or valid_until>=now());
  if not found then raise exception 'DECISION_COMMITTEE_MEMBER_FORBIDDEN'; end if;
  if exists (
    select 1 from public.business_role_recusals recusal
    where recusal.org_id=p_org_id and recusal.subject_scope=p_subject_scope and recusal.subject_id=p_subject_id
      and recusal.user_id=p_actor_user_id and recusal.business_role=p_actor_business_role and recusal.status='active'
      and recusal.valid_from<=now() and (recusal.valid_until is null or recusal.valid_until>=now())
  ) then raise exception 'DECISION_MEMBER_RECUSED'; end if;
  if p_vote not in ('approve','reject','abstain') or nullif(trim(p_rationale),'') is null then raise exception 'DECISION_VOTE_INVALID'; end if;
  if p_vote='approve' and not exists (
    select 1 from jsonb_array_elements(v_brief.options) option_value where option_value->>'key'=p_selected_option_key
  ) then raise exception 'DECISION_OPTION_NOT_FOUND'; end if;
  insert into public.decision_votes(
    brief_id,committee_id,org_id,subject_scope,subject_id,data_class,voter_user_id,voter_business_role,vote,
    selected_option_key,rationale,delegated_from_user_id,request_id
  ) values (
    p_brief_id,v_committee.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_actor_user_id,p_actor_business_role,p_vote,
    case when p_vote='approve' then p_selected_option_key else null end,trim(p_rationale),v_member.delegated_from_user_id,p_request_id
  ) on conflict(brief_id,voter_user_id,voter_business_role) do update set
    vote=excluded.vote,selected_option_key=excluded.selected_option_key,rationale=excluded.rationale,
    delegated_from_user_id=excluded.delegated_from_user_id,voted_at=now(),updated_at=now(),request_id=excluded.request_id
  returning * into v_vote;
  select count(*) into v_vote_count from public.decision_votes where brief_id=p_brief_id;
  select selected_option_key,count(*) into v_selected_option,v_approve_count
  from public.decision_votes where brief_id=p_brief_id and vote='approve'
  group by selected_option_key order by count(*) desc,selected_option_key limit 1;
  select count(*) into v_reject_count from public.decision_votes where brief_id=p_brief_id and vote='reject';
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,case when p_vote='abstain' then 'committee_abstain' else 'committee_vote' end,'pending_decision','pending_decision',
    p_actor_user_id,p_actor_business_role,jsonb_build_object('vote',p_vote,'vote_count',v_vote_count,'quorum',v_committee.quorum,'selected_option_key',v_vote.selected_option_key),p_request_id);
  if v_vote_count>=v_committee.quorum and (coalesce(v_approve_count,0)>=v_committee.min_approvals or v_reject_count>=v_committee.min_approvals) then
    insert into public.decisions(
      brief_id,org_id,outcome,selected_option_key,rationale,effective_at,decided_by,decided_business_role,request_id,
      decision_type,decision_level,authority_type,committee_id,quorum_snapshot
    ) values (
      p_brief_id,p_org_id,case when coalesce(v_approve_count,0)>=v_committee.min_approvals then 'approved' else 'rejected' end,
      case when coalesce(v_approve_count,0)>=v_committee.min_approvals then v_selected_option else v_brief.recommendation end,
      '决策委员会依法定人数完成表决',now(),p_actor_user_id,p_actor_business_role,p_request_id,
      v_brief.decision_type,v_brief.decision_level,'committee',v_committee.id,
      jsonb_build_object('committee_id',v_committee.id,'quorum',v_committee.quorum,'min_approvals',v_committee.min_approvals,'vote_count',v_vote_count,'approve_count',coalesce(v_approve_count,0),'reject_count',v_reject_count)
    ) returning * into v_decision;
    update public.decision_briefs set status='decided',workflow_status='decided',decided_at=now(),updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id;
    insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
    values(p_brief_id,'committee_decide','pending_decision','decided',p_actor_user_id,p_actor_business_role,jsonb_build_object('decision_id',v_decision.id,'committee_id',v_committee.id,'quorum_snapshot',v_decision.quorum_snapshot),p_request_id);
  end if;
  return jsonb_build_object('vote',to_jsonb(v_vote),'decision',case when v_decision.id is null then null else to_jsonb(v_decision) end,'brief',(select to_jsonb(brief) from public.decision_briefs brief where brief.id=p_brief_id));
end;
$$;

create or replace function public.record_decision_authority_response_tx(
  p_brief_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_response_type text,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_authority text;
  v_response public.decision_authority_responses%rowtype;
  v_existing public.decision_authority_responses%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  if v_brief.workflow_status not in ('pending_decision','evidence_required') then raise exception 'DECISION_AUTHORITY_RESPONSE_CONFLICT'; end if;
  v_authority := public.p21_decision_authority_type(p_brief_id,p_actor_user_id,p_actor_business_role);
  if v_authority is null then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  if p_response_type not in ('declined','abstained','recused') or nullif(trim(p_reason),'') is null then raise exception 'DECISION_AUTHORITY_RESPONSE_INVALID'; end if;
  if p_response_type='abstained' and v_brief.authority_mode<>'committee' then raise exception 'DECISION_ABSTAIN_COMMITTEE_ONLY'; end if;
  if nullif(trim(p_request_id),'') is not null then
    select * into v_existing from public.decision_authority_responses where brief_id=p_brief_id and request_id=p_request_id;
    if found then
      if v_existing.responder_user_id<>p_actor_user_id or v_existing.responder_business_role<>p_actor_business_role
        or v_existing.response_type<>p_response_type or v_existing.reason<>trim(p_reason) then
        raise exception 'DECISION_AUTHORITY_RESPONSE_IDEMPOTENCY_CONFLICT';
      end if;
      return to_jsonb(v_existing);
    end if;
  end if;
  insert into public.decision_authority_responses(
    brief_id,org_id,subject_scope,subject_id,data_class,responder_user_id,responder_business_role,response_type,reason,delegated_from_user_id,request_id
  ) values (
    p_brief_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,p_actor_user_id,p_actor_business_role,p_response_type,trim(p_reason),
    case when v_authority='delegate' then v_brief.decision_target_user_id else null end,p_request_id
  ) returning * into v_response;
  insert into public.decision_sla_escalations(
    brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
  ) values (
    p_brief_id,p_org_id,p_subject_scope,p_subject_id,p_data_class,'authority-declined:'||v_response.id::text,'authority_declined','pmo',trim(p_reason),now(),v_brief.submitted_by,'pmo',jsonb_build_object('response_id',v_response.id,'response_type',p_response_type)
  );
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,'authority_'||p_response_type,v_brief.workflow_status,v_brief.workflow_status,p_actor_user_id,p_actor_business_role,jsonb_build_object('response_id',v_response.id,'authority_type',v_authority,'reason',trim(p_reason)),p_request_id);
  return to_jsonb(v_response);
end;
$$;

create or replace function public.reassign_decision_authority_tx(
  p_brief_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_target_user_id uuid,
  p_target_business_role text,
  p_reason text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_brief public.decision_briefs%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  if p_actor_business_role<>'pmo' or v_brief.authority_mode<>'individual' or v_brief.workflow_status not in ('pending_decision','evidence_required') then raise exception 'DECISION_REASSIGN_FORBIDDEN'; end if;
  if p_target_business_role not in ('ceo','sponsor') or nullif(trim(p_reason),'') is null then raise exception 'DECISION_REASSIGN_INPUT_INVALID'; end if;
  if not exists (
    select 1 from public.business_reporting_relationships relationship
    where relationship.org_id=p_org_id and relationship.subject_scope=p_subject_scope and relationship.subject_id=p_subject_id
      and relationship.from_user_id=p_actor_user_id and relationship.from_business_role='pmo'
      and relationship.to_user_id=p_target_user_id and relationship.to_business_role=p_target_business_role
      and relationship.relationship_type in ('reports_to','escalates_to') and relationship.status='active'
      and relationship.valid_from<=now() and (relationship.valid_until is null or relationship.valid_until>=now())
  ) then raise exception 'DECISION_REPORTING_RELATIONSHIP_REQUIRED'; end if;
  update public.decision_briefs set decision_target_user_id=p_target_user_id,requested_decision_at=now()+make_interval(mins=>coalesce(response_sla_minutes,1440)),updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id returning * into v_brief;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,'reassign_authority',v_brief.workflow_status,v_brief.workflow_status,p_actor_user_id,p_actor_business_role,jsonb_build_object('target_user_id',p_target_user_id,'target_business_role',p_target_business_role,'reason',trim(p_reason)),p_request_id);
  return to_jsonb(v_brief);
end;
$$;

create or replace function public.distribute_decision_brief_tx(
  p_brief_id uuid,
  p_expected_status text,
  p_recipients jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_decision public.decisions%rowtype;
  v_recipient jsonb;
  v_template jsonb;
  v_receipt_id uuid;
  v_action_id uuid;
  v_first_action_id uuid;
  v_action_count integer;
  v_template_key text;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status<>p_expected_status or v_brief.workflow_status<>'decided' then raise exception 'DECISION_BRIEF_CONFLICT'; end if;
  if p_actor_business_role<>'pmo' then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  select * into v_decision from public.decisions where brief_id=p_brief_id;
  if not found then raise exception 'DECISION_NOT_FOUND'; end if;
  if jsonb_typeof(p_recipients)<>'array' or jsonb_array_length(p_recipients)=0 then raise exception 'DECISION_RECIPIENT_REQUIRED'; end if;
  for v_recipient in select value from jsonb_array_elements(p_recipients)
  loop
    if nullif(v_recipient->>'user_id','') is null or v_recipient->>'business_role' not in ('pm','operations','business_owner','finance','quality') then raise exception 'DECISION_RECIPIENT_INVALID'; end if;
    if not exists (
      select 1 from public.user_business_roles role_row
      where role_row.org_id=v_brief.org_id and role_row.subject_scope=v_brief.subject_scope and role_row.subject_id=v_brief.subject_id
        and role_row.user_id=(v_recipient->>'user_id')::uuid and role_row.business_role=v_recipient->>'business_role'
        and role_row.status='active' and role_row.valid_from<=now() and (role_row.valid_until is null or role_row.valid_until>=now())
    ) then raise exception 'DECISION_RECIPIENT_SCOPE_INVALID'; end if;
    insert into public.decision_receipts(decision_id,brief_id,recipient_user_id,recipient_business_role)
    values(v_decision.id,p_brief_id,(v_recipient->>'user_id')::uuid,v_recipient->>'business_role')
    on conflict(decision_id,recipient_user_id,recipient_business_role) do update set updated_at=now()
    returning id into v_receipt_id;
    v_action_count := 0; v_first_action_id := null;
    for v_template in select value from jsonb_array_elements(coalesce(v_brief.downstream_action_templates,'[]'::jsonb))
    loop
      if coalesce(v_template->'ownerRoles','[]'::jsonb) ? (v_recipient->>'business_role') then
        v_template_key := coalesce(nullif(v_template->>'key',''),'generic');
        insert into public.unified_action_items(
          source_type,source_id,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
          org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key,data_class
        ) values (
          'decision',p_brief_id::text,coalesce(nullif(v_template->>'title',''),'执行决策：'||v_brief.title),
          coalesce((select name from public.app_users where id=(v_recipient->>'user_id')::uuid),v_recipient->>'business_role'),
          v_brief.execution_due_at::date,'assigned','P1',p_actor_user_id,coalesce((select name from public.app_users where id=p_actor_user_id),'PMO'),
          jsonb_build_object('decision_id',v_decision.id,'brief_id',p_brief_id,'receipt_id',v_receipt_id,'template_key',v_template_key,'decision_type',v_brief.decision_type,'review_metrics',v_brief.review_metrics,'revocation_conditions',v_brief.revocation_conditions,'data_class',v_brief.data_class),
          v_brief.org_id,v_brief.subject_scope,v_brief.subject_id,v_brief.project_id,(v_recipient->>'user_id')::uuid,
          coalesce(nullif(v_template->>'acceptanceCriteria',''),v_brief.acceptance_criteria),
          'decision:'||p_brief_id::text||':'||(v_recipient->>'user_id')||':'||(v_recipient->>'business_role')||':'||v_template_key,v_brief.data_class
        ) on conflict(idempotency_key) where idempotency_key is not null
          do update set owner_user_id=excluded.owner_user_id,due_date=excluded.due_date,acceptance_criteria=excluded.acceptance_criteria,metadata=excluded.metadata,updated_at=now()
        returning id into v_action_id;
        v_action_count := v_action_count+1;
        v_first_action_id := coalesce(v_first_action_id,v_action_id);
        insert into public.decision_execution_actions(
          brief_id,decision_id,receipt_id,action_item_id,org_id,subject_scope,subject_id,data_class,template_key,template_version
        ) values (
          p_brief_id,v_decision.id,v_receipt_id,v_action_id,v_brief.org_id,v_brief.subject_scope,v_brief.subject_id,v_brief.data_class,v_template_key,v_brief.definition_version
        ) on conflict(receipt_id,action_item_id) do nothing;
      end if;
    end loop;
    if v_action_count=0 then
      insert into public.unified_action_items(
        source_type,source_id,title,owner,due_date,status,priority,created_by,created_by_name,metadata,
        org_id,subject_scope,subject_id,project_id,owner_user_id,acceptance_criteria,idempotency_key,data_class
      ) values (
        'decision',p_brief_id::text,'执行决策：'||v_brief.title,
        coalesce((select name from public.app_users where id=(v_recipient->>'user_id')::uuid),v_recipient->>'business_role'),
        v_brief.execution_due_at::date,'assigned','P1',p_actor_user_id,coalesce((select name from public.app_users where id=p_actor_user_id),'PMO'),
        jsonb_build_object('decision_id',v_decision.id,'brief_id',p_brief_id,'receipt_id',v_receipt_id,'template_key','generic','decision_type',v_brief.decision_type,'data_class',v_brief.data_class),
        v_brief.org_id,v_brief.subject_scope,v_brief.subject_id,v_brief.project_id,(v_recipient->>'user_id')::uuid,v_brief.acceptance_criteria,
        'decision:'||p_brief_id::text||':'||(v_recipient->>'user_id')||':'||(v_recipient->>'business_role')||':generic',v_brief.data_class
      ) on conflict(idempotency_key) where idempotency_key is not null
        do update set owner_user_id=excluded.owner_user_id,due_date=excluded.due_date,acceptance_criteria=excluded.acceptance_criteria,metadata=excluded.metadata,updated_at=now()
      returning id into v_action_id;
      v_first_action_id := v_action_id;
      insert into public.decision_execution_actions(
        brief_id,decision_id,receipt_id,action_item_id,org_id,subject_scope,subject_id,data_class,template_key,template_version
      ) values(p_brief_id,v_decision.id,v_receipt_id,v_action_id,v_brief.org_id,v_brief.subject_scope,v_brief.subject_id,v_brief.data_class,'generic',v_brief.definition_version)
      on conflict(receipt_id,action_item_id) do nothing;
    end if;
    update public.decision_receipts set action_item_id=v_first_action_id,updated_at=now() where id=v_receipt_id;
  end loop;
  update public.decision_briefs set status='distributed',workflow_status='translated',distributed_at=now(),updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id returning * into v_brief;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,'translate','decided','translated',p_actor_user_id,p_actor_business_role,jsonb_build_object('recipient_count',jsonb_array_length(p_recipients),'definition_version',v_brief.definition_version),p_request_id);
  return to_jsonb(v_brief);
end;
$$;

create or replace function public.transition_decision_execution_action_tx(
  p_brief_id uuid,
  p_receipt_id uuid,
  p_action_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_operation text,
  p_evidence jsonb,
  p_comment text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_receipt public.decision_receipts%rowtype;
  v_action public.unified_action_items%rowtype;
  v_expected text;
  v_next text;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.org_id<>p_org_id or v_brief.subject_scope<>p_subject_scope or v_brief.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_brief.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  select * into v_receipt from public.decision_receipts
  where id=p_receipt_id and brief_id=p_brief_id and status='acknowledged'
    and recipient_user_id=p_actor_user_id and recipient_business_role=p_actor_business_role for update;
  if not found then raise exception 'DECISION_RECEIPT_ACK_REQUIRED'; end if;
  if not exists (
    select 1 from public.decision_execution_actions map
    where map.brief_id=p_brief_id and map.receipt_id=p_receipt_id and map.action_item_id=p_action_id
      and map.org_id=p_org_id and map.subject_scope=p_subject_scope and map.subject_id=p_subject_id and map.data_class=p_data_class
  ) then raise exception 'DECISION_ACTION_NOT_FOUND'; end if;
  select * into v_action from public.unified_action_items where id=p_action_id and owner_user_id=p_actor_user_id and source_type='decision' and source_id=p_brief_id::text for update;
  if not found then raise exception 'DECISION_ACTION_NOT_FOUND'; end if;
  if p_operation='start_execution' then v_expected:='accepted'; v_next:='in_progress';
  elsif p_operation='submit_execution_evidence' then v_expected:='in_progress'; v_next:='evidence_submitted';
  else raise exception 'DECISION_ACTION_OPERATION_INVALID'; end if;
  if v_action.status<>v_expected then raise exception 'DECISION_ACTION_CONFLICT:%',v_action.status; end if;
  if nullif(trim(p_comment),'') is null then raise exception 'DECISION_EXECUTION_COMMENT_REQUIRED'; end if;
  if p_operation='submit_execution_evidence' and (jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0) then raise exception 'DECISION_EXECUTION_EVIDENCE_REQUIRED'; end if;
  update public.unified_action_items set status=v_next,
    evidence=case when p_operation='submit_execution_evidence' then p_evidence else evidence end,
    close_evidence=case when p_operation='submit_execution_evidence' then (select string_agg(coalesce(item->>'title','证据')||'('||coalesce(item->>'source_type','source')||':'||coalesce(item->>'source_id','id')||')','；') from jsonb_array_elements(p_evidence) item) else close_evidence end,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('last_execution_comment',trim(p_comment),'last_execution_actor_role',p_actor_business_role),updated_at=now(),version=version+1
  where id=p_action_id returning * into v_action;
  if p_operation='start_execution' and v_brief.workflow_status='translated' then update public.decision_briefs set workflow_status='executing',updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id; end if;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,p_operation,v_brief.workflow_status,case when p_operation='start_execution' then 'executing' else 'executing' end,p_actor_user_id,p_actor_business_role,
    jsonb_build_object('receipt_id',p_receipt_id,'action_item_id',p_action_id,'comment',trim(p_comment),'evidence_count',case when jsonb_typeof(p_evidence)='array' then jsonb_array_length(p_evidence) else 0 end),p_request_id);
  return jsonb_build_object('receipt',to_jsonb(v_receipt),'action',to_jsonb(v_action),'brief',(select to_jsonb(brief) from public.decision_briefs brief where brief.id=p_brief_id));
end;
$$;

create or replace function public.acknowledge_decision_receipt_tx(
  p_brief_id uuid,
  p_receipt_id uuid,
  p_status text,
  p_response text,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_brief public.decision_briefs%rowtype;
  v_receipt public.decision_receipts%rowtype;
  v_updated integer;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  select * into v_receipt from public.decision_receipts
  where id=p_receipt_id and brief_id=p_brief_id and recipient_user_id=p_actor_user_id and recipient_business_role=p_actor_business_role for update;
  if not found then raise exception 'DECISION_RECEIPT_NOT_FOUND'; end if;
  if v_receipt.status not in ('pending','disputed') or p_status not in ('acknowledged','disputed') then raise exception 'DECISION_RECEIPT_CONFLICT'; end if;
  if nullif(trim(p_response),'') is null then raise exception 'DECISION_RECEIPT_RESPONSE_REQUIRED'; end if;
  update public.decision_receipts set status=p_status,response=trim(p_response),acknowledged_at=case when p_status='acknowledged' then now() else null end,updated_at=now()
  where id=p_receipt_id returning * into v_receipt;
  update public.unified_action_items action set
    status=case when p_status='acknowledged' then 'accepted' else 'rejected' end,
    accepted_at=case when p_status='acknowledged' then now() else accepted_at end,
    rejected_at=case when p_status='disputed' then now() else null end,
    metadata=coalesce(action.metadata,'{}'::jsonb)||jsonb_build_object('receipt_response',trim(p_response),'receipt_status',p_status),
    updated_at=now(),version=action.version+1
  where action.id in (select map.action_item_id from public.decision_execution_actions map where map.receipt_id=p_receipt_id)
    and action.owner_user_id=p_actor_user_id and action.status in ('assigned','rejected');
  get diagnostics v_updated = row_count;
  if v_updated=0 then raise exception 'DECISION_ACTION_CONFLICT'; end if;
  insert into public.decision_events(brief_id,event_type,actor_user_id,actor_business_role,detail,request_id)
  values(p_brief_id,case when p_status='acknowledged' then 'acknowledge_receipt' else 'dispute_receipt' end,p_actor_user_id,p_actor_business_role,
    jsonb_build_object('receipt_id',p_receipt_id,'action_count',v_updated,'response',trim(p_response)),p_request_id);
  return jsonb_build_object('receipt',to_jsonb(v_receipt),'actions',(select coalesce(jsonb_agg(to_jsonb(action)),'[]'::jsonb) from public.unified_action_items action join public.decision_execution_actions map on map.action_item_id=action.id where map.receipt_id=p_receipt_id));
end;
$$;

create or replace function public.close_decision_brief_tx(
  p_brief_id uuid,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_brief public.decision_briefs%rowtype;
begin
  select * into v_brief from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_brief.status<>'effect_reviewed' or v_brief.workflow_status<>'effect_review' then raise exception 'DECISION_EFFECT_REVIEW_REQUIRED'; end if;
  if p_actor_business_role<>'pmo' then raise exception 'DECISION_ROLE_FORBIDDEN'; end if;
  if not exists(select 1 from public.decision_receipts where brief_id=p_brief_id) then raise exception 'DECISION_RECEIPT_REQUIRED'; end if;
  if exists(select 1 from public.decision_receipts where brief_id=p_brief_id and status<>'acknowledged') then raise exception 'DECISION_RECEIPT_PENDING'; end if;
  if exists(
    select 1 from public.decision_receipts receipt where receipt.brief_id=p_brief_id and not exists(
      select 1 from public.decision_effect_reviews review where review.brief_id=p_brief_id and review.status='approved'
        and review.submitted_by=receipt.recipient_user_id and review.submitted_business_role=receipt.recipient_business_role
    )
  ) then raise exception 'DECISION_EFFECT_REVIEW_REQUIRED'; end if;
  if not exists(select 1 from public.decision_execution_actions where brief_id=p_brief_id) then raise exception 'DECISION_EXECUTION_ACTION_REQUIRED'; end if;
  if exists(
    select 1 from public.decision_execution_actions map
    left join public.unified_action_items action on action.id=map.action_item_id
    where map.brief_id=p_brief_id and (action.id is null or action.status<>'evidence_submitted')
  ) then raise exception 'DECISION_EXECUTION_EVIDENCE_REQUIRED'; end if;
  update public.unified_action_items action set status='closed',closed_at=now(),reviewer_user_id=p_actor_user_id,reviewer_completed_at=now(),updated_at=now(),version=action.version+1,
    effect_review=jsonb_build_object('decision_brief_id',p_brief_id,'reviewed_at',now(),'reviewed_by',p_actor_user_id)
  where action.id in (select map.action_item_id from public.decision_execution_actions map where map.brief_id=p_brief_id);
  update public.decision_briefs set status='closed',workflow_status='closed',closed_at=now(),updated_by=p_actor_user_id,updated_at=now(),version=version+1 where id=p_brief_id returning * into v_brief;
  update public.management_escalations set status='resolved',updated_at=now() where decision_brief_id=p_brief_id and status='brief_created';
  update public.decision_sla_escalations set status='resolved',resolved_at=now() where brief_id=p_brief_id and status in ('open','acknowledged');
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,request_id)
  values(p_brief_id,'close','effect_review','closed',p_actor_user_id,p_actor_business_role,p_request_id);
  return to_jsonb(v_brief);
end;
$$;

create or replace function public.reopen_decision_brief_tx(
  p_brief_id uuid,
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_triggered_condition text,
  p_reason text,
  p_evidence jsonb,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.decision_briefs%rowtype;
  v_new public.decision_briefs%rowtype;
begin
  select * into v_source from public.decision_briefs where id=p_brief_id for update;
  if not found then raise exception 'DECISION_BRIEF_NOT_FOUND'; end if;
  if v_source.org_id<>p_org_id or v_source.subject_scope<>p_subject_scope or v_source.subject_id<>p_subject_id then raise exception 'DECISION_SCOPE_MISMATCH'; end if;
  if v_source.data_class<>p_data_class then raise exception 'DECISION_DATA_CLASS_MISMATCH'; end if;
  if v_source.workflow_status<>'closed' or v_source.status<>'closed' then raise exception 'DECISION_REOPEN_CONFLICT'; end if;
  if p_actor_business_role not in ('pmo','ceo','sponsor') then raise exception 'DECISION_REOPEN_ROLE_FORBIDDEN'; end if;
  if nullif(trim(p_triggered_condition),'') is null or nullif(trim(p_reason),'') is null or jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence)=0 then raise exception 'DECISION_REOPEN_EVIDENCE_REQUIRED'; end if;
  if not (v_source.revocation_conditions ? trim(p_triggered_condition)) then raise exception 'DECISION_REOPEN_CONDITION_NOT_REGISTERED'; end if;
  insert into public.decision_briefs(
    org_id,subject_scope,subject_id,project_id,data_class,status,workflow_status,title,decision_question,options,recommendation,evidence,impact_summary,
    requested_decision_at,execution_due_at,acceptance_criteria,meeting_id,reporting_snapshot_id,source_signal_ids,recipient_user_ids,decision_target_user_id,
    version,created_by,updated_by,decision_type,decision_mode,decision_level,authority_mode,committee_id,structured_input,emergency_trigger,response_sla_minutes,
    sla_policy_version,definition_version,downstream_action_templates,review_metrics,revocation_conditions,review_plan,reopened_from_brief_id,reopened_at
  ) values (
    v_source.org_id,v_source.subject_scope,v_source.subject_id,v_source.project_id,v_source.data_class,'draft','reopened',v_source.title||' · 重新打开',v_source.decision_question,
    v_source.options,v_source.recommendation,v_source.evidence||p_evidence,v_source.impact_summary,now()+make_interval(mins=>coalesce(v_source.response_sla_minutes,1440)),
    greatest(v_source.execution_due_at,now()+interval '1 day'),v_source.acceptance_criteria,v_source.meeting_id,v_source.reporting_snapshot_id,v_source.source_signal_ids,
    v_source.recipient_user_ids,v_source.decision_target_user_id,v_source.version+1,p_actor_user_id,p_actor_user_id,v_source.decision_type,v_source.decision_mode,
    v_source.decision_level,v_source.authority_mode,v_source.committee_id,v_source.structured_input,v_source.emergency_trigger,v_source.response_sla_minutes,
    v_source.sla_policy_version,v_source.definition_version,v_source.downstream_action_templates,v_source.review_metrics,v_source.revocation_conditions,
    v_source.review_plan,p_brief_id,now()
  ) returning * into v_new;
  insert into public.decision_events(brief_id,event_type,from_status,to_status,actor_user_id,actor_business_role,detail,request_id)
  values(v_new.id,'reopen','closed','reopened',p_actor_user_id,p_actor_business_role,jsonb_build_object('source_brief_id',p_brief_id,'triggered_condition',trim(p_triggered_condition),'reason',trim(p_reason),'evidence',p_evidence),p_request_id);
  return jsonb_build_object('source_brief',to_jsonb(v_source),'reopened_brief',to_jsonb(v_new));
end;
$$;

create or replace function public.process_decision_sla_escalations_tx(
  p_now timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_decision_count integer := 0;
  v_evidence_count integer := 0;
  v_receipt_count integer := 0;
  v_execution_count integer := 0;
  v_review_count integer := 0;
  v_confirmation_count integer := 0;
begin
  with inserted as (
    insert into public.decision_sla_escalations(
      brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
    )
    select brief.id,brief.org_id,brief.subject_scope,brief.subject_id,brief.data_class,
      'decision-response:'||brief.id::text||':'||brief.requested_decision_at::text,'decision_response','executive','决策响应超过配置SLA',brief.requested_decision_at,
      brief.decision_target_user_id,case when brief.decision_level='project' then 'sponsor' else 'ceo' end,
      jsonb_build_object('workflow_status',brief.workflow_status,'decision_mode',brief.decision_mode,'decision_level',brief.decision_level,'sla_policy_version',brief.sla_policy_version)
    from public.decision_briefs brief
    where brief.workflow_status='pending_decision' and brief.requested_decision_at<p_now
    on conflict(escalation_key) do nothing returning *
  )
  insert into public.decision_events(brief_id,event_type,from_status,to_status,detail)
  select brief_id,'sla_escalated','pending_decision','pending_decision',jsonb_build_object('sla_escalation_id',id,'escalation_type',escalation_type,'due_at',due_at) from inserted;
  get diagnostics v_decision_count = row_count;

  with inserted as (
    insert into public.decision_sla_escalations(
      brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
    )
    select request.brief_id,request.org_id,request.subject_scope,request.subject_id,request.data_class,
      'evidence-response:'||request.id::text||':'||request.due_at::text,'evidence_response','pmo','决策补证超过配置SLA',request.due_at,
      request.assigned_to_user_id,request.assigned_to_business_role,jsonb_build_object('evidence_request_id',request.id,'status',request.status)
    from public.decision_evidence_requests request where request.status in ('open','rejected') and request.due_at<p_now
    on conflict(escalation_key) do nothing returning *
  )
  insert into public.decision_events(brief_id,event_type,from_status,to_status,detail)
  select brief_id,'evidence_sla_escalated','evidence_required','evidence_required',jsonb_build_object('sla_escalation_id',id,'escalation_type',escalation_type,'due_at',due_at) from inserted;
  get diagnostics v_evidence_count = row_count;
  with expired as (
    update public.decision_evidence_requests
    set status='expired',updated_at=p_now
    where status in ('open','rejected') and due_at<p_now
    returning *
  )
  update public.decision_briefs brief set
    workflow_status='pending_decision',
    evidence=brief.evidence||jsonb_build_array(jsonb_build_object(
      'source_type','decision_evidence_request',
      'source_id',expired.id,
      'status','evidence_expired_recoverable',
      'guard','DECISION_EVIDENCE_EXPIRED_RECOVERABLE',
      'reason',expired.reason,
      'due_at',expired.due_at
    )),
    updated_at=p_now,
    version=brief.version+1
  from expired
  where brief.id=expired.brief_id and brief.workflow_status='evidence_required'
    and not exists (
      select 1 from public.decision_evidence_requests pending
      where pending.brief_id=brief.id and pending.status in ('open','submitted','rejected')
    );

  with inserted as (
    insert into public.decision_sla_escalations(
      brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
    )
    select receipt.brief_id,brief.org_id,brief.subject_scope,brief.subject_id,brief.data_class,
      'receipt-response:'||receipt.id::text||':'||brief.distributed_at::text,'receipt_response','pmo','决策指令接收回执超时',
      brief.distributed_at+make_interval(mins=>coalesce((select policy.receipt_sla_minutes from public.decision_sla_policies policy where (policy.org_id=brief.org_id or policy.org_id is null) and policy.decision_mode=brief.decision_mode and policy.decision_level=brief.decision_level and policy.status='active' and policy.effective_from<=p_now and (policy.effective_until is null or policy.effective_until>=p_now) order by (policy.org_id is not null) desc limit 1),1440)),
      receipt.recipient_user_id,receipt.recipient_business_role,jsonb_build_object('receipt_id',receipt.id,'status',receipt.status)
    from public.decision_receipts receipt join public.decision_briefs brief on brief.id=receipt.brief_id
    where receipt.status in ('pending','disputed') and brief.distributed_at is not null
      and brief.distributed_at+make_interval(mins=>coalesce((select policy.receipt_sla_minutes from public.decision_sla_policies policy where (policy.org_id=brief.org_id or policy.org_id is null) and policy.decision_mode=brief.decision_mode and policy.decision_level=brief.decision_level and policy.status='active' and policy.effective_from<=p_now and (policy.effective_until is null or policy.effective_until>=p_now) order by (policy.org_id is not null) desc limit 1),1440))<p_now
    on conflict(escalation_key) do nothing returning *
  )
  insert into public.decision_events(brief_id,event_type,from_status,to_status,detail)
  select brief_id,'receipt_sla_escalated','translated','translated',jsonb_build_object('sla_escalation_id',id,'escalation_type',escalation_type,'due_at',due_at) from inserted;
  get diagnostics v_receipt_count = row_count;

  with inserted as (
    insert into public.decision_sla_escalations(
      brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
    )
    select map.brief_id,map.org_id,map.subject_scope,map.subject_id,map.data_class,
      'execution:'||map.action_item_id::text||':'||action.due_date::text,'execution','pmo','决策下行行动逾期',action.due_date::timestamptz,
      action.owner_user_id,receipt.recipient_business_role,jsonb_build_object('action_item_id',action.id,'status',action.status,'template_key',map.template_key)
    from public.decision_execution_actions map
    join public.unified_action_items action on action.id=map.action_item_id
    join public.decision_receipts receipt on receipt.id=map.receipt_id
    where action.status not in ('evidence_submitted','closed','cancelled') and action.due_date<p_now::date
    on conflict(escalation_key) do nothing returning *
  )
  insert into public.decision_events(brief_id,event_type,from_status,to_status,detail)
  select brief_id,'execution_sla_escalated','executing','executing',jsonb_build_object('sla_escalation_id',id,'escalation_type',escalation_type,'due_at',due_at) from inserted;
  get diagnostics v_execution_count = row_count;
  update public.unified_action_items action set status='overdue',updated_at=p_now,version=version+1
  where action.id in (
    select map.action_item_id from public.decision_execution_actions map join public.unified_action_items current_action on current_action.id=map.action_item_id
    where current_action.status not in ('evidence_submitted','closed','cancelled','overdue') and current_action.due_date<p_now::date
  );

  with inserted as (
    insert into public.decision_sla_escalations(
      brief_id,org_id,subject_scope,subject_id,data_class,escalation_key,escalation_type,escalation_level,reason,due_at,target_user_id,target_business_role,source_payload
    )
    select brief.id,brief.org_id,brief.subject_scope,brief.subject_id,brief.data_class,
      'effect-review:'||brief.id::text||':'||brief.execution_due_at::text,'effect_review','pmo','决策效果复核超时',brief.execution_due_at,
      brief.submitted_by,'pmo',jsonb_build_object('workflow_status',brief.workflow_status,'review_plan',brief.review_plan)
    from public.decision_briefs brief
    where brief.workflow_status in ('executing','effect_review') and brief.execution_due_at<p_now and not exists(
      select 1 from public.decision_effect_reviews review where review.brief_id=brief.id and review.status='approved'
    )
    on conflict(escalation_key) do nothing returning *
  )
  insert into public.decision_events(brief_id,event_type,from_status,to_status,detail)
  select brief_id,'effect_review_sla_escalated','effect_review','effect_review',jsonb_build_object('sla_escalation_id',id,'escalation_type',escalation_type,'due_at',due_at) from inserted;
  get diagnostics v_review_count = row_count;

  with candidates as (
    select escalation.id,escalation.escalation_key,escalation.escalation_type,escalation.reason,escalation.due_at,
           escalation.target_user_id,escalation.target_business_role,escalation.subject_scope,escalation.subject_id,
           escalation.data_class,escalation.source_payload,users.name,users.email,
           connection.notification_receive_id_type,connection.notification_receive_id
    from public.decision_sla_escalations escalation
    join public.app_users users on users.id=escalation.target_user_id
    join public.user_feishu_connections connection on connection.user_id=escalation.target_user_id
    where escalation.status='open' and escalation.feishu_confirmation_id is null
      and connection.status='configured'
      and connection.notification_receive_id_type is not null
      and connection.notification_receive_id is not null
  ),
  inserted as (
    insert into public.feishu_action_confirmations(
      requester_id,requester_name,requester_email,source,source_page,action_type,idempotency_key,
      target_summary,risk_level,status,payload,preview,request_id
    )
    select
      target_user_id,coalesce(nullif(name,''),email),email,'system','/decision-center','message','decision-sla:'||id::text,
      'P21决策SLA提醒：'||reason,'medium','pending_confirmation',
      jsonb_build_object(
        'type','message',
        'idempotency_key','decision-sla:'||id::text,
        'receive_id_type',notification_receive_id_type,
        'receive_id',notification_receive_id,
        'text','【AI PMO决策SLA提醒】'||reason||E'\n范围：'||subject_scope||'/'||subject_id||E'\n数据空间：'||data_class||E'\n到期时间：'||due_at::text||E'\n请登录系统处理，实际发送需在飞书确认中心二次确认。',
        'require_personal_feishu',true,
        'escalation_key',escalation_key,
        'escalation_type',escalation_type,
        'target_business_role',target_business_role,
        'source_payload',source_payload
      ),
      jsonb_build_object(
        'actionType','message',
        'targetType','飞书消息',
        'targetSummary','向个人飞书发送P21决策SLA提醒',
        'riskLevel','low',
        'riskReasons',jsonb_build_array('仅生成待确认草稿，需人工二次确认后发送。'),
        'fields',jsonb_build_array(
          jsonb_build_object('label','接收对象类型','value',notification_receive_id_type),
          jsonb_build_object('label','提醒类型','value',escalation_type),
          jsonb_build_object('label','提醒原因','value',reason)
        ),
        'confirmationRequired',true
      ),
      'decision-sla:'||id::text
    from candidates
    on conflict(idempotency_key) where source_page='/decision-center' do nothing
    returning id,idempotency_key
  ),
  confirmations as (
    select id,idempotency_key from inserted
    union
    select existing.id,existing.idempotency_key
    from public.feishu_action_confirmations existing
    join candidates candidate on existing.idempotency_key='decision-sla:'||candidate.id::text
    where existing.source_page='/decision-center'
  ),
  updated as (
    update public.decision_sla_escalations escalation
    set feishu_confirmation_id=confirmations.id
    from confirmations
    where confirmations.idempotency_key='decision-sla:'||escalation.id::text
      and escalation.feishu_confirmation_id is null
    returning escalation.id
  )
  select count(*) into v_confirmation_count from updated;

  return jsonb_build_object(
    'processed_at',p_now,'decision_response',v_decision_count,'evidence_response',v_evidence_count,
    'receipt_response',v_receipt_count,'execution',v_execution_count,'effect_review',v_review_count,
    'confirmation_queue',v_confirmation_count,
    'total',v_decision_count+v_evidence_count+v_receipt_count+v_execution_count+v_review_count
  );
end;
$$;

-- Exposed-schema hardening. No browser role receives direct access; all access is
-- through authenticated server routes and security-invoker transactions.
alter table public.reporting_snapshot_events enable row level security;
alter table public.reporting_receipts enable row level security;
alter table public.governance_meeting_delegates enable row level security;
alter table public.meeting_conclusion_outputs enable row level security;
alter table public.meeting_review_plans enable row level security;
alter table public.decision_type_definitions enable row level security;
alter table public.decision_sla_policies enable row level security;
alter table public.decision_committees enable row level security;
alter table public.decision_committee_members enable row level security;
alter table public.decision_votes enable row level security;
alter table public.decision_evidence_requests enable row level security;
alter table public.decision_authority_responses enable row level security;
alter table public.decision_execution_actions enable row level security;
alter table public.decision_sla_escalations enable row level security;

revoke all on table
  public.reporting_snapshot_events,public.reporting_receipts,public.governance_meeting_delegates,
  public.meeting_conclusion_outputs,public.meeting_review_plans,public.decision_type_definitions,
  public.decision_sla_policies,public.decision_committees,public.decision_committee_members,
  public.decision_votes,public.decision_evidence_requests,public.decision_authority_responses,
  public.decision_execution_actions,public.decision_sla_escalations
from public,anon,authenticated;
grant select,insert,update,delete on table
  public.reporting_snapshot_events,public.reporting_receipts,public.governance_meeting_delegates,
  public.meeting_conclusion_outputs,public.meeting_review_plans,public.decision_type_definitions,
  public.decision_sla_policies,public.decision_committees,public.decision_committee_members,
  public.decision_votes,public.decision_evidence_requests,public.decision_authority_responses,
  public.decision_execution_actions,public.decision_sla_escalations
to service_role;

revoke all on function public.enforce_reporting_snapshot_immutability() from public,anon,authenticated;
revoke all on function public.create_reporting_snapshot_tx(uuid,text,text,text,text,date,date,jsonb,jsonb,text,timestamptz,jsonb,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_reporting_snapshot_tx(uuid,uuid,text,text,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_governance_meeting_tx(uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.record_governance_meeting_outcome_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.p21_decision_authority_type(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.request_decision_evidence_tx(uuid,uuid,text,text,text,jsonb,text,timestamptz,uuid,text,text) from public,anon,authenticated;
revoke all on function public.respond_decision_evidence_tx(uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.cast_decision_vote_tx(uuid,uuid,text,text,text,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.record_decision_authority_response_tx(uuid,uuid,text,text,text,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reassign_decision_authority_tx(uuid,uuid,text,text,text,uuid,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.transition_decision_execution_action_tx(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.reopen_decision_brief_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.process_decision_sla_escalations_tx(timestamptz) from public,anon,authenticated;

grant execute on function public.create_reporting_snapshot_tx(uuid,text,text,text,text,date,date,jsonb,jsonb,text,timestamptz,jsonb,uuid,uuid,text,text) to service_role;
grant execute on function public.transition_reporting_snapshot_tx(uuid,uuid,text,text,text,text,text,text,timestamptz,uuid,text,text) to service_role;
grant execute on function public.transition_governance_meeting_tx(uuid,uuid,text,text,text,text,text,text,timestamptz,jsonb,uuid,text,text) to service_role;
grant execute on function public.record_governance_meeting_outcome_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.p21_decision_authority_type(uuid,uuid,text) to service_role;
grant execute on function public.p21_sha256_hex(text) to service_role;
grant execute on function public.request_decision_evidence_tx(uuid,uuid,text,text,text,jsonb,text,timestamptz,uuid,text,text) to service_role;
grant execute on function public.respond_decision_evidence_tx(uuid,uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.cast_decision_vote_tx(uuid,uuid,text,text,text,text,text,text,uuid,text,text) to service_role;
grant execute on function public.record_decision_authority_response_tx(uuid,uuid,text,text,text,text,text,uuid,text,text) to service_role;
grant execute on function public.reassign_decision_authority_tx(uuid,uuid,text,text,text,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.transition_decision_execution_action_tx(uuid,uuid,uuid,uuid,text,text,text,text,jsonb,text,uuid,text,text) to service_role;
grant execute on function public.reopen_decision_brief_tx(uuid,uuid,text,text,text,text,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.process_decision_sla_escalations_tx(timestamptz) to service_role;

-- Replaced functions retain their original signatures and existing grants.
revoke all on function public.decide_decision_brief_tx(uuid,text,text,text,text,text,timestamptz,uuid,text,text) from public,anon,authenticated;
revoke all on function public.distribute_decision_brief_tx(uuid,text,jsonb,uuid,text,text) from public,anon,authenticated;
revoke all on function public.acknowledge_decision_receipt_tx(uuid,uuid,text,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.close_decision_brief_tx(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_decision_brief_tx(uuid,text,text,text,text,text,timestamptz,uuid,text,text) to service_role;
grant execute on function public.distribute_decision_brief_tx(uuid,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.acknowledge_decision_receipt_tx(uuid,uuid,text,text,uuid,text,text) to service_role;
grant execute on function public.close_decision_brief_tx(uuid,uuid,text,text) to service_role;

drop function if exists public.create_decision_committee_tx(uuid,text,text,text,text,jsonb,uuid,integer,integer,jsonb,timestamptz,uuid,text);
create or replace function public.create_decision_committee_tx(
  p_org_id uuid,
  p_subject_scope text,
  p_subject_id text,
  p_data_class text,
  p_name text,
  p_decision_levels jsonb,
  p_chair_user_id uuid,
  p_quorum integer,
  p_min_approvals integer,
  p_members jsonb,
  p_valid_until timestamptz,
  p_actor_user_id uuid,
  p_actor_business_role text,
  p_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_committee public.decision_committees%rowtype;
  v_existing public.decision_committees%rowtype;
  v_member jsonb;
  v_request_hash text;
  v_level text;
  v_voter_count integer;
begin
  if p_actor_business_role<>'pmo' then raise exception 'DECISION_COMMITTEE_ROLE_FORBIDDEN'; end if;
  if p_subject_scope not in ('project','portfolio','organization') or p_data_class not in ('production','sample','test','diagnostic','unclassified') then raise exception 'DECISION_COMMITTEE_SCOPE_INVALID'; end if;
  if nullif(trim(p_name),'') is null or jsonb_typeof(p_members)<>'array' or jsonb_array_length(p_members)=0 or jsonb_typeof(p_decision_levels)<>'array' or jsonb_array_length(p_decision_levels)=0 or p_quorum<1 or p_min_approvals<1 or p_min_approvals>p_quorum then raise exception 'DECISION_COMMITTEE_INPUT_INVALID'; end if;
  for v_level in select value from jsonb_array_elements_text(p_decision_levels)
  loop
    if v_level not in ('project','portfolio','executive') then raise exception 'DECISION_COMMITTEE_LEVEL_FORBIDDEN'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(p_members) member where (member->>'user_id')::uuid=p_chair_user_id and member->>'member_role'='chair') then raise exception 'DECISION_COMMITTEE_CHAIR_REQUIRED'; end if;
  select count(*) into v_voter_count from jsonb_array_elements(p_members) member where member->>'member_role' in ('chair','voter');
  if v_voter_count<p_quorum or p_min_approvals>v_voter_count then raise exception 'DECISION_COMMITTEE_VOTER_CAPACITY_INVALID'; end if;
  v_request_hash := public.p21_sha256_hex(
    p_org_id::text||p_subject_scope||p_subject_id||p_data_class||trim(p_name)||p_decision_levels::text||
    p_chair_user_id::text||p_quorum::text||p_min_approvals::text||p_members::text||coalesce(p_valid_until::text,'')
  );
  if nullif(trim(p_request_id),'') is not null then
    select * into v_existing from public.decision_committees where org_id=p_org_id and request_id=p_request_id;
    if found then
      if v_existing.request_hash is distinct from v_request_hash then raise exception 'DECISION_COMMITTEE_IDEMPOTENCY_CONFLICT'; end if;
      return jsonb_build_object('committee',to_jsonb(v_existing),'members',(select jsonb_agg(to_jsonb(member)) from public.decision_committee_members member where member.committee_id=v_existing.id));
    end if;
  end if;
  for v_member in select value from jsonb_array_elements(p_members)
  loop
    if v_member->>'business_role' not in ('ceo','sponsor') or v_member->>'member_role' not in ('chair','voter','observer') then raise exception 'DECISION_COMMITTEE_MEMBER_INVALID'; end if;
    if not exists(
      select 1 from public.user_business_roles role_row
      where role_row.org_id=p_org_id and role_row.subject_scope=p_subject_scope and role_row.subject_id=p_subject_id
        and role_row.user_id=(v_member->>'user_id')::uuid and role_row.business_role=v_member->>'business_role'
        and role_row.status='active' and role_row.valid_from<=now() and (role_row.valid_until is null or role_row.valid_until>=now())
    ) then raise exception 'DECISION_COMMITTEE_MEMBER_SCOPE_INVALID'; end if;
  end loop;
  insert into public.decision_committees(org_id,subject_scope,subject_id,data_class,name,decision_levels,chair_user_id,quorum,min_approvals,valid_until,request_id,request_hash,created_by)
  values(p_org_id,p_subject_scope,p_subject_id,p_data_class,trim(p_name),p_decision_levels,p_chair_user_id,p_quorum,p_min_approvals,p_valid_until,nullif(trim(p_request_id),''),v_request_hash,p_actor_user_id)
  returning * into v_committee;
  for v_member in select value from jsonb_array_elements(p_members)
  loop
    insert into public.decision_committee_members(committee_id,org_id,subject_scope,subject_id,data_class,user_id,business_role,member_role,delegated_from_user_id,valid_until)
    values(v_committee.id,p_org_id,p_subject_scope,p_subject_id,p_data_class,(v_member->>'user_id')::uuid,v_member->>'business_role',v_member->>'member_role',nullif(v_member->>'delegated_from_user_id','')::uuid,p_valid_until);
  end loop;
  return jsonb_build_object('committee',to_jsonb(v_committee),'members',(select jsonb_agg(to_jsonb(member)) from public.decision_committee_members member where member.committee_id=v_committee.id));
end;
$$;
revoke all on function public.create_decision_committee_tx(uuid,text,text,text,text,jsonb,uuid,integer,integer,jsonb,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.create_decision_committee_tx(uuid,text,text,text,text,jsonb,uuid,integer,integer,jsonb,timestamptz,uuid,text,text) to service_role;
