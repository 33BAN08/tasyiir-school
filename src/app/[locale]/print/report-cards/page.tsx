import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { ReportCardSheet } from "@/components/features/report-cards/report-card-sheet";
import { PrintToolbar } from "@/components/features/timetable/print-toolbar";
import { redirect } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { areaFor, homeFor } from "@/lib/auth/roles";
import { getCurrentSchool, getPermissions, requireUser } from "@/lib/auth/session";
import { listPublicationCards, type ReportCard } from "@/lib/grades/publications";
import { listMyChildren } from "@/lib/parents/portal";
import { studentName, studentOtherName } from "@/lib/students/names";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reportCards.print");
  return { title: t("pageTitle") };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Report cards to print or save as PDF (Phase 11 step 8), one A4 portrait
 * page per student, from the PUBLISHED cards only (report_cards snapshot).
 * `?publication=…` = the whole class (grades.manage); `&student=…` = one.
 * A parent prints only their own child's card of a publication (RLS returns
 * nothing else). The browser's print dialog makes the PDF. No app shell.
 */
export default function PrintReportCardsPage({ searchParams }: PageProps<"/[locale]/print/report-cards">) {
  return (
    <Suspense>
      <PrintReportCards searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintReportCards({ searchParams }: Pick<PageProps<"/[locale]/print/report-cards">, "searchParams">) {
  const user = await requireUser();
  const [permissions, modules, sp, school, locale] = await Promise.all([
    getPermissions(), getModules(), searchParams, getCurrentSchool(), getLocale(),
  ]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);
  const publication = one(sp.publication);
  const student = one(sp.student);
  const area = areaFor(user);
  const staff = area === "school" && permissions.has("grades.manage");
  const parent = area === "portal" && user.roleKey === "parent";
  if (!user.schoolId || !school || !modules.has("grades") || (!staff && !parent) || !publication) {
    return redirect({ href: homeFor(user), locale });
  }

  let cards: ReportCard[] = [];
  if (staff) {
    cards = await listPublicationCards(publication, student);
  } else if (student) {
    const children = await listMyChildren(user.schoolId);
    if (children.some((c) => c.id === student)) cards = await listPublicationCards(publication, student);
  }

  const supabase = await createClient();
  const [students, klass] = await Promise.all([
    cards.length
      ? supabase.from("students").select("id, first_name, last_name, first_name_ar, last_name_ar, code_massar").in("id", cards.map((c) => c.studentId))
      : Promise.resolve({ data: [] as never[] }),
    cards[0] ? supabase.from("classes").select("name").eq("id", cards[0].classId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const byId = new Map((students.data ?? []).map((s) => [s.id, {
    firstName: s.first_name, lastName: s.last_name, firstNameAr: s.first_name_ar, lastNameAr: s.last_name_ar, massarCode: s.code_massar,
  }]));
  const sheets = cards
    .flatMap((c) => {
      const s = byId.get(c.studentId);
      return s ? [{ card: c, s }] : [];
    })
    .sort((a, b) => a.s.lastName.localeCompare(b.s.lastName) || a.s.firstName.localeCompare(b.s.firstName));

  const backHref = staff
    ? `/grades/averages?class=${cards[0]?.classId ?? ""}`
    : `/portal/grades/${publication}?child=${student ?? ""}`;
  const t = await getTranslations("reportCards.print");
  return (
    <>
      {/* A4 portrait, 10 mm margins: each sheet is 190 × 277 mm. */}
      <style>
        {"@page { size: A4 portrait; margin: 10mm; }" +
          // The app's full-height body, the toaster and the route announcer would add an empty last page.
          "@media print { html, body { height: auto !important; min-height: 0 !important; background: none !important; }" +
          " body > :not(main) { display: none !important; } }"}
      </style>
      <PrintToolbar backHref={backHref} sheets={sheets.length} namespace="reportCards.print" />
      <main className="flex flex-1 flex-col items-center gap-6 overflow-x-auto bg-muted p-6 print:block print:overflow-visible print:bg-transparent print:p-0">
        {sheets.length === 0 ? (
          <p className="text-muted-foreground">{t("nothing")}</p>
        ) : (
          sheets.map(({ card, s }) => (
            <ReportCardSheet
              key={card.id}
              card={card}
              school={{ name: school.name, logoUrl: school.logoUrl }}
              student={{ name: studentName(s, locale), otherName: studentOtherName(s, locale), massarCode: s.massarCode }}
              className={klass.data?.name ?? ""}
            />
          ))
        )}
      </main>
    </>
  );
}
