"use client";

import { CircleCheck, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import { CopyButton } from "@/components/features/forms/copy-button";

type Props = { schoolName: string; email: string; password: string; onCreateAnother: () => void };

/**
 * Shown once after creation: the only moment the temporary password is visible
 * (it is never stored in clear text, nor in the audit log).
 */
export function WizardSuccess({ schoolName, email, password, onCreateAnother }: Props) {
  const t = useTranslations("platform.wizard.success");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("title", { name: schoolName })}</p>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <dl className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[auto_1fr] sm:items-center">
        <dt className="text-sm text-muted-foreground">{t("email")}</dt>
        <dd className="flex items-center gap-2">
          <bdi className="font-numeric break-all">{email}</bdi>
          <CopyButton value={email} />
        </dd>
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

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCreateAnother}>
          {t("createAnother")}
        </Button>
        <Button asChild>
          <Link href="/platform/schools">{t("backToList")}</Link>
        </Button>
      </div>
    </div>
  );
}
