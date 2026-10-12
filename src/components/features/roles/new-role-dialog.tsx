"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { createRole } from "@/lib/roles/actions";
import { roleNameSchema, type RoleNameFormValues } from "@/lib/validations/roles";

import { useRoleError } from "./use-role-error";

/** "New role" → name only; permissions are then set on the role's page. */
export function NewRoleDialog() {
  const t = useTranslations("staffRoles.create");
  const translateError = useRoleError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoleNameFormValues>({ resolver: zodResolver(roleNameSchema), defaultValues: { name: "" } });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await createRole(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("done", { name: values.name.trim() }));
      setOpen(false);
      router.push(`/staff/roles/${result.data.id}`);
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FormTextField
            form={form}
            name="name"
            label={t("name")}
            description={t("nameHint")}
            autoComplete="off"
            autoFocus
            translateError={translateError}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
