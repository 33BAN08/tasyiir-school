-- Launch prep step 2c — demo school: flag, locks, nightly reset.
--
-- 1. schools.is_demo. Only the secret key / postgres can set or clear it (the
--    platform owner, who may update schools, cannot). One real demo school
--    ("École Démo Tasyir", found by its slug by the seed script); no unique
--    index, so the test suites can make their own demo school next to it.
--    A "demo account" = any profile of a demo school (3 in the real one).
-- 2. Locks while the flag is ON (seed script: create school with the flag OFF,
--    create the 3 accounts, turn it ON, call run_demo_reset(school); password rotation
--    / teardown: turn it OFF first, then ON again):
--    a. auth.users of demo accounts: no change of email / phone / password /
--       ban, no recovery / confirmation / email-change / reauthentication
--       token (= no "forgot password", magic link or email-change mail is
--       recorded), no delete. Sign-in still updates last_sign_in_at etc.
--    b. profiles of the demo school: no insert (= no new staff or parent
--       account, whatever the path), no delete, no change except `locale`
--       (the language switch).
--    c. roles / role_permissions of the demo school: read-only (a visitor
--       cannot strip the director role for the next visitor).
--    b + c refuse anon, authenticated and service_role, but let current_user
--    = postgres through: migrations (backfill every profile, add a permission
--    to every school's roles), the postgres-owned DEFINER functions and FK
--    cascades (they run as the table owner) never fail on the demo school.
--    d. Storage: no upload into the demo school's folder (student photos,
--       justification notes): visitors must not leave real children's photos
--       or documents, and SQL cannot remove Storage files at night.
--    e. auth.mfa_factors: a demo account cannot enrol a second factor (one
--       visitor would lock every other one out).
-- 3. Nightly reset: pg_cron hourly → acts at 03:00 Africa/Casablanca (database
--    clock): deletes every row of the demo school's data, keeps the school,
--    its 3 accounts, roles, modules and subscription, then refills it with
--    private.demo_fill() (the demo content, next migration; a no-op until then).
--    Every school with the flag is reset (the real one + a test suite's, if any).
-- 4. No subscription reminder ever for a demo school (send_subscription_reminders).

-- ===========================================================================
-- 1. Flag
-- ===========================================================================
alter table public.schools add column is_demo boolean not null default false;

-- authenticated holds table-level INSERT / UPDATE on schools (platform owner
-- through RLS), so a column revoke would not hold: guard with a trigger.
-- SECURITY INVOKER on purpose: current_user is the API role.
create or replace function private.schools_demo_flag_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.is_demo)
     or (tg_op = 'UPDATE' and new.is_demo is distinct from old.is_demo) then
    if current_user in ('anon', 'authenticated') then
      raise exception 'demo flag is set by the platform scripts only'
        using errcode = '42501', hint = 'demo_flag_locked';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.schools_demo_flag_guard() from public, anon, authenticated;

create trigger schools_demo_flag_guard
  before insert or update of is_demo on public.schools
  for each row execute function private.schools_demo_flag_guard();

-- Helpers (DEFINER: called from triggers on auth.users, run as supabase_auth_admin).
create or replace function private.is_demo_school(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.is_demo from public.schools s where s.id = p_school), false);
$$;

create or replace function private.is_demo_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.schools s on s.id = p.school_id
    where p.id = p_user and s.is_demo
  );
$$;

-- Storage paths start with the school id ('<school>/...'); text compare, so a
-- folder that is not a uuid never raises.
create or replace function private.is_demo_school_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.schools s where s.is_demo and s.id::text = p_folder);
$$;

revoke all on function private.is_demo_school(uuid) from public, anon, authenticated;
-- The profile / role locks are SECURITY INVOKER (so current_user is the caller):
-- they call this helper as authenticated or service_role.
grant usage on schema private to service_role;
grant execute on function private.is_demo_school(uuid) to authenticated, service_role;
revoke all on function private.is_demo_account(uuid) from public, anon, authenticated;
revoke all on function private.is_demo_school_folder(text) from public, anon;
grant execute on function private.is_demo_school_folder(text) to authenticated;

-- ===========================================================================
-- 2a. Auth accounts
-- ===========================================================================
create or replace function private.demo_auth_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_demo_account(old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'demo accounts cannot be deleted' using errcode = '42501', hint = 'demo_locked';
  end if;
  if new.email is distinct from old.email
     or new.phone is distinct from old.phone
     or new.encrypted_password is distinct from old.encrypted_password
     or new.banned_until is distinct from old.banned_until
     or new.deleted_at is distinct from old.deleted_at
     -- coalesce: an Auth upgrade that backfills NULL → '' is not a change.
     or coalesce(new.email_change, '') <> coalesce(old.email_change, '')
     or coalesce(new.email_change_token_new, '') <> coalesce(old.email_change_token_new, '')
     or coalesce(new.email_change_token_current, '') <> coalesce(old.email_change_token_current, '')
     or coalesce(new.phone_change, '') <> coalesce(old.phone_change, '')
     or coalesce(new.phone_change_token, '') <> coalesce(old.phone_change_token, '')
     or coalesce(new.recovery_token, '') <> coalesce(old.recovery_token, '')
     or coalesce(new.confirmation_token, '') <> coalesce(old.confirmation_token, '')
     or coalesce(new.reauthentication_token, '') <> coalesce(old.reauthentication_token, '') then
    raise exception 'demo accounts are locked' using errcode = '42501', hint = 'demo_locked';
  end if;
  return new;
end;
$$;

revoke all on function private.demo_auth_lock() from public, anon, authenticated;

create trigger demo_auth_lock
  before update or delete on auth.users
  for each row execute function private.demo_auth_lock();

-- 2e. No second factor on a demo account (TOTP, phone, WebAuthn: one table).
create or replace function private.demo_mfa_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_demo_account(new.user_id) then
    raise exception 'demo accounts cannot enrol a second factor' using errcode = '42501', hint = 'demo_locked';
  end if;
  return new;
end;
$$;

revoke all on function private.demo_mfa_lock() from public, anon, authenticated;

create trigger demo_mfa_lock
  before insert on auth.mfa_factors
  for each row execute function private.demo_mfa_lock();

-- ===========================================================================
-- 2b. Profiles of the demo school
-- ===========================================================================
create or replace function private.demo_profiles_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if private.is_demo_school(new.school_id) then
      raise exception 'no new account in the demo school' using errcode = '42501', hint = 'demo_locked';
    end if;
    return new;
  end if;

  if not private.is_demo_school(old.school_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'demo accounts cannot be deleted' using errcode = '42501', hint = 'demo_locked';
  end if;
  -- Only the interface language may change (updated_at follows it).
  if (to_jsonb(new) - 'locale' - 'updated_at') is distinct from (to_jsonb(old) - 'locale' - 'updated_at') then
    raise exception 'demo accounts are locked' using errcode = '42501', hint = 'demo_locked';
  end if;
  return new;
end;
$$;

revoke all on function private.demo_profiles_lock() from public, anon, authenticated;

create trigger profiles_demo_lock
  before insert or update or delete on public.profiles
  for each row execute function private.demo_profiles_lock();

-- ===========================================================================
-- 2c. Roles of the demo school
-- ===========================================================================
-- Template roles (school_id null) are never concerned. A school created with
-- the flag OFF gets its roles seeded normally; the flag goes ON afterwards.
create or replace function private.demo_roles_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if private.is_demo_school(case when tg_op = 'DELETE' then old.school_id else new.school_id end)
     or (tg_op = 'UPDATE' and private.is_demo_school(old.school_id)) then
    raise exception 'demo roles are locked' using errcode = '42501', hint = 'demo_locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.demo_roles_lock() from public, anon, authenticated;

create trigger roles_demo_lock
  before insert or update or delete on public.roles
  for each row execute function private.demo_roles_lock();

-- role_permissions: its school_id is filled by role_permissions_set_school,
-- which fires AFTER this one (triggers run by name), so look at the role.
create or replace function private.demo_role_permissions_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'postgres' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Reads roles as the caller: a role the caller cannot see is not theirs to change.
  if exists (
       select 1 from public.roles r
       where r.id in (case when tg_op = 'INSERT' then null else old.role_id end,
                      case when tg_op = 'DELETE' then null else new.role_id end)
         and private.is_demo_school(r.school_id)) then
    raise exception 'demo roles are locked' using errcode = '42501', hint = 'demo_locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.demo_role_permissions_lock() from public, anon, authenticated;

create trigger role_permissions_demo_lock
  before insert or update or delete on public.role_permissions
  for each row execute function private.demo_role_permissions_lock();

-- ===========================================================================
-- 2d. No upload into the demo school's folders (every bucket)
-- ===========================================================================
-- RESTRICTIVE: ANDed with the existing permissive policies, which stay as they are.
create policy demo_no_upload on storage.objects
  as restrictive
  for insert to authenticated
  with check (not (select private.is_demo_school_folder((storage.foldername(name))[1])));

create policy demo_no_overwrite on storage.objects
  as restrictive
  for update to authenticated
  using (not (select private.is_demo_school_folder((storage.foldername(name))[1])));

-- ===========================================================================
-- 3. Nightly reset
-- ===========================================================================
-- The demo content. Replaced by the next migration (demo content); until then
-- a reset leaves the demo school empty.
create or replace function private.demo_fill(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  null;
end;
$$;

revoke all on function private.demo_fill(uuid) from public, anon, authenticated;

-- Deletes one demo school's data in dependency order, then refills it.
-- Kept: the school row, profiles (3 accounts), roles / role_permissions,
-- school_modules, school_subscriptions, alert_rules + school_contacts rows
-- (demo_fill puts their values back). Notices / alert events go first, so
-- deleting absences sends no "correction"; notifications and audit_logs go
-- last (deleting remarks writes audit rows).
create or replace function private.reset_demo_school(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  select s.id into v_school from public.schools s where s.id = p_school and s.is_demo for update;
  if v_school is null then
    raise exception 'not a demo school' using errcode = '22023', hint = 'demo_not_found';
  end if;

  delete from public.absence_notices      where school_id = v_school;
  delete from public.alert_events         where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.announcements        where school_id = v_school;  -- targets cascade
  delete from public.student_remarks      where school_id = v_school;
  delete from public.justifications       where school_id = v_school;
  delete from public.attendance_marks     where school_id = v_school;
  delete from public.attendance_sessions  where school_id = v_school;
  delete from public.lessons              where school_id = v_school;
  delete from public.teacher_subjects     where school_id = v_school;
  delete from public.student_guardians    where school_id = v_school;
  delete from public.guardians            where school_id = v_school;
  delete from public.student_enrollments  where school_id = v_school;
  delete from public.students             where school_id = v_school;
  delete from public.classes              where school_id = v_school;
  delete from public.time_slots           where school_id = v_school;
  delete from public.school_days          where school_id = v_school;
  delete from public.academic_years       where school_id = v_school;
  delete from public.rooms                where school_id = v_school;
  delete from public.subjects             where school_id = v_school;
  delete from public.tracks               where school_id = v_school;
  delete from public.levels               where school_id = v_school;
  delete from public.subscription_reminders where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.audit_logs           where school_id = v_school;

  perform private.demo_fill(v_school);
end;
$$;

revoke all on function private.reset_demo_school(uuid) from public, anon, authenticated;

-- Every demo school; returns how many were reset.
create or replace function private.reset_demo_schools()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
  v_count integer := 0;
begin
  for v_school in select s.id from public.schools s where s.is_demo order by s.created_at loop
    perform private.reset_demo_school(v_school);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.reset_demo_schools() from public, anon, authenticated;

create or replace function private.reset_demo_school_if_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if extract(hour from now() at time zone 'Africa/Casablanca') = 3 then
    return private.reset_demo_schools();
  end if;
  return 0;
end;
$$;

revoke all on function private.reset_demo_school_if_due() from public, anon, authenticated;

-- Seed script (first fill) and tests pass their own demo school; secret key only.
create function public.run_demo_reset(p_school uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.reset_demo_school(p_school);
$$;

revoke all on function public.run_demo_reset(uuid) from public, anon, authenticated;
grant execute on function public.run_demo_reset(uuid) to service_role;

select cron.schedule(
  'tasyir-demo-reset',
  '0 * * * *',
  $$select private.reset_demo_school_if_due()$$
);

-- ===========================================================================
-- 4. No subscription reminder for a demo school
-- ===========================================================================
-- Body copied from the DATABASE (pg_get_functiondef, 2026-10-23), only change:
-- `and not sc.is_demo` in subs (neither its directors nor the platform owners
-- are told about the demo school's subscription).
create or replace function private.send_subscription_reminders(p_today date default private.school_today(), p_schools uuid[] default null::uuid[])
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sent integer;
begin
  with subs as (
    select s.id, s.school_id, s.status, sc.name as school_name, sc.status as school_status,
           pl.name as plan_name,
           case when s.status = 'trial' then (s.trial_ends_at at time zone 'Africa/Casablanca')::date
                else s.end_date end as last_day
    from public.school_subscriptions s
    join public.schools sc on sc.id = s.school_id
    join public.plans pl on pl.id = s.plan_id
    where s.status in ('trial', 'active')
      and not sc.is_demo
      and (p_schools is null or s.school_id = any (p_schools))
  ), due as (
    select su.*, su.last_day - p_today as days_left,
           case when su.last_day - p_today = 0 then 0
                when su.last_day - p_today = 1 then 1
                when su.last_day - p_today <= 7 then 7
                else 30 end as step
    from subs su
    where su.last_day - p_today between 0 and 30
  ), recorded as (
    insert into public.subscription_reminders (subscription_id, school_id, last_day, step, days_left)
    select d.id, d.school_id, d.last_day, d.step, d.days_left
    from due d
    on conflict (subscription_id, last_day, step) do nothing
    returning subscription_id, last_day
  ), told as (
    insert into public.notifications (school_id, recipient_id, type, data)
    select rc.school_id, rc.id, 'subscription_expiring',
           jsonb_build_object('school_id', d.school_id, 'school_name', d.school_name,
                              'plan', d.plan_name, 'status', d.status,
                              'last_day', d.last_day, 'days_left', d.days_left)
    from recorded r
    join due d on d.id = r.subscription_id and d.last_day = r.last_day
    cross join lateral (
      -- the school's directors (school active)
      select p.id, d.school_id
      from public.profiles p
      join public.roles ro on ro.id = p.role_id and ro.school_id = d.school_id and ro.key = 'director'
      where p.school_id = d.school_id and d.school_status = 'active'
        and p.deactivated_at is null and p.must_change_password = false
      union all
      -- every platform owner (no school)
      select p.id, null::uuid
      from public.profiles p
      join public.roles ro on ro.id = p.role_id and ro.school_id is null and ro.key = 'platform_owner'
      where p.school_id is null and p.deactivated_at is null
    ) rc
  )
  select count(*) into v_sent from recorded;
  return v_sent;
end;
$function$;
