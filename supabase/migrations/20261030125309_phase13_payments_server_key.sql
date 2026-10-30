-- Phase 13 step 4, follow-up: the server key's role (service_role) gets Supabase's
-- default ALL on every new table, payments included. The guard triggers stop
-- its UPDATE / DELETE, but TRUNCATE fires no row trigger. Payments, their
-- allocations and the receipt counters are written only by the SECURITY
-- DEFINER functions (they run as the owner): service_role keeps SELECT only.
revoke all on public.payments, public.payment_allocations, public.receipt_counters from service_role;
grant select on public.payments, public.payment_allocations, public.receipt_counters to service_role;
