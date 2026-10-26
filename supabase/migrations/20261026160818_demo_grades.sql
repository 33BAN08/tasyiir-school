-- Demo school: grading setup + fictional marks for 1AC-A, rebuilt every night.
--
-- private.demo_fill_grades(school) runs right after private.demo_fill in
-- private.reset_demo_school, ONLY for a school with is_demo = true (else
-- 22023 demo_not_found). It adds no person and no name: it marks the demo's
-- existing fictional students.
--   * Rules /20, 3 contrôles, no activités for 1AC / 2AC / 3AC.
--   * Coefficients (common to each level, report card order): Arabe 4,
--     Français 4, Mathématiques 4, Physique-Chimie 2, SVT 2,
--     Histoire-Géographie 2, Éducation islamique 2, Anglais 2.
--   * 1AC-A, in the semester holding the demo's "today": contrôles 1 and 2 in
--     every subject but Anglais (left empty: "not graded yet"), contrôle 3 in
--     Mathématiques and Français. Scores 6 → 19 by quarter points from stable
--     keys (Massar code + subject + contrôle): two resets the same day give
--     the same marks.
--   * On purpose: 3 empty cells (students 3, 11, 19 by Massar code: SVT c2,
--     HG c2, Maths c3) and 2 "abs" (students 7, 15: PC c1, Arabe c2), so the
--     sheet / Moyennes show "incomplet" and the lock / publish warnings list them.
--   * Nothing locked, nothing published: a visitor can lock → publish → print;
--     the next reset puts everything back.
-- Marks are entered as the demo's Maths teacher (prof@) for Maths, as the
-- director otherwise (private.demo_as), and the function ends with
-- demo_as(null) like demo_fill.

create function private.demo_fill_grades(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today  date := private.school_today();
  v_year   uuid;
  v_period uuid;
  v_class  uuid;
  v_dir    uuid;
  v_prof   uuid;
begin
  if not exists (select 1 from public.schools s where s.id = p_school and s.is_demo) then
    raise exception 'not a demo school' using errcode = '22023', hint = 'demo_not_found';
  end if;

  select y.id into v_year from public.academic_years y where y.school_id = p_school and y.is_current;
  select c.id into v_class from public.classes c
  where c.school_id = p_school and c.academic_year_id = v_year and c.name = '1AC-A';
  if v_year is null or v_class is null then
    raise exception 'demo school needs its year and 1AC-A' using errcode = 'P0001', hint = 'demo_accounts_missing';
  end if;
  select p.id into v_period from public.grading_periods p
  where p.academic_year_id = v_year
  order by (v_today between p.start_date and p.end_date) desc, p.number
  limit 1;

  select p.id into v_dir from public.profiles p join public.roles r on r.id = p.role_id
  where p.school_id = p_school and r.key = 'director' and p.deactivated_at is null order by p.created_at limit 1;
  select p.id into v_prof from public.profiles p join public.roles r on r.id = p.role_id
  where p.school_id = p_school and r.key = 'teacher' and split_part(p.email, '@', 1) like '%prof' order by p.created_at limit 1;

  perform private.demo_as(v_dir);

  -- Rules and coefficients of the three levels.
  insert into public.grade_level_settings (school_id, academic_year_id, level_id, scale, controls_count, activities)
  select p_school, v_year, l.id, 20, 3, false
  from public.levels l
  where l.school_id = p_school and l.name in ('1AC', '2AC', '3AC');

  insert into public.subject_coefficients (school_id, academic_year_id, level_id, subject_id, coefficient, position)
  select p_school, v_year, l.id, s.id, x.coefficient, x.position
  from (values ('Arabe', 4, 1), ('Français', 4, 2), ('Mathématiques', 4, 3), ('Physique-Chimie', 2, 4),
               ('SVT', 2, 5), ('Histoire-Géographie', 2, 6), ('Éducation islamique', 2, 7), ('Anglais', 2, 8))
       x (subject, coefficient, position)
  join public.subjects s on s.school_id = p_school and s.name = x.subject
  cross join public.levels l
  where l.school_id = p_school and l.name in ('1AC', '2AC', '3AC');

  -- 1AC-A's marks: every (student, subject, contrôle) planned, minus the gaps on purpose.
  drop table if exists pg_temp.demo_marks;
  create temp table demo_marks on commit drop as
  with pupils as (
    select st.id, st.code_massar, row_number() over (order by st.code_massar) as n
    from public.student_enrollments e
    join public.students st on st.id = e.student_id
    where e.class_id = v_class and e.academic_year_id = v_year
  ),
  plan as (
    select s.id as subject_id, s.code, c.number
    from public.subjects s
    cross join (values (1), (2), (3)) c (number)
    where s.school_id = p_school
      and s.name <> 'Anglais'
      and (c.number < 3 or s.name in ('Mathématiques', 'Français'))
  )
  select p.id as student_id, pl.subject_id, pl.number, s.name as subject,
         (6 + (abs(hashtext(p.code_massar || pl.code || pl.number::text)) % 53) * 0.25)::numeric(4, 2) as score,
         (p.n, s.name, pl.number) in ((7, 'Physique-Chimie', 1), (15, 'Arabe', 2)) as absent
  from pupils p
  cross join plan pl
  join public.subjects s on s.id = pl.subject_id
  where (p.n, s.name, pl.number) not in
        ((3, 'SVT', 2), (11, 'Histoire-Géographie', 2), (19, 'Mathématiques', 3));

  insert into public.grades (school_id, period_id, student_id, subject_id, kind, number, score, absent)
  select p_school, v_period, m.student_id, m.subject_id, 'control', m.number,
         case when m.absent then null else m.score end, m.absent
  from pg_temp.demo_marks m
  where m.subject <> 'Mathématiques';

  -- Maths as the demo's Maths teacher (prof@): entered_by comes from auth.uid().
  if v_prof is not null then
    perform private.demo_as(v_prof);
  end if;
  insert into public.grades (school_id, period_id, student_id, subject_id, kind, number, score, absent)
  select p_school, v_period, m.student_id, m.subject_id, 'control', m.number,
         case when m.absent then null else m.score end, m.absent
  from pg_temp.demo_marks m
  where m.subject = 'Mathématiques';

  perform private.demo_as(null);
end;
$$;

revoke all on function private.demo_fill_grades(uuid) from public, anon, authenticated;

-- ===========================================================================
-- The nightly reset: as in phase11_report_card_print, + demo_fill_grades.
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
  delete from public.council_remarks      where school_id = v_school;
  delete from public.report_cards         where school_id = v_school;
  delete from public.grade_publications   where school_id = v_school;
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
  perform private.demo_fill_grades(v_school);
end;
$$;
