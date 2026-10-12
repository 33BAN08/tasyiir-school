import { getTranslations } from "next-intl/server";

import { LogoutButton } from "@/components/features/auth/logout-button";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";

// TEMP (Phase 1 step 2): replaced by the app shell + role-based redirect in step 4.
export async function SessionPanel() {
  const user = await requireUser();
  const t = await getTranslations();

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-medium">{t("home.welcome", { name: user.fullName })}</p>
      <Badge variant="secondary">{t(`roles.${user.roleKey}`)}</Badge>
      <LogoutButton />
    </div>
  );
}
