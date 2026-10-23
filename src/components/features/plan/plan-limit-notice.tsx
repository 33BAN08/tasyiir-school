import { getTranslations } from "next-intl/server";

import { atLimit, getSchoolUsage } from "@/lib/plan/usage";

/** Shown only when the school has used every place of its plan for `kind`. */
export async function PlanLimitNotice({ kind }: { kind: "students" | "admins" }) {
  const usage = await getSchoolUsage();
  if (!usage) return null;
  const used = kind === "students" ? usage.students : usage.admins;
  const max = kind === "students" ? usage.maxStudents : usage.maxAdmins;
  if (max === null || !atLimit(used, max)) return null;
  const t = await getTranslations("plan");
  return (
    <p role="status" data-plan-full={kind} className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
      {t(`full.${kind}`, { max })}
    </p>
  );
}
