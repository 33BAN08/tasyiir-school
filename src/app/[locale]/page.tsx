import { getLocale } from "next-intl/server";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import { homeFor } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

/** "/" sends each user to their area: platform, school dashboard, parent portal or driver. */
export default function RootPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense fallback={<Skeleton className="size-12 rounded-xl" />}>
        <RoleRedirect />
      </Suspense>
    </main>
  );
}

async function RoleRedirect(): Promise<never> {
  const user = await requireUser();
  return redirect({ href: homeFor(user), locale: await getLocale() });
}
