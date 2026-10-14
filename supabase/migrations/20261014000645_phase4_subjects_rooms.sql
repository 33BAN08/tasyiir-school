-- Phase 4 step 4 — subjects and rooms.
-- A subject has a name, an optional short code for timetable cells ("Math",
-- "PC") and a timetable colour. The colour is a key from a
-- fixed palette (CSS tokens --subject-<key>, light + dark), never a raw hex,
-- so every colour stays readable in both themes (docs/DESIGN.md).
-- The Moroccan subjects template is app data (no table), like the levels
-- template: the director picks from it and the chosen subjects are inserted
-- like any other.
-- A room has a name, a capacity and an optional type.
-- Reads: every active member of the school. Writes: own school +
-- structure.manage, through RLS with the user's session (CLAUDE.md).

-- ===========================================================================
-- subjects
-- ===========================================================================
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null,                -- e.g. "Mathématiques"
  code        text,                         -- optional short code, e.g. "Math"
  color       text not null default 'teal',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint subjects_name_check check (name = btrim(name) and char_length(name) between 1 and 60),
  constraint subjects_code_check check (code = btrim(code) and char_length(code) between 1 and 6),
  constraint subjects_color_check check (color in (
    'teal', 'blue', 'indigo', 'violet', 'pink', 'red',
    'orange', 'amber', 'lime', 'green', 'cyan', 'slate'
  )),
  -- Target of later composite foreign keys (timetable, teacher subjects, …).
  constraint subjects_id_school_key unique (id, school_id)
);

-- Names are unique in a school, ignoring case.
create unique index subjects_name_key on public.subjects (school_id, lower(name));
-- Codes too, when set.
create unique index subjects_code_key on public.subjects (school_id, lower(code)) where code is not null;

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- rooms
-- ===========================================================================
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  name        text not null,                -- e.g. "Salle 12", "Labo 1"
  capacity    integer not null,             -- seats
  room_type   text,                         -- optional
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rooms_name_check check (name = btrim(name) and char_length(name) between 1 and 40),
  constraint rooms_capacity_check check (capacity between 1 and 500),
  constraint rooms_type_check check (room_type in ('classroom', 'lab', 'computer_lab', 'gym')),
  constraint rooms_id_school_key unique (id, school_id)
);

create unique index rooms_name_key on public.rooms (school_id, lower(name));

create trigger rooms_set_updated_at
  before update on public.rooms
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- RLS + grants (same rule on both tables)
-- ===========================================================================
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;

revoke all on public.subjects, public.rooms from anon, authenticated;
grant select, insert, update, delete on public.subjects, public.rooms to authenticated;

create policy subjects_select on public.subjects
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy subjects_insert on public.subjects
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy subjects_update on public.subjects
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy subjects_delete on public.subjects
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));

create policy rooms_select on public.rooms
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy rooms_insert on public.rooms
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy rooms_update on public.rooms
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy rooms_delete on public.rooms
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));
