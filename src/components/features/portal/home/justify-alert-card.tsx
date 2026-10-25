import { Camera, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { formatDate, isolate, ltr } from "@/lib/format";
import type { ParentHome } from "@/lib/parents/home";

/**
 * Shown only when the selected child has an absence with no justification
 * (or a refused one). The button opens the existing justification dialog on
 * the absences page, for that day.
 */
export function JustifyAlertCard({ childId, absence, today }: { childId: string; absence: NonNullable<ParentHome["toJustify"]>; today: string }) {
  const t = useTranslations("portal.home.justify");
  // A date, a subject name (often French) and a time inside an Arabic line: each one isolated.
  const day = absence.date === today ? t("today") : ltr(formatDate(absence.date));

  return (
    <section
      data-justify-alert
      aria-labelledby="justify-alert-title"
      className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id="justify-alert-title" className="font-extrabold">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("line", { day, subject: isolate(absence.subjectName), time: ltr(absence.start) })}
          </p>
        </div>
      </div>
      <Link
        href={`/portal/absences?child=${childId}&justify=${absence.date}`}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Camera className="size-5" aria-hidden />
        {t("cta")}
      </Link>
    </section>
  );
}
