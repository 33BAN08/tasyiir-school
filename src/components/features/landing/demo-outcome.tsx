"use client";

import { CircleCheck, MessageCircle, PhoneCall } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { ltr } from "@/lib/format";
import { whatsappUrl } from "@/lib/landing/whatsapp";

import { BUTTON } from "./landing-ui";

/** What the form shows once sent: done, or a database limit hit (never shown as an error). */
export type DemoOutcome = { kind: "sent"; phone: string } | { kind: "limited"; reason: "phone" | "busy" };

type Props = { outcome: DemoOutcome; onBack: () => void };

/**
 * Replaces the form after sending. A limit is answered kindly with the
 * WhatsApp button, so a real school always has a way to reach us.
 */
export function DemoOutcomePanel({ outcome, onBack }: Props) {
  const t = useTranslations("landing.demo");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const whatsapp = whatsappUrl(t("whatsappMessage"));

  useEffect(() => headingRef.current?.focus(), []);

  const sent = outcome.kind === "sent";
  const Icon = sent ? CircleCheck : PhoneCall;
  const title = sent
    ? t("success.title")
    : outcome.reason === "phone"
      ? t("limited.phoneTitle")
      : t("limited.busyTitle");

  return (
    <div role="status" data-outcome={sent ? "sent" : `limited-${outcome.reason}`} className="flex flex-col items-start gap-4 py-6">
      <Icon className="size-12 text-lp-brand" aria-hidden />
      <h3 ref={headingRef} tabIndex={-1} className="text-2xl font-extrabold outline-none">
        {title}
      </h3>
      {sent && <p className="text-lp-muted">{t("success.body", { phone: ltr(outcome.phone) })}</p>}
      {outcome.kind === "limited" && outcome.reason === "phone" && (
        <p className="text-lp-muted">
          {t("limited.phoneBody")} {whatsapp && t("limited.phoneWhatsapp")}
        </p>
      )}
      {outcome.kind === "limited" && outcome.reason === "busy" && (
        <p className="text-lp-muted">
          {whatsapp && t("limited.busyBody")} {t("limited.busyRetry")}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        {!sent && whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={BUTTON.whatsapp}>
            <MessageCircle className="size-5" aria-hidden />
            {t("whatsapp")}
          </a>
        )}
        <button type="button" className={BUTTON.outline} onClick={onBack}>
          {sent ? t("success.again") : t("limited.back")}
        </button>
      </div>
    </div>
  );
}
