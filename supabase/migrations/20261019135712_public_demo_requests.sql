-- Public home page: "Demander une démo" form.
--
-- demo_requests is platform data (no school yet: these are prospects), so it has
-- no school_id. Visitors are anonymous: anon may INSERT the form's columns and
-- nothing else (no SELECT, so a visitor never reads anyone's request back —
-- the Server Action inserts without RETURNING). Only the platform owner reads
-- the requests and marks them handled.
--
-- Abuse: the honeypot lives in the Server Action (a filled hidden field is
-- answered "sent" and never inserted). The publishable key is public, so the
-- database enforces the limits itself, whoever calls it:
--   * the same phone at most 3 times in 24 hours,
--   * at most 30 requests from everyone in one hour.
-- Each new request notifies every platform owner (bell + Realtime), as the
-- subscription reminders do: school_id NULL, the request in `data`.

-- ===========================================================================
-- demo_requests
-- ===========================================================================
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  school_name text not null,
  city text not null,
  -- +2126XXXXXXXX / +2127XXXXXXXX, as normalizeMobile() stores parents' phones
  phone text not null,
  email text,
  students text not null,
  message text,
  locale text not null default 'fr',
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by uuid references public.profiles (id) on delete set null,
  constraint demo_requests_full_name_check check (char_length(full_name) between 2 and 100),
  constraint demo_requests_school_name_check check (char_length(school_name) between 2 and 150),
  constraint demo_requests_city_check check (char_length(city) between 2 and 80),
  constraint demo_requests_phone_check check (phone ~ '^\+212[67][0-9]{8}$'),
  constraint demo_requests_email_check
    check (email is null or (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint demo_requests_students_check check (students in ('lt200', '200_500', '500_1000', 'gt1000')),
  constraint demo_requests_message_check check (message is null or char_length(message) <= 1000),
  constraint demo_requests_locale_check check (locale in ('ar', 'fr', 'en'))
);

create index demo_requests_created_at_idx on public.demo_requests (created_at desc);
create index demo_requests_phone_idx on public.demo_requests (phone, created_at desc);

alter table public.demo_requests enable row level security;

revoke all on public.demo_requests from anon, authenticated;
-- Visitors: insert the form's columns only (id, dates, handled_* are the database's).
grant insert (full_name, school_name, city, phone, email, students, message, locale)
  on public.demo_requests to anon;
-- Platform owner: read, and mark handled / not handled.
grant select on public.demo_requests to authenticated;
grant update (handled_at) on public.demo_requests to authenticated;

-- Every check is in the constraints and the trigger below; the policy only opens the door.
create policy demo_requests_insert on public.demo_requests
  for insert to anon
  with check (handled_at is null);

create policy demo_requests_select on public.demo_requests
  for select to authenticated
  using ((select private.is_platform_owner()));

create policy demo_requests_update on public.demo_requests
  for update to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

-- ===========================================================================
-- BEFORE INSERT / UPDATE: tidy the text, enforce the limits, record who handled it.
-- ===========================================================================
create or replace function private.demo_requests_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- only handled_at may change (column grant); handled_by follows it
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

revoke all on function private.demo_requests_before() from public, anon, authenticated;

create trigger demo_requests_before
  before insert or update on public.demo_requests
  for each row execute function private.demo_requests_before();

-- ===========================================================================
-- notifications: a new type for platform owners.
-- ===========================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                  'subscription_expiring', 'demo_request'));
alter table public.notifications drop constraint notifications_platform_check;
alter table public.notifications add constraint notifications_platform_check
  check (school_id is not null
         or (type in ('subscription_expiring', 'demo_request') and student_id is null));

-- AFTER INSERT: tell every platform owner (same recipients as the subscription reminders).
create or replace function private.demo_requests_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (school_id, recipient_id, type, data)
  select null, p.id, 'demo_request',
         jsonb_build_object('request_id', new.id, 'full_name', new.full_name,
                            'school_name', new.school_name, 'city', new.city,
                            'phone', new.phone, 'students', new.students)
  from public.profiles p
  join public.roles ro on ro.id = p.role_id and ro.school_id is null and ro.key = 'platform_owner'
  where p.school_id is null and p.deactivated_at is null;
  return null;
end;
$$;

revoke all on function private.demo_requests_notify() from public, anon, authenticated;

create trigger demo_requests_notify
  after insert on public.demo_requests
  for each row execute function private.demo_requests_notify();
