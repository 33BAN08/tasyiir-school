# Tasyiir School — Claude Code rules

Tasyiir School (تسيير) is a **multi-tenant SaaS school management platform** for Moroccan private schools:
absences, emploi du temps, communication, grades, fees, transport, Massar exports, automatic alerts.

- Full plan & phases: `docs/PLAN.md`
- Brand, UI & UX rules: `docs/DESIGN.md`
- **Always read both before starting a phase.** Work on ONE phase at a time. Don't build ahead.

## Current phase
> **Phase 5 — People** (update this line when a phase is finished). Phases 0–4 done — live at https://tasyiir-school.vercel.app

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
- Tests: `scripts/rls/phase4*.mjs` (DB) and `actions-*.mjs` (Server Actions, each called on the page that registers it); run the app on port 3100 (`TEST_APP_URL=http://localhost:3100`), port 3000 is the user's dev server.

**Next**
- Phase 5 — People (students, parents, teachers, photos, CSV import): read `docs/PLAN.md` + `docs/DESIGN.md` first, then propose step 1 and its migration.
