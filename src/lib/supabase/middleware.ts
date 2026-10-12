import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * Refreshes the Supabase auth session for this request.
 * Updated auth cookies are written onto `request` right away (so anything
 * built from the request afterwards sees them) and must be copied onto the
 * final response with `applyTo()`. Called from `src/proxy.ts`.
 */
export async function refreshSession(request: NextRequest) {
  let pendingCookies: CookieToSet[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pendingCookies = cookiesToSet;
          pendingHeaders = headers;
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims():
  // it validates the JWT and triggers the token refresh if needed.
  const { data } = await supabase.auth.getClaims();

  return {
    isSignedIn: Boolean(data?.claims?.sub),
    applyTo<T extends NextResponse>(response: T): T {
      pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
      return response;
    },
  };
}
