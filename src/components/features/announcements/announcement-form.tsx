"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { createAnnouncement } from "@/lib/announcements/actions";
import type { PostingOptions } from "@/lib/announcements/queries";
import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_SCOPES,
  announcementSchema,
  type AnnouncementFormValues,
  type AnnouncementValues,
} from "@/lib/validations/announcements";

import { BodyField } from "./body-field";
import { TargetPicker } from "./target-picker";
import { useAnnouncementError } from "./use-announcement-error";

/**
 * Write and post an announcement. announcements.manage chooses the whole school
 * (parents / staff / everyone), levels or classes; a teacher only ticks their
 * own classes (parents). Who it goes to cannot be changed afterwards.
 */
export function AnnouncementForm({ options }: { options: PostingOptions }) {
  const t = useTranslations("announcements.form");
  const tAudience = useTranslations("announcements.audienceOption");
  const translateError = useAnnouncementError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<AnnouncementFormValues, unknown, AnnouncementValues>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      scope: options.canManage ? "school" : "classes",
      audience: "parents",
      title: "",
      body: "",
      levelIds: [],
      classIds: [],
    },
  });
  const scope = useWatch({ control: form.control, name: "scope" });
  const noYear = scope !== "school" && options.yearLabel === null;
  const noClasses = scope === "classes" && options.yearLabel !== null && options.classes.length === 0;

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await createAnnouncement(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("posted"));
      router.replace(`/announcements/${result.data.id}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-3xl flex-col gap-6">
      {options.canManage ? (
        <div className="grid gap-6 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="field-scope">{t("scope")}</FieldLabel>
                <Select
                  value={field.value}
                  onValueChange={(next) => {
                    field.onChange(next);
                    if (next !== "school") form.setValue("audience", "parents");
                  }}
                >
                  <SelectTrigger id="field-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANNOUNCEMENT_SCOPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`scopes.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          {scope === "school" ? (
            <Controller
              control={form.control}
              name="audience"
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor="field-audience">{t("audience")}</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="field-audience" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ANNOUNCEMENT_AUDIENCES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {tAudience(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          ) : (
            <Field>
              <FieldLabel>{t("audience")}</FieldLabel>
              <p className="flex min-h-9 items-center text-sm text-muted-foreground">{tAudience("parents")}</p>
            </Field>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("teacherNote")}</p>
      )}

      {noYear && <p className="text-sm text-danger">{t("noYear")}</p>}
      {noClasses && <p className="text-sm text-danger">{t("noClasses")}</p>}
      {(scope === "levels" || scope === "classes") && !noYear && !noClasses && (
        <Controller
          control={form.control}
          name={scope === "levels" ? "levelIds" : "classIds"}
          render={({ field, fieldState }) => (
            <TargetPicker
              kind={scope}
              options={options}
              value={field.value ?? []}
              onChange={field.onChange}
              error={fieldState.error?.message ? translateError(fieldState.error.message) : undefined}
            />
          )}
        />
      )}

      <FormTextField form={form} name="title" label={t("title")} autoComplete="off" dir="auto" translateError={translateError} />
      <Controller
        control={form.control}
        name="body"
        render={({ field, fieldState }) => (
          <BodyField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message ? translateError(fieldState.error.message) : undefined}
          />
        )}
      />

      <div className="flex flex-col gap-2">
        <FieldDescription>{t("notifyNote")}</FieldDescription>
        <div>
          <Button type="submit" className="min-h-11" disabled={isPending || noYear || noClasses}>
            <Send className="rtl:-scale-x-100" aria-hidden />
            {isPending ? t("posting") : t("post")}
          </Button>
        </div>
      </div>
    </form>
  );
}
