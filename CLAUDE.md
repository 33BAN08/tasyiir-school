# Madar School — Claude Code rules

Madar School (مدار), formerly Tasyir, is a **multi-tenant SaaS school management platform** for Moroccan private schools:
absences, emploi du temps, communication, grades, fees, transport, Massar exports, automatic alerts. Live at https://tasyiir-school.vercel.app

**Product renamed to Madar School (interface only, 2026-10-25).** Every user-visible name says Madar / Madar School / مدار (`BRAND` in `src/lib/brand.ts`, messages, manifest, service worker texts, logo `public/brand/madar-logo.svg` + `madar-logo-white.svg`). **Internal names stay `tasyiir` / `tasyir` on purpose:** repo and package `tasyiir-school`, Supabase project names, pg_cron jobs `tasyiir-*` / `tasyir-*`, parent sign-in domain `@phone.tasyiir.invalid`, localStorage keys (`tasyiir:rollcall:v1:`, `tasyiir:grades:v1:`, `tasyir:install-card:…`), service-worker cache prefix `tasyir-offline-`, push test tag `tasyir-test`, the square icon files `tasyir-icon*`, test file names, the Vercel URL. In Arabic, "تسيير" as the common noun "management" now says "إدارة".

- Full plan & phases: `docs/PLAN.md` · Brand, UI & UX rules: `docs/DESIGN.md` · Detailed notes of finished work: `docs/history/` (index at the end).
- **Always read PLAN.md + DESIGN.md before starting a phase.** Work on ONE phase at a time. Don't build ahead.
- Before touching a feature, read its history file: it holds the table / function / error-key names, decisions and test notes.

## Current state
> **Phase 11 — Grades + report cards: closing pass in progress (step 9).** Steps 1–5, 7, 8 live on production; demo marks (`demo_grades`) + school dashboard (`dashboard_aggregates`) live (main `94bbde3`). **Step 6 (outside exams + final weights) POSTPONED** until directors confirm the exam rules (open questions in `docs/PLAN.md` § 7, phase 11 / item 11.6). Closing pass so far (2026-10-28, not committed yet): new `scripts/rls/phase11-cross-school.mjs` (82 checks) added to `run.mjs`; full `test:rls` 1937 passed / 3 skipped / 0 failed with it; full `test:actions` **not finished** (run aborted, test server stopped); PLAN.md tick written but uncommitted. Still to do: full `test:actions`, demo reset check, FR + AR phone check, then commit.
> **Before the first real school (open):** Supabase Pro (daily backups) + add "sauvegardes quotidiennes" back to the home page · Vercel Pro (Hobby is non-commercial) · CNDP declaration under law 09-08 (hosting in Ireland; receipt number on /privacy) · lawyer review of /privacy + /terms · OMPIC registration for "Madar" (+ RC / ICE / address on legal pages if wanted) · Vercel Preview env = DEV keys (never production; Preview / Development have no Supabase vars today) · own the product domain (`madarapp.ma`, not confirmed) before custom SMTP, and move the demo emails `@demo.tasyir.ma` to it with the seed `--refresh` · demo school name "École Démo Tasyir" still to rename (seed script + database).
> **Other open items:** teacher home lesson states (now / done / later + roll call from the card) still to check on a school day (`docs/history/app-refresh.md`); students "left the school" status (PLAN.md). Non-teacher roles without dashboard cards keep `WelcomePlaceholder`.
> Update this block when a step or phase finishes.

## Security rules (never break these)
1. **Migration first.** Every schema change = a new timestamped SQL file in `supabase/migrations/`; never edit an old one. **Show every migration (and Storage policy) and wait for the user's OK before applying it.** DEV is applied through the Supabase MCP (DEV only). Rename the file to the version Supabase records (`list_migrations`). Regenerate `src/types/database.ts` after.
2. **The local Supabase CLI is linked to PRODUCTION** (`blycnuuomfqgvfczkbxc`, `supabase/.temp/project-ref`). **Never run any `supabase db …` or `supabase migration …` command without the user's explicit OK for that command.** The user pushes migrations to production themself.
3. **No `git push` without the user's OK.** Commit locally after each step; ask before pushing (a push to main deploys to Vercel Production). Never push code that needs a migration before the user has pushed that migration to production.
4. **Never read, print, log or commit `.env*.local`** (`.env.local` = DEV, `.env.prod.local` = production) or any key. Keep `.env.example` with variable NAMES only. Passwords are typed by the user in their own terminal (not with `!`).
5. **Never test against production.** `scripts/rls/guard.mjs` is the FIRST import of every test entry point (`run.mjs`, `debug-one.mjs`, `cleanup-run.mjs`, `fixtures.mjs`, `app.mjs`) and exits 2 on any production ref, any `PROD_*` variable, a non-DEV Supabase URL or a non-localhost `TEST_APP_URL`. A new entry point that touches Supabase imports it first. Reads of production for DEV ↔ prod comparisons go through `scripts/compare/` (read-only transaction) and only when the user asks.
6. **Every tenant table has `school_id` and RLS enabled** with policies. No exceptions.
7. **Revoke first.** Every new table in `public` starts with `revoke all on public.<table> from anon, authenticated;`, then grants only what its policies use (column grants for column-limited updates). Supabase's default privileges give anon + authenticated ALL. anon / authenticated hold nothing on sequences: new tables use uuid or identity ids; a serial column on a table they insert into needs an explicit `grant usage` in the same migration. New functions callable by users: `revoke … from public, anon`, grant execute to authenticated only where meant.
8. **School data is written with the user's session client through RLS, never the secret key.** Policies: `school_id = current_school_id()` AND `has_permission('<feature>.manage')` (UPDATE: same in USING and WITH CHECK), plus `has_module('<module>')` for module features. The secret key is only for auth accounts, platform-owner actions, audit logs, and server-only jobs — and only on the server (Server Actions, Route Handlers); never import it in client components.
9. **`private.reset_demo_school` covers every new table with a `school_id`** (in dependency order) unless it is meant to be kept (kept: schools, profiles, roles, role_permissions, school_modules, school_subscriptions, alert_rules, school_contacts). `phase-launch-demo.mjs` fails otherwise (update its `KEPT` list / table count / `FILLED`).
10. **Lists that can pass 1000 rows use `readAll()`** (`src/lib/supabase/read-all.ts`): the Data API returns at most 1000 rows per call, table reads AND set-returning RPCs. Page on a UNIQUE order key. Guard `scripts/rls/rules-paged-reads.mjs`: every read of `lessons`, `attendance_marks`, `class_averages` is paged or listed in its `ALLOWED` map with the narrow filter that keeps it small.
11. **Parents and students never read raw grades** (`grades`, `council_remarks`): they only read published snapshots (`report_cards` / `grade_publications`, written only by `publish_grades`). Teachers read only their own class + subject pairs and no report card.
12. **No destructive SQL** (DROP, TRUNCATE, DELETE without WHERE) without asking first. Platform owner has NO access to students' data.
13. **A migration that rewrites a CHECK list copies the CURRENT one from the database** (`select pg_get_constraintdef(oid) from pg_constraint where conname = '…'`), never from an older migration (a lost `demo_request` type once broke the demo form). `notification-types.mjs` inserts one row of every type in use: add a new type there.
14. Every page calls `requireArea()` / `requireUser()` (`src/lib/auth/session.ts`) itself and every Server Action re-checks the session. Never rely on a layout.

## Workflow
- One small step at a time. For each step: propose the plan (and its migration), wait for OK, build, test, commit, report, wait for OK before the next step.
- Test every screen in a browser in **Arabic (RTL) and French**, phone (390 px) and desktop (1366 px): no horizontal overflow (`scrollWidth`, `innerWidth === width`, `scrollX === 0`), no raw message keys, no console errors, touch targets ≥ 44 px.
- Each phase ends with a closing pass: build + lint, full `test:rls` + `test:actions`, a `phaseN-cross-school.mjs` suite (school A — parent, teacher, surveillant, director — reads / changes / receives nothing of school B, Realtime included, with a control that B's own users do), browser sweep, PLAN.md tick, this file's "Current state".
- Commit messages through a file (`git commit -F`; PowerShell 5.1 breaks `-m` with double quotes). End with the Co-Authored-By line.
- Vercel deploy state: no `gh` CLI; read GitHub's public commit-status API.

## Tech stack (do not change without asking)
- Next.js (latest, App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui, lucide-react icons
- Supabase: Postgres, Auth, RLS, Storage, Realtime — via `@supabase/ssr` and `@supabase/supabase-js`
- next-intl for i18n: `ar` (RTL, default), `fr`, `en`
- react-hook-form + zod for forms; Recharts for charts; `web-push` (server only) for Web Push
- Deploy target: Vercel (function region `dub1`). Package manager: npm.
- OS: the developer is on **Windows** (CMD/PowerShell). Use cross-platform commands.

## Supabase
- DEV project ref: `ndnfeioxagdjjulmjonz` (MCP in `.mcp.json`, DEV only). Production: `blycnuuomfqgvfczkbxc` (organization "Tasyir", eu-west-1, FREE plan for now — upgrade to Pro before the first school enters real data). Both show a "main PRODUCTION" branch badge in the dashboard: check the project ref in the address bar.
- Production Auth: sign-ups OFF (accounts are created with the server key); "IP address forwarding" ON in both projects (Authentication → Rate Limits) — `passwordSignIn` sends the visitor IP in `Sb-Forwarded-For`; without it every school shares Vercel's IP limit. Not readable through the MCP: re-check after any project change.
- The Supabase MCP asks for a confirmation step on SQL containing DELETE ("Invalid or expired requestState" = nothing applied, retry). To remove a test row, use the secret key from a `node -e` in the project.
- DEV ↔ production comparisons: normalise line endings (production function bodies have CRLF from this Windows checkout; DEV gets LF through the MCP).
- **If a Supabase Auth upgrade errors** with hint `demo_locked`: turn the demo flag off (`update public.schools set is_demo = false where is_demo`), let it finish, turn it back on.
- Dates: store UTC, display in `Africa/Casablanca`. **"Today" / "now" for school logic always come from the database** (`private.school_today()`, `public.school_clock()`, `schoolClock()` in `src/lib/attendance/clock.ts`), never Node: Morocco is UTC+0 permanently since 2026-09-20 (tzdata 2026c) and Node / Windows here still say UTC+1. Times shown in the UI are formatted in the BROWSER.
- pg_cron jobs (each project its own): `tasyiir-absence-notifications` (every minute), `tasyiir-daily-alerts` (hourly: 08:00 subscription reminders, 19:00 alerts), `tasyir-push-retry` (every minute), `tasyir-trial-expiry` (hourly, minute 5), `tasyir-demo-reset` (hourly, acts at 03:00). Push delivery URL + secret live in production's Vault only (never DEV).
- Composite FKs `(x_id, school_id)` keep child rows in the same school. Postgres errors map to message keys by constraint name (`src/lib/structure/db-errors.ts`). A CHECK with `x between a and b` passes on NULL: say `is not null`.

## Code conventions
- Server Components by default; `"use client"` only when needed. A constant exported from a `"use client"` file reaches server components as a client reference, not its value: put shared constants in a plain module. An exported helper in a `"use server"` file becomes a callable action: put it in a `server-only` module.
- Mutations via Server Actions with zod validation; return typed results `{ ok, data?, error? }`; audit important writes (`audit_logs`).
- Links/redirects: use `@/i18n/navigation` (locale-aware), not `next/navigation`. "Go home" redirects go to `/start` (`/[locale]` is the public landing).
- Folder layout as in `docs/PLAN.md` §6. Feature components in `src/components/features/<feature>/`.
- All UI text through next-intl (`src/messages/ar.json`, `fr.json`, `en.json`), keys identical in the three files. No hard-coded strings.
- Logical CSS (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`). Never `ml-`/`mr-`/`left`/`right` for layout. A year label or time range inside a message goes through `ltr()` (`src/lib/format.ts`); names through `isolate()`; a Latin run starting / ending with punctuation inside an Arabic message is wrapped in isolates in `ar.json`.
- Colors only via design tokens (CSS variables from `docs/DESIGN.md`). `--sand` is decoration only, never text.
- Dates entered with `FormDateField` (never `<input type="date">`); times typed as text.
- An `sr-only` span inside an `overflow-x-auto` scroller escapes it on phones: give the scroller `relative`. Wide tables scroll inside their card (`SidebarInset className="min-w-0"`).
- Photos / files: private buckets, short signed URLs, re-encoded in the browser (EXIF / GPS dropped), plain `<img>` (never the image optimizer).
- Keep components small; no file over ~300 lines.

## Testing
- `npm run test:rls` (DB / RLS) and `npm run test:actions` (Server Actions + pages, app running). Run the app for tests on port **3100** with `node node_modules/next/dist/bin/next start -p 3100` after a fresh build (not `npx next start`: stopping the wrapper leaves an old build answering; HTTP 409 "action not found" = old build). Port 3000 is the user's dev server. Check who listens: `Get-NetTCPConnection -LocalPort 3100`.
- The full `test:actions` run takes > 10 min: run it in the background. One suite: `node --env-file=.env.local scripts/rls/debug-one.mjs <file> <export>`. Interrupted run: `scripts/rls/cleanup-run.mjs <run>` (8-hex run id from the leftover `rls-test-a-<run>` slug).
- Server Actions are only accepted on a page whose bundle uses them: call each on the page that renders it.
- Lessons are Monday–Saturday: teacher same-day checks are SKIPPED on Sundays (printed, never counted as passed).
- HTML checks: the page also embeds the message catalogue and repeats props in the RSC payload — look for rendered attributes (`data-*`). `notFound()` / redirects inside a streamed page answer 200 with `NEXT_HTTP_ERROR_FALLBACK;404` / `NEXT_REDIRECT;…` in the HTML. Streamed pages can fill parts later (`<template id="P:n">`): never slice HTML per sheet.
- Browser tests: headless Chrome + CDP with its own profile when the Chrome extension is absent; sign real accounts in by magic link (`generateLink` + `verifyOtp`, passwords untouched); set fields with `Input.insertText`; accept "leave page?" dialogs with `Page.handleJavaScriptDialog`; offline = stop the server (Playwright's setOffline does not cut service-worker traffic); PDFs via `Page.printToPDF({ preferCSSPageSize: true })`. Test accounts live in `.env.local` only — never print them.
- `teacher_subjects` rows must be inserted by a signed-in user, not the secret key. A suite that makes its own year current puts the previous one back. Never call `run_daily_alerts` with a future day while a real school has alerts on.

## Definition of done (every phase)
1. `npm run build` and `npm run lint` pass with no errors.
2. Works in Arabic (RTL) and French.
3. RLS tested: a user from school A cannot read school B data — `npm run test:rls` passes, and `npm run test:actions` (app running). Add the phase's cases to `scripts/rls/`.
4. Update "Current state" above, tick the phase in `docs/PLAN.md`, and move the phase's detailed notes to `docs/history/phase-XX.md`.
5. Commit with a clear message; push to GitHub only after the user's OK (Vercel deploys automatically).

## History index (`docs/history/`)
Detailed decisions, table / function / error-key names and test notes, moved verbatim from this file on 2026-10-30.
- Phases 0–3 (setup, auth, platform owner, staff accounts): no separate notes — see `docs/PLAN.md`.
- [Phase 4 — School structure](docs/history/phase-04.md): years, levels / filières, classes, subjects, rooms, school days + time slots.
- [Phase 5 — People](docs/history/phase-05.md): students, photos, parents (phone sign-in), teachers, import.
- [Phase 6 — Emploi du temps](docs/history/phase-06.md): lessons, grids, move / swap, copy from a year, read-only views, print.
- [Phase 7 — Absences + justifications](docs/history/phase-07.md): attendance sessions / marks, roll call, staff views, justifications + bucket.
- [Phase 8 — Notifications + alerts](docs/history/phase-08.md): notifications, absence notices, bell + Realtime, alert rules, daily alerts, subscription reminders.
- [Phase 9 — Announcements, remarks, contact card](docs/history/phase-09.md).
- [Phase 10 — Parent app on the phone](docs/history/phase-10.md): manifest, service worker, install card, Web Push, preferences.
- [Phase 11 — Grades + report cards](docs/history/phase-11.md): grading setup, grades, entry grid, averages, publishing, report card print (+ the archived status line).
- [Launch prep](docs/history/launch-prep.md): production project, test guard, plan limits, demo school + seed script, trial, legal pages, pricing.
- [School dashboard](docs/history/dashboard.md): director / staff dashboard + aggregates, demo marks.
- [App refresh](docs/history/app-refresh.md): parent home, teacher home, sign-in.
- [Public home page + brand](docs/history/home-page.md): landing, demo requests, Madar home, logo & palette.
