-- Phase 3 step 1 — the role key 'platform_owner' is reserved.
-- Found by the RLS tests: a director (roles.manage) could create — or rename
-- a custom role to — key 'platform_owner' inside their school. The app routes
-- users by role key, so such a user would reach the /platform pages.
-- Only the single system role (school_id null) may use this key.
-- Covers INSERT and UPDATE, for everyone (secret key included).

alter table public.roles
  add constraint roles_platform_owner_reserved
  check (key <> 'platform_owner' or school_id is null);
