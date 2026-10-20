"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { formatMobile } from "@/lib/parents/phone";
import { saveSchoolContact } from "@/lib/school-contact/actions";
import {
  isMobile,
  normalizeSchoolPhone,
  schoolContactSchema,
  type SchoolContactFormValues,
  type SchoolContactValues,
} from "@/lib/validations/school-contact";

type Props = { phone: string | null; whatsapp: string | null };

/** The two numbers parents see on their home page. Empty = not shown. */
export function SchoolContactForm({ phone, whatsapp }: Props) {
  const t = useTranslations("schoolSettings");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<SchoolContactFormValues, unknown, SchoolContactValues>({
    resolver: zodResolver(schoolContactSchema),
    defaultValues: {
      phone: phone ? formatMobile(phone) : "",
      whatsapp: whatsapp ? formatMobile(whatsapp) : "",
    },
  });
  const typedPhone = useWatch({ control: form.control, name: "phone" });
  const typedWhatsapp = useWatch({ control: form.control, name: "whatsapp" });
  const phoneValue = normalizeSchoolPhone(typedPhone ?? "");
  // "Same number": only when the phone is a mobile and WhatsApp is not already it.
  const canCopy =
    !!phoneValue && isMobile(phoneValue) && normalizeSchoolPhone(typedWhatsapp ?? "") !== phoneValue;
  const translateError = (key: string) => t(`errors.${key}`);

  const onSubmit = form.handleSubmit(() => {
    const raw = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = await saveSchoolContact(raw);
      if (!result.ok) {
        if (result.field === "phone" || result.field === "whatsapp") {
          form.setError(result.field, { message: result.error }, { shouldFocus: true });
        } else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      form.reset(raw);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="size-5 text-muted-foreground" aria-hidden />
            {t("contact.title")}
          </CardTitle>
          <CardDescription>{t("contact.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-6 sm:max-w-sm">
            <FormTextField
              form={form}
              name="phone"
              label={t("contact.phone")}
              description={t("contact.phoneHint")}
              optional
              type="tel"
              inputMode="tel"
              autoComplete="off"
              dir="ltr"
              className="text-start [unicode-bidi:plaintext]"
              disabled={isPending}
              translateError={translateError}
            />
            <div className="flex flex-col gap-2">
              <FormTextField
                form={form}
                name="whatsapp"
                label={t("contact.whatsapp")}
                description={t("contact.whatsappHint")}
                optional
                type="tel"
                inputMode="tel"
                autoComplete="off"
                dir="ltr"
                className="text-start [unicode-bidi:plaintext]"
                disabled={isPending}
                translateError={translateError}
              />
              {canCopy && (
                <Button
                  type="button"
                  variant="link"
                  className="h-auto self-start p-0"
                  disabled={isPending}
                  onClick={() =>
                    form.setValue("whatsapp", formatMobile(phoneValue), { shouldDirty: true, shouldValidate: true })
                  }
                >
                  {t("contact.samePhone")}
                </Button>
              )}
            </div>
          </div>
          <div>
            <Button type="submit" disabled={isPending || !form.formState.isDirty} className="min-h-11">
              {t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
