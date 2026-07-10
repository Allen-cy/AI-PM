-- AI PM System V6.0.6 P17-P25 production compatibility repair
-- 用途：
-- 1. 补齐用户飞书配置的 P25 加密字段和 P21 通知接收字段。
-- 2. 为已存在的 active admin 用户补默认组织级 PM/运营/PMO/CEO 业务角色。
-- 3. 建立 PM/运营 -> PMO -> CEO 的默认汇报关系，让 P17-P25 登录态上下文可运行。
--
-- 幂等性：可重复执行；不会删除或覆盖已有业务记录。

create extension if not exists "uuid-ossp";

insert into public.organizations (org_code, name)
values ('DEFAULT', '默认组织')
on conflict (org_code) do nothing;

alter table public.user_feishu_connections
  add column if not exists app_secret_encrypted text,
  add column if not exists app_secret_last4 text,
  add column if not exists app_secret_key_version smallint,
  add column if not exists base_token_encrypted text,
  add column if not exists base_token_last4 text,
  add column if not exists base_token_key_version smallint,
  add column if not exists notification_receive_id_type text,
  add column if not exists notification_receive_id text;

update public.user_feishu_connections
set app_secret_last4 = right(app_secret, 4)
where app_secret is not null
  and btrim(app_secret) <> ''
  and coalesce(app_secret_last4, '') = '';

update public.user_feishu_connections
set base_token_last4 = right(base_token, 4)
where base_token is not null
  and btrim(base_token) <> ''
  and coalesce(base_token_last4, '') = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_feishu_connections_notification_receive_type_ck'
      and conrelid = 'public.user_feishu_connections'::regclass
  ) then
    alter table public.user_feishu_connections
      add constraint user_feishu_connections_notification_receive_type_ck
      check (notification_receive_id_type is null or notification_receive_id_type in ('chat_id','open_id'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_feishu_connections_notification_receive_pair_ck'
      and conrelid = 'public.user_feishu_connections'::regclass
  ) then
    alter table public.user_feishu_connections
      add constraint user_feishu_connections_notification_receive_pair_ck
      check ((notification_receive_id_type is null) = (notification_receive_id is null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_feishu_connections_app_secret_storage_ck'
      and conrelid = 'public.user_feishu_connections'::regclass
  ) then
    alter table public.user_feishu_connections
      add constraint user_feishu_connections_app_secret_storage_ck
      check (
        not (app_secret is not null and app_secret_encrypted is not null)
        and (
          (app_secret_encrypted is null and app_secret_key_version is null)
          or (
            app_secret_encrypted ~ '^cred:v1:k[1-9][0-9]{0,3}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
            and app_secret_key_version between 1 and 9999
            and split_part(app_secret_encrypted, ':', 3) = 'k' || app_secret_key_version::text
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_feishu_connections_base_token_storage_ck'
      and conrelid = 'public.user_feishu_connections'::regclass
  ) then
    alter table public.user_feishu_connections
      add constraint user_feishu_connections_base_token_storage_ck
      check (
        not (base_token is not null and base_token_encrypted is not null)
        and (
          (base_token_encrypted is null and base_token_key_version is null)
          or (
            base_token_encrypted ~ '^cred:v1:k[1-9][0-9]{0,3}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
            and base_token_key_version between 1 and 9999
            and split_part(base_token_encrypted, ':', 3) = 'k' || base_token_key_version::text
          )
        )
      );
  end if;
end $$;

create unique index if not exists idx_user_business_roles_active_scope
  on public.user_business_roles(user_id, business_role, org_id, subject_scope, subject_id)
  where status = 'active';

with default_org as (
  select id from public.organizations where org_code = 'DEFAULT' limit 1
),
admin_users as (
  select id
  from public.app_users
  where role = 'admin'
    and status = 'active'
),
role_seed(business_role) as (
  values ('pm'), ('operations'), ('pmo'), ('ceo')
)
insert into public.user_business_roles (
  user_id,
  business_role,
  org_id,
  subject_scope,
  subject_id,
  status,
  valid_from,
  assigned_by,
  assignment_reason
)
select
  admin_users.id,
  role_seed.business_role,
  default_org.id,
  'organization',
  default_org.id::text,
  'active',
  now(),
  admin_users.id,
  'P17-P25生产验收默认管理员组织级业务角色'
from admin_users
cross join default_org
cross join role_seed
on conflict do nothing;

with default_org as (
  select id from public.organizations where org_code = 'DEFAULT' limit 1
),
admin_users as (
  select id
  from public.app_users
  where role = 'admin'
    and status = 'active'
),
links(from_role, to_role, relationship_type) as (
  values
    ('pm', 'pmo', 'reports_to'),
    ('operations', 'pmo', 'reports_to'),
    ('pmo', 'ceo', 'escalates_to')
)
insert into public.business_reporting_relationships (
  org_id,
  subject_scope,
  subject_id,
  from_user_id,
  from_business_role,
  to_user_id,
  to_business_role,
  relationship_type,
  status,
  valid_from
)
select
  default_org.id,
  'organization',
  default_org.id::text,
  admin_users.id,
  links.from_role,
  admin_users.id,
  links.to_role,
  links.relationship_type,
  'active',
  now()
from admin_users
cross join default_org
cross join links
on conflict do nothing;
