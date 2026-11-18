-- Migration: Monetization, Edge Cache, Telemetry & Remote Config Schema
-- Spec Section 6: Supabase PostgreSQL Schema

-- Perfiles de usuario vinculados a Supabase Auth
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text default 'user' check (role in ('user', 'admin')),
  lemon_customer_id text,
  is_pro boolean default false,
  created_at timestamptz default now()
);

-- Suscripciones de Lemon Squeezy
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  lemon_subscription_id text unique not null,
  status text not null, -- 'active', 'past_due', 'cancelled', 'expired'
  variant_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Caché global de análisis de repositorios
create table if not exists repo_analyses (
  id uuid default gen_random_uuid() primary key,
  repo_full_name text not null, -- 'owner/repo'
  commit_sha text not null,
  summary_json jsonb not null,
  architecture_diagram text,
  primary_language text,
  provider_used text,
  tokens_consumed integer default 0,
  created_at timestamptz default now(),
  constraint uq_repo_commit unique (repo_full_name, commit_sha)
);

create index if not exists idx_repo_commit on repo_analyses(repo_full_name, commit_sha);

-- Telemetría y logs de consultas
create table if not exists query_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete set null,
  client_fingerprint text,
  ip_hash text not null,
  repo_full_name text not null,
  is_pro boolean default false,
  cache_hit boolean default false,
  provider text,
  action_type text default 'analysis' check (action_type in ('analysis', 'mascot_chat')),
  response_time_ms integer,
  created_at timestamptz default now()
);

-- Configuración Remota & Prompts (Sincronizado a Cloudflare KV)
create table if not exists remote_configs (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

-- Supporting indexes for dashboard queries and foreign-key lookups
create index if not exists idx_subscriptions_user_id on subscriptions(user_id);
create index if not exists idx_query_logs_user_id on query_logs(user_id);
create index if not exists idx_query_logs_created_at on query_logs(created_at desc);

-- Sync new and updated Supabase Auth users into public.profiles
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row
  execute function public.handle_new_auth_user();

insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
on conflict (id) do nothing;

-- Helper function to check admin role without triggering recursive RLS checks on profiles
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Enable Row Level Security across all tables
alter table profiles enable row level security;
alter table subscriptions enable row level security;
alter table repo_analyses enable row level security;
alter table query_logs enable row level security;
alter table remote_configs enable row level security;

-- Profiles RLS policies
create policy "Users can view their own profile"
  on profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on profiles for select
  to authenticated
  using (public.is_admin());

create policy "Admins can update all profiles"
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Subscriptions RLS policies
create policy "Users can view their own subscriptions"
  on subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view all subscriptions"
  on subscriptions for select
  to authenticated
  using (public.is_admin());

-- Repo analyses RLS policies (admins only; Edge Worker reads/writes via service_role)
create policy "Admins can read repo analyses"
  on repo_analyses for select
  to authenticated
  using (public.is_admin());

create policy "Admins can manage repo analyses"
  on repo_analyses for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Query logs RLS policies
create policy "Users can view their own query logs"
  on query_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view all query logs"
  on query_logs for select
  to authenticated
  using (public.is_admin());

-- Remote configs RLS policies (admins only; Edge Worker serves public /v1/config from KV)
create policy "Admins can read remote configs"
  on remote_configs for select
  to authenticated
  using (public.is_admin());

create policy "Admins can manage remote configs"
  on remote_configs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
