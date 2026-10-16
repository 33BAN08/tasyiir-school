-- Phase 5 step 3 — parents / guardians and their links to students.
--
-- guardians: a person (father, mother, tuteur) of ONE school, with a mobile
-- phone, an optional email and an optional parent ACCOUNT (profile_id).
-- A guardian may exist without an account (contact only).
-- student_guardians: guardian ↔ student, both in the same school
-- (composite FKs); a student has several guardians, a guardian several
-- children; at most one father and one mother per student.
--
-- Who reads:
--   staff with students.view or parents.manage: the guardians and links of
--     their school (to contact families);
--   a parent: ONLY their own guardian row and their own links — never
--     another parent's phone, never another family's links.
-- Who writes: parents.manage, own school, through RLS with the session.
-- Parent ACCOUNTS (auth user + profile) are created server-side with the
-- secret key; the guardian row is then linked through RLS.
--
-- private.is_linked_to_student() gets its first rule: an ACTIVE parent
-- account (role parent, not deactivated, own password set) of an ACTIVE
-- school, linked to that student in that school. Students, their classes
-- and their photos (Storage policy) all follow it.

-- ===========================================================================
-- guardians
-- ===========================================================================
alter table public.profiles
  add constraint profiles_id_school_key unique (id, school_id);

create table public.guardians (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  last_name   text not null,
  first_name  text not null,
  phone       text not null,                    -- Moroccan mobile, +2126XXXXXXXX / +2127XXXXXXXX
  email       text,                             -- optional, contact only
  profile_id  uuid unique,                      -- the parent account, if any
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint guardians_names_check check (
        last_name  = btrim(last_name)  and char_length(last_name)  between 1 and 60
    and first_name = btrim(first_name) and char_length(first_name) between 1 and 60),
  constraint guardians_phone_check check (phone ~ '^\+212[67][0-9]{8}$'),
  constraint guardians_email_check check (
    email is null or (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)),
  constraint guardians_id_school_key unique (id, school_id),
  -- The account belongs to the same school.
  constraint guardians_profile_fkey foreign key (profile_id, school_id)
    references public.profiles (id, school_id) on delete set null (profile_id)
);
create unique index guardians_phone_key on public.guardians (school_id, phone);
create index guardians_school_name_idx on public.guardians (school_id, last_name, first_name);

create trigger guardians_set_updated_at
  before update on public.guardians
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- student_guardians
-- ===========================================================================
create table public.student_guardians (
  school_id    uuid not null references public.schools (id) on delete cascade,
  student_id   uuid not null,
  guardian_id  uuid not null,
  relation     text not null,
  created_at   timestamptz not null default now(),
  primary key (student_id, guardian_id),
  constraint student_guardians_relation_check check (relation in ('father', 'mother', 'tutor')),
  constraint student_guardians_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint student_guardians_guardian_fkey foreign key (guardian_id, school_id)
    references public.guardians (id, school_id) on delete cascade
);
-- One father and one mother at most; any number of tuteurs.
create unique index student_guardians_parent_key on public.student_guardians (student_id, relation)
  where relation in ('father', 'mother');
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

-- ===========================================================================
-- The guardian rule.
-- ===========================================================================
create or replace function private.is_linked_to_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id and g.school_id = sg.school_id
    join public.profiles p on p.id = g.profile_id and p.school_id = sg.school_id
    join public.roles r on r.id = p.role_id
    join public.schools s on s.id = p.school_id
    where sg.student_id = p_student_id
      and p.id = auth.uid()
      and r.key = 'parent'
      and p.deactivated_at is null
      and p.must_change_password = false
      and s.status = 'active'
  );
$$;

-- ===========================================================================
-- RLS + grants
-- ===========================================================================
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;

revoke all on public.guardians, public.student_guardians from anon, authenticated;
grant select, insert, update, delete on public.guardians to authenticated;
grant select, insert, update, delete on public.student_guardians to authenticated;

-- guardians -----------------------------------------------------------------
create policy guardians_select on public.guardians
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('students.view'))
              or (select private.has_permission('parents.manage'))
              or profile_id = (select auth.uid())));     -- a parent: own row only

create policy guardians_insert on public.guardians
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('parents.manage')));

create policy guardians_update on public.guardians
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('parents.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('parents.manage')));

create policy guardians_delete on public.guardians
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('parents.manage')));

-- student_guardians ----------------------------------------------------------
create policy student_guardians_select on public.student_guardians
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and ((select private.has_permission('students.view'))
              or (select private.has_permission('parents.manage'))
              or exists (select 1 from public.guardians g      -- a parent: own links only
                         where g.id = guardian_id and g.profile_id = (select auth.uid()))));

create policy student_guardians_insert on public.student_guardians
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('parents.manage')));

create policy student_guardians_update on public.student_guardians
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('parents.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('parents.manage')));

create policy student_guardians_delete on public.student_guardians
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('parents.manage')));
