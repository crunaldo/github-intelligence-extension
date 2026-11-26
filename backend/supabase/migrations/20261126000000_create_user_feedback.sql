-- Migration: Create user_feedback table for CSAT & User Satisfaction tracking
create table if not exists public.user_feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  client_fingerprint text,
  repo text not null,
  rating text not null check (rating in ('positive', 'negative')),
  category text default 'general' check (category in ('accuracy', 'diagram', 'mascot', 'speed', 'general')),
  comment text,
  provider text,
  created_at timestamptz default now()
);

create index if not exists idx_user_feedback_created_at on public.user_feedback(created_at desc);
create index if not exists idx_user_feedback_repo on public.user_feedback(repo);
create index if not exists idx_user_feedback_rating on public.user_feedback(rating);

alter table public.user_feedback enable row level security;

-- Allow anyone to insert feedback (both authenticated users and anonymous visitors)
create policy "Allow insert user_feedback" on public.user_feedback
  for insert
  with check (true);

-- Allow authenticated users, admins, and service role to read feedback
create policy "Allow select user_feedback" on public.user_feedback
  for select
  using (true);
