"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { createGuardian, updateGuardian } from "@/lib/parents/guardian-actions";
import { guardianSchema, type GuardianFormValues } from "@/lib/validations/parents";

import { useParentsError } from "./use-parents-error";

type Props = {
  /** Edit this guardian; create a new one when absent. */
  guardianId?: string;
  /** Has a parent account: a new phone becomes the new sign-in. */
  hasAccount?: boolean;
  defaults: GuardianFormValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

export const EMPTY_GUARDIAN: GuardianFormValues = { lastName: "", firstName: "", phone: "", email: "" };

/** Create or edit a parent / guardian: names, mobile phone, optional email. */
export function GuardianDialog({ guardianId, hasAccount, defaults, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("parents.form");
  const translateError = useParentsError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<GuardianFormValues>({ resolver: zodResolver(guardianSchema), defaultValues: defaults });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = guardianId ? await updateGuardian(guardianId, values) : await createGuardian(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(guardianId ? "updated" : "created"));
      onOpenChange(false);
      if (result.data) {
        // Created: next step is on its page (children, account).
        form.reset(EMPTY_GUARDIAN);
        router.push(`/parents/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset(defaults);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(guardianId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormTextField
              form={form}
              name="lastName"
              label={t("lastName")}
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="firstName"
              label={t("firstName")}
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
          </div>
          <FormTextField
            form={form}
            name="phone"
            label={t("phone")}
            description={hasAccount ? t("phoneHintAccount") : t("phoneHint")}
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder="06 12 34 56 78"
            autoComplete="off"
            className="font-numeric tabular-nums"
            translateError={translateError}
          />
          <FormTextField
            form={form}
            name="email"
            label={t("email")}
            optional
            type="email"
            dir="ltr"
            autoComplete="off"
            translateError={translateError}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
