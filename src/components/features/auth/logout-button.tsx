import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";

/** Plain form + Server Action: works even before JavaScript loads. */
export function LogoutButton() {
  const t = useTranslations("auth");

  return (
    <form action={signOut}>
      <Button type="submit" variant="outline">
        <LogOut className="rtl:-scale-x-100" aria-hidden />
        {t("logout")}
      </Button>
    </form>
  );
}
