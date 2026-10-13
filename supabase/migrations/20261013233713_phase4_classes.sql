-- Phase 4 step 3 — classes.
-- A class belongs to one academic year and one level of the same school, and
-- optionally to one filière OF THAT LEVEL. Shown as "<name> <year>", e.g.
-- "1AC-A 2026-2027". Names are unique within a year (the same "1AC-A" comes
-- back every year).
-- A year, level or filière that still has classes cannot be deleted
-- (ON DELETE RESTRICT); the app explains why.
-- Reads: every active member of the school. Writes: own school +
-- structure.manage, through RLS with the user's session (CLAUDE.md).

-- Targets of the composite foreign keys below.
alter table public.academic_years
  add constraint academic_years_id_school_key unique (id, school_id);
alter table public.tracks
  add constraint tracks_id_level_key unique (id, level_id);

create table public.classes (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  level_id          uuid not null,
  track_id          uuid,                     -- filière, optional
  name              text not null,            -- e.g. "1AC-A"
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Year and level of the same school; filière of the same level.
  constraint classes_academic_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete restrict,
  constraint classes_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete restrict,
  constraint classes_track_fkey foreign key (track_id, level_id)
    references public.tracks (id, level_id) on delete restrict,
  constraint classes_name_check check (name = btrim(name) and char_length(name) between 1 and 30)
);

-- Unique within a year, ignoring case.
create unique index classes_name_key on public.classes (academic_year_id, lower(name));
create index classes_school_id_idx on public.classes (school_id);
create index classes_level_id_idx on public.classes (level_id);
create index classes_track_id_idx on public.classes (track_id) where track_id is not null;

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.classes enable row level security;

revoke all on public.classes from anon, authenticated;
grant select, insert, update, delete on public.classes to authenticated;

create policy classes_select on public.classes
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy classes_insert on public.classes
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy classes_update on public.classes
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy classes_delete on public.classes
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));
