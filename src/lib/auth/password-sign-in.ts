import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

/**
 * Password sign-in with Supabase's per-IP rate limit applied to the VISITOR.
 * Our sign-in runs on the server, so Supabase would otherwise count every
 * attempt from every user against the server's single IP. Supabase only
 * trusts the visitor's IP in the Sb-Forwarded-For header on requests made
 * with a secret key, and only once "IP address forwarding" is turned on in
 * the project's Auth rate-limit settings (until then the header is ignored).
 *
 * The secret key is used for this one Auth call only; the session it returns
 * is stored in the user's cookie client, which acts as the user (RLS) as before.
 */
export async function passwordSignIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  credentials: { email: string; password: string },
) {
  const visitorIp = await clientIp();
  const auth = createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: visitorIp ? { "Sb-Forwarded-For": visitorIp } : {} },
  });

  const { data, error } = await auth.auth.signInWithPassword(credentials);
  if (error || !data.session) return { user: null, error };

  const stored = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return { user: stored.data.user, error: stored.error };
}

/** The visitor's IP as set by the hosting proxy (Vercel), or null (local dev). */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  // IPv4 or IPv6 only: never pass arbitrary text on.
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}
