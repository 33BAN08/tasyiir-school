-- Launch prep: anon and authenticated hold nothing on sequences (2026-10-22).
--
-- Audit (DEV = production): the only sequence in public / private is
-- public.audit_logs_id_seq, behind audit_logs.id GENERATED ALWAYS AS IDENTITY.
-- No policy and no grant lets anon or authenticated insert into audit_logs: the
-- app writes it with the secret key (service_role, unchanged), and the only
-- database writer, private.student_remarks_after_delete(), is SECURITY DEFINER
-- (owner postgres). An identity column needs no USAGE on its sequence anyway.
-- The demo form (anon's only INSERT) takes its id from gen_random_uuid().
-- Supabase's default grants had given both roles USAGE, SELECT and UPDATE on it
-- (anon could advance the counter with nextval()).

revoke all on all sequences in schema public from anon, authenticated;

-- Sequences our migrations create later (role postgres) start without them too.
-- The defaults of Supabase's own role (supabase_admin) are not ours to change.
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
