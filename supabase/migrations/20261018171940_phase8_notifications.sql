-- Phase 8 step 1 — notifications in the database + absence notifications.
--
-- NOTIFICATIONS = what a person is told, in the app (later also by email).
-- One row per recipient: a type + the data to write the sentence, never the
-- sentence itself — it is written when shown, in the reader's language. What
-- creates a notification never knows how it will be delivered: email (Resend,
-- tasyir.ma) will be added later as a delivery of these rows.
-- Nobody writes notifications through the API: only the database (triggers,
-- scheduled jobs). A person reads only their own and may only mark them read.
--
-- ABSENCE NOTIFICATIONS (every plan: part of attendance):
--   - a student marked ABSENT → after 10 minutes, each parent account of the
--     student is told ("Amine absent · Arabe 08:00–09:00 · 12/10/2026");
--   - corrected within those 10 minutes (present or late) → nothing is sent;
--   - corrected AFTER it was sent → a short correction to the same parents
--     ("Amine was present after all" / "…was late, not absent"; the whole
--     roll call deleted → "L'absence a été annulée par l'établissement");
--   - marked absent again later → a new notification, 10 minutes later.
--   Only absences of the last 7 days (school's today) are notified: entering
--   older weeks afterwards sends nothing. Lateness alone is not notified here
--   (the daily "repeated lateness" alert comes in step 4).
--
-- How: a trigger on attendance_marks keeps ABSENCE_NOTICES — one row per
-- absent student per session, with a snapshot (date, hours, subject) and
-- due_at = marked + 10 min, sent_at once sent. A pg_cron job runs every minute
-- and sends what is due. The trigger is SECURITY DEFINER: a teacher saving a
-- roll call may not write notifications themselves.

-- ===========================================================================
-- Is a module on for a GIVEN school (scheduled jobs have no signed-in user;
-- same rule as private.has_module).
-- ===========================================================================
create function private.school_has_module(p_school uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select sm.enabled
       from public.school_modules sm
      where sm.school_id = p_school
        and sm.module_key = p_module),
    exists (
      select 1
      from public.school_subscriptions s
      join public.plan_modules pm on pm.plan_id = s.plan_id
      where s.school_id = p_school
        and s.status in ('trial', 'active')
        and pm.module_key = p_module
    )
  );
$$;

revoke all on function private.school_has_module(uuid, text) from public, anon, authenticated;

-- ===========================================================================
-- notifications
-- ===========================================================================
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  recipient_id  uuid not null,
  type          text not null,
  student_id    uuid,                                   -- the child it is about, if any
  data          jsonb not null default '{}'::jsonb,     -- what the sentence needs
  created_at    timestamptz not null default now(),
  read_at       timestamptz,

  constraint notifications_type_check check (type in ('absence', 'absence_corrected')),
  constraint notifications_data_check check (jsonb_typeof(data) = 'object'),
  constraint notifications_recipient_fkey foreign key (recipient_id, school_id)
    references public.profiles (id, school_id) on delete cascade,
  constraint notifications_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;
create index notifications_school_idx on public.notifications (school_id);
create index notifications_student_idx on public.notifications (student_id);

alter table public.notifications enable row level security;

-- Read: only your own, in your school. Update: only read_at (column grant).
-- No insert / delete grant: notifications are written by the database only.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_select on public.notifications
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and recipient_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and recipient_id = (select auth.uid()))
  with check (school_id = (select private.current_school_id())
              and recipient_id = (select auth.uid()));

-- ===========================================================================
-- absence_notices: internal queue (no grant: closed to every API user).
-- No foreign key to the session: when a session is deleted, its marks go and
-- the correction still needs this snapshot.
-- ===========================================================================
create table public.absence_notices (
  session_id    uuid not null,
  student_id    uuid not null,
  school_id     uuid not null references public.schools (id) on delete cascade,
  session_date  date not null,
  start_time    time not null,
  end_time      time not null,
  subject_name  text not null,
  due_at        timestamptz not null,
  sent_at       timestamptz,

  primary key (session_id, student_id),
  constraint absence_notices_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade
);

create index absence_notices_due_idx on public.absence_notices (due_at) where sent_at is null;
create index absence_notices_school_idx on public.absence_notices (school_id);
create index absence_notices_student_idx on public.absence_notices (student_id);

alter table public.absence_notices enable row level security;
-- (no policy, no grant: only the definer functions below touch it)

-- ===========================================================================
-- Trigger on attendance_marks.
-- ===========================================================================
create function private.attendance_marks_absence_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  became_absent  boolean := tg_op <> 'DELETE' and new.status = 'absent'
                            and (tg_op = 'INSERT' or old.status <> 'absent');
  stopped_absent boolean := tg_op <> 'INSERT' and old.status = 'absent'
                            and (tg_op = 'DELETE' or new.status <> 'absent');
  v_notice public.absence_notices;
begin
  if became_absent then
    insert into public.absence_notices
      (session_id, student_id, school_id, session_date, start_time, end_time, subject_name, due_at)
    select s.id, new.student_id, s.school_id, s.session_date, s.start_time, s.end_time, sub.name,
           now() + interval '10 minutes'
    from public.attendance_sessions s
    join public.subjects sub on sub.id = s.subject_id
    where s.id = new.session_id
      and s.session_date >= private.school_today() - 6
    on conflict (session_id, student_id) do update
      set due_at = excluded.due_at, sent_at = null;
  elsif stopped_absent then
    delete from public.absence_notices n
    where n.session_id = old.session_id and n.student_id = old.student_id
    returning n.* into v_notice;

    -- Already sent, and the student still exists (deleting a student deletes
    -- their marks: no correction then) → tell the same parents what it is now:
    -- 'late' (changed), 'present' (mark removed) or 'cancelled' (the whole
    -- session was deleted: its marks go after it, so it no longer exists).
    if v_notice.sent_at is not null
       and exists (select 1 from public.students st where st.id = old.student_id) then
      insert into public.notifications (school_id, recipient_id, type, student_id, data)
      select distinct on (n.recipient_id) n.school_id, n.recipient_id, 'absence_corrected', n.student_id,
             n.data || jsonb_build_object(
               'now', case
                        when tg_op = 'UPDATE' then new.status
                        when not exists (select 1 from public.attendance_sessions s where s.id = old.session_id) then 'cancelled'
                        else 'present'
                      end,
               'minutes_late', case when tg_op = 'UPDATE' then new.minutes_late end)
      from public.notifications n
      where n.type = 'absence'
        and n.student_id = old.student_id
        and n.data ->> 'session_id' = old.session_id::text;
    end if;
  end if;
  return null;
end;
$$;

create trigger attendance_marks_absence_notice
  after insert or update of status or delete on public.attendance_marks
  for each row execute function private.attendance_marks_absence_notice();

-- ===========================================================================
-- Sending what is due: each parent account of the student (active account,
-- own password set — same as who may read the child), school active and
-- attendance module on. Several runs never send twice (rows locked, skipped).
-- ===========================================================================
create function private.send_absence_notifications(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent integer;
begin
  with due as (
    select n.*
    from public.absence_notices n
    where n.sent_at is null and n.due_at <= p_now
    for update of n skip locked
  ), told as (
    insert into public.notifications (school_id, recipient_id, type, student_id, data, created_at)
    select d.school_id, p.id, 'absence', d.student_id,
           jsonb_build_object(
             'session_id', d.session_id,
             'date', d.session_date,
             'start', to_char(d.start_time, 'HH24:MI'),
             'end', to_char(d.end_time, 'HH24:MI'),
             'subject', d.subject_name),
           p_now
    from due d
    join public.schools sc on sc.id = d.school_id and sc.status = 'active'
    join public.student_guardians sg on sg.student_id = d.student_id and sg.school_id = d.school_id
    join public.guardians g on g.id = sg.guardian_id and g.school_id = d.school_id
    join public.profiles p on p.id = g.profile_id and p.school_id = d.school_id
    join public.roles r on r.id = p.role_id and r.key = 'parent'
    where p.deactivated_at is null
      and p.must_change_password = false
      and private.school_has_module(d.school_id, 'attendance')
  )
  update public.absence_notices n
     set sent_at = p_now
    from due d
   where n.session_id = d.session_id and n.student_id = d.student_id;
  get diagnostics v_sent = row_count;
  return v_sent;
end;
$$;

revoke all on function private.send_absence_notifications(timestamptz) from public, anon, authenticated;

-- For tests and manual runs with the secret key only (tests pass a time 10
-- minutes ahead instead of waiting).
create function public.run_absence_notifications(p_now timestamptz default now())
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.send_absence_notifications(p_now);
$$;

revoke all on function public.run_absence_notifications(timestamptz) from public, anon, authenticated;
grant execute on function public.run_absence_notifications(timestamptz) to service_role;

-- ===========================================================================
-- Every minute (so a parent is told 10 to 11 minutes after the mark).
-- ===========================================================================
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'tasyiir-absence-notifications',
  '* * * * *',
  $$select private.send_absence_notifications()$$
);
