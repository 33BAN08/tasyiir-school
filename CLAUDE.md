# Tasyiir School — Claude Code rules

Tasyiir School (تسيير) is a **multi-tenant SaaS school management platform** for Moroccan private schools:
absences, emploi du temps, communication, grades, fees, transport, Massar exports, automatic alerts.

- Full plan & phases: `docs/PLAN.md`
- Brand, UI & UX rules: `docs/DESIGN.md`
- **Always read both before starting a phase.** Work on ONE phase at a time. Don't build ahead.

## Current phase
> **Phase 4 — School structure** (update this line when a phase is finished). Phases 0–3 done — live at https://tasyiir-school.vercel.app

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

## Phase 4 progress (updated 2026-10-14)
Workflow agreed with the user: one small step at a time; **show every SQL migration and wait for OK before applying**; commit + push after each step; test in Chrome in Arabic and French.

**Done**
- Step 1 — Academic years (`/setup/years`, migration `phase4_academic_years`): one current year per school (trigger), no overlap (btree_gist), < 1 year long, form pre-filled Sept → June. New core permission `structure.manage` (all director roles).
- Step 2 — Levels + filières (`/setup/levels`, migration `phase4_levels_tracks`, tables `levels` + `tracks`): cycles prescolaire/primaire/college/lycee/other, names unique ignoring case, filière kept in its level's school by a composite FK. Moroccan template is app data (`src/lib/structure/level-template.ts`); only missing items are created, a template filière counts in any UI language (`template-names.ts`).
- Step 3 — Classes (`/setup/classes`, migration `phase4_classes`): class = year + level + optional filière of that level (composite FKs), name unique per year ignoring case, ON DELETE RESTRICT (year/level/filière deletes say "still has classes"). Year selector in `?year=` (current by default), cards per level, name suggested "1AC-A", "create several" = prefix + next free letters, all or nothing.

**Decisions**
- School data is written with the user's session client through RLS, never the secret key (rule in the Supabase section above). Shared helpers: `src/lib/structure/action-utils.ts`, `db-errors.ts` (Postgres error → `setup.errors` key, by constraint name).
- Composite FKs `(x_id, school_id)` keep child rows in the same school.
- Applied migrations are renamed to the version Supabase records (`list_migrations`).
- Tests: `scripts/rls/phase4*.mjs` (DB) and `actions-*.mjs` (Server Actions, each called on the page that registers it); run the app on port 3100 (`TEST_APP_URL=http://localhost:3100`), port 3000 is the user's dev server.

**Next**
- Date field (agreed 2026-10-14, before step 4): one reusable field showing dd/MM/yyyy (shadcn Calendar + Popover, week starts Monday, month names in ar/fr/en), used everywhere dates are entered, academic years included.
- Step 4 — Subjects + rooms. Step 5 — School days (Mon–Sat) + time slots per day with breaks, no overlap. Step 6 — close the phase (AR/FR pass, tick PLAN).
