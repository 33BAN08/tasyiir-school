-- Phase 11 step 7 — publishing grades to parents.
--
-- Parents never read `grades` (step 3). They read REPORT CARDS: a snapshot of
-- public.class_averages() taken when the director publishes a class for a
-- semester (or for the year), so what parents see never moves while the
-- school keeps working, and is exactly what the staff screens showed.
--
-- grade_publications = one per class + semester (period_id NULL = the year),
--   who published it and when, and `show_rank` (false = no rank on the cards).
--   Publishing again (after unlock → change → lock) replaces the snapshot.
-- report_cards = one per student of the class in a publication: scale,
--   general average, rank, ranked, missing, class average / min / max, and
--   `subjects` (jsonb, report card order): name, colour, coefficient,
--   average, rank, class figures, the semester's marks (semester card) or
--   each semester's average (year card); `periods` (year card) = each
--   semester's general average + rank. Subject names are copied: renaming a
--   subject later does not change a published card.
--
-- Rules:
--   publish_grades(class, period, show_rank) — grades.manage, grades module;
--     the semester must be LOCKED (publish_period_not_locked); the year needs
--     every semester locked (publish_periods_not_locked). One transaction:
--     publication upserted, cards rebuilt, parents notified.
--   unpublish_grades(publication) — grades.manage: cards and their
--     notifications go.
--   Both SECURITY DEFINER (nobody writes these tables directly: no insert /
--   update / delete grant); the permission checks are inside.
-- Notifications: `grades_published` to each parent account of each student
--   (same accounts as remarks), data = publication_id, period_number (NULL =
--   the year), republished. Publishing again replaces the earlier ones.
--   Push: new parent switch push_preferences.grades (default on).
-- Reads: grades.view / grades.manage the school's cards; a parent their
--   children's cards (and those publications); nobody else. Module off =
--   nothing readable.

-- ===========================================================================
-- grade_publications
-- ===========================================================================
create table public.grade_publications (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  academic_year_id    uuid not null,
  class_id            uuid not null,
  period_id           uuid,                  -- NULL = the year
  show_rank           boolean not null default true,
  first_published_at  timestamptz not null default now(),
  published_at        timestamptz not null default now(),
  published_by        uuid,

  constraint grade_publications_key unique nulls not distinct (class_id, period_id),
  constraint grade_publications_id_school_key unique (id, school_id),
  constraint grade_publications_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id) on delete cascade,
  constraint grade_publications_period_fkey foreign key (period_id, academic_year_id, school_id)
    references public.grading_periods (id, academic_year_id, school_id) on delete cascade,
  constraint grade_publications_published_by_fkey foreign key (published_by)
    references public.profiles (id) on delete set null
);

create index grade_publications_school_idx on public.grade_publications (school_id);
create index grade_publications_year_idx on public.grade_publications (academic_year_id, school_id);
create index grade_publications_period_idx on public.grade_publications (period_id, academic_year_id, school_id);
create index grade_publications_published_by_idx on public.grade_publications (published_by);

alter table public.grade_publications enable row level security;
revoke all on public.grade_publications from anon, authenticated;

-- ===========================================================================
-- report_cards
-- ===========================================================================
create table public.report_cards (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  publication_id    uuid not null,
  student_id        uuid not null,
  scale             smallint not null,
  average           numeric(5, 2),
  rank              integer,
  ranked            integer,
  missing           integer not null default 0,
  class_average     numeric(5, 2),
  class_min         numeric(5, 2),
  class_max         numeric(5, 2),
  subjects          jsonb not null default '[]',
  periods           jsonb not null default '[]',
  created_at        timestamptz not null default now(),

  constraint report_cards_key unique (publication_id, student_id),
  constraint report_cards_subjects_check check (jsonb_typeof(subjects) = 'array'),
  constraint report_cards_periods_check check (jsonb_typeof(periods) = 'array'),
  constraint report_cards_publication_fkey foreign key (publication_id, school_id)
    references public.grade_publications (id, school_id) on delete cascade,
  constraint report_cards_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade
);

create index report_cards_school_idx on public.report_cards (school_id);
create index report_cards_student_idx on public.report_cards (student_id, school_id);
create index report_cards_publication_idx on public.report_cards (publication_id, school_id);

alter table public.report_cards enable row level security;
revoke all on public.report_cards from anon, authenticated;

grant select on public.grade_publications to authenticated;
grant select on public.report_cards to authenticated;

create policy report_cards_select on public.report_cards
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.view'))
              or (select private.has_permission('grades.manage'))
              or private.is_guardian_of_student(student_id)));

-- A parent sees the publications their children have a card in.
create policy grade_publications_select on public.grade_publications
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.view'))
              or (select private.has_permission('grades.manage'))
              or exists (select 1 from public.report_cards rc
                          where rc.publication_id = grade_publications.id
                            and private.is_guardian_of_student(rc.student_id))));

-- ===========================================================================
-- Notifications: new type
-- (list copied from the database: pg_get_constraintdef, 2026-10-26)
-- ===========================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type = any (array['absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness',
                           'subscription_expiring', 'demo_request', 'announcement', 'remark',
                           'grades_published']));

-- ===========================================================================
-- Push: a "grades" switch for parents
-- ===========================================================================
alter table public.push_preferences add column grades boolean not null default true;

create or replace function private.push_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text := case
    when new.type in ('absence', 'absence_corrected', 'unjustified_absences', 'repeated_lateness') then 'absences'
    when new.type = 'remark' then 'remarks'
    when new.type = 'announcement' then 'announcements'
    when new.type = 'grades_published' then 'grades'
  end;
  v_on boolean;
begin
  if v_kind is null
     or not exists (select 1 from public.push_subscriptions s where s.profile_id = new.recipient_id) then
    return null;
  end if;

  select case v_kind when 'absences' then p.absences when 'remarks' then p.remarks
                     when 'grades' then p.grades else p.announcements end
    into v_on
  from public.push_preferences p
  where p.profile_id = new.recipient_id;

  if coalesce(v_on, true) then
    insert into public.push_outbox (notification_id, school_id) values (new.id, new.school_id);
  end if;
  return null;
end;
$$;

-- One more switch: p_grades NULL = unchanged (on for a new row), so the
-- three-switch call keeps working.
drop function public.save_push_preferences(boolean, boolean, boolean);

create function public.save_push_preferences(p_absences boolean, p_remarks boolean,
                                             p_announcements boolean, p_grades boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or not exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and r.key = 'parent' and p.deactivated_at is null
  ) then
    raise exception 'push preferences are for parents' using errcode = '42501', hint = 'push_not_parent';
  end if;
  if p_absences is null or p_remarks is null or p_announcements is null then
    raise exception 'every switch needs a value' using errcode = '22004';
  end if;

  insert into public.push_preferences (profile_id, school_id, absences, remarks, announcements, grades)
  values (auth.uid(), v_school, p_absences, p_remarks, p_announcements, coalesce(p_grades, true))
  on conflict (profile_id) do update
    set school_id = excluded.school_id,
        absences = excluded.absences,
        remarks = excluded.remarks,
        announcements = excluded.announcements,
        grades = coalesce(p_grades, public.push_preferences.grades),
        updated_at = now();
end;
$$;

revoke all on function public.save_push_preferences(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.save_push_preferences(boolean, boolean, boolean, boolean) to authenticated;

-- ===========================================================================
-- publish_grades(class, period | NULL = year, show_rank)
-- ===========================================================================
create function public.publish_grades(p_class uuid, p_period uuid, p_show_rank boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school  uuid := private.current_school_id();
  v_year    uuid;
  v_level   uuid;
  v_track   uuid;
  v_scale   smallint;
  v_number  smallint;
  v_pub     uuid;
  v_again   boolean;
  v_count   integer;
begin
  if v_school is null or not private.has_module('grades')
     or not private.has_permission('grades.manage') then
    raise exception 'publish_forbidden' using errcode = '42501';
  end if;
  if p_show_rank is null then
    raise exception 'publish_show_rank_null' using errcode = '22004';
  end if;

  select c.academic_year_id, c.level_id, c.track_id into v_year, v_level, v_track
  from public.classes c
  where c.id = p_class and c.school_id = v_school;
  if v_year is null then
    raise exception 'publish_class_not_found' using errcode = '23503';
  end if;

  if p_period is not null then
    select p.number into v_number
    from public.grading_periods p
    where p.id = p_period and p.academic_year_id = v_year and p.school_id = v_school;
    if v_number is null then
      raise exception 'publish_period_not_found' using errcode = '23503';
    end if;
    if exists (select 1 from public.grading_periods p where p.id = p_period and p.locked_at is null) then
      raise exception 'publish_period_not_locked' using errcode = 'P0001';
    end if;
  elsif not exists (select 1 from public.grading_periods p where p.academic_year_id = v_year)
     or exists (select 1 from public.grading_periods p
                 where p.academic_year_id = v_year and p.locked_at is null) then
    raise exception 'publish_periods_not_locked' using errcode = 'P0001';
  end if;

  select r.scale into v_scale from public.grade_level_rules(v_year) r where r.level_id = v_level;

  select g.id into v_pub
  from public.grade_publications g
  where g.class_id = p_class and g.period_id is not distinct from p_period;
  v_again := v_pub is not null;
  if v_again then
    update public.grade_publications
       set show_rank = p_show_rank, published_at = now(), published_by = auth.uid()
     where id = v_pub;
    delete from public.report_cards where publication_id = v_pub;
    delete from public.notifications n
     where n.school_id = v_school and n.type = 'grades_published'
       and n.data->>'publication_id' = v_pub::text;
  else
    insert into public.grade_publications
      (school_id, academic_year_id, class_id, period_id, show_rank, published_by)
    values (v_school, v_year, p_class, p_period, p_show_rank, auth.uid())
    returning id into v_pub;
  end if;

  insert into public.report_cards
    (school_id, publication_id, student_id, scale, average, rank, ranked, missing,
     class_average, class_min, class_max, subjects, periods)
  with a as (
    select * from public.class_averages(p_class)
  ),
  pos as (
    -- Report card order: the filière's row wins over the common one.
    select distinct on (c.subject_id) c.subject_id, c.position
    from public.subject_coefficients c
    where c.academic_year_id = v_year and c.level_id = v_level
      and (c.track_id is null or c.track_id = v_track)
    order by c.subject_id, c.track_id nulls last
  ),
  general as (
    select * from a where a.subject_id is null and a.period_id is not distinct from p_period
  )
  select v_school, v_pub, g.student_id, v_scale, g.average,
         case when p_show_rank then g.rank end,
         case when p_show_rank then g.ranked end,
         coalesce(g.missing, 0),
         g.class_average, g.class_min, g.class_max,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'subject_id', x.subject_id,
                    'name', s.name,
                    'color', s.color,
                    'coefficient', x.coefficient,
                    'average', x.average,
                    'rank', case when p_show_rank then x.rank end,
                    'class_average', x.class_average,
                    'class_min', x.class_min,
                    'class_max', x.class_max,
                    'marks', case when p_period is null then '[]'::jsonb else coalesce((
                       select jsonb_agg(jsonb_build_object('kind', m.kind, 'number', m.number,
                                                           'score', m.score, 'absent', m.absent)
                                        order by m.kind desc, m.number)
                       from public.grades m
                       where m.period_id = p_period and m.student_id = x.student_id
                         and m.subject_id = x.subject_id), '[]'::jsonb) end,
                    'periods', case when p_period is not null then '[]'::jsonb else coalesce((
                       select jsonb_agg(jsonb_build_object('number', gp.number, 'average', y.average)
                                        order by gp.number)
                       from a y
                       join public.grading_periods gp on gp.id = y.period_id
                       where y.student_id = x.student_id and y.subject_id = x.subject_id), '[]'::jsonb) end)
                  order by pos.position, s.name)
           from a x
           join public.subjects s on s.id = x.subject_id
           left join pos on pos.subject_id = x.subject_id
           where x.student_id = g.student_id and x.subject_id is not null
             and x.period_id is not distinct from p_period), '[]'::jsonb),
         case when p_period is not null then '[]'::jsonb else coalesce((
           select jsonb_agg(jsonb_build_object('number', gp.number, 'average', y.average,
                                               'rank', case when p_show_rank then y.rank end)
                            order by gp.number)
           from a y
           join public.grading_periods gp on gp.id = y.period_id
           where y.student_id = g.student_id and y.subject_id is null), '[]'::jsonb) end
  from general g;
  get diagnostics v_count = row_count;

  -- Every parent account of every student of the publication.
  insert into public.notifications (school_id, recipient_id, type, student_id, data)
  select v_school, p.id, 'grades_published', rc.student_id,
         jsonb_build_object('publication_id', v_pub, 'period_number', v_number, 'republished', v_again)
  from public.report_cards rc
  join public.schools sc on sc.id = rc.school_id and sc.status = 'active'
  join public.student_guardians sg on sg.student_id = rc.student_id and sg.school_id = rc.school_id
  join public.guardians gu on gu.id = sg.guardian_id and gu.school_id = rc.school_id
  join public.profiles p on p.id = gu.profile_id and p.school_id = rc.school_id
  join public.roles r on r.id = p.role_id and r.key = 'parent'
  where rc.publication_id = v_pub
    and p.deactivated_at is null
    and p.must_change_password = false;

  return v_count;
end;
$$;

revoke all on function public.publish_grades(uuid, uuid, boolean) from public, anon;
grant execute on function public.publish_grades(uuid, uuid, boolean) to authenticated;

-- ===========================================================================
-- unpublish_grades(publication)
-- ===========================================================================
create function public.unpublish_grades(p_publication uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
begin
  if v_school is null or not private.has_module('grades')
     or not private.has_permission('grades.manage') then
    raise exception 'publish_forbidden' using errcode = '42501';
  end if;
  delete from public.notifications n
   where n.school_id = v_school and n.type = 'grades_published'
     and n.data->>'publication_id' = p_publication::text;
  delete from public.grade_publications g where g.id = p_publication and g.school_id = v_school;
  if not found then
    raise exception 'publish_not_found' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.unpublish_grades(uuid) from public, anon;
grant execute on function public.unpublish_grades(uuid) to authenticated;

-- ===========================================================================
-- Demo school: publications and cards go with the nightly reset.
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
  delete from public.report_cards         where school_id = v_school;
  delete from public.grade_publications   where school_id = v_school;
  update public.grading_periods set locked_at = null
   where school_id = v_school and locked_at is not null;
  delete from public.grades               where school_id = v_school;
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
end;
$$;
