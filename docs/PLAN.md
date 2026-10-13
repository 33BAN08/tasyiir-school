# Tasyiir School — Product & Build Plan

## 1. Vision
A multi-tenant SaaS sold to private schools in Morocco. The **platform owner** (Tasyiir) manages client schools,
plans and modules. Each **school** has a director who creates staff accounts and runs the school.

```
TASYIIR PLATFORM (platform owner)
├── School A (tenant) → Director → staff, teachers, parents, students
├── School B
└── School C
```

## 2. Roles
| Level | Role | Main abilities |
|---|---|---|
| Platform | platform_owner | Create schools + director, plans/modules, suspend/activate, usage stats, support impersonation (read-only), audit logs |
| School | director | Everything in their school; creates staff accounts; edits role permissions |
| School | surveillant | Absences, justifications, timetable |
| School | accountant | Fees, payments, receipts |
| School | transport_manager | Vehicles, routes, students on transport |
| School | teacher | Own timetable, attendance, grades, cahier de textes, messages |
| School | parent | Children's absences, grades, fees, bus, messages, justifications |
| School | student | Timetable, grades, absences |
| School | driver | Route view, mark pickup/drop-off |

Permissions are data-driven: `roles` + `role_permissions` (e.g. `fees.view`, `grades.edit`). Director can adjust.
Staff accounts are created via the Supabase Admin API **server-side only** (invite email or temporary password + forced change).

## 3. Modules (sold per plan)
- **Basic:** attendance, timetable, messaging, announcements
- **Pro:** + grades & report cards, automatic alerts, Massar export
- **Premium:** + fees & payments, transport, SMS/WhatsApp alerts

Expired subscription → school becomes read-only. Disabled module → routes blocked in middleware + RLS.

### Module details
- **School setup:** academic years, levels, classes, subjects, rooms, time slots.
- **People:** students (photo, code Massar, parents), parents, teachers (subjects). CSV + Massar Excel import.
- **Emploi du temps:** weekly grid per class/teacher/room, drag & drop, conflict detection (teacher/room/class double booking), PDF export.
- **Absences:** teacher opens "current session" from timetable → all present by default → tap absent/late → save. Staff corrections. History & totals.
- **Justifications:** parent uploads proof (photo/PDF) → staff approve/reject.
- **Communication:** realtime chat parent↔teacher, teacher↔admin; announcements by school/level/class.
- **Grades:** terms, assessments (contrôle/devoir/exam), coefficients, grade entry grid, averages, rank, bulletin PDF, publish to parents.
- **Fees:** fee types, fee plans per level, discounts (siblings/scholarship), monthly invoice generation, payments (cash/cheque/transfer, partial), PDF receipts, overdue list. Online payment (CMI) later.
- **Transport:** vehicles (insurance expiry), drivers, routes & stops, student assignment, pickup/drop-off logs + parent notification. GPS later.
- **Massar:** Excel exports (students, absences, grades) + student import. ⚠️ Match columns to a REAL Massar sample file (to be provided in `docs/samples/`).
- **Alerts engine:** see §5.
- **Dashboards:** school (absence rate, top absents, revenue, unpaid) and platform (schools, students, MRR).

## 4. Database (Supabase Postgres)
Every tenant table: `school_id uuid not null references schools(id)`, RLS enabled, `created_at`, `updated_at`.

```
-- Core / tenant
schools (id, name, slug, logo_url, city, phone, address, settings jsonb, status)
profiles (id → auth.users, school_id nullable for platform_owner, role_id, full_name, phone, avatar_url, locale, must_change_password)

-- Platform
plans (id, name, price_monthly, price_yearly, max_students)
modules (key primary: attendance|timetable|messaging|grades|alerts|massar|fees|transport)
plan_modules (plan_id, module_key)
school_subscriptions (school_id, plan_id, status[trial|active|suspended|expired], start_date, end_date, trial_ends_at)
school_modules (school_id, module_key, enabled)   -- override
platform_invoices (id, school_id, amount, status, due_date, paid_at)
audit_logs (id, school_id, actor_id, action, entity, entity_id, data jsonb, created_at)

-- Permissions
roles (id, school_id nullable for system roles, key, name)
role_permissions (role_id, permission_key)

-- School structure
academic_years (id, school_id, label, start_date, end_date, is_current)
levels (id, school_id, name, order)
classes (id, school_id, level_id, academic_year_id, name)
subjects (id, school_id, name, color)
rooms (id, school_id, name, capacity)
time_slots (id, school_id, day_of_week, start_time, end_time)

-- People
students (id, school_id, class_id, profile_id nullable, first_name, last_name, code_massar, birth_date, gender, photo_url)
parent_students (parent_id, student_id, relation)
teacher_subjects (teacher_id, subject_id)

-- Timetable & attendance
timetable_entries (id, school_id, class_id, subject_id, teacher_id, room_id, day_of_week, start_time, end_time, academic_year_id)
sessions (id, school_id, timetable_entry_id, date, status, notes)
attendance (id, school_id, session_id, student_id, status[present|absent|late], minutes_late, marked_by, note)
justifications (id, school_id, student_id, from_date, to_date, reason, file_url, status[pending|approved|rejected], reviewed_by)
lesson_logs (id, school_id, session_id, content, homework)   -- cahier de textes

-- Communication
conversations (id, school_id, type, title)
conversation_members (conversation_id, profile_id, last_read_at)
messages (id, school_id, conversation_id, sender_id, body, attachment_url, created_at)
announcements (id, school_id, target_type[school|level|class], target_id, title, body, created_by)
notifications (id, school_id, profile_id, type, payload jsonb, read_at)

-- Grades
terms (id, school_id, academic_year_id, name, start_date, end_date)
subject_coefficients (school_id, level_id, subject_id, coefficient)
assessments (id, school_id, class_id, subject_id, teacher_id, term_id, type, title, date, max_score, weight, published)
grades (school_id, assessment_id, student_id, score, comment)
report_cards (id, school_id, student_id, term_id, average, rank, pdf_url, published_at)

-- Fees
fee_types (id, school_id, name, recurring)
fee_plans (id, school_id, level_id, fee_type_id, amount, months int[])
discounts (id, school_id, name, type[percent|fixed], value)
student_discounts (school_id, student_id, discount_id)
student_invoices (id, school_id, student_id, fee_type_id, period, amount, discount, due_date, status[unpaid|partial|paid])
payments (id, school_id, invoice_id, amount, method, reference, received_by, paid_at, receipt_no)

-- Transport
vehicles (id, school_id, plate, capacity, insurance_expiry)
routes (id, school_id, name, vehicle_id, driver_id)
route_stops (id, school_id, route_id, name, order, pickup_time, lat, lng)
student_transport (school_id, student_id, route_id, stop_id)
transport_logs (id, school_id, route_id, student_id, date, type[pickup|dropoff], at)

-- Alerts
alert_rules (id, school_id, type, enabled, threshold, channels text[])
alert_logs (id, school_id, rule_type, recipient_id, channel, status, payload jsonb, sent_at)
```

## 5. Automatic alerts
| Trigger | Recipients | Mechanism |
|---|---|---|
| Student marked absent | Parent (instant) | DB trigger → notification |
| ≥ N unjustified absences / month | Parent + surveillant | Daily cron |
| Repeated lateness | Parent | Daily cron |
| Grade published / below threshold | Parent | Trigger on publish |
| Fee overdue X days | Parent → accountant | Daily cron |
| Bus pickup / drop-off | Parent | Trigger on transport_logs |
| Vehicle insurance expiring | Transport manager | Daily cron |
| Subscription expiring | Director + platform owner | Daily cron |

Channels: in-app (Realtime) → email (Resend) → SMS/WhatsApp (premium, later). Cron via Supabase pg_cron or Vercel Cron.
Schools configure rules in `alert_rules`.

## 6. Folder structure
```
tasyiir-school/
├── CLAUDE.md
├── docs/ (PLAN.md, DESIGN.md, samples/)
├── supabase/ (migrations/, seed.sql)
├── src/
│   ├── app/
│   │   ├── (marketing)/            landing, pricing, request demo
│   │   ├── platform/               platform owner dashboard
│   │   └── [locale]/
│   │       ├── (auth)/login/
│   │       ├── (school)/           dashboard, staff, setup, students, teachers, timetable,
│   │       │                       attendance, grades, fees, transport, messages,
│   │       │                       announcements, alerts, massar, settings
│   │       ├── (parent)/           mobile-first portal
│   │       └── (driver)/
│   ├── components/ (ui/, features/, layout/)
│   ├── lib/ (supabase/{client,server,admin,middleware}.ts, auth/, permissions/, validations/, utils/)
│   ├── messages/ (ar.json, fr.json, en.json)
│   └── types/database.ts
└── middleware.ts                   auth + locale + role + subscription/module guard
```

## 7. Phases
- [x] **0. Setup** — see §8
- [x] **1. Multi-tenant foundation** — schools, profiles, roles & permissions tables, RLS helpers (`current_school_id()`, `has_permission()`), auth (login/logout/forced password change), i18n ar/fr/en + RTL, app shell (sidebar, topbar, language switch, dark mode)
- [x] **2. Platform dashboard** — schools list, new-school wizard (school + director account + plan), plans & modules, subscription status, suspend/activate
- [x] **3. Staff management (director)** — create/invite staff, assign roles, edit role permissions, deactivate accounts
- [ ] **4. School structure** — years, levels, classes, subjects, rooms, time slots
- [ ] **5. People** — students, parents, teachers, photos (Storage), CSV import
- [ ] **6. Emploi du temps** — grid, drag & drop, conflict detection, PDF
- [ ] **7. Absences + justifications**
- [ ] **8. Alerts engine + notifications** (in-app + email)
- [ ] **9. Messaging + announcements**
- [ ] 🎯 **MVP = Basic plan → deploy demo, start showing schools**
- [ ] **10. Grades + report cards**
- [ ] **11. Massar import/export**
- [ ] **12. Fees + payments + receipts**
- [ ] **13. Transport + driver view**
- [ ] **14. Dashboards & reports** (school + platform revenue)
- [ ] **15. Demo polish** — rich seed data, "login as demo Director/Teacher/Parent" buttons, landing + pricing page, PWA

## 8. Phase 0 — Setup (detailed)
1. Scaffold Next.js (TypeScript, App Router, Tailwind, ESLint, `src/` dir, alias `@/*`).
   The folder already contains `CLAUDE.md`, `docs/`, `.mcp.json`, `.claude/` → scaffold in a temp folder and move files in, keeping existing ones.
2. Install & init shadcn/ui; add base components (button, input, card, dialog, dropdown-menu, table, sonner, form, select, avatar, badge, sheet, skeleton).
3. Install `@supabase/supabase-js`, `@supabase/ssr`, `next-intl`, `zod`, `react-hook-form`, `@hookform/resolvers`, `lucide-react`.
4. Create `src/lib/supabase/client.ts`, `server.ts`, `admin.ts` (server-only), and session-refresh middleware.
5. Create `.env.example` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, NEXT_PUBLIC_APP_URL). Ensure `.env*.local` is git-ignored. Developer fills `.env.local`.
6. Apply design tokens from `docs/DESIGN.md` (CSS variables, fonts IBM Plex Sans Arabic + Inter via next/font).
7. Init Supabase CLI folder (`supabase/migrations`, `seed.sql`).
8. Simple home page showing "Tasyiir School" in the brand style + a Supabase connection check.
9. `git init`, first commit, push to GitHub `33BAN08/tasyiir-school`.
10. Developer imports the repo in Vercel and adds the env variables → live URL.
