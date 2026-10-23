// What the "install the app" card can offer on this device, as a tiny store for
// useSyncExternalStore. Imported by ServiceWorkerRegister (in the root layout), so the
// browser's `beforeinstallprompt` is caught even before the card is on screen.
// Client only.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** installed = opened from the home screen; prompt = Android / Chrome can install; ios = show the Safari steps. */
export type InstallState = "installed" | "prompt" | "ios" | "dismissed" | "none";

const DISMISS_KEY = "tasyir:install-card:dismissed-until";
const DISMISS_DAYS = 30;

let deferred: InstallPromptEvent | null = null;
let justInstalled = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own card instead of the browser's mini bar
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    justInstalled = true;
    deferred = null;
    emit();
  });
}

function dismissedUntil(): number {
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY)) || 0;
  } catch {
    return 0;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone / iPad (iPadOS reports itself as a Mac with a touch screen). */
function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function installState(): InstallState {
  if (justInstalled || isStandalone()) return "installed";
  if (dismissedUntil() > Date.now()) return "dismissed";
  if (deferred) return "prompt";
  if (isIos()) return "ios";
  return "none";
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the browser's own install dialog (Android / Chrome). */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") justInstalled = true;
  emit();
}

/** "Plus tard": hidden on this phone for 30 days. */
export function dismissInstall(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86_400_000));
  } catch {
    // Storage refused (private mode): hidden until the page is reloaded.
    deferred = null;
  }
  emit();
}
