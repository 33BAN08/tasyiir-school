-- Phase 7 step 2 — the school's clock for the app.
--
-- The roll call needs "today", "now" (which lesson is going on) and the time
-- attendance was taken ("Appel fait à 08:12"), all in Morocco. Node on our
-- servers and older phones may still have Morocco at UTC+1 (it is UTC+0 since
-- 2026-09-20); Postgres has current time-zone data. So the app asks the
-- database instead of converting dates itself.
--
-- school_clock(at): the local date, time (HH:MM) and weekday (1 = Monday …
-- 7 = Sunday) in Africa/Casablanca of an instant — now by default, or e.g. a
-- session's taken_at. No table is read: SECURITY INVOKER, any signed-in user.
create function public.school_clock(p_at timestamptz default now())
returns table (local_date date, local_time text, weekday smallint)
language sql
stable
security invoker
set search_path = ''
as $$
  select (p_at at time zone 'Africa/Casablanca')::date,
         to_char(p_at at time zone 'Africa/Casablanca', 'HH24:MI'),
         extract(isodow from (p_at at time zone 'Africa/Casablanca'))::smallint;
$$;

revoke all on function public.school_clock(timestamptz) from public, anon;
grant execute on function public.school_clock(timestamptz) to authenticated;
