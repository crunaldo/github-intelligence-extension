-- Migration: Configure default role/tier for new user registrations
-- Allows setting default_new_user_tier in public.remote_configs ('free' or 'pro').
-- Automatically assigns is_pro = true to new users when default_new_user_tier = 'pro'.

-- 1. Ensure remote_configs has default_new_user_tier set to 'free' by default
insert into public.remote_configs (key, value, description)
values ('default_new_user_tier', '"free"'::jsonb, 'Default membership tier for new user registrations (free or pro)')
on conflict (key) do nothing;

-- 2. Update private.handle_new_auth_user() to check default_new_user_tier
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_owner_admin boolean := (
    coalesce(new.raw_app_meta_data->>'provider', '') = 'github'
    and coalesce(new.raw_user_meta_data->>'provider_id', '') = '298591399'
  );
  v_default_tier text := 'free';
  v_is_pro boolean := false;
begin
  -- Read default tier policy from remote_configs
  select (value #>> '{}') into v_default_tier
  from public.remote_configs
  where key = 'default_new_user_tier' or key = 'default_user_role'
  limit 1;

  if is_owner_admin or coalesce(v_default_tier, 'free') = 'pro' then
    v_is_pro := true;
  end if;

  insert into public.profiles (id, email, role, is_pro)
  values (
    new.id,
    coalesce(nullif(new.email, ''), new.raw_user_meta_data->>'user_name', ''),
    case when is_owner_admin then 'admin' else 'user' end,
    v_is_pro
  )
  on conflict (id) do update
    set email = case
      when excluded.email <> '' then excluded.email
      else public.profiles.email
    end,
    role = case
      when is_owner_admin then 'admin'
      else public.profiles.role
    end;
  return new;
end;
$$;
