-- Phase 13 step 8: what a parent reads about their children's fees (functions
-- only, no table: nothing for reset_demo_school).
--
-- Parents have no policy on student_charges, payments, payment_allocations,
-- fee_services or receipt_prints, and get none here. These two functions are
-- their only way in, so they are SECURITY DEFINER and return a fixed list of
-- fields.
--
-- Checked first, by both; anyone else gets NO ROW, never an error:
--   - school not suspended and account not deactivated: private.current_school_id()
--     is null otherwise
--   - fees module on: private.has_module('fees')
--   - active guardian of that student: private.is_guardian_of_student(student),
--     per student (role parent, not deactivated, password already changed,
--     school active)
--
-- Never returned: staff notes (payments.note), received_by, cancelled_by,
-- cancel reasons and notes, payer name, bank, cheque number and date, the
-- idempotency key, prints, gross price, discount kind and reason.
--
-- public.my_children_fees(): one row per child + year that holds a charge or a
-- payment, newest year first per child. A cancelled charge comes back with net,
-- discount and paid at 0; a cancelled receipt with its local cancellation date.
--
-- public.my_receipt(payment): one VALID receipt of the caller's child. A
-- cancelled receipt, another parent's or an unknown id all give no row. Records
-- no print: a parent's copy never uses up the school's Original.

create function public.my_children_fees()
returns table (
  student_id uuid,
  academic_year_id uuid,
  year_label text,
  is_current boolean,
  today date,
  charges jsonb,
  receipts jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_today date := private.school_today();
begin
  if v_school is null or not private.has_module('fees') then
    return;
  end if;

  return query
  with kids as (
    select distinct sg.student_id as sid
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id and g.school_id = sg.school_id
    where sg.school_id = v_school
      and g.profile_id = auth.uid()
      and private.is_guardian_of_student(sg.student_id)
  ),
  fee_rows as (
    select c.student_id as sid, c.academic_year_id as yid
    from public.student_charges c
    join kids k on k.sid = c.student_id
    where c.school_id = v_school
    union
    select p.student_id, p.academic_year_id
    from public.payments p
    join kids k on k.sid = p.student_id
    where p.school_id = v_school
  )
  select f.sid, f.yid, y.label, y.is_current, v_today, ch.items, rc.items
  from fee_rows f
  join public.academic_years y on y.id = f.yid and y.school_id = v_school
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id,
             'kind', c.kind,
             'month', c.month,
             'service_name', s.name,
             'service_name_ar', s.name_ar,
             'due_on', c.due_on,
             'net', case when c.cancelled_at is null then c.net_centimes else 0 end,
             'discount', case when c.cancelled_at is null then c.discount_centimes else 0 end,
             'paid', case when c.cancelled_at is null then private.fee_charge_paid(c.id) else 0 end,
             'cancelled', c.cancelled_at is not null
           ) order by c.due_on, c.kind, c.id), '[]'::jsonb) as items
    from public.student_charges c
    left join public.fee_services s on s.id = c.service_id and s.school_id = c.school_id
    where c.school_id = v_school
      and c.academic_year_id = f.yid
      and c.student_id = f.sid
  ) ch
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'label', p.receipt_label,
             'amount', p.amount_centimes,
             'method', p.method,
             'paid_on', p.paid_on,
             'cancelled', p.cancelled_at is not null,
             'cancelled_on', (p.cancelled_at at time zone 'Africa/Casablanca')::date
           ) order by p.receipt_no desc), '[]'::jsonb) as items
    from public.payments p
    where p.school_id = v_school
      and p.academic_year_id = f.yid
      and p.student_id = f.sid
  ) rc
  order by f.sid, y.start_date desc;
end;
$$;

create function public.my_receipt(p_payment uuid)
returns table (
  payment_id uuid,
  receipt_label text,
  amount_centimes bigint,
  method text,
  paid_on date,
  student_id uuid,
  first_name text,
  last_name text,
  first_name_ar text,
  last_name_ar text,
  code_massar text,
  class_name text,
  year_label text,
  lines jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or not private.has_module('fees') then
    return;
  end if;

  return query
  select p.id, p.receipt_label, p.amount_centimes, p.method, p.paid_on,
         st.id, st.first_name, st.last_name, st.first_name_ar, st.last_name_ar, st.code_massar,
         cl.name, y.label, ln.items
  from public.payments p
  join public.students st on st.id = p.student_id and st.school_id = p.school_id
  join public.academic_years y on y.id = p.academic_year_id and y.school_id = p.school_id
  left join public.student_enrollments e
    on e.student_id = p.student_id and e.academic_year_id = p.academic_year_id and e.school_id = p.school_id
  left join public.classes cl on cl.id = e.class_id and cl.school_id = e.school_id
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_build_object(
             'kind', c.kind,
             'month', c.month,
             'service_name', s.name,
             'service_name_ar', s.name_ar,
             'amount', a.amount_centimes,
             'partial', a.amount_centimes < c.net_centimes
           ) order by c.due_on, c.kind, c.id), '[]'::jsonb) as items
    from public.payment_allocations a
    join public.student_charges c on c.id = a.charge_id and c.school_id = a.school_id
    left join public.fee_services s on s.id = c.service_id and s.school_id = c.school_id
    where a.payment_id = p.id and a.school_id = p.school_id
  ) ln
  where p.id = p_payment
    and p.school_id = v_school
    and p.cancelled_at is null
    and private.is_guardian_of_student(p.student_id);
end;
$$;

revoke all on function public.my_children_fees() from public, anon;
revoke all on function public.my_receipt(uuid) from public, anon;
grant execute on function public.my_children_fees() to authenticated;
grant execute on function public.my_receipt(uuid) to authenticated;
