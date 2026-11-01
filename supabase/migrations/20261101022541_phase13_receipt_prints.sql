-- Phase 13 step 5b: receipt prints (ORIGINAL on the first print only, then
-- DUPLICATA) + the names of the staff on a receipt.
--
-- receipt_prints: one row per opening of a receipt's print page, numbered per
-- payment (1 = the original), with the language it was opened in (fr / ar).
-- Written only by record_receipt_print (SECURITY DEFINER, owner); read by
-- fees.view staff. Payments are never changed, so the count cannot live on
-- them. A language switch on the print page re-uses the print it came from
-- (app side: same payment, same user, < 10 min) and records nothing:
-- switching to Arabic never turns the original into a duplicata.
--
-- fee_staff_names: "reçu par" / "annulé par" on the receipt and the history.
-- profiles_select needs users.view, which the accountant has not; this returns,
-- to fees.view staff, only the names of people who received or cancelled a
-- payment of the caller's own school (never any other staff member).

-- ===========================================================================
-- receipt_prints
-- ===========================================================================
create table public.receipt_prints (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  payment_id  uuid not null,
  print_no    integer not null,
  language    text not null,
  printed_at  timestamptz not null default now(),
  printed_by  uuid,

  constraint receipt_prints_no_check check (print_no >= 1),
  constraint receipt_prints_language_check check (language in ('fr', 'ar')),
  constraint receipt_prints_payment_no_key unique (payment_id, print_no),
  -- No ON DELETE: a payment is never deleted (the demo reset deletes the prints first).
  constraint receipt_prints_payment_fkey foreign key (payment_id, school_id)
    references public.payments (id, school_id),
  constraint receipt_prints_printed_by_fkey foreign key (printed_by)
    references public.profiles (id) on delete set null
);

create index receipt_prints_school_idx on public.receipt_prints (school_id);
create index receipt_prints_payment_idx on public.receipt_prints (payment_id, school_id);
create index receipt_prints_printed_by_idx on public.receipt_prints (printed_by);

alter table public.receipt_prints enable row level security;
-- Revoke first (service_role too: Supabase's default gives it ALL, TRUNCATE included).
revoke all on public.receipt_prints from anon, authenticated, service_role;
grant select on public.receipt_prints to authenticated, service_role;

create policy receipt_prints_select on public.receipt_prints
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));

-- ===========================================================================
-- record_receipt_print (fees.view): the next print number of a payment.
-- Two openings at once wait for each other: only one of them is number 1.
-- Errors: fees_forbidden, fees_language_invalid, fees_payment_not_found.
-- ===========================================================================
create function public.record_receipt_print(p_payment uuid, p_language text)
returns table (print_id uuid, print_no integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school uuid := private.fees_require('fees.view', null);
  v_no     integer;
  v_id     uuid;
begin
  if p_language is null or p_language not in ('fr', 'ar') then
    raise exception 'fees_language_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from public.payments p where p.id = p_payment and p.school_id = v_school) then
    raise exception 'fees_payment_not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fees-print:' || p_payment::text, 0));
  select coalesce(max(r.print_no), 0) + 1 into v_no from public.receipt_prints r where r.payment_id = p_payment;
  insert into public.receipt_prints (school_id, payment_id, print_no, language, printed_by)
  values (v_school, p_payment, v_no, p_language, auth.uid())
  returning id into v_id;
  return query select v_id, v_no;
end;
$$;
revoke all on function public.record_receipt_print(uuid, text) from public, anon;
grant execute on function public.record_receipt_print(uuid, text) to authenticated;

-- ===========================================================================
-- fee_staff_names (fees.view): full names of the people on the caller's
-- school's payments (received_by / cancelled_by); any other id returns nothing.
-- ===========================================================================
create function public.fee_staff_names(p_ids uuid[])
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.fees_require('fees.view', null);
begin
  if p_ids is null or cardinality(p_ids) > 200 then
    raise exception 'fees_rows_invalid' using errcode = '22023';
  end if;
  return query
    select p.id, p.full_name from public.profiles p
    where p.id = any (p_ids) and p.school_id = v_school
      and exists (select 1 from public.payments pay
                  where pay.school_id = v_school and p.id in (pay.received_by, pay.cancelled_by));
end;
$$;
revoke all on function public.fee_staff_names(uuid[]) from public, anon;
grant execute on function public.fee_staff_names(uuid[]) to authenticated;

-- ===========================================================================
-- Demo school (body copied from the database, 2026-11-01): the prints go
-- before the payments (they reference them). Nothing else changes.
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
  delete from public.receipt_prints       where school_id = v_school;
  perform set_config('tasyir.fees_purge', 'on', true);
  delete from public.payment_allocations  where school_id = v_school;
  delete from public.payments             where school_id = v_school;
  perform set_config('tasyir.fees_purge', 'off', true);
  delete from public.receipt_counters     where school_id = v_school;
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
