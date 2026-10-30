-- Phase 13 step 1 — fee setup in the DB (no charges, no payments, no screen).
--
-- Everything here is PER ACADEMIC YEAR: changing a price for next year never
-- touches this year. Amounts are integer CENTIMES (bigint, never numeric).
--
-- fee_years = the year's fee settings: billing months (first day of each
--   month, inside the year, sorted, no duplicates) and the due day of each
--   month (1–28). NO ROW = the defaults: September → June (the part that falls
--   inside the year), due on the 5th — public.fee_year_rules(year) returns the
--   effective values (one source of truth for app and SQL).
-- fee_plans = per year + level: registration (charged once) and the monthly
--   tuition (charged for each billing month). A level without a row has no fee.
-- fee_services = optional monthly services of the year (transport, cantine…),
--   one price per service. `active = false` hides it from new subscriptions.
-- student_services = a student uses a service from one billing month to
--   another (to_month NULL = until the year's last month). The student must be
--   enrolled that year; periods of the same student + service never overlap.
-- student_discounts = per year + student: kind sibling | scholarship | fixed,
--   EITHER a percent (basis points: 1000 = 10 %) OR a fixed amount taken off
--   EACH charge it applies to (registration | tuition | services | all).
--   kind fixed = always an amount. One row per student + year + kind.
--   Step 3 applies them: percents first (rounded to the whole dirham), then
--   fixed amounts, never below 0.
--
-- Permissions (module fees, Premium): fees.view + fees.manage (director,
-- accountant), fees.cancel (director only: discounts here, cancel a receipt or
-- a charge in steps 3–4). Reads: fees.view. Writes: fees.manage, except
-- student_discounts: fees.cancel (money given away = director's call), and
-- every discount insert / update / delete goes to audit_logs. Parents read
-- nothing here: they get their children's balance through guardian-checked
-- RPCs (step 8).

-- ===========================================================================
-- Permissions
-- ===========================================================================
insert into public.permissions (key, module_key) values
  ('fees.view', 'fees'),
  ('fees.manage', 'fees'),
  ('fees.cancel', 'fees');

-- System roles = the templates (school_id NULL) and every school's copy.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('fees.view'), ('fees.manage'), ('fees.cancel')) p (key)
where r.key = 'director' and r.is_system;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
cross join (values ('fees.view'), ('fees.manage')) p (key)
where r.key = 'accountant' and r.is_system;

-- ===========================================================================
-- fee_years
-- ===========================================================================
create table public.fee_years (
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  billing_months    date[] not null,
  due_day           smallint not null default 5,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint fee_years_pkey primary key (academic_year_id),
  constraint fee_years_due_day_check check (due_day between 1 and 28),
  constraint fee_years_months_count_check
    check (cardinality(billing_months) between 1 and 12),
  constraint fee_years_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint fee_years_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index fee_years_school_idx on public.fee_years (school_id);
create index fee_years_updated_by_idx on public.fee_years (updated_by);

alter table public.fee_years enable row level security;
revoke all on public.fee_years from anon, authenticated;

-- ===========================================================================
-- fee_plans
-- ===========================================================================
create table public.fee_plans (
  id                     uuid primary key default gen_random_uuid(),
  school_id              uuid not null references public.schools (id) on delete cascade,
  academic_year_id       uuid not null,
  level_id               uuid not null,
  registration_centimes  bigint not null default 0,
  monthly_centimes       bigint not null default 0,
  updated_at             timestamptz not null default now(),
  updated_by             uuid,

  -- 0 – 100 000 DH: a typo guard, not a business rule.
  constraint fee_plans_registration_check
    check (registration_centimes between 0 and 10000000),
  constraint fee_plans_monthly_check check (monthly_centimes between 0 and 10000000),
  constraint fee_plans_level_key unique (academic_year_id, level_id),
  constraint fee_plans_id_school_key unique (id, school_id),
  constraint fee_plans_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint fee_plans_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete cascade,
  constraint fee_plans_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index fee_plans_school_idx on public.fee_plans (school_id);
create index fee_plans_level_idx on public.fee_plans (level_id, school_id);
create index fee_plans_updated_by_idx on public.fee_plans (updated_by);

alter table public.fee_plans enable row level security;
revoke all on public.fee_plans from anon, authenticated;

-- ===========================================================================
-- fee_services
-- ===========================================================================
create table public.fee_services (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  name              text not null,
  name_ar           text,
  monthly_centimes  bigint not null,
  active            boolean not null default true,
  position          smallint not null default 0,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint fee_services_name_check check (length(btrim(name)) between 1 and 80),
  constraint fee_services_name_ar_check
    check (name_ar is null or length(btrim(name_ar)) between 1 and 80),
  constraint fee_services_monthly_check check (monthly_centimes between 0 and 10000000),
  constraint fee_services_position_check check (position between 0 and 100),
  constraint fee_services_name_key unique (academic_year_id, name),
  constraint fee_services_id_year_school_key unique (id, academic_year_id, school_id),
  constraint fee_services_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint fee_services_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index fee_services_school_idx on public.fee_services (school_id);
create index fee_services_updated_by_idx on public.fee_services (updated_by);

alter table public.fee_services enable row level security;
revoke all on public.fee_services from anon, authenticated;

-- ===========================================================================
-- student_services
-- ===========================================================================
create table public.student_services (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  student_id        uuid not null,
  service_id        uuid not null,
  from_month        date not null,
  to_month          date,                    -- NULL = until the year's last billing month
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint student_services_from_check check (extract(day from from_month) = 1),
  constraint student_services_to_check
    check (to_month is null or (extract(day from to_month) = 1 and to_month >= from_month)),
  constraint student_services_no_overlap exclude using gist
    (student_id with =, service_id with =,
     daterange(from_month, to_month, '[]') with &&),
  constraint student_services_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint student_services_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  -- Same year as the service.
  constraint student_services_service_fkey foreign key (service_id, academic_year_id, school_id)
    references public.fee_services (id, academic_year_id, school_id) on delete cascade,
  constraint student_services_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index student_services_school_idx on public.student_services (school_id);
create index student_services_year_student_idx on public.student_services (academic_year_id, student_id);
create index student_services_student_idx on public.student_services (student_id, school_id);
create index student_services_service_idx
  on public.student_services (service_id, academic_year_id, school_id);
create index student_services_updated_by_idx on public.student_services (updated_by);

alter table public.student_services enable row level security;
revoke all on public.student_services from anon, authenticated;

-- ===========================================================================
-- student_discounts
-- ===========================================================================
create table public.student_discounts (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  student_id        uuid not null,
  kind              text not null,
  percent_bp        integer,                 -- 1000 = 10 %
  amount_centimes   bigint,                  -- taken off each charge it applies to
  applies_to        text not null default 'tuition',
  reason            text,
  created_at        timestamptz not null default now(),
  created_by        uuid,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint student_discounts_kind_check
    check (kind in ('sibling', 'scholarship', 'fixed')),
  constraint student_discounts_applies_to_check
    check (applies_to in ('registration', 'tuition', 'services', 'all')),
  constraint student_discounts_value_check
    check (num_nonnulls(percent_bp, amount_centimes) = 1),
  constraint student_discounts_percent_check
    check (percent_bp is null or percent_bp between 1 and 10000),
  constraint student_discounts_amount_check
    check (amount_centimes is null or amount_centimes between 1 and 10000000),
  constraint student_discounts_fixed_check
    check (kind <> 'fixed' or amount_centimes is not null),
  constraint student_discounts_reason_check
    check (reason is null or length(reason) <= 200),
  constraint student_discounts_kind_key unique (academic_year_id, student_id, kind),
  constraint student_discounts_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint student_discounts_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint student_discounts_created_by_fkey foreign key (created_by)
    references public.profiles (id) on delete set null,
  constraint student_discounts_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index student_discounts_school_idx on public.student_discounts (school_id);
create index student_discounts_student_idx on public.student_discounts (student_id, school_id);
create index student_discounts_created_by_idx on public.student_discounts (created_by);
create index student_discounts_updated_by_idx on public.student_discounts (updated_by);

alter table public.student_discounts enable row level security;
revoke all on public.student_discounts from anon, authenticated;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Who changed it last (every table above); created_* kept from the insert.
create function private.fees_set_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger fee_years_set_updated
  before insert or update on public.fee_years
  for each row execute function private.fees_set_updated();
create trigger fee_plans_set_updated
  before insert or update on public.fee_plans
  for each row execute function private.fees_set_updated();
create trigger fee_services_set_updated
  before insert or update on public.fee_services
  for each row execute function private.fees_set_updated();
create trigger student_services_set_updated
  before insert or update on public.student_services
  for each row execute function private.fees_set_updated();

create function private.student_discounts_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  if not exists (select 1 from public.student_enrollments e
                  where e.student_id = new.student_id
                    and e.academic_year_id = new.academic_year_id
                    and e.school_id = new.school_id) then
    raise exception 'fees_student_not_enrolled' using errcode = '23514';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger student_discounts_before_write
  before insert or update on public.student_discounts
  for each row execute function private.student_discounts_before_write();

-- Every discount change is logged with its values (before / after). Not when
-- the school, the student or the year itself is being deleted: by then it no
-- longer exists (and a log row for a deleted school would break its delete).
create function private.student_discounts_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.student_discounts;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  if tg_op = 'DELETE'
     and (not exists (select 1 from public.schools s where s.id = old.school_id)
          or not exists (select 1 from public.students s where s.id = old.student_id)
          or not exists (select 1 from public.academic_years y where y.id = old.academic_year_id)) then
    return null;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at' - 'updated_by')
                          = (to_jsonb(old) - 'updated_at' - 'updated_by') then
    return null;
  end if;

  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
  values (v_row.school_id, auth.uid(),
          'fee_discount.' || lower(tg_op),
          'student_discount', v_row.id::text,
          jsonb_build_object(
            'student_id', v_row.student_id,
            'academic_year_id', v_row.academic_year_id,
            'kind', v_row.kind,
            'old', case when tg_op <> 'INSERT'
                        then jsonb_build_object('percent_bp', old.percent_bp,
                               'amount_centimes', old.amount_centimes,
                               'applies_to', old.applies_to, 'reason', old.reason) end,
            'new', case when tg_op <> 'DELETE'
                        then jsonb_build_object('percent_bp', new.percent_bp,
                               'amount_centimes', new.amount_centimes,
                               'applies_to', new.applies_to, 'reason', new.reason) end));
  return null;
end;
$$;

create trigger student_discounts_audit
  after insert or update or delete on public.student_discounts
  for each row execute function private.student_discounts_audit();

-- Billing months: first of the month, inside the year, sorted, no duplicates
-- (stored sorted, so the app may send them in any order).
create function private.fee_years_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end   date;
begin
  select y.start_date, y.end_date into v_start, v_end
  from public.academic_years y
  where y.id = new.academic_year_id and y.school_id = new.school_id;

  if array_position(new.billing_months, null) is not null
     or exists (select 1 from unnest(new.billing_months) m
                 where extract(day from m) <> 1
                    or m < date_trunc('month', v_start)::date
                    or m > v_end)
     or (select count(distinct m) from unnest(new.billing_months) m)
        <> cardinality(new.billing_months) then
    raise exception 'fees_billing_months_invalid' using errcode = '23514';
  end if;

  new.billing_months := array(select m from unnest(new.billing_months) m order by m);
  return new;
end;
$$;

create trigger fee_years_before_write
  before insert or update on public.fee_years
  for each row execute function private.fee_years_before_write();

-- A service period: the student is enrolled that year and both months are
-- inside the year.
create function private.student_services_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end   date;
begin
  select y.start_date, y.end_date into v_start, v_end
  from public.academic_years y
  where y.id = new.academic_year_id and y.school_id = new.school_id;

  if new.from_month < date_trunc('month', v_start)::date or new.from_month > v_end
     or new.to_month > v_end then
    raise exception 'fees_month_outside_year' using errcode = '23514';
  end if;
  if not exists (select 1 from public.student_enrollments e
                  where e.student_id = new.student_id
                    and e.academic_year_id = new.academic_year_id
                    and e.school_id = new.school_id) then
    raise exception 'fees_student_not_enrolled' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Runs before student_services_set_updated (same-timing triggers fire in name order).
create trigger student_services_before_write
  before insert or update on public.student_services
  for each row execute function private.student_services_before_write();

-- ===========================================================================
-- Effective settings for a year (defaults when no row): September → June
-- clipped to the year, due on the 5th.
-- ===========================================================================
create function public.fee_year_rules(p_year uuid)
returns table (billing_months date[], due_day smallint, customised boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(f.billing_months,
                  array(select m::date
                        from generate_series(
                               -- A year starting July–December: that September;
                               -- January–June: the previous one.
                               make_date(extract(year from y.start_date)::int
                                         - (extract(month from y.start_date) <= 6)::int, 9, 1),
                               make_date(extract(year from y.start_date)::int
                                         - (extract(month from y.start_date) <= 6)::int + 1, 6, 1),
                               interval '1 month') m
                        where m >= date_trunc('month', y.start_date) and m <= y.end_date
                        order by m)),
         coalesce(f.due_day, 5)::smallint,
         f.academic_year_id is not null
  from public.academic_years y
  left join public.fee_years f on f.academic_year_id = y.id
  where y.id = p_year
    and y.school_id = (select private.current_school_id())
    and (select private.has_module('fees'))
    and (select private.has_permission('fees.view'));
$$;

revoke all on function public.fee_year_rules(uuid) from public, anon;
grant execute on function public.fee_year_rules(uuid) to authenticated;

-- ===========================================================================
-- Grants + RLS — staff only (fees.view to read, fees.manage to write;
-- student_discounts: fees.cancel to write).
-- ===========================================================================
grant select, delete on public.fee_years to authenticated;
grant insert (school_id, academic_year_id, billing_months, due_day)
  on public.fee_years to authenticated;
grant update (billing_months, due_day) on public.fee_years to authenticated;

grant select, delete on public.fee_plans to authenticated;
grant insert (school_id, academic_year_id, level_id, registration_centimes, monthly_centimes)
  on public.fee_plans to authenticated;
grant update (registration_centimes, monthly_centimes) on public.fee_plans to authenticated;

grant select, delete on public.fee_services to authenticated;
grant insert (school_id, academic_year_id, name, name_ar, monthly_centimes, active, position)
  on public.fee_services to authenticated;
grant update (name, name_ar, monthly_centimes, active, position)
  on public.fee_services to authenticated;

grant select, delete on public.student_services to authenticated;
grant insert (school_id, academic_year_id, student_id, service_id, from_month, to_month)
  on public.student_services to authenticated;
grant update (from_month, to_month) on public.student_services to authenticated;

grant select, delete on public.student_discounts to authenticated;
grant insert (school_id, academic_year_id, student_id, kind, percent_bp,
              amount_centimes, applies_to, reason)
  on public.student_discounts to authenticated;
grant update (percent_bp, amount_centimes, applies_to, reason)
  on public.student_discounts to authenticated;

-- Same four policies on each table; writes need fees.manage, discounts fees.cancel.
do $$
declare
  t text;
  w text;
begin
  foreach t in array array['fee_years', 'fee_plans', 'fee_services',
                           'student_services', 'student_discounts'] loop
    w := case t when 'student_discounts' then 'fees.cancel' else 'fees.manage' end;
    execute format($p$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using (school_id = (select private.current_school_id())
               and (select private.has_module('fees'))
               and (select private.has_permission('fees.view')))$p$, t);
    execute format($p$
      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (school_id = (select private.current_school_id())
                    and (select private.has_module('fees'))
                    and (select private.has_permission(%2$L)))$p$, t, w);
    execute format($p$
      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (school_id = (select private.current_school_id())
               and (select private.has_module('fees'))
               and (select private.has_permission(%2$L)))
        with check (school_id = (select private.current_school_id())
                    and (select private.has_module('fees'))
                    and (select private.has_permission(%2$L)))$p$, t, w);
    execute format($p$
      create policy %1$s_delete on public.%1$I
        for delete to authenticated
        using (school_id = (select private.current_school_id())
               and (select private.has_module('fees'))
               and (select private.has_permission(%2$L)))$p$, t, w);
  end loop;
end;
$$;

-- ===========================================================================
-- Demo school: the five tables go with the nightly reset (current body copied
-- from the database; demo fee content comes in step 10).
-- ===========================================================================
create or replace function private.reset_demo_school(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  select s.id into v_school from public.schools s where s.id = p_school and s.is_demo for update;
  if v_school is null then
    raise exception 'not a demo school' using errcode = '22023', hint = 'demo_not_found';
  end if;

  delete from public.push_outbox          where school_id = v_school;
  delete from public.push_preferences     where school_id = v_school;
  delete from public.push_subscriptions   where school_id = v_school;
  delete from public.absence_notices      where school_id = v_school;
  delete from public.alert_events         where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.announcements        where school_id = v_school;  -- targets cascade
  delete from public.student_remarks      where school_id = v_school;
  delete from public.justifications       where school_id = v_school;
  delete from public.attendance_marks     where school_id = v_school;
  delete from public.attendance_sessions  where school_id = v_school;
  delete from public.council_remarks      where school_id = v_school;
  delete from public.report_cards         where school_id = v_school;
  delete from public.grade_publications   where school_id = v_school;
  update public.grading_periods set locked_at = null
   where school_id = v_school and locked_at is not null;
  delete from public.grades               where school_id = v_school;
  delete from public.student_discounts    where school_id = v_school;
  delete from public.student_services     where school_id = v_school;
  delete from public.fee_services         where school_id = v_school;
  delete from public.fee_plans            where school_id = v_school;
  delete from public.fee_years            where school_id = v_school;
  delete from public.lessons              where school_id = v_school;
  delete from public.teacher_subjects     where school_id = v_school;
  delete from public.student_guardians    where school_id = v_school;
  delete from public.guardians            where school_id = v_school;
  delete from public.student_enrollments  where school_id = v_school;
  delete from public.students             where school_id = v_school;
  delete from public.classes              where school_id = v_school;
  delete from public.subject_coefficients where school_id = v_school;
  delete from public.grade_level_settings where school_id = v_school;
  delete from public.grading_periods      where school_id = v_school;
  delete from public.time_slots           where school_id = v_school;
  delete from public.school_days          where school_id = v_school;
  delete from public.academic_years       where school_id = v_school;
  delete from public.rooms                where school_id = v_school;
  delete from public.subjects             where school_id = v_school;
  delete from public.tracks               where school_id = v_school;
  delete from public.levels               where school_id = v_school;
  delete from public.subscription_reminders where school_id = v_school;
  delete from public.notifications        where school_id = v_school;
  delete from public.audit_logs           where school_id = v_school;

  perform private.demo_fill(v_school);
  perform private.demo_fill_grades(v_school);
end;
$$;
revoke all on function private.reset_demo_school(uuid) from public, anon, authenticated;
