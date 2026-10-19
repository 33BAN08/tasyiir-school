-- Phase 8 step 3 — alert rules (the director's settings for the daily alerts).
--
-- One row per school per alert type, created with the school (and now for
-- every existing school) with the defaults below; the director changes them,
-- nobody adds or deletes rules through the API. The daily job (step 4) reads
-- them; this step only stores them.
--
--   unjustified_absences — a student has an unjustified absence on at least
--     `threshold` DAYS of the same calendar month (Morocco). Default 3 days,
--     parents + surveillance. `window_days` is always null (the month).
--   repeated_lateness — at least `threshold` lates within the last
--     `window_days` days. Default 3 lates in 14 days, parents.
--
-- Recipients (step 4 resolves them, same parent accounts as absence notices):
--   parents     — each parent account of the student
--   surveillance — staff accounts whose role has attendance.manage, other than
--                  the director role (works with custom roles too)
--   director     — accounts with the system director role
--
-- The daily alerts are part of the `alerts` module (Pro / Premium): the rules
-- can be read and changed only while that module is on. The instant "child
-- absent" notification (step 1) does not depend on them.
-- Channels: in-app only for now; email will be a delivery of the notification
-- rows (decision 2026-10-18), so no channel column here.

-- ===========================================================================
-- Permission (alerts module): director.
-- ===========================================================================
insert into public.permissions (key, module_key) values ('alerts.manage', 'alerts');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'alerts.manage'
from public.roles r
where r.key = 'director' and r.is_system;

-- ===========================================================================
-- alert_rules
-- ===========================================================================
create table public.alert_rules (
  school_id    uuid not null references public.schools (id) on delete cascade,
  type         text not null,
  enabled      boolean not null default true,
  threshold    int not null,
  window_days  int,
  recipients   text[] not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null,

  primary key (school_id, type),
  constraint alert_rules_type_check
    check (type in ('unjustified_absences', 'repeated_lateness')),
  constraint alert_rules_threshold_check check (
    (type = 'unjustified_absences' and threshold between 1 and 20 and window_days is null)
    or (type = 'repeated_lateness' and threshold between 2 and 20 and window_days between 7 and 60)),
  constraint alert_rules_recipients_check check (
    cardinality(recipients) between 1 and 3
    and recipients <@ array['parents', 'surveillance', 'director']::text[])
);

alter table public.alert_rules enable row level security;

-- Read + change the settings only; never the school or the type.
revoke all on public.alert_rules from anon, authenticated;
grant select on public.alert_rules to authenticated;
grant update (enabled, threshold, window_days, recipients) on public.alert_rules to authenticated;

create policy alert_rules_select on public.alert_rules
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('alerts'))
         and (select private.has_permission('alerts.manage')));

create policy alert_rules_update on public.alert_rules
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('alerts'))
         and (select private.has_permission('alerts.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('alerts'))
              and (select private.has_permission('alerts.manage')));

-- Who changed it last, and when (recipients kept in a fixed order).
create function private.alert_rules_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.recipients := array(
    select r from unnest(array['parents', 'surveillance', 'director']) with ordinality as o (r, n)
    where r = any (new.recipients) order by n);
  return new;
end;
$$;

create trigger alert_rules_touch
  before update on public.alert_rules
  for each row execute function private.alert_rules_touch();

-- ===========================================================================
-- Defaults: every new school, and every school that exists now.
-- ===========================================================================
create function private.seed_alert_rules(p_school uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.alert_rules (school_id, type, threshold, window_days, recipients)
  values (p_school, 'unjustified_absences', 3, null, array['parents', 'surveillance']),
         (p_school, 'repeated_lateness', 3, 14, array['parents'])
  on conflict (school_id, type) do nothing;
$$;

revoke all on function private.seed_alert_rules(uuid) from public, anon, authenticated;

create function private.schools_seed_alert_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_alert_rules(new.id);
  return new;
end;
$$;

create trigger schools_seed_alert_rules
  after insert on public.schools
  for each row execute function private.schools_seed_alert_rules();

select private.seed_alert_rules(s.id) from public.schools s;
