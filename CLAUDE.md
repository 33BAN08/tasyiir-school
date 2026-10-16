# Tasyiir School — Claude Code rules

Tasyiir School (تسيير) is a **multi-tenant SaaS school management platform** for Moroccan private schools:
absences, emploi du temps, communication, grades, fees, transport, Massar exports, automatic alerts.

- Full plan & phases: `docs/PLAN.md`
- Brand, UI & UX rules: `docs/DESIGN.md`
- **Always read both before starting a phase.** Work on ONE phase at a time. Don't build ahead.

## Current phase
> **Phase 6 — Emploi du temps** (update this line when a phase is finished). Phases 0–5 done — live at https://tasyiir-school.vercel.app

## Tech stack (do not change without asking)
- Next.js (latest, App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui, lucide-react icons
- Supabase: Postgres, Auth, RLS, Storage, Realtime — via `@supabase/ssr` and `@supabase/supabase-js`
- next-intl for i18n: `ar` (RTL, default), `fr`, `en`
- react-hook-form + zod for forms; Recharts for charts
- Deploy target: Vercel. Package manager: npm.
- OS: the developer is on **Windows** (CMD/PowerShell). Use cross-platform commands.

## Supabase
- Project ref: `ndnfeioxagdjjulmjonz` (DEV project). The Supabase MCP server is configured in `.mcp.json`.
- Every schema change = a new SQL migration file in `supabase/migrations/` (timestamped). Never edit an old migration.
- After schema changes, regenerate types into `src/types/database.ts`.
- **Every tenant table has `school_id`** and **RLS enabled** with policies. No exceptions.
- Never run destructive SQL (DROP, TRUNCATE, DELETE without WHERE) without asking first.
- Service role / secret key is used **only on the server** (Server Actions, Route Handlers, Edge Functions). Never import it in client components.
- **School data tables (Phase 4 onward) are never written with the secret key.** Server Actions use the logged-in user's session client; the table grants INSERT/UPDATE/DELETE to `authenticated` and RLS policies allow them only when `school_id = current_school_id()` AND `has_permission('<feature>.manage')` (UPDATE: same condition in USING and WITH CHECK). The secret key is only for auth accounts, platform-owner actions and audit logs.

## Secrets
- Secrets live in `.env.local` (git-ignored). Keep `.env.example` updated with variable NAMES only.
- Never print, log, or commit keys.

## Code conventions
- Server Components by default; `"use client"` only when needed.
- Mutations via Server Actions with zod validation; return typed results `{ ok, data?, error? }`.
- Auth checks: **every page** calls `requireArea()` / `requireUser()` (`src/lib/auth/session.ts`) itself, and every Server Action re-checks the session. Never rely on a layout to protect a page — layouts and pages render in parallel.
- Links/redirects: use `@/i18n/navigation` (locale-aware), not `next/navigation`.
- Folder layout as in `docs/PLAN.md` §6. Feature components in `src/components/features/<feature>/`.
- All UI text goes through next-intl message files (`src/messages/ar.json`, `fr.json`, `en.json`). No hard-coded strings.
- Use logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`) so RTL works. Never `ml-`/`mr-`/`left`/`right` for layout.
- Colors only via design tokens (CSS variables from `docs/DESIGN.md`). No random hex values in components.
- Dates: store UTC, display in `Africa/Casablanca`.
- Keep components small; no file over ~300 lines.

## Definition of done (every phase)
1. `npm run build` and `npm run lint` pass with no errors.
2. Works in Arabic (RTL) and French.
3. RLS tested: a user from school A cannot read school B data — `npm run test:rls` passes, and `npm run test:actions` (app running) for Server Action rules. Add the phase's cases to `scripts/rls/`.
4. Update "Current phase" above and tick the phase in `docs/PLAN.md`.
5. Commit with a clear message, push to GitHub (Vercel deploys automatically).

## Phase 6 progress (updated 2026-10-16, step 1)
Same workflow (show every migration, wait for OK, commit + push each step, test in Chrome AR + FR). Steps: 1 lessons in the DB · 2 class grid (click empty cell to add, weekly hours per class) · 3 teacher + room grids, weekly hours per teacher · 4 drag & drop move/swap with conflicts shown first · 5 copy a class's timetable from last year · 6 teacher's own timetable + parent portal (read-only) · 7 A4 landscape print/PDF per class and teacher (ar RTL + fr, school name + year) · 8 closing pass.

**Done**
- Step 1 — Lessons (migration `phase6_lessons`, no screen yet): `lessons` = year + time slot + class + subject + teacher + optional room. The DB refuses: breaks (`slot_kind` is always 'lesson' and part of the FK to `time_slots (id, school_id, academic_year_id, kind)`, so a slot with lessons cannot become a break either), class / teacher / room twice on one slot (unique keys, **DEFERRABLE INITIALLY IMMEDIATE**), a teacher who does not teach the subject (FK `(teacher_id, subject_id)` → `teacher_subjects`), anything of another school or year (composite FKs). Slots of a year+day never overlap, so same slot = same time. All lesson FKs are NO ACTION: a subject, room, time slot or teacher account used by lessons cannot be deleted; removing a teacher's subject or changing their role is refused while they have lessons of it. Deleting a class deletes its lessons. Permissions (timetable module): `timetable.view` (director, surveillant, accountant, transport manager), `timetable.manage` (director, surveillant); every policy also checks `has_module('timetable')`. Reads: view/manage, a teacher their own lessons, a parent the classes their children are enrolled in (`private.is_guardian_of_class`). `swap_lessons(a, b)` (SECURITY INVOKER) defers the keys and swaps two lessons' slots in one transaction, all or nothing. `timetable_teachers(year)` (SECURITY DEFINER, advisor warning accepted on purpose) returns only id + full name + active: every teacher of the school for timetable staff, otherwise the teachers of the lessons the caller can read; profiles stay closed (no email / phone). `timetable.manage` may read `teacher_subjects`. `is_linked_to_student`: + a teacher with a lesson of the CURRENT year in the student's class that year. Error keys: `setup.errors.subjectHasLessons/roomHasLessons/slotHasLessons`, `teachers.errors.subjectHasLessons`, `staff.errors.teacherHasLessons`. Tests: `phase6-lessons.mjs`, `actions-lesson-blocks.mjs`.
- Test note: `teacher_subjects` rows must be inserted by a signed-in user (its role-check trigger calls a `private` function only `authenticated` may run), not the secret key. A suite that makes its own year current must put the previous current year back.

## Phase 5 — done 2026-10-16 (notes kept for later phases)
Same workflow as Phase 4 (show every migration and Storage policy, wait for OK, commit + push each step, test in Chrome AR + FR). Children's personal data: store only what is needed (no national ID), platform owner has NO access to students.

**Done**
- Step 1 — Students (`/students`, migrations `phase5_students` + `phase5_students_arabic_names_fix`): permissions `students.view` (director, surveillant, accountant, transport manager), `students.manage` + `parents.manage` (director); teachers none (Phase 6). Reads: own school AND (view/manage OR `private.is_linked_to_student(id)`, which returns false today — step 3 adds guardians, Phase 6 teachers; only its body changes). Latin names required, Arabic optional (both or neither — a CHECK must say `is not null`, NULL passes a CHECK). Massar code optional, unique per school, `^[A-Z][0-9]{9}$`, trimmed + uppercased by `normalizeMassar()` (form + CSV). Class = `student_enrollments` (one row per student per year, composite FK to the class of that year and school); edits change only the current year's row. Names shown with `studentName()` / `studentOtherName()` (Arabic in the Arabic UI when present). A class with students cannot be deleted.
- Step 2 — Photos (migration `phase5_student_photos`): private bucket `student-photos` (2 MB, jpg/png/webp), path `<school>/<student>/<uuid>.<webp|jpg>` (CHECK on `students.photo_path`). Storage RLS: upload = own school folder + students.manage + existing student; read/signed URL = only a student's CURRENT photo, for who can read that student (students RLS inside the policy); delete = own folder + students.manage, but Storage also needs read, so **only the current photo can be deleted**: `setStudentPhoto` points at the new file, checks it, points back at the old one to delete it, then at the new one. Browser crops to a 512 px square and re-encodes to WebP (JPEG fallback), which drops EXIF/GPS; originals up to 10 MB. Shown with 5-minute signed URLs (`signPhotoUrls`), plain `<img>` (never the image optimizer). Deleting a student deletes the file first. Avatar fallback = Latin initials (`studentInitials`).
- Step 3 — Parents (`/parents`, `/parents/[id]`, `/portal`, migration `phase5_guardians`): `guardians` (names, mobile `+2126/7XXXXXXXX` unique per school, optional email, optional `profile_id` = parent account, composite FK same school) and `student_guardians` (relation father/mother/tutor, one father + one mother max, composite FKs). Reads: students.view / parents.manage = school's guardians; a parent = only their own guardian row and links (never another parent's phone). `is_linked_to_student`: role parent, not deactivated, own password set, active school. **Parent sign-in = phone + password without SMS**: Supabase's Phone provider is off (needs SMS), so the Auth email is `<212…>@phone.tasyiir.invalid` (`phoneLoginEmail`, reserved domain, never mailed); the login field takes email OR phone (`normalizeMobile`). Phone change → `syncParentAccount` updates the Auth email (same account/password; Supabase gives a bare 500 for a taken email, so we pre-check guardians). One parent account per phone on the platform. Parent phone is NOT copied into profiles (platform owner reads profiles). Every secret-key call checks `isParentAccount` (a guardian row could point at a staff profile). Sign-in goes through `passwordSignIn` (secret key + `Sb-Forwarded-For` = visitor IP) so Supabase's per-IP limit (150 / 5 min) counts each visitor, not our server — needs "IP address forwarding" ON in the dashboard.
- Student page (`/students/[id]`, no migration; names in the list link to it): details card + **Parents** card (students.view reads; parents.manage links an existing guardian with `linkChild`, creates + links in one step with `createGuardianForStudent` — the new guardian is deleted again if the link fails — and unlinks). Father/mother already set are disabled in the relation picker. Search inputs use `[unicode-bidi:plaintext]` so a typed phone is not reversed in Arabic. Tests: `scripts/rls/actions-student-guardians.mjs` (on `/fr/students/:id`).

- Step 4 — Teachers (`/teachers`, migration `phase5_teacher_subjects`): a teacher = a staff account with the school's system role `teacher` (created in Personnel, or "Nouvel enseignant" = the staff dialog with only that role, needs users.manage). `teacher_subjects` (teacher ↔ subject, composite FKs same school, no UPDATE: `setTeacherSubjects` diffs and deletes/inserts). New core permission `teachers.manage` (director). A trigger only lets teacher-role accounts get subjects (raises 23514 — PostgREST does not pass its constraint name, so the action maps the code); an account whose role changes loses its subjects; deleting a subject removes it from teachers. Reads: users.view, teachers.manage, or the teacher's own rows; `profiles_select_teachers` lets teachers.manage read the school's teacher accounts only. Subject chips = colour dot + name. Tests: `phase5-teachers.mjs`, `actions-teachers.mjs`.

- Step 5 — Import (`/students/import`, migration `phase5_import_students`): .xlsx (`read-excel-file`, first sheet) or CSV (`src/lib/students/import/csv.ts`: UTF-8 with/without BOM, UTF-16, Windows-1256 when strict UTF-8 fails; separator `;` `,` or tab from the header line). Headers recognised in ar/fr/en ignoring case/accents/punctuation (`columns.ts`); required: Latin names, birth date, gender, class; optional: Arabic names, Massar code, parent (last name, first name, phone, relation — all 4 or none). Max 2000 rows, 3 MB (Vercel caps bodies at 4.5 MB; `experimental.serverActions.bodySizeLimit` = 4mb). Preview (`previewImport`) and import (`commitImport`) take the SAME file: the import re-reads and re-checks it, refuses if any row has an error, leaves out the lines the user unticked (`exclude`), then calls `public.import_students(jsonb)` — SECURITY INVOKER (RLS as for the forms), one transaction = all or nothing, school and current year always the caller's. A Massar code already in the school → "exists", skipped. Same Latin name + birth date as a student of the school or another line → non-blocking "possible duplicate" warning, the row can be unticked. Parents: found by phone in the school (reused, name kept) or created once (siblings share one). Template .xlsx made in the browser (`write-excel-file`). Tests: `rules-import.mjs`, `phase5-import.mjs`, `actions-import.mjs` (FormData actions: `callActionWithForm`, fields `_1_<name>`).

- Step 6 — closing pass: every People page (students, student page, parents, parent page, teachers, import, parent portal) and its main dialogs checked in Arabic and French at desktop and phone width (no overflow, no untranslated keys, no console errors). Fixed: Latin file types in Arabic import texts showed as "(xlsx.)" / flipped brackets — wrapped in isolates (`⁦…⁩`, as `ltr()` does) in `ar.json`. A Latin run that starts or ends with punctuation (".xlsx", "(…)") inside an Arabic message must be isolated this way.

**Next**
- Phase 6 — Emploi du temps: read `docs/PLAN.md` + `docs/DESIGN.md` first, then propose step 1 and its migration.

## Phase 4 — done 2026-10-15 (notes kept for later phases)
Workflow agreed with the user: one small step at a time; **show every SQL migration and wait for OK before applying**; commit + push after each step; test in Chrome in Arabic and French.

**Done**
- Step 1 — Academic years (`/setup/years`, migration `phase4_academic_years`): one current year per school (trigger), no overlap (btree_gist), < 1 year long, form pre-filled Sept → June. New core permission `structure.manage` (all director roles).
- Step 2 — Levels + filières (`/setup/levels`, migration `phase4_levels_tracks`, tables `levels` + `tracks`): cycles prescolaire/primaire/college/lycee/other, names unique ignoring case, filière kept in its level's school by a composite FK. Moroccan template is app data (`src/lib/structure/level-template.ts`); only missing items are created, a template filière counts in any UI language (`template-names.ts`).
- Step 3 — Classes (`/setup/classes`, migration `phase4_classes`): class = year + level + optional filière of that level (composite FKs), name unique per year ignoring case, ON DELETE RESTRICT (year/level/filière deletes say "still has classes"). Year selector in `?year=` (current by default), cards per level, name suggested "1AC-A", "create several" = prefix + next free letters, all or nothing.
- Date field: `src/components/features/forms/form-date-field.tsx` (`FormDateField`), value `yyyy-MM-dd`, shown dd/MM/yyyy in every language; shadcn Calendar + Popover, week starts Monday, month names ar-MA/fr/en, one-letter Arabic weekdays. Used for every date entered (years, new-school wizard, subscription). Never use `<input type="date">`.
- Step 4 — Subjects + rooms (`/setup/subjects`, `/setup/rooms`, migration `phase4_subjects_rooms`): subject = name + optional code (≤ 6, unique) + colour key from a 12-colour palette (tokens `--subject-<key>` light/dark, `subject-template.ts`); Moroccan subjects template (13, names per UI language, a template subject counts as present by code or by name in any language). Room = name + capacity 1–500 + optional type (classroom/lab/computer_lab/gym). Shared row menu `edit-delete-menu.tsx`.
- Step 5 — School days + time slots (`/setup/time-slots`, migrations `phase4_school_days_time_slots` + `phase4_time_slots_overlap_tsrange`): **per academic year** (changing hours never rewrites past timetables/absences). `school_days` Mon(1)–Sat(6); `time_slots` = day + start/end (whole minutes, start < end, ≤ 4 h) + kind lesson/break + optional label (≤ 40); composite FK slot → its year's school day (a day with slots cannot be removed); no overlap per year+day (exclusion on built-in `tsrange` over a fixed date — a custom range type raised a search_path advisor warning we could not fix, its constructors are owned by supabase_admin). Deleting a year cascades its days + slots. `copy_time_slots(from, to)` (SECURITY INVOKER, all or nothing, target year must have no slots). UI: day switches, a card per day, copy a day to empty days, typical Moroccan week template (`time-slot-template.ts`, break labels in the UI language), copy from another year. Times typed as text ("8h", "8:00" → "08:00"), shown left to right.
- Step 6 — closing pass: every setup page checked in Arabic and French (desktop + phone width, no untranslated keys, no reversed numbers); years and time ranges in Arabic sentences fixed with `ltr()`.

**Decisions**
- School data is written with the user's session client through RLS, never the secret key (rule in the Supabase section above). Shared helpers: `src/lib/structure/action-utils.ts`, `db-errors.ts` (Postgres error → `setup.errors` key, by constraint name).
- Composite FKs `(x_id, school_id)` keep child rows in the same school.
- A year label ("2026-2027") or time range ("08:00–09:00") put into a message goes through `ltr()` (`src/lib/format.ts`), otherwise Arabic shows it reversed ("2027-2026"). A range is one value (`{range}`), not `{start}–{end}`.
- Applied migrations are renamed to the version Supabase records (`list_migrations`).
- Server Actions are only accepted on a page whose bundle uses them: test each on the page that renders it (e.g. account actions on `/parents/[id]`). `scripts/rls/debug-one.mjs <file> <export>` runs one action suite with fresh fixtures.
- Tests: `scripts/rls/phase4*.mjs` (DB) and `actions-*.mjs` (Server Actions, each called on the page that registers it); run the app on port 3100 (`TEST_APP_URL=http://localhost:3100`), port 3000 is the user's dev server.

**Next**
- Phase 5 — People (students, parents, teachers, photos, CSV import): read `docs/PLAN.md` + `docs/DESIGN.md` first, then propose step 1 and its migration.
