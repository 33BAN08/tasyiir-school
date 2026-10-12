-- Phase 2 step 1 — schools are suspended, never deleted.
-- 1. Nobody can hard-delete a school or a plan through the Data API
--    (platform owner suspends schools and deactivates plans instead).
-- 2. Users of a suspended school lose access to all tenant data at the RLS
--    level: current_school_id() and has_permission() only see ACTIVE schools.
--    They can still read their own profile (id = auth.uid()), so the app can
--    show a "school suspended" page.

-- 1. No hard delete ---------------------------------------------------------
drop policy schools_delete on public.schools;
revoke delete on public.schools from authenticated;

drop policy plans_delete on public.plans;
revoke delete on public.plans from authenticated;

-- When a school was suspended (null while active).
alter table public.schools add column suspended_at timestamptz;
alter table public.schools add constraint schools_suspended_at_check
  check ((status = 'suspended') = (suspended_at is not null));

create index schools_status_idx on public.schools (status);

-- 2. Suspended school = no tenant access -----------------------------------
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
    and s.status = 'active';
$$;

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
      and s.status = 'active'
      and rp.permission_key = p_permission
  );
$$;
-- (create or replace keeps the existing grants: authenticated only.)
