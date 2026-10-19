-- Phase 8 step 2 — live bell: send changes of `notifications` over Realtime.
--
-- Realtime applies the table's RLS policies to every change before sending it:
-- a signed-in user is only ever sent rows of their own (recipient_id = their
-- id, own school), the same rows `notifications_select` lets them read. Nothing
-- changes in grants or policies.
alter publication supabase_realtime add table public.notifications;
