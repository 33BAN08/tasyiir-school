-- Phase 3 step 1 — staff accounts: email on profiles + deactivation.
-- 1. profiles.email: a copy of auth.users.email, so the director's staff list
--    can show and search emails through RLS (auth.users is not exposed).
--    Kept in sync by a trigger on auth.users. Users cannot write it (no column grant).
-- 2. profiles.deactivated_at: a deactivated account loses ALL tenant access at
--    the RLS level, immediately (even with a still-valid JWT). The server also
--    bans the user in Supabase Auth, so they cannot sign in or refresh.
--    They can still read their own profile (id = auth.uid()), so the app can
--    sign them out with a clear message.

-- 1. Email ------------------------------------------------------------------
alter table public.profiles add column email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id;

create index profiles_school_email_idx on public.profiles (school_id, email);

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_profile_email() from public, anon, authenticated;

create trigger on_auth_user_email_change
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- 2. Deactivation -----------------------------------------------------------
alter table public.profiles add column deactivated_at timestamptz;

-- A partial index: "active staff of my school" is the common lookup.
create index profiles_school_active_idx on public.profiles (school_id)
  where deactivated_at is null;

-- Deactivated profile = no school, like a suspended school.
create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.id = auth.uid()
    and p.deactivated_at is null
    and s.status = 'active';
$$;

-- Deactivated profile = no permission.
create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.schools s on s.id = p.school_id
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid()
      and p.deactivated_at is null
      and s.status = 'active'
      and rp.permission_key = p_permission
  );
$$;
-- (create or replace keeps the existing grants: authenticated only.)
-- No new grants: email and deactivated_at are written server-side only
-- (secret key); the profiles column grant still limits users to
-- full_name, phone, avatar_url, locale.
