-- Phase 8 step 3 — fix to phase8_alert_rules (found by phase8-alert-rules.mjs).
--
-- 1. A lateness rule without a window passed the CHECK: `null between 7 and
--    60` is NULL, and a CHECK only refuses FALSE. Say `is not null`.
-- 2. The trigger dropped unknown recipients before the CHECK saw them, so
--    ['parents', 'teachers'] was saved as ['parents'] instead of refused. It
--    now only removes duplicates and orders the known ones first; anything
--    unknown stays, and the CHECK refuses it.

alter table public.alert_rules drop constraint alert_rules_threshold_check;
alter table public.alert_rules add constraint alert_rules_threshold_check check (
  (type = 'unjustified_absences' and threshold between 1 and 20 and window_days is null)
  or (type = 'repeated_lateness' and threshold between 2 and 20
      and window_days is not null and window_days between 7 and 60));

create or replace function private.alert_rules_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.recipients := array(
    select r from (select distinct unnest(new.recipients) as r) d
    order by array_position(array['parents', 'surveillance', 'director'], r) nulls last, r);
  return new;
end;
$$;
