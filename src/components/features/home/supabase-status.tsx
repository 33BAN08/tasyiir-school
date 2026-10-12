import { CircleCheck, CircleX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { Badge } from "@/components/ui/badge";

async function checkSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Server-side Supabase connection check, rendered at request time. */
export async function SupabaseStatus() {
  await connection();
  const ok = await checkSupabase();
  const t = await getTranslations("home");

  return ok ? (
    <Badge className="bg-success text-success-foreground">
      <CircleCheck aria-hidden />
      {t("supabaseOk")}
    </Badge>
  ) : (
    <Badge className="bg-danger text-danger-foreground">
      <CircleX aria-hidden />
      {t("supabaseError")}
    </Badge>
  );
}
