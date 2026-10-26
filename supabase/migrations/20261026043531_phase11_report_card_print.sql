-- Phase 11 step 8 — what the printed report card needs that the snapshot
-- did not hold yet: the class-council remark and the term's student remarks.
--
-- council_remarks = one remark per student for a class + semester (period_id
--   NULL = the year), written by grades.manage (the director), usually after
--   the class council, also while the semester is locked. It lives outside the
--   cards, so it survives "Republier" / "Retirer"; it reaches parents only
--   through a publication: publish_grades copies it into the card.
--   The student must be enrolled in that class (council_remark_not_in_class).
--   Read: grades.view / grades.manage. Write: grades.manage, one sheet at a
--   time with save_council_remarks(class, period, cells) (INVOKER: RLS
--   decides; one transaction; empty text = delete).
-- report_cards gains `council_remark` and `remarks` (jsonb: type, body, date
--   of the student remarks of the semester — the year card: of the year),
--   both filled by publish_grades: the print is built from the card only,
--   never from live tables. Changing a remark after publishing = Republier.

-- ===========================================================================
-- council_remarks
-- ===========================================================================
create table public.council_remarks (
  id                uuid primary key default gen_random_uuid(),
  school_id         uuid not null references public.schools (id) on delete cascade,
  academic_year_id  uuid not null,           -- set by the trigger from the class
  class_id          uuid not null,
  period_id         uuid,                    -- NULL = the year
  student_id        uuid not null,
  body              text not null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid,

  constraint council_remarks_body_check check (body = btrim(body) and char_length(body) between 1 and 500),
  constraint council_remarks_key unique nulls not distinct (class_id, period_id, student_id),
  constraint council_remarks_class_fkey foreign key (class_id, academic_year_id, school_id)
    references public.classes (id, academic_year_id, school_id) on delete cascade,
  constraint council_remarks_period_fkey foreign key (period_id, academic_year_id, school_id)
    references public.grading_periods (id, academic_year_id, school_id) on delete cascade,
  constraint council_remarks_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint council_remarks_updated_by_fkey foreign key (updated_by)
    references public.profiles (id) on delete set null
);

create index council_remarks_school_idx on public.council_remarks (school_id);
create index council_remarks_class_idx on public.council_remarks (class_id, academic_year_id, school_id);
create index council_remarks_period_idx on public.council_remarks (period_id, academic_year_id, school_id);
create index council_remarks_student_idx on public.council_remarks (student_id, school_id);
create index council_remarks_updated_by_idx on public.council_remarks (updated_by);

alter table public.council_remarks enable row level security;
revoke all on public.council_remarks from anon, authenticated;

-- Year from the class, student in the class, who wrote it.
create function private.council_remarks_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select c.academic_year_id into new.academic_year_id
    from public.classes c
    where c.id = new.class_id and c.school_id = new.school_id;
    if new.academic_year_id is null then
      raise exception 'council_remark_class_not_found' using errcode = '23503';
    end if;
    if not exists (select 1 from public.student_enrollments e
                    where e.student_id = new.student_id and e.class_id = new.class_id
                      and e.academic_year_id = new.academic_year_id) then
      raise exception 'council_remark_not_in_class' using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger council_remarks_before_write
  before insert or update on public.council_remarks
  for each row execute function private.council_remarks_before_write();

grant select, delete on public.council_remarks to authenticated;
grant insert (school_id, class_id, period_id, student_id, body) on public.council_remarks to authenticated;
grant update (body) on public.council_remarks to authenticated;

create policy council_remarks_select on public.council_remarks
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and ((select private.has_permission('grades.view'))
              or (select private.has_permission('grades.manage'))));

create policy council_remarks_insert on public.council_remarks
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy council_remarks_update on public.council_remarks
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('grades'))
              and (select private.has_permission('grades.manage')));

create policy council_remarks_delete on public.council_remarks
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('grades'))
         and (select private.has_permission('grades.manage')));

-- One class's remarks for a semester (NULL = the year), one transaction.
-- cells = [{student_id, body}], body empty / null = delete. At most 200.
create function public.save_council_remarks(p_class uuid, p_period uuid, p_cells jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := (select private.current_school_id());
  v_cell   jsonb;
  v_body   text;
  v_count  integer := 0;
  v_rows   integer;
begin
  if v_school is null or not private.has_module('grades') then
    raise exception 'council_remarks_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cells) <> 'array' or jsonb_array_length(p_cells) > 200 then
    raise exception 'council_remarks_too_many' using errcode = '22023';
  end if;

  for v_cell in select * from jsonb_array_elements(p_cells) loop
    v_body := nullif(btrim(coalesce(v_cell->>'body', '')), '');
    if v_body is null then
      delete from public.council_remarks r
       where r.school_id = v_school and r.class_id = p_class
         and r.period_id is not distinct from p_period
         and r.student_id = (v_cell->>'student_id')::uuid;
    else
      insert into public.council_remarks (school_id, class_id, period_id, student_id, body)
      values (v_school, p_class, p_period, (v_cell->>'student_id')::uuid, v_body)
      on conflict on constraint council_remarks_key do update set body = excluded.body;
    end if;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.save_council_remarks(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_council_remarks(uuid, uuid, jsonb) to authenticated;

-- ===========================================================================
-- report_cards: council remark + student remarks (snapshot)
-- ===========================================================================
alter table public.report_cards
  add column council_remark text,
  add column remarks jsonb not null default '[]',
  add constraint report_cards_remarks_check check (jsonb_typeof(remarks) = 'array');

-- Same as phase11_publish_grades, plus the two snapshots above.
create or replace function public.publish_grades(p_class uuid, p_period uuid, p_show_rank boolean default true)
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
  v_start   date;
  v_end     date;
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
    select p.number, p.start_date, p.end_date into v_number, v_start, v_end
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
     class_average, class_min, class_max, subjects, periods, council_remark, remarks)
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
           where y.student_id = g.student_id and y.subject_id is null), '[]'::jsonb) end,
         (select cr.body from public.council_remarks cr
           where cr.class_id = p_class and cr.period_id is not distinct from p_period
             and cr.student_id = g.student_id),
         -- The student remarks of the semester (Morocco date), or of the year.
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'type', sr.type, 'body', sr.body,
                    'date', (sr.created_at at time zone 'Africa/Casablanca')::date)
                  order by sr.created_at)
           from public.student_remarks sr
           where sr.student_id = g.student_id and sr.school_id = v_school
             and sr.academic_year_id = v_year
             and (p_period is null
                  or (sr.created_at at time zone 'Africa/Casablanca')::date between v_start and v_end)), '[]'::jsonb)
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

-- ===========================================================================
-- Demo school: council remarks go with the nightly reset.
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
  delete from public.council_remarks      where school_id = v_school;
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
