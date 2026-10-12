"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { renameRole } from "@/lib/roles/actions";
import { roleNameSchema, type RoleNameFormValues } from "@/lib/validations/roles";

import { useRoleError } from "./use-role-error";

/** Rename a custom role (built-in roles keep their translated name). */
export function RoleNameForm({ roleId, name }: { roleId: string; name: string }) {
  const t = useTranslations("staffRoles.rename");
  const translateError = useRoleError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<RoleNameFormValues>({ resolver: zodResolver(roleNameSchema), defaultValues: { name } });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await renameRole(roleId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("done"));
      form.reset({ name: values.name.trim() });
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <FormTextField
          form={form}
          name="name"
          label={t("label")}
          autoComplete="off"
          translateError={translateError}
        />
      </div>
      <Button type="submit" variant="outline" disabled={isPending || !form.formState.isDirty}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
