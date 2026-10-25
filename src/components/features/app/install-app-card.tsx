"use client";

import { Check, Download, Share, SquarePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import { dismissInstall, installState, promptInstall, subscribeInstall, type InstallState } from "./install-prompt";

const serverState = (): InstallState => "none";

/**
 * Parent home: "install Madar on your phone". Android / Chrome → the browser's own
 * install dialog; iPhone → the three Safari steps (Apple has no install button).
 * Nothing once installed, on a computer without the prompt, or for 30 days after "Plus tard".
 * Looks like the sand bar of the Madar app (2026-10-25); dark ink on sand in both themes.
 */
export function InstallAppCard() {
  const t = useTranslations("portal.install");
  const state = useSyncExternalStore(subscribeInstall, installState, serverState);
  if (state !== "prompt" && state !== "ios") return null;

  const steps = [
    { Icon: Share, text: t("ios.share") },
    { Icon: SquarePlus, text: t("ios.addToHome") },
    { Icon: Check, text: t("ios.add") },
  ];

  return (
    <section aria-label={t("title")} className="flex flex-col gap-3 rounded-2xl bg-sand p-4 text-on-sand shadow-sm" data-install-card={state}>
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static PNG, nothing to optimize */}
          <img src="/brand/tasyir-icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-semibold">{t("title")}</p>
            <p className="text-sm text-on-sand/80">{t("body")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-me-2 -mt-1 size-11 shrink-0 text-on-sand hover:bg-on-sand/10 hover:text-on-sand"
            onClick={dismissInstall}
            aria-label={t("later")}
          >
            <X aria-hidden />
          </Button>
        </div>
        {state === "prompt" ? (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11 bg-brand text-brand-foreground hover:bg-brand/90" onClick={() => void promptInstall()}>
              <Download aria-hidden />
              {t("install")}
            </Button>
            <Button variant="ghost" className="min-h-11 text-on-sand hover:bg-on-sand/10 hover:text-on-sand" onClick={dismissInstall}>
              {t("later")}
            </Button>
          </div>
        ) : (
          <ol className="flex flex-col gap-2 text-sm" aria-label={t("ios.title")}>
            {steps.map(({ Icon, text }, index) => (
              <li key={index} className="flex items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-foreground text-brand">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="font-semibold tabular-nums">{index + 1}.</span> {text}
                </span>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
