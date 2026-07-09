-- AI PM System V5.3.54 Knowledge Governance Operations
-- 用途：为知识状态流转、订阅提醒发送记录和知识变更报告提供持久化能力。
-- 执行位置：Supabase SQL Editor。
-- 前置依赖：必须先执行 supabase-v5352-knowledge-lifecycle.sql；如需飞书待确认队列，继续依赖 supabase-v5349-feishu-action-confirmations.sql。
-- 安全说明：仅保存知识运营元数据、通知摘要和报告内容，不保存 API Key、飞书密钥、用户密码或原始敏感凭据。

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
      'change_report_generated'
    ));
end $$;

create table if not exists public.knowledge_subscription_notifications (
  id uuid primary key default uuid_generate_v4(),
  subscription_id uuid references public.knowledge_subscriptions(id) on delete set null,
  subscriber_id uuid references public.app_users(id) on delete set null,
  subscriber_name text,
  module_name text not null,
  domain text,
  notification_channel text not null default 'in_app'
    check (notification_channel in ('in_app', 'feishu', 'email')),
  title text not null,
  message text not null,
  related_page_ids text[] not null default '{}'::text[],
  action_required text,
  priority text not null default 'P1'
    check (priority in ('P0', 'P1', 'P2')),
  status text not null default 'queued'
    check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  feishu_confirmation_id text,
  email_message_id text,
  sent_by uuid references public.app_users(id) on delete set null,
  sent_by_name text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  sent_at timestamptz,
  updated_at timestamptz default now()
);

create table if not exists public.knowledge_change_reports (
  id uuid primary key default uuid_generate_v4(),
  report_period text not null,
  title text not null,
  markdown text not null,
  summary jsonb not null default '{}'::jsonb,
  generated_by uuid references public.app_users(id) on delete set null,
  generated_by_name text,
  request_id text,
  created_at timestamptz default now()
);

alter table public.knowledge_subscription_notifications enable row level security;
alter table public.knowledge_change_reports enable row level security;

-- 当前系统通过服务端 service role 读写知识治理运营数据；
-- 不开放匿名策略，避免公网用户直接读取知识运营通知和审计报告。

create index if not exists idx_knowledge_subscription_notifications_subscription
  on public.knowledge_subscription_notifications(subscription_id, created_at desc);
create index if not exists idx_knowledge_subscription_notifications_status
  on public.knowledge_subscription_notifications(status, priority, created_at desc);
create index if not exists idx_knowledge_subscription_notifications_channel
  on public.knowledge_subscription_notifications(notification_channel, status, created_at desc);

create index if not exists idx_knowledge_change_reports_period
  on public.knowledge_change_reports(report_period, created_at desc);
create index if not exists idx_knowledge_change_reports_created_at
  on public.knowledge_change_reports(created_at desc);

comment on table public.knowledge_subscription_notifications is
  '知识订阅通知记录：保存站内、飞书、邮件提醒的生成、发送状态和关联知识页。';
comment on table public.knowledge_change_reports is
  '知识变更报告：保存基于知识生命周期事件和版本差异生成的周报、审计包或运营报告。';
