-- Ensure repository owner (GitHub provider_id 298591399 / crunaldo) automatically receives
-- role = 'admin' and is_pro = true on first OAuth sign-in, and fall back to GitHub user_name
-- when a user's GitHub email is private.

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
begin
  insert into public.profiles (id, email, role, is_pro)
  values (
    new.id,
    coalesce(nullif(new.email, ''), new.raw_user_meta_data->>'user_name', ''),
    case when is_owner_admin then 'admin' else 'user' end,
    is_owner_admin
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
