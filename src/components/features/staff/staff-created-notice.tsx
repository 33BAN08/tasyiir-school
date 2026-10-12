"use client";

import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

import { OneTimeCredentials } from "./one-time-credentials";

type Props = {
  name: string;
  email: string;
  password: string;
  onAddAnother: () => void;
  onDone: () => void;
};

/** Shown once after creation: the only moment the temporary password is visible. */
export function StaffCreatedNotice({ name, email, password, onAddAnother, onDone }: Props) {
  const t = useTranslations("staff.create.success");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <CircleCheck className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{t("title", { name })}</p>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <OneTimeCredentials email={email} password={password} />

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onAddAnother}>
          {t("addAnother")}
        </Button>
        <Button type="button" onClick={onDone}>
          {t("done")}
        </Button>
      </div>
    </div>
  );
}
