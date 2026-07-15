-- V6.5.0 optimistic concurrency for organization Feishu connection configuration.
alter table public.organization_feishu_connections add column if not exists version bigint not null default 1;
alter table public.organization_feishu_connections drop constraint if exists organization_feishu_connections_version_check;
alter table public.organization_feishu_connections add constraint organization_feishu_connections_version_check check (version > 0);
