-- AI PM System V5.3.17 Migration Remediation Feishu Task Sync Queue
-- 作用：为迁移整改行动项增加飞书任务回写确认队列与同步结果回填字段。
-- 前置：请先执行 supabase-v5316-migration-remediation-actions.sql。

alter table public.migration_remediation_actions
  add column if not exists feishu_sync_status text not null default '未同步'
    check (feishu_sync_status in ('未同步', '待确认', '同步中', '已同步', '同步失败')),
  add column if not exists feishu_task_guid text,
  add column if not exists feishu_task_url text,
  add column if not exists feishu_sync_error text,
  add column if not exists feishu_synced_at timestamptz,
  add column if not exists feishu_sync_request_id text;

create index if not exists idx_migration_remediation_actions_feishu_sync_status
  on public.migration_remediation_actions (feishu_sync_status);

create index if not exists idx_migration_remediation_actions_feishu_task_guid
  on public.migration_remediation_actions (feishu_task_guid)
  where feishu_task_guid is not null;

comment on column public.migration_remediation_actions.feishu_sync_status is
  '飞书任务同步状态：未同步、待确认、同步中、已同步、同步失败。';
comment on column public.migration_remediation_actions.feishu_task_guid is
  '成功写入飞书任务后的任务 GUID。';
comment on column public.migration_remediation_actions.feishu_task_url is
  '成功写入飞书任务后的访问链接，如果飞书接口返回。';
comment on column public.migration_remediation_actions.feishu_sync_error is
  '最近一次飞书任务同步失败原因。';
comment on column public.migration_remediation_actions.feishu_synced_at is
  '最近一次成功写入飞书任务时间。';
comment on column public.migration_remediation_actions.feishu_sync_request_id is
  '最近一次飞书同步请求 ID，用于排查和审计。';
