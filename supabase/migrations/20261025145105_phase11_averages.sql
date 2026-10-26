-- Phase 11 step 5 — averages and rank, computed in ONE SQL function.
--
-- public.class_averages(class) = every average of one class for its year, so
-- the staff screens, the teacher's sheet, the report card (step 8), the
-- published snapshots (step 7) and the tests all read the same numbers.
--
-- Rules (defaults, user 2026-10-25; each one configurable per year + level in
-- grade_level_settings, NO ROW = the defaults, read through
-- public.grade_level_rules(year) as before):
--   activities_weight  activités intégrées count as that many contrôles
--                      (default 1 = "one more contrôle").
--   absent_as_zero     false (default) = an absent contrôle is left out of the
--                      average; true = it counts as 0.
--   rounding           'round' (default, 2 decimals, half up) | 'truncate'.
--   ranking            'shared' (default: ties share the rank, the next one is
--                      skipped: 1, 1, 3) | 'dense' (1, 1, 2).
--
-- Computation, on the level's scale (/10 or /20), always from the ROUNDED
-- value of the step before (what the report card shows, so anyone can redo
-- the sum by hand):
--   subject, semester  = Σ (mark × w) / Σ w over the counted marks
--                        (w = 1 for a contrôle, activities_weight for the
--                        activités mark); no counted mark = no average.
--   general, semester  = Σ (coefficient × subject average) / Σ coefficient over
--                        the subjects that HAVE an average (the others are
--                        counted in `missing`).
--   subject, year      = Σ (period weight × semester average) / Σ weight over
--                        the semesters that have one.
--   general, year      = Σ (period weight × semester general) / Σ weight over
--                        the semesters that have one ((S1 + S2) / 2 by default;
--                        `missing` = semesters without one).
--   rank               within the class, per row group (a semester or the year
--                      × a subject or the general average), only students with
--                      an average; `ranked` = how many were ranked.
--   class_average / class_min / class_max = the same group's figures.
-- Subjects = the class's graded subjects (subject_coefficients: the filière's
-- row wins over the level's common row, subject by subject). Every mark stored
-- counts, also those beyond a lowered contrôle count ("(ancien)" columns).
--
-- Who may call it (SECURITY INVOKER: RLS on every table read decides too):
--   grades.view / grades.manage → every row (subjects + general + rank);
--   a teacher with a lesson in that class → only the subject rows of the
--   subjects they teach there (no general average, it would be built on
--   grades they cannot read);
--   anyone else (parents, students, …) → 42501 averages_forbidden.
-- Parents keep reading nothing until publishing (step 7).

-- ===========================================================================
-- Calculation rules per level
-- ===========================================================================
alter table public.grade_level_settings
  add column activities_weight numeric(3, 1) not null default 1,
  add column absent_as_zero    boolean not null default false,
  add column rounding          text not null default 'round',
  add column ranking           text not null default 'shared',
  add constraint grade_level_settings_activities_weight_check
    check (activities_weight > 0 and activities_weight <= 5),
  add constraint grade_level_settings_rounding_check
    check (rounding in ('round', 'truncate')),
  add constraint grade_level_settings_ranking_check
    check (ranking in ('shared', 'dense'));

grant insert (activities_weight, absent_as_zero, rounding, ranking)
  on public.grade_level_settings to authenticated;
grant update (activities_weight, absent_as_zero, rounding, ranking)
  on public.grade_level_settings to authenticated;

-- The return type grows: drop and create again (same rights).
drop function public.grade_level_rules(uuid);

create function public.grade_level_rules(p_year uuid)
returns table (level_id uuid, scale smallint, controls_count smallint,
               activities boolean, activities_weight numeric, absent_as_zero boolean,
               rounding text, ranking text, customised boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id,
         coalesce(s.scale, case when l.cycle = 'primaire' then 10 else 20 end)::smallint,
         coalesce(s.controls_count, 4)::smallint,
         coalesce(s.activities, false),
         coalesce(s.activities_weight, 1),
         coalesce(s.absent_as_zero, false),
         coalesce(s.rounding, 'round'),
         coalesce(s.ranking, 'shared'),
         s.level_id is not null
  from public.levels l
  left join public.grade_level_settings s
    on s.level_id = l.id and s.academic_year_id = p_year
  where l.school_id = (select private.current_school_id());
$$;

revoke all on function public.grade_level_rules(uuid) from public, anon;
grant execute on function public.grade_level_rules(uuid) to authenticated;

-- 2 decimals, rounded half up or truncated.
create function private.grade_round(p_value numeric, p_mode text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_mode = 'truncate' then trunc(p_value, 2) else round(p_value, 2) end;
$$;

revoke all on function private.grade_round(numeric, text) from public, anon;
grant execute on function private.grade_round(numeric, text) to authenticated;

-- ===========================================================================
-- class_averages(class)
-- ===========================================================================
create function public.class_averages(p_class uuid)
returns table (
  student_id     uuid,
  period_id      uuid,      -- NULL = the year
  subject_id     uuid,      -- NULL = the general average
  coefficient    numeric,   -- subject rows only
  marks          integer,   -- subject + semester rows: marks counted
  absences       integer,   -- subject + semester rows: absent marks
  missing        integer,   -- general rows: subjects (semester) / semesters (year) without an average
  average        numeric,
  rank           integer,
  ranked         integer,
  class_average  numeric,
  class_min      numeric,
  class_max      numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school   uuid := (select private.current_school_id());
  v_year     uuid;
  v_level    uuid;
  v_track    uuid;
  v_full     boolean;
  v_aw       numeric;
  v_zero     boolean;
  v_round    text;
  v_ranking  text;
begin
  if v_school is null or not private.has_module('grades') then
    raise exception 'averages_forbidden' using errcode = '42501';
  end if;

  select c.academic_year_id, c.level_id, c.track_id into v_year, v_level, v_track
  from public.classes c
  where c.id = p_class and c.school_id = v_school;
  if v_year is null then
    raise exception 'averages_class_not_found' using errcode = '23503';
  end if;

  v_full := private.has_permission('grades.view') or private.has_permission('grades.manage');
  if not v_full and not exists (
    select 1 from public.lessons l
     where l.class_id = p_class and l.teacher_id = (select auth.uid())
  ) then
    raise exception 'averages_forbidden' using errcode = '42501';
  end if;

  select r.activities_weight, r.absent_as_zero, r.rounding, r.ranking
    into v_aw, v_zero, v_round, v_ranking
  from public.grade_level_rules(v_year) r
  where r.level_id = v_level;

  return query
  with subj as (
    -- The class's graded subjects: the filière's row wins over the common one.
    select distinct on (c.subject_id) c.subject_id, c.coefficient
    from public.subject_coefficients c
    where c.academic_year_id = v_year
      and c.level_id = v_level
      and (c.track_id is null or c.track_id = v_track)
      and (v_full or exists (select 1 from public.lessons l
                              where l.class_id = p_class
                                and l.subject_id = c.subject_id
                                and l.teacher_id = (select auth.uid())))
    order by c.subject_id, c.track_id nulls last
  ),
  pupils as (
    select e.student_id
    from public.student_enrollments e
    where e.class_id = p_class and e.academic_year_id = v_year
  ),
  periods as (
    select p.id, p.weight
    from public.grading_periods p
    where p.academic_year_id = v_year and p.school_id = v_school
  ),
  tallies as (
    select g.student_id, g.period_id, g.subject_id,
           count(*) filter (where not g.absent or v_zero)::int as n,
           count(*) filter (where g.absent)::int as n_absent,
           sum(case when g.kind = 'activities' then v_aw else 1 end
               * coalesce(g.score, 0))
             filter (where not g.absent or v_zero) as total,
           sum(case when g.kind = 'activities' then v_aw else 1 end)
             filter (where not g.absent or v_zero) as weights
    from public.grades g
    join pupils s on s.student_id = g.student_id
    join subj on subj.subject_id = g.subject_id
    where g.academic_year_id = v_year
    group by g.student_id, g.period_id, g.subject_id
  ),
  subject_period as (
    select s.student_id, p.id as period_id, subj.subject_id, subj.coefficient,
           p.weight, coalesce(m.n, 0) as n, coalesce(m.n_absent, 0) as n_absent,
           case when m.weights > 0
                then private.grade_round(m.total / m.weights, v_round) end as average
    from pupils s
    cross join periods p
    cross join subj
    left join tallies m on m.student_id = s.student_id
                     and m.period_id = p.id
                     and m.subject_id = subj.subject_id
  ),
  general_period as (
    select sp.student_id, sp.period_id, sp.weight,
           count(*) filter (where sp.average is null)::int as missing,
           case when sum(sp.coefficient) filter (where sp.average is not null) > 0
                then private.grade_round(
                       sum(sp.coefficient * sp.average) filter (where sp.average is not null)
                       / sum(sp.coefficient) filter (where sp.average is not null),
                       v_round) end as average
    from subject_period sp
    group by sp.student_id, sp.period_id, sp.weight
  ),
  subject_year as (
    select sp.student_id, sp.subject_id, sp.coefficient,
           case when sum(sp.weight) filter (where sp.average is not null) > 0
                then private.grade_round(
                       sum(sp.weight * sp.average) filter (where sp.average is not null)
                       / sum(sp.weight) filter (where sp.average is not null),
                       v_round) end as average
    from subject_period sp
    group by sp.student_id, sp.subject_id, sp.coefficient
  ),
  general_year as (
    select gp.student_id,
           count(*) filter (where gp.average is null)::int as missing,
           case when sum(gp.weight) filter (where gp.average is not null) > 0
                then private.grade_round(
                       sum(gp.weight * gp.average) filter (where gp.average is not null)
                       / sum(gp.weight) filter (where gp.average is not null),
                       v_round) end as average
    from general_period gp
    group by gp.student_id
  ),
  all_rows as (
    select sp.student_id, sp.period_id, sp.subject_id, sp.coefficient,
           sp.n as marks, sp.n_absent as absences, null::int as missing, sp.average
    from subject_period sp
    union all
    select sy.student_id, null, sy.subject_id, sy.coefficient, null, null, null, sy.average
    from subject_year sy
    union all
    select gp.student_id, gp.period_id, null, null, null, null, gp.missing, gp.average
    from general_period gp
    where v_full
    union all
    select gy.student_id, null, null, null, null, null, gy.missing, gy.average
    from general_year gy
    where v_full
  )
  select r.student_id, r.period_id, r.subject_id, r.coefficient, r.marks, r.absences,
         r.missing, r.average,
         case when r.average is null then null
              when v_ranking = 'dense'
                then dense_rank() over w_ranked
              else rank() over w_ranked end::int,
         (count(r.average) over w_group)::int,
         private.grade_round(avg(r.average) over w_group, v_round),
         min(r.average) over w_group,
         max(r.average) over w_group
  from all_rows r
  window w_group as (partition by r.period_id, r.subject_id),
         w_ranked as (partition by r.period_id, r.subject_id, r.average is null
                      order by r.average desc);
end;
$$;

revoke all on function public.class_averages(uuid) from public, anon;
grant execute on function public.class_averages(uuid) to authenticated;
