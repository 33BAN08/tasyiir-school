-- The demo school: fees module on, and the Madar name.
--
-- The demo stays on the Pro plan (no fees, which comes with Premium); a
-- school_modules override turns the fees module on for it. reset_demo_school
-- keeps school_modules (and role_permissions: the director already holds
-- fees.view / fees.manage / fees.cancel), so the nightly reset never undoes it.
-- Demo schools are found by their flag, never by id: the same file runs on DEV
-- and production, and running it twice changes nothing more.
-- The slug (ecole-demo-tasyir) and the demo e-mails (@demo.tasyir.ma) stay as
-- they are for now. seed-demo-school.mjs writes the same name and override.

insert into public.school_modules (school_id, module_key, enabled)
select s.id, 'fees', true
from public.schools s
where s.is_demo
on conflict (school_id, module_key) do update set enabled = true;

update public.schools
   set name = 'École Démo Madar'
 where is_demo
   and name = 'École Démo Tasyir';
