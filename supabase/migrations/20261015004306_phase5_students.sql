-- Phase 5 step 1 — students + their class per academic year + the people
-- permissions. Children's personal data: store only what the school needs
-- (no national ID number), readable only by who needs it.
--
-- Reads (students, student_enrollments): own school AND
--   (students.view OR students.manage            -- school staff
--    OR private.is_linked_to_student(id))         -- parent / teacher, see below
-- The platform owner gets NO access to students (unlike the structure tables).
-- Writes: own school + students.manage, through RLS with the user's session.

-- ===========================================================================
-- Permissions. Core (no module): every plan has students.
--   students.view   — see every student of the school
--   students.manage — create / edit / delete students, their class, photo
--   parents.manage  — parents & guardians, parent accounts (used from step 3)
-- Teachers get none of these: from Phase 6 they will see the students of the
-- classes they teach, through private.is_linked_to_student().
-- ===========================================================================
insert into public.permissions (key) values
  ('students.view'), ('students.manage'), ('parents.manage');

-- Director (template + every school's copy): all three.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('students.view'), ('students.manage'), ('parents.manage')) as p (key)
where r.key = 'director' and r.is_system;

-- Surveillant, accountant, transport manager: read the student list
-- (absences, fees, transport need it). Directors can change this per school.
insert into public.role_permissions (role_id, permission_key)
select r.id, 'students.view'
from public.roles r
where r.key in ('surveillant', 'accountant', 'transport_manager') and r.is_system;

-- ===========================================================================
-- Who else may read one student. Today: nobody. Grows without touching the
-- policies: step 3 adds "a guardian of this student", Phase 6 adds "teaches
-- this student's class this year" (create or replace this function).
-- ===========================================================================
create or replace function private.is_linked_to_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

revoke all on function private.is_linked_to_student(uuid) from public, anon;
grant execute on function private.is_linked_to_student(uuid) to authenticated;

-- ===========================================================================
-- students
-- ===========================================================================
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  first_name     text not null,               -- Latin, as on Massar
  last_name      text not null,
  first_name_ar  text,                        -- Arabic, as on Massar: optional,
  last_name_ar   text,                        -- both or neither (UI falls back to Latin)
  birth_date     date not null,
  gender         text not null,
  code_massar    text,                        -- optional, unique in the school
  photo_path     text,                        -- Storage object path (step 2)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint students_names_check check (
        first_name = btrim(first_name) and char_length(first_name) between 1 and 60
    and last_name  = btrim(last_name)  and char_length(last_name)  between 1 and 60),
  constraint students_names_ar_check check (
    (first_name_ar is null and last_name_ar is null)
    or (    first_name_ar = btrim(first_name_ar) and char_length(first_name_ar) between 1 and 60
        and last_name_ar  = btrim(last_name_ar)  and char_length(last_name_ar)  between 1 and 60)),
  constraint students_gender_check check (gender in ('male', 'female')),
  constraint students_birth_date_check check (birth_date > date '1980-01-01'),
  -- Massar code: one capital letter + 9 digits, e.g. J130012345. The app
  -- trims and uppercases it (form + CSV import) before saving.
  constraint students_code_massar_check check (code_massar ~ '^[A-Z][0-9]{9}$'),
  constraint students_id_school_key unique (id, school_id)
);
create unique index students_code_massar_key on public.students (school_id, code_massar)
  where code_massar is not null;
create index students_school_name_idx on public.students (school_id, last_name, first_name);

create trigger students_set_updated_at
  before update on public.students
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- student_enrollments — the student's class for ONE academic year. One row
-- per (student, year): a new year adds a row, past years are never
-- overwritten. A class change during the year updates that year's row (the
-- audit log keeps the previous class).
-- ===========================================================================
alter table public.classes
  add constraint classes_id_year_school_key unique (id, academic_year_id, school_id);

create table public.student_enrollments (
  school_id         uuid not null references public.schools (id) on delete cascade,
  student_id        uuid not null,
  academic_year_id  uuid not null,
  class_id          uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (student_id, academic_year_id),
  constraint student_enrollments_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  -- The class must belong to that year and that school.
  constraint student_enrollments_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id) on delete restrict
);
create index student_enrollments_class_idx on public.student_enrollments (class_id);
create index student_enrollments_school_year_idx on public.student_enrollments (school_id, academic_year_id);

create trigger student_enrollments_set_updated_at
  before update on public.student_enrollments
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;

revoke all on public.students, public.student_enrollments from anon, authenticated;
grant select, insert, update, delete on public.students, public.student_enrollments to authenticated;

create policy students_select on public.students
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('students.view'))
              or (select private.has_permission('students.manage'))
              or private.is_linked_to_student(id)));

create policy students_insert on public.students
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('students.manage')));

create policy students_update on public.students
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('students.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('students.manage')));

create policy students_delete on public.students
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('students.manage')));

create policy student_enrollments_select on public.student_enrollments
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('students.view'))
              or (select private.has_permission('students.manage'))
              or private.is_linked_to_student(student_id)));

create policy student_enrollments_insert on public.student_enrollments
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('students.manage')));

create policy student_enrollments_update on public.student_enrollments
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('students.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('students.manage')));

create policy student_enrollments_delete on public.student_enrollments
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('students.manage')));
