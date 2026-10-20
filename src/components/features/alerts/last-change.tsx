"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { formatDateTime, isolate, ltr } from "@/lib/format";

/** `namespace` holds `lastChange` + `lastChangeBy` (default: the alert settings). */
type Props = { at: string; byName: string | null; namespace?: "alertSettings" | "schoolSettings" };

/** "Last changed by X on 19/10/2026 08:12" — time written in the browser (the server's Morocco tz data is outdated). */
export function LastChange({ at, byName, namespace = "alertSettings" }: Props) {
  const t = useTranslations(namespace);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <p className="text-sm text-muted-foreground"> </p>;

  const when = ltr(formatDateTime(at));
  return (
    <p className="text-sm text-muted-foreground">
      {byName ? t("lastChangeBy", { name: isolate(byName), when }) : t("lastChange", { when })}
    </p>
  );
}
