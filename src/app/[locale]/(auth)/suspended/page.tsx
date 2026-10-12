import { ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import { Suspense } from "react";

import { LogoutButton } from "@/components/features/auth/logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/session";

export default function SuspendedPage() {
  const t = useTranslations("auth.suspended");

  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <ShieldOff className="mx-auto size-8 text-danger" aria-hidden />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Suspense fallback={<Skeleton className="h-9 w-36" />}>
          <SuspendedGate />
        </Suspense>
      </CardContent>
    </Card>
  );
}

/** Only for users whose school is suspended; everyone else goes home. */
async function SuspendedGate() {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  if (!user.schoolSuspended) return redirect({ href: "/", locale: await getLocale() });
  return <LogoutButton />;
}
