
alter table public.notification_settings
  add column if not exists email_enabled boolean not null default false,
  add column if not exists email_recipients jsonb not null default '[]'::jsonb;
