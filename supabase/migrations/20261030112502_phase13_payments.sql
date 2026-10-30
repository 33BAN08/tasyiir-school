-- Phase 13 step 4 — payments (database only; screens in step 5).
--
-- fee_years.receipt_prefix = optional per year (1–10 letters / digits /
--   hyphens, e.g. MDR): receipt labels read "MDR-2026-2027/000123", or
--   "2026-2027/000123" without a prefix.
-- receipt_counters = per school + year, the last receipt number. Only
--   record_payment touches it, inside the payment's transaction: a number is
--   used only when the payment is saved (no gap), two payments at once wait
--   for each other on the counter row.
-- payments = one receipt: one student, one year, amount > 0 (centimes),
--   method cash | cheque | transfer (cheque: bank + cheque number, optional
--   cheque date; transfer: optional bank / reference; cash: none of them),
--   optional payer name (≤ 100) and note (≤ 200), paid_on (today − 7 days →
--   today, the school's day), the receipt number + label (label frozen at
--   saving), the client's idempotency key (unique per school: a double click
--   returns the first payment), who received it. NEVER updated except the
--   cancellation (once: who, when, reason bounced_cheque | entry_error |
--   refund | other + note, required for other), NEVER deleted (triggers, even
--   for the server key; only a school's own deletion and the demo reset purge
--   them). Users get SELECT only (fees.view).
-- payment_allocations = which charges a payment covers, and how much. Never
--   updated or deleted (same guard). A cancelled payment's allocations stay
--   as history but no longer count.
--
-- record_payment (fees.manage): oldest due first (registration, then the
--   months in order, tuition before services in a month), the overflow goes
--   to the next months; or the staff's own list [{charge_id, amount}] (this
--   student's, open, each amount ≤ the charge's balance, the list's total =
--   the amount). More than the year's balance is refused.
-- cancel_payment (fees.cancel, director): the amounts go back to unpaid.
--
-- Charges: private.fee_charge_paid now = the money of the charges' non-
-- cancelled payments. The refresh never changes or removes a charge that HAS
-- EVER had money on it (any allocation, cancelled payments included: the
-- price agreed stays; cancel_charge removes what is not owed). A charge with
-- allocations cannot be deleted (foreign key).

-- ===========================================================================
-- fee_years.receipt_prefix
-- ===========================================================================
alter table public.fee_years add column receipt_prefix text;
alter table public.fee_years add constraint fee_years_receipt_prefix_check
  check (receipt_prefix is null or receipt_prefix ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,9}$');
grant insert (receipt_prefix), update (receipt_prefix) on public.fee_years to authenticated;

-- ===========================================================================
-- receipt_counters
-- ===========================================================================
create table public.receipt_counters (
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  last_no           integer not null default 0,
  updated_at        timestamptz not null default now(),

  constraint receipt_counters_pkey primary key (academic_year_id),
  constraint receipt_counters_last_no_check check (last_no >= 0),
  constraint receipt_counters_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade
);

create index receipt_counters_school_idx on public.receipt_counters (school_id);

alter table public.receipt_counters enable row level security;
revoke all on public.receipt_counters from anon, authenticated;
grant select on public.receipt_counters to authenticated;

create policy receipt_counters_select on public.receipt_counters
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));

-- ===========================================================================
-- payments
-- ===========================================================================
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,
  student_id        uuid not null,
  receipt_no        integer not null,
  receipt_label     text not null,
  amount_centimes   bigint not null,
  method            text not null,
  bank              text,
  reference         text,                   -- cheque number / transfer reference
  cheque_date       date,
  payer_name        text,
  note              text,
  paid_on           date not null,
  idempotency_key   uuid not null,
  received_by       uuid,
  created_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  cancelled_by      uuid,
  cancel_reason     text,
  cancel_note       text,

  constraint payments_amount_check check (amount_centimes between 1 and 100000000),
  constraint payments_receipt_no_check check (receipt_no >= 1),
  constraint payments_method_check check (method in ('cash', 'cheque', 'transfer')),
  constraint payments_method_fields_check check (
    case method
      when 'cash' then bank is null and reference is null and cheque_date is null
      when 'cheque' then bank is not null and reference is not null
      else cheque_date is null
    end),
  constraint payments_bank_check check (bank is null or length(btrim(bank)) between 1 and 60),
  constraint payments_reference_check check (reference is null or length(btrim(reference)) between 1 and 60),
  constraint payments_payer_check check (payer_name is null or length(btrim(payer_name)) between 1 and 100),
  constraint payments_note_check check (note is null or length(note) <= 200),
  constraint payments_cancel_check check (
    (cancelled_at is null and cancelled_by is null and cancel_reason is null and cancel_note is null)
    or (cancelled_at is not null
        and cancel_reason in ('bounced_cheque', 'entry_error', 'refund', 'other')
        and (cancel_reason <> 'other' or length(btrim(cancel_note)) > 0))),
  constraint payments_cancel_note_check check (cancel_note is null or length(cancel_note) <= 200),
  constraint payments_receipt_key unique (school_id, academic_year_id, receipt_no),
  constraint payments_idempotency_key unique (school_id, idempotency_key),
  constraint payments_id_school_key unique (id, school_id),
  -- No ON DELETE: a student or a year with payments cannot be deleted (a
  -- school's own deletion still goes through, the checks run at the end).
  constraint payments_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id),
  constraint payments_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id),
  constraint payments_received_by_fkey foreign key (received_by)
    references public.profiles (id) on delete set null,
  constraint payments_cancelled_by_fkey foreign key (cancelled_by)
    references public.profiles (id) on delete set null
);

create index payments_school_idx on public.payments (school_id);
create index payments_year_student_idx on public.payments (academic_year_id, student_id);
create index payments_student_idx on public.payments (student_id, school_id);
create index payments_year_paid_on_idx on public.payments (academic_year_id, paid_on);
create index payments_received_by_idx on public.payments (received_by);
create index payments_cancelled_by_idx on public.payments (cancelled_by);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;
grant select on public.payments to authenticated;

create policy payments_select on public.payments
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));

-- ===========================================================================
-- payment_allocations
-- ===========================================================================
create table public.payment_allocations (
  school_id        uuid not null references public.schools (id) on delete cascade,
  payment_id       uuid not null,
  charge_id        uuid not null,
  amount_centimes  bigint not null,

  constraint payment_allocations_pkey primary key (payment_id, charge_id),
  constraint payment_allocations_amount_check check (amount_centimes between 1 and 10000000),
  constraint payment_allocations_payment_fkey foreign key (payment_id, school_id)
    references public.payments (id, school_id),
  -- A charge with allocations cannot be deleted (the refresh keeps it anyway).
  constraint payment_allocations_charge_fkey foreign key (charge_id, school_id)
    references public.student_charges (id, school_id)
);

create index payment_allocations_school_idx on public.payment_allocations (school_id);
create index payment_allocations_charge_idx on public.payment_allocations (charge_id, school_id);
create index payment_allocations_payment_idx on public.payment_allocations (payment_id, school_id);

alter table public.payment_allocations enable row level security;
revoke all on public.payment_allocations from anon, authenticated;
grant select on public.payment_allocations to authenticated;

create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('fees'))
         and (select private.has_permission('fees.view')));

-- ===========================================================================
-- Never changed, never deleted (even with the server key)
-- ===========================================================================

-- Both guards are SECURITY INVOKER on purpose: current_user must be the role
-- that really runs the statement. "The owner" = the owner of the table the
-- trigger fires on (the role that owns this schema's tables and SECURITY
-- DEFINER functions). The owner runs:
--   - the SECURITY DEFINER functions (record_payment, cancel_payment,
--     reset_demo_school);
--   - the foreign-key cascades of a school's deletion (Postgres runs them as
--     the table owner).
-- authenticated, anon and the server key's role (service_role) are never the
-- owner: whatever they set, they cannot change or delete a payment.
-- Deletes: the owner AND (the demo reset's tasyir.fees_purge flag for its own
-- transaction, or the school itself is being deleted).
-- Updates: the owner (cancel_payment) AND only the cancellation, only once.
create function private.payments_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner boolean := (select c.relowner = r.oid
                      from pg_catalog.pg_class c, pg_catalog.pg_roles r
                      where c.oid = tg_relid and r.rolname = current_user);
begin
  if tg_op = 'DELETE' then
    if v_owner and (coalesce(current_setting('tasyir.fees_purge', true), '') = 'on'
                    or not exists (select 1 from public.schools s where s.id = old.school_id)) then
      return old;
    end if;
    raise exception 'fees_payment_immutable' using errcode = '42501';
  end if;
  -- UPDATE: cancel_payment only (the owner), the cancellation only, once.
  if not v_owner or old.cancelled_at is not null or new.cancelled_at is null
     or (to_jsonb(new) - array['cancelled_at', 'cancelled_by', 'cancel_reason', 'cancel_note'])
        is distinct from (to_jsonb(old) - array['cancelled_at', 'cancelled_by', 'cancel_reason', 'cancel_note']) then
    raise exception 'fees_payment_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.payments_guard() from public, anon, authenticated;

create trigger payments_guard
  before update or delete on public.payments
  for each row execute function private.payments_guard();

-- Same rule as payments_guard; an allocation is never updated.
create function private.payment_allocations_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner boolean := (select c.relowner = r.oid
                      from pg_catalog.pg_class c, pg_catalog.pg_roles r
                      where c.oid = tg_relid and r.rolname = current_user);
begin
  if tg_op = 'DELETE' and v_owner
     and (coalesce(current_setting('tasyir.fees_purge', true), '') = 'on'
          or not exists (select 1 from public.schools s where s.id = old.school_id)) then
    return old;
  end if;
  raise exception 'fees_payment_immutable' using errcode = '42501';
end;
$$;
revoke all on function private.payment_allocations_guard() from public, anon, authenticated;

create trigger payment_allocations_guard
  before update or delete on public.payment_allocations
  for each row execute function private.payment_allocations_guard();

-- ===========================================================================
-- Charges: money on them
-- ===========================================================================

-- The money of the charge's non-cancelled payments (balance = net − this).
create or replace function private.fee_charge_paid(p_charge uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(a.amount_centimes), 0)::bigint
  from public.payment_allocations a
  join public.payments p on p.id = a.payment_id
  where a.charge_id = p_charge and p.cancelled_at is null;
$$;

-- The refresh (body of 20261030041901_phase13_charges, one change: a charge
-- with ANY allocation — cancelled payments included — is kept as it is).
create or replace function private.fee_refresh_student(p_year uuid, p_student uuid)
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
           exists (select 1 from public.payment_allocations a where a.charge_id = c.id) as paid
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

-- The automatic refresh (body of 20261030041901_phase13_charges, one change:
-- a fee_years update that changes neither the months nor the due day — e.g.
-- the receipt prefix — refreshes nothing).
create or replace function private.fees_refresh_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_table_name = 'fee_years' and tg_op = 'UPDATE' then
    if old.billing_months is not distinct from new.billing_months and old.due_day = new.due_day then
      return null;
    end if;
  end if;
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

-- ===========================================================================
-- record_payment
-- ===========================================================================
-- Returns the payment (a replay of the same idempotency key returns the first
-- one with replayed = true). Errors: fees_forbidden, fees_year_not_found,
-- fees_student_not_found, fees_amount_invalid, fees_method_invalid,
-- fees_cheque_details_required, fees_paid_on_invalid,
-- fees_nothing_due, fees_amount_above_balance, fees_allocation_invalid,
-- fees_allocation_total_mismatch, fees_idempotency_conflict.
create function public.record_payment(
  p_student          uuid,
  p_year             uuid,
  p_amount           bigint,
  p_method           text,
  p_paid_on          date,
  p_idempotency_key  uuid,
  p_bank             text default null,
  p_reference        text default null,
  p_cheque_date      date default null,
  p_payer_name       text default null,
  p_note             text default null,
  p_allocations      jsonb default null
)
returns table (payment_id uuid, receipt_no integer, receipt_label text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_school   uuid := private.fees_require('fees.manage', p_year);
  v_today    date := private.school_today();
  v_existing public.payments;
  v_bank     text := nullif(btrim(coalesce(p_bank, '')), '');
  v_ref      text := nullif(btrim(coalesce(p_reference, '')), '');
  v_payer    text := nullif(btrim(coalesce(p_payer_name, '')), '');
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_open     bigint;
  v_no       integer;
  v_label    text;
  v_payment  uuid;
  v_left     bigint;
  v_take     bigint;
  c          record;
begin
  if p_idempotency_key is null then
    raise exception 'fees_idempotency_conflict' using errcode = '22023';
  end if;
  -- The same key twice at once: the second waits, then finds the first.
  perform pg_advisory_xact_lock(hashtextextended('fees-pay:' || v_school::text || ':' || p_idempotency_key::text, 0));
  select * into v_existing from public.payments p
   where p.school_id = v_school and p.idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.student_id <> p_student or v_existing.academic_year_id <> p_year
       or v_existing.amount_centimes <> p_amount then
      raise exception 'fees_idempotency_conflict' using errcode = '22023';
    end if;
    return query select v_existing.id, v_existing.receipt_no, v_existing.receipt_label, true;
    return;
  end if;

  if not exists (select 1 from public.students s where s.id = p_student and s.school_id = v_school) then
    raise exception 'fees_student_not_found' using errcode = 'P0002';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'fees_amount_invalid' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('cash', 'cheque', 'transfer') then
    raise exception 'fees_method_invalid' using errcode = '22023';
  end if;
  if p_method = 'cheque' and (v_bank is null or v_ref is null) then
    raise exception 'fees_cheque_details_required' using errcode = '22023';
  end if;
  if p_method = 'cash' then
    v_bank := null; v_ref := null;
  end if;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < v_today - 7 then
    raise exception 'fees_paid_on_invalid' using errcode = '22023';
  end if;

  -- One writer at a time per student (payments, refreshes).
  perform pg_advisory_xact_lock(hashtextextended('fees:' || p_student::text, 0));

  create temporary table if not exists pg_temp.fee_open (
    charge_id uuid primary key, balance bigint, ord integer
  ) on commit drop;
  truncate pg_temp.fee_open;
  insert into pg_temp.fee_open (charge_id, balance, ord)
  select c.id, c.net_centimes - private.fee_charge_paid(c.id),
         row_number() over (order by c.due_on, case c.kind when 'registration' then 0 when 'tuition' then 1 else 2 end,
                                     c.month nulls first, c.service_id, c.id)::integer
  from public.student_charges c
  where c.academic_year_id = p_year and c.student_id = p_student and c.school_id = v_school
    and c.cancelled_at is null
    and c.net_centimes - private.fee_charge_paid(c.id) > 0;

  select coalesce(sum(balance), 0) into v_open from pg_temp.fee_open;
  if v_open = 0 then
    raise exception 'fees_nothing_due' using errcode = 'P0001';
  end if;
  if p_amount > v_open then
    raise exception 'fees_amount_above_balance' using errcode = 'P0001';
  end if;

  -- The staff's own list: this student's open charges, each amount ≤ its balance, total = the amount.
  if p_allocations is not null then
    if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0
       or jsonb_array_length(p_allocations) > 100
       or (select count(distinct a ->> 'charge_id') from jsonb_array_elements(p_allocations) a)
          <> jsonb_array_length(p_allocations) then
      raise exception 'fees_allocation_invalid' using errcode = '22023';
    end if;
    begin
      create temporary table if not exists pg_temp.fee_pick (charge_id uuid primary key, amount bigint) on commit drop;
      truncate pg_temp.fee_pick;
      insert into pg_temp.fee_pick (charge_id, amount)
      select (a ->> 'charge_id')::uuid, (a ->> 'amount_centimes')::bigint
      from jsonb_array_elements(p_allocations) a;
    exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
      raise exception 'fees_allocation_invalid' using errcode = '22023';
    end;
    if exists (select 1 from pg_temp.fee_pick k
               left join pg_temp.fee_open o on o.charge_id = k.charge_id
               where k.amount is null or k.amount < 1 or o.charge_id is null or k.amount > o.balance) then
      raise exception 'fees_allocation_invalid' using errcode = '22023';
    end if;
    if (select sum(amount) from pg_temp.fee_pick) <> p_amount then
      raise exception 'fees_allocation_total_mismatch' using errcode = '22023';
    end if;
  end if;

  -- The receipt number: the counter row is locked until this transaction ends.
  insert into public.receipt_counters as rc (school_id, academic_year_id, last_no)
  values (v_school, p_year, 1)
  on conflict (academic_year_id) do update set last_no = rc.last_no + 1, updated_at = now()
  returning rc.last_no into v_no;
  select coalesce(f.receipt_prefix || '-', '') || btrim(y.label) || '/' || lpad(v_no::text, 6, '0')
    into v_label
  from public.academic_years y
  left join public.fee_years f on f.academic_year_id = y.id
  where y.id = p_year;

  insert into public.payments
    (school_id, academic_year_id, student_id, receipt_no, receipt_label, amount_centimes, method, bank, reference,
     cheque_date, payer_name, note, paid_on, idempotency_key, received_by)
  values
    (v_school, p_year, p_student, v_no, v_label, p_amount, p_method, v_bank, v_ref,
     case when p_method = 'cheque' then p_cheque_date end, v_payer, v_note, p_paid_on, p_idempotency_key, auth.uid())
  returning id into v_payment;

  if p_allocations is not null then
    insert into public.payment_allocations (school_id, payment_id, charge_id, amount_centimes)
    select v_school, v_payment, k.charge_id, k.amount from pg_temp.fee_pick k;
  else
    -- Oldest due first; what is left goes to the next charges in order.
    v_left := p_amount;
    for c in select o.charge_id, o.balance from pg_temp.fee_open o order by o.ord loop
      exit when v_left = 0;
      v_take := least(v_left, c.balance);
      insert into public.payment_allocations (school_id, payment_id, charge_id, amount_centimes)
      values (v_school, v_payment, c.charge_id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;

  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
  values (v_school, auth.uid(), 'fee_payment.record', 'payment', v_payment::text,
          jsonb_build_object('student_id', p_student, 'academic_year_id', p_year, 'receipt', v_label,
                             'amount_centimes', p_amount, 'method', p_method, 'paid_on', p_paid_on,
                             'picked', p_allocations is not null));

  return query select v_payment, v_no, v_label, false;
end;
$$;
revoke all on function public.record_payment(uuid, uuid, bigint, text, date, uuid, text, text, date, text, text, jsonb) from public, anon;
grant execute on function public.record_payment(uuid, uuid, bigint, text, date, uuid, text, text, date, text, text, jsonb) to authenticated;

-- ===========================================================================
-- cancel_payment (fees.cancel: director by default)
-- ===========================================================================
create function public.cancel_payment(p_payment uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid := private.fees_require('fees.cancel', null);
  v_student uuid;
  v_payment public.payments;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_reason is null or p_reason not in ('bounced_cheque', 'entry_error', 'refund', 'other') then
    raise exception 'fees_cancel_reason_invalid' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'fees_cancel_note_required' using errcode = '22023';
  end if;
  if length(v_note) > 200 then
    raise exception 'fees_cancel_note_too_long' using errcode = '22023';
  end if;

  -- The student, for the per-student lock (same lock as payments and refreshes) ...
  select p.student_id into v_student from public.payments p
   where p.id = p_payment and p.school_id = v_school;
  if v_student is null then
    raise exception 'fees_payment_not_found' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fees:' || v_student::text, 0));
  -- ... then the payment read again, locked, and only now its state checked.
  select * into v_payment from public.payments p
   where p.id = p_payment and p.school_id = v_school
   for update;
  if v_payment.cancelled_at is not null then
    raise exception 'fees_payment_cancelled' using errcode = 'P0001';
  end if;

  update public.payments
     set cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = p_reason, cancel_note = v_note
   where id = v_payment.id;

  insert into public.audit_logs (school_id, actor_id, action, entity, entity_id, data)
  values (v_school, auth.uid(), 'fee_payment.cancel', 'payment', v_payment.id::text,
          jsonb_build_object('student_id', v_payment.student_id, 'academic_year_id', v_payment.academic_year_id,
                             'receipt', v_payment.receipt_label, 'amount_centimes', v_payment.amount_centimes,
                             'reason', p_reason, 'note', v_note));
end;
$$;
revoke all on function public.cancel_payment(uuid, text, text) from public, anon;
grant execute on function public.cancel_payment(uuid, text, text) to authenticated;

-- ===========================================================================
-- Demo school (body of 20261030041901_phase13_charges): payments purged first
-- (tasyir.fees_purge for this transaction only), then the counters.
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
revoke all on function private.reset_demo_school(uuid) from public, anon, authenticated;
