import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { refreshSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createIntlMiddleware(routing);

/** Paths (without locale prefix) reachable while signed out: the home page and sign-in. */
const PUBLIC_PATHS = ["/", "/login", "/privacy", "/terms", "/offline"];

export async function proxy(request: NextRequest) {
  // 1. Refresh the Supabase session first: it updates the request cookies,
  //    which next-intl then forwards to the page.
  const session = await refreshSession(request);

  // 2. Locale routing: "/" → "/ar", "/login" → "/fr/login" (cookie / Accept-Language).
  const response = session.applyTo(handleI18nRouting(request));
  if (response.headers.has("location")) return response;

  // 3. Optimistic auth guard (no DB query). Pages re-check the profile via
  //    requireUser(), and every Server Action re-verifies the session.
  const { locale, path } = splitLocale(request.nextUrl.pathname);
  const isPublic = PUBLIC_PATHS.includes(path);

  if (!session.isSignedIn && !isPublic) {
    const url = new URL(`/${locale}/login`, request.url);
    if (path !== "/start") url.searchParams.set("next", path + request.nextUrl.search);
    return session.applyTo(NextResponse.redirect(url));
  }

  // Signed in, "Se connecter" on the home page opens the user's own area.
  if (session.isSignedIn && path === "/login") {
    return session.applyTo(NextResponse.redirect(new URL(`/${locale}/start`, request.url)));
  }

  return response;
}

function splitLocale(pathname: string) {
  const [, first = "", ...rest] = pathname.split("/");
  const locale = (routing.locales as readonly string[]).includes(first)
    ? first
    : routing.defaultLocale;
  return { locale, path: `/${rest.join("/")}` };
}

export const config = {
  matcher: [
    // Everything except Next internals, static files and images.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
