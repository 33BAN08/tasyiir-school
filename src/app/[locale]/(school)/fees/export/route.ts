import type { NextRequest } from "next/server";

import { logAudit } from "@/lib/audit";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { blockedPath, getCurrentUser, getPermissions } from "@/lib/auth/session";
import { journalCsv, unpaidCsv } from "@/lib/fees/report-csv";
import { journalRange, unpaidMonthFilter } from "@/lib/fees/report-rules";
import { getJournal, getUnpaid } from "@/lib/fees/reports";
import { getFeeMonths } from "@/lib/fees/setup";
import { routing, type Locale } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

// CSV exports of the unpaid list and the journal (Phase 13 step 7): the same
// reads as the pages, with the caller's session (RLS), after the same checks
// (signed in, school not suspended, account active, fees.view, fees module).
// Each export is written to the audit log (it carries parents' phones).

const deny = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: NextRequest, { params }: RouteContext<"/[locale]/fees/export">) {
  const { locale: raw } = await params;
  const locale: Locale = routing.locales.includes(raw as Locale) ? (raw as Locale) : routing.defaultLocale;
  const user = await getCurrentUser();
  if (!user) return deny(401);
  if (!user.schoolId || blockedPath(user)) return deny(403);
  const [permissions, modules] = await Promise.all([getPermissions(), getModules()]);
  if (!permissions.has("fees.view") || !modules.has("fees")) return deny(403);

  const q = request.nextUrl.searchParams;
  const report = q.get("report");
  let csv: string;
  let file: string;
  let data: Record<string, string | number | boolean | null>;

  if (report === "unpaid") {
    const yearId = q.get("year") ?? "";
    const { data: year } = await (await createClient())
      .from("academic_years").select("id").eq("school_id", user.schoolId).eq("id", yearId).maybeSingle();
    if (!year) return deny(404);
    const feeMonths = await getFeeMonths(year.id);
    const filter = unpaidMonthFilter(q.get("month") ?? undefined, feeMonths?.months ?? []);
    const { data: cls } = q.get("class")
      ? await (await createClient()).from("classes").select("id").eq("academic_year_id", year.id).eq("id", q.get("class")!).maybeSingle()
      : { data: null };
    const withGuardians = permissions.has("students.view") || permissions.has("students.manage");
    const list = await getUnpaid(user.schoolId, year.id, { classId: cls?.id ?? null, ...filter }, withGuardians);
    csv = await unpaidCsv(list.rows, locale, withGuardians);
    file = `impayes-${list.today}.csv`;
    data = { report, year: year.id, class: cls?.id ?? null, month: filter.month, registration: filter.registration, rows: list.rows.length };
  } else if (report === "journal") {
    const range = journalRange(q.get("from") ?? undefined, q.get("to") ?? undefined, (await schoolClock()).date);
    const journal = await getJournal(user.schoolId, range.from, range.to);
    csv = await journalCsv(journal, locale);
    file = `journal-paiements-${range.from}-${range.to}.csv`;
    data = { report, from: range.from, to: range.to, rows: journal.payments.length + journal.cancellations.length };
  } else {
    return deny(400);
  }

  await logAudit({ actorId: user.id, schoolId: user.schoolId, action: "fee_report.export", data });
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${file}"`,
      "cache-control": "no-store",
    },
  });
}
