-- Phase 10 step 3 — web push subscriptions (no sending yet: that is step 4).
--
-- One row per browser / phone where a PARENT allowed notifications. The browser gives
-- the push address (`endpoint`, a long secret https URL of Google / Apple / Mozilla)
-- and two public encryption keys (`p256dh`, `auth`); nothing else about the phone.
--
-- * A parent reads and deletes only their own rows. Nobody inserts or updates through
--   the table: `save_push_subscription()` does it (school + account from the session),
--   so a phone that changes account is moved to the new account instead of failing
--   on the unique endpoint (whoever holds the endpoint holds that browser).
-- * Only parents of an active school can subscribe (staff pushes are not planned).
-- * The sender (step 4) reads with the secret key, records successes / failures and
--   deletes subscriptions the push service says are gone.
-- * The demo school's nightly reset deletes its subscriptions.

create table public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  school_id        uuid not null references public.schools (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_success_at  timestamptz,
  failures         integer not null default 0,
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint push_subscriptions_keys_check
    check (char_length(p256dh) between 1 and 200 and char_length(auth) between 1 and 100),
  constraint push_subscriptions_user_agent_check check (user_agent is null or char_length(user_agent) <= 300)
);

create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);
create index push_subscriptions_school_id_idx on public.push_subscriptions (school_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select (id, school_id, profile_id, endpoint, user_agent, created_at, last_success_at) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (profile_id = (select auth.uid()) and school_id = (select private.current_school_id()));

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated
  using (profile_id = (select auth.uid()) and school_id = (select private.current_school_id()));

-- ===========================================================================
-- Subscribe this browser for the signed-in parent (replaces any earlier row of
-- the same browser, whoever it belonged to). Returns the row id.
-- ===========================================================================
create function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_id uuid;
begin
  if v_school is null or not exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.key = 'parent' and p.deactivated_at is null
  ) then
    raise exception 'push subscriptions are for parents' using errcode = '42501', hint = 'push_not_parent';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (school_id, profile_id, endpoint, p256dh, auth, user_agent)
  values (v_school, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ===========================================================================
-- Demo school: its subscriptions go with the nightly reset (same body as in
-- launch_demo_school, one line added).
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
