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
