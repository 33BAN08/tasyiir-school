import { Bell, Camera, Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";

import { ltr } from "@/lib/format";

/**
 * What a parent sees: the absence alert, the photo justification, an
 * announcement. Built as markup (it translates), fictional school and names,
 * captioned as an example.
 */
export function HeroPhone() {
  const t = useTranslations("landing.home.phone");

  return (
    <figure data-hero-phone className="mx-auto flex w-full max-w-[18rem] flex-col items-center gap-3 lg:w-72">
      <div className="w-full rounded-[2.6rem] bg-lp-ink p-2.5 shadow-2xl">
        <div className="flex min-h-[30rem] flex-col gap-3 rounded-[2rem] bg-lp-bg px-4 pt-5 pb-6 text-lp-ink">
          <div className="flex items-center justify-between text-xs text-lp-muted">
            <span>{t("school")}</span>
            <span dir="ltr" className="font-numeric">09:10</span>
          </div>

          <div className="flex items-start gap-2.5 rounded-2xl bg-lp-surface p-3.5 shadow-md">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-lp-absent-bg text-lp-absent">
              <Bell className="size-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[0.95rem] font-extrabold">{t("absence", { name: t("student") })}</span>
              <span className="text-[0.8rem] leading-relaxed text-lp-muted">
                {t("lesson", { time: ltr("09:00"), class: ltr("1AC-A") })}
              </span>
            </span>
          </div>

          <div className="flex flex-col gap-2.5 rounded-2xl border border-lp-line bg-lp-surface p-3.5">
            <span className="text-sm font-extrabold">{t("justifyTitle")}</span>
            <span className="flex h-24 items-center justify-center gap-2 rounded-xl bg-lp-tint text-[0.8rem] text-lp-muted">
              <Camera className="size-5" aria-hidden />
              {t("photo")}
            </span>
            {/* Looks like the app's button; this is a picture of the screen, not a control. */}
            <span className="rounded-xl bg-lp-brand p-3 text-center text-sm font-extrabold text-lp-on-brand">{t("send")}</span>
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-lp-tint px-3.5 py-3 text-[0.8rem] font-bold text-lp-brand">
            <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("announcement", { time: ltr("17:00") })}
          </p>
        </div>
      </div>
      <figcaption className="text-xs text-lp-band-muted">{t("caption")}</figcaption>
    </figure>
  );
}
