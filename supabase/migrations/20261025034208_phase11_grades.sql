-- Phase 11 step 3 — grades in the DB (no screen).
--
-- grades = one mark of one student, in one semester, one subject:
--   kind 'control' number 1..N (N = the subject's contrôles override, else the
--   level's number) or kind 'activities' (number 1, only when the level has
--   activités intégrées). Either a score (0 ≤ score ≤ the level's scale /10 or
--   /20, 2 decimals) or `absent` (no score: left out of the average, shown as
--   absent — step 5). One row per period + student + subject + kind + number.
-- The caller gives school, period, student, subject, kind, number, score /
--   absent; the trigger sets the year (from the period) and who entered /
--   changed it, and refuses: a student not enrolled in the period's year
--   (grade_student_not_enrolled), a subject not graded at the student's level
--   / filière — no subject_coefficients row (grade_subject_not_graded),
--   activités on a level without them (grade_no_activities), a contrôle
--   number above the subject's count (grade_number_too_high), a score above
--   the scale (grade_score_above_scale). Only score / absent change afterwards
--   (grade_identity_locked).
-- LOCKED SEMESTER = every insert, update and delete refused
--   (grading_period_locked), whoever asks, the secret key included. Only
--   deletes cascading from another delete (a student, a year) go through.
-- Who writes: grades.manage (director) any grade of the school; a teacher
--   only the grades of the CURRENT year for a subject they teach to the
--   student's class in the timetable (private.teaches_student_subject).
-- Who reads: grades.view / grades.manage, and a teacher those same grades.
--   Parents and students read nothing yet (publish = step 7).
-- Everything also needs the grades module (Pro / Premium).
-- A semester or a subject that has grades cannot be deleted (NO ACTION FKs);
--   deleting a year or a student deletes its grades.

-- ===========================================================================
-- grades
-- ===========================================================================
create table public.grades (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,           -- set by the trigger from the period
  period_id         uuid not null,
  student_id        uuid not null,
  subject_id        uuid not null,
  kind              text not null default 'control',
  number            smallint not null default 1,
  score             numeric(4, 2),
  absent            boolean not null default false,
  entered_at        timestamptz not null default now(),
  entered_by        uuid,
  updated_at        timestamptz,
  updated_by        uuid,

  constraint grades_kind_check check (kind in ('control', 'activities')),
  constraint grades_number_check
    check (number between 1 and 10 and (kind = 'control' or number = 1)),
  constraint grades_score_check
    check ((absent and score is null)
           or (not absent and score is not null and score >= 0 and score <= 20)),
  constraint grades_key unique (period_id, student_id, subject_id, kind, number),
  constraint grades_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  -- NO ACTION: a semester with grades cannot be deleted alone; a year delete
  -- removes both in the same statement.
  constraint grades_period_fkey foreign key (period_id, academic_year_id, school_id)
    references public.grading_periods (id, academic_year_id, school_id),
  constraint grades_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint grades_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id),
  constraint grades_entered_by_fkey foreign key (entered_by)
    references public.profiles (id) on delete set null,
  constraint grades_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index grades_school_idx on public.grades (school_id);
create index grades_year_idx on public.grades (academic_year_id, school_id);
create index grades_student_idx on public.grades (student_id, school_id);
create index grades_subject_idx on public.grades (subject_id, school_id);
create index grades_entered_by_idx on public.grades (entered_by);
create index grades_updated_by_idx on public.grades (updated_by);
-- grades_key starts with period_id: it serves the period FK.

alter table public.grades enable row level security;
revoke all on public.grades from anon, authenticated;

-- ===========================================================================
-- Teacher of a student for a subject (timetable, current year)
-- ===========================================================================
create function private.teaches_student_subject(p_student uuid, p_subject uuid, p_year uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments e
    join public.academic_years y on y.id = e.academic_year_id and y.is_current
    join public.lessons l on l.class_id = e.class_id
                         and l.academic_year_id = e.academic_year_id
                         and l.subject_id = p_subject
    join public.profiles p on p.id = l.teacher_id and p.school_id = e.school_id
    join public.roles r on r.id = p.role_id and r.key = 'teacher'
    join public.schools s on s.id = p.school_id and s.status = 'active'
    where e.student_id = p_student
      and e.academic_year_id = p_year
      and l.teacher_id = auth.uid()
      and p.deactivated_at is null
  );
$$;

revoke all on function private.teaches_student_subject(uuid, uuid, uuid) from public, anon;
grant execute on function private.teaches_student_subject(uuid, uuid, uuid) to authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Before insert / update: year from the period, locked semester, enrolment,
-- subject graded at the level / filière, activités, contrôle number, scale,
-- who entered / changed it.
create function private.grades_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year       uuid;
  v_locked     timestamptz;
  v_level      uuid;
  v_track      uuid;
  v_cycle      text;
  v_scale      smallint;
  v_controls   smallint;
  v_activities boolean;
  v_override   smallint;
  v_graded     boolean;
begin
  if tg_op = 'UPDATE'
     and (new.school_id, new.academic_year_id, new.period_id, new.student_id,
          new.subject_id, new.kind, new.number, new.entered_at, new.entered_by)
         is distinct from
         (old.school_id, old.academic_year_id, old.period_id, old.student_id,
          old.subject_id, old.kind, old.number, old.entered_at, old.entered_by) then
    raise exception 'grade_identity_locked' using errcode = 'P0001';
  end if;

  select p.academic_year_id, p.locked_at into v_year, v_locked
  from public.grading_periods p
  where p.id = new.period_id and p.school_id = new.school_id;
  if v_year is null then
    raise exception 'grade_period_not_found' using errcode = '23503';
  end if;
  if v_locked is not null then
    raise exception 'grading_period_locked' using errcode = 'P0001';
  end if;
  new.academic_year_id := v_year;

  -- The student's class this year → level, filière.
  select c.level_id, c.track_id, l.cycle into v_level, v_track, v_cycle
  from public.student_enrollments e
  join public.classes c on c.id = e.class_id and c.school_id = e.school_id
  join public.levels l on l.id = c.level_id and l.school_id = c.school_id
  where e.student_id = new.student_id
    and e.academic_year_id = v_year
    and e.school_id = new.school_id;
  if v_level is null then
    raise exception 'grade_student_not_enrolled' using errcode = '23514';
  end if;

  -- Rules of the level (defaults when no row), as public.grade_level_rules().
  select s.scale, s.controls_count, s.activities into v_scale, v_controls, v_activities
  from public.grade_level_settings s
  where s.academic_year_id = v_year and s.level_id = v_level;
  v_scale := coalesce(v_scale, case when v_cycle = 'primaire' then 10 else 20 end);
  v_controls := coalesce(v_controls, 4);
  v_activities := coalesce(v_activities, false);

  -- The subject at the student's filière (wins) or the level's common row.
  select true, c.controls_count into v_graded, v_override
  from public.subject_coefficients c
  where c.academic_year_id = v_year
    and c.level_id = v_level
    and c.subject_id = new.subject_id
    and (c.track_id is null or c.track_id = v_track)
  order by c.track_id is null   -- false (the filière's row) first
  limit 1;
  if v_graded is null then
    raise exception 'grade_subject_not_graded' using errcode = '23514';
  end if;

  if new.kind = 'activities' and not v_activities then
    raise exception 'grade_no_activities' using errcode = '23514';
  end if;
  if new.kind = 'control' and new.number > coalesce(v_override, v_controls) then
    raise exception 'grade_number_too_high' using errcode = '23514';
  end if;
  if new.score > v_scale then
    raise exception 'grade_score_above_scale' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.entered_at := now();
    new.entered_by := auth.uid();
    new.updated_at := null;
    new.updated_by := null;
  else
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger grades_before_write
  before insert or update on public.grades
  for each row execute function private.grades_before_write();

-- Before delete: a locked semester keeps its grades. A delete cascading from
-- another one (a student, a year: trigger depth > 1) goes through.
create function private.grades_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
     and exists (select 1 from public.grading_periods p
                  where p.id = old.period_id and p.locked_at is not null) then
    raise exception 'grading_period_locked' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger grades_before_delete
  before delete on public.grades
  for each row execute function private.grades_before_delete();

-- ===========================================================================
-- Grants + RLS
-- ===========================================================================
grant select, delete on public.grades to authenticated;
grant insert (school_id, period_id, student_id, subject_id, kind, number, score, absent)
  on public.grades to authenticated;
grant update (score, absent) on public.grades to authenticated;

create policy grades_select on public.grades
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.view'))
              or (select private.has_permission('grades.manage'))
              or private.teaches_student_subject(student_id, subject_id, academic_year_id)));

create policy grades_insert on public.grades
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and ((select private.has_permission('grades.manage'))
                   or private.teaches_student_subject(student_id, subject_id, academic_year_id)));

create policy grades_update on public.grades
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.manage'))
              or private.teaches_student_subject(student_id, subject_id, academic_year_id)))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and ((select private.has_permission('grades.manage'))
                   or private.teaches_student_subject(student_id, subject_id, academic_year_id)));

create policy grades_delete on public.grades
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.manage'))
              or private.teaches_student_subject(student_id, subject_id, academic_year_id)));

-- ===========================================================================
-- Demo school: grades go with the nightly reset. Its semesters are unlocked
-- first (a locked semester refuses deleting its grades).
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
  update public.grading_periods set locked_at = null
   where school_id = v_school and locked_at is not null;
  delete from public.grades               where school_id = v_school;
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
