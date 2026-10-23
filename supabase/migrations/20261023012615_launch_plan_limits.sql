-- Launch prep step 2a: plan limits (students, admin accounts), enforced by the database.
--
-- * plans.max_admin_accounts (null = unlimited); limits and prices set by plan key.
-- * school_subscriptions.max_students_override / max_admins_override: the platform
--   owner's per-school exception ("> 800 on quote", founding deals).
-- * Only ADDING is refused. A school above its limit (downgrade, lowered override)
--   keeps its data; it just cannot add more.
-- * An "admin account" = an active staff profile whose role is not teacher, parent,
--   student or driver (director, surveillant, accountant, transport manager, custom).
-- * A school with no trial / active subscription has no limit here (its modules
--   are already off).
-- * A per-school advisory lock serialises the count + insert, so two imports at
--   once cannot both slip under the limit.

alter table public.plans
  add column max_admin_accounts int
    constraint plans_max_admin_accounts_check check (max_admin_accounts is null or max_admin_accounts > 0);

alter table public.school_subscriptions
  add column max_students_override int
    constraint school_subscriptions_max_students_override_check
    check (max_students_override is null or max_students_override > 0),
  add column max_admins_override int
    constraint school_subscriptions_max_admins_override_check
    check (max_admins_override is null or max_admins_override > 0);

-- Same numbers and prices as the home page (PLAN_OFFER): a year = 10 months.
update public.plans set price_monthly = 290, price_yearly = 2900, max_students = 150, max_admin_accounts = 2   where key = 'basic';
update public.plans set price_monthly = 590, price_yearly = 5900, max_students = 400, max_admin_accounts = 5   where key = 'pro';
update public.plans set price_monthly = 990, price_yearly = 9900, max_students = 800, max_admin_accounts = null where key = 'premium';

-- Effective limits of a school (override, else its plan); null = unlimited.
create function private.school_limits(p_school uuid)
returns table (max_students int, max_admins int)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(s.max_students_override, p.max_students),
         coalesce(s.max_admins_override, p.max_admin_accounts)
  from public.school_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.school_id = p_school
    and s.status in ('trial', 'active')
  limit 1;
$$;

-- Active staff accounts that count against the admin limit.
create function private.admin_account_count(p_school uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.school_id = p_school
    and p.deactivated_at is null
    and r.key not in ('teacher', 'parent', 'student', 'driver');
$$;

create function private.students_before_insert_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
begin
  perform pg_advisory_xact_lock(hashtextextended('plan_limit:' || new.school_id::text, 0));
  select l.max_students into v_max from private.school_limits(new.school_id) l;
  if v_max is not null
     and (select count(*) from public.students s where s.school_id = new.school_id) >= v_max then
    raise exception 'plan_student_limit' using errcode = '23514', detail = v_max::text;
  end if;
  return new;
end;
$$;

create trigger students_plan_limit
  before insert on public.students
  for each row execute function private.students_before_insert_limit();

create function private.profiles_admin_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max int;
  v_counts boolean;
  v_counted boolean := false;
begin
  if new.school_id is null or new.deactivated_at is not null then
    return new;
  end if;
  select r.key not in ('teacher', 'parent', 'student', 'driver') into v_counts
  from public.roles r where r.id = new.role_id;
  if not coalesce(v_counts, false) then
    return new;
  end if;

  -- On update, only an account that BECOMES an admin account is checked.
  if tg_op = 'UPDATE' and old.school_id is not null and old.deactivated_at is null then
    select r.key not in ('teacher', 'parent', 'student', 'driver') into v_counted
    from public.roles r where r.id = old.role_id;
    if coalesce(v_counted, false) and old.school_id = new.school_id then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_limit:' || new.school_id::text, 0));
  select l.max_admins into v_max from private.school_limits(new.school_id) l;
  if v_max is not null and private.admin_account_count(new.school_id) >= v_max then
    raise exception 'plan_admin_limit' using errcode = '23514', detail = v_max::text;
  end if;
  return new;
end;
$$;

create trigger profiles_plan_limit
  before insert or update of role_id, school_id, deactivated_at on public.profiles
  for each row execute function private.profiles_admin_limit();

revoke all on function private.school_limits(uuid), private.admin_account_count(uuid),
  private.students_before_insert_limit(), private.profiles_admin_limit()
  from public, anon, authenticated;

-- What the caller's own school uses and may use (null max = unlimited).
create function public.school_usage()
returns table (students int, max_students int, admins int, max_admins int)
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*)::int from public.students s where s.school_id = sid.id),
         l.max_students,
         private.admin_account_count(sid.id),
         l.max_admins
  from (select private.current_school_id() as id) sid
  left join lateral private.school_limits(sid.id) l on true
  where sid.id is not null;
$$;

revoke all on function public.school_usage() from public, anon;
grant execute on function public.school_usage() to authenticated;
