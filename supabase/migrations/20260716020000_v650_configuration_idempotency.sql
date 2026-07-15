-- V6.5: make configuration writes replay-safe while retaining optimistic locking.
alter table public.role_ai_scan_schedules add column if not exists last_idempotency_key text;
alter table public.organization_feishu_connections add column if not exists last_idempotency_key text;

comment on column public.role_ai_scan_schedules.last_idempotency_key is 'Latest accepted client idempotency key; an exact replay returns the stored version without another mutation.';
comment on column public.organization_feishu_connections.last_idempotency_key is 'Latest accepted client idempotency key; an exact replay returns the stored version without another mutation.';
