import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

/** Plain form + Server Action: works even before JavaScript loads. */
export function LogoutButton() {
  const t = useTranslations("auth");
  const locale = useLocale();

  return (
    <form action={signOut.bind(null, locale)}>
      <Button type="submit" variant="outline">
        <LogOut className="rtl:-scale-x-100" aria-hidden />
        {t("logout")}
      </Button>
    </form>
  );
}
