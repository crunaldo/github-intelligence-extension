-- Migration: Add location column to user_feedback to know where feedback was submitted
alter table public.user_feedback add column if not exists location text;
create index if not exists idx_user_feedback_location on public.user_feedback(location);
