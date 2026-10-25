-- Phase 11 step 4 — save one grade sheet (class + subject + semester) at once.
--
-- save_grades(period, subject, cells): every changed cell of the sheet in one
-- transaction, all or nothing. A cell =
--   {student_id, kind ('control' | 'activities'), number, score, absent, clear}
--   clear = true        → that grade is deleted (an empty cell); nothing to
--                          delete = nothing happens
--   absent = true       → the grade is "absent" (score dropped)
--   otherwise           → the score, added or changed
-- Insert … on conflict (grades_key) do update set score, absent: the only
-- updatable columns, so nothing else of an existing grade can change.
-- SECURITY INVOKER: the caller's rights decide, exactly as for single writes —
-- RLS (a teacher only their own class + subject pairs of the current year,
-- grades.manage any grade of the school, the grades module) and the grades
-- trigger (locked semester, enrolment, subject graded at the level / filière,
-- contrôle count, activités, scale). One refusal rolls the whole save back.
-- At most 2000 cells. Returns the number of grades added / changed / deleted.
create function public.save_grades(p_period uuid, p_subject uuid, p_cells jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := (select private.current_school_id());
  v_cell   jsonb;
  v_kind   text;
  v_number smallint;
  v_absent boolean;
  v_count  integer := 0;
  v_rows   integer;
begin
  if v_school is null or not private.has_module('grades') then
    raise exception 'grades_forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.grading_periods p
                  where p.id = p_period and p.school_id = v_school) then
    raise exception 'grades_period_not_found' using errcode = '23503';
  end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) > 2000 then
    raise exception 'grades_too_many' using errcode = '22023';
  end if;

  for v_cell in select * from jsonb_array_elements(p_cells) loop
    v_kind := coalesce(v_cell->>'kind', 'control');
    v_number := coalesce((v_cell->>'number')::smallint, 1);

    if coalesce((v_cell->>'clear')::boolean, false) then
      delete from public.grades g
       where g.school_id = v_school
         and g.period_id = p_period
         and g.subject_id = p_subject
         and g.student_id = (v_cell->>'student_id')::uuid
         and g.kind = v_kind
         and g.number = v_number;
    else
      v_absent := coalesce((v_cell->>'absent')::boolean, false);
      insert into public.grades
        (school_id, period_id, student_id, subject_id, kind, number, score, absent)
      values
        (v_school, p_period, (v_cell->>'student_id')::uuid, p_subject, v_kind, v_number,
         case when v_absent then null else (v_cell->>'score')::numeric end,
         v_absent)
      on conflict on constraint grades_key do update
        set score = excluded.score,
            absent = excluded.absent;
    end if;

    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.save_grades(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_grades(uuid, uuid, jsonb) to authenticated;
