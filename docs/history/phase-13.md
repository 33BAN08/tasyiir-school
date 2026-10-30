# Phase 13 — Fees + payments + receipts

Started 2026-10-30, built **before Phase 12** (user, 2026-10-30: PLAN numbering kept). No online payment.

## Decisions (user, 2026-10-30)
- Module key: the existing **`fees`** (already in the Premium plan, labels, home page card). Permissions **`fees.view`**, **`fees.manage`**, **`fees.cancel`**.
- Roles by default: director = view + manage + cancel; accountant = view + manage (no cancel); every other role nothing (the director can grant `fees.view` in Rôles). Parents: own children only, through RPCs that check `private.is_guardian_of_student()`; no direct table policy. Students: nothing.
- **Discounts are director-only** (`fees.cancel` to insert / update / delete; `fees.view` reads) and every discount change is written to `audit_logs` (trigger).
- Amounts in integer **centimes** (`bigint`). Percent discounts rounded to the **whole dirham**. Percents first, then fixed amounts, never below 0. A fixed discount comes off **each** charge it applies to: the UI says **"par mois" / "شهريا"** next to a fixed amount.
- Billing months editable per year, default September → June; due day default 5. One price per service (per route later, with Transport).
- Sibling discount set by hand (a "siblings found" hint from shared guardians in the UI).
- One receipt per student. Receipt numbers per **school year**, gapless, per school. Receipts never deleted, only cancelled with a fixed reason code (`bounced_cheque` / `entry_error` / `refund` / `other`) + text, who and when; no "bounced" state yet. Cancelling a payment returns its allocated amounts to unpaid.
- Payment above the whole year's balance refused; paying ahead allowed.
- `record_payment` takes a client **idempotency key** (unique per school): a double click never creates two payments. `paid_on` between today − 7 days and today (Africa/Casablanca, from the database), never in the future.
- `cancel_charge` needs `fees.cancel`. No UPDATE / DELETE grant on `payments` / `payment_allocations` for anyone.
- Every SECURITY DEFINER RPC: `set search_path = ''`, checks school + permission + module first.
- Receipt: amount in words FR + AR; reprints say **DUPLICATA**; cancelled receipts print with an "ANNULÉ / ملغى" band.
- Reminders: a manual button + an optional monthly rule; the push text shows no amount.

## Step 1 — fee setup in the DB (2026-10-30)
Migration `phase13_fee_setup` (DEV `20261030023556`; production: to push by the user).
- `fee_years` (PK `academic_year_id`): `billing_months date[]` (1st of month, inside the year, stored sorted, no duplicates — trigger, error `fees_billing_months_invalid`), `due_day` 1–28. No row = defaults: `public.fee_year_rules(year)` (security invoker; returns nothing without module + `fees.view`).
- `fee_plans` unique (year, level): `registration_centimes`, `monthly_centimes` (0 – 10 000 000).
- `fee_services` unique (year, name): `name`, `name_ar`, `monthly_centimes`, `active`, `position`.
- `student_services`: `from_month`, `to_month` (NULL = to year end); student enrolled that year (`fees_student_not_enrolled`), months inside the year (`fees_month_outside_year`), no overlap per student + service (`student_services_no_overlap`, 23P01), service of the same year (composite FK).
- `student_discounts` unique (year, student, kind): kind `sibling | scholarship | fixed`, exactly one of `percent_bp` (1–10000) / `amount_centimes`; kind fixed = amount; `applies_to registration | tuition | services | all`; `reason` ≤ 200; `created_by` / `updated_by` by trigger. Audit actions `fee_discount.insert | update | delete`, entity `student_discount`, data `{student_id, academic_year_id, kind, old, new}`; a no-change save logs nothing; a cascade delete (school / student / year being deleted) logs nothing.
- Policies: school + `has_module('fees')` + `fees.view` (select) / `fees.manage` (writes) / `fees.cancel` (discount writes). Column-limited insert / update grants.
- `reset_demo_school`: the five tables deleted after `grades`, before `lessons` (body otherwise identical to `demo_grades`).
- Permission labels `permissions.fees.{view,manage,cancel}` in ar / fr / en. (Found on the way, not fixed: `attendance.*`, `announcements.*`, `grades.*` have no labels and show their raw key in the roles editor.)
- Tests: `scripts/rls/phase13-fee-setup.mjs` (163 checks; in `run.mjs`). Creates its own accountant, parent and student accounts; turns the `fees` module on for A and B through `school_modules` and removes the overrides at the end.
