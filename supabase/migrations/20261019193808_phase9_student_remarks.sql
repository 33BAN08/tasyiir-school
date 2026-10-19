-- Phase 9 step 3 — student remarks ("Remarques").
--
-- A REMARK = a short note on one student: a type (behavior, homework not
-- done, material forgotten, praise) + a text ≤ 500. Written by:
--   - a teacher, only for students of classes they teach this year (a lesson
--     of the student's current class in the current year's timetable);
--   - staff with attendance.manage (any student of the school).
-- The student must be enrolled this year (the year is stored on the remark).
-- Each parent account of the student is told at once (in-app notification
-- 'remark', data: remark_id, remark_type). Later (Phase 10, Pro) remarks feed
-- the report cards.
--
-- Reads: the author; the director and attendance.manage = every remark of the
-- school; a teacher = this year's remarks of students now in a class they
-- teach; a parent = their own children's remarks.
-- Parents mark a remark read ("Lu"): read_at + read_by, once (not undone), by
-- any parent of the child. The author may change type / text or delete the
-- remark within 24 hours of writing it, and only then; a changed remark is
-- unread again (read_at cleared, the parents' notification unread again with
-- the new type). MODERATION: the director and attendance.manage may delete ANY
-- remark of the school at any time (inappropriate or wrong). Every delete is
-- written to audit_logs by the database itself (who, when, the remark as it
-- was; action 'remark.moderate' when not the author, else 'remark.delete'),
-- so a delete straight through the API is recorded too. Deleted → its
-- notifications go. Deleting the author's account keeps the remark (author
-- NULL); deleting the student (or the school) logs nothing.
-- Module: messaging (Basic plan), like announcements.

-- ===========================================================================
-- student_remarks
-- ===========================================================================
create table public.student_remarks (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  student_id        uuid not null,
  academic_year_id  uuid not null,         -- set by the trigger (current year)
  type              text not null,
  body              text not null,
  created_by        uuid,                  -- set by the trigger; NULL once the account is deleted
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  read_at           timestamptz,
  read_by           uuid,

  constraint student_remarks_type_check
    check (type in ('behavior', 'homework', 'material', 'praise')),
  constraint student_remarks_body_check
    check (body = btrim(body) and char_length(body) between 1 and 500),
  constraint student_remarks_read_check check (read_by is null or read_at is not null),   -- read_by NULL once that account is deleted
  constraint student_remarks_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint student_remarks_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint student_remarks_author_fkey foreign key (created_by, school_id)
    references public.profiles (id, school_id) on delete set null (created_by),
  constraint student_remarks_read_by_fkey foreign key (read_by)
    references public.profiles (id) on delete set null
);

create index student_remarks_student_idx on public.student_remarks (student_id, created_at desc);
create index student_remarks_school_idx on public.student_remarks (school_id, created_at desc);
create index student_remarks_year_idx on public.student_remarks (academic_year_id, school_id);
create index student_remarks_author_idx on public.student_remarks (created_by, school_id);
create index student_remarks_read_by_idx on public.student_remarks (read_by);

alter table public.student_remarks enable row level security;
revoke all on public.student_remarks from anon, authenticated;

-- ===========================================================================
-- notifications: new type 'remark'. Copy the CURRENT list from the database
-- (`pg_get_constraintdef`), never from an older migration.
-- ===========================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                  'subscription_expiring', 'demo_request', 'announcement', 'remark'));

create index notifications_remark_idx on public.notifications ((data ->> 'remark_id'))
  where type = 'remark';

-- ===========================================================================
-- Does the signed-in teacher teach this student this year (a lesson of the
-- student's current-year class, by them)?
-- ===========================================================================
create function private.teaches_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments e
    join public.academic_years y on y.id = e.academic_year_id and y.is_current
    join public.lessons l on l.class_id = e.class_id and l.academic_year_id = e.academic_year_id
    join public.profiles p on p.id = l.teacher_id and p.school_id = e.school_id
    join public.roles r on r.id = p.role_id and r.key = 'teacher'
    where e.student_id = p_student
      and l.teacher_id = auth.uid()
      and p.deactivated_at is null
  );
$$;

revoke all on function private.teaches_student(uuid) from public, anon;
grant execute on function private.teaches_student(uuid) to authenticated;

-- ===========================================================================
-- Triggers.
-- ===========================================================================

-- Before insert: author, time, current year (the student must be enrolled).
create function private.student_remarks_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_at := null;
  new.read_at := null;
  new.read_by := null;
  new.body := btrim(new.body);
  select e.academic_year_id into new.academic_year_id
  from public.student_enrollments e
  join public.academic_years y on y.id = e.academic_year_id and y.is_current
  where e.student_id = new.student_id and e.school_id = new.school_id;
  if new.academic_year_id is null then
    raise exception 'remark_student_not_enrolled' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger student_remarks_before_insert
  before insert on public.student_remarks
  for each row execute function private.student_remarks_before_insert();

-- Before update (type, body, read_at are granted; the policy lets the author
-- (24 h) and the child's parents through): the author changes type / text —
-- then unread again; a parent only marks it read, once.
create function private.student_remarks_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  if (new.type, new.body) is distinct from (old.type, old.body) then
    if old.created_by is distinct from auth.uid() or old.created_at <= now() - interval '24 hours' then
      raise exception 'remark_locked' using errcode = 'P0001';
    end if;
    new.updated_at := now();
    new.read_at := null;
    new.read_by := null;
  elsif new.read_at is distinct from old.read_at then
    if not private.is_guardian_of_student(old.student_id) then
      raise exception 'remark_read_parent_only' using errcode = 'P0001';
    end if;
    new.read_at := coalesce(old.read_at, now());
    new.read_by := case when old.read_at is null then auth.uid() else old.read_by end;
  else
    new.read_by := old.read_by;
  end if;
  return new;
end;
$$;

create trigger student_remarks_before_update
  before update on public.student_remarks
  for each row execute function private.student_remarks_before_update();

-- At once: each parent account of the student (same as absence notices:
-- active, own password set), school active, messaging on.
create function private.student_remarks_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, recipient_id, type, student_id, data)
  select new.school_id, p.id, 'remark', new.student_id,
         jsonb_build_object('remark_id', new.id, 'remark_type', new.type)
  from public.schools sc
  join public.student_guardians sg on sg.student_id = new.student_id and sg.school_id = new.school_id
  join public.guardians g on g.id = sg.guardian_id and g.school_id = new.school_id
  join public.profiles p on p.id = g.profile_id and p.school_id = new.school_id
  join public.roles r on r.id = p.role_id and r.key = 'parent'
  where sc.id = new.school_id and sc.status = 'active'
    and p.deactivated_at is null
    and p.must_change_password = false
    and private.school_has_module(new.school_id, 'messaging');
  return null;
end;
$$;

create trigger student_remarks_notify
  after insert on public.student_remarks
  for each row execute function private.student_remarks_notify();

-- Changed by the author → the parents' notifications show the new type and
-- are unread again.
create function private.student_remarks_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.type, new.body) is distinct from (old.type, old.body) then
    update public.notifications n
       set data = n.data || jsonb_build_object('remark_type', new.type),
           read_at = null
     where n.type = 'remark' and n.data ->> 'remark_id' = new.id::text;
  end if;
  return null;
end;
$$;

create trigger student_remarks_after_update
  after update of type, body on public.student_remarks
  for each row execute function private.student_remarks_after_update();

-- Deleted → its notifications go too, and the delete is logged (not when the
-- student itself is being deleted: by then it no longer exists).
create function private.student_remarks_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.type = 'remark' and n.data ->> 'remark_id' = old.id::text;

  if exists (select 1 from public.students s where s.id = old.student_id) then
    insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
    values (old.school_id, auth.uid(),
            case when auth.uid() is distinct from old.created_by then 'remark.moderate' else 'remark.delete' end,
            'student_remark', old.id::text,
            jsonb_build_object('student_id', old.student_id, 'type', old.type, 'body', old.body,
                               'author_id', old.created_by, 'created_at', old.created_at,
                               'read_at', old.read_at));
  end if;
  return null;
end;
$$;

create trigger student_remarks_after_delete
  after delete on public.student_remarks
  for each row execute function private.student_remarks_after_delete();

-- ===========================================================================
-- Grants + RLS.
-- ===========================================================================
grant select, delete on public.student_remarks to authenticated;
grant insert (school_id, student_id, type, body) on public.student_remarks to authenticated;
grant update (type, body, read_at) on public.student_remarks to authenticated;

create policy student_remarks_select on public.student_remarks
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and (created_by = (select auth.uid())
              or (select private.is_director())
              or (select private.has_permission('attendance.manage'))
              or (private.teaches_student(student_id)
                  and exists (select 1 from public.academic_years y
                              where y.id = academic_year_id and y.is_current))
              or private.is_guardian_of_student(student_id)));

create policy student_remarks_insert on public.student_remarks
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('messaging'))
              and created_by = (select auth.uid())
              and ((select private.has_permission('attendance.manage'))
                   or private.teaches_student(student_id)));

-- The author within 24 h (type / text), or a parent of the child (read).
-- The trigger decides which columns each may change.
create policy student_remarks_update on public.student_remarks
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and ((created_by = (select auth.uid()) and created_at > now() - interval '24 hours')
              or private.is_guardian_of_student(student_id)))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('messaging'))
              and ((created_by = (select auth.uid()) and created_at > now() - interval '24 hours')
                   or private.is_guardian_of_student(student_id)));

-- Delete: the author within 24 h; the director / attendance.manage any, any time.
create policy student_remarks_delete on public.student_remarks
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and ((created_by = (select auth.uid()) and created_at > now() - interval '24 hours')
              or (select private.is_director())
              or (select private.has_permission('attendance.manage'))));
