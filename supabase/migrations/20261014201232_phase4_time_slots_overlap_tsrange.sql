-- Phase 4 step 5 — fix the "function search path mutable" advisor warning.
-- The custom range type private.timerange came with constructor functions
-- (timerange, timemultirange) owned by supabase_admin, so their search_path
-- cannot be set. The no-overlap rule now uses the built-in tsrange on a
-- fixed date instead (same "[)" behaviour: back-to-back slots are fine),
-- and the custom type is dropped with its constructors.
-- No data changes: only the constraint is rebuilt.

alter table public.time_slots drop constraint time_slots_no_overlap;

alter table public.time_slots add constraint time_slots_no_overlap exclude using gist (
  academic_year_id with =,
  day_of_week with =,
  tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time) with &&
);

drop type private.timerange;
