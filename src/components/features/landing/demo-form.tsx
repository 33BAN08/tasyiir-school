"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Link } from "@/i18n/navigation";
import { requestDemo } from "@/lib/demo-requests/actions";
import { formatMobile, normalizeMobile } from "@/lib/parents/phone";
import { cn } from "@/lib/utils";
import { DEMO_STUDENT_RANGES, demoRequestSchema, type DemoRequestInput } from "@/lib/validations/demo-request";

import { CONTROL, controlProps, DemoField, fieldIds } from "./demo-field";
import { DemoOutcomePanel, type DemoOutcome } from "./demo-outcome";
import { BUTTON } from "./landing-ui";

type Values = z.output<typeof demoRequestSchema>;
type FieldName = Exclude<keyof DemoRequestInput, "website">;

/** Field order: the error summary lists errors in this order. */
const FIELDS: FieldName[] = ["fullName", "schoolName", "city", "phone", "email", "students", "message"];

const EMPTY: DemoRequestInput = {
  fullName: "",
  schoolName: "",
  city: "",
  phone: "",
  email: "",
  students: "",
  message: "",
  website: "",
};

/**
 * "Demander une démo". Each field is checked when it loses focus (error under
 * it); a failed submit also shows a summary at the top, focused, with links to
 * each field. The server checks everything again.
 */
export function DemoForm() {
  const t = useTranslations("landing.demo");
  const tLegal = useTranslations("legal.nav");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState(false);
  /** Bumped on every failed submit: the summary takes the focus again. */
  const [failedSubmits, setFailedSubmits] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DemoOutcome | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const form = useForm<DemoRequestInput, unknown, Values>({
    resolver: zodResolver(demoRequestSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: EMPTY,
  });
  const { errors } = form.formState;
  const message = (name: FieldName) => {
    const key = errors[name]?.message;
    return key ? t(`errors.${key}`) : undefined;
  };
  const listed = FIELDS.filter((name) => errors[name]);

  useEffect(() => {
    if (failedSubmits) summaryRef.current?.focus();
  }, [failedSubmits]);

  function onInvalid() {
    setSummary(true);
    setFailedSubmits((n) => n + 1);
  }

  function onValid(values: Values) {
    setServerError(null);
    startTransition(async () => {
      const result = await requestDemo(values, locale).catch(() => null);
      if (!result) return setServerError("generic");
      if (!result.ok && "limited" in result) {
        setSummary(false);
        return setOutcome({ kind: "limited", reason: result.limited });
      }
      if (!result.ok) {
        const field = FIELDS.find((name) => name === result.field);
        if (field) {
          form.setError(field, { message: result.error });
          return onInvalid();
        }
        return setServerError(result.error);
      }
      setSummary(false);
      setOutcome({ kind: "sent", phone: formatMobile(result.data.phone) });
    });
  }

  if (outcome) {
    return (
      <DemoOutcomePanel
        outcome={outcome}
        onBack={() => {
          // Sent: start again empty. Limited: keep what was typed.
          if (outcome.kind === "sent") form.reset(EMPTY);
          setOutcome(null);
        }}
      />
    );
  }

  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onValid, onInvalid)(event)} className="flex flex-col gap-5">
      {summary && listed.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border-2 border-lp-absent bg-lp-absent-bg p-4 text-lp-absent outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-absent"
        >
          <p className="flex items-center gap-2 font-bold">
            <CircleAlert className="size-5 shrink-0" aria-hidden />
            {t("summaryTitle", { count: listed.length })}
          </p>
          <ul className="mt-2 flex list-disc flex-col gap-1 ps-9">
            {listed.map((name) => (
              <li key={name}>
                <a
                  href={`#${fieldIds(name).input}`}
                  onClick={(event) => {
                    event.preventDefault();
                    form.setFocus(name);
                  }}
                  className="font-semibold underline underline-offset-4"
                >
                  {message(name)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {serverError && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-lp-absent-bg p-4 font-semibold text-lp-absent">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          {t(`errors.${serverError}`)}
        </p>
      )}

      <p className="text-sm text-lp-muted">{t("requiredNote")}</p>

      <div className="grid gap-5 sm:grid-cols-2">
        <DemoField name="fullName" label={t("fields.fullName")} error={message("fullName")}>
          <input {...form.register("fullName")} {...controlProps("fullName", message("fullName"))} autoComplete="name" className={CONTROL} />
        </DemoField>
        <DemoField name="schoolName" label={t("fields.schoolName")} error={message("schoolName")}>
          <input {...form.register("schoolName")} {...controlProps("schoolName", message("schoolName"))} autoComplete="organization" className={CONTROL} />
        </DemoField>
        <DemoField name="city" label={t("fields.city")} error={message("city")}>
          <input {...form.register("city")} {...controlProps("city", message("city"))} autoComplete="address-level2" className={CONTROL} />
        </DemoField>
        <DemoField name="phone" label={t("fields.phone")} hint={t("fields.phoneHint")} error={message("phone")}>
          <input
            {...form.register("phone", {
              // "0612345678" → "06 12 34 56 78" once it is valid.
              onBlur: (event) => {
                const phone = normalizeMobile(event.target.value);
                if (phone) form.setValue("phone", formatMobile(phone));
              },
            })}
            {...controlProps("phone", message("phone"), true)}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={cn(CONTROL, "[unicode-bidi:plaintext]")}
          />
        </DemoField>
        <DemoField name="email" label={t("fields.email")} error={message("email")}>
          <input
            {...form.register("email")}
            {...controlProps("email", message("email"))}
            type="email"
            autoComplete="email"
            className={cn(CONTROL, "[unicode-bidi:plaintext]")}
          />
        </DemoField>
        <DemoField name="students" label={t("fields.students")} error={message("students")}>
          <select {...form.register("students")} {...controlProps("students", message("students"))} className={CONTROL}>
            <option value="">{t("fields.studentsPick")}</option>
            {DEMO_STUDENT_RANGES.map((range) => (
              <option key={range} value={range}>
                {t(`fields.studentsOptions.${range}`)}
              </option>
            ))}
          </select>
        </DemoField>
      </div>
      <DemoField name="message" label={t("fields.message")} error={message("message")}>
        <textarea {...form.register("message")} {...controlProps("message", message("message"))} rows={4} className={cn(CONTROL, "resize-y")} />
      </DemoField>

      {/* Honeypot: invisible to people and screen readers, filled by bots. */}
      <div aria-hidden className="pointer-events-none absolute size-px overflow-hidden opacity-0">
        <label htmlFor="demo-website">{t("fields.website")}</label>
        <input id="demo-website" {...form.register("website")} tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={pending} className={cn(BUTTON.primary, "disabled:opacity-70")}>
          {pending && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          {pending ? t("sending") : t("submit")}
        </button>
      </div>
      <p className="text-sm text-lp-muted">{t("consent")}</p>
      <p className="text-sm text-lp-muted">
        {t("privacy")}{" "}
        <Link href="/privacy" className={BUTTON.link}>
          {tLegal("privacy")}
        </Link>
      </p>
    </form>
  );
}
