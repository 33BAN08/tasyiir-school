import "server-only";

import { PHOTO_BUCKET, PHOTO_URL_SECONDS } from "@/lib/students/photo-rules";
import { createClient } from "@/lib/supabase/server";

/**
 * Short-lived signed URLs (5 minutes) for the given photo paths, made with
 * the user's own session: Storage RLS gives one only for the current photo of
 * a student the user may see. Missing or refused paths are left out.
 */
export async function signPhotoUrls(paths: (string | null)[]): Promise<Map<string, string>> {
  const wanted = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (wanted.length === 0) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(wanted, PHOTO_URL_SECONDS);
  if (error || !data) return new Map();
  const urls = new Map<string, string>();
  for (const d of data) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
  return urls;
}
