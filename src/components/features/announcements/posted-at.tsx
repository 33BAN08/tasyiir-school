"use client";

import { useSyncExternalStore } from "react";

import { formatDateTime, ltr } from "@/lib/format";

/** True in the browser only: the server's time-zone data for Morocco is outdated. */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** A timestamp as `dd/MM/yyyy HH:mm` in the school's time zone, written in the browser. */
export function PostedAt({ value, className }: { value: string; className?: string }) {
  const mounted = useMounted();
  return (
    <time dateTime={value} className={className ?? "tabular-nums"}>
      {mounted ? ltr(formatDateTime(value)) : " "}
    </time>
  );
}
