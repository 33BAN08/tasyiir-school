-- Director dashboard — two read-only aggregates, counted by the database so a
-- dashboard view never reads thousands of rows (Data API: 1000 rows per call).
--
-- Both: SECURITY INVOKER (the caller's RLS applies on every table read),
-- STABLE, revoke-first (execute for authenticated only). Inside, the caller's
-- school and permission are checked first: anyone else (a parent, a teacher,
-- another school's account, a module switched off) gets NO ROW — never an
-- error that would break a page, never anything extra.
--
-- attendance_summary(from, to): one row per class with absences / lateness
--   between two dates (inclusive): absent_marks (sessions missed), late_marks,
--   absent_students (distinct). attendance.view or attendance.manage, module
--   attendance. Range ≤ 366 days (else 22023 attendance_summary_range).
--
-- grade_entry_progress(period): one row per class of the period's year:
--   students, marks expected, marks entered. EXACTLY the rule of the grade
--   sheet and of the app's completeness helper:
--     expected per student = Σ over the class's graded subjects (the filière's
--       coefficient row wins over the level's common row) of
--       (the subject's contrôles, else the level's) + 1 when the level has
--       activités (level rules through grade_level_rules(), defaults when no row)
--     entered = grades rows (a score or "abs") of the period for the class's
--       students in those subjects (old columns beyond a lowered count too)
--   grades.view or grades.manage, module grades. A period of another school =
--   no row.

-- ===========================================================================
-- attendance_summary(from, to)
-- ===========================================================================
create function public.attendance_summary(p_from date, p_to date)
returns table (class_id uuid, absent_marks integer, late_marks integer, absent_students integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := (select private.current_school_id());
begin
  if v_school is null or not private.has_module('attendance')
     or not (private.has_permission('attendance.view') or private.has_permission('attendance.manage')) then
    return;
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'attendance_summary_range' using errcode = '22023';
  end if;

  return query
  select s.class_id,
         count(*) filter (where m.status = 'absent')::int,
         count(*) filter (where m.status = 'late')::int,
         count(distinct m.student_id) filter (where m.status = 'absent')::int
  from public.attendance_marks m
  join public.attendance_sessions s on s.id = m.session_id and s.school_id = m.school_id
  where m.school_id = v_school
    and s.session_date between p_from and p_to
  group by s.class_id;
end;
$$;

revoke all on function public.attendance_summary(date, date) from public, anon;
grant execute on function public.attendance_summary(date, date) to authenticated;

-- ===========================================================================
-- grade_entry_progress(period)
-- ===========================================================================
create function public.grade_entry_progress(p_period uuid)
returns table (class_id uuid, students integer, expected integer, entered integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := (select private.current_school_id());
  v_year   uuid;
begin
  if v_school is null or not private.has_module('grades')
     or not (private.has_permission('grades.view') or private.has_permission('grades.manage')) then
    return;
  end if;
  select p.academic_year_id into v_year
  from public.grading_periods p
  where p.id = p_period and p.school_id = v_school;
  if v_year is null then
    return;
  end if;

  return query
  with cls as (
    select c.id, c.level_id, c.track_id
    from public.classes c
    where c.academic_year_id = v_year and c.school_id = v_school
  ),
  rules as (
    select r.level_id, r.controls_count, r.activities from public.grade_level_rules(v_year) r
  ),
  -- The class's graded subjects and marks expected per student (the filière's row wins).
  subj as (
    select distinct on (c.id, sc.subject_id)
           c.id as class_id, sc.subject_id,
           coalesce(sc.controls_count, r.controls_count) + case when r.activities then 1 else 0 end as per_student
    from cls c
    join public.subject_coefficients sc
      on sc.academic_year_id = v_year and sc.level_id = c.level_id
     and (sc.track_id is null or sc.track_id = c.track_id)
    join rules r on r.level_id = c.level_id
    order by c.id, sc.subject_id, sc.track_id nulls last
  ),
  pupils as (
    select e.class_id, e.student_id
    from public.student_enrollments e
    join cls on cls.id = e.class_id
    where e.academic_year_id = v_year
  ),
  counted as (
    select p.class_id, count(*)::int as students from pupils p group by p.class_id
  ),
  per_class as (
    select s.class_id, sum(s.per_student)::int as per_student from subj s group by s.class_id
  ),
  written as (
    select p.class_id, count(g.id)::int as n
    from pupils p
    join public.grades g on g.student_id = p.student_id and g.period_id = p_period
    join subj s on s.class_id = p.class_id and s.subject_id = g.subject_id
    group by p.class_id
  )
  select c.id,
         coalesce(n.students, 0),
         coalesce(n.students, 0) * coalesce(pc.per_student, 0),
         coalesce(w.n, 0)
  from cls c
  left join counted n on n.class_id = c.id
  left join per_class pc on pc.class_id = c.id
  left join written w on w.class_id = c.id;
end;
$$;

revoke all on function public.grade_entry_progress(uuid) from public, anon;
grant execute on function public.grade_entry_progress(uuid) to authenticated;
