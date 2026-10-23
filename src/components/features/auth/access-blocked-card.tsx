import { MessageCircle, ShieldOff, TimerOff } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LogoutButton } from "@/components/features/auth/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { whatsappUrl } from "@/lib/landing/whatsapp";
import { createClient } from "@/lib/supabase/server";

type Reason = "suspended" | "deactivated";

/**
 * Full-page notice for a signed-in user who lost access, with a sign-out button.
 * A school suspended because its trial ended (launch step 2b) says so, with the
 * WhatsApp button to choose a plan.
 */
export function AccessBlockedCard({ reason }: { reason: Reason }) {
  return (
    <Card className="w-full">
      <Suspense fallback={<Skeleton className="m-6 h-40" />}>
        <BlockedNotice reason={reason} />
      </Suspense>
    </Card>
  );
}

/** Only for users blocked for this reason; everyone else goes home (or to login). */
async function BlockedNotice({ reason }: { reason: Reason }) {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  if (blockedPath(user) !== `/${reason}`) return redirect({ href: "/start", locale: await getLocale() });

  let trialEnded = false;
  if (reason === "suspended") {
    const supabase = await createClient();
    const { data } = await supabase.rpc("my_school_suspension");
    trialEnded = data === "trial_ended";
  }
  const t = await getTranslations(trialEnded ? "trialEnded" : `auth.${reason}`);
  const whatsapp = trialEnded ? whatsappUrl(t("whatsappMessage")) : null;
  const Icon = trialEnded ? TimerOff : ShieldOff;

  return (
    <>
      <CardHeader className="items-center text-center" data-blocked={trialEnded ? "trial_ended" : reason}>
        <Icon className={trialEnded ? "mx-auto size-8 text-warning" : "mx-auto size-8 text-danger"} aria-hidden />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-center gap-2">
        {whatsapp && (
          <Button asChild>
            <a href={whatsapp} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden />
              {t("contact")}
            </a>
          </Button>
        )}
        <LogoutButton />
      </CardContent>
    </>
  );
}
