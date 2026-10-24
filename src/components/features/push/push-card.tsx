"use client";

import { BellOff, BellRing, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { removePushSubscription, savePushSubscription } from "@/lib/push/actions";
import type { PushPreferences as Preferences } from "@/lib/push/preferences";

import { installState } from "../app/install-prompt";
import { PushPreferences } from "./push-preferences";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** on / off = this phone; denied = blocked in the browser; iosInstall = iPhone outside the installed app; unsupported = no web push here. */
type PushState = "loading" | "on" | "off" | "denied" | "iosInstall" | "unsupported";

/** The VAPID public key (URL-safe base64) as the bytes PushManager wants. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

async function currentState(): Promise<{ state: PushState; subscription: PushSubscription | null }> {
  const iosOutsideApp = installState() !== "installed" && /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!("PushManager" in window) || !("Notification" in window)) {
    return { state: iosOutsideApp ? "iosInstall" : "unsupported", subscription: null };
  }
  if (Notification.permission === "denied") return { state: "denied", subscription: null };
  const reg = await registration();
  if (!reg) return { state: "unsupported", subscription: null };
  const subscription = await reg.pushManager.getSubscription();
  return { state: subscription ? "on" : "off", subscription };
}

/**
 * Parent notifications page: receive notifications on this phone (web push).
 * Turning on asks the browser's permission, subscribes this phone and saves it;
 * turning off removes it. An existing subscription is saved again on every visit,
 * so the server always knows this phone (it is cleared e.g. by the demo reset).
 * Once on, the parent picks which kinds are pushed and can send a test (step 5).
 */
export function PushCard({ preferences }: { preferences: Preferences }) {
  const t = useTranslations("push");
  const [state, setState] = useState<PushState>("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!PUBLIC_KEY) return;
    let alive = true;
    void currentState().then(({ state: next, subscription }) => {
      if (!alive) return;
      setState(next);
      if (subscription) void savePushSubscription(subscription.toJSON(), navigator.userAgent);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!PUBLIC_KEY || state === "loading" || state === "unsupported") return null;

  function turnOn() {
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const reg = await registration();
        if (!reg) return setState("unsupported");
        const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) });
        const saved = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
        if (!saved.ok) {
          await subscription.unsubscribe();
          return void toast.error(t("error"));
        }
        setState("on");
        toast.success(t("enabled"));
      } catch {
        toast.error(t("error"));
      }
    });
  }

  function turnOff() {
    startTransition(async () => {
      try {
        const subscription = await (await registration())?.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("off");
      } catch {
        toast.error(t("error"));
      }
    });
  }

  const on = state === "on";
  return (
    <Card className="py-4" data-push-card={state}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {on ? <BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden /> : <BellOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-semibold">{t(`${state}.title`)}</p>
            <p className="text-sm text-muted-foreground">{t(`${state}.body`)}</p>
          </div>
        </div>
        {on && (
          <PushPreferences
            initial={preferences}
            endpoint={async () => (await (await registration())?.pushManager.getSubscription())?.endpoint ?? null}
            onGone={() => setState("off")}
          />
        )}
        {(state === "on" || state === "off") && (
          <div>
            <Button variant={on ? "outline" : "default"} className="min-h-11" onClick={on ? turnOff : turnOn} disabled={pending}>
              {pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {on ? t("turnOff") : t("turnOn")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
