# Tasyir School

Multi-tenant school management SaaS for Moroccan private schools.

- Plan & phases: [`docs/PLAN.md`](docs/PLAN.md)
- Design & brand: [`docs/DESIGN.md`](docs/DESIGN.md)
- Rules for contributors / Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

## Stack

Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui · Supabase (Postgres, Auth, RLS, Storage, Realtime) · next-intl (ar / fr / en) · Vercel.

Database migrations live in `supabase/migrations/`.
