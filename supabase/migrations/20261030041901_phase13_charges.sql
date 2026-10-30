-- Phase 13 step 3 — charges (what each student owes, month by month) + the
-- atomic save of the fees grid. No payments yet (step 4).
--
-- student_fee_ranges = optional per year + student: the first and / or last
--   billed month (a student who arrives in November, or leaves in March).
--   NO ROW = the whole year. fees.manage writes it (RLS), like services.
-- student_charges = one row per student + year + charge: registration (once,
--   month NULL), tuition (one per billed month), service (one per billed month
--   of each service period). gross = the price, discount = the student's
--   discounts, net = gross − discount (generated). Amounts in centimes.
--   Nobody writes it directly (no INSERT / UPDATE / DELETE grant): only the
--   refresh below and cancel_charge (SECURITY DEFINER). fees.view reads it.
--
-- The refresh (private.fee_refresh_student) turns the setup into charges:
--   - wanted charges = billed months ∩ the student's range; registration if
--     the level's plan has one and at least one month is billed; tuition per
--     month if the monthly fee > 0; each service per month of its period;
--   - discounts: the percents of the discounts that apply ADD UP (at most
--     100 %), the result is rounded to the WHOLE DIRHAM; then the fixed
--     amounts (each per charge); never more than the price;
--   - due date = the billed month's due day; registration = the first billed
--     month's due date;
--   - a charge with money on it (private.fee_charge_paid > 0, always 0 until
--     step 4 replaces that function) or a cancelled charge is NEVER changed;
--     every other charge follows the setup (updated, removed, added).
-- It runs by itself (triggers) after every change of fee months, plans,
-- service prices, a student's services / discounts / range, and enrollments
-- (class change, removal); public.refresh_student_charges /
-- public.refresh_year_charges run it on demand (fees.manage).
--
-- public.save_fee_plans(year, rows) = the fees grid in ONE transaction (all
--   levels or nothing): both amounts null = the level's row is removed.
-- public.cancel_charge(charge, reason, note) = fees.cancel (director): a
--   charge with no money on it is cancelled (who, when, reason code + note);
--   the refresh never brings it back.
--
-- Every SECURITY DEFINER function: search_path = '', checks school + module +
-- permission first (private.fees_require). Error keys raised: fees_forbidden,
-- fees_year_not_found, fees_rows_invalid, fees_charge_not_found,
-- fees_charge_cancelled, fees_charge_paid, fees_cancel_reason_invalid,
-- fees_cancel_note_required.

-- ===========================================================================
-- student_fee_ranges
-- ===========================================================================
create table public.student_fee_ranges (
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  student_id        uuid not null,
  from_month        date,                    -- NULL = from the year's first billed month
  to_month          date,                    -- NULL = to the year's last billed month
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint student_fee_ranges_pkey primary key (academic_year_id, student_id),
  constraint student_fee_ranges_some_check check (num_nonnulls(from_month, to_month) >= 1),
  constraint student_fee_ranges_from_check check (from_month is null or extract(day from from_month) = 1),
  constraint student_fee_ranges_to_check
    check (to_month is null or (extract(day from to_month) = 1 and (from_month is null or to_month >= from_month))),
  constraint student_fee_ranges_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint student_fee_ranges_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint student_fee_ranges_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index student_fee_ranges_school_idx on public.student_fee_ranges (school_id);
create index student_fee_ranges_student_idx on public.student_fee_ranges (student_id, school_id);
create index student_fee_ranges_updated_by_idx on public.student_fee_ranges (updated_by);

alter table public.student_fee_ranges enable row level security;
revoke all on public.student_fee_ranges from anon, authenticated;

create trigger student_fee_ranges_set_updated
  before insert or update on public.student_fee_ranges
  for each row execute function private.fees_set_updated();

-- Inside the year, and the student is enrolled that year (same errors as services).
create function private.student_fee_ranges_before_write()
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
     or new.to_month < date_trunc('month', v_start)::date or new.to_month > v_end then
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

create trigger student_fee_ranges_before_write
  before insert or update on public.student_fee_ranges
  for each row execute function private.student_fee_ranges_before_write();

grant select, delete on public.student_fee_ranges to authenticated;
grant insert (school_id, academic_year_id, student_id, from_month, to_month)
  on public.student_fee_ranges to authenticated;
grant update (from_month, to_month) on public.student_fee_ranges to authenticated;

create policy student_fee_ranges_select on public.student_fee_ranges
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));
create policy student_fee_ranges_insert on public.student_fee_ranges
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('fees'))
              and (select private.has_permission('fees.manage')));
create policy student_fee_ranges_update on public.student_fee_ranges
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('fees'))
              and (select private.has_permission('fees.manage')));
create policy student_fee_ranges_delete on public.student_fee_ranges
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.manage')));

-- ===========================================================================
-- student_charges
-- ===========================================================================
create table public.student_charges (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete cascade,
  academic_year_id   uuid not null,
  student_id         uuid not null,
  kind               text not null,
  service_id         uuid,                   -- kind service only
  month              date,                   -- NULL for the registration only
  gross_centimes     bigint not null,
  discount_centimes  bigint not null default 0,
  net_centimes       bigint generated always as (gross_centimes - discount_centimes) stored,
  due_on             date not null,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  cancel_reason      text,
  cancel_note        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint student_charges_kind_check check (kind in ('registration', 'tuition', 'service')),
  constraint student_charges_month_check
    check ((kind = 'registration') = (month is null) and (month is null or extract(day from month) = 1)),
  constraint student_charges_service_check check ((kind = 'service') = (service_id is not null)),
  constraint student_charges_gross_check check (gross_centimes between 0 and 10000000),
  constraint student_charges_discount_check check (discount_centimes between 0 and gross_centimes),
  constraint student_charges_cancel_check check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null and cancel_note is null)
    or (cancelled_at is not null
        and cancel_reason in ('left_school', 'waived', 'entry_error', 'other')
        and (cancel_reason <> 'other' or length(btrim(cancel_note)) > 0))),
  constraint student_charges_cancel_note_check check (cancel_note is null or length(cancel_note) <= 200),
  -- One charge per student + year + kind + service + month, cancelled ones included
  -- (a cancelled charge keeps its place: the refresh never recreates it).
  constraint student_charges_key unique nulls not distinct
    (academic_year_id, student_id, kind, service_id, month),
  constraint student_charges_id_school_key unique (id, school_id),
  constraint student_charges_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint student_charges_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  -- A service with charges cannot be deleted (deactivate it instead).
  constraint student_charges_service_fkey foreign key (service_id, academic_year_id, school_id)
    references public.fee_services (id, academic_year_id, school_id) on delete restrict,
  constraint student_charges_cancelled_by_fkey foreign key (cancelled_by)
    references public.profiles (id) on delete set null
);

create index student_charges_school_idx on public.student_charges (school_id);
create index student_charges_year_student_idx on public.student_charges (academic_year_id, student_id);
create index student_charges_student_idx on public.student_charges (student_id, school_id);
create index student_charges_service_idx on public.student_charges (service_id, academic_year_id, school_id);
create index student_charges_year_month_idx on public.student_charges (academic_year_id, month);
create index student_charges_cancelled_by_idx on public.student_charges (cancelled_by);

alter table public.student_charges enable row level security;
revoke all on public.student_charges from anon, authenticated;
grant select on public.student_charges to authenticated;

create policy student_charges_select on public.student_charges
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));

-- ===========================================================================
-- Helpers
-- ===========================================================================

-- Caller check of the fees RPCs: school, fees module, permission, and the year
-- (when given) in the caller's school. Returns the school id.
create function private.fees_require(p_permission text, p_year uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or not private.has_module('fees') or not private.has_permission(p_permission) then
    raise exception 'fees_forbidden' using errcode = '42501';
  end if;
  if p_year is not null and not exists (select 1 from public.academic_years y
                                         where y.id = p_year and y.school_id = v_school) then
    raise exception 'fees_year_not_found' using errcode = 'P0002';
  end if;
  return v_school;
end;
$$;
revoke all on function private.fees_require(text, uuid) from public, anon, authenticated;

-- Money already allocated to a charge. Step 4 (payments) replaces this body;
-- until then nothing is ever paid.
create function private.fee_charge_paid(p_charge uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select 0::bigint;
$$;
revoke all on function private.fee_charge_paid(uuid) from public, anon, authenticated;

-- The year's billed months + due day, defaults when the school changed nothing
-- (no caller check: used by the functions below, never callable by users).
create function private.fee_year_settings(p_year uuid)
returns table (billing_months date[], due_day smallint, customised boolean)
language sql
stable
security definer
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
  where y.id = p_year;
$$;
revoke all on function private.fee_year_settings(uuid) from public, anon, authenticated;

-- public.fee_year_rules (step 1) now reads the same defaults (one source of
-- truth). SECURITY DEFINER because private.fee_year_settings is not callable
-- by users; the caller checks stay in its WHERE.
create or replace function public.fee_year_rules(p_year uuid)
returns table (billing_months date[], due_day smallint, customised boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.billing_months, s.due_day, s.customised
  from public.academic_years y
  cross join lateral private.fee_year_settings(y.id) s
  where y.id = p_year
    and y.school_id = (select private.current_school_id())
    and (select private.has_module('fees'))
    and (select private.has_permission('fees.view'));
$$;
revoke all on function public.fee_year_rules(uuid) from public, anon;
grant execute on function public.fee_year_rules(uuid) to authenticated;

-- ===========================================================================
-- What a student should be charged this year (from the setup; nothing written)
-- ===========================================================================
create function private.fee_wanted_charges(p_year uuid, p_student uuid)
returns table (kind text, service_id uuid, month date, gross bigint, discount bigint, due_on date)
language sql
stable
security definer
set search_path = ''
as $$
  with enrollment as (
    select c.level_id
    from public.student_enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student and e.academic_year_id = p_year
  ),
  settings as (
    select s.billing_months, s.due_day from private.fee_year_settings(p_year) s
  ),
  span as (
    select coalesce(r.from_month, '-infinity'::date) as from_m,
           coalesce(r.to_month, 'infinity'::date) as to_m
    from (select 1) one
    left join public.student_fee_ranges r on r.academic_year_id = p_year and r.student_id = p_student
  ),
  months as (
    select m::date as month
    from settings, span, unnest(settings.billing_months) m
    where exists (select 1 from enrollment) and m between span.from_m and span.to_m
  ),
  plan as (
    select p.registration_centimes, p.monthly_centimes
    from public.fee_plans p
    join enrollment e on e.level_id = p.level_id
    where p.academic_year_id = p_year
  ),
  wanted as (
    select 'registration'::text as kind, null::uuid as service_id, null::date as month,
           plan.registration_centimes as gross
    from plan
    where plan.registration_centimes > 0 and exists (select 1 from months)
    union all
    select 'tuition', null, months.month, plan.monthly_centimes
    from plan, months
    where plan.monthly_centimes > 0
    union all
    select 'service', ss.service_id, months.month, fs.monthly_centimes
    from public.student_services ss
    join public.fee_services fs on fs.id = ss.service_id
    join months on months.month >= ss.from_month and (ss.to_month is null or months.month <= ss.to_month)
    where ss.academic_year_id = p_year and ss.student_id = p_student and fs.monthly_centimes > 0
  ),
  priced as (
    select w.kind, w.service_id, w.month, w.gross,
           least(10000, coalesce(sum(d.percent_bp), 0)) as percent_bp,
           coalesce(sum(d.amount_centimes), 0) as fixed
    from wanted w
    left join public.student_discounts d
      on d.academic_year_id = p_year and d.student_id = p_student
     and d.applies_to in ('all', case w.kind when 'service' then 'services' else w.kind end)
    group by w.kind, w.service_id, w.month, w.gross
  )
  select p.kind, p.service_id, p.month, p.gross,
         -- Percent rounded to the whole dirham (half up), then the fixed amounts; never above the price.
         least(p.gross, (round(p.gross * p.percent_bp / 1000000.0) * 100)::bigint + p.fixed),
         make_date(extract(year from d.month)::int, extract(month from d.month)::int,
                   (select settings.due_day from settings))
  from priced p
  cross join lateral (select coalesce(p.month, (select min(months.month) from months)) as month) d;
$$;
revoke all on function private.fee_wanted_charges(uuid, uuid) from public, anon, authenticated;

-- ===========================================================================
-- The refresh: charges follow the setup, except money-bearing / cancelled ones
-- ===========================================================================
create function private.fee_refresh_student(p_year uuid, p_student uuid)
returns table (inserted integer, updated integer, removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid;
begin
  -- Nothing while the school, the year or the student is being deleted (cascades).
  select y.school_id into v_school
  from public.academic_years y
  join public.schools s on s.id = y.school_id
  where y.id = p_year;
  if v_school is null
     or not exists (select 1 from public.students st where st.id = p_student and st.school_id = v_school) then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- One refresh at a time per student (two saves at once would race on the same rows).
  perform pg_advisory_xact_lock(hashtextextended('fees:' || p_student::text, 0));

  return query
  with wanted as (
    select * from private.fee_wanted_charges(p_year, p_student)
  ),
  existing as (
    select c.id, c.kind, c.service_id, c.month, c.gross_centimes, c.discount_centimes, c.due_on,
           c.cancelled_at is not null as cancelled,
           private.fee_charge_paid(c.id) > 0 as paid
    from public.student_charges c
    where c.academic_year_id = p_year and c.student_id = p_student
  ),
  removed as (
    delete from public.student_charges c
    using existing x
    where c.id = x.id and not x.cancelled and not x.paid
      and not exists (select 1 from wanted w
                       where w.kind = x.kind and w.service_id is not distinct from x.service_id
                         and w.month is not distinct from x.month)
    returning 1
  ),
  changed as (
    update public.student_charges c
       set gross_centimes = w.gross, discount_centimes = w.discount, due_on = w.due_on, updated_at = now()
      from existing x
      join wanted w on w.kind = x.kind and w.service_id is not distinct from x.service_id
                   and w.month is not distinct from x.month
     where c.id = x.id and not x.cancelled and not x.paid
       and (x.gross_centimes, x.discount_centimes, x.due_on) is distinct from (w.gross, w.discount, w.due_on)
    returning 1
  ),
  added as (
    insert into public.student_charges
      (school_id, academic_year_id, student_id, kind, service_id, month, gross_centimes, discount_centimes, due_on)
    select v_school, p_year, p_student, w.kind, w.service_id, w.month, w.gross, w.discount, w.due_on
    from wanted w
    where not exists (select 1 from existing x
                       where x.kind = w.kind and x.service_id is not distinct from w.service_id
                         and x.month is not distinct from w.month)
    on conflict do nothing
    returning 1
  )
  select (select count(*) from added)::integer,
         (select count(*) from changed)::integer,
         (select count(*) from removed)::integer,
         (select count(*) from existing x where x.paid and not x.cancelled)::integer;
end;
$$;
revoke all on function private.fee_refresh_student(uuid, uuid) from public, anon, authenticated;

-- Every enrolled student of a year (optionally of one level).
create function private.fee_refresh_year(p_year uuid, p_level uuid default null)
returns table (inserted integer, updated integer, removed integer, kept integer)
language sql
security definer
set search_path = ''
as $$
  select coalesce(sum(r.inserted), 0)::integer, coalesce(sum(r.updated), 0)::integer,
         coalesce(sum(r.removed), 0)::integer, coalesce(sum(r.kept), 0)::integer
  from public.student_enrollments e
  join public.classes c on c.id = e.class_id
  cross join lateral private.fee_refresh_student(p_year, e.student_id) r
  where e.academic_year_id = p_year and (p_level is null or c.level_id = p_level);
$$;
revoke all on function private.fee_refresh_year(uuid, uuid) from public, anon, authenticated;

-- ===========================================================================
-- Automatic refresh after setup changes
-- ===========================================================================
create function private.fees_refresh_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select * from (values (case when tg_op <> 'INSERT' then to_jsonb(old) end),
                                 (case when tg_op <> 'DELETE' then to_jsonb(new) end)) v (row)
           where v.row is not null loop
    case tg_table_name
      when 'student_discounts', 'student_services', 'student_fee_ranges', 'student_enrollments' then
        perform private.fee_refresh_student((r.row ->> 'academic_year_id')::uuid, (r.row ->> 'student_id')::uuid);
      when 'fee_plans' then
        perform private.fee_refresh_year((r.row ->> 'academic_year_id')::uuid, (r.row ->> 'level_id')::uuid);
      when 'fee_years' then
        perform private.fee_refresh_year((r.row ->> 'academic_year_id')::uuid);
      when 'fee_services' then
        perform private.fee_refresh_student(ss.academic_year_id, ss.student_id)
        from (select distinct s.academic_year_id, s.student_id
              from public.student_services s
              where s.service_id = (r.row ->> 'id')::uuid) ss;
    end case;
  end loop;
  return null;
end;
$$;
revoke all on function private.fees_refresh_after_change() from public, anon, authenticated;

create trigger fee_years_refresh after insert or update or delete on public.fee_years
  for each row execute function private.fees_refresh_after_change();
create trigger fee_plans_refresh after insert or update or delete on public.fee_plans
  for each row execute function private.fees_refresh_after_change();
create trigger fee_services_refresh after update of monthly_centimes on public.fee_services
  for each row execute function private.fees_refresh_after_change();
create trigger student_services_refresh after insert or update or delete on public.student_services
  for each row execute function private.fees_refresh_after_change();
create trigger student_discounts_refresh after insert or update or delete on public.student_discounts
  for each row execute function private.fees_refresh_after_change();
create trigger student_fee_ranges_refresh after insert or update or delete on public.student_fee_ranges
  for each row execute function private.fees_refresh_after_change();
create trigger student_enrollments_fees_refresh after insert or update of class_id or delete on public.student_enrollments
  for each row execute function private.fees_refresh_after_change();

-- ===========================================================================
-- RPCs
-- ===========================================================================

-- On demand ("Recalculer"): one student, or every enrolled student of the year.
create function public.refresh_student_charges(p_student uuid, p_year uuid)
returns table (inserted integer, updated integer, removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.fees_require('fees.manage', p_year);
begin
  if not exists (select 1 from public.students s where s.id = p_student and s.school_id = v_school) then
    raise exception 'fees_student_not_found' using errcode = 'P0002';
  end if;
  return query select * from private.fee_refresh_student(p_year, p_student);
end;
$$;
revoke all on function public.refresh_student_charges(uuid, uuid) from public, anon;
grant execute on function public.refresh_student_charges(uuid, uuid) to authenticated;

create function public.refresh_year_charges(p_year uuid)
returns table (inserted integer, updated integer, removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fees_require('fees.manage', p_year);
  return query select * from private.fee_refresh_year(p_year);
end;
$$;
revoke all on function public.refresh_year_charges(uuid) from public, anon;
grant execute on function public.refresh_year_charges(uuid) to authenticated;

-- The fees grid, all levels or nothing. p_rows = [{level_id, registration_centimes, monthly_centimes}]
-- (null = empty box; both null = no fee for the level: its row is removed). The
-- refresh triggers run inside the same transaction. Returns the rows handled.
create function public.save_fee_plans(p_year uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.fees_require('fees.manage', p_year);
  v_row    jsonb;
  v_level  uuid;
  v_reg    bigint;
  v_month  bigint;
  v_count  integer := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'fees_rows_invalid' using errcode = '22023';
  end if;
  if (select count(distinct r ->> 'level_id') from jsonb_array_elements(p_rows) r) <> jsonb_array_length(p_rows) then
    raise exception 'fees_rows_invalid' using errcode = '22023';
  end if;

  for v_row in select r from jsonb_array_elements(p_rows) r loop
    begin
      v_level := (v_row ->> 'level_id')::uuid;
      v_reg := (v_row ->> 'registration_centimes')::bigint;
      v_month := (v_row ->> 'monthly_centimes')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'fees_rows_invalid' using errcode = '22023';
    end;
    if v_level is null then
      raise exception 'fees_rows_invalid' using errcode = '22023';
    end if;

    if v_reg is null and v_month is null then
      delete from public.fee_plans
       where academic_year_id = p_year and level_id = v_level and school_id = v_school;
    else
      -- Amounts and the level's school are checked by the table (checks, foreign key).
      insert into public.fee_plans (school_id, academic_year_id, level_id, registration_centimes, monthly_centimes)
      values (v_school, p_year, v_level, coalesce(v_reg, 0), coalesce(v_month, 0))
      on conflict (academic_year_id, level_id) do update
        set registration_centimes = excluded.registration_centimes,
            monthly_centimes = excluded.monthly_centimes
        where public.fee_plans.school_id = v_school;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.save_fee_plans(uuid, jsonb) from public, anon;
grant execute on function public.save_fee_plans(uuid, jsonb) to authenticated;

-- Cancel a charge with no money on it (fees.cancel: director by default).
create function public.cancel_charge(p_charge uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.fees_require('fees.cancel', null);
  v_charge public.student_charges;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into v_charge from public.student_charges c
   where c.id = p_charge and c.school_id = v_school
   for update;
  if v_charge.id is null then
    raise exception 'fees_charge_not_found' using errcode = 'P0002';
  end if;
  if v_charge.cancelled_at is not null then
    raise exception 'fees_charge_cancelled' using errcode = 'P0001';
  end if;
  if private.fee_charge_paid(v_charge.id) > 0 then
    raise exception 'fees_charge_paid' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('left_school', 'waived', 'entry_error', 'other') then
    raise exception 'fees_cancel_reason_invalid' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'fees_cancel_note_required' using errcode = '22023';
  end if;
  if length(v_note) > 200 then
    raise exception 'fees_cancel_note_too_long' using errcode = '22023';
  end if;

  update public.student_charges
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason, cancel_note = v_note,
         updated_at = now()
   where id = v_charge.id;

  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
  values (v_school, auth.uid(), 'fee_charge.cancel', 'student_charge', v_charge.id::text,
          jsonb_build_object('student_id', v_charge.student_id, 'academic_year_id', v_charge.academic_year_id,
                             'kind', v_charge.kind, 'service_id', v_charge.service_id, 'month', v_charge.month,
                             'net_centimes', v_charge.net_centimes, 'reason', p_reason, 'note', v_note));
end;
$$;
revoke all on function public.cancel_charge(uuid, text, text) from public, anon;
grant execute on function public.cancel_charge(uuid, text, text) to authenticated;

-- ===========================================================================
-- Charges for the setups that already exist (DEV / production: none yet,
-- the demo school has no fees until step 10).
-- ===========================================================================
select private.fee_refresh_year(y.academic_year_id) from public.fee_years y;
select distinct private.fee_refresh_year(p.academic_year_id, p.level_id) from public.fee_plans p;
select private.fee_refresh_student(s.academic_year_id, s.student_id)
from (select distinct academic_year_id, student_id from public.student_services
      union select academic_year_id, student_id from public.student_discounts) s;

-- ===========================================================================
-- Demo school: the two new tables go with the nightly reset (body copied from
-- the database = 20261030023556_phase13_fee_setup). Charges are deleted after
-- the fee setup: deleting the setup refreshes (and re-creates) charges first.
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
  delete from public.student_fee_ranges   where school_id = v_school;
  delete from public.student_discounts    where school_id = v_school;
  delete from public.student_services     where school_id = v_school;
  delete from public.fee_plans            where school_id = v_school;
  delete from public.fee_years            where school_id = v_school;
  delete from public.student_charges      where school_id = v_school;
  delete from public.fee_services         where school_id = v_school;
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
