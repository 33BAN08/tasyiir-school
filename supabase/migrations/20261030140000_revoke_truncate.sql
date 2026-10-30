-- No API role may TRUNCATE a public table.
--
-- Supabase's default privileges in schema public give anon, authenticated and
-- service_role ALL on every new table, TRUNCATE included. Our revoke-first
-- rule already took everything from anon and authenticated; service_role (the
-- server key) still held TRUNCATE on 55 of the 58 public tables (all but the
-- payments tables, 20261030125309), audit_logs, grades, report_cards,
-- attendance and student_charges among them. TRUNCATE fires no row trigger
-- and no RLS: one statement would empty a table for every school.
--
-- Nothing in the app, the tests, the scripts or the cron jobs truncates a
-- public table (test cleanup deletes through the API; record_payment only
-- truncates its own temporary tables). The owner (postgres: migrations, the
-- dashboard) keeps TRUNCATE.
revoke truncate on all tables in schema public from anon, authenticated, service_role;

-- Tables created later by postgres (every migration) start without it too.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated, service_role;
