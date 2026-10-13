-- Phase 3 step 6 — database guards for staff & roles.
-- A. Every school always keeps at least one active director (trigger).
-- B. role_permissions: someone who is not a director may not change their own
--    role and may only grant or remove permissions they hold themselves —
--    the same rule as the Server Actions, now also for direct API calls.
-- One migration = one transaction: the policies are never missing.

-- ===========================================================================
-- A. At least one active director per school
-- ===========================================================================
-- Guards UPDATEs only (deactivation, role change, school change). DELETE is
-- not guarded, so removing a whole school (cascade) still works; the app
-- never deletes accounts.
create or replace function private.keep_one_active_director()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only when an ACTIVE director of the school stops being one.
  if old.deactivated_at is not null or not exists (
       select 1 from public.roles r
       where r.id = old.role_id and r.key = 'director' and r.school_id = old.school_id) then
    return new;
  end if;
  if new.deactivated_at is null
     and new.school_id is not distinct from old.school_id
     and exists (
       select 1 from public.roles r
       where r.id = new.role_id and r.key = 'director' and r.school_id = new.school_id) then
    return new;
  end if;

  -- Lock the school row: two simultaneous changes in the same school run one
  -- after the other, so the second one sees the first (no race). In READ
  -- COMMITTED, the count below takes a fresh snapshot after the lock.
  perform 1 from public.schools s where s.id = old.school_id for update;

  if not exists (
       select 1
       from public.profiles p
       join public.roles r on r.id = p.role_id
       where p.school_id = old.school_id
         and p.id <> old.id
         and p.deactivated_at is null
         and r.key = 'director'
         and r.school_id = old.school_id) then
    raise exception 'school % must keep at least one active director', old.school_id
      using hint = 'last_active_director';
  end if;

  return new;
end;
$$;

revoke all on function private.keep_one_active_director() from public, anon, authenticated;

create trigger profiles_keep_one_active_director
  before update of deactivated_at, role_id, school_id on public.profiles
  for each row execute function private.keep_one_active_director();

-- ===========================================================================
-- B. No privilege escalation through role_permissions
-- ===========================================================================

-- Is the logged-in user an active director of an active school?
create or replace function private.is_director()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    join public.schools s on s.id = p.school_id
    where p.id = auth.uid()
      and p.deactivated_at is null
      and s.status = 'active'
      and r.key = 'director'
      and r.school_id = p.school_id
  );
$$;

-- The logged-in user's own role.
create or replace function private.current_role_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.role_id from public.profiles p where p.id = auth.uid();
$$;

revoke all on function private.is_director() from public, anon;
revoke all on function private.current_role_id() from public, anon;
grant execute on function private.is_director() to authenticated;
grant execute on function private.current_role_id() to authenticated;

-- Same conditions as before (platform owner, or roles.manage in own school on
-- any role except the built-in director role), plus: a non-director may not
-- touch their own role, and only permissions they hold.
drop policy role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('roles.manage'))
        and exists (select 1 from public.roles r
                    where r.id = role_id and not (r.is_system and r.key = 'director'))
        and ((select private.is_director())
             or (role_id <> (select private.current_role_id())
                 and private.has_permission(permission_key))))
  );

drop policy role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('roles.manage'))
        and exists (select 1 from public.roles r
                    where r.id = role_id and not (r.is_system and r.key = 'director'))
        and ((select private.is_director())
             or (role_id <> (select private.current_role_id())
                 and private.has_permission(permission_key))))
  );
