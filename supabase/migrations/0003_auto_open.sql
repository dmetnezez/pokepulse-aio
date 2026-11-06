-- Open the drop page in the user's browser when a drop email arrives (local installs only).
alter table public.profiles add column if not exists auto_open_links boolean not null default false;
