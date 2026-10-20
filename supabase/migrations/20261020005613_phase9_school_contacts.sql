-- Phase 9 step 4 — the school's contact card (phone + WhatsApp) shown to parents.
--
-- One row per school, created with the school (and now for every existing
-- school); the director fills it in the school settings, nobody adds or
-- deletes rows through the API. Both numbers are optional: none set → the
-- parent portal shows no card.
--
--   phone    — any Moroccan number, landline (05) or mobile (06 / 07),
--              stored as +212XXXXXXXXX
--   whatsapp — a Moroccan mobile (06 / 07), stored as +2126… / +2127…
--
-- In every plan (no module): a parent must always be able to reach the school.
-- Read: every active account of the school (parents, staff, …).
-- Change: settings.manage (system permission of the director role, unused so far).
--
-- The row starts with the phone the platform owner entered for the school
-- (schools.phone) when it reads as a Moroccan number; the director can change
-- or clear it. schools.phone itself stays the platform's own record.

-- ===========================================================================
-- school_contacts
-- ===========================================================================

create table public.school_contacts (
  school_id   uuid primary key references public.schools (id) on delete cascade,
  phone       text,
  whatsapp    text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  constraint school_contacts_phone_check
    check (phone is null or phone ~ '^\+212[5-7][0-9]{8}$'),
  constraint school_contacts_whatsapp_check
    check (whatsapp is null or whatsapp ~ '^\+212[67][0-9]{8}$')
);

alter table public.school_contacts enable row level security;

-- Read + change the two numbers only; never the school.
revoke all on public.school_contacts from anon, authenticated;
grant select on public.school_contacts to authenticated;
grant update (phone, whatsapp) on public.school_contacts to authenticated;

create policy school_contacts_select on public.school_contacts
  for select to authenticated
  using (school_id = (select private.current_school_id()));

create policy school_contacts_update on public.school_contacts
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_permission('settings.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_permission('settings.manage')));

-- Who changed it last, and when.
create function private.school_contacts_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger school_contacts_touch
  before update on public.school_contacts
  for each row execute function private.school_contacts_touch();

-- ===========================================================================
-- One row per school: every new school, and every school that exists now.
-- ===========================================================================

-- "0537 12 34 56", "+212 6 12 34 56 78", "00212…" → "+212537123456"; else null.
create function private.moroccan_phone(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^(00212|212|0)[5-7][0-9]{8}$'
      then '+212' || right(d, 9)
  end
  from (select regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g') as d) x;
$$;

revoke all on function private.moroccan_phone(text) from public, anon, authenticated;

create function private.schools_seed_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.school_contacts (school_id, phone)
  values (new.id, private.moroccan_phone(new.phone))
  on conflict (school_id) do nothing;
  return new;
end;
$$;

create trigger schools_seed_contact
  after insert on public.schools
  for each row execute function private.schools_seed_contact();

insert into public.school_contacts (school_id, phone)
select s.id, private.moroccan_phone(s.phone) from public.schools s
on conflict (school_id) do nothing;
