-- Phase 6 step 1 — lessons (the timetable's rows).
--
-- A lesson = class + subject + teacher + optional room on ONE time slot of an
-- academic year. The time slot carries the day and the hours (per year, Phase
-- 4 step 5), so changing next year's hours never rewrites this year.
--
-- Rules enforced by the DATABASE (not only the app):
--   - everything in the lesson's school (composite FKs with school_id);
--   - class and time slot of the lesson's year (FKs with academic_year_id);
--   - only a 'lesson' slot, never a break: slot_kind is always 'lesson' and
--     is part of the FK to time_slots (id, school_id, year, kind) — so a slot
--     that has lessons cannot be turned into a break either;
--   - the teacher teaches that subject: FK (teacher_id, subject_id) →
--     teacher_subjects (which only accepts teacher-role accounts of the
--     school, Phase 5 step 4);
--   - one lesson per class per slot, one per teacher per slot, one per room
--     per slot (unique keys). Slots of one year and day never overlap, so
--     "same slot" = "same time".
--
-- Deletes (all foreign keys NO ACTION = checked at the end of the statement):
--   - a subject, room, time slot or teacher account still used by lessons
--     cannot be deleted; removing a subject from a teacher, or changing a
--     teacher's role, is refused while they have lessons of it;
--   - deleting a CLASS deletes its own lessons (the timetable belongs to the
--     class; a class with students already cannot be deleted);
--   - deleting a whole year cascades (its classes already block that).
--
-- Reads: own school AND timetable module on AND
--   (timetable.view OR timetable.manage            -- staff
--    OR teacher_id = me                            -- a teacher: own lessons
--    OR private.is_guardian_of_class(class_id))    -- a parent: children's classes
-- The platform owner gets no access.
-- Writes: own school + timetable module + timetable.manage, through RLS with
-- the user's session (CLAUDE.md).
--
-- Also:
--   - private.is_linked_to_student() now lets a teacher read the students of
--     the classes they teach in the CURRENT year;
--   - swap_lessons(a, b): exchange two lessons' slots in one transaction
--     (the double-booking keys are DEFERRABLE INITIALLY IMMEDIATE);
--   - timetable_teachers(year): teachers' id + name + active for the
--     timetables a user can read — profiles stay closed (no email / phone);
--   - timetable.manage may read teacher_subjects.

-- ===========================================================================
-- Permissions (timetable module).
--   timetable.view   — every timetable of the school (class / teacher / room)
--   timetable.manage — add, move, delete lessons; copy from last year
-- Director: both. Surveillant: both (PLAN §2: "Absences, justifications,
-- timetable"). Accountant, transport manager: view. Teachers and parents get
-- neither: they read their own rows through the policy below.
-- Directors can change this per school (Rôles et permissions).
-- ===========================================================================
insert into public.permissions (key, module_key) values
  ('timetable.view', 'timetable'), ('timetable.manage', 'timetable');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('timetable.view'), ('timetable.manage')) as p (key)
where r.key in ('director', 'surveillant') and r.is_system;

insert into public.role_permissions (role_id, permission_key)
select r.id, 'timetable.view'
from public.roles r
where r.key in ('accountant', 'transport_manager') and r.is_system;

-- ===========================================================================
-- Targets of the composite foreign keys below.
-- ===========================================================================
alter table public.time_slots
  add constraint time_slots_id_year_kind_key unique (id, school_id, academic_year_id, kind);

-- ===========================================================================
-- lessons
-- ===========================================================================
create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  time_slot_id      uuid not null,
  slot_kind         text not null default 'lesson',   -- always 'lesson' (see FK)
  class_id          uuid not null,
  subject_id        uuid not null,
  teacher_id        uuid not null,
  room_id           uuid,                              -- optional
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint lessons_slot_kind_check check (slot_kind = 'lesson'),

  constraint lessons_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  -- A lesson slot of the same year and school; never a break.
  constraint lessons_time_slot_fkey foreign key (time_slot_id, school_id, academic_year_id, slot_kind)
    references public.time_slots (id, school_id, academic_year_id, kind),
  -- A class of the same year and school; its lessons go with it.
  constraint lessons_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id) on delete cascade,
  constraint lessons_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id),
  constraint lessons_teacher_fkey foreign key (teacher_id, school_id)
    references public.profiles (id, school_id),
  -- The teacher teaches this subject.
  constraint lessons_teacher_subject_fkey foreign key (teacher_id, subject_id)
    references public.teacher_subjects (teacher_id, subject_id),
  constraint lessons_room_fkey foreign key (room_id, school_id)
    references public.rooms (id, school_id),

  -- No double booking. DEFERRABLE INITIALLY IMMEDIATE: checked at the end of
  -- each statement as usual, but swap_lessons() can defer them to swap two
  -- lessons in one transaction.
  constraint lessons_class_slot_key unique (class_id, time_slot_id)
    deferrable initially immediate,
  constraint lessons_teacher_slot_key unique (teacher_id, time_slot_id)
    deferrable initially immediate,
  constraint lessons_room_slot_key unique (room_id, time_slot_id)   -- NULL rooms never clash
    deferrable initially immediate
);

create index lessons_school_idx on public.lessons (school_id);
create index lessons_year_idx on public.lessons (academic_year_id);
create index lessons_time_slot_idx on public.lessons (time_slot_id);
create index lessons_subject_idx on public.lessons (subject_id);
create index lessons_teacher_subject_idx on public.lessons (teacher_id, subject_id);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Is the signed-in user a parent of a student enrolled in this class?
-- Same parent conditions as is_linked_to_student (active account, own
-- password set, active school).
-- ===========================================================================
create or replace function private.is_guardian_of_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments e
    join public.student_guardians sg on sg.student_id = e.student_id and sg.school_id = e.school_id
    join public.guardians g on g.id = sg.guardian_id and g.school_id = sg.school_id
    join public.profiles p on p.id = g.profile_id and p.school_id = sg.school_id
    join public.roles r on r.id = p.role_id
    join public.schools s on s.id = p.school_id
    where e.class_id = p_class_id
      and p.id = auth.uid()
      and r.key = 'parent'
      and p.deactivated_at is null
      and p.must_change_password = false
      and s.status = 'active'
  );
$$;

revoke all on function private.is_guardian_of_class(uuid) from public, anon;
grant execute on function private.is_guardian_of_class(uuid) to authenticated;

-- ===========================================================================
-- is_linked_to_student: guardians (Phase 5) + teachers of the student's class
-- this year (a lesson of the current year in the class the student is
-- enrolled in that year). Only the body changes; the policies stay.
-- ===========================================================================
create or replace function private.is_linked_to_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id and g.school_id = sg.school_id
    join public.profiles p on p.id = g.profile_id and p.school_id = sg.school_id
    join public.roles r on r.id = p.role_id
    join public.schools s on s.id = p.school_id
    where sg.student_id = p_student_id
      and p.id = auth.uid()
      and r.key = 'parent'
      and p.deactivated_at is null
      and p.must_change_password = false
      and s.status = 'active'
  )
  or exists (
    select 1
    from public.student_enrollments e
    join public.academic_years y on y.id = e.academic_year_id and y.school_id = e.school_id
    join public.lessons l on l.class_id = e.class_id and l.academic_year_id = e.academic_year_id
    join public.profiles p on p.id = l.teacher_id and p.school_id = e.school_id
    join public.roles r on r.id = p.role_id
    join public.schools s on s.id = p.school_id
    where e.student_id = p_student_id
      and y.is_current
      and p.id = auth.uid()
      and r.key = 'teacher'
      and p.deactivated_at is null
      and p.must_change_password = false
      and s.status = 'active'
  );
$$;

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.lessons enable row level security;

revoke all on public.lessons from anon, authenticated;
grant select, insert, update, delete on public.lessons to authenticated;

create policy lessons_select on public.lessons
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('timetable'))
         and ((select private.has_permission('timetable.view'))
              or (select private.has_permission('timetable.manage'))
              or teacher_id = (select auth.uid())             -- a teacher: own lessons
              or private.is_guardian_of_class(class_id)));    -- a parent: children's classes

create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('timetable'))
              and (select private.has_permission('timetable.manage')));

create policy lessons_update on public.lessons
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('timetable'))
         and (select private.has_permission('timetable.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('timetable'))
              and (select private.has_permission('timetable.manage')));

create policy lessons_delete on public.lessons
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('timetable'))
         and (select private.has_permission('timetable.manage')));

-- timetable.manage may read which subjects each teacher teaches (to offer
-- only the right teachers when adding a lesson). No personal data in there.
alter policy teacher_subjects_select on public.teacher_subjects
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('users.view'))
              or (select private.has_permission('teachers.manage'))
              or (select private.has_permission('timetable.manage'))
              or teacher_id = (select auth.uid())));

-- ===========================================================================
-- swap_lessons(a, b): lesson a takes b's time slot and b takes a's, in one
-- transaction (drag & drop onto an occupied cell). SECURITY INVOKER: reads
-- and updates go through the RLS above (own school + timetable.manage).
-- The double-booking keys are deferred during the swap, then checked again
-- before returning: a swap that would double-book a teacher, room or class
-- fails as a whole (23505) and nothing changes.
-- ===========================================================================
create function public.swap_lessons(p_a uuid, p_b uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_a public.lessons%rowtype;
  v_b public.lessons%rowtype;
begin
  select * into v_a from public.lessons where id = p_a;
  select * into v_b from public.lessons where id = p_b;
  if v_a.id is null or v_b.id is null or p_a = p_b then
    raise exception 'swap_lessons_not_found' using errcode = 'P0001';
  end if;
  if v_a.academic_year_id <> v_b.academic_year_id then
    raise exception 'swap_lessons_other_year' using errcode = 'P0001';
  end if;

  set constraints public.lessons_class_slot_key, public.lessons_teacher_slot_key,
                  public.lessons_room_slot_key deferred;

  update public.lessons set time_slot_id = v_b.time_slot_id where id = v_a.id;
  if not found then
    raise exception 'swap_lessons_not_found' using errcode = 'P0001';
  end if;
  update public.lessons set time_slot_id = v_a.time_slot_id where id = v_b.id;
  if not found then
    raise exception 'swap_lessons_not_found' using errcode = 'P0001';
  end if;

  -- Check now (inside the function) rather than at commit.
  set constraints public.lessons_class_slot_key, public.lessons_teacher_slot_key,
                  public.lessons_room_slot_key immediate;
end;
$$;

revoke all on function public.swap_lessons(uuid, uuid) from public, anon;
grant execute on function public.swap_lessons(uuid, uuid) to authenticated;

-- ===========================================================================
-- timetable_teachers(year): the teachers' NAMES a timetable needs, without
-- opening profiles (no email, no phone). Returns id + full name + active.
--   - timetable.view / timetable.manage: every teacher-role account of the
--     school, plus any other teacher of the year's lessons;
--   - anyone else (a teacher, a parent): only the teachers of the lessons
--     they can read — same rule as lessons_select (keep both in sync; the
--     tests compare them).
-- SECURITY DEFINER, so it filters by the caller itself.
-- ===========================================================================
create function public.timetable_teachers(p_year uuid default null)
returns table (id uuid, full_name text, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select private.current_school_id() as school_id,
           private.has_module('timetable') as module_on,
           (private.has_permission('timetable.view')
            or private.has_permission('timetable.manage')) as staff
  )
  select p.id, p.full_name, p.deactivated_at is null
  from public.profiles p, me
  where me.module_on
    and p.school_id = me.school_id
    and (
      (me.staff and private.is_teacher_profile(p.id, p.school_id))
      or exists (
        select 1
        from public.lessons l
        where l.teacher_id = p.id
          and l.school_id = me.school_id
          and (p_year is null or l.academic_year_id = p_year)
          and (me.staff
               or l.teacher_id = auth.uid()
               or private.is_guardian_of_class(l.class_id))
      )
    )
  order by p.full_name;
$$;

revoke all on function public.timetable_teachers(uuid) from public, anon;
grant execute on function public.timetable_teachers(uuid) to authenticated;
