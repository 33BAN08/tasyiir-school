-- Phase 7 step 4 — justifications of absences (and late arrivals).
--
-- Two kinds:
--   'days' — whole days (from_date … to_date, at most 31 days): sent by a
--            parent for their child (status 'pending' until reviewed), or
--            entered by staff (approved at once);
--   'mark' — one absence / late arrival, entered by staff from a paper note
--            (approved at once). It points at that mark; if the mark is
--            removed (the student was present after all), it goes too.
-- A justification never changes the marks: an absence counts as justified
-- when an APPROVED justification covers it (its day for 'days', the mark
-- itself for 'mark'). Rejected or pending ones justify nothing.
--
-- Optional file: a photo or PDF of the note, in the PRIVATE bucket
-- 'justifications' (5 MB; jpg / png / webp / pdf), path
-- <school_id>/<student_id>/<random uuid>.<ext>. Photos are re-encoded in the
-- browser before upload (drops EXIF / GPS). Files are read only through
-- short-lived signed URLs; the read policy below decides who can get one.
--
-- Rules enforced by the DATABASE:
--   - the student, the mark, the people and the file stay in the school
--     (composite foreign keys, path check);
--   - 'days': from ≤ to, ≤ 31 days, not more than a year back nor 30 days
--     ahead of the school's today; 'mark': the dates are the mark's day;
--   - a parent can only send 'days' for their own child, always 'pending';
--     staff entries are approved at once (by them, now);
--   - who sent it and when are set by the database and never change; after
--     creation only the review (status, note) and, for staff, the file can
--     change; reviewed_by / reviewed_at follow every status change.
--
-- Who may (RLS, own school, attendance module on):
--   - read: attendance.view / .manage (whole school); a parent: their
--     children's justifications;
--   - create: attendance.manage (both kinds); a parent ('days', own child);
--   - review (update): attendance.manage;
--   - delete: attendance.manage; a parent: their own still-pending one.

-- ===========================================================================
-- Targets of the composite foreign keys below.
-- ===========================================================================
alter table public.attendance_marks
  add constraint attendance_marks_session_student_school_key unique (session_id, student_id, school_id);

-- ===========================================================================
-- justifications
-- ===========================================================================
create table public.justifications (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  student_id    uuid not null,
  kind          text not null,
  from_date     date not null,
  to_date       date not null,
  session_id    uuid,                              -- 'mark' only
  reason        text not null,
  file_path     text,
  status        text not null default 'pending',
  submitted_by  uuid not null,
  submitted_at  timestamptz not null default now(),
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  review_note   text,
  updated_at    timestamptz not null default now(),

  constraint justifications_kind_check check (kind in ('days', 'mark')),
  constraint justifications_status_check check (status in ('pending', 'approved', 'rejected')),
  constraint justifications_dates_check check (from_date <= to_date and to_date - from_date <= 30),
  constraint justifications_mark_check check (
    (kind = 'mark' and session_id is not null and from_date = to_date)
    or (kind = 'days' and session_id is null)
  ),
  constraint justifications_reason_check check (reason = btrim(reason) and char_length(reason) between 1 and 500),
  constraint justifications_review_note_check check (
    review_note is null or (review_note = btrim(review_note) and char_length(review_note) between 1 and 300)
  ),
  constraint justifications_review_check check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint justifications_file_path_check check (
    file_path is null
    or file_path ~ ('^' || school_id::text || '/' || student_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$')
  ),

  constraint justifications_student_fkey foreign key (student_id, school_id)
    references public.students (id, school_id) on delete cascade,
  constraint justifications_mark_fkey foreign key (session_id, student_id, school_id)
    references public.attendance_marks (session_id, student_id, school_id) on delete cascade,
  constraint justifications_submitted_by_fkey foreign key (submitted_by, school_id)
    references public.profiles (id, school_id),
  constraint justifications_reviewed_by_fkey foreign key (reviewed_by, school_id)
    references public.profiles (id, school_id)
);

create index justifications_school_status_idx on public.justifications (school_id, status);
create index justifications_student_idx on public.justifications (student_id, from_date);
create index justifications_mark_idx on public.justifications (session_id, student_id);

-- New justification: who and when; a parent's is 'days' and pending; staff's
-- is approved by them now; a 'mark' takes its dates from the mark's day.
create function private.justifications_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff boolean := private.has_permission('attendance.manage');
  v_date  date;
begin
  new.submitted_by := coalesce(auth.uid(), new.submitted_by);
  new.submitted_at := now();
  new.updated_at := now();

  if new.kind = 'mark' then
    if not v_staff then
      raise exception 'justification_mark_staff_only' using errcode = '42501';
    end if;
    select s.session_date into v_date
    from public.attendance_sessions s
    where s.id = new.session_id and s.school_id = new.school_id;
    new.from_date := v_date;
    new.to_date := v_date;
  elsif new.from_date < private.school_today() - 365 or new.to_date > private.school_today() + 30 then
    raise exception 'justification_dates_out_of_range' using errcode = 'P0001';
  end if;

  if v_staff then
    new.status := 'approved';
    new.reviewed_by := new.submitted_by;
    new.reviewed_at := now();
  else
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  end if;
  return new;
end;
$$;

create trigger justifications_before_insert
  before insert on public.justifications
  for each row execute function private.justifications_before_insert();

-- Changes: only the review (status, note) and the file; the review records
-- who and when; back to 'pending' clears it.
create function private.justifications_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_id is distinct from old.school_id
     or new.student_id is distinct from old.student_id
     or new.kind is distinct from old.kind
     or new.from_date is distinct from old.from_date
     or new.to_date is distinct from old.to_date
     or new.session_id is distinct from old.session_id
     or new.reason is distinct from old.reason
     or new.submitted_by is distinct from old.submitted_by
     or new.submitted_at is distinct from old.submitted_at then
    raise exception 'justification_locked' using errcode = 'P0001';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'pending' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := coalesce(auth.uid(), new.reviewed_by);
      new.reviewed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger justifications_before_update
  before update on public.justifications
  for each row execute function private.justifications_before_update();

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.justifications enable row level security;
grant select, insert, update, delete on public.justifications to authenticated;

create policy justifications_select on public.justifications
  for select to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.view'))
              or (select private.has_permission('attendance.manage'))
              or private.is_guardian_of_student(student_id)));

create policy justifications_insert on public.justifications
  for insert to authenticated
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and ((select private.has_permission('attendance.manage'))
                   or (kind = 'days' and private.is_guardian_of_student(student_id))));

create policy justifications_update on public.justifications
  for update to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and (select private.has_permission('attendance.manage')))
  with check (school_id = (select private.current_school_id())
              and (select private.has_module('attendance'))
              and (select private.has_permission('attendance.manage')));

create policy justifications_delete on public.justifications
  for delete to authenticated
  using (school_id = (select private.current_school_id())
         and (select private.has_module('attendance'))
         and ((select private.has_permission('attendance.manage'))
              or (status = 'pending'
                  and submitted_by = (select auth.uid())
                  and private.is_guardian_of_student(student_id))));

-- ===========================================================================
-- Storage: private bucket for the notes (5 MB; photos and PDF).
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('justifications', 'justifications', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- Read (and so: create a signed URL): a file a justification points at, for
-- who can read that justification (its RLS runs inside this subquery); and
-- the uploader's own file (Storage needs read to delete: a parent cleans up
-- a file whose sending failed). Any other orphan file is readable by nobody.
create policy justifications_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'justifications'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (owner_id = (select auth.uid())::text
         or exists (
           select 1 from public.justifications j
           where j.file_path = storage.objects.name
             and j.school_id = (select private.current_school_id())
         ))
  );

-- Upload: own school's folder, for a student of the school; staff with
-- attendance.manage, or a parent of that student. The name has the same form
-- as justifications.file_path: <school_id>/<student_id>/<uuid>.<jpg|png|webp|pdf>.
create policy justifications_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'justifications'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and name ~ ('^' || (select private.current_school_id())::text
                || '/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$')
    and (select private.has_module('attendance'))
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[2]
        and s.school_id = (select private.current_school_id())
        and ((select private.has_permission('attendance.manage'))
             or private.is_guardian_of_student(s.id))
    )
  );

-- Delete: staff (attendance.manage) in the school's folder; the uploader of
-- a file that no reviewed justification points at (a cancelled or failed
-- sending). A note that was reviewed stays as evidence.
create policy justifications_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'justifications'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and ((select private.has_permission('attendance.manage'))
         or (owner_id = (select auth.uid())::text
             and not exists (
               select 1 from public.justifications j
               where j.file_path = storage.objects.name and j.status <> 'pending'
             )))
  );
