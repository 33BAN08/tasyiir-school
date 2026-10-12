import { CalendarCheck } from "lucide-react";

import { LocaleSwitcher } from "@/components/features/i18n/locale-switcher";
import { ThemeToggle } from "@/components/features/theme/theme-toggle";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <main className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <CalendarCheck className="size-7" aria-hidden />
          </div>
          <p className="text-xl font-semibold text-primary">
            {BRAND.nameAr} <span className="text-muted-foreground">·</span>{" "}
            <span dir="ltr">{BRAND.product}</span>
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
