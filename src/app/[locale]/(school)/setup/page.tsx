import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { requireSchoolPermission } from "@/lib/auth/session";

/** "Structure" in the sidebar lands on its first section. */
export default async function SetupPage() {
  await requireSchoolPermission("structure.manage");
  return redirect({ href: "/setup/years", locale: await getLocale() });
}
