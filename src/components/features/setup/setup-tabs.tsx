import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { getModules } from "@/lib/auth/modules";
import { getPermissions } from "@/lib/auth/session";
import { SETUP_TABS, type SetupTabKey } from "@/lib/structure/setup-tabs";

import { SetupTabsNav } from "./setup-tabs-nav";

/**
 * Sections of the school structure. The structure tabs need structure.manage;
 * "Notes" (Phase 11) needs grades.view and the grades module (a surveillant
 * sees only that one). Permissions are request-time data: own Suspense boundary.
 */
export function SetupTabs() {
  return (
    <Suspense fallback={<Skeleton className="h-9 w-64" />}>
      <VisibleTabs />
    </Suspense>
  );
}

async function VisibleTabs() {
  const [permissions, modules] = await Promise.all([getPermissions(), getModules()]);
  const keys: SetupTabKey[] = SETUP_TABS.filter((tab) =>
    tab.key === "grading"
      ? permissions.has("grades.view") && modules.has("grades")
      : permissions.has("structure.manage"),
  ).map((tab) => tab.key);
  return <SetupTabsNav keys={keys} />;
}
