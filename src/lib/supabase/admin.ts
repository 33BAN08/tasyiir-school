import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client using the SECRET key. Bypasses RLS.
 * Server only (Server Actions, Route Handlers). Never import from client code.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
