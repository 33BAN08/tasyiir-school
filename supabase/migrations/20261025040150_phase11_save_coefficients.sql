-- Phase 11 step 2 (UX) — save the coefficient grid in one transaction.
--
-- save_subject_coefficients(year, cells): every changed cell of the grid at
-- once, all or nothing. A cell = level + filière (null = the level's common
-- row) + subject, with:
--   coefficient null  → the row is removed (common: subject not graded at the
--                       level; filière: back to the common value)
--   coefficient set   → the row is added or changed (coefficient,
--                       controls_count = override or null, position =
--                       report card order)
-- SECURITY INVOKER: the existing grants and RLS decide (grades.manage, own
-- school, grades module) and the CHECKs refuse bad values; one error
-- rolls the whole save back. At most 500 cells. Returns the number of rows
-- added / changed / removed.
create function public.save_subject_coefficients(p_year uuid, p_cells jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := (select private.current_school_id());
  v_cell   jsonb;
  v_track  uuid;
  v_count  integer := 0;
  v_rows   integer;
begin
  if not (private.has_module('grades') and private.has_permission('grades.manage')) then
    raise exception 'coefficients_forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years y where y.id = p_year and y.school_id = v_school) then
    raise exception 'coefficients_year_not_found' using errcode = '23503';
  end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) > 500 then
    raise exception 'coefficients_too_many' using errcode = '22023';
  end if;

  for v_cell in select * from jsonb_array_elements(p_cells) loop
    v_track := nullif(v_cell->>'track_id', '')::uuid;
    if v_cell->'coefficient' is null or jsonb_typeof(v_cell->'coefficient') = 'null' then
      delete from public.subject_coefficients c
       where c.school_id = v_school
         and c.academic_year_id = p_year
         and c.level_id = (v_cell->>'level_id')::uuid
         and c.track_id is not distinct from v_track
         and c.subject_id = (v_cell->>'subject_id')::uuid;
    else
      insert into public.subject_coefficients
        (school_id, academic_year_id, level_id, track_id, subject_id,
         coefficient, controls_count, "position")
      values
        (v_school, p_year, (v_cell->>'level_id')::uuid, v_track, (v_cell->>'subject_id')::uuid,
         (v_cell->>'coefficient')::numeric,
         nullif(v_cell->>'controls_count', '')::smallint,
         coalesce((v_cell->>'position')::smallint, 0))
      on conflict on constraint subject_coefficients_key do update
        set coefficient = excluded.coefficient,
            controls_count = excluded.controls_count,
            "position" = excluded."position";
    end if;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.save_subject_coefficients(uuid, jsonb) from public, anon;
grant execute on function public.save_subject_coefficients(uuid, jsonb) to authenticated;
