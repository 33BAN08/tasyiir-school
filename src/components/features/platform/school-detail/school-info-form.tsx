"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { updateSchoolInfo } from "@/lib/platform/school-actions";
import {
  schoolInfoSchema,
  type SchoolInfoFormValues,
  type SchoolInfoInput,
} from "@/lib/validations/platform";

import { FormTextField } from "@/components/features/forms/form-text-field";

type Props = { schoolId: string; defaults: SchoolInfoFormValues };

export function SchoolInfoForm({ schoolId, defaults }: Props) {
  const t = useTranslations("platform.schoolDetail.info");
  const tSchool = useTranslations("platform.wizard.school");
  const tErrors = useTranslations("platform.errors");
  const [isPending, startTransition] = useTransition();

  const form = useForm<SchoolInfoFormValues, unknown, SchoolInfoInput>({
    resolver: zodResolver(schoolInfoSchema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await updateSchoolInfo(schoolId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error });
        toast.error(tErrors(result.error));
        return;
      }
      form.reset(values); // new baseline: the button is disabled until the next edit
      toast.success(t("saved"));
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup>
            <FormTextField form={form} name="name" label={tSchool("name")} autoComplete="organization" />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormTextField form={form} name="city" label={tSchool("city")} optional />
              <FormTextField form={form} name="phone" label={tSchool("phone")} type="tel" dir="ltr" optional />
            </div>
            <FormTextField form={form} name="address" label={tSchool("address")} optional />
          </FieldGroup>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || !form.formState.isDirty}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
