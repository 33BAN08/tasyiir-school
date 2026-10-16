"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth/actions";
import { loginSchema, type LoginFormValues, type LoginInput } from "@/lib/validations/auth";

export function LoginForm() {
  const t = useTranslations("auth");
  const locale = useLocale();
  const next = useSearchParams().get("next") ?? undefined;
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginFormValues, unknown, LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      // On success the action redirects and never returns.
      const result = await signIn(values, next, locale);
      if (!result.ok) toast.error(t(`errors.${result.error}`));
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.login}>
          <FieldLabel htmlFor="login">{t("login.login")}</FieldLabel>
          <Input
            id="login"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            aria-invalid={!!errors.login}
            {...form.register("login")}
          />
          {errors.login?.message && <FieldError>{t(`errors.${errors.login.message}`)}</FieldError>}
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">{t("login.password")}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          {errors.password?.message && (
            <FieldError>{t(`errors.${errors.password.message}`)}</FieldError>
          )}
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? t("login.submitting") : t("login.submit")}
        </Button>
      </FieldGroup>
    </form>
  );
}
