"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { clearAllDrafts } from "@/lib/attendance/drafts";
import { signOut } from "@/lib/auth/actions";
import { clearAllGradeDrafts } from "@/lib/grades/drafts";

/** Plain form + Server Action: works even before JavaScript loads (then nothing is kept on the phone either). */
export function LogoutButton() {
  const t = useTranslations("auth");
  const locale = useLocale();

  return (
    // Roll calls (Phase 7) and grade sheets (Phase 11) kept on this phone are cleared on logout.
    <form
      action={signOut.bind(null, locale)}
      onSubmit={() => {
        clearAllDrafts();
        clearAllGradeDrafts();
      }}
    >
      <Button type="submit" variant="outline">
        <LogOut className="rtl:-scale-x-100" aria-hidden />
        {t("logout")}
      </Button>
    </form>
  );
}
