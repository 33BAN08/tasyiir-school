import { useTranslations } from "next-intl";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ChangePasswordForm } from "@/components/features/auth/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";

export default function ChangePasswordPage() {
  const t = useTranslations("auth.changePassword");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <ForcedChangeGate />
        </Suspense>
      </CardContent>
    </Card>
  );
}

/** Only reachable while the account still has its temporary password. */
async function ForcedChangeGate() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/");
  return <ChangePasswordForm />;
}
