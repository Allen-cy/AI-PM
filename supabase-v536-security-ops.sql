-- AI PM System V5.3.6 Security Operations Migration
-- 用途：P10 企业化运营增强：项目访问申请/审批闭环。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：请先执行 supabase-v534-enterprise-security.sql。

create extension if not exists "uuid-ossp";

create table if not exists project_access_requests (
  id uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references app_users(id) on delete cascade,
  requester_name text,
  requester_email text,
  project_name text,
  project_code text,
  access_level text not null default 'viewer' check (access_level in ('viewer', 'editor', 'owner')),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewer_id uuid references app_users(id) on delete set null,
  reviewer_name text,
  review_comment text,
  related_grant_id uuid references user_project_access_grants(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (coalesce(project_name, project_code) is not null)
);

alter table project_access_requests enable row level security;

-- This table is intentionally service-role only.
-- Do not add public policies for project_access_requests.

create index if not exists idx_project_access_requests_requester on project_access_requests(requester_id, status);
create index if not exists idx_project_access_requests_status on project_access_requests(status, created_at desc);
create index if not exists idx_project_access_requests_project_name on project_access_requests(project_name);
create index if not exists idx_project_access_requests_project_code on project_access_requests(project_code);

create or replace function set_project_access_requests_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_project_access_requests_updated_at on project_access_requests;
create trigger trg_project_access_requests_updated_at
before update on project_access_requests
for each row execute function set_project_access_requests_updated_at();
