"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { changePassword } from "@/lib/auth/actions";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validations/auth";

export function ChangePasswordForm() {
  const t = useTranslations("auth");
  const [isPending, startTransition] = useTransition();

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      // On success the action redirects and never returns.
      const result = await changePassword(values);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{t("changePassword.newPassword")}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          {errors.password?.message ? (
            <FieldError>{t(`errors.${errors.password.message}`)}</FieldError>
          ) : (
            <FieldDescription>{t("changePassword.hint")}</FieldDescription>
          )}
        </Field>

        <Field data-invalid={!!errors.confirm}>
          <FieldLabel htmlFor="confirm">{t("changePassword.confirmPassword")}</FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            dir="ltr"
            aria-invalid={!!errors.confirm}
            {...form.register("confirm")}
          />
          {errors.confirm?.message && <FieldError>{t(`errors.${errors.confirm.message}`)}</FieldError>}
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? t("changePassword.submitting") : t("changePassword.submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
