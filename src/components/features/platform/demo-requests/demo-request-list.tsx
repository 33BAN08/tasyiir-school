"use client";

import { Check, ExternalLink, Mail, MessageCircle, Phone, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { setDemoRequestHandled } from "@/lib/demo-requests/platform-actions";
import type { DemoRequestItem } from "@/lib/demo-requests/queries";
import { formatDateTime, ltr } from "@/lib/format";
import { formatMobile } from "@/lib/parents/phone";

import { CreateTrialButton } from "./create-trial-button";

/** True in the browser only: times are shown there (the server's Morocco time-zone data is outdated). */
function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function DemoRequestList({ items }: { items: DemoRequestItem[] }) {
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {items.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </ul>
  );
}

function Row({ item }: { item: DemoRequestItem }) {
  const t = useTranslations("platform.demoRequests");
  const tr = useTranslations("landing.demo.fields.studentsOptions");
  const tw = useTranslations("landing.mobileBar");
  const mounted = useMounted();
  const [pending, startTransition] = useTransition();
  const handled = Boolean(item.handledAt);
  const phone = formatMobile(item.phone);

  function toggle() {
    startTransition(async () => {
      const result = await setDemoRequestHandled(item.id, !handled);
      if (!result.ok) toast.error(t("error"));
    });
  }

  return (
    <li data-handled={handled ? "true" : "false"} data-kind={item.kind} className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold">
            <bdi>{item.schoolName}</bdi> · <bdi>{item.city}</bdi>
          </p>
          <p className="text-sm text-muted-foreground">
            <bdi>{item.fullName}</bdi> · {t("students", { range: tr(item.students) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.kind === "trial" && <Badge variant="outline">{t("trial")}</Badge>}
          <Badge variant={handled ? "secondary" : "default"}>{handled ? t("handled") : t("open")}</Badge>
        </div>
      </div>
      {item.message && <p className="text-sm whitespace-pre-line">{item.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={`tel:${item.phone}`} aria-label={t("call", { name: item.fullName })}>
            <Phone aria-hidden />
            <span dir="ltr">{phone}</span>
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a
            href={`https://wa.me/${item.phone.slice(1)}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("whatsapp", { name: item.fullName })}
          >
            <MessageCircle aria-hidden />
            {tw("whatsapp")}
          </a>
        </Button>
        {item.email && (
          <Button asChild variant="outline" size="sm">
            <a href={`mailto:${item.email}`}>
              <Mail aria-hidden />
              <span dir="ltr">{item.email}</span>
            </a>
          </Button>
        )}
        {item.kind === "trial" && !item.schoolId && item.email && (
          <CreateTrialButton requestId={item.id} schoolName={item.schoolName} />
        )}
        {item.schoolId && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/platform/schools/${item.schoolId}`}>
              <ExternalLink aria-hidden />
              {t("trialSchool")}
            </Link>
          </Button>
        )}
        <Button variant={handled ? "ghost" : "secondary"} size="sm" className="ms-auto" onClick={toggle} disabled={pending}>
          {handled ? <RotateCcw aria-hidden /> : <Check aria-hidden />}
          {handled ? t("markOpen") : t("markHandled")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">
        {t("received")} {mounted ? ltr(formatDateTime(item.createdAt)) : " "}
      </p>
    </li>
  );
}
