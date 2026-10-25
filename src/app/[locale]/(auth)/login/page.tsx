import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { LoginForm } from "@/components/features/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoginPage() {
  const t = useTranslations("auth.login");

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* LoginForm reads ?next= from the URL, which is request-time data. */}
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <LoginForm />
        </Suspense>
        {/* No password reset by e-mail: parents sign in with their phone, the school resets a password. */}
        <p data-login-forgot className="mt-5 text-center text-sm text-muted-foreground">
          {t("forgot")}
        </p>
      </CardContent>
    </Card>
  );
}
