-- AI PM System V5.3.55-V5.3.58 Knowledge Reference, Template Directory and Audit Package
-- 用途：补齐知识版本引用链、模板/最佳实践目录持久化、订阅投递回执和 PMO 知识审计包。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：必须先执行 supabase-v5352-knowledge-lifecycle.sql 和 supabase-v5354-knowledge-governance-operations.sql。
-- 安全说明：仅保存知识运营元数据、引用摘要、模板统计和审计包 Markdown，不保存 API Key、飞书密钥、用户密码或原始敏感凭据。

create extension if not exists "uuid-ossp";

do $$
declare
  constraint_name text;
begin
  if to_regclass('public.knowledge_lifecycle_events') is null then
    raise notice 'knowledge_lifecycle_events does not exist. Execute supabase-v5352-knowledge-lifecycle.sql first.';
    return;
  end if;

  select conname
    into constraint_name
  from pg_constraint
  where conrelid = 'public.knowledge_lifecycle_events'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%event_type%'
  limit 1;

  if constraint_name is not null then
    execute 'alter table public.knowledge_lifecycle_events drop constraint ' || quote_ident(constraint_name);
  end if;

  alter table public.knowledge_lifecycle_events
    add constraint knowledge_lifecycle_events_event_type_check
    check (event_type in (
      'sync_snapshot',
      'status_transition',
      'review_submitted',
      'publish',
      'archive',
      'restore',
      'subscription_created',
      'subscription_updated',
      'subscription_notification_queued',
      'subscription_notification_sent',
      'change_report_generated',
      'output_reference_created',
      'template_directory_upserted',
      'template_usage_recorded',
      'subscription_delivery_recorded',
      'audit_package_generated'
    ));
end $$;

create table if not exists public.knowledge_output_references (
  id uuid primary key default uuid_generate_v4(),
  output_type text not null
    check (output_type in ('ai_answer', 'report', 'governance', 'risk', 'template', 'other')),
  output_id text not null,
  output_title text not null,
  module_name text not null,
  page_id text not null,
  knowledge_item_id uuid references public.knowledge_items(id) on delete set null,
  knowledge_version_id uuid references public.knowledge_item_versions(id) on delete set null,
  version_label text,
  citation_text text not null,
  confidence numeric(4, 3) not null default 0.800,
  reference_status text not null default 'active'
    check (reference_status in ('active', 'stale', 'superseded', 'revoked')),
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (output_type, output_id, page_id, version_label)
);

create table if not exists public.knowledge_template_directory_items (
  id uuid primary key default uuid_generate_v4(),
  template_key text not null unique,
  title text not null,
  category text not null default 'governance',
  source text not null default 'AI-PMO',
  description text not null default '',
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('draft', 'active', 'reviewing', 'deprecated', 'archived')),
  owner_name text not null default '知识库管理员',
  linked_knowledge_page_ids text[] not null default '{}'::text[],
  download_count integer not null default 0 check (download_count >= 0),
  reference_count integer not null default 0 check (reference_count >= 0),
  last_used_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  updated_by uuid references public.app_users(id) on delete set null,
  updated_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.knowledge_template_usage_events (
  id uuid primary key default uuid_generate_v4(),
  template_item_id uuid references public.knowledge_template_directory_items(id) on delete set null,
  template_key text not null,
  event_type text not null
    check (event_type in ('download', 'reference', 'import', 'export')),
  actor_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  output_type text,
  output_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.knowledge_subscription_delivery_receipts (
  id uuid primary key default uuid_generate_v4(),
  notification_id uuid references public.knowledge_subscription_notifications(id) on delete cascade,
  delivery_channel text not null default 'in_app'
    check (delivery_channel in ('in_app', 'feishu', 'email')),
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sent', 'read', 'handled', 'failed', 'cancelled')),
  delivered_to text,
  handled_by uuid references public.app_users(id) on delete set null,
  handled_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz default now()
);

create table if not exists public.knowledge_audit_packages (
  id uuid primary key default uuid_generate_v4(),
  package_type text not null default 'knowledge_operations'
    check (package_type in ('knowledge_operations', 'pmo_audit', 'release_handoff')),
  package_period text not null,
  title text not null,
  markdown text not null,
  summary jsonb not null default '{}'::jsonb,
  generated_by uuid references public.app_users(id) on delete set null,
  generated_by_name text,
  request_id text,
  created_at timestamptz default now()
);

alter table public.knowledge_output_references enable row level security;
alter table public.knowledge_template_directory_items enable row level security;
alter table public.knowledge_template_usage_events enable row level security;
alter table public.knowledge_subscription_delivery_receipts enable row level security;
alter table public.knowledge_audit_packages enable row level security;

-- 当前系统通过服务端 service role 读写知识运营数据；
-- 不开放匿名策略，避免公网用户直接读取知识引用链、模板使用统计和审计包。

create index if not exists idx_knowledge_output_references_output
  on public.knowledge_output_references(output_type, output_id, created_at desc);
create index if not exists idx_knowledge_output_references_page
  on public.knowledge_output_references(page_id, reference_status, created_at desc);
create index if not exists idx_knowledge_output_references_version
  on public.knowledge_output_references(knowledge_version_id, created_at desc);

create index if not exists idx_knowledge_template_directory_status
  on public.knowledge_template_directory_items(lifecycle_status, updated_at desc);
create index if not exists idx_knowledge_template_directory_category
  on public.knowledge_template_directory_items(category, updated_at desc);

create index if not exists idx_knowledge_template_usage_key
  on public.knowledge_template_usage_events(template_key, event_type, created_at desc);
create index if not exists idx_knowledge_template_usage_item
  on public.knowledge_template_usage_events(template_item_id, created_at desc);

create index if not exists idx_knowledge_subscription_delivery_notification
  on public.knowledge_subscription_delivery_receipts(notification_id, occurred_at desc);
create index if not exists idx_knowledge_subscription_delivery_status
  on public.knowledge_subscription_delivery_receipts(delivery_status, delivery_channel, occurred_at desc);

create index if not exists idx_knowledge_audit_packages_period
  on public.knowledge_audit_packages(package_type, package_period, created_at desc);

comment on table public.knowledge_output_references is
  '知识输出引用链：记录 AI 问答、报告、治理结论、风险输出等引用的具体知识条目版本。';
comment on table public.knowledge_template_directory_items is
  '模板/最佳实践目录：保存模板、制度和最佳实践的可编辑目录、关联知识页和下载/引用统计。';
comment on table public.knowledge_template_usage_events is
  '模板使用事件：记录模板下载、引用、导入和导出行为，用于运营统计。';
comment on table public.knowledge_subscription_delivery_receipts is
  '知识订阅投递回执：记录站内、飞书、邮件通知的发送、阅读、处理和失败状态。';
comment on table public.knowledge_audit_packages is
  '知识运营审计包：保存可下载的知识变更、版本引用、模板使用和订阅投递闭环证据。';
