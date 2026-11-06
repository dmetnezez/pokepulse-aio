-- Inbox watcher: turn retailer "it's here / back in stock" emails into instant alerts.

alter table public.profiles
  add column if not exists email_watch_enabled    boolean not null default false,
  add column if not exists imap_host              text    not null default 'imap.gmail.com',
  add column if not exists imap_port              integer not null default 993,
  add column if not exists imap_user              text,
  add column if not exists imap_password          text,   -- use a provider "app password", never the account password
  add column if not exists email_watch_senders    text    not null default 'pokemoncenter.com',
  add column if not exists email_watch_keywords   text    not null default '',
  add column if not exists email_watch_last_uid   bigint,
  add column if not exists email_watch_status     text,
  add column if not exists email_watch_checked_at timestamptz;

-- A third data source: events triggered by a retailer email.
alter table public.products drop constraint if exists products_data_source_check;
alter table public.products add constraint products_data_source_check check (data_source in ('simulated','live','email'));
alter table public.monitoring_tasks drop constraint if exists monitoring_tasks_data_source_check;
alter table public.monitoring_tasks add constraint monitoring_tasks_data_source_check check (data_source in ('simulated','live'));
alter table public.stock_history drop constraint if exists stock_history_data_source_check;
alter table public.stock_history add constraint stock_history_data_source_check check (data_source in ('simulated','live','email'));
