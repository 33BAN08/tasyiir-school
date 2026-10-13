-- Phase 4 step 1 — academic years + the structure.manage permission.
-- Moroccan school year: September → June. Exactly one year can be "current"
-- per school; years of a school never overlap.
-- Reads: every active member of the school (classes, timetable, grades all
-- hang off the year). Writes: through RLS with the user's own session
-- (Server Actions use the session client, never the secret key):
-- own school + structure.manage.

-- btree_gist: lets an exclusion constraint mix "=" on uuid with "&&" on ranges.
create extension if not exists btree_gist with schema extensions;

-- ===========================================================================
-- Permission: manage the school structure (years, levels, classes, subjects,
-- rooms, time slots). Core permission (no module). Given to the director
-- template (new schools) and to every existing school's director role.
-- ===========================================================================
insert into public.permissions (key) values ('structure.manage');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'structure.manage'
from public.roles r
where r.key = 'director' and r.is_system;

-- ===========================================================================
-- academic_years
-- ===========================================================================
create table public.academic_years (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  label       text not null,                -- e.g. "2026-2027"
  start_date  date not null,
  end_date    date not null,
  is_current  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_years_label_check check (char_length(btrim(label)) between 1 and 40),
  -- One school year: ends after it starts, and lasts less than a year.
  constraint academic_years_dates_check
    check (end_date > start_date and end_date < start_date + interval '1 year'),
  constraint academic_years_label_key unique (school_id, label),
  constraint academic_years_no_overlap exclude using gist (
    school_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);

-- At most one current year per school.
create unique index academic_years_one_current_idx
  on public.academic_years (school_id) where is_current;

create trigger academic_years_set_updated_at
  before update on public.academic_years
  for each row execute function private.set_updated_at();

-- Making a year current un-sets the previous one in the same statement, so
-- "set current" is one atomic UPDATE. The school row is locked so two
-- concurrent switches run one after the other.
create or replace function private.academic_years_single_current()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_current and (tg_op = 'INSERT' or not old.is_current) then
    perform 1 from public.schools s where s.id = new.school_id for update;
    update public.academic_years
      set is_current = false
      where school_id = new.school_id and id <> new.id and is_current;
  end if;
  return new;
end;
$$;

revoke all on function private.academic_years_single_current() from public, anon, authenticated;

create trigger academic_years_single_current
  before insert or update of is_current on public.academic_years
  for each row execute function private.academic_years_single_current();

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.academic_years enable row level security;

revoke all on public.academic_years from anon, authenticated;
grant select, insert, update, delete on public.academic_years to authenticated;

create policy academic_years_select on public.academic_years
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy academic_years_insert on public.academic_years
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

-- USING picks the rows that may be changed, WITH CHECK the new values:
-- together a row can never be moved to another school.
create policy academic_years_update on public.academic_years
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('structure.manage')));

create policy academic_years_delete on public.academic_years
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('structure.manage')));
