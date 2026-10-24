-- Phase 10 step 5 — the parent chooses which notifications reach the phone.
--
-- Three switches per PARENT ACCOUNT (not per phone: a parent with two phones sets
-- them once), all on by default:
--   absences       = absence, absence_corrected, unjustified_absences, repeated_lateness
--   remarks        = remark
--   announcements  = announcement
-- Pushes only: every notification is still written (list, bell, Realtime); a type
-- switched off is simply not queued in push_outbox.
--
-- * No row = everything on. The parent reads their own row; nobody writes the table
--   directly: save_push_preferences() (parents of an active school) creates or
--   changes it, school and account from the session.
-- * The "Tester" button needs no database change (the app sends straight to the phone).
-- * The demo school's nightly reset deletes its rows.

create table public.push_preferences (
  profile_id     uuid primary key references public.profiles (id) on delete cascade,
  school_id      uuid not null references public.schools (id) on delete cascade,
  absences       boolean not null default true,
  remarks        boolean not null default true,
  announcements  boolean not null default true,
  updated_at     timestamptz not null default now()
);
create index push_preferences_school_id_idx on public.push_preferences (school_id);

alter table public.push_preferences enable row level security;

revoke all on public.push_preferences from anon, authenticated;
grant select on public.push_preferences to authenticated;

create policy push_preferences_select on public.push_preferences
  for select to authenticated
  using (profile_id = (select auth.uid()) and school_id = (select private.current_school_id()));

-- ===========================================================================
-- Save the signed-in parent's switches (creates the row the first time).
-- ===========================================================================
create function public.save_push_preferences(p_absences boolean, p_remarks boolean, p_announcements boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or not exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.key = 'parent' and p.deactivated_at is null
  ) then
    raise exception 'push preferences are for parents' using errcode = '42501', hint = 'push_not_parent';
  end if;
  if p_absences is null or p_remarks is null or p_announcements is null then
    raise exception 'every switch needs a value' using errcode = '22004';
  end if;

  insert into public.push_preferences (profile_id, school_id, absences, remarks, announcements)
  values (auth.uid(), v_school, p_absences, p_remarks, p_announcements)
  on conflict (profile_id) do update
    set school_id = excluded.school_id,
        absences = excluded.absences,
        remarks = excluded.remarks,
        announcements = excluded.announcements,
        updated_at = now();
end;
$$;
revoke all on function public.save_push_preferences(boolean, boolean, boolean) from public, anon;
grant execute on function public.save_push_preferences(boolean, boolean, boolean) to authenticated;

-- ===========================================================================
-- Queue a push only when that parent has a phone AND that kind is switched on.
-- (Same trigger as step 4; only the switch check is new.)
-- ===========================================================================
create or replace function private.push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case
    when new.type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness') then 'absences'
    when new.type = 'remark' then 'remarks'
    when new.type = 'announcement' then 'announcements'
  end;
  v_on boolean;
begin
  if v_kind is null
     or not exists (select 1 from public.push_subscriptions s where s.profile_id = new.recipient_id) then
    return null;
  end if;

  select case v_kind when 'absences' then p.absences when 'remarks' then p.remarks else p.announcements end
    into v_on
  from public.push_preferences p
  where p.profile_id = new.recipient_id;

  if coalesce(v_on, true) then
    insert into public.push_outbox (notification_id, school_id) values (new.id, new.school_id);
  end if;
  return null;
end;
$$;
revoke all on function private.push_enqueue() from public, anon, authenticated;

-- ===========================================================================
-- Demo school: its switches go with the nightly reset (one more line).
-- ===========================================================================
create or replace function private.reset_demo_school(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  select s.id into v_school from public.schools s where s.id = p_school and s.is_demo for update;
  if v_school is null then
    raise exception 'not a demo school' using errcode = '22023', hint = 'demo_not_found';
  end if;

  delete from public.push_outbox          where school_id = v_school;
  delete from public.push_preferences     where school_id = v_school;
  delete from public.push_subscriptions   where school_id = v_school;
  delete from public.absence_notices      where school_id = v_school;
  delete from public.alert_events         where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.announcements        where school_id = v_school;  -- targets cascade
  delete from public.student_remarks      where school_id = v_school;
  delete from public.justifications       where school_id = v_school;
  delete from public.attendance_marks     where school_id = v_school;
  delete from public.attendance_sessions  where school_id = v_school;
  delete from public.lessons              where school_id = v_school;
  delete from public.teacher_subjects     where school_id = v_school;
  delete from public.student_guardians    where school_id = v_school;
  delete from public.guardians            where school_id = v_school;
  delete from public.student_enrollments  where school_id = v_school;
  delete from public.students             where school_id = v_school;
  delete from public.classes              where school_id = v_school;
  delete from public.time_slots           where school_id = v_school;
  delete from public.school_days          where school_id = v_school;
  delete from public.academic_years       where school_id = v_school;
  delete from public.rooms                where school_id = v_school;
  delete from public.subjects             where school_id = v_school;
  delete from public.tracks               where school_id = v_school;
  delete from public.levels               where school_id = v_school;
  delete from public.subscription_reminders where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.audit_logs           where school_id = v_school;

  perform private.demo_fill(v_school);
end;
$$;
revoke all on function private.reset_demo_school(uuid) from public, anon, authenticated;
