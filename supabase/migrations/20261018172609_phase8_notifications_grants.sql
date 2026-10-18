-- Phase 8 step 1 — fix to phase8_notifications.
--
-- 1. Grants. Supabase gives anon + authenticated ALL privileges on every new
--    public table by default, so "grant update (read_at)" restricted nothing:
--    a recipient could rewrite their notification's data. Start from zero, as
--    phase6_lessons does: read your own, change only read_at; the queue is
--    closed to every API user.
--    The Phase 7 tables kept the same defaults (anon + authenticated: ALL,
--    TRUNCATE included). RLS already filtered every row and the API cannot
--    truncate, but they now get exactly what phase7 meant to grant, like
--    every table of Phases 4–6.
-- 2. A notification's created_at is the real time it was sent (default now()),
--    not the time passed to the sender (tests pass a later time to skip the
--    10 minutes).

revoke all on public.notifications from anon, authenticated;
revoke all on public.absence_notices from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke all on public.attendance_sessions from anon, authenticated;
revoke all on public.attendance_marks from anon, authenticated;
revoke all on public.justifications from anon, authenticated;
grant select, insert, update, delete on public.attendance_sessions to authenticated;
grant select, insert, update, delete on public.attendance_marks to authenticated;
grant select, insert, update, delete on public.justifications to authenticated;

create or replace function private.send_absence_notifications(p_now timestamptz default now())
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
    insert into public.notifications (school_id, recipient_id, type, student_id, data)
    select d.school_id, p.id, 'absence', d.student_id,
           jsonb_build_object(
             'session_id', d.session_id,
             'date', d.session_date,
             'start', to_char(d.start_time, 'HH24:MI'),
             'end', to_char(d.end_time, 'HH24:MI'),
             'subject', d.subject_name)
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
