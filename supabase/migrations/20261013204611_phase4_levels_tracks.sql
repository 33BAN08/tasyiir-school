-- Phase 4 step 2 — levels and filières (tracks).
-- A level belongs to a cycle (Préscolaire, Primaire, Collège, Lycée, other)
-- and has a short name used in class names ("1AC" → "1AC-A"). A level can
-- have filières (Lycée: "Sciences expérimentales", …); a class will pick one.
-- The Moroccan template is app data (no table): the director picks from it
-- and the chosen items are inserted like any other level.
-- Reads: every active member of the school. Writes: own school +
-- structure.manage, through RLS with the user's session (CLAUDE.md).

-- ===========================================================================
-- levels
-- ===========================================================================
create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  cycle       text not null,
  name        text not null,                -- e.g. "1AC", "2Bac"
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint levels_cycle_check
    check (cycle in ('prescolaire', 'primaire', 'college', 'lycee', 'other')),
  constraint levels_name_check check (name = btrim(name) and char_length(name) between 1 and 30),
  constraint levels_sort_order_check check (sort_order >= 0),
  -- Target of the composite foreign keys below: a child row always stays in
  -- the same school as its level.
  constraint levels_id_school_key unique (id, school_id)
);

-- Names are unique in a school, ignoring case ("1ac" = "1AC").
create unique index levels_name_key on public.levels (school_id, lower(name));

create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- tracks (filières) — belong to one level, same school
-- ===========================================================================
create table public.tracks (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  level_id    uuid not null,
  name        text not null,                -- e.g. "Sciences expérimentales"
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tracks_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete cascade,
  constraint tracks_name_check check (name = btrim(name) and char_length(name) between 1 and 60),
  constraint tracks_sort_order_check check (sort_order >= 0)
);

-- Names are unique within a level, ignoring case.
create unique index tracks_name_key on public.tracks (level_id, lower(name));
create index tracks_school_id_idx on public.tracks (school_id);

create trigger tracks_set_updated_at
  before update on public.tracks
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- RLS + grants (same rule on both tables)
-- ===========================================================================
alter table public.levels enable row level security;
alter table public.tracks enable row level security;

revoke all on public.levels, public.tracks from anon, authenticated;
grant select, insert, update, delete on public.levels, public.tracks to authenticated;

create policy levels_select on public.levels
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy levels_insert on public.levels
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy levels_update on public.levels
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy levels_delete on public.levels
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));

create policy tracks_select on public.tracks
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy tracks_insert on public.tracks
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy tracks_update on public.tracks
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy tracks_delete on public.tracks
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));
