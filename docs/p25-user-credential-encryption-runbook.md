# P25 用户敏感配置加密与清理手册

## 保护范围

- `user_ai_settings.api_key`：用户自定义 AI 模型密钥。
- `user_feishu_connections.app_secret`：用户个人飞书应用密钥。
- `user_feishu_connections.base_token`：用户多维表格 App Token。

服务端使用 AES-256-GCM，每次加密使用独立 96 bit IV，密文同时绑定用户 ID、数据表和字段，防止密文被复制到其他用户或字段后重放。API 只返回“已配置”和末四位掩码，不回显明文或密文。

## 上线步骤

1. 在 Vercel Production、Preview 及本地需要的环境中配置 `CREDENTIAL_ENCRYPTION_KEY`，建议使用独立、随机、至少 32 字符的服务端密钥。如不配置，系统改用 `AUTH_SESSION_SECRET`派生加密密钥。
2. 配置 `CREDENTIAL_ENCRYPTION_KEY_VERSION=1`。不得使用 `NEXT_PUBLIC_` 前缀。
3. 在 Supabase SQL Editor 执行 `supabase/migrations/20260710071709_p25_encrypt_user_credentials.sql`。
4. 部署新版本。现有明文行仅在迁移期可读；用户下一次保存 AI 或飞书配置时，系统会自动写入密文并清空明文列。
5. 请用测试账号分别执行一次“保存 AI 模型配置”和“保存个人飞书配置”，再执行连接测试。

## 迁移期检查与清理

先检查还有多少历史明文：

```sql
select
  (select count(*) from public.user_ai_settings where api_key is not null) as ai_plaintext_rows,
  (select count(*) from public.user_feishu_connections where app_secret is not null) as feishu_secret_plaintext_rows,
  (select count(*) from public.user_feishu_connections where base_token is not null) as feishu_token_plaintext_rows;
```

只有当三个数量均为 `0`，且已完成生产连接测试后，才执行最终约束：

```sql
alter table public.user_ai_settings
  add constraint user_ai_settings_legacy_plaintext_empty_ck
  check (api_key is null) not valid;
alter table public.user_ai_settings
  validate constraint user_ai_settings_legacy_plaintext_empty_ck;

alter table public.user_feishu_connections
  add constraint user_feishu_connections_legacy_plaintext_empty_ck
  check (app_secret is null and base_token is null) not valid;
alter table public.user_feishu_connections
  validate constraint user_feishu_connections_legacy_plaintext_empty_ck;
```

不要在尚有明文行时盲目执行 `update ... set api_key = null`：数据库无法读取 Vercel 中的加密根密钥，必须由应用服务器完成加密迁移。

## 密钥轮换

1. 保留旧密钥，例如 `CREDENTIAL_ENCRYPTION_KEY_V1=<旧密钥>`。
2. 设置新的 `CREDENTIAL_ENCRYPTION_KEY=<新密钥>` 和 `CREDENTIAL_ENCRYPTION_KEY_VERSION=2`。
3. 重新部署。用户下一次保存配置时会使用新版本重新加密。
4. 当数据库中已无 `key_version=1` 的密文后，再删除 `CREDENTIAL_ENCRYPTION_KEY_V1`。

如提前删除旧版密钥，旧密文将无法恢复。
