import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { Suspense } from "react";

import { LogoutButton } from "@/components/features/auth/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";

type Reason = "suspended" | "deactivated";

/** Full-page notice for a signed-in user who lost access, with a sign-out button. */
export function AccessBlockedCard({ reason }: { reason: Reason }) {
  const t = useTranslations(`auth.${reason}`);

  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <ShieldOff className="mx-auto size-8 text-danger" aria-hidden />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Suspense fallback={<Skeleton className="h-9 w-36" />}>
          <BlockedGate reason={reason} />
        </Suspense>
      </CardContent>
    </Card>
  );
}

/** Only for users blocked for this reason; everyone else goes home (or to login). */
async function BlockedGate({ reason }: { reason: Reason }) {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  if (blockedPath(user) !== `/${reason}`) return redirect({ href: "/start", locale: await getLocale() });
  return <LogoutButton />;
}
