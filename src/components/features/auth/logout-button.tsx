"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { clearAllDrafts } from "@/lib/attendance/drafts";
import { signOut } from "@/lib/auth/actions";

/** Plain form + Server Action: works even before JavaScript loads (then nothing is kept on the phone either). */
export function LogoutButton() {
  const t = useTranslations("auth");
  const locale = useLocale();

  return (
    // Roll calls kept on this phone (Phase 7) are cleared on logout.
    <form action={signOut.bind(null, locale)} onSubmit={clearAllDrafts}>
      <Button type="submit" variant="outline">
        <LogOut className="rtl:-scale-x-100" aria-hidden />
        {t("logout")}
      </Button>
    </form>
  );
}
