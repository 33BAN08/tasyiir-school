-- Phase 7 step 1 — attendance (absences / lateness) in the database.
--
-- A SESSION = one lesson of the timetable on one date, created when someone
-- takes attendance. It keeps a SNAPSHOT of the lesson (year, class, subject,
-- teacher, hours): lessons can later be moved, changed or deleted without
-- rewriting the past. taken_at / taken_by = attendance was done (by whom,
-- when); updated_at / updated_by = the last change.
-- A MARK = one student absent or late in a session. Present students have NO
-- row: a taken session without marks means everyone was there.
--
-- Rules enforced by the DATABASE:
--   - a session is created from a lesson (the trigger fills the snapshot; the
--     caller only gives lesson + date): on that lesson's weekday, inside its
--     academic year, never in the future (school's today = Africa/Casablanca,
--     from the database clock — app servers may have stale time-zone data);
--   - one session per lesson per date;
--   - the snapshot never changes afterwards;
--   - a mark only for a student enrolled in the session's class that year;
--     its session, student and school never change afterwards;
--   - absent → no minutes; late → minutes optional (1–240); note ≤ 200;
--   - everything stays in its school (composite foreign keys).
--
-- Who may write (RLS, own school, attendance module on):
--   - attendance.manage (surveillant, director): any session, any day up to
--     today — corrections, attendance a teacher forgot;
--   - a teacher: only sessions of their own lessons, and only on the SAME day
--     (school's today). They cannot delete a session.
-- Who may read:
--   - attendance.view / .manage: every session and mark of the school;
--   - a teacher: their own sessions (all dates) and those sessions' marks;
--   - a parent: their own children's marks, and the sessions of those marks.
-- The platform owner gets no access.
--
-- save_attendance(lesson, date, marks): one call saves a whole roll call —
-- creates the session if needed, then makes the marks exactly the list given
-- (others removed = present). SECURITY INVOKER: RLS decides; all or nothing.
--
-- Deletes: deleting a lesson keeps its sessions (lesson_id becomes NULL, the
-- snapshot stays). A class, subject or teacher account with attendance history
-- cannot be deleted. Deleting a student deletes their marks.

-- ===========================================================================
-- Permissions (attendance module).
--   attendance.view   — every session, absence and lateness of the school
--   attendance.manage — correct any day, delete a session; later: approve
--                       justifications (step 4)
-- Director and surveillant: both (PLAN §2). Other staff: none (children's
-- data; a director can grant it per school). Teachers and parents read their
-- own rows through the policies below.
-- ===========================================================================
insert into public.permissions (key, module_key) values
  ('attendance.view', 'attendance'), ('attendance.manage', 'attendance');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('attendance.view'), ('attendance.manage')) as p (key)
where r.key in ('director', 'surveillant') and r.is_system;

-- ===========================================================================
-- The school's date (Morocco). Postgres keeps its time-zone data up to date
-- (Morocco is UTC+0 permanently since 2026-09-20).
-- ===========================================================================
create function private.school_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Africa/Casablanca')::date;
$$;

revoke all on function private.school_today() from public, anon;
grant execute on function private.school_today() to authenticated;

-- Target of the session → lesson composite foreign key.
alter table public.lessons
  add constraint lessons_id_school_key unique (id, school_id);

-- ===========================================================================
-- attendance_sessions
-- ===========================================================================
create table public.attendance_sessions (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  lesson_id         uuid,                  -- NULL once the lesson is deleted
  session_date      date not null,
  -- Snapshot of the lesson when attendance was first taken (filled by the trigger).
  class_id          uuid not null,
  subject_id        uuid not null,
  teacher_id        uuid not null,
  start_time        time not null,
  end_time          time not null,
  taken_at          timestamptz not null default now(),
  taken_by          uuid not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid not null,

  constraint attendance_sessions_id_school_key unique (id, school_id),
  constraint attendance_sessions_lesson_date_key unique (lesson_id, session_date),
  constraint attendance_sessions_times_check check (start_time < end_time),

  constraint attendance_sessions_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint attendance_sessions_lesson_fkey foreign key (lesson_id, school_id)
    references public.lessons (id, school_id) on delete set null (lesson_id),
  constraint attendance_sessions_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id),
  constraint attendance_sessions_subject_fkey foreign key (subject_id, school_id)
    references public.subjects (id, school_id),
  constraint attendance_sessions_teacher_fkey foreign key (teacher_id, school_id)
    references public.profiles (id, school_id),
  constraint attendance_sessions_taken_by_fkey foreign key (taken_by, school_id)
    references public.profiles (id, school_id),
  constraint attendance_sessions_updated_by_fkey foreign key (updated_by, school_id)
    references public.profiles (id, school_id)
);

create index attendance_sessions_school_idx on public.attendance_sessions (school_id);
create index attendance_sessions_class_date_idx on public.attendance_sessions (class_id, session_date);
create index attendance_sessions_teacher_date_idx on public.attendance_sessions (teacher_id, session_date);
create index attendance_sessions_year_idx on public.attendance_sessions (academic_year_id);
create index attendance_sessions_subject_idx on public.attendance_sessions (subject_id);

-- New session: checks the lesson and the date, fills the snapshot.
-- SECURITY DEFINER only to READ the lesson (a custom role with
-- attendance.manage may not read lessons); whether the row may be written is
-- still decided by the insert policy, which sees the filled row.
create function private.attendance_sessions_from_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if new.lesson_id is null then
    raise exception 'attendance_lesson_required' using errcode = 'P0001';
  end if;
  select l.academic_year_id, l.class_id, l.subject_id, l.teacher_id,
         ts.day_of_week, ts.start_time, ts.end_time, y.start_date, y.end_date
    into v
  from public.lessons l
  join public.time_slots ts on ts.id = l.time_slot_id
  join public.academic_years y on y.id = l.academic_year_id
  where l.id = new.lesson_id and l.school_id = new.school_id;
  if not found then
    raise exception 'attendance_lesson_not_found' using errcode = 'P0001';
  end if;
  if extract(isodow from new.session_date) <> v.day_of_week then
    raise exception 'attendance_wrong_day' using errcode = 'P0001';
  end if;
  if new.session_date < v.start_date or new.session_date > v.end_date then
    raise exception 'attendance_outside_year' using errcode = 'P0001';
  end if;
  if new.session_date > private.school_today() then
    raise exception 'attendance_future' using errcode = 'P0001';
  end if;

  new.academic_year_id := v.academic_year_id;
  new.class_id := v.class_id;
  new.subject_id := v.subject_id;
  new.teacher_id := v.teacher_id;
  new.start_time := v.start_time;
  new.end_time := v.end_time;
  new.taken_at := now();
  new.taken_by := coalesce(auth.uid(), new.taken_by);
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger attendance_sessions_from_lesson
  before insert on public.attendance_sessions
  for each row execute function private.attendance_sessions_from_lesson();

-- Changes: the snapshot is locked (only the lesson link may be cleared, by the
-- lesson's deletion); every change records who and when.
create function private.attendance_sessions_lock_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id
     or new.academic_year_id is distinct from old.academic_year_id
     or new.session_date is distinct from old.session_date
     or new.class_id is distinct from old.class_id
     or new.subject_id is distinct from old.subject_id
     or new.teacher_id is distinct from old.teacher_id
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.taken_at is distinct from old.taken_at
     or new.taken_by is distinct from old.taken_by
     or (new.lesson_id is not null and new.lesson_id is distinct from old.lesson_id) then
    raise exception 'attendance_session_locked' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger attendance_sessions_lock_snapshot
  before update on public.attendance_sessions
  for each row execute function private.attendance_sessions_lock_snapshot();

-- ===========================================================================
-- attendance_marks: absent or late students only.
-- ===========================================================================
create table public.attendance_marks (
  session_id    uuid not null,
  school_id     uuid not null references public.schools (id) on delete cascade,
  student_id    uuid not null,
  status        text not null,
  minutes_late  smallint,
  note          text,
  marked_by     uuid not null,
  marked_at     timestamptz not null default now(),

  primary key (session_id, student_id),
  constraint attendance_marks_status_check check (status in ('absent', 'late')),
  constraint attendance_marks_minutes_check check (
    (status = 'absent' and minutes_late is null)
    or (status = 'late' and (minutes_late is null or minutes_late between 1 and 240))
  ),
  constraint attendance_marks_note_check check (
    note is null or (note = btrim(note) and char_length(note) between 1 and 200)
  ),
  constraint attendance_marks_session_fkey foreign key (session_id, school_id)
    references public.attendance_sessions (id, school_id) on delete cascade,
  constraint attendance_marks_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint attendance_marks_marked_by_fkey foreign key (marked_by, school_id)
    references public.profiles (id, school_id)
);

create index attendance_marks_school_idx on public.attendance_marks (school_id);
create index attendance_marks_student_idx on public.attendance_marks (student_id);

-- A mark only for a student of the session's class that year; records who and
-- when. On UPDATE only the status, minutes and note may change: a mark never
-- moves to another session, student or school (like the session snapshot).
-- DEFINER to read enrollments whatever the caller may read.
create function private.attendance_marks_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.session_id is distinct from old.session_id
          or new.student_id is distinct from old.student_id
          or new.school_id is distinct from old.school_id) then
    raise exception 'attendance_mark_locked' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.attendance_sessions s
    join public.student_enrollments e
      on e.class_id = s.class_id and e.academic_year_id = s.academic_year_id and e.school_id = s.school_id
    where s.id = new.session_id and e.student_id = new.student_id
  ) then
    raise exception 'attendance_student_not_in_class' using errcode = '23514';
  end if;
  new.marked_by := coalesce(auth.uid(), new.marked_by);
  new.marked_at := now();
  return new;
end;
$$;

create trigger attendance_marks_check
  before insert or update on public.attendance_marks
  for each row execute function private.attendance_marks_check();

-- ===========================================================================
-- Helpers for the policies (DEFINER: no policy reads another policy's table,
-- so no recursion between sessions and marks).
-- ===========================================================================

-- The signed-in teacher's own session (any date).
create function private.is_session_teacher(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attendance_sessions s
    where s.id = p_session_id and s.teacher_id = auth.uid()
  );
$$;

-- The signed-in teacher's own session of TODAY (they may still change it).
create function private.is_session_teacher_today(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attendance_sessions s
    where s.id = p_session_id
      and s.teacher_id = auth.uid()
      and s.session_date = private.school_today()
  );
$$;

-- A parent of this student (same parent conditions as is_guardian_of_class:
-- active account, own password set, active school).
create function private.is_guardian_of_student(p_student_id uuid)
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
  );
$$;

-- A session in which one of the signed-in parent's children is absent or late.
create function private.is_guardian_of_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.attendance_marks m
    where m.session_id = p_session_id and private.is_guardian_of_student(m.student_id)
  );
$$;

revoke all on function private.is_session_teacher(uuid) from public, anon;
revoke all on function private.is_session_teacher_today(uuid) from public, anon;
revoke all on function private.is_guardian_of_student(uuid) from public, anon;
revoke all on function private.is_guardian_of_session(uuid) from public, anon;
grant execute on function private.is_session_teacher(uuid) to authenticated;
grant execute on function private.is_session_teacher_today(uuid) to authenticated;
grant execute on function private.is_guardian_of_student(uuid) to authenticated;
grant execute on function private.is_guardian_of_session(uuid) to authenticated;

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.attendance_sessions enable row level security;
alter table public.attendance_marks enable row level security;

grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select, insert, update, delete on public.attendance_marks to authenticated;

create policy attendance_sessions_select on public.attendance_sessions
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.view'))
              or (select private.has_permission('attendance.manage'))
              or teacher_id = (select auth.uid())                  -- a teacher: own sessions
              or private.is_guardian_of_session(id)));             -- a parent: sessions of their child's marks

-- Insert: staff any day up to today (the trigger refuses the future); a
-- teacher only their own lesson, today. The policy sees the row AFTER the
-- trigger has filled teacher_id from the lesson.
create policy attendance_sessions_insert on public.attendance_sessions
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and ((select private.has_permission('attendance.manage'))
                   or (teacher_id = (select auth.uid())
                       and session_date = (select private.school_today()))));

create policy attendance_sessions_update on public.attendance_sessions
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.manage'))
              or (teacher_id = (select auth.uid())
                  and session_date = (select private.school_today()))))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and ((select private.has_permission('attendance.manage'))
                   or (teacher_id = (select auth.uid())
                       and session_date = (select private.school_today()))));

create policy attendance_sessions_delete on public.attendance_sessions
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and (select private.has_permission('attendance.manage')));

create policy attendance_marks_select on public.attendance_marks
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.view'))
              or (select private.has_permission('attendance.manage'))
              or private.is_session_teacher(session_id)            -- a teacher: marks of own sessions
              or private.is_guardian_of_student(student_id)));     -- a parent: own children's marks

create policy attendance_marks_insert on public.attendance_marks
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and ((select private.has_permission('attendance.manage'))
                   or private.is_session_teacher_today(session_id)));

create policy attendance_marks_update on public.attendance_marks
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.manage'))
              or private.is_session_teacher_today(session_id)))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and ((select private.has_permission('attendance.manage'))
                   or private.is_session_teacher_today(session_id)));

create policy attendance_marks_delete on public.attendance_marks
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.manage'))
              or private.is_session_teacher_today(session_id)));

-- ===========================================================================
-- save_attendance(lesson, date, marks): one roll call, all or nothing.
--   p_marks = [{"student_id": "…", "status": "absent"|"late",
--               "minutes_late": 10 (late only, optional), "note": "…" (optional)}]
-- Creates the session if it does not exist yet, otherwise records the change;
-- then the session's marks become exactly p_marks (a student left out is
-- present). An unchanged mark keeps who marked it and when.
-- Returns the session id. SECURITY INVOKER: every row goes through RLS.
-- ===========================================================================
create function public.save_attendance(p_lesson uuid, p_date date, p_marks jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school  uuid := (select private.current_school_id());
  v_session uuid;
begin
  if jsonb_typeof(p_marks) <> 'array' then
    raise exception 'attendance_marks_invalid' using errcode = 'P0001';
  end if;

  select s.id into v_session
  from public.attendance_sessions s
  where s.lesson_id = p_lesson and s.session_date = p_date;

  if v_session is null then
    insert into public.attendance_sessions (school_id, lesson_id, session_date)
    values (v_school, p_lesson, p_date)
    returning id into v_session;
  else
    update public.attendance_sessions set updated_at = now() where id = v_session;
    if not found then
      raise exception 'attendance_forbidden' using errcode = '42501';
    end if;
  end if;

  delete from public.attendance_marks m
  where m.session_id = v_session
    and m.student_id not in (
      select (x ->> 'student_id')::uuid from jsonb_array_elements(p_marks) x
    );

  insert into public.attendance_marks (session_id, school_id, student_id, status, minutes_late, note)
  select v_session, v_school, x.student_id, x.status, x.minutes_late, nullif(btrim(x.note), '')
  from jsonb_to_recordset(p_marks) as x (student_id uuid, status text, minutes_late smallint, note text)
  on conflict (session_id, student_id) do update
    set status = excluded.status, minutes_late = excluded.minutes_late, note = excluded.note
    where (public.attendance_marks.status, public.attendance_marks.minutes_late, public.attendance_marks.note)
          is distinct from (excluded.status, excluded.minutes_late, excluded.note);

  return v_session;
end;
$$;

revoke all on function public.save_attendance(uuid, date, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, date, jsonb) to authenticated;
