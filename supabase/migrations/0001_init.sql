-- PokéPulse AIO — initial schema
-- Apply with `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ───────────────────────────── Users ─────────────────────────────
-- Authentication lives in auth.users (Supabase Auth). `profiles` holds app-level user data
-- and per-user monitoring / notification preferences.
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text not null,
  display_name           text not null default '',
  alert_email            text,
  discord_webhook_url    text,
  telegram_bot_token     text,
  telegram_chat_id       text,
  browser_notifications  boolean not null default true,
  default_frequency_sec  integer not null default 60 check (default_frequency_sec >= 15),
  quiet_hours_start      smallint check (quiet_hours_start between 0 and 23),
  quiet_hours_end        smallint check (quiet_hours_end between 0 and 23),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Auto-create a profile row when a user signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, alert_email)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────────── Retailers ─────────────────────────────
create table if not exists public.retailers (
  id                  text primary key,                 -- e.g. 'bestbuy-ca'
  name                text not null,
  domain              text not null,
  country             text not null default 'CA',
  integration_type    text not null check (integration_type in ('official_api','affiliate_api','partner_feed','none')),
  integration_status  text not null check (integration_status in ('available','requires_credentials','not_available')),
  integration_notes   text not null default '',
  min_interval_sec    integer not null default 60,      -- floor for any task's frequency
  max_concurrency     integer not null default 2,       -- parallel requests allowed per retailer
  request_spacing_ms  integer not null default 1000,    -- min gap between requests
  brand_color         text not null default '#8b5cf6',
  created_at          timestamptz not null default now()
);

-- ───────────────────────────── Products ─────────────────────────────
-- One row per retailer listing (the same SKU at two retailers = two products).
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  category         text not null check (category in ('etb','booster-box','booster-bundle','collection-box','premium-collection','pokemon-151','special-set','japanese')),
  set_name         text not null default '',
  language         text not null default 'EN',
  retailer_id      text not null references public.retailers(id),
  url              text not null,
  external_id      text,                                -- ASIN / SKU when known
  image_url        text,
  msrp             numeric(10,2),
  current_price    numeric(10,2),
  previous_price   numeric(10,2),
  stock_status     text not null default 'unknown' check (stock_status in ('in_stock','out_of_stock','limited','preorder','unknown')),
  data_source      text not null default 'simulated' check (data_source in ('simulated','live')),
  last_restock_at  timestamptz,
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now(),
  unique (retailer_id, url)
);
create index if not exists products_category_idx on public.products(category);
create index if not exists products_retailer_idx on public.products(retailer_id);

create table if not exists public.favourites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ───────────────────────────── Monitoring tasks ─────────────────────────────
create table if not exists public.monitoring_tasks (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  product_id          uuid not null references public.products(id) on delete cascade,
  product_name        text not null,
  product_url         text not null,
  retailer_id         text not null references public.retailers(id),
  max_price           numeric(10,2),
  quantity            integer not null default 1 check (quantity between 1 and 20),
  frequency_sec       integer not null default 60 check (frequency_sec >= 15),
  data_source         text not null default 'simulated' check (data_source in ('simulated','live')),
  notify_discord      boolean not null default true,
  notify_browser      boolean not null default true,
  notify_email        boolean not null default false,
  notify_telegram     boolean not null default false,
  is_active           boolean not null default true,
  status              text not null default 'monitoring' check (status in ('monitoring','restock_detected','out_of_stock','paused','error')),
  last_checked_at     timestamptz,
  next_check_at       timestamptz not null default now(),
  last_price          numeric(10,2),
  last_in_stock       boolean,
  check_count         integer not null default 0,
  restock_count       integer not null default 0,
  consecutive_errors  integer not null default 0,
  error_message       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists tasks_user_idx on public.monitoring_tasks(user_id);
-- The scheduler's hot path: "active tasks that are due".
create index if not exists tasks_due_idx on public.monitoring_tasks(next_check_at) where is_active;

-- ───────────────────────────── Stock history ─────────────────────────────
create table if not exists public.stock_history (
  id           bigserial primary key,
  product_id   uuid not null references public.products(id) on delete cascade,
  retailer_id  text not null references public.retailers(id),
  price        numeric(10,2),
  stock_status text not null,
  in_stock     boolean not null,
  event_type   text not null check (event_type in ('check','restock','sold_out','price_change')),
  data_source  text not null check (data_source in ('simulated','live')),
  latency_ms   integer,
  checked_at   timestamptz not null default now()
);
create index if not exists stock_history_product_idx on public.stock_history(product_id, checked_at desc);
create index if not exists stock_history_events_idx on public.stock_history(checked_at desc) where event_type <> 'check';

-- ───────────────────────────── Notifications ─────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid references public.monitoring_tasks(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  channel     text not null check (channel in ('discord','browser','email','telegram')),
  status      text not null check (status in ('sent','failed','skipped','queued')),
  title       text not null,
  body        text not null,
  payload     jsonb not null default '{}'::jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

-- ───────────────────────────── Purchase activity ─────────────────────────────
-- Records what the user did in the purchase assistant. No payment data is ever stored.
create table if not exists public.purchase_activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid references public.monitoring_tasks(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  action      text not null check (action in ('opened_page','prepared','checkout_ready','purchased','cancelled')),
  quantity    integer not null default 1,
  unit_price  numeric(10,2),
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists purchase_user_idx on public.purchase_activity(user_id, created_at desc);

-- ───────────────────────────── Monitoring logs ─────────────────────────────
create table if not exists public.task_logs (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  task_id     uuid references public.monitoring_tasks(id) on delete cascade,
  level       text not null check (level in ('debug','info','warn','error')),
  message     text not null,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists task_logs_user_idx on public.task_logs(user_id, created_at desc);
create index if not exists task_logs_task_idx on public.task_logs(task_id, created_at desc);

-- ───────────────────────────── Row-level security ─────────────────────────────
-- The Next.js API and the worker use the service-role key and always scope by user_id.
-- RLS protects the tables if the anon key is used directly from a browser.
alter table public.profiles          enable row level security;
alter table public.retailers         enable row level security;
alter table public.products          enable row level security;
alter table public.favourites        enable row level security;
alter table public.monitoring_tasks  enable row level security;
alter table public.stock_history     enable row level security;
alter table public.notifications     enable row level security;
alter table public.purchase_activity enable row level security;
alter table public.task_logs         enable row level security;

create policy "profiles: own row"        on public.profiles          for all    using (auth.uid() = id) with check (auth.uid() = id);
create policy "retailers: read"          on public.retailers         for select using (auth.role() = 'authenticated');
create policy "products: read"           on public.products          for select using (auth.role() = 'authenticated');
create policy "stock_history: read"      on public.stock_history     for select using (auth.role() = 'authenticated');
create policy "favourites: own"          on public.favourites        for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks: own"               on public.monitoring_tasks  for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications: own"       on public.notifications     for select using (auth.uid() = user_id);
create policy "purchases: own"           on public.purchase_activity for all    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs: own"                on public.task_logs         for select using (auth.uid() = user_id);

-- ───────────────────────────── Retention ─────────────────────────────
-- Routine 'check' rows grow fastest; keep 30 days of them (events are kept forever).
-- Schedule with pg_cron:  select cron.schedule('prune-checks','17 4 * * *', $$select public.prune_stock_checks()$$);
create or replace function public.prune_stock_checks() returns void language sql as $$
  delete from public.stock_history where event_type = 'check' and checked_at < now() - interval '30 days';
  delete from public.task_logs where level = 'debug' and created_at < now() - interval '7 days';
$$;
