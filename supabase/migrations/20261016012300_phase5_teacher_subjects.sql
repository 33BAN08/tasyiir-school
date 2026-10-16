-- Phase 5 step 4 — teachers and the subjects they teach.
--
-- A teacher is a staff account (profiles row, created from /staff) whose role
-- is the school's system role 'teacher'. Nothing new to store about the
-- person: this step only records WHICH subjects each teacher teaches, for the
-- timetable (Phase 6: a lesson's teacher must teach its subject) and the
-- teacher list (/teachers).
--
-- teacher_subjects: teacher ↔ subject, both in the same school (composite
-- FKs). Only a teacher-role account can be given subjects (trigger); when an
-- account stops being a teacher (role change), its subjects are removed.
-- Deleting a subject or an account removes its rows (an assignment, not a
-- history: the Phase 6 timetable will keep its own references).
--
-- Who reads: own school AND (users.view OR teachers.manage OR it is my row).
-- Who writes: teachers.manage, own school, through RLS with the session.
-- teachers.manage holders may also read the school's teacher ACCOUNTS
-- (profiles), so the /teachers page works without users.view.

-- ===========================================================================
-- Permission (core). Director (template + every school's copy).
-- ===========================================================================
insert into public.permissions (key) values ('teachers.manage');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'teachers.manage'
from public.roles r
where r.key = 'director' and r.is_system;

-- ===========================================================================
-- Is this profile a teacher of that school? (role 'teacher' of the school)
-- ===========================================================================
create or replace function private.is_teacher_profile(p_profile_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = p_profile_id
      and p.school_id = p_school_id
      and r.school_id = p_school_id
      and r.key = 'teacher'
  );
$$;

revoke all on function private.is_teacher_profile(uuid, uuid) from public, anon;
grant execute on function private.is_teacher_profile(uuid, uuid) to authenticated;

-- ===========================================================================
-- teacher_subjects
-- ===========================================================================
create table public.teacher_subjects (
  school_id   uuid not null references public.schools (id) on delete cascade,
  teacher_id  uuid not null,
  subject_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (teacher_id, subject_id),
  constraint teacher_subjects_teacher_fkey foreign key (teacher_id, school_id)
    references public.profiles (id, school_id) on delete cascade,
  constraint teacher_subjects_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id) on delete cascade
);
create index teacher_subjects_subject_idx on public.teacher_subjects (subject_id);
create index teacher_subjects_school_idx on public.teacher_subjects (school_id);

-- Only a teacher-role account of the same school.
create or replace function private.teacher_subjects_check_teacher()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_teacher_profile(new.teacher_id, new.school_id) then
    raise exception 'not a teacher of this school'
      using errcode = '23514', constraint = 'teacher_subjects_teacher_role_check';
  end if;
  return new;
end;
$$;

create trigger teacher_subjects_check_teacher
  before insert or update on public.teacher_subjects
  for each row execute function private.teacher_subjects_check_teacher();

-- An account that stops being a teacher loses its subjects.
create or replace function private.profiles_drop_teacher_subjects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_teacher_profile(new.id, new.school_id) then
    delete from public.teacher_subjects where teacher_id = new.id;
  end if;
  return null;
end;
$$;

revoke all on function private.profiles_drop_teacher_subjects() from public, anon, authenticated;

create trigger profiles_drop_teacher_subjects
  after update of role_id, school_id on public.profiles
  for each row
  when (old.role_id is distinct from new.role_id or old.school_id is distinct from new.school_id)
  execute function private.profiles_drop_teacher_subjects();

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.teacher_subjects enable row level security;

revoke all on public.teacher_subjects from anon, authenticated;
grant select, insert, delete on public.teacher_subjects to authenticated;
-- No UPDATE: a change is delete + insert.

create policy teacher_subjects_select on public.teacher_subjects
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('users.view'))
              or (select private.has_permission('teachers.manage'))
              or teacher_id = (select auth.uid())));     -- a teacher: own subjects

create policy teacher_subjects_insert on public.teacher_subjects
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('teachers.manage')));

create policy teacher_subjects_delete on public.teacher_subjects
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('teachers.manage')));

-- teachers.manage may read the school's teacher accounts (names for /teachers).
-- A second permissive SELECT policy: OR-ed with profiles_select.
create policy profiles_select_teachers on public.profiles
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('teachers.manage'))
         and private.is_teacher_profile(id, school_id));
