import { LocaleSwitcher } from "@/components/features/i18n/locale-switcher";
import { ThemeToggle } from "@/components/features/theme/theme-toggle";
import { BRAND, BRAND_ASSETS } from "@/lib/brand";

export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <main className="relative flex flex-1 items-center justify-center p-4 sm:p-6">
      <div className="absolute end-4 top-4 flex items-center gap-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        {/* Logo files are fixed light art: the light one stays on a white tile in dark mode. */}
        <div className="rounded-2xl px-4 py-1 dark:bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
          <img src={BRAND_ASSETS.logo} alt={BRAND.product} width={630} height={365} className="h-24 w-auto" />
        </div>
        {children}
      </div>
    </main>
  );
}
