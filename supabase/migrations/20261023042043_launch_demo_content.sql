-- Launch prep step 2c — demo content: private.demo_fill(school), run by the
-- nightly reset after it emptied the demo school (and once by the seed script).
--
-- What it builds, every night, with dates counted from the school's today
-- (private.school_today(), Africa/Casablanca):
--   year "YYYY-YYYY+1" (1 Sept → 30 June) holding today (in July / August the
--   year that just ended), Monday → Saturday, the app's typical Moroccan week
--   (full days Mon–Fri, Saturday morning, labelled breaks);
--   levels 1AC / 2AC / 3AC, classes 1AC-A, 1AC-B, 2AC-A, 3AC-A, 24 students each
--   (Latin + Arabic names, Massar codes), one father per student (phones in the
--   fictional block +212 600 000 0xx, never an account);
--   six subjects (French names, the app's template codes / colours), six
--   teachers found by the end of their e-mail's local part:
--     …prof → Mathématiques (the demo teacher who signs in),
--     …arabe → Arabe + Éducation islamique, …francais → Français,
--     …sciences → Physique-Chimie + SVT, …histoire → Histoire-Géographie,
--     …anglais → Anglais
--   (the seed script creates the five extra teacher accounts: no known
--   password, locked like every demo account; a missing teacher = that
--   subject's lessons are left out);
--   the timetable: 29 lessons per class, placed slot by slot (no teacher or
--   room twice at once, a subject at most twice a day per class), labs in the
--   Laboratoire when free;
--   roll calls of the last 4 weeks (never today: the demo teacher takes today's
--   live), about 1 in 40 left "not taken", absences by half-day (~3 %) and
--   lates (~2 %), chosen from stable keys (Massar code, date) so two resets on
--   the same day build the same rows;
--   the demo parent's children Yassine (1AC-A) and Salma (3AC-A) Benali:
--   absences, lates, a justification approved by the director and one pending,
--   remarks from the teacher (one already read);
--   announcements (director: whole school / staff / 3AC level; teacher: his
--   class), remarks on other students, alert rules back to their defaults, the
--   school contact card from schools.settings->'demo_contact' (written by the
--   seed script from NEXT_PUBLIC_WHATSAPP_NUMBER; never a number in git).
-- Authors: the triggers take them from auth.uid(), so the fill sets
-- request.jwt.claims to the right demo account around each insert
-- (private.demo_as) and clears it at the end (demo_as(null) is its last
-- statement); public.run_demo_reset returns auth.uid() after the reset so the
-- tests can check it is null.
-- Backdating ("Appel fait à 08:04", announcements of the last days) needs three
-- BEFORE UPDATE triggers off for one statement each, at the very end: ALTER
-- TABLE … DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock (reads go on,
-- writes to those three tables wait) until the reset commits, a few ms later.
-- Absences of the last 7 days queue absence notices as usual: the parents'
-- "absent" notifications arrive ~10 minutes after the reset (pg_cron).

-- ===========================================================================
-- Act as a demo account inside the fill (auth.uid() = p_user; null = nobody)
-- ===========================================================================
create or replace function private.demo_as(p_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claims',
    case when p_user is null then '' else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end;
$$;

revoke all on function private.demo_as(uuid) from public, anon, authenticated;

-- ===========================================================================
-- The demo content
-- ===========================================================================
create or replace function private.demo_fill(p_school uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today   date := private.school_today();
  v_now     timestamptz := now();
  v_y       int;
  v_start   date;
  v_end     date;
  v_from    date;
  v_to      date;
  v_year    uuid;
  v_dir     uuid;
  v_parent  uuid;
  v_prof    uuid;
  v_lab     uuid;
  v_lvl3    uuid;
  v_family  uuid;
  v_yassine uuid;
  v_salma   uuid;
  v_class   record;
  v_slot    record;
  v_pick    record;
  v_room    uuid;
  v_days    date[];
  v_ids     uuid[];
  v_id      uuid;
  v_student uuid;
  v_ann     uuid;
  v_sat     date;
  v_i       int;
  v_cls     int;
  v_gender  text;
  v_first   text;
  v_first_ar text;
  v_last    text;
  v_last_ar text;
  v_boys    text[] := array['Adam','Mohamed','Amine','Omar','Hamza','Ayoub','Ilyas','Anas','Mehdi','Zakaria',
                            'Othmane','Rayane','Youssef','Achraf','Badr','Ismail','Walid','Nabil','Saad','Taha'];
  v_boys_ar text[] := array['آدم','محمد','أمين','عمر','حمزة','أيوب','إلياس','أنس','مهدي','زكرياء',
                            'عثمان','ريان','يوسف','أشرف','بدر','إسماعيل','وليد','نبيل','سعد','طه'];
  v_girls   text[] := array['Aya','Fatima Zahra','Hiba','Imane','Nour','Meryem','Khadija','Sara','Ghita','Rania',
                            'Yasmine','Douaa','Chaimae','Hajar','Lina','Wiam','Asmae','Oumaima','Malak','Zineb'];
  v_girls_ar text[] := array['آية','فاطمة الزهراء','هبة','إيمان','نور','مريم','خديجة','سارة','غيثة','رانية',
                             'ياسمين','دعاء','شيماء','هاجر','لينا','وئام','أسماء','أميمة','ملاك','زينب'];
  v_lasts   text[] := array['Alaoui','Bennani','Tazi','El Idrissi','Berrada','Chraibi','Lahlou','Ouazzani',
                            'Benjelloun','El Fassi','Amrani','Kettani','Saidi','Bouzid','Naciri','Hassani',
                            'Mansouri','Rahmouni','Jabri','Filali','Sqalli','Ait Ali','Ouali','Ziani'];
  v_lasts_ar text[] := array['العلوي','بناني','التازي','الإدريسي','برادة','الشرايبي','لحلو','الوزاني',
                             'بنجلون','الفاسي','العمراني','الكتاني','السعيدي','بوزيد','الناصري','الحسني',
                             'المنصوري','الرحموني','الجابري','الفيلالي','السقالي','آيت علي','الوالي','الزياني'];
  v_fathers text[] := array['Ahmed','Mustapha','Rachid','Hassan','Abdelaziz','Said','Khalid','Driss','Noureddine','Abdellah'];
begin
  perform private.demo_as(null);

  -- --- The accounts (kept by the reset) ------------------------------------------------------------
  select p.id into v_dir from public.profiles p join public.roles r on r.id = p.role_id
  where p.school_id = p_school and r.key = 'director' and p.deactivated_at is null order by p.created_at limit 1;
  select p.id into v_parent from public.profiles p join public.roles r on r.id = p.role_id
  where p.school_id = p_school and r.key = 'parent' and p.deactivated_at is null order by p.created_at limit 1;
  select p.id into v_prof from public.profiles p join public.roles r on r.id = p.role_id
  where p.school_id = p_school and r.key = 'teacher' and split_part(p.email, '@', 1) like '%prof' order by p.created_at limit 1;
  if v_dir is null or v_parent is null or v_prof is null then
    raise exception 'demo school needs its director, teacher and parent accounts' using errcode = 'P0001', hint = 'demo_accounts_missing';
  end if;

  -- --- Settings back to their defaults ---------------------------------------------------------------
  perform private.demo_as(v_dir);
  update public.alert_rules set enabled = true, threshold = 3, window_days = null, recipients = array['parents', 'surveillance']
  where school_id = p_school and type = 'unjustified_absences';
  update public.alert_rules set enabled = true, threshold = 3, window_days = 14, recipients = array['parents']
  where school_id = p_school and type = 'repeated_lateness';
  update public.school_contacts c
     set phone = case when s.settings #>> '{demo_contact,phone}' ~ '^\+212[5-7][0-9]{8}$' then s.settings #>> '{demo_contact,phone}' end,
         whatsapp = case when s.settings #>> '{demo_contact,whatsapp}' ~ '^\+212[67][0-9]{8}$' then s.settings #>> '{demo_contact,whatsapp}' end
  from public.schools s
  where s.id = p_school and c.school_id = p_school;
  perform private.demo_as(null);

  -- --- Year, week ----------------------------------------------------------------------------------
  v_y := extract(year from v_today)::int - case when extract(month from v_today) < 9 then 1 else 0 end;
  v_start := make_date(v_y, 9, 1);
  v_end := make_date(v_y + 1, 6, 30);
  insert into public.academic_years (school_id, label, start_date, end_date, is_current)
  values (p_school, v_y || '-' || (v_y + 1), v_start, v_end, true)
  returning id into v_year;

  insert into public.school_days (school_id, academic_year_id, day_of_week)
  select p_school, v_year, d from generate_series(1, 6) d;

  insert into public.time_slots (school_id, academic_year_id, day_of_week, start_time, end_time, kind, label)
  select p_school, v_year, d, t.s::time, t.e::time, t.k, t.l
  from generate_series(1, 6) d
  cross join (values ('08:00', '09:00', 'lesson', null, false),
                     ('09:00', '10:00', 'lesson', null, false),
                     ('10:00', '10:15', 'break', 'Récréation', false),
                     ('10:15', '11:15', 'lesson', null, false),
                     ('11:15', '12:15', 'lesson', null, false),
                     ('12:15', '14:00', 'break', 'Déjeuner', true),
                     ('14:00', '15:00', 'lesson', null, true),
                     ('15:00', '16:00', 'lesson', null, true),
                     ('16:00', '17:00', 'lesson', null, true)) t(s, e, k, l, afternoon)
  where d < 6 or not t.afternoon;

  -- --- Structure -------------------------------------------------------------------------------------
  insert into public.levels (school_id, cycle, name, sort_order)
  values (p_school, 'college', '1AC', 0), (p_school, 'college', '2AC', 1), (p_school, 'college', '3AC', 2);
  select id into v_lvl3 from public.levels where school_id = p_school and name = '3AC';

  insert into public.rooms (school_id, name, capacity, room_type)
  values (p_school, 'Salle 1', 32, 'classroom'), (p_school, 'Salle 2', 32, 'classroom'),
         (p_school, 'Salle 3', 32, 'classroom'), (p_school, 'Salle 4', 32, 'classroom'),
         (p_school, 'Laboratoire', 28, 'lab');
  select id into v_lab from public.rooms where school_id = p_school and name = 'Laboratoire';

  insert into public.classes (school_id, academic_year_id, level_id, name)
  select p_school, v_year, l.id, c.name
  from (values ('1AC-A', '1AC'), ('1AC-B', '1AC'), ('2AC-A', '2AC'), ('3AC-A', '3AC')) c(name, level)
  join public.levels l on l.school_id = p_school and l.name = c.level;

  insert into public.subjects (school_id, name, code, color)
  values (p_school, 'Arabe', 'Ar', 'green'), (p_school, 'Français', 'Fr', 'blue'),
         (p_school, 'Anglais', 'Ang', 'indigo'), (p_school, 'Mathématiques', 'Math', 'red'),
         (p_school, 'Physique-Chimie', 'PC', 'orange'), (p_school, 'SVT', 'SVT', 'lime'),
         (p_school, 'Histoire-Géographie', 'HG', 'amber'), (p_school, 'Éducation islamique', 'EI', 'teal');

  -- Who teaches what, hours per week per class, the Laboratoire for PC / SVT.
  drop table if exists pg_temp.demo_plan;
  create temp table demo_plan on commit drop as
  select s.id as subject_id, p.teacher_id, x.hours, x.lab, x.ord
  from (values ('Arabe', 'arabe', 5, false, 1), ('Français', 'francais', 5, false, 2),
               ('Mathématiques', 'prof', 5, false, 3), ('Anglais', 'anglais', 3, false, 4),
               ('Physique-Chimie', 'sciences', 3, true, 5), ('SVT', 'sciences', 3, true, 6),
               ('Histoire-Géographie', 'histoire', 3, false, 7), ('Éducation islamique', 'arabe', 2, false, 8))
       x(subject, teacher_key, hours, lab, ord)
  join public.subjects s on s.school_id = p_school and s.name = x.subject
  cross join lateral (
    select pr.id as teacher_id
    from public.profiles pr join public.roles r on r.id = pr.role_id
    where pr.school_id = p_school and r.key = 'teacher' and pr.deactivated_at is null
      and split_part(pr.email, '@', 1) like '%' || x.teacher_key
    order by pr.created_at limit 1
  ) p;

  insert into public.teacher_subjects (school_id, teacher_id, subject_id)
  select distinct p_school, teacher_id, subject_id from pg_temp.demo_plan;

  -- --- Timetable: slot by slot, class by class --------------------------------------------------------
  drop table if exists pg_temp.demo_need;
  create temp table demo_need on commit drop as
  select c.id as class_id, c.name as class_name, 'Salle ' || dense_rank() over (order by c.name) as home,
         pl.subject_id, pl.teacher_id, pl.lab, pl.ord, pl.hours as left_hours
  from public.classes c cross join pg_temp.demo_plan pl
  where c.school_id = p_school;

  for v_slot in
    select ts.id, ts.day_of_week from public.time_slots ts
    where ts.academic_year_id = v_year and ts.kind = 'lesson' order by ts.day_of_week, ts.start_time
  loop
    for v_class in select distinct class_id, class_name, home from pg_temp.demo_need order by class_name loop
      select n.subject_id, n.teacher_id, n.lab into v_pick
      from pg_temp.demo_need n
      cross join lateral (
        select count(*) as today
        from public.lessons l join public.time_slots t on t.id = l.time_slot_id
        where l.class_id = n.class_id and l.subject_id = n.subject_id and t.day_of_week = v_slot.day_of_week
      ) d
      where n.class_id = v_class.class_id and n.left_hours > 0 and d.today < 2
        and not exists (select 1 from public.lessons l where l.time_slot_id = v_slot.id and l.teacher_id = n.teacher_id)
      order by d.today, n.left_hours desc, n.ord
      limit 1;
      if found then
        v_room := case
          when v_pick.lab and not exists (select 1 from public.lessons l where l.time_slot_id = v_slot.id and l.room_id = v_lab)
            then v_lab
          else (select r.id from public.rooms r where r.school_id = p_school and r.name = v_class.home)
        end;
        insert into public.lessons (school_id, academic_year_id, time_slot_id, class_id, subject_id, teacher_id, room_id)
        values (p_school, v_year, v_slot.id, v_class.class_id, v_pick.subject_id, v_pick.teacher_id, v_room);
        update pg_temp.demo_need set left_hours = left_hours - 1
        where class_id = v_class.class_id and subject_id = v_pick.subject_id;
      end if;
    end loop;
  end loop;

  -- --- Students, fathers -----------------------------------------------------------------------------
  insert into public.guardians (school_id, last_name, first_name, phone, profile_id)
  values (p_school, 'Benali', 'Karim', '+212600000001', v_parent)
  returning id into v_family;

  for v_i in 1..96 loop
    v_cls := (v_i - 1) / 24;  -- 0 = 1AC-A, 1 = 1AC-B, 2 = 2AC-A, 3 = 3AC-A
    select id into v_id from public.classes where school_id = p_school
      and name = (array['1AC-A', '1AC-B', '2AC-A', '3AC-A'])[v_cls + 1];
    if v_i = 5 then
      v_gender := 'male'; v_first := 'Yassine'; v_first_ar := 'ياسين'; v_last := 'Benali'; v_last_ar := 'بنعلي';
    elsif v_i = 77 then
      v_gender := 'female'; v_first := 'Salma'; v_first_ar := 'سلمى'; v_last := 'Benali'; v_last_ar := 'بنعلي';
    else
      v_gender := case when v_i % 2 = 0 then 'female' else 'male' end;
      if v_gender = 'male' then
        v_first := v_boys[(v_i / 2) % 20 + 1]; v_first_ar := v_boys_ar[(v_i / 2) % 20 + 1];
      else
        v_first := v_girls[(v_i / 2) % 20 + 1]; v_first_ar := v_girls_ar[(v_i / 2) % 20 + 1];
      end if;
      v_last := v_lasts[(v_i * 7) % 24 + 1]; v_last_ar := v_lasts_ar[(v_i * 7) % 24 + 1];
    end if;

    insert into public.students (school_id, first_name, last_name, first_name_ar, last_name_ar, birth_date, gender, code_massar)
    values (p_school, v_first, v_last, v_first_ar, v_last_ar,
            make_date(v_y - 12 - case when v_cls = 3 then 2 when v_cls = 2 then 1 else 0 end, 1, 1) + (v_i * 37) % 365,
            v_gender, 'D' || lpad((13000000 + v_i * 104729)::text, 9, '0'))
    returning id into v_student;
    v_ids[v_i] := v_student;
    insert into public.student_enrollments (school_id, student_id, academic_year_id, class_id)
    values (p_school, v_student, v_year, v_id);

    if v_i in (5, 77) then
      insert into public.student_guardians (school_id, student_id, guardian_id, relation)
      values (p_school, v_student, v_family, 'father');
    else
      insert into public.guardians (school_id, last_name, first_name, phone)
      values (p_school, v_last, v_fathers[v_i % 10 + 1], '+2126000000' || lpad(((v_i - 1) % 98 + 2)::text, 2, '0'))
      returning id into v_id;
      insert into public.student_guardians (school_id, student_id, guardian_id, relation)
      values (p_school, v_student, v_id, 'father');
    end if;
  end loop;
  v_yassine := v_ids[5];
  v_salma := v_ids[77];

  -- --- Roll calls of the last 4 weeks (never today) ---------------------------------------------------
  v_from := greatest(v_start, v_today - 28);
  v_to := least(v_today - 1, v_end);
  insert into public.attendance_sessions (school_id, lesson_id, session_date, taken_by, updated_by)
  select p_school, l.id, d::date, l.teacher_id, l.teacher_id
  from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
  join public.time_slots ts on ts.academic_year_id = v_year and ts.kind = 'lesson'
                           and ts.day_of_week = extract(isodow from d)
  join public.lessons l on l.time_slot_id = ts.id
  join public.classes c on c.id = l.class_id
  where v_from <= v_to
    and abs(hashtext(c.name || d::date::text || ts.start_time::text)) % 40 <> 0;

  -- Absent by half-day, late now and then; the demo children get their own story below.
  insert into public.attendance_marks (session_id, school_id, student_id, status, marked_by)
  select s.id, p_school, e.student_id, 'absent', s.taken_by
  from public.attendance_sessions s
  join public.student_enrollments e on e.class_id = s.class_id and e.academic_year_id = s.academic_year_id
  join public.students st on st.id = e.student_id
  where s.school_id = p_school and st.id not in (v_yassine, v_salma)
    and abs(hashtext(st.code_massar || s.session_date::text || (s.start_time < '12:30')::text)) % 100 < 3;

  insert into public.attendance_marks (session_id, school_id, student_id, status, minutes_late, marked_by)
  select s.id, p_school, e.student_id, 'late', 5 + abs(hashtext(st.code_massar || s.start_time::text)) % 16, s.taken_by
  from public.attendance_sessions s
  join public.student_enrollments e on e.class_id = s.class_id and e.academic_year_id = s.academic_year_id
  join public.students st on st.id = e.student_id
  where s.school_id = p_school and st.id not in (v_yassine, v_salma)
    and abs(hashtext(st.code_massar || s.session_date::text || s.start_time::text)) % 100 < 2
    and not exists (select 1 from public.attendance_marks m where m.session_id = s.id and m.student_id = st.id);

  -- School days before today, most recent first: v_days[1] = the last one.
  v_days := array(select d::date from generate_series(v_to::timestamp, v_from::timestamp, interval '-1 day') d
                  where v_from <= v_to and extract(isodow from d) between 1 and 6);

  -- Yassine: absent the morning of v_days[8] (justified, approved), 10 minutes late on v_days[3].
  -- Salma: absent all day v_days[2] (justification pending), absent the morning of v_days[6]
  -- (not justified), 15 minutes late on v_days[1].
  insert into public.attendance_marks (session_id, school_id, student_id, status, minutes_late, marked_by)
  select s.id, p_school, x.student, x.status, x.minutes, s.taken_by
  from (values (v_yassine, v_days[8], 'absent', null::smallint, true, false),
               (v_salma, v_days[2], 'absent', null, false, false),
               (v_salma, v_days[6], 'absent', null, true, false),
               (v_yassine, v_days[3], 'late', 10, false, true),
               (v_salma, v_days[1], 'late', 15, false, true)) x(student, day, status, minutes, morning_only, first_only)
  join public.student_enrollments e on e.student_id = x.student and e.academic_year_id = v_year
  join public.attendance_sessions s on s.class_id = e.class_id and s.session_date = x.day
  where x.day is not null
    and (not x.morning_only or s.start_time < '12:30')
    and (not x.first_only or s.start_time = (select min(s2.start_time) from public.attendance_sessions s2
                                             where s2.class_id = s.class_id and s2.session_date = s.session_date));

  -- --- Justifications (the parent sends, the director approves one) ---------------------------------
  if v_days[8] is not null then
    perform private.demo_as(v_parent);
    insert into public.justifications (school_id, student_id, kind, from_date, to_date, reason, submitted_by)
    values (p_school, v_yassine, 'days', v_days[8], v_days[8], 'Rendez-vous chez le médecin, certificat remis au surveillant.', v_parent)
    returning id into v_id;
    perform private.demo_as(v_dir);
    update public.justifications set status = 'approved' where id = v_id;
  end if;
  if v_days[2] is not null then
    perform private.demo_as(v_parent);
    insert into public.justifications (school_id, student_id, kind, from_date, to_date, reason, submitted_by)
    values (p_school, v_salma, 'days', v_days[2], v_days[2], 'Fièvre, elle est restée à la maison. Certificat médical à suivre.', v_parent);
  end if;

  -- --- Remarks (the demo teacher) -------------------------------------------------------------------
  perform private.demo_as(v_prof);
  insert into public.student_remarks (school_id, student_id, type, body)
  values (p_school, v_yassine, 'praise', 'Excellent travail au dernier contrôle de mathématiques, bravo !'),
         (p_school, v_salma, 'homework', 'Les exercices 3 et 4 de la page 52 n''ont pas été faits.'),
         (p_school, v_ids[30], 'behavior', 'Bavardages répétés pendant le cours, merci d''en parler avec lui.'),
         (p_school, v_ids[51], 'material', 'A oublié sa calculatrice et son cahier d''exercices.'),
         (p_school, v_ids[60], 'praise', 'Très bonne participation en classe cette semaine.'),
         (p_school, v_ids[88], 'homework', 'Devoir maison rendu avec deux jours de retard.');
  perform private.demo_as(v_parent);
  update public.student_remarks set read_at = v_now where school_id = p_school and student_id = v_yassine;
  update public.notifications set read_at = v_now
   where school_id = p_school and type = 'remark' and student_id = v_yassine;

  -- --- Announcements -------------------------------------------------------------------------------------
  v_sat := v_today + coalesce(nullif((13 - extract(isodow from v_today)::int) % 7, 0), 7);  -- next Saturday (never today)
  perform private.demo_as(v_dir);
  insert into public.announcements (school_id, scope, audience, title, body, created_by)
  values (p_school, 'school', 'parents', 'Réunion parents-professeurs',
          'Chers parents,' || chr(10) || chr(10) || 'Nous vous invitons à la réunion parents-professeurs le samedi '
          || to_char(v_sat, 'DD/MM') || ' à 10h00, dans la salle polyvalente. Les professeurs principaux présenteront '
          || 'le bilan de la première période.' || chr(10) || chr(10) || 'La direction', v_dir),
         (p_school, 'school', 'everyone', 'Photo de classe',
          'La photo de classe aura lieu jeudi prochain, le matin, classe par classe. Merci de veiller à une tenue correcte.', v_dir),
         (p_school, 'school', 'staff', 'Conseils de classe',
          'Les conseils de classe de la première période se tiendront la semaine prochaine. Merci de saisir vos appréciations avant lundi.', v_dir);
  insert into public.announcements (school_id, scope, audience, title, body, created_by)
  values (p_school, 'levels', 'parents', 'Examen régional : réunion d''information',
          'Une réunion d''information sur l''examen régional de 3e année collège aura lieu mercredi à 17h00.', v_dir)
  returning id into v_ann;
  insert into public.announcement_targets (announcement_id, school_id, academic_year_id, level_id)
  values (v_ann, p_school, v_year, v_lvl3);

  perform private.demo_as(v_prof);
  insert into public.announcements (school_id, scope, audience, title, body, created_by)
  values (p_school, 'classes', 'parents', 'Contrôle de mathématiques',
          'Un contrôle de mathématiques aura lieu la semaine prochaine sur les nombres relatifs et les fractions. '
          || 'Merci de vérifier que votre enfant révise les exercices du chapitre.', v_prof)
  returning id into v_ann;
  insert into public.announcement_targets (announcement_id, school_id, academic_year_id, class_id)
  select v_ann, p_school, v_year, c.id from public.classes c where c.school_id = p_school and c.name = '1AC-A';

  perform private.demo_as(null);
  -- Publish now (deferred constraint trigger): the readers' notifications exist before they are
  -- backdated. Back to deferred right after: the nightly job fills several demo schools in ONE
  -- transaction, and the next fill's announcements must again wait for their targets.
  set constraints public.announcements_publish immediate;
  set constraints public.announcements_publish deferred;

  -- --- Backdating (last: the trigger locks are held only until the reset commits) --------------------
  alter table public.attendance_sessions disable trigger attendance_sessions_lock_snapshot;
  update public.attendance_sessions
     set taken_at = ((session_date + start_time) at time zone 'Africa/Casablanca')
                    + make_interval(mins => 2 + abs(hashtext(id::text)) % 9),
         updated_at = ((session_date + start_time) at time zone 'Africa/Casablanca')
                    + make_interval(mins => 2 + abs(hashtext(id::text)) % 9)
   where school_id = p_school;
  alter table public.attendance_sessions enable trigger attendance_sessions_lock_snapshot;

  alter table public.justifications disable trigger justifications_before_update;
  update public.justifications
     set submitted_at = ((from_date + time '19:30') at time zone 'Africa/Casablanca'),
         reviewed_at = case when status = 'approved' then ((from_date + 1 + time '09:10') at time zone 'Africa/Casablanca') end,
         updated_at = ((from_date + 1 + time '09:10') at time zone 'Africa/Casablanca')
   where school_id = p_school;
  alter table public.justifications enable trigger justifications_before_update;

  alter table public.announcements disable trigger announcements_before_update;
  -- School-hours times on the last days (the reset itself runs at 03:00).
  update public.announcements
     set created_at = (case title
                         when 'Réunion parents-professeurs' then v_today - 2 + time '17:40'
                         when 'Photo de classe' then v_today - 4 + time '09:15'
                         when 'Conseils de classe' then v_today - 3 + time '12:30'
                         when 'Contrôle de mathématiques' then v_today - 1 + time '18:20'
                         else v_today - 1 + time '16:05' end) at time zone 'Africa/Casablanca'
   where school_id = p_school;
  alter table public.announcements enable trigger announcements_before_update;
  update public.notifications n set created_at = a.created_at
  from public.announcements a
  where n.school_id = p_school and n.type = 'announcement' and n.data ->> 'announcement_id' = a.id::text;

  update public.student_remarks r
     set created_at = ((v_today - 1 - abs(hashtext(r.body)) % 4) + time '08:30') at time zone 'Africa/Casablanca'
                      + make_interval(mins => abs(hashtext(r.body || 'm')) % 540)
   where r.school_id = p_school;
  update public.notifications n set created_at = r.created_at
  from public.student_remarks r
  where n.school_id = p_school and n.type = 'remark' and n.data ->> 'remark_id' = r.id::text;
  -- (Yassine's remark keeps read_at = the reset time: the remark trigger never lets read_at move once set.)

  -- Nothing after the fill in the same transaction may run as a demo account.
  perform private.demo_as(null);
end;
$$;

revoke all on function private.demo_fill(uuid) from public, anon, authenticated;

-- ===========================================================================
-- run_demo_reset now returns auth.uid() as it is once the reset is done:
-- always null (the fill ends with demo_as(null)); the test suite checks it.
-- ===========================================================================
drop function public.run_demo_reset(uuid);

create function public.run_demo_reset(p_school uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reset_demo_school(p_school);
  return auth.uid();
end;
$$;

revoke all on function public.run_demo_reset(uuid) from public, anon, authenticated;
grant execute on function public.run_demo_reset(uuid) to service_role;
