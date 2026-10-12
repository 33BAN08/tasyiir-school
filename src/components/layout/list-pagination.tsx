import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

type Props = {
  /** Path without locale, e.g. `/platform/schools`. */
  pathname: string;
  /** Current query (filters); `page` is replaced. */
  query: Record<string, string | undefined>;
  page: number;
  pageCount: number;
};

/** Previous / next links that keep the list's filters in the URL. */
export async function ListPagination({ pathname, query, page, pageCount }: Props) {
  if (pageCount <= 1) return null;
  const t = await getTranslations("pagination");

  const hrefFor = (p: number) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value && params.set(key, value));
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  return (
    <nav aria-label={t("label")} className="flex items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{t("pageOf", { page, pageCount })}</p>
      <div className="flex gap-2">
        <PageLink href={hrefFor(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
          {t("previous")}
        </PageLink>
        <PageLink href={hrefFor(page + 1)} disabled={page >= pageCount}>
          {t("next")}
          <ChevronRight className="rtl:-scale-x-100" aria-hidden />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: ReactNode }) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link href={href}>{children}</Link>
    </Button>
  );
}
