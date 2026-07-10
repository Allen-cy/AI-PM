-- P25: encrypt user-provided AI and Feishu credentials in the application tier.
-- Existing plaintext is retained only for a bounded migration window. The next
-- successful save decrypts/reads it once, writes AES-256-GCM ciphertext, and
-- clears the legacy column.

alter table public.user_ai_settings
  add column if not exists api_key_encrypted text,
  add column if not exists credential_key_version smallint;

alter table public.user_feishu_connections
  add column if not exists app_secret_encrypted text,
  add column if not exists app_secret_last4 text,
  add column if not exists app_secret_key_version smallint,
  add column if not exists base_token_encrypted text,
  add column if not exists base_token_last4 text,
  add column if not exists base_token_key_version smallint;

update public.user_ai_settings
set api_key_last4 = right(api_key, 4)
where api_key is not null
  and btrim(api_key) <> ''
  and coalesce(api_key_last4, '') = '';

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
    where conname = 'user_ai_settings_api_key_storage_ck'
      and conrelid = 'public.user_ai_settings'::regclass
  ) then
    alter table public.user_ai_settings
      add constraint user_ai_settings_api_key_storage_ck
      check (
        not (api_key is not null and api_key_encrypted is not null)
        and (
          (api_key_encrypted is null and credential_key_version is null)
          or (
            api_key_encrypted ~ '^cred:v1:k[1-9][0-9]{0,3}:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'
            and credential_key_version between 1 and 9999
            and split_part(api_key_encrypted, ':', 3) = 'k' || credential_key_version::text
          )
        )
      );
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

comment on column public.user_ai_settings.api_key_encrypted is
  'Application-tier AES-256-GCM credential envelope; never return through a user-facing API.';
comment on column public.user_ai_settings.credential_key_version is
  'Version of the server-side credential-encryption root key.';
comment on column public.user_feishu_connections.app_secret_encrypted is
  'Application-tier AES-256-GCM credential envelope bound to user and field.';
comment on column public.user_feishu_connections.base_token_encrypted is
  'Application-tier AES-256-GCM credential envelope bound to user and field.';

alter table public.user_ai_settings enable row level security;
alter table public.user_feishu_connections enable row level security;
revoke all privileges on public.user_ai_settings from anon, authenticated;
revoke all privileges on public.user_feishu_connections from anon, authenticated;
revoke select (api_key, api_key_encrypted) on public.user_ai_settings from anon, authenticated;
revoke select (app_secret, app_secret_encrypted, base_token, base_token_encrypted)
  on public.user_feishu_connections from anon, authenticated;
