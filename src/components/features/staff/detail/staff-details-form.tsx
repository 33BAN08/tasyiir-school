"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useRouter } from "@/i18n/navigation";
import { updateStaffDetails } from "@/lib/staff/member-actions";
import { staffDetailsSchema, type StaffDetailsFormValues, type StaffDetailsInput } from "@/lib/validations/staff";

import { LocaleField } from "../locale-field";
import { useStaffError } from "../use-staff-error";
import { BlockedNote } from "./blocked-note";

type Props = {
  staffId: string;
  defaultValues: StaffDetailsFormValues;
  /** Rule key when editing is not allowed (read-only form). */
  blocked: string | null;
};

export function StaffDetailsForm({ staffId, defaultValues, blocked }: Props) {
  const t = useTranslations("staff.detail.details");
  const tCreate = useTranslations("staff.create");
  const translateError = useStaffError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<StaffDetailsFormValues, unknown, StaffDetailsInput>({
    resolver: zodResolver(staffDetailsSchema),
    defaultValues,
  });
  const readOnly = blocked !== null;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await updateStaffDetails(staffId, values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      form.reset(values);
      router.refresh();
    });
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup>
            <FormTextField
              form={form}
              name="fullName"
              label={tCreate("fullName")}
              autoComplete="off"
              readOnly={readOnly}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="phone"
              label={tCreate("phone")}
              optional
              type="tel"
              dir="ltr"
              autoComplete="off"
              readOnly={readOnly}
              translateError={translateError}
            />
            <LocaleField
              control={form.control}
              name="locale"
              id="staff-detail-locale"
              label={tCreate("locale")}
              disabled={readOnly}
            />
          </FieldGroup>
          {blocked ? (
            <BlockedNote reason={blocked} />
          ) : (
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending || !form.formState.isDirty}>
                {isPending ? t("saving") : t("save")}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
