-- Phase 1 — Multi-tenant foundation
-- Tables + RLS helpers + RLS policies + grants, in ONE migration (one transaction):
-- no table ever exists without RLS.

-- Private schema for helper functions (NOT exposed through the Data API).
create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ===========================================================================
-- PART 1 — TABLES
-- ===========================================================================

-- Schools (tenants)
create table public.schools (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_url    text,
  city        text,
  phone       text,
  address     text,
  settings    jsonb not null default '{}'::jsonb,
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Platform catalog: modules, plans, plan_modules
create table public.modules (
  key         text primary key check (key ~ '^[a-z_]+$'),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique check (key ~ '^[a-z_]+$'),
  name           text not null,
  price_monthly  numeric(10, 2) not null default 0 check (price_monthly >= 0),
  price_yearly   numeric(10, 2) not null default 0 check (price_yearly >= 0),
  max_students   int check (max_students is null or max_students > 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.plan_modules (
  plan_id     uuid not null references public.plans (id) on delete cascade,
  module_key  text not null references public.modules (key) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (plan_id, module_key)
);
create index plan_modules_module_key_idx on public.plan_modules (module_key);

-- Subscriptions & per-school module overrides
create table public.school_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  plan_id        uuid not null references public.plans (id),
  status         text not null default 'trial'
                   check (status in ('trial', 'active', 'suspended', 'expired')),
  start_date     date not null default current_date,
  end_date       date,
  trial_ends_at  timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
-- At most one non-expired subscription per school.
create unique index school_subscriptions_one_current_idx
  on public.school_subscriptions (school_id) where status <> 'expired';
create index school_subscriptions_school_id_idx on public.school_subscriptions (school_id);
create index school_subscriptions_plan_id_idx on public.school_subscriptions (plan_id);

create table public.school_modules (
  school_id   uuid not null references public.schools (id) on delete cascade,
  module_key  text not null references public.modules (key) on delete cascade,
  enabled     boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (school_id, module_key)
);
create index school_modules_module_key_idx on public.school_modules (module_key);

-- Permission catalog (every key the app knows, e.g. 'users.manage').
create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  module_key  text references public.modules (key),  -- null = core, always available
  created_at  timestamptz not null default now()
);

-- school_id null = system TEMPLATE role (copied into each new school) or platform_owner.
-- school_id set  = the school's own role; directors edit these.
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references public.schools (id) on delete cascade,
  key         text not null check (key ~ '^[a-z_]+$'),
  name        text not null,
  is_system   boolean not null default false,  -- built-in: a school cannot delete/rename it
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique nulls not distinct (school_id, key)
);
create index roles_school_id_idx on public.roles (school_id);

create table public.role_permissions (
  role_id         uuid not null references public.roles (id) on delete cascade,
  permission_key  text not null references public.permissions (key) on delete cascade,
  school_id       uuid references public.schools (id) on delete cascade,  -- mirrors role (trigger)
  created_at      timestamptz not null default now(),
  primary key (role_id, permission_key)
);
create index role_permissions_permission_key_idx on public.role_permissions (permission_key);
create index role_permissions_school_id_idx on public.role_permissions (school_id);

-- role_permissions.school_id always mirrors its role's school_id.
create or replace function private.role_permissions_set_school()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select r.school_id into new.school_id from public.roles r where r.id = new.role_id;
  return new;
end;
$$;

create trigger role_permissions_set_school
  before insert or update on public.role_permissions
  for each row execute function private.role_permissions_set_school();

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  school_id             uuid references public.schools (id) on delete cascade,  -- null only for platform_owner
  role_id               uuid not null references public.roles (id),
  full_name             text not null check (length(trim(full_name)) > 0),
  phone                 text,
  avatar_url            text,
  locale                text not null default 'ar' check (locale in ('ar', 'fr', 'en')),
  must_change_password  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index profiles_school_id_idx on public.profiles (school_id);
create index profiles_role_id_idx on public.profiles (role_id);

-- A profile's role must belong to the profile's school
-- (or be the system platform_owner role, with no school).
create or replace function private.profiles_check_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r public.roles%rowtype;
begin
  select * into r from public.roles where id = new.role_id;
  if r.key = 'platform_owner' and r.school_id is null then
    if new.school_id is not null then
      raise exception 'platform_owner profile must not belong to a school';
    end if;
  elsif new.school_id is null or r.school_id is distinct from new.school_id then
    raise exception 'role % does not belong to school %', new.role_id, new.school_id;
  end if;
  return new;
end;
$$;

create trigger profiles_check_role
  before insert or update of role_id, school_id on public.profiles
  for each row execute function private.profiles_check_role();

-- Audit logs (append-only)
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  school_id   uuid references public.schools (id) on delete cascade,  -- null = platform-level action
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_school_created_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);

-- updated_at triggers
create trigger schools_updated_at before update on public.schools
  for each row execute function private.set_updated_at();
create trigger modules_updated_at before update on public.modules
  for each row execute function private.set_updated_at();
create trigger plans_updated_at before update on public.plans
  for each row execute function private.set_updated_at();
create trigger school_subscriptions_updated_at before update on public.school_subscriptions
  for each row execute function private.set_updated_at();
create trigger school_modules_updated_at before update on public.school_modules
  for each row execute function private.set_updated_at();
create trigger roles_updated_at before update on public.roles
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- New school → copy the template roles (and their permissions) into it.
create or replace function private.seed_school_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.roles (school_id, key, name, is_system)
  select new.id, t.key, t.name, true
  from public.roles t
  where t.school_id is null and t.key <> 'platform_owner';

  insert into public.role_permissions (role_id, permission_key)
  select sr.id, tp.permission_key
  from public.roles t
  join public.role_permissions tp on tp.role_id = t.id
  join public.roles sr on sr.school_id = new.id and sr.key = t.key
  where t.school_id is null;

  return new;
end;
$$;

create trigger schools_seed_roles
  after insert on public.schools
  for each row execute function private.seed_school_roles();

-- ===========================================================================
-- PART 2 — RLS HELPER FUNCTIONS
-- SECURITY DEFINER: they read profiles/roles without going through RLS,
-- so policies on those same tables do not loop on themselves.
-- ===========================================================================

-- The logged-in user's school (null for platform_owner or anonymous).
create or replace function private.current_school_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.school_id from public.profiles p where p.id = auth.uid();
$$;

-- True only for the system platform_owner role (school_id null on both sides).
create or replace function private.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.school_id is null
      and r.school_id is null
      and r.key = 'platform_owner'
  );
$$;

-- Does the logged-in school user's role grant this permission?
create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    where p.id = auth.uid()
      and p.school_id is not null
      and rp.permission_key = p_permission
  );
$$;

-- Is this module on for the user's school? Per-school override wins,
-- otherwise it comes from the plan of a trial/active subscription.
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
        and s.status in ('trial', 'active')
        and pm.module_key = p_module
    )
  );
$$;

revoke all on function private.current_school_id() from public, anon;
revoke all on function private.is_platform_owner() from public, anon;
revoke all on function private.has_permission(text) from public, anon;
revoke all on function private.has_module(text) from public, anon;
grant execute on function private.current_school_id() to authenticated;
grant execute on function private.is_platform_owner() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.has_module(text) to authenticated;

-- ===========================================================================
-- PART 3 — ENABLE RLS
-- ===========================================================================
alter table public.schools              enable row level security;
alter table public.modules              enable row level security;
alter table public.plans                enable row level security;
alter table public.plan_modules         enable row level security;
alter table public.school_subscriptions enable row level security;
alter table public.school_modules       enable row level security;
alter table public.permissions          enable row level security;
alter table public.roles                enable row level security;
alter table public.role_permissions     enable row level security;
alter table public.profiles             enable row level security;
alter table public.audit_logs           enable row level security;

-- ===========================================================================
-- PART 4 — GRANTS (table-level privileges; RLS then filters the rows)
-- Start from zero, then grant only what is needed. anon gets nothing.
-- The server's secret key (service_role) bypasses RLS and is used for
-- privileged writes: creating users, changing role_id/school_id, audit logs.
-- ===========================================================================
revoke all on
  public.schools, public.modules, public.plans, public.plan_modules,
  public.school_subscriptions, public.school_modules, public.permissions,
  public.roles, public.role_permissions, public.profiles, public.audit_logs
from anon, authenticated;

grant select on
  public.schools, public.modules, public.plans, public.plan_modules,
  public.school_subscriptions, public.school_modules, public.permissions,
  public.roles, public.role_permissions, public.profiles, public.audit_logs
to authenticated;

-- Platform-owner-managed tables (RLS restricts writes to platform_owner).
grant insert, update, delete on
  public.schools, public.modules, public.plans, public.plan_modules,
  public.school_subscriptions, public.school_modules
to authenticated;

-- Roles: director (roles.manage) or platform_owner, via RLS.
grant insert, update, delete on public.roles to authenticated;
grant insert, delete on public.role_permissions to authenticated;

-- Profiles: users may only edit these 4 columns. role_id, school_id and
-- must_change_password can only be changed server-side with the secret key.
grant update (full_name, phone, avatar_url, locale) on public.profiles to authenticated;

-- audit_logs: SELECT only. Rows are written server-side (secret key).
-- permissions catalog: SELECT only. Changed through migrations.

-- ===========================================================================
-- PART 5 — POLICIES (all for logged-in users only; anon has no policy = no access)
-- ===========================================================================

-- schools -----------------------------------------------------------------
create policy schools_select on public.schools
  for select to authenticated
  using (id = (select private.current_school_id()) or (select private.is_platform_owner()));

create policy schools_insert on public.schools
  for insert to authenticated
  with check ((select private.is_platform_owner()));

create policy schools_update on public.schools
  for update to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

create policy schools_delete on public.schools
  for delete to authenticated
  using ((select private.is_platform_owner()));

-- modules / plans / plan_modules: everyone logged in can read; platform_owner writes
create policy modules_select on public.modules
  for select to authenticated using (true);
create policy modules_write on public.modules
  for all to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

create policy plans_select on public.plans
  for select to authenticated using (true);
create policy plans_write on public.plans
  for all to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

create policy plan_modules_select on public.plan_modules
  for select to authenticated using (true);
create policy plan_modules_write on public.plan_modules
  for all to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

-- school_subscriptions / school_modules: own school reads; platform_owner writes
create policy school_subscriptions_select on public.school_subscriptions
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));
create policy school_subscriptions_write on public.school_subscriptions
  for all to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

create policy school_modules_select on public.school_modules
  for select to authenticated
  using (school_id = (select private.current_school_id()) or (select private.is_platform_owner()));
create policy school_modules_write on public.school_modules
  for all to authenticated
  using ((select private.is_platform_owner()))
  with check ((select private.is_platform_owner()));

-- permissions catalog: read-only
create policy permissions_select on public.permissions
  for select to authenticated using (true);

-- roles -------------------------------------------------------------------
create policy roles_select on public.roles
  for select to authenticated
  using (
    school_id is null
    or school_id = (select private.current_school_id())
    or (select private.is_platform_owner())
  );

create policy roles_insert on public.roles
  for insert to authenticated
  with check (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and not is_system
        and (select private.has_permission('roles.manage')))
  );

create policy roles_update on public.roles
  for update to authenticated
  using (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and not is_system
        and (select private.has_permission('roles.manage')))
  )
  with check (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and not is_system
        and (select private.has_permission('roles.manage')))
  );

create policy roles_delete on public.roles
  for delete to authenticated
  using (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and not is_system
        and (select private.has_permission('roles.manage')))
  );

-- role_permissions --------------------------------------------------------
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (
    school_id is null
    or school_id = (select private.current_school_id())
    or (select private.is_platform_owner())
  );

-- A director can change permissions of their school's roles, EXCEPT the
-- built-in director role itself (so they can never lock themselves out).
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('roles.manage'))
        and exists (select 1 from public.roles r
                    where r.id = role_id and not (r.is_system and r.key = 'director')))
  );

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('roles.manage'))
        and exists (select 1 from public.roles r
                    where r.id = role_id and not (r.is_system and r.key = 'director')))
  );

-- profiles ----------------------------------------------------------------
-- Read: yourself; platform_owner; or people of your school if you have users.view.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('users.view')))
  );

-- Update: only your own row (and the column grant limits WHICH columns).
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- No INSERT / DELETE policy: profiles are created/removed server-side only.

-- audit_logs --------------------------------------------------------------
-- Read: platform_owner (all) or users with audit.view (their school only).
-- No INSERT, UPDATE or DELETE policy at all: append-only, server-side writes.
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (select private.is_platform_owner())
    or (school_id = (select private.current_school_id())
        and (select private.has_permission('audit.view')))
  );
