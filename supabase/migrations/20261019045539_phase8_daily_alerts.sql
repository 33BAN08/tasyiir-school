-- Phase 8 step 4 — daily alerts: unjustified absences, repeated lateness.
--
-- Every evening (19:00, Morocco time, from the database clock) each school
-- with the `alerts` and `attendance` modules on, active, is checked against
-- its alert_rules (step 3):
--
--   unjustified_absences — a student has an unjustified absence on at least
--     `threshold` DAYS of the current calendar month (up to today). Told ONCE
--     per student per month.
--   repeated_lateness — at least `threshold` lates in the last `window_days`
--     days. After an alert, only lates AFTER it count: the next alert needs
--     `threshold` new lates (never the same lates twice).
--
-- An absence / late does not count when a justification covers it (the
-- whole day, or that very mark) and it is APPROVED, or still PENDING and sent
-- within the last 7 days (school's dates): a parent who sent a note is not
-- told "unjustified" while the school has not looked at it yet, but a note
-- the school leaves unreviewed for more than 7 days stops protecting the
-- absence (decision 2026-10-19). Rejected ones justify nothing (same coverage
-- as the app's absenceState(), where only approved = "justified").
--
-- Recipients from the rule: parents (each parent account of the student, same
-- conditions as absence notices), surveillance (accounts whose role has
-- attendance.manage, other than the director role), director (director role);
-- every account active with its own password set. One notification per
-- account, even when it is in two groups.
--
-- ALERT_EVENTS records what was told (internal, no grant): it is what stops a
-- second alert, and a later email delivery / dashboard can read it. An alert
-- with no one to tell (no parent account yet) is still recorded.

-- ===========================================================================
-- New notification types.
-- ===========================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness'));

-- ===========================================================================
-- alert_events
-- ===========================================================================
create table public.alert_events (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  student_id    uuid not null,
  type          text not null,
  period_start  date not null,      -- absences: the month's 1st; lateness: first late counted
  period_end    date not null,      -- the day of the alert
  count         int not null,       -- days (absences) or lates
  created_at    timestamptz not null default now(),

  constraint alert_events_type_check check (type in ('unjustified_absences', 'repeated_lateness')),
  constraint alert_events_period_check check (period_start <= period_end),
  constraint alert_events_count_check check (count > 0),
  constraint alert_events_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade
);

-- Once per student per month; at most one lateness alert per student per day.
create unique index alert_events_absences_month_key
  on public.alert_events (student_id, period_start) where type = 'unjustified_absences';
create unique index alert_events_lateness_day_key
  on public.alert_events (student_id, period_end) where type = 'repeated_lateness';
create index alert_events_school_idx on public.alert_events (school_id);

alter table public.alert_events enable row level security;
revoke all on public.alert_events from anon, authenticated;
-- (no policy, no grant: only the definer functions below touch it)

-- The daily checks read a school's sessions by date.
create index attendance_sessions_school_date_idx on public.attendance_sessions (school_id, session_date);

-- ===========================================================================
-- Is this absence / late excused on p_today? Approved, or pending and sent on
-- p_today - 7 or later (Morocco date of submitted_at).
-- ===========================================================================
create function private.mark_excused(p_school uuid, p_student uuid, p_session uuid, p_date date, p_today date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.justifications j
    where j.school_id = p_school and j.student_id = p_student
      and ((j.kind = 'mark' and j.session_id = p_session)
           or (j.kind = 'days' and p_date between j.from_date and j.to_date))
      and (j.status = 'approved'
           or (j.status = 'pending'
               and (j.submitted_at at time zone 'Africa/Casablanca')::date >= p_today - 7)));
$$;

revoke all on function private.mark_excused(uuid, uuid, uuid, date, date) from public, anon, authenticated;

-- ===========================================================================
-- Who is told, for one student and one rule's recipients.
-- ===========================================================================
create function private.alert_recipients(p_school uuid, p_student uuid, p_recipients text[])
returns table (recipient_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id and g.school_id = p_school
  join public.profiles p on p.id = g.profile_id and p.school_id = p_school
  join public.roles r on r.id = p.role_id and r.key = 'parent'
  where 'parents' = any (p_recipients)
    and sg.student_id = p_student and sg.school_id = p_school
    and p.deactivated_at is null and p.must_change_password = false
  union
  select p.id
  from public.profiles p
  join public.roles r on r.id = p.role_id and r.school_id = p_school
  where p.school_id = p_school
    and p.deactivated_at is null and p.must_change_password = false
    and (('director' = any (p_recipients) and r.key = 'director')
         or ('surveillance' = any (p_recipients) and r.key <> 'director'
             and exists (select 1 from public.role_permissions rp
                         where rp.role_id = r.id and rp.permission_key = 'attendance.manage')));
$$;

revoke all on function private.alert_recipients(uuid, uuid, text[]) from public, anon, authenticated;

-- ===========================================================================
-- The daily check. p_today = the school's today (tests pass another day).
-- Several runs the same day never tell twice (unique keys, on conflict).
-- Returns the number of alerts recorded.
-- ===========================================================================
create function private.send_daily_alerts(p_today date default private.school_today())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_absences integer;
  v_lateness integer;
  v_month date := date_trunc('month', p_today)::date;
begin
  -- Unjustified absences: days of this month with an absence nothing covers.
  with rules as (
    select ar.school_id, ar.threshold, ar.recipients
    from public.alert_rules ar
    join public.schools sc on sc.id = ar.school_id and sc.status = 'active'
    where ar.type = 'unjustified_absences' and ar.enabled
      and private.school_has_module(ar.school_id, 'alerts')
      and private.school_has_module(ar.school_id, 'attendance')
  ), counted as (
    select r.school_id, m.student_id, r.recipients, count(distinct s.session_date)::int as n
    from rules r
    join public.attendance_sessions s
      on s.school_id = r.school_id and s.session_date between v_month and p_today
    join public.attendance_marks m
      on m.session_id = s.id and m.school_id = s.school_id and m.status = 'absent'
    where not private.mark_excused(m.school_id, m.student_id, s.id, s.session_date, p_today)
    group by r.school_id, m.student_id, r.recipients, r.threshold
    having count(distinct s.session_date) >= r.threshold
  ), events as (
    insert into public.alert_events (school_id, student_id, type, period_start, period_end, count)
    select c.school_id, c.student_id, 'unjustified_absences', v_month, p_today, c.n
    from counted c
    on conflict (student_id, period_start) where type = 'unjustified_absences' do nothing
    returning *
  ), told as (
    insert into public.notifications (school_id, recipient_id, type, student_id, data)
    select e.school_id, rc.recipient_id, e.type, e.student_id,
           jsonb_build_object('month', to_char(e.period_start, 'YYYY-MM'), 'days', e.count)
    from events e
    join counted c on c.school_id = e.school_id and c.student_id = e.student_id
    cross join lateral private.alert_recipients(e.school_id, e.student_id, c.recipients) rc
  )
  select count(*) into v_absences from events;

  -- Repeated lateness: lates in the window, after the student's last alert.
  with rules as (
    select ar.school_id, ar.threshold, ar.window_days, ar.recipients
    from public.alert_rules ar
    join public.schools sc on sc.id = ar.school_id and sc.status = 'active'
    where ar.type = 'repeated_lateness' and ar.enabled
      and private.school_has_module(ar.school_id, 'alerts')
      and private.school_has_module(ar.school_id, 'attendance')
  ), counted as (
    select r.school_id, m.student_id, r.recipients, r.window_days,
           count(*)::int as n, min(s.session_date) as first_day
    from rules r
    join public.attendance_sessions s
      on s.school_id = r.school_id
     and s.session_date > p_today - r.window_days and s.session_date <= p_today
    join public.attendance_marks m
      on m.session_id = s.id and m.school_id = s.school_id and m.status = 'late'
    where s.session_date > coalesce(
            (select max(e.period_end) from public.alert_events e
              where e.student_id = m.student_id and e.type = 'repeated_lateness'),
            '-infinity'::date)
      and not private.mark_excused(m.school_id, m.student_id, s.id, s.session_date, p_today)
    group by r.school_id, m.student_id, r.recipients, r.window_days, r.threshold
    having count(*) >= r.threshold
  ), events as (
    insert into public.alert_events (school_id, student_id, type, period_start, period_end, count)
    select c.school_id, c.student_id, 'repeated_lateness', c.first_day, p_today, c.n
    from counted c
    on conflict (student_id, period_end) where type = 'repeated_lateness' do nothing
    returning *
  ), told as (
    insert into public.notifications (school_id, recipient_id, type, student_id, data)
    select e.school_id, rc.recipient_id, e.type, e.student_id,
           jsonb_build_object('count', e.count, 'window_days', c.window_days,
                              'from', e.period_start, 'to', e.period_end)
    from events e
    join counted c on c.school_id = e.school_id and c.student_id = e.student_id
    cross join lateral private.alert_recipients(e.school_id, e.student_id, c.recipients) rc
  )
  select count(*) into v_lateness from events;

  return v_absences + v_lateness;
end;
$$;

revoke all on function private.send_daily_alerts(date) from public, anon, authenticated;

-- Hourly job; works only at 19:00 Morocco time (database clock, never the
-- server's). A run that fails is caught up the next evening: nothing is lost,
-- nothing is told twice.
create function private.send_daily_alerts_if_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if extract(hour from now() at time zone 'Africa/Casablanca') = 19 then
    return private.send_daily_alerts();
  end if;
  return 0;
end;
$$;

revoke all on function private.send_daily_alerts_if_due() from public, anon, authenticated;

-- For tests and manual runs with the secret key only (tests pass the day).
create function public.run_daily_alerts(p_today date)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.send_daily_alerts(p_today);
$$;

revoke all on function public.run_daily_alerts(date) from public, anon, authenticated;
grant execute on function public.run_daily_alerts(date) to service_role;

select cron.schedule(
  'tasyiir-daily-alerts',
  '0 * * * *',
  $$select private.send_daily_alerts_if_due()$$
);
