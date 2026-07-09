-- AI PM System V5.3.52 Knowledge Lifecycle Persistence
-- 用途：把 V5.3.51 的运行时知识生命周期视图推进到可持久化、可审批、可审计的知识运营底座。
-- 执行位置：Supabase SQL Editor。
-- 安全说明：仅保存知识条目元数据、版本摘要、影响模块复核和订阅关系，不保存 API Key、飞书密钥、用户密码或原始敏感凭据。

create extension if not exists "uuid-ossp";

create table if not exists public.knowledge_items (
  id uuid primary key default uuid_generate_v4(),
  page_id text not null unique,
  title text not null,
  knowledge_type text not null default 'general',
  status text not null default 'reviewed'
    check (status in ('draft', 'reviewed', 'published', 'deprecated', 'archived')),
  owner_name text not null default '知识库管理员',
  domains text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  source_refs text[] not null default '{}'::text[],
  confidentiality text not null default 'internal'
    check (confidentiality in ('public', 'internal', 'confidential', 'restricted')),
  current_version_label text,
  applicable_scenarios text[] not null default '{}'::text[],
  expires_at date,
  lifecycle_health text not null default '正常'
    check (lifecycle_health in ('正常', '待复核', '即将过期', '已过期', '已归档')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.knowledge_item_versions (
  id uuid primary key default uuid_generate_v4(),
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  page_id text not null,
  version_label text not null,
  snapshot_index_version text not null,
  content_sha256 text not null,
  change_summary text not null,
  source_refs text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz default now(),
  unique (page_id, version_label)
);

create table if not exists public.knowledge_lifecycle_events (
  id uuid primary key default uuid_generate_v4(),
  knowledge_item_id uuid references public.knowledge_items(id) on delete cascade,
  page_id text not null,
  event_type text not null
    check (event_type in ('sync_snapshot', 'status_transition', 'review_submitted', 'publish', 'archive', 'restore')),
  from_status text check (from_status is null or from_status in ('draft', 'reviewed', 'published', 'deprecated', 'archived')),
  to_status text check (to_status is null or to_status in ('draft', 'reviewed', 'published', 'deprecated', 'archived')),
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  event_status text not null default 'succeeded'
    check (event_status in ('succeeded', 'failed', 'rejected', 'skipped')),
  review_note text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.knowledge_impact_reviews (
  id uuid primary key default uuid_generate_v4(),
  knowledge_item_id uuid not null references public.knowledge_items(id) on delete cascade,
  source_version_id uuid references public.knowledge_item_versions(id) on delete set null,
  module_name text not null,
  priority text not null default 'P2'
    check (priority in ('P0', 'P1', 'P2')),
  status text not null default '待复核'
    check (status in ('待复核', '处理中', '已关闭', '无需处理')),
  owner_name text not null default '知识库管理员',
  due_date date not null default (current_date + interval '14 days')::date,
  review_output text not null,
  closure_evidence text,
  reviewer_id uuid references public.app_users(id) on delete set null,
  reviewer_name text,
  reviewed_at timestamptz,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (knowledge_item_id, module_name, source_version_id)
);

create table if not exists public.knowledge_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  subscriber_id uuid references public.app_users(id) on delete cascade,
  subscriber_name text,
  module_name text not null,
  domain text,
  notification_channel text not null default 'in_app'
    check (notification_channel in ('in_app', 'feishu', 'email')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (subscriber_id, module_name, domain, notification_channel)
);

alter table public.knowledge_items enable row level security;
alter table public.knowledge_item_versions enable row level security;
alter table public.knowledge_lifecycle_events enable row level security;
alter table public.knowledge_impact_reviews enable row level security;
alter table public.knowledge_subscriptions enable row level security;

-- 当前系统通过服务端 service role 读写知识生命周期数据；
-- 不开放匿名策略，避免公网用户直接读取知识运营审计信息。

create index if not exists idx_knowledge_items_status
  on public.knowledge_items(status, updated_at desc);
create index if not exists idx_knowledge_items_owner
  on public.knowledge_items(owner_name, updated_at desc);
create index if not exists idx_knowledge_items_health
  on public.knowledge_items(lifecycle_health, expires_at);

create index if not exists idx_knowledge_item_versions_item
  on public.knowledge_item_versions(knowledge_item_id, created_at desc);
create index if not exists idx_knowledge_item_versions_snapshot
  on public.knowledge_item_versions(snapshot_index_version, created_at desc);

create index if not exists idx_knowledge_lifecycle_events_item
  on public.knowledge_lifecycle_events(knowledge_item_id, created_at desc);
create index if not exists idx_knowledge_lifecycle_events_type
  on public.knowledge_lifecycle_events(event_type, created_at desc);

create index if not exists idx_knowledge_impact_reviews_status
  on public.knowledge_impact_reviews(status, priority, due_date);
create index if not exists idx_knowledge_impact_reviews_module
  on public.knowledge_impact_reviews(module_name, status);

create index if not exists idx_knowledge_subscriptions_subscriber
  on public.knowledge_subscriptions(subscriber_id, status);

comment on table public.knowledge_items is
  '知识条目主表：保存 RAG 知识条目的状态、责任人、适用范围和当前版本。';
comment on table public.knowledge_item_versions is
  '知识条目版本表：保存快照版本、内容 hash、变更摘要和来源引用。';
comment on table public.knowledge_lifecycle_events is
  '知识生命周期事件表：保存同步、评审、发布、归档、恢复等状态流转审计。';
comment on table public.knowledge_impact_reviews is
  '知识影响复核表：保存知识变更后需要复核的系统模块、责任人、截止日期和关闭证据。';
comment on table public.knowledge_subscriptions is
  '知识订阅表：保存用户或模块对知识域变化的订阅配置。';
