-- Phase 8 step 5 — subscription expiring: the school's director(s) and the
-- platform owner(s) are told before a subscription's last day.
--
-- Last day = end_date (active) or the Morocco date of trial_ends_at (trial);
-- none → never reminded. Suspended / expired subscriptions are not reminded
-- (the platform owner sets those by hand). Reminders at 30, 7 and 1 days
-- before, and on the last day itself. A run that finds a subscription inside
-- a step it was not reminded of yet (end date set 5 days ahead, a missed run)
-- sends that step's reminder at once with the real number of days left: each
-- step is sent at most once per subscription and last day; a new last day
-- (renewal) starts again.
--
-- Recipients: the school's directors (only while the school is active: a
-- suspended school's director cannot sign in) and every platform owner. All
-- plans, no module (it is about the platform, not a school feature).
-- Every morning at 08:00 Morocco time, from the same hourly job as the daily
-- alerts (19:00).
--
-- NOTIFICATIONS FOR THE PLATFORM OWNER: they have no school, so their rows have
-- school_id NULL (only this type), the school concerned is in `data`. Reads:
-- your own rows, in your school — or, for the platform owner, your own rows
-- without a school.

-- ===========================================================================
-- notifications: platform rows.
-- ===========================================================================
alter table public.notifications alter column school_id drop not null;
-- The composite (recipient, school) key does not check rows without a school:
-- the recipient still has to exist.
alter table public.notifications add constraint notifications_recipient_id_fkey
  foreign key (recipient_id) references public.profiles (id) on delete cascade;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                  'subscription_expiring'));
alter table public.notifications add constraint notifications_platform_check
  check (school_id is not null or (type = 'subscription_expiring' and student_id is null));

drop policy notifications_select on public.notifications;
drop policy notifications_update on public.notifications;

create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid())
         and (school_id = (select private.current_school_id())
              or (school_id is null and (select private.is_platform_owner()))));

create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid())
         and (school_id = (select private.current_school_id())
              or (school_id is null and (select private.is_platform_owner()))))
  with check (recipient_id = (select auth.uid())
              and (school_id = (select private.current_school_id())
                   or (school_id is null and (select private.is_platform_owner()))));

-- ===========================================================================
-- subscription_reminders: what was sent (internal, no grant).
-- ===========================================================================
create table public.subscription_reminders (
  subscription_id  uuid not null references public.school_subscriptions (id) on delete cascade,
  school_id        uuid not null references public.schools (id) on delete cascade,
  last_day         date not null,
  step             int not null,         -- 30, 7, 1 or 0 days before
  days_left        int not null,         -- the real number when sent
  created_at       timestamptz not null default now(),

  primary key (subscription_id, last_day, step),
  constraint subscription_reminders_step_check check (step in (30, 7, 1, 0)),
  constraint subscription_reminders_days_check check (days_left between 0 and step)
);

create index subscription_reminders_school_idx on public.subscription_reminders (school_id);

alter table public.subscription_reminders enable row level security;
revoke all on public.subscription_reminders from anon, authenticated;
-- (no policy, no grant: only the definer functions below touch it)

-- ===========================================================================
-- The morning check. p_today = the school's today (tests pass another day);
-- p_schools = only these schools (tests: their own fixtures, so a run on a
-- future day never marks a real school's reminders as sent), NULL = all.
-- Returns the number of reminders recorded.
-- ===========================================================================
create function private.send_subscription_reminders(
  p_today date default private.school_today(),
  p_schools uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function private.send_subscription_reminders(date, uuid[]) from public, anon, authenticated;

-- The hourly job: subscription reminders at 08:00, daily alerts at 19:00
-- (Morocco time, database clock).
create or replace function private.send_daily_alerts_if_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour int := extract(hour from now() at time zone 'Africa/Casablanca');
begin
  if v_hour = 8 then
    return private.send_subscription_reminders();
  elsif v_hour = 19 then
    return private.send_daily_alerts();
  end if;
  return 0;
end;
$$;

-- For tests and manual runs with the secret key only (tests pass the day and
-- their own schools).
create function public.run_subscription_reminders(p_today date, p_schools uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.send_subscription_reminders(p_today, p_schools);
$$;

revoke all on function public.run_subscription_reminders(date, uuid[]) from public, anon, authenticated;
grant execute on function public.run_subscription_reminders(date, uuid[]) to service_role;
