-- Phase 11 step 2 — copies of the grading setup (preview, then copy).
--
-- copy_level_coefficients(year, from_level, from_track, to_levels, apply):
--   the coefficient rows of one level (its common rows when from_track is
--   NULL, else one of its filières) → the COMMON rows (track NULL) of other
--   levels of the same year. Filières belong to one level, so they are never a
--   target. Coefficient, controls_count override and report card order copied.
-- copy_grading_from_year(from_year, to_year, apply):
--   an EARLIER year's level rules (grade_level_settings) and every coefficient
--   row (filière rows included) → the target year. Levels, filières and
--   subjects are not tied to a year, so every row maps 1:1. Semesters are not
--   copied (each year seeds its own).
--
-- Both are SECURITY INVOKER: RLS and the column grants apply exactly as for the
-- forms. Rule and copy are ONE function, so preview and copy never disagree.
-- Nothing is ever overwritten: a row that already exists in the target is
-- reported 'exists' and left alone; the others 'copy'. apply = false only
-- reports; apply = true inserts in the same statement, all or nothing.

-- ===========================================================================
-- Level → other levels (same year)
-- ===========================================================================
create function public.copy_level_coefficients(
  p_year uuid, p_from_level uuid, p_from_track uuid,
  p_to_levels uuid[], p_apply boolean)
returns table (to_level_id uuid, subject_id uuid, status text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not (private.has_module('grades') and private.has_permission('grades.manage')) then
    raise exception 'copy_grading_forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years y
                  where y.id = p_year
                    and y.school_id = (select private.current_school_id())) then
    raise exception 'copy_grading_not_found' using errcode = '23503';
  end if;

  return query
  with src as (
    select c.subject_id, c.coefficient, c.controls_count, c."position"
    from public.subject_coefficients c
    where c.academic_year_id = p_year
      and c.school_id = (select private.current_school_id())
      and c.level_id = p_from_level
      and c.track_id is not distinct from p_from_track
  ),
  targets as (
    select l.id as level_id
    from public.levels l
    where l.school_id = (select private.current_school_id())
      and l.id = any (p_to_levels)
      and l.id <> p_from_level
  ),
  plan as (
    select t.level_id as to_level_id, s.subject_id, s.coefficient,
           s.controls_count, s."position",
           case when exists (
                  select 1 from public.subject_coefficients e
                   where e.academic_year_id = p_year
                     and e.level_id = t.level_id
                     and e.track_id is null
                     and e.subject_id = s.subject_id)
                then 'exists' else 'copy' end as status
    from src s cross join targets t
  ),
  ins as (
    insert into public.subject_coefficients
      (school_id, academic_year_id, level_id, track_id, subject_id,
       coefficient, controls_count, "position")
    select (select private.current_school_id()), p_year, p.to_level_id, null,
           p.subject_id, p.coefficient, p.controls_count, p."position"
    from plan p
    where p_apply and p.status = 'copy'
    on conflict on constraint subject_coefficients_key do nothing
    returning 1
  )
  select p.to_level_id, p.subject_id, p.status from plan p;
end;
$$;

-- ===========================================================================
-- Earlier year → this year (level rules + coefficients)
-- ===========================================================================
create function public.copy_grading_from_year(
  p_from_year uuid, p_to_year uuid, p_apply boolean)
returns table (kind text, level_id uuid, track_id uuid, subject_id uuid, status text)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_from date;
  v_to   date;
begin
  if not (private.has_module('grades') and private.has_permission('grades.manage')) then
    raise exception 'copy_grading_forbidden' using errcode = '42501';
  end if;
  select y.start_date into v_from from public.academic_years y
   where y.id = p_from_year and y.school_id = (select private.current_school_id());
  select y.start_date into v_to from public.academic_years y
   where y.id = p_to_year and y.school_id = (select private.current_school_id());
  if v_from is null or v_to is null then
    raise exception 'copy_grading_not_found' using errcode = '23503';
  end if;
  if v_from >= v_to then
    raise exception 'copy_grading_source_not_earlier' using errcode = '23514';
  end if;

  return query
  with rules_plan as (
    select s.level_id, s.scale, s.controls_count, s.activities,
           case when exists (select 1 from public.grade_level_settings e
                              where e.academic_year_id = p_to_year
                                and e.level_id = s.level_id)
                then 'exists' else 'copy' end as status
    from public.grade_level_settings s
    where s.academic_year_id = p_from_year
      and s.school_id = (select private.current_school_id())
  ),
  coef_plan as (
    select c.level_id, c.track_id, c.subject_id, c.coefficient,
           c.controls_count, c."position",
           case when exists (select 1 from public.subject_coefficients e
                              where e.academic_year_id = p_to_year
                                and e.level_id = c.level_id
                                and e.track_id is not distinct from c.track_id
                                and e.subject_id = c.subject_id)
                then 'exists' else 'copy' end as status
    from public.subject_coefficients c
    where c.academic_year_id = p_from_year
      and c.school_id = (select private.current_school_id())
  ),
  ins_rules as (
    insert into public.grade_level_settings
      (school_id, academic_year_id, level_id, scale, controls_count, activities)
    select (select private.current_school_id()), p_to_year, r.level_id,
           r.scale, r.controls_count, r.activities
    from rules_plan r where p_apply and r.status = 'copy'
    on conflict (academic_year_id, level_id) do nothing
    returning 1
  ),
  ins_coef as (
    insert into public.subject_coefficients
      (school_id, academic_year_id, level_id, track_id, subject_id,
       coefficient, controls_count, "position")
    select (select private.current_school_id()), p_to_year, c.level_id, c.track_id,
           c.subject_id, c.coefficient, c.controls_count, c."position"
    from coef_plan c where p_apply and c.status = 'copy'
    on conflict on constraint subject_coefficients_key do nothing
    returning 1
  )
  select 'rules'::text, r.level_id, null::uuid, null::uuid, r.status from rules_plan r
  union all
  select 'coefficient'::text, c.level_id, c.track_id, c.subject_id, c.status from coef_plan c;
end;
$$;

revoke all on function public.copy_level_coefficients(uuid, uuid, uuid, uuid[], boolean)
  from public, anon;
revoke all on function public.copy_grading_from_year(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.copy_level_coefficients(uuid, uuid, uuid, uuid[], boolean)
  to authenticated;
grant execute on function public.copy_grading_from_year(uuid, uuid, boolean)
  to authenticated;
