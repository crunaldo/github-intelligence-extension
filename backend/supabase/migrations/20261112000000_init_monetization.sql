-- Migration: Monetization, Edge Cache, Telemetry & Remote Config Schema
-- Spec Section 6: Supabase PostgreSQL Schema (Advisor-hardened for RLS & Least Privilege)

create schema if not exists private;

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  role text default 'user' check (role in ('user', 'admin')),
  lemon_customer_id text,
  is_pro boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  lemon_subscription_id text unique not null,
  status text not null,
  variant_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.repo_analyses (
  id uuid default gen_random_uuid() primary key,
  repo_full_name text not null,
  commit_sha text not null,
  summary_json jsonb not null,
  architecture_diagram text,
  primary_language text,
  provider_used text,
  tokens_consumed integer default 0,
  created_at timestamptz default now(),
  constraint uq_repo_commit unique (repo_full_name, commit_sha)
);

create table if not exists public.query_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
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

create table if not exists public.remote_configs (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz default now()
);

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_query_logs_user_id on public.query_logs(user_id);
create index if not exists idx_query_logs_created_at on public.query_logs(created_at desc);
create index if not exists idx_repo_analyses_created_at on public.repo_analyses(created_at desc);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

grant usage on schema private to supabase_auth_admin, authenticated, service_role;
grant execute on function private.handle_new_auth_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row
  execute function private.handle_new_auth_user();

insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
on conflict (id) do nothing;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

grant execute on function private.is_admin() to authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant all on table
  public.profiles,
  public.subscriptions,
  public.repo_analyses,
  public.query_logs,
  public.remote_configs
to service_role;

grant select, update on table public.profiles to authenticated;
grant select on table public.subscriptions, public.query_logs to authenticated;
grant select, insert, update, delete on table public.repo_analyses, public.remote_configs to authenticated;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.repo_analyses enable row level security;
alter table public.query_logs enable row level security;
alter table public.remote_configs enable row level security;

create policy "Users view own profile or admins view all"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_admin()));

create policy "Admins can update all profiles"
  on public.profiles for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Users view own subscriptions or admins view all"
  on public.subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Admins manage repo analyses"
  on public.repo_analyses for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy "Users view own query logs or admins view all"
  on public.query_logs for select
  to authenticated
  using ((select auth.uid()) = user_id or (select private.is_admin()));

create policy "Admins manage remote configs"
  on public.remote_configs for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

insert into public.remote_configs (key, value, description)
values
  ('free_daily_limit', '15'::jsonb, 'Límite diario de consultas gratuitas por IP + huella'),
  ('pro_daily_limit', '250'::jsonb, 'Bolsa diaria unificada de consultas Pro (análisis + mascota)'),
  ('provider_priority', '["gemini", "groq", "cfAi", "openRouter"]'::jsonb, 'Orden de prioridad de proveedores LLM en Edge'),
  ('feature_flags', '{"mascot_enabled": true, "diagrams_enabled": true, "maintenance_mode": false, "banner_message": ""}'::jsonb, 'Interruptores globales de funcionalidades y mantenimiento'),
  ('system_prompt_repo', '"You are GitHub Project Intelligence, a principal software architect. Analyze the repository README and package manifests objectively, explaining what the project genuinely does, why it matters, practical real-world use cases, target audience, technology stack, Mermaid architecture diagram, and engineering strengths/concerns."'::jsonb, 'Prompt base del analizador de repositorios'),
  ('system_prompt_mascot', '"You are Octo, the intelligent GitHub repository assistant mascot. Answer questions concisely and accurately about the active GitHub repository. Reference concrete files, architecture patterns, and stack details from the repository context when available."'::jsonb, 'Prompt base del chat con la mascota flotante')
on conflict (key) do nothing;
