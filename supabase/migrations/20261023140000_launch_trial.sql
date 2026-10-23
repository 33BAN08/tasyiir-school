-- Launch prep step 2b — 14-day trial ("Créer un essai").
--
-- Decisions (user, 2026-10-23):
--   * A visitor ASKS for a trial on the home page; the platform owner approves it in
--     the inbox (one click creates the school + director account). No school is ever
--     created by an anonymous visitor.
--   * Trial = plan "pro" (École moyenne), status 'trial', 14 days, at most 50 students
--     (school_subscriptions.max_students_override, set by the approve action).
--   * When the trial ends the school is BLOCKED, its data kept: the subscription becomes
--     'expired' and the school 'suspended' with suspension_reason 'trial_ended'
--     (the existing suspension already closes every tenant table through RLS).
--     The platform owner reopens it by setting a paid subscription + "Réactiver".
--
-- 1. demo_requests also holds trial requests (same form, same limits, same inbox).
-- 2. schools.suspension_reason + public.my_school_suspension() for the blocked page.
-- 3. has_module / school_has_module: a trial past its end no longer counts.
-- 4. Expiry job tasyir-trial-expiry (hourly) → private.expire_trials().

-- ===========================================================================
-- 1. Trial requests
-- ===========================================================================
alter table public.demo_requests
  add column kind text not null default 'demo',
  -- the trial school made from this request (platform owner's approve action)
  add column school_id uuid references public.schools (id) on delete set null,
  add constraint demo_requests_kind_check check (kind in ('demo', 'trial')),
  -- a trial needs the e-mail the director will sign in with
  add constraint demo_requests_trial_email_check check (kind = 'demo' or email is not null),
  add constraint demo_requests_school_check check (school_id is null or kind = 'trial');

create index demo_requests_school_id_idx on public.demo_requests (school_id);

-- Visitors may now also send the kind (the policy and limits are unchanged).
grant insert (kind) on public.demo_requests to anon;

-- Same trigger body, school_id never comes from a visitor.
create or replace function private.demo_requests_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- only handled_at may change through the API (column grant); handled_by follows it
    new.handled_by := case when new.handled_at is null then null else auth.uid() end;
    return new;
  end if;

  new.full_name := btrim(regexp_replace(new.full_name, '[[:space:]]+', ' ', 'g'));
  new.school_name := btrim(regexp_replace(new.school_name, '[[:space:]]+', ' ', 'g'));
  new.city := btrim(regexp_replace(new.city, '[[:space:]]+', ' ', 'g'));
  new.email := nullif(lower(btrim(new.email)), '');
  new.message := nullif(btrim(new.message), '');
  new.created_at := now();
  new.handled_at := null;
  new.handled_by := null;
  new.school_id := null;

  -- One request at a time, so two at once cannot both slip under a limit.
  perform pg_advisory_xact_lock(hashtext('public.demo_requests'));

  if (select count(*) from public.demo_requests
      where phone = new.phone and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'demo_rate_limited' using errcode = 'P0001', hint = 'phone';
  end if;
  if (select count(*) from public.demo_requests
      where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'demo_rate_limited' using errcode = 'P0001', hint = 'global';
  end if;

  return new;
end;
$$;

-- The platform owner's notification says which kind it is.
create or replace function private.demo_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, recipient_id, type, data)
  select null, p.id, 'demo_request',
         jsonb_build_object('request_id', new.id, 'kind', new.kind, 'full_name', new.full_name,
                            'school_name', new.school_name, 'city', new.city,
                            'phone', new.phone, 'students', new.students)
  from public.profiles p
  join public.roles ro on ro.id = p.role_id and ro.school_id is null and ro.key = 'platform_owner'
  where p.school_id is null and p.deactivated_at is null;
  return null;
end;
$$;

-- ===========================================================================
-- 2. Why a school is suspended
-- ===========================================================================
alter table public.schools
  add column suspension_reason text,
  add constraint schools_suspension_reason_check
    check (suspension_reason is null or (suspension_reason = 'trial_ended' and status = 'suspended'));

-- The blocked page of a suspended school's user (RLS hides the school from them).
create function public.my_school_suspension()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.suspension_reason
  from public.profiles p
  join public.schools s on s.id = p.school_id
  where p.id = auth.uid() and s.status = 'suspended';
$$;

revoke all on function public.my_school_suspension() from public, anon;
grant execute on function public.my_school_suspension() to authenticated;

-- ===========================================================================
-- 3. A trial past its end gives no module (until the job below blocks the school).
-- ===========================================================================
create or replace function private.has_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select sm.enabled
       from public.school_modules sm
      where sm.school_id = private.current_school_id()
        and sm.module_key = p_module),
    exists (
      select 1
      from public.school_subscriptions s
      join public.plan_modules pm on pm.plan_id = s.plan_id
      where s.school_id = private.current_school_id()
        and (s.status = 'active'
             or (s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now())))
        and pm.module_key = p_module
    )
  );
$$;

create or replace function private.school_has_module(p_school uuid, p_module text)
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
        and (s.status = 'active'
             or (s.status = 'trial' and (s.trial_ends_at is null or s.trial_ends_at > now())))
        and pm.module_key = p_module
    )
  );
$$;

-- ===========================================================================
-- 4. Trial expiry: subscription → expired, school → suspended ('trial_ended').
--    A trial with no end date never expires (a hand-made pilot). Demo schools never.
-- ===========================================================================
-- p_schools: only these schools (tests); null = every school (the job).
create function private.expire_trials(p_now timestamptz default now(), p_schools uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select sub.id as subscription_id, sub.school_id
    from public.school_subscriptions sub
    join public.schools sc on sc.id = sub.school_id
    where sub.status = 'trial'
      and sub.trial_ends_at is not null
      and sub.trial_ends_at <= p_now
      and not sc.is_demo
      and (p_schools is null or sub.school_id = any (p_schools))
    for update of sub skip locked
  loop
    update public.school_subscriptions set status = 'expired' where id = r.subscription_id;

    update public.schools
    set status = 'suspended', suspended_at = p_now, suspension_reason = 'trial_ended'
    where id = r.school_id and status = 'active';

    insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
    values (r.school_id, null, 'school.trial_expired', 'school', r.school_id::text,
            jsonb_build_object('subscription_id', r.subscription_id));

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_trials(timestamptz, uuid[]) from public, anon, authenticated;

-- Tests (secret key only): the expiry "as of" a given time, for the GIVEN schools only
-- (a future time must never block a real school's trial).
create function public.run_trial_expiry(p_now timestamptz, p_schools uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.expire_trials(p_now, coalesce(p_schools, '{}'::uuid[]));
$$;

revoke all on function public.run_trial_expiry(timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.run_trial_expiry(timestamptz, uuid[]) to service_role;

select cron.schedule(
  'tasyir-trial-expiry',
  '5 * * * *',
  $$select private.expire_trials()$$
);
