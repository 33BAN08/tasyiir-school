-- Phase 13 step 7: unpaid list + dashboard figures (read-only, no new table).
--
-- public.fee_unpaid(year, class?, month?, registration?): one row per student
-- who owes money TODAY (the database's school_today()): the balance of the
-- year's non-cancelled charges due on or before today, minus what VALID
-- payments allocated to them (a cancelled receipt puts its amount back).
-- Filters: one class; one month (its charges: tuition + services of that
-- month) or registration only. Also: the student's whole-year balance (due
-- or not), the oldest unpaid due date and the unpaid months
-- [{month (null = registration), balance}] in due order. Ordered by
-- student_id (unique: the app pages it with readAll).
--
-- public.fee_summary(year): the dashboard cards — collected this month
-- (valid receipts of every year with paid_on in the current month), the
-- number of those receipts, and the unpaid total + number of students owing
-- for the given year (from fee_unpaid).
--
-- Both SECURITY INVOKER (RLS applies on top), STABLE; the caller's school +
-- module fees + fees.view are checked first: anyone else gets NO ROW, never an
-- error (as the dashboard aggregates). The journal reads payments directly
-- (RLS, fees.view): the new index serves its date range across years.

create index payments_school_paid_on_idx on public.payments (school_id, paid_on);

create function public.fee_unpaid(
  p_year uuid,
  p_class uuid default null,
  p_month date default null,
  p_registration boolean default false
)
returns table (
  student_id uuid,
  class_id uuid,
  due_centimes bigint,
  year_balance_centimes bigint,
  oldest_due_on date,
  unpaid jsonb
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := (select private.current_school_id());
  v_today date := (select private.school_today());
begin
  if v_school is null or not private.has_module('fees') or not private.has_permission('fees.view') then
    return;
  end if;
  if p_month is not null and p_registration then
    raise exception 'fees_report_filter_invalid' using errcode = '22023';
  end if;

  return query
  with paid as (
    select a.charge_id, sum(a.amount_centimes) as amount
    from public.payment_allocations a
    join public.payments p on p.id = a.payment_id and p.school_id = a.school_id
    where a.school_id = v_school
      and p.academic_year_id = p_year
      and p.cancelled_at is null
    group by a.charge_id
  ), open_charges as (
    select c.student_id, c.kind, c.month, c.due_on,
           c.net_centimes - coalesce(pd.amount, 0) as balance
    from public.student_charges c
    left join paid pd on pd.charge_id = c.id
    where c.school_id = v_school
      and c.academic_year_id = p_year
      and c.cancelled_at is null
      and c.net_centimes > coalesce(pd.amount, 0)
  ), due as (
    select o.student_id, o.month, o.due_on, o.balance
    from open_charges o
    where o.due_on <= v_today
      and (p_month is null or o.month = date_trunc('month', p_month)::date)
      and (not p_registration or o.kind = 'registration')
  ), per_month as (
    select d.student_id, d.month, sum(d.balance) as balance, min(d.due_on) as due_on
    from due d
    group by d.student_id, d.month
  ), per_student as (
    select m.student_id,
           sum(m.balance)::bigint as due,
           min(m.due_on) as oldest,
           jsonb_agg(jsonb_build_object('month', m.month, 'balance', m.balance)
                     order by m.due_on, m.month nulls first) as unpaid
    from per_month m
    group by m.student_id
  ), year_balance as (
    select o.student_id, sum(o.balance)::bigint as balance
    from open_charges o
    group by o.student_id
  )
  select s.student_id, e.class_id, s.due, y.balance, s.oldest, s.unpaid
  from per_student s
  join year_balance y on y.student_id = s.student_id
  left join public.student_enrollments e
    on e.student_id = s.student_id and e.academic_year_id = p_year and e.school_id = v_school
  where p_class is null or e.class_id = p_class
  order by s.student_id;
end;
$$;

create function public.fee_summary(p_year uuid)
returns table (
  today date,
  collected_month_centimes bigint,
  receipts_month integer,
  unpaid_centimes bigint,
  unpaid_students integer
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := (select private.current_school_id());
  v_today date := (select private.school_today());
begin
  if v_school is null or not private.has_module('fees') or not private.has_permission('fees.view') then
    return;
  end if;

  return query
  select v_today,
         coalesce(c.amount, 0)::bigint,
         coalesce(c.n, 0)::integer,
         coalesce(u.amount, 0)::bigint,
         coalesce(u.n, 0)::integer
  from (select sum(p.amount_centimes) as amount, count(*) as n
        from public.payments p
        where p.school_id = v_school
          and p.cancelled_at is null
          and p.paid_on between date_trunc('month', v_today)::date and v_today) c
  cross join (select sum(f.due_centimes) as amount, count(*) as n
              from public.fee_unpaid(p_year) f) u;
end;
$$;

revoke all on function public.fee_unpaid(uuid, uuid, date, boolean) from public, anon;
revoke all on function public.fee_summary(uuid) from public, anon;
grant execute on function public.fee_unpaid(uuid, uuid, date, boolean) to authenticated;
grant execute on function public.fee_summary(uuid) to authenticated;
