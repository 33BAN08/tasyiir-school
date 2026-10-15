-- Phase 5 step 1 fix — Arabic names: both or neither, really.
-- The first version let ONE Arabic name through: with last_name_ar null,
-- "last_name_ar = btrim(last_name_ar)" is NULL, and a CHECK accepts NULL.
-- Same rule, with explicit "is not null". No real school has students yet;
-- re-adding the constraint checks every existing row anyway.
alter table public.students drop constraint students_names_ar_check;

alter table public.students add constraint students_names_ar_check check (
  (first_name_ar is null and last_name_ar is null)
  or (    first_name_ar is not null and last_name_ar is not null
      and first_name_ar = btrim(first_name_ar) and char_length(first_name_ar) between 1 and 60
      and last_name_ar  = btrim(last_name_ar)  and char_length(last_name_ar)  between 1 and 60));
