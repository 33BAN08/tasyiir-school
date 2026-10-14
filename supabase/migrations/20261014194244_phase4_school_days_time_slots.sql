-- Phase 4 step 5 — school days and time slots, per academic year.
-- school_days: the week days the school works in a year (1 = Monday …
-- 6 = Saturday, ISO numbering). time_slots: the periods of each school day,
-- lessons and breaks, with an optional label ("Récréation", "Pause
-- déjeuner", "Prière du vendredi"). A break is shown in the timetable grid
-- but can never be booked.
-- Both belong to an academic year, so changing the hours next year never
-- rewrites past timetables or absence history. copy_time_slots() copies a
-- year's days and slots into another (empty) year, all or nothing.
-- Rules enforced here:
--   - days and slots stay in their year's school (composite FKs);
--   - a slot is on one of its year's school days; removing a day that still
--     has slots is refused (NO ACTION, so deleting the whole year still
--     cascades cleanly);
--   - start < end, whole minutes, at most 4 hours;
--   - slots of the same year and day never overlap (back-to-back is fine).
-- Reads: every active member of the school. Writes: own school +
-- structure.manage, through RLS with the user's session (CLAUDE.md).

-- A range of times of day, for the no-overlap rule ("[)" so 08:00–09:00 and
-- 09:00–10:00 do not clash). btree_gist is already installed (step 1).
create type private.timerange as range (subtype = time);

-- ===========================================================================
-- school_days
-- ===========================================================================
create table public.school_days (
  school_id         uuid not null,
  academic_year_id  uuid not null,
  day_of_week       smallint not null,
  created_at        timestamptz not null default now(),
  primary key (school_id, academic_year_id, day_of_week),
  constraint school_days_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint school_days_day_check check (day_of_week between 1 and 6)
);

-- ===========================================================================
-- time_slots
-- ===========================================================================
create table public.time_slots (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null,
  academic_year_id  uuid not null,
  day_of_week       smallint not null,
  start_time        time not null,
  end_time          time not null,
  kind              text not null default 'lesson',
  label             text,                 -- optional, e.g. "Récréation"
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint time_slots_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint time_slots_day_fkey foreign key (school_id, academic_year_id, day_of_week)
    references public.school_days (school_id, academic_year_id, day_of_week) on delete no action,
  constraint time_slots_kind_check check (kind in ('lesson', 'break')),
  constraint time_slots_label_check check (label = btrim(label) and char_length(label) between 1 and 40),
  constraint time_slots_order_check check (start_time < end_time),
  constraint time_slots_minutes_check check (
    date_trunc('minute', start_time) = start_time
    and date_trunc('minute', end_time) = end_time
  ),
  constraint time_slots_length_check check (end_time - start_time <= interval '4 hours'),
  constraint time_slots_no_overlap exclude using gist (
    academic_year_id with =,
    day_of_week with =,
    private.timerange(start_time, end_time) with &&
  ),
  -- Target of later composite foreign keys (timetable entries).
  constraint time_slots_id_school_key unique (id, school_id)
);

create index time_slots_day_idx on public.time_slots (academic_year_id, day_of_week, start_time);
create index time_slots_school_idx on public.time_slots (school_id);

create trigger time_slots_set_updated_at
  before update on public.time_slots
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- RLS + grants (school_days has no UPDATE: a day is added or removed)
-- ===========================================================================
alter table public.school_days enable row level security;
alter table public.time_slots enable row level security;

revoke all on public.school_days, public.time_slots from anon, authenticated;
grant select, insert, delete on public.school_days to authenticated;
grant select, insert, update, delete on public.time_slots to authenticated;

create policy school_days_select on public.school_days
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy school_days_insert on public.school_days
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy school_days_delete on public.school_days
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));

create policy time_slots_select on public.time_slots
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy time_slots_insert on public.time_slots
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy time_slots_update on public.time_slots
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy time_slots_delete on public.time_slots
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));

-- ===========================================================================
-- copy_time_slots(from, to): copies a year's school days and slots into
-- another year of the same school. SECURITY INVOKER: every read and insert
-- goes through the RLS above, so it only works for the user's own school
-- with structure.manage. The target year must have no slots yet; the whole
-- copy is one transaction. Returns the number of slots copied.
-- ===========================================================================
create function public.copy_time_slots(p_from_year uuid, p_to_year uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := (select private.current_school_id());
  v_count  integer;
begin
  if p_from_year = p_to_year then
    raise exception 'copy_time_slots_same_year' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.academic_years
                 where id = p_to_year and school_id = v_school) then
    raise exception 'copy_time_slots_year_not_found' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.time_slots where academic_year_id = p_to_year) then
    raise exception 'copy_time_slots_target_not_empty' using errcode = 'P0001';
  end if;

  insert into public.school_days (school_id, academic_year_id, day_of_week)
  select v_school, p_to_year, d.day_of_week
  from public.school_days d
  where d.academic_year_id = p_from_year and d.school_id = v_school
  on conflict do nothing;

  insert into public.time_slots
    (school_id, academic_year_id, day_of_week, start_time, end_time, kind, label)
  select v_school, p_to_year, s.day_of_week, s.start_time, s.end_time, s.kind, s.label
  from public.time_slots s
  where s.academic_year_id = p_from_year and s.school_id = v_school;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.copy_time_slots(uuid, uuid) from public, anon;
grant execute on function public.copy_time_slots(uuid, uuid) to authenticated;
