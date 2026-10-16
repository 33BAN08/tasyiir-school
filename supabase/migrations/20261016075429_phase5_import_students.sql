-- Phase 5 step 5 — import students (with their class and an optional parent)
-- from an Excel / CSV file, ALL OR NOTHING.
--
-- The app parses and checks the file first (preview), then sends the rows it
-- accepted to public.import_students() in ONE call: a function runs in one
-- transaction, so any failure (a Massar code taken meanwhile, a class deleted
-- meanwhile, …) rolls the whole import back.
--
-- SECURITY INVOKER: every insert goes through the caller's RLS policies, as
-- for the forms (students.manage for students and classes; parents.manage for
-- parents). The checks at the top only give clearer errors; RLS and the
-- tables' constraints stay the final judges. The school is always the
-- caller's school and the class year always the school's CURRENT year: the
-- caller cannot choose either.
--
-- Rows (jsonb array, at most 2000), each:
--   id (uuid, chosen by the app), last_name, first_name, last_name_ar,
--   first_name_ar, birth_date (yyyy-mm-dd), gender, code_massar, class_id,
--   guardian_last_name, guardian_first_name, guardian_phone (+2126/7…),
--   guardian_relation (father / mother / tutor)  — guardian_* null = no parent.
-- A parent is found by phone in the school (reused, name unchanged) or
-- created; several rows may share one phone (siblings).
-- Returns the number of students created.

create or replace function public.import_students(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_school uuid := private.current_school_id();
  v_year   uuid;
  v_count  integer;
begin
  if v_school is null or not private.has_permission('students.manage') then
    raise exception 'import_students: not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000 then
    raise exception 'import_students: 1 to 2000 rows' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) e where e ->> 'guardian_phone' is not null)
     and not private.has_permission('parents.manage') then
    raise exception 'import_students: parents not allowed' using errcode = '42501';
  end if;

  select id into v_year
  from public.academic_years
  where school_id = v_school and is_current;
  if v_year is null then
    raise exception 'import_students: no current academic year' using errcode = 'P0002';
  end if;

  -- Students.
  insert into public.students
    (id, school_id, last_name, first_name, last_name_ar, first_name_ar, birth_date, gender, code_massar)
  select r.id, v_school, r.last_name, r.first_name, r.last_name_ar, r.first_name_ar, r.birth_date, r.gender, r.code_massar
  from jsonb_to_recordset(p_rows) as r (
    id uuid, last_name text, first_name text, last_name_ar text, first_name_ar text,
    birth_date date, gender text, code_massar text);
  get diagnostics v_count = row_count;

  -- Their class this year (the composite FK checks class, year and school).
  insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id)
  select v_school, r.id, v_year, r.class_id
  from jsonb_to_recordset(p_rows) as r (id uuid, class_id uuid)
  where r.class_id is not null;

  -- Parents not yet in the school (one per phone; the first row's name wins).
  insert into public.guardians (school_id, last_name, first_name, phone)
  select distinct on (r.guardian_phone) v_school, r.guardian_last_name, r.guardian_first_name, r.guardian_phone
  from rows from (jsonb_to_recordset(p_rows) as (
         guardian_last_name text, guardian_first_name text, guardian_phone text))
       with ordinality as r (guardian_last_name, guardian_first_name, guardian_phone, n)
  where r.guardian_phone is not null
  order by r.guardian_phone, r.n
  on conflict (school_id, phone) do nothing;

  -- Links (one father / one mother per student: unique index).
  insert into public.student_guardians (school_id, student_id, guardian_id, relation)
  select v_school, r.id, g.id, r.guardian_relation
  from jsonb_to_recordset(p_rows) as r (id uuid, guardian_phone text, guardian_relation text)
  join public.guardians g on g.school_id = v_school and g.phone = r.guardian_phone
  where r.guardian_phone is not null;

  return v_count;
end;
$$;

revoke all on function public.import_students(jsonb) from public, anon;
grant execute on function public.import_students(jsonb) to authenticated;
