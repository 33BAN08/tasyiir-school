"use client";

import { Loader2, Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { savePushPreferences, sendTestPush } from "@/lib/push/actions";
import type { PushPreferences as Preferences } from "@/lib/push/preferences";

const KINDS = ["absences", "remarks", "announcements"] as const;

type Props = {
  initial: Preferences;
  /** This phone's subscription address (for "Tester"), read when the button is pressed. */
  endpoint: () => Promise<string | null>;
  /** The push service no longer knows this phone: the card goes back to "off". */
  onGone: () => void;
};

/**
 * Inside the push card, once notifications are on: which kinds reach the phones
 * (saved at once, one switch at a time) and "Tester" (a push to this phone now).
 */
export function PushPreferences({ initial, endpoint, onGone }: Props) {
  const t = useTranslations("push");
  const locale = useLocale();
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [testing, startTest] = useTransition();

  async function toggle(kind: (typeof KINDS)[number], on: boolean) {
    const before = values;
    const next = { ...values, [kind]: on };
    setValues(next);
    setSaving(true);
    const result = await savePushPreferences(next);
    setSaving(false);
    if (!result.ok) {
      setValues(before);
      return void toast.error(t("preferences.error"));
    }
    toast.success(t("preferences.saved"));
  }

  function test() {
    startTest(async () => {
      const address = await endpoint();
      const result = address ? await sendTestPush(address, locale) : ({ ok: false, error: "gone" } as const);
      if (result.ok) return void toast.success(t("test.sent"));
      if (result.error === "gone" || result.error === "notFound") {
        toast.error(t("test.gone"));
        return onGone();
      }
      toast.error(t("test.error"));
    });
  }

  return (
    <div className="flex flex-col gap-4 border-t pt-4" data-push-preferences>
      <FieldSet>
        <FieldLegend variant="label">{t("preferences.legend")}</FieldLegend>
        <FieldDescription>{t("preferences.hint")}</FieldDescription>
        <div className="flex flex-col gap-3">
          {KINDS.map((kind) => {
            const id = `push-${kind}`;
            return (
              <Field key={kind} orientation="horizontal" className="items-start">
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={values[kind]}
                  disabled={saving}
                  aria-describedby={`${id}-hint`}
                  data-push-kind={kind}
                  onCheckedChange={(checked) => void toggle(kind, checked === true)}
                />
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor={id} className="font-normal">
                    {t(`preferences.${kind}`)}
                  </FieldLabel>
                  <FieldDescription id={`${id}-hint`}>{t(`preferences.${kind}Hint`)}</FieldDescription>
                </div>
              </Field>
            );
          })}
        </div>
      </FieldSet>
      <div>
        <Button variant="outline" className="min-h-11" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Send className="rtl:-scale-x-100" aria-hidden />}
          {t("test.button")}
        </Button>
      </div>
    </div>
  );
}
