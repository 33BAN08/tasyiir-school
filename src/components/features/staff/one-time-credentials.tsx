"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { CopyButton } from "@/components/features/forms/copy-button";

/**
 * Email + temporary password with copy buttons. Shown once, right after the
 * server generated the password: it is never stored in clear text, nor logged.
 */
export function OneTimeCredentials({
  email,
  password,
  loginLabel,
}: {
  /** What the person signs in with (staff: email; parents: phone). */
  email: string | null;
  password: string;
  /** Label of that first line; defaults to "Email". */
  loginLabel?: string;
}) {
  const t = useTranslations("staff.credentials");

  return (
    <>
      <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        {email && (
          <>
            <dt className="text-sm text-muted-foreground">{loginLabel ?? t("email")}</dt>
            <dd className="flex items-center gap-2">
              <bdi className="font-numeric break-all">{email}</bdi>
              <CopyButton value={email} />
            </dd>
          </>
        )}
        <dt className="text-sm text-muted-foreground">{t("password")}</dt>
        <dd className="flex items-center gap-2">
          <bdi className="font-numeric text-lg tracking-wide">{password}</bdi>
          <CopyButton value={password} />
        </dd>
      </dl>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        {t("warning")}
      </p>
    </>
  );
}
