-- AI PM System Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Enable pgvector for embeddings (optional - needed for knowledge base AI features)
create extension if not exists "vector";

-- =====================
-- Core Project Tables
-- =====================

-- 项目主表
create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  province text,
  oa_no text,
  crm_flag boolean default false,
  product_category text,
  project_type text,
  channel text,
  sales_owner text,
  contract_date date,
  deadline date,
  plan_delivery_date date,
  status text default 'active' check (status in ('active', 'completed', 'suspended', 'cancelled')),
  progress integer default 0 check (progress >= 0 and progress <= 100),
  project_level text check (project_level in ('S', 'A', 'B', 'C')),
  is_key_project boolean default false,
  contract_amount numeric(15,2),
  collection_amount numeric(15,2) default 0,
  collection_rate numeric(5,2) generated always as (
    case when contract_amount > 0 then (collection_amount / contract_amount * 100) else 0 end
  ) stored,
  receivable numeric(15,2) default 0,
  payment_terms jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 项目阶段跟踪
create table if not exists project_stages (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  stage_name text not null,
  stage_number integer,
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- =====================
-- WBS Work Breakdown
-- =====================

create table if not exists wbs_items (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  parent_id uuid references wbs_items(id),
  level integer not null check (level >= 1 and level <= 5),
  code text,
  name text not null,
  description text,
  duration_days integer,
  assignee text,
  dependencies jsonb default '[]',
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  progress integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Task Management
-- =====================

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  wbs_id uuid references wbs_items(id) on delete set null,
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  duration integer,
  predecessors jsonb default '[]',
  plan_start date,
  plan_end date,
  actual_start date,
  actual_end date,
  percent_complete integer default 0 check (percent_complete >= 0 and percent_complete <= 100),
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  assignee text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Cost & EVM
-- =====================

create table if not exists cost_records (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  period text not null,
  planned_value numeric(15,2) default 0,
  actual_cost numeric(15,2) default 0,
  earned_value numeric(15,2) default 0,
  created_at timestamptz default now(),
  unique (project_id, period)
);

-- =====================
-- Risk Management
-- =====================

create table if not exists risks (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  description text not null,
  category text check (category in ('技术', '人员', '外部', '管理', '质量')),
  probability integer check (probability between 1 and 5),
  impact integer check (impact between 1 and 5),
  pi_score integer generated always as (probability * impact) stored,
  status text default 'identified' check (status in ('identified', 'tracking', 'resolved')),
  response_strategy text,
  owner text,
  triggered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Stakeholders
-- =====================

create table if not exists stakeholders (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  role text,
  organization text,
  power integer check (power between 1 and 5),
  interest integer check (interest between 1 and 5),
  current_engagement text check (current_engagement in ('不知情', '抵制', '中立', '支持', '领导')),
  desired_engagement text check (desired_engagement in ('不知情', '抵制', '中立', '支持', '领导')),
  communication_frequency text check (communication_frequency in ('每周', '每两周', '每月', '按需')),
  communication_method text check (communication_method in ('邮件', '会议', '电话', '即时通讯')),
  management_strategy text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Contracts & Payments
-- =====================

create table if not exists contracts (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  party_a text,
  party_b text,
  total_amount numeric(15,2) not null,
  signed_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists payment_milestones (
  id uuid primary key default uuid_generate_v4(),
  contract_id uuid references contracts(id) on delete cascade,
  name text not null,
  amount numeric(15,2) not null,
  due_date date,
  status text default 'unpaid' check (status in ('paid', 'unpaid', 'overdue', 'pending')),
  actual_paid_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Quality & Defects
-- =====================

create table if not exists defects (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  description text not null,
  severity text check (severity in ('critical', 'major', 'minor', 'cosmetic')),
  status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed', 'rejected')),
  assignee text,
  root_cause text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);

create table if not exists quality_checklists (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  phase text not null,
  item_text text not null,
  category text,
  required boolean default false,
  checked boolean default false,
  checked_by text,
  checked_at timestamptz,
  created_at timestamptz default now()
);

-- =====================
-- OKR & Governance
-- =====================

create table if not exists okrs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  objective text not null,
  status text default 'on-track' check (status in ('on-track', 'at-risk', 'behind')),
  owner text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists okr_key_results (
  id uuid primary key default uuid_generate_v4(),
  okr_id uuid references okrs(id) on delete cascade,
  description text not null,
  target numeric(10,2) not null,
  current numeric(10,2) default 0,
  unit text,
  progress integer generated always as (
    case when target > 0 then (current / target * 100)::integer else 0 end
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- Knowledge Base
-- =====================

create table if not exists knowledge_documents (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  content text,
  category text,
  tags text[],
  embedding vector(1536),
  created_at timestamptz default now()
);

create table if not exists qa_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_question text not null,
  ai_answer text,
  sources jsonb default '[]',
  confidence numeric(5,2),
  created_at timestamptz default now()
);

-- =====================
-- Reports & Lessons
-- =====================

create table if not exists reports (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  type text not null check (type in ('weekly', 'monthly', 'progress', 'meeting', 'acceptance')),
  title text not null,
  content text,
  tone text,
  generated_at timestamptz default now()
);

create table if not exists lessons_learned (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete set null,
  project_name text,
  category text,
  issue text not null,
  resolution text not null,
  impact text check (impact in ('high', 'medium', 'low')),
  created_at timestamptz default now()
);

-- =====================
-- Closing Checklists
-- =====================

create table if not exists closing_checklists (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  category text not null check (category in ('acceptance', 'documentation', 'lessons', 'finance', 'contract')),
  item text not null,
  owner text,
  due_date date,
  completed boolean default false,
  evidence text,
  created_at timestamptz default now()
);

create table if not exists sign_offs (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references projects(id) on delete cascade,
  role text not null,
  name text,
  signed boolean default false,
  signed_at timestamptz,
  comments text,
  created_at timestamptz default now()
);

-- =====================
-- Row Level Security (RLS)
-- =====================

alter table projects enable row level security;
alter table risks enable row level security;
alter table contracts enable row level security;
alter table payment_milestones enable row level security;
alter table stakeholders enable row level security;
alter table tasks enable row level security;
alter table defects enable row level security;
alter table okrs enable row level security;
alter table reports enable row level security;
alter table closing_checklists enable row level security;

-- Public read access (adjust for production)
create policy "Public read" on projects for select using (true);
create policy "Public read" on risks for select using (true);
create policy "Public read" on contracts for select using (true);
create policy "Public read" on payment_milestones for select using (true);
create policy "Public read" on stakeholders for select using (true);

-- Public write access (adjust for production)
create policy "Public insert" on projects for insert with check (true);
create policy "Public update" on projects for update using (true);
create policy "Public insert" on risks for insert with check (true);
create policy "Public update" on risks for update using (true);

-- =====================
-- Indexes
-- =====================

create index if not exists idx_projects_status on projects(status);
create index if not exists idx_projects_level on projects(project_level);
create index if not exists idx_risks_project on risks(project_id);
create index if not exists idx_risks_status on risks(status);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_contracts_project on contracts(project_id);
create index if not exists idx_payment_milestones_contract on payment_milestones(contract_id);
create index if not exists idx_stakeholders_project on stakeholders(project_id);
create index if not exists idx_defects_project on defects(project_id);
create index if not exists idx_okrs_project on okrs(project_id);

-- Full text search index for knowledge base
create index if not exists idx_knowledge_documents_fts on knowledge_documents using gin(to_tsvector('simple', title || ' ' || coalesce(content, '')));