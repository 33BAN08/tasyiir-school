-- Phase 10 step 4 — sending web pushes.
--
-- The database already writes every notification (absences 10 minutes after the roll
-- call, corrections, daily alerts, remarks, announcements). A push is one more way to
-- deliver a PARENT's notification, so nothing that creates notifications changes:
--
--   notifications (insert, parent with a subscribed phone)
--     → push_outbox (one row per notification to push)
--     → private.push_kick(): an HTTP POST (pg_net, after commit) to the app's
--       /api/push/deliver, with a shared secret
--     → the app claims the rows (push_claim), writes the text in the parent's
--       language, sends with VAPID (web-push) and reports back (push_done).
--
-- The address and the secret live in Supabase Vault (`push_deliver_url`,
-- `push_deliver_secret`), set by hand per project: production only. Without them
-- nothing is sent (DEV: the tests call the route themselves). A failed kick never
-- blocks the notification; a job every minute kicks again while rows are waiting
-- (claimed rows come back after 5 minutes, at most 5 tries, rows older than a day go).

create extension if not exists pg_net with schema extensions;

-- ===========================================================================
-- The queue (internal: no grant, no policy — like absence_notices)
-- ===========================================================================
create table public.push_outbox (
  id               bigint generated always as identity primary key,
  notification_id  uuid not null unique references public.notifications (id) on delete cascade,
  school_id        uuid references public.schools (id) on delete cascade,
  created_at       timestamptz not null default now(),
  claimed_at       timestamptz,
  attempts         integer not null default 0
);
create index push_outbox_waiting_idx on public.push_outbox (claimed_at, id);
create index push_outbox_school_id_idx on public.push_outbox (school_id);

alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- ===========================================================================
-- Which notifications become a push: a parent's absences (+ corrections and the daily
-- alerts about them), remarks and announcements — only when that parent has a phone.
-- ===========================================================================
create or replace function private.push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness', 'remark', 'announcement')
     and exists (select 1 from public.push_subscriptions s where s.profile_id = new.recipient_id) then
    insert into public.push_outbox (notification_id, school_id) values (new.id, new.school_id);
  end if;
  return null;
end;
$$;
revoke all on function private.push_enqueue() from public, anon, authenticated;

create trigger notifications_push_enqueue
  after insert on public.notifications
  for each row execute function private.push_enqueue();

-- ===========================================================================
-- Wake the app up. Never raises: a missing secret or a network error must not undo
-- the notification that caused it (the minute job tries again).
-- ===========================================================================
create or replace function private.push_kick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_deliver_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 10000
  );
exception when others then
  return;
end;
$$;
revoke all on function private.push_kick() from public, anon, authenticated;

create or replace function private.push_outbox_kick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.push_kick();
  return null;
end;
$$;
revoke all on function private.push_outbox_kick() from public, anon, authenticated;

-- Once per statement: an announcement to 300 parents = one call.
create trigger push_outbox_kick
  after insert on public.push_outbox
  for each statement execute function private.push_outbox_kick();

-- Every minute: drop rows older than a day, kick again while some are waiting.
create or replace function private.push_retry()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_outbox where created_at < now() - interval '1 day' or attempts >= 5;
  if exists (
    select 1 from public.push_outbox
    where claimed_at is null or claimed_at < now() - interval '5 minutes'
  ) then
    perform private.push_kick();
  end if;
end;
$$;
revoke all on function private.push_retry() from public, anon, authenticated;

select cron.schedule('tasyir-push-retry', '* * * * *', $$select private.push_retry()$$);

-- ===========================================================================
-- For the app (secret key only): take up to p_limit waiting rows, with what the
-- sentence needs and the parent's phones.
-- ===========================================================================
create function public.push_claim(p_limit integer default 100)
returns table (
  outbox_id bigint,
  notification_id uuid,
  type text,
  data jsonb,
  student_id uuid,
  student jsonb,
  locale text,
  subscriptions jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select o.id
    from public.push_outbox o
    where (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes') and o.attempts < 5
    order by o.id
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  ),
  claimed as (
    update public.push_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id, o.notification_id
  )
  select c.id, n.id, n.type, n.data, n.student_id,
         case when st.id is null then null else jsonb_build_object(
           'firstName', st.first_name, 'lastName', st.last_name,
           'firstNameAr', st.first_name_ar, 'lastNameAr', st.last_name_ar) end,
         coalesce(p.locale, 'ar'),
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                   from public.push_subscriptions s where s.profile_id = n.recipient_id), '[]'::jsonb)
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.profiles p on p.id = n.recipient_id
  left join public.students st on st.id = n.student_id;
end;
$$;
revoke all on function public.push_claim(integer) from public, anon, authenticated;
grant execute on function public.push_claim(integer) to service_role;

-- What happened: the rows are done; phones that took it are fine again, phones the push
-- service says are gone (404 / 410) are removed, others count a failure (10 = removed).
create function public.push_done(
  p_outbox bigint[], p_ok text[] default '{}', p_gone text[] default '{}', p_failed text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_outbox where id = any (p_outbox);
  update public.push_subscriptions set last_success_at = now(), failures = 0 where endpoint = any (p_ok);
  delete from public.push_subscriptions where endpoint = any (p_gone);
  update public.push_subscriptions set failures = failures + 1 where endpoint = any (p_failed);
  delete from public.push_subscriptions where failures >= 10;
end;
$$;
revoke all on function public.push_done(bigint[], text[], text[], text[]) from public, anon, authenticated;
grant execute on function public.push_done(bigint[], text[], text[], text[]) to service_role;

-- ===========================================================================
-- Demo school: the queue goes with the nightly reset (one more line).
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
