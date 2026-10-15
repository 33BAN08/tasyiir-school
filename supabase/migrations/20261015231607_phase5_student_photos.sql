-- Phase 5 step 2 — student photos in a PRIVATE Storage bucket.
--
-- Object path: <school_id>/<student_id>/<random uuid>.<jpg|png|webp>
--   1st folder = the school  → no school can touch another school's files.
--   2nd folder = the student → a photo always belongs to one student.
--   random file name         → a new photo never reuses an old (cached) URL.
-- students.photo_path holds the current object's path.
--
-- Read: never public. The app shows photos only through short-lived signed
-- URLs (5 minutes) created with the user's own session, so the SELECT policy
-- below decides who can get one.
-- Write: students.manage, own school, an existing student of that school.
-- No UPDATE policy: a file is never overwritten; a new photo is a new file,
-- then the old one is deleted.

-- ===========================================================================
-- Bucket: private, 2 MB, jpg / png / webp only (enforced by the Storage API).
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp']);

-- ===========================================================================
-- Policies on storage.objects (RLS is already on for that table).
-- ===========================================================================

-- Read (and so: create a signed URL): only the CURRENT photo of a student the
-- user may see. The students table's own RLS runs inside this subquery, so
-- the same people as for the student record: students.view / .manage, and
-- later private.is_linked_to_student() (parents in step 3, teachers in Phase 6).
-- An old or orphan file (no student points at it) is readable by nobody.
create policy student_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and exists (
      select 1 from public.students s
      where s.photo_path = storage.objects.name
        and s.school_id = (select private.current_school_id())
    )
  );

-- Upload: students.manage, into own school's folder, for one of its students.
create policy student_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.has_permission('students.manage'))
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[2]
        and s.school_id = (select private.current_school_id())
    )
  );

-- Delete (replaced photo, removed photo, deleted student): students.manage,
-- own school's folder only.
create policy student_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select private.current_school_id())::text
    and (select private.has_permission('students.manage'))
  );

-- ===========================================================================
-- students.photo_path must point into the student's own folder.
-- ===========================================================================
alter table public.students
  add constraint students_photo_path_check check (
    photo_path is null
    or photo_path ~ ('^' || school_id::text || '/' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
  );
