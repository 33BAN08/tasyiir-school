-- Phase 1 — reference data: modules, plans, permissions, system template roles.

insert into public.modules (key, sort_order) values
  ('attendance', 1), ('timetable', 2), ('messaging', 3),
  ('grades', 4), ('alerts', 5), ('massar', 6),
  ('fees', 7), ('transport', 8);

-- Prices are placeholders (0) — set real prices in Phase 2.
insert into public.plans (key, name) values
  ('basic', 'Basic'), ('pro', 'Pro'), ('premium', 'Premium');

insert into public.plan_modules (plan_id, module_key)
select p.id, m.key
from public.plans p
join public.modules m on
     (p.key = 'basic'   and m.key in ('attendance', 'timetable', 'messaging'))
  or (p.key = 'pro'     and m.key in ('attendance', 'timetable', 'messaging', 'grades', 'alerts', 'massar'))
  or (p.key = 'premium');

-- Core permissions. Each later phase adds its own keys in its migration.
insert into public.permissions (key) values
  ('users.view'), ('users.manage'), ('roles.manage'),
  ('settings.manage'), ('audit.view');

-- System template roles (school_id null). Copied into every new school.
insert into public.roles (school_id, key, name, is_system) values
  (null, 'platform_owner',    'Platform owner',    true),
  (null, 'director',          'Directeur',         true),
  (null, 'surveillant',       'Surveillant',       true),
  (null, 'accountant',        'Comptable',         true),
  (null, 'transport_manager', 'Responsable transport', true),
  (null, 'teacher',           'Enseignant',        true),
  (null, 'parent',            'Parent',            true),
  (null, 'student',           'Élève',             true),
  (null, 'driver',            'Chauffeur',         true);

-- Director template gets every core permission.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r cross join public.permissions p
where r.school_id is null and r.key = 'director';
