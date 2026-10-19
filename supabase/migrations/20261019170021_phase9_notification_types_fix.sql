-- Fix for phase9_announcements: its new notifications_type_check was copied
-- from the Phase 8 list and dropped 'demo_request' (public home page), so every
-- demo request was refused (its AFTER INSERT notification failed the check).
-- Same list as before + 'announcement'. notifications_platform_check was not
-- touched by phase9_announcements and still allows 'demo_request'.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                  'subscription_expiring', 'demo_request', 'announcement'));
