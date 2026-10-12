# Tasyiir School — Design & Brand Guide

> Status: **v0.1 draft** (teal + saffron direction). Final logo & mockups to come; update this file when they do.

## Brand
- **Name:** Tasyiir (تسيير) — "running things smoothly". Product: *Tasyiir School*.
- **Personality:** trustworthy, calm, modern, quietly Moroccan. Never childish, never cluttered.
- **Tone:** French formal "vous"; Arabic = clear Modern Standard Arabic; short sentences, no jargon.
- **White-label feel:** each school's logo & name appear in its space; "Powered by Tasyiir" in the footer.

## Colors (CSS variables — use tokens, never raw hex in components)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--primary` | `#0F766E` (teal 700) | `#14B8A6` | Main actions, active nav, links |
| `--primary-foreground` | `#FFFFFF` | `#042F2E` | Text on primary |
| `--accent` | `#F59E0B` (saffron) | `#FBBF24` | Highlights, badges, key numbers — sparingly |
| `--background` | `#F8FAFC` | `#0B1220` | Page |
| `--card` | `#FFFFFF` | `#111A2E` | Cards, panels |
| `--foreground` | `#0F172A` | `#E2E8F0` | Main text |
| `--muted-foreground` | `#64748B` | `#94A3B8` | Secondary text |
| `--border` | `#E2E8F0` | `#1E293B` | Borders, dividers |

**Status colors (same meaning everywhere):**
| Status | Color | Token |
|---|---|---|
| Present / Paid / Success | `#16A34A` | `--success` |
| Absent / Unpaid / Error | `#DC2626` | `--danger` |
| Late / Partial / Warning | `#D97706` | `--warning` |
| Justified / Info | `#2563EB` | `--info` |

Always pair color with an icon or label (accessibility).

## Typography
- **IBM Plex Sans Arabic** for UI (Arabic + Latin), loaded with `next/font`.
- **Inter** (tabular numbers) for tables, grades, amounts.
- Scale: 12 / 14 (body) / 16 / 20 / 24 / 30. Weights 400, 500, 600.
- Arabic line-height ≥ 1.6.

## Layout
- **Admin/staff:** desktop-first. Collapsible sidebar (start side), topbar (school switcher for platform owner, search, notifications, language, profile).
- **Parent / teacher / driver:** mobile-first PWA. Bottom navigation, cards, big tap targets (≥ 44px).
- Radius: 10px cards, 8px inputs/buttons. Soft shadows only on raised elements.
- Spacing on a 4px grid. Max content width 1280px.
- RTL: use logical properties only (`ms/me/ps/pe/start/end`). Mirror directional icons (arrows, chevrons).

## UX rules
- **Attendance in < 10 seconds:** "My current class" card on teacher home → everyone present by default → tap absent/late → save.
- Every list: search, filters, pagination, empty state with a clear action, loading skeletons.
- Toast on every success/error. Confirmation dialog before delete or bulk actions.
- Forms: inline validation, labels above fields, primary button at the end.
- Numbers: MAD currency `1 250,00 DH`; dates `dd/MM/yyyy`; week starts Monday.
- Dark mode supported everywhere.

## Brand assets (to produce)
- Logo: mark combining a calendar grid + check (ت / T), wordmark in Arabic & Latin.
- Favicon / PWA icons (192, 512), OG image.
- Subtle zellige-inspired geometric pattern — **only** on login, landing, empty states. Never in data screens.

## Key screens (mockups to come)
1. Platform owner dashboard (clients, MRR, new school wizard)
2. Director dashboard (absence rate, alerts, unpaid fees)
3. Emploi du temps grid
4. Teacher attendance sheet (mobile)
5. Parent home (mobile)
