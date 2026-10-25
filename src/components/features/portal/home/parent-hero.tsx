import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Chip = { id: string; name: string; className: string | null };

/**
 * The green band under the header: the greeting, then one chip per child
 * (`?child=` picks the child the tiles below are about). One child: no chips.
 */
export function ParentHero({ firstName, chips, selected }: { firstName: string; chips: Chip[]; selected: string | null }) {
  const t = useTranslations("portal.home");

  return (
    <section
      aria-labelledby="portal-greeting"
      className="app-zellige on-brand -mx-4 -mt-4 flex flex-col gap-4 px-4 pt-3 pb-6 md:mx-0 md:mt-0 md:rounded-3xl md:p-6"
    >
      <h1 id="portal-greeting" className="text-2xl font-extrabold" dir="auto">
        {t("greeting", { name: firstName })}
      </h1>
      {chips.length > 1 && (
        <nav aria-label={t("children")} className="flex flex-wrap gap-2">
          {chips.map((c) => {
            const active = c.id === selected;
            return (
              <Link
                key={c.id}
                href={`/portal?child=${c.id}`}
                aria-current={active ? "page" : undefined}
                data-child-chip={c.id}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-mint",
                  active ? "bg-brand-foreground text-brand" : "border border-brand-foreground/40 text-brand-foreground hover:bg-brand-foreground/10",
                )}
              >
                <bdi>{c.name}</bdi>
                {c.className && (
                  <>
                    <span aria-hidden>·</span>
                    <bdi dir="ltr">{c.className}</bdi>
                  </>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </section>
  );
}
