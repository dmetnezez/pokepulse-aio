-- "Real data only" mode: hide simulated data and stop simulating this user's tasks.
alter table public.profiles add column if not exists real_only boolean not null default false;
