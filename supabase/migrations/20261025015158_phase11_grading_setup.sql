-- Phase 11 step 1 — grading setup in the DB (no grades yet, no screen).
--
-- Everything here is PER ACADEMIC YEAR (like school days / time slots): changing
-- a coefficient or the number of contrôles this year never rewrites an older
-- year's report cards.
--
-- grading_periods = the year's semesters (default 2, at most 4), seeded by a
--   trigger when a year is created (and for every existing year below):
--   S1 = year start → 31 January, S2 = 1 February → year end (midpoint when
--   the year does not hold a 1 February). Dates stay inside the year and never
--   overlap. `weight` = the period's share of the annual average (default 1 =
--   (S1 + S2) / 2). The director LOCKS a period (locked_at / locked_by, set by
--   the trigger): while locked its dates / weight / number cannot change; the
--   grades of a locked period are refused by step 3's trigger. Moving the
--   year's start / end moves the first period's start / the last period's end
--   with it (when they were on the old boundary).
-- grade_level_settings = per year + level: scale (/20 or /10), number of
--   contrôles continus per subject per semester (default 4), "activités
--   intégrées" on / off. NO ROW = the defaults: /10 for cycle primaire, /20
--   otherwise, 4 contrôles, no activités — public.grade_level_rules(year)
--   returns the effective values (one source of truth for app and SQL).
-- subject_coefficients = per year + level (+ optional filière) + subject: the
--   coefficient (> 0, ≤ 20, 2 decimals), an optional number of contrôles for
--   that subject (overrides the level's: subjects with few hours often have 2),
--   and the report card order. A row = "this subject is graded at this level".
--   For a class with a filière, a subject's row for that filière wins over the
--   level's common row (track_id NULL), subject by subject.
--
-- Permissions (module grades, Pro / Premium): grades.view (director,
-- surveillant) and grades.manage (director: setup, lock, later any grade +
-- publish). Teachers get no permission: step 3 lets them enter grades for the
-- class + subject pairs they teach (timetable), like remarks.
-- Reads of the setup: every active account of the school while the grades
-- module is on (teachers need the number of contrôles, parents the scale and
-- coefficients on the report card). Writes: grades.manage.

-- ===========================================================================
-- Permissions
-- ===========================================================================
insert into public.permissions (key, module_key) values
  ('grades.view', 'grades'),
  ('grades.manage', 'grades');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('grades.view'), ('grades.manage')) p (key)
where r.key = 'director' and r.is_system;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'grades.view'
from public.roles r
where r.key = 'surveillant' and r.is_system;

-- ===========================================================================
-- grading_periods
-- ===========================================================================
create table public.grading_periods (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  number            smallint not null,
  start_date        date not null,
  end_date          date not null,
  weight            numeric(4, 2) not null default 1,
  locked_at         timestamptz,
  locked_by         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  updated_by        uuid,

  constraint grading_periods_number_check check (number between 1 and 4),
  constraint grading_periods_dates_check check (start_date <= end_date),
  constraint grading_periods_weight_check check (weight > 0 and weight <= 10),
  constraint grading_periods_lock_check check (locked_by is null or locked_at is not null),
  constraint grading_periods_number_key unique (academic_year_id, number),
  constraint grading_periods_id_year_school_key unique (id, academic_year_id, school_id),
  constraint grading_periods_no_overlap exclude using gist
    (academic_year_id with =, daterange(start_date, end_date, '[]') with &&),
  constraint grading_periods_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint grading_periods_locked_by_fkey foreign key (locked_by)
    references public.profiles (id) on delete set null,
  constraint grading_periods_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index grading_periods_school_idx on public.grading_periods (school_id);
create index grading_periods_locked_by_idx on public.grading_periods (locked_by);
create index grading_periods_updated_by_idx on public.grading_periods (updated_by);

alter table public.grading_periods enable row level security;
revoke all on public.grading_periods from anon, authenticated;

-- ===========================================================================
-- grade_level_settings
-- ===========================================================================
create table public.grade_level_settings (
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  level_id          uuid not null,
  scale             smallint not null,
  controls_count    smallint not null default 4,
  activities        boolean not null default false,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint grade_level_settings_pkey primary key (academic_year_id, level_id),
  constraint grade_level_settings_scale_check check (scale in (10, 20)),
  constraint grade_level_settings_controls_check check (controls_count between 1 and 10),
  constraint grade_level_settings_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint grade_level_settings_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete cascade,
  constraint grade_level_settings_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index grade_level_settings_school_idx on public.grade_level_settings (school_id);
create index grade_level_settings_level_idx on public.grade_level_settings (level_id, school_id);
create index grade_level_settings_updated_by_idx on public.grade_level_settings (updated_by);

alter table public.grade_level_settings enable row level security;
revoke all on public.grade_level_settings from anon, authenticated;

-- ===========================================================================
-- subject_coefficients
-- ===========================================================================
create table public.subject_coefficients (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  level_id          uuid not null,
  track_id          uuid,                    -- NULL = every class of the level
  subject_id        uuid not null,
  coefficient       numeric(4, 2) not null,
  controls_count    smallint,                -- NULL = the level's number
  position          smallint not null default 0,   -- report card order
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint subject_coefficients_coefficient_check check (coefficient > 0 and coefficient <= 20),
  constraint subject_coefficients_controls_check
    check (controls_count is null or controls_count between 1 and 10),
  constraint subject_coefficients_position_check check (position between 0 and 100),
  constraint subject_coefficients_key unique nulls not distinct
    (academic_year_id, level_id, track_id, subject_id),
  constraint subject_coefficients_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint subject_coefficients_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete cascade,
  constraint subject_coefficients_track_fkey foreign key (track_id, level_id)
    references public.tracks (id, level_id) on delete cascade,
  constraint subject_coefficients_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id) on delete cascade,
  constraint subject_coefficients_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index subject_coefficients_school_idx on public.subject_coefficients (school_id);
create index subject_coefficients_level_idx on public.subject_coefficients (level_id, school_id);
create index subject_coefficients_track_idx on public.subject_coefficients (track_id, level_id);
create index subject_coefficients_subject_idx on public.subject_coefficients (subject_id, school_id);
create index subject_coefficients_updated_by_idx on public.subject_coefficients (updated_by);

alter table public.subject_coefficients enable row level security;
revoke all on public.subject_coefficients from anon, authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Who changed it last (grade_level_settings, subject_coefficients).
create function private.grading_set_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger grade_level_settings_set_updated
  before insert or update on public.grade_level_settings
  for each row execute function private.grading_set_updated();

create trigger subject_coefficients_set_updated
  before insert or update on public.subject_coefficients
  for each row execute function private.grading_set_updated();

-- Periods: inside the year; locked = frozen; lock / unlock recorded.
create function private.grading_periods_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end   date;
begin
  select y.start_date, y.end_date into v_start, v_end
  from public.academic_years y
  where y.id = new.academic_year_id and y.school_id = new.school_id;
  if new.start_date < v_start or new.end_date > v_end then
    raise exception 'grading_period_outside_year' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.locked_at := null;
    new.locked_by := null;
    new.created_at := now();
    new.updated_at := null;
    new.updated_by := null;
    return new;
  end if;

  if old.locked_at is not null and new.locked_at is not null
     and (new.number, new.start_date, new.end_date, new.weight)
         is distinct from (old.number, old.start_date, old.end_date, old.weight) then
    raise exception 'grading_period_locked' using errcode = 'P0001';
  end if;

  if new.locked_at is null then
    new.locked_by := null;
  elsif old.locked_at is null then
    new.locked_at := now();
    new.locked_by := auth.uid();
  else
    new.locked_at := old.locked_at;
    new.locked_by := old.locked_by;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger grading_periods_before_write
  before insert or update on public.grading_periods
  for each row execute function private.grading_periods_before_write();

-- Two semesters for a year: S1 = start → 31 January, S2 = 1 February → end
-- (midpoint when the year holds no 1 February). Nothing for a one-day year.
create function private.seed_grading_periods(p_year uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.grading_periods (school_id, academic_year_id, number, start_date, end_date)
  select y.school_id, y.id, s.n,
         case s.n when 1 then y.start_date else d.split end,
         case s.n when 1 then d.split - 1 else y.end_date end
  from public.academic_years y
  cross join lateral (
    select case
             when f.feb > y.start_date and f.feb <= y.end_date then f.feb
             else y.start_date + (y.end_date - y.start_date + 1) / 2
           end as split
    from (select make_date(extract(year from y.start_date)::int
                           + (extract(month from y.start_date) >= 2)::int, 2, 1) as feb) f
  ) d
  cross join (values (1::smallint), (2::smallint)) s (n)
  where y.id = p_year and y.end_date > y.start_date
  on conflict (academic_year_id, number) do nothing;
$$;

revoke all on function private.seed_grading_periods(uuid) from public, anon, authenticated;

create function private.academic_years_seed_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_grading_periods(new.id);
  return null;
end;
$$;

create trigger academic_years_seed_periods
  after insert on public.academic_years
  for each row execute function private.academic_years_seed_periods();

-- The year's dates move → the first period's start / last period's end follow
-- (only when they sat on the old boundary). A period left outside the year or
-- empty makes the year update fail (outside_year / dates_check).
create function private.academic_years_move_periods()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.start_date is distinct from old.start_date then
    update public.grading_periods p
       set start_date = new.start_date
     where p.academic_year_id = new.id
       and p.start_date = old.start_date
       and p.number = (select min(q.number) from public.grading_periods q
                        where q.academic_year_id = new.id);
  end if;
  if new.end_date is distinct from old.end_date then
    update public.grading_periods p
       set end_date = new.end_date
     where p.academic_year_id = new.id
       and p.end_date = old.end_date
       and p.number = (select max(q.number) from public.grading_periods q
                        where q.academic_year_id = new.id);
  end if;
  if exists (select 1 from public.grading_periods p
              where p.academic_year_id = new.id
                and (p.start_date < new.start_date or p.end_date > new.end_date)) then
    raise exception 'grading_period_outside_year' using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger academic_years_move_periods
  after update of start_date, end_date on public.academic_years
  for each row execute function private.academic_years_move_periods();

-- Every existing year.
select private.seed_grading_periods(y.id) from public.academic_years y;

-- ===========================================================================
-- Effective rules per level for a year (defaults when no row).
-- ===========================================================================
create function public.grade_level_rules(p_year uuid)
returns table (level_id uuid, scale smallint, controls_count smallint,
               activities boolean, customised boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id,
         coalesce(s.scale, case when l.cycle = 'primaire' then 10 else 20 end)::smallint,
         coalesce(s.controls_count, 4)::smallint,
         coalesce(s.activities, false),
         s.level_id is not null
  from public.levels l
  left join public.grade_level_settings s
    on s.level_id = l.id and s.academic_year_id = p_year
  where l.school_id = (select private.current_school_id());
$$;

revoke all on function public.grade_level_rules(uuid) from public, anon;
grant execute on function public.grade_level_rules(uuid) to authenticated;

-- ===========================================================================
-- Grants + RLS
-- ===========================================================================
grant select, delete on public.grading_periods to authenticated;
grant insert (school_id, academic_year_id, number, start_date, end_date, weight)
  on public.grading_periods to authenticated;
grant update (number, start_date, end_date, weight, locked_at)
  on public.grading_periods to authenticated;

grant select, delete on public.grade_level_settings to authenticated;
grant insert (school_id, academic_year_id, level_id, scale, controls_count, activities)
  on public.grade_level_settings to authenticated;
grant update (scale, controls_count, activities) on public.grade_level_settings to authenticated;

grant select, delete on public.subject_coefficients to authenticated;
grant insert (school_id, academic_year_id, level_id, track_id, subject_id,
              coefficient, controls_count, position)
  on public.subject_coefficients to authenticated;
grant update (coefficient, controls_count, position) on public.subject_coefficients to authenticated;

-- grading_periods
create policy grading_periods_select on public.grading_periods
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades')));

create policy grading_periods_insert on public.grading_periods
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy grading_periods_update on public.grading_periods
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

-- A locked period cannot be deleted through the API (unlock first).
create policy grading_periods_delete on public.grading_periods
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage'))
         and locked_at is null);

-- grade_level_settings
create policy grade_level_settings_select on public.grade_level_settings
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades')));

create policy grade_level_settings_insert on public.grade_level_settings
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy grade_level_settings_update on public.grade_level_settings
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy grade_level_settings_delete on public.grade_level_settings
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')));

-- subject_coefficients
create policy subject_coefficients_select on public.subject_coefficients
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades')));

create policy subject_coefficients_insert on public.subject_coefficients
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy subject_coefficients_update on public.subject_coefficients
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy subject_coefficients_delete on public.subject_coefficients
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')));

-- ===========================================================================
-- Demo school: the three tables go with the nightly reset (the year the fill
-- creates seeds its two semesters again).
-- ===========================================================================
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

  delete from public.push_outbox          where school_id = v_school;
  delete from public.push_preferences     where school_id = v_school;
  delete from public.push_subscriptions   where school_id = v_school;
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
  delete from public.subject_coefficients where school_id = v_school;
  delete from public.grade_level_settings where school_id = v_school;
  delete from public.grading_periods      where school_id = v_school;
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
