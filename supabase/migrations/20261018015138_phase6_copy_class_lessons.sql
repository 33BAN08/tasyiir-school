-- Phase 6 step 5 — copy a class's timetable from a previous year.
--
-- copy_class_lessons(from_class, to_class, apply):
--   source = a class of an EARLIER year of the school (earlier start date);
--   target = a class of the CURRENT year that has no lessons yet.
-- Each source lesson goes to this year's LESSON slot with the same day and
-- the same start and end time, then (first rule that applies):
--   no such slot this year (or it is a break)        → skipped 'no_slot'
--   teacher deactivated or no longer a teacher        → skipped 'teacher_inactive'
--   teacher no longer teaches the subject             → skipped 'teacher_subject'
--   teacher already teaches another class then        → skipped 'teacher_busy'
--   room already used then                            → copied WITHOUT room 'room_busy'
--   otherwise                                         → copied 'copy'
-- Two source lessons never land on the same slot (a class has one lesson per
-- slot, and slots of a year + day never overlap), so the copied lessons cannot
-- clash with each other.
--
-- apply = false: only the report (the preview). apply = true: the same report,
-- and the copied lessons inserted in ONE statement — all or nothing. A booking
-- made by someone else between preview and copy is re-checked here; one made
-- during the copy itself fails the whole copy on the unique keys.
--
-- SECURITY INVOKER: every read and the insert go through RLS (own school,
-- timetable module, timetable.manage); the checks below only give clearer
-- errors. "Active teacher" comes from timetable_teachers() (profiles stay
-- closed to timetable staff): a teacher-role account of the school that is
-- not deactivated.
create function public.copy_class_lessons(p_from_class uuid, p_to_class uuid, p_apply boolean default false)
returns table (source_lesson_id uuid, target_slot_id uuid, status text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := (select private.current_school_id());
  v_from   record;
  v_to     record;
begin
  if not (private.has_module('timetable') and private.has_permission('timetable.manage')) then
    raise exception 'copy_lessons_forbidden' using errcode = '42501';
  end if;

  select c.id, y.start_date into v_from
  from public.classes c
  join public.academic_years y on y.id = c.academic_year_id
  where c.id = p_from_class and c.school_id = v_school;
  select c.id, c.academic_year_id, y.start_date, y.is_current into v_to
  from public.classes c
  join public.academic_years y on y.id = c.academic_year_id
  where c.id = p_to_class and c.school_id = v_school;

  if v_from.id is null or v_to.id is null then
    raise exception 'copy_lessons_not_found' using errcode = 'P0001';
  end if;
  if not v_to.is_current then
    raise exception 'copy_lessons_target_not_current' using errcode = 'P0001';
  end if;
  if v_from.start_date >= v_to.start_date then
    raise exception 'copy_lessons_source_not_earlier' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.lessons l where l.class_id = p_to_class) then
    raise exception 'copy_lessons_target_not_empty' using errcode = 'P0001';
  end if;

  return query
  with src as (
    select l.id, l.subject_id, l.teacher_id, l.room_id, s.day_of_week, s.start_time, s.end_time
    from public.lessons l
    join public.time_slots s on s.id = l.time_slot_id
    where l.class_id = p_from_class and l.school_id = v_school
  ),
  active as (
    select t.id from public.timetable_teachers(v_to.academic_year_id) t where t.active
  ),
  plan as (
    select src.*, ts.id as to_slot,
      case
        when ts.id is null then 'no_slot'
        when not exists (select 1 from active a where a.id = src.teacher_id) then 'teacher_inactive'
        when not exists (
          select 1 from public.teacher_subjects x
          where x.teacher_id = src.teacher_id and x.subject_id = src.subject_id
        ) then 'teacher_subject'
        when exists (
          select 1 from public.lessons o
          where o.time_slot_id = ts.id and o.teacher_id = src.teacher_id
        ) then 'teacher_busy'
        when src.room_id is not null and exists (
          select 1 from public.lessons o
          where o.time_slot_id = ts.id and o.room_id = src.room_id
        ) then 'room_busy'
        else 'copy'
      end as outcome
    from src
    left join public.time_slots ts
      on ts.school_id = v_school
     and ts.academic_year_id = v_to.academic_year_id
     and ts.kind = 'lesson'
     and ts.day_of_week = src.day_of_week
     and ts.start_time = src.start_time
     and ts.end_time = src.end_time
  ),
  -- Runs once even though nothing reads it (data-modifying WITH).
  copied as (
    insert into public.lessons (school_id, academic_year_id, time_slot_id, class_id, subject_id, teacher_id, room_id)
    select v_school, v_to.academic_year_id, p.to_slot, p_to_class, p.subject_id, p.teacher_id,
           case when p.outcome = 'copy' then p.room_id end
    from plan p
    where p_apply and p.outcome in ('copy', 'room_busy')
    returning 1
  )
  select p.id, p.to_slot, p.outcome
  from plan p
  order by p.day_of_week, p.start_time;
end;
$$;

revoke all on function public.copy_class_lessons(uuid, uuid, boolean) from public, anon;
grant execute on function public.copy_class_lessons(uuid, uuid, boolean) to authenticated;
