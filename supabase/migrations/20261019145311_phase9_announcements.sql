-- Phase 9 step 1 — announcements in the database (no screen yet).
--
-- An ANNOUNCEMENT = a title + a text from the school to a group of people:
--   - scope 'school'  → the whole school;
--   - scope 'levels'  → the parents of the students of one or more levels
--                       (this year's classes of those levels);
--   - scope 'classes' → the parents of the students of one or more classes.
--   audience 'parents' (any scope), 'staff' or 'everyone' (school scope only:
--   staff = every account of the school that is not a parent / student).
-- Classes and levels are resolved with the CURRENT year when it is posted
-- (stored on the row): a level means its classes of that year.
--
-- Who posts: announcements.manage (messaging module; director + surveillant,
-- the director can change it) — any scope / audience; a teacher — to the
-- parents of classes they teach this year (lesson in the timetable). Authors
-- edit the title / text of their own; manage edits / deletes any. Who an
-- announcement goes to never changes after it is posted (delete + post again).
--
-- Posting = public.create_announcement() (SECURITY INVOKER: the RLS below
-- decides), announcement + targets in one transaction. At COMMIT a deferred
-- trigger checks the targets match the scope and tells every reader with an
-- in-app notification 'announcement' (data: announcement_id, title) — not the
-- author. Who is told and who may read is the SAME function
-- (private.announcement_audience). Edited title → the notifications follow;
-- deleted announcement → its notifications go.

-- ===========================================================================
-- Permission
-- ===========================================================================
insert into public.permissions (key, module_key) values ('announcements.manage', 'messaging');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'announcements.manage'
from public.roles r
where r.key in ('director', 'surveillant') and r.is_system;

-- ===========================================================================
-- announcements
-- ===========================================================================
create table public.announcements (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  scope             text not null,
  audience          text not null,
  academic_year_id  uuid,                 -- set by the trigger (levels / classes)
  title             text not null,
  body              text not null,
  created_by        uuid not null,
  created_at        timestamptz not null default now(),
  updated_by        uuid,
  updated_at        timestamptz,

  constraint announcements_scope_check check (scope in ('school', 'levels', 'classes')),
  constraint announcements_audience_check check (audience in ('parents', 'staff', 'everyone')),
  constraint announcements_staff_school_check check (audience = 'parents' or scope = 'school'),
  constraint announcements_year_check check (scope = 'school' or academic_year_id is not null),
  constraint announcements_title_check check (title = btrim(title) and char_length(title) between 1 and 150),
  constraint announcements_body_check check (char_length(btrim(body)) between 1 and 5000),
  constraint announcements_id_year_school_key unique (id, academic_year_id, school_id),
  constraint announcements_year_fkey foreign key (academic_year_id, school_id)
    references public.academic_years (id, school_id) on delete cascade,
  constraint announcements_author_fkey foreign key (created_by, school_id)
    references public.profiles (id, school_id) on delete cascade,
  constraint announcements_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index announcements_school_idx on public.announcements (school_id, created_at desc);
create index announcements_author_idx on public.announcements (created_by);
create index announcements_year_idx on public.announcements (academic_year_id);
create index announcements_updated_by_idx on public.announcements (updated_by);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;

-- ===========================================================================
-- announcement_targets: the levels or classes (one of the two per row).
-- ===========================================================================
create table public.announcement_targets (
  id                uuid primary key default gen_random_uuid(),
  announcement_id   uuid not null,
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,        -- set by the trigger (the announcement's)
  level_id          uuid,
  class_id          uuid,

  constraint announcement_targets_one_check check ((level_id is null) <> (class_id is null)),
  constraint announcement_targets_announcement_fkey foreign key (announcement_id, academic_year_id, school_id)
    references public.announcements (id, academic_year_id, school_id) on delete cascade,
  constraint announcement_targets_level_fkey foreign key (level_id, school_id)
    references public.levels (id, school_id) on delete cascade,
  constraint announcement_targets_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id) on delete cascade,
  constraint announcement_targets_level_key unique (announcement_id, level_id),
  constraint announcement_targets_class_key unique (announcement_id, class_id)
);

create index announcement_targets_school_idx on public.announcement_targets (school_id);
create index announcement_targets_level_idx on public.announcement_targets (level_id);
create index announcement_targets_class_idx on public.announcement_targets (class_id);
create index announcement_targets_announcement_fk_idx
  on public.announcement_targets (announcement_id, academic_year_id, school_id);

alter table public.announcement_targets enable row level security;
revoke all on public.announcement_targets from anon, authenticated;

-- ===========================================================================
-- notifications: new type 'announcement'.
-- ===========================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                  'subscription_expiring', 'announcement'));

create index notifications_announcement_idx on public.notifications ((data ->> 'announcement_id'))
  where type = 'announcement';

-- ===========================================================================
-- Helpers.
-- ===========================================================================

-- Is this profile one the announcement is for? (school active, messaging on,
-- account active with its own password). Internal: callers use the wrappers.
create function private.announcement_audience(p_announcement uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.announcements a
    join public.schools s on s.id = a.school_id and s.status = 'active'
    join public.profiles p on p.id = p_profile and p.school_id = a.school_id
    join public.roles r on r.id = p.role_id and r.school_id = a.school_id
    where a.id = p_announcement
      and p.deactivated_at is null
      and p.must_change_password = false
      and private.school_has_module(a.school_id, 'messaging')
      and (
        (r.key not in ('parent', 'student') and a.audience in ('staff', 'everyone'))
        or (r.key = 'parent' and a.audience in ('parents', 'everyone') and (
              a.scope = 'school'
              or exists (
                select 1
                from public.guardians g
                join public.student_guardians sg on sg.guardian_id = g.id and sg.school_id = g.school_id
                join public.student_enrollments e on e.student_id = sg.student_id
                                                 and e.academic_year_id = a.academic_year_id
                join public.classes c on c.id = e.class_id
                join public.announcement_targets t on t.announcement_id = a.id
                                                  and (t.class_id = c.id or t.level_id = c.level_id)
                where g.profile_id = p.id and g.school_id = a.school_id)))
      )
  );
$$;

revoke all on function private.announcement_audience(uuid, uuid) from public, anon, authenticated;

-- For policies: is the signed-in user one the announcement is for?
create function private.is_announcement_reader(p_announcement uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.announcement_audience(p_announcement, auth.uid());
$$;

revoke all on function private.is_announcement_reader(uuid) from public, anon;
grant execute on function private.is_announcement_reader(uuid) to authenticated;

-- Does the signed-in teacher teach this class (a lesson of it, current year)?
create function private.teaches_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    join public.academic_years y on y.id = l.academic_year_id and y.is_current
    join public.profiles p on p.id = l.teacher_id and p.school_id = l.school_id
    join public.roles r on r.id = p.role_id and r.key = 'teacher'
    where l.class_id = p_class
      and l.teacher_id = auth.uid()
      and p.deactivated_at is null
  );
$$;

revoke all on function private.teaches_class(uuid) from public, anon;
grant execute on function private.teaches_class(uuid) to authenticated;

-- ===========================================================================
-- Triggers.
-- ===========================================================================

-- Before insert: author, time, year (current one for levels / classes).
create function private.announcements_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.updated_by := null;
  new.updated_at := null;
  new.title := btrim(new.title);
  if new.scope = 'school' then
    new.academic_year_id := null;
  else
    select y.id into new.academic_year_id
    from public.academic_years y
    where y.school_id = new.school_id and y.is_current;
    if new.academic_year_id is null then
      raise exception 'announcement_no_current_year' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger announcements_before_insert
  before insert on public.announcements
  for each row execute function private.announcements_before_insert();

-- Before update (only title / body are granted): who and when.
create function private.announcements_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.title := btrim(new.title);
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create trigger announcements_before_update
  before update on public.announcements
  for each row execute function private.announcements_before_update();

-- Targets: the announcement's year + school; only in the transaction that
-- posted it (who it goes to never changes afterwards).
create function private.announcement_targets_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a public.announcements;
begin
  select * into v_a from public.announcements a where a.id = new.announcement_id;
  if not found or v_a.school_id <> new.school_id then
    raise exception 'announcement_not_found' using errcode = 'P0001';
  end if;
  if v_a.created_at <> now() then   -- now() = start of this transaction
    raise exception 'announcement_targets_locked' using errcode = 'P0001';
  end if;
  new.academic_year_id := v_a.academic_year_id;
  return new;
end;
$$;

create trigger announcement_targets_before_insert
  before insert on public.announcement_targets
  for each row execute function private.announcement_targets_before_insert();

-- At commit: targets match the scope, then tell every reader (not the author).
create function private.announcements_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a       public.announcements;
  v_levels  int;
  v_classes int;
begin
  select * into v_a from public.announcements a where a.id = new.id;
  if not found then
    return null;               -- deleted again in the same transaction
  end if;

  select count(t.level_id), count(t.class_id) into v_levels, v_classes
  from public.announcement_targets t where t.announcement_id = v_a.id;

  if (v_a.scope = 'school' and v_levels + v_classes > 0)
     or (v_a.scope = 'levels' and (v_levels = 0 or v_classes > 0))
     or (v_a.scope = 'classes' and (v_classes = 0 or v_levels > 0)) then
    raise exception 'announcement_targets_invalid' using errcode = '23514';
  end if;

  insert into public.notifications (school_id, recipient_id, type, data)
  select v_a.school_id, p.id, 'announcement',
         jsonb_build_object('announcement_id', v_a.id, 'title', v_a.title)
  from public.profiles p
  where p.school_id = v_a.school_id
    and p.id <> v_a.created_by
    and private.announcement_audience(v_a.id, p.id);
  return null;
end;
$$;

create constraint trigger announcements_publish
  after insert on public.announcements
  deferrable initially deferred
  for each row execute function private.announcements_publish();

-- Title edited → the notifications show the new one.
create function private.announcements_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    update public.notifications n
       set data = n.data || jsonb_build_object('title', new.title)
     where n.type = 'announcement' and n.data ->> 'announcement_id' = new.id::text;
  end if;
  return null;
end;
$$;

create trigger announcements_after_update
  after update of title on public.announcements
  for each row execute function private.announcements_after_update();

-- Deleted → its notifications go too.
create function private.announcements_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.type = 'announcement' and n.data ->> 'announcement_id' = old.id::text;
  return null;
end;
$$;

create trigger announcements_after_delete
  after delete on public.announcements
  for each row execute function private.announcements_after_delete();

-- ===========================================================================
-- Grants + RLS.
-- ===========================================================================
grant select, delete on public.announcements to authenticated;
grant insert (school_id, scope, audience, title, body) on public.announcements to authenticated;
grant update (title, body) on public.announcements to authenticated;

grant select on public.announcement_targets to authenticated;
grant insert (announcement_id, school_id, level_id, class_id) on public.announcement_targets to authenticated;

-- Read: the author, announcements.manage, or someone it is for.
create policy announcements_select on public.announcements
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and (created_by = (select auth.uid())
              or (select private.has_permission('announcements.manage'))
              or private.is_announcement_reader(id)));

-- Post: announcements.manage anything; a teacher to the parents of classes.
create policy announcements_insert on public.announcements
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('messaging'))
              and created_by = (select auth.uid())
              and ((select private.has_permission('announcements.manage'))
                   or ((select private.is_teacher_profile(auth.uid(), private.current_school_id()))
                       and audience = 'parents' and scope = 'classes')));

-- Edit / delete: your own, or any with announcements.manage.
create policy announcements_update on public.announcements
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and (created_by = (select auth.uid())
              or (select private.has_permission('announcements.manage'))))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('messaging'))
              and (created_by = (select auth.uid())
                   or (select private.has_permission('announcements.manage'))));

create policy announcements_delete on public.announcements
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('messaging'))
         and (created_by = (select auth.uid())
              or (select private.has_permission('announcements.manage'))));

-- Targets: read with the announcement; added by its author (manage: any level
-- or class; a teacher: only classes they teach).
create policy announcement_targets_select on public.announcement_targets
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and exists (select 1 from public.announcements a where a.id = announcement_id));

create policy announcement_targets_insert on public.announcement_targets
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and exists (select 1 from public.announcements a
                          where a.id = announcement_id and a.created_by = (select auth.uid()))
              and ((select private.has_permission('announcements.manage'))
                   or (class_id is not null and private.teaches_class(class_id))));

-- ===========================================================================
-- Posting in one call (SECURITY INVOKER: the policies above apply).
-- ===========================================================================
create function public.create_announcement(
  p_scope text,
  p_audience text,
  p_title text,
  p_body text,
  p_level_ids uuid[] default '{}',
  p_class_ids uuid[] default '{}')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_id     uuid;
begin
  insert into public.announcements (school_id, scope, audience, title, body)
  values (v_school, p_scope, p_audience, p_title, p_body)
  returning id into v_id;

  insert into public.announcement_targets (announcement_id, school_id, level_id)
  select distinct v_id, v_school, x from unnest(coalesce(p_level_ids, '{}')) x;

  insert into public.announcement_targets (announcement_id, school_id, class_id)
  select distinct v_id, v_school, x from unnest(coalesce(p_class_ids, '{}')) x;

  return v_id;
end;
$$;

revoke all on function public.create_announcement(text, text, text, text, uuid[], uuid[]) from public, anon;
grant execute on function public.create_announcement(text, text, text, text, uuid[], uuid[]) to authenticated;
